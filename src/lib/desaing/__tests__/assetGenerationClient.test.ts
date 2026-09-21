import { describe, expect, it, vi } from 'vitest';
import { createAssetGenerationClient, type AssetGenerationPorts, type SharedImageRequest, type SharedImageScope } from '../assetGenerationClient';
import { DesignServerClientError, type DesignServerClient } from '../serverClient';
import { createServerSnapshot, applyServerCommand, claimServerCall, recordServerResult, validateServerCall,
  type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import { IMAGE_PROFILES, SELECTABLE_IMAGE_PROFILES, SELECTABLE_IMAGE_QUALITIES } from '../../../../supabase/functions/_shared/desaing/catalog';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';
import { productionPng } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/productionFixture';

const business = '40000000-0000-4000-8000-000000000001', actor = '40000000-0000-4000-8000-000000000002';
const foreign = '40000000-0000-4000-8000-000000000003';
const request: SharedImageRequest = { business_id: business, userRequest: 'Usa el mundo de la referencia.',
  imageModel: 'gpt-image-2.5-sunburst', imageQuality: 'high', aspectRatio: '4:5' };
const scope: SharedImageScope = { businessId: business, actorId: actor, process: 'news', slotKey: 'cover:one',
  consumerContext: { articleId: 'article-1', headline: 'Título aprobado literal.' },
  library: { brand: 'xending', collection: 'news', description: 'Referencia del artículo.' } };
const imageBytes = productionPng(120, 16, 16);
function fixture(executor: 'image_api' | 'responses_image' = 'image_api') {
  const policy: ServerPolicy = { business_id: business, policy_id: 'assets', enabled: true, limit_micro_usd: 100,
    max_image_outputs: 100, reservation_per_output_micro_usd: 1, enabled_image_profiles: [...SELECTABLE_IMAGE_PROFILES], responses_image_enabled: true };
  let state = createServerSnapshot(business, policy), ids = 20, activeActor = actor, locked = false, enabled = true;
  let afterClaim: 'complete' | 'uncertain' | 'lost-response' = 'complete';
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }),
    removeItem: vi.fn((key: string) => { values.delete(key); }), key: (index: number) => [...values.keys()][index] ?? null,
    get length() { return values.size; } };
  const complete = (operation: DesignOperation) => {
    const call = state.jobs.jobs.find(item => item.operation_key === operation.operation_key)!.calls[0];
    const asset: RegisteredAssetVersion = { identity: { business_id: business, asset_id: operation.operation_key, version_id: 'result-version' },
      brand_id: business, project_id: operation.context.project_id,
      storage: { storage_key: `${business}/${operation.operation_key}.png`, mime_type: 'image/png', ...operation.image!.size, size_bytes: imageBytes.length },
      provenance: { kind: 'image_operation', operation_key: operation.operation_key, output_index: 0, action: 'generate_image',
        quality: operation.image!.quality, model_id: IMAGE_PROFILES[operation.image!.profile].model_id,
        effective_prompt: operation.context.instruction, revised_prompt: null,
        immutable_elements: operation.context.immutable_elements, references: operation.context.references } };
    const response = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: Buffer.from(imageBytes).toString('base64') }] }, expected_outputs: 1, duration_ms: 1 });
    state = recordServerResult(state, operation.operation_key, call.call_key, `attempt:${operation.operation_key}`, response, [asset], 11);
    state = validateServerCall(state, operation.operation_key, call.call_key, true, 12);
  };
  const client = {
    session: vi.fn(async () => ({ actorId: activeActor })),
    read: vi.fn(async () => ({ revision: 1, state: structuredClone(state), enabled, generation: {
      profile: 'flare_candidate' as const, profiles: [...policy.enabled_image_profiles], qualities: [...SELECTABLE_IMAGE_QUALITIES],
      executor, max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: null, supports_asset_generation: enabled,
    } })),
    command: vi.fn<DesignServerClient['command']>(async (_business, command) => {
      if (command.kind !== 'enqueue') throw Error('unexpected_command');
      const operation = command.operation;
      state = applyServerCommand(state, policy, actor, command, 2).state;
      const job = state.jobs.jobs.find(item => item.operation_key === operation.operation_key)!;
      state = claimServerCall(state, policy, operation.operation_key, job.calls[0].call_key, `attempt:${operation.operation_key}`, 10, 100);
      if (afterClaim !== 'uncertain') complete(operation);
      else state = recordServerResult(state, operation.operation_key, job.calls[0].call_key, `attempt:${operation.operation_key}`,
        normalizeImageTransportFailure({ duration_ms: 1, kind: 'timeout', request_sent: true }), [], 11);
      if (afterClaim !== 'complete') throw new DesignServerClientError('server_response_unknown');
      return { revision: 1 };
    }),
    upload: vi.fn<DesignServerClient['upload']>(async (input, blob) => {
      const version: RegisteredAssetVersion = { identity: { business_id: business, asset_id: input.uploadId, version_id: 'uploaded-version' },
        brand_id: input.brandId, project_id: input.projectId, provenance: { kind: 'imported', origin: 'upload' },
        storage: { storage_key: `${business}/${input.uploadId}.png`, mime_type: 'image/png', width: 16, height: 16, size_bytes: blob.size } };
      state = applyServerCommand(state, policy, actor, { kind: 'register_import', version }, 1).state;
      return version;
    }),
    asset: vi.fn(async () => new Blob([imageBytes], { type: 'image/png' })), exploration: vi.fn(),
  } satisfies DesignServerClient;
  const prepare = vi.fn<NonNullable<AssetGenerationPorts['prepare']>>(async () => ({
    promptFinal: 'Texto literal de marca: México, 25 USD.', negativeInstructions: 'No agregar cifras ni marcas.' }));
  const normalizeReference = vi.fn(async () => new Blob([imageBytes], { type: 'image/png' }));
  const ports: AssetGenerationPorts = { client, prepare, normalizeReference, storage,
    newId: () => `40000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    async exclusive(_key, action) { if (locked) throw Error('busy'); locked = true;
      try { return await action(); } finally { locked = false; } },
  };
  const open = () => createAssetGenerationClient(ports);
  return { open, controller: open(), prepare, client, storage, values, normalizeReference, ports,
    mode(value: typeof afterClaim) { afterClaim = value; }, pause() { enabled = false; }, actor(value: string) { activeActor = value; }, state: () => state };
}

describe('commercial image client shares durable jobs', () => {
  it('recovers an identical request after reopening without preparation, upload or enqueue', async () => {
    const f = fixture(), initial = await f.controller.generate({ ...request, referenceImageBase64: 'source' }, scope);
    f.pause();
    const reopened = await f.open().generate({ ...request, referenceImageBase64: 'source' }, scope);
    expect(reopened).toEqual({ ...initial, recovered: true });
    expect(await f.open().pending(business, 'news')).toEqual([scope]);
    expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.client.upload).toHaveBeenCalledTimes(1); expect(f.client.command).toHaveBeenCalledTimes(1);
    expect(initial.canvas).toEqual({ width: 1080, height: 1350 }); expect(initial.size).toEqual({ width: 1088, height: 1360 });
    const before = f.client.asset.mock.calls.length;
    await f.open().acknowledge(reopened);
    expect(f.client.asset).toHaveBeenCalledTimes(before); expect(await f.open().recover(scope)).toBeNull();
  });
  it('blocks a changed request but recovers the original consumer and library snapshot', async () => {
    const f = fixture(), initial = await f.controller.generate(request, scope);
    const changedScope = { ...scope, consumerContext: { articleId: 'article-2' }, library: { ...scope.library!, collection: 'other' } };
    await expect(f.open().generate({ ...request, userRequest: 'Ahora quiero otro mundo.' }, scope)).rejects.toThrow('otras instrucciones');
    await expect(f.open().generate(request, changedScope)).rejects.toThrow('otras instrucciones');
    const recovered = await f.open().recover(changedScope);
    expect(recovered).toEqual({ ...initial, recovered: true }); expect(recovered?.scope).toEqual(scope);
    expect(f.prepare).toHaveBeenCalledTimes(1); expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('acknowledges one completed slot without discarding or regenerating another', async () => {
    const f = fixture(), firstScope = { ...scope, process: 'carousel' as const, slotKey: 'carousel:slide-1' },
      secondScope = { ...firstScope, slotKey: 'carousel:slide-2' };
    const first = await f.controller.generate(request, firstScope);
    const second = await f.controller.generate({ ...request, userRequest: 'Segunda escena del mismo carrusel.' }, secondScope);
    await f.controller.acknowledge(first);
    expect(await f.open().pending(business, 'carousel')).toEqual([secondScope]);
    expect(await f.open().recover(firstScope)).toBeNull();
    expect(await f.open().recover(secondScope)).toEqual({ ...second, recovered: true });
    expect(f.client.command).toHaveBeenCalledTimes(2);
    await f.open().acknowledge(second);
    const next = await f.open().generate(request, firstScope);
    expect(next.operation_key).not.toBe(first.operation_key); expect(f.client.command).toHaveBeenCalledTimes(3);
  });
  it('recovers a committed result after losing enqueue acknowledgement without another paid request', async () => {
    const f = fixture(); f.mode('lost-response');
    const image = await f.controller.generate(request, scope);
    expect(image.recovered).toBe(true);
    await f.open().recover(scope); await f.open().generate(request, scope);
    expect(f.client.command).toHaveBeenCalledTimes(1); expect(f.prepare).toHaveBeenCalledTimes(1);
  });
  it('keeps an uncertain job and never re-enqueues it on generate or recovery', async () => {
    const f = fixture(); f.mode('uncertain');
    await expect(f.controller.generate(request, scope)).rejects.toThrow('pendiente');
    await expect(f.open().recover(scope)).rejects.toThrow('pendiente');
    await expect(f.open().generate(request, scope)).rejects.toThrow('pendiente');
    expect(await f.open().pending(business)).toEqual([scope]);
    expect(f.state().jobs.jobs[0].calls[0].state).toBe('uncertain');
    expect(f.client.command).toHaveBeenCalledTimes(1); expect(f.prepare).toHaveBeenCalledTimes(1);
  });
  it('does not render if browser persistence fails and serializes concurrent clicks', async () => {
    const f = fixture(); f.storage.setItem.mockImplementation(() => { throw Error('browser-storage-full'); });
    await expect(f.controller.generate(request, scope)).rejects.toThrow('browser-storage-full');
    expect(f.client.command).not.toHaveBeenCalled();
    const g = fixture();
    const results = await Promise.allSettled([g.controller.generate(request, scope), g.open().generate(request, scope)]);
    const completed = results.filter(result => result.status === 'fulfilled').map(result => result.value.operation_key);
    expect(completed.length).toBeGreaterThan(0); expect(new Set(completed).size).toBe(1);
    expect(g.client.command).toHaveBeenCalledTimes(1);
  });
  it('uses actual normalized reference bytes and an exact registered asset/version', async () => {
    const f = fixture(), input = { ...request, referenceImageBase64: 'original-source', promptFinal: 'Texto aprobado literal.', negativeInstructions: 'Sin texto adicional.' };
    const image = await f.controller.generate(input, scope);
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.normalizeReference.mock.calls).toEqual([['original-source', 1024]]);
    const [upload, bytes] = f.client.upload.mock.calls[0];
    expect(upload).toMatchObject({ businessId: business, brandId: business, projectId: `asset-generation:news:${business}` });
    expect(new Uint8Array(await bytes.arrayBuffer())).toEqual(imageBytes);
    const operation = f.state().jobs.jobs[0].plan.operation;
    expect(operation.context.references).toEqual([{ business_id: business, asset_id: upload.uploadId, version_id: 'uploaded-version',
      reference_id: 'reference-image', mime_type: 'image/png', roles: ['object_reference', 'image_style_reference'] }]);
    expect(operation.context.instruction).toBe('Texto aprobado literal.\n\nNegative instructions:\nSin texto adicional.');
    expect(f.state().jobs.jobs[0].calls[0].planned.route).toBe('images_edits');
    expect(image.promptUsed).toMatchObject({ promptFinal: input.promptFinal, negativeInstructions: input.negativeInstructions });
  });
  it.each(['image_api', 'responses_image'] as const)('preserves all model and quality choices on %s', async executor => {
    for (const profile of SELECTABLE_IMAGE_PROFILES) for (const quality of SELECTABLE_IMAGE_QUALITIES) {
      const f = fixture(executor), model = IMAGE_PROFILES[profile].model_id as NonNullable<SharedImageRequest['imageModel']>;
      const result = await f.controller.generate({ ...request, imageModel: model, imageQuality: quality }, scope);
      expect(result).toMatchObject({ image_model: model, image_quality: quality });
      expect(f.state().jobs.jobs[0].plan.operation.image).toMatchObject({ executor, profile, quality, output_count: 1 });
      expect((await f.open().recover(scope))?.operation_key).toBe(result.operation_key);
      expect(f.client.command).toHaveBeenCalledTimes(1);
    }
  });
  it('does not prepare for old capabilities, unsupported selections, invalid count or invalid canvas', async () => {
    const f = fixture(); f.pause();
    await expect(f.controller.generate(request, scope)).rejects.toThrow('motor compartido');
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
    const g = fixture();
    await expect(g.controller.generate({ ...request, imageQuality: 'auto' }, scope)).rejects.toThrow();
    await expect(g.controller.generate({ ...request, imageCount: 3 }, scope)).rejects.toThrow();
    expect(g.prepare).not.toHaveBeenCalled();
    await expect(g.controller.generate({ ...request, promptFinal: 'Prompt listo.', imageSize: '9999x9999', referenceImageBase64: 'source' }, scope)).rejects.toThrow();
    expect(g.client.upload).not.toHaveBeenCalled(); expect(g.client.command).not.toHaveBeenCalled();
  });
  it('clears only definitive admission refusals and keeps the next deliberate attempt separate', async () => {
    const f = fixture(); f.client.command.mockRejectedValueOnce(new DesignServerClientError('unsupported_server_generation', 400));
    await expect(f.controller.generate(request, scope)).rejects.toThrow();
    expect(await f.controller.pending(business)).toEqual([]);
    await f.controller.generate(request, scope);
    const first = f.client.command.mock.calls[0][1], second = f.client.command.mock.calls[1][1];
    expect(first.kind === 'enqueue' && second.kind === 'enqueue' && first.operation.operation_key !== second.operation.operation_key).toBe(true);
  });
  it('isolates actors and businesses, and detects an account change during prompt preparation', async () => {
    const f = fixture();
    await expect(f.controller.generate({ ...request, business_id: foreign }, scope)).rejects.toThrow('identidad');
    await expect(f.controller.generate(request, { ...scope, actorId: foreign })).rejects.toMatchObject({ code: 'server_session_changed' });
    const first = await f.controller.generate(request, scope);
    f.actor(foreign);
    expect(await f.open().pending(business)).toEqual([]); expect(await f.open().recover(scope)).toBeNull();
    await expect(f.open().acknowledge(first)).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(f.values.size).toBe(1);
    const g = fixture();
    g.prepare.mockImplementationOnce(async () => { g.actor(foreign); return { promptFinal: 'Prompt para el actor anterior.' }; });
    await expect(g.controller.generate(request, scope)).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(g.client.command).not.toHaveBeenCalled(); expect(g.values.size).toBe(0);
  });
});
