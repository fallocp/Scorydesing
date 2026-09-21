import { describe, expect, it, vi } from 'vitest';
import { createStudioGenerationClient, type StudioGenerationPorts } from '../studioGenerationClient';
import { createDesignServerClient, DesignServerClientError, type DesignServerClient } from '../serverClient';
import { createServerSnapshot, applyServerCommand, claimServerCall, recordServerResult, validateServerCall,
  type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import { IMAGE_PROFILES } from '../../../../supabase/functions/_shared/desaing/catalog';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';
import type { GenerateMockupsRequest } from '../../../types/design-studio';

const business = '40000000-0000-4000-8000-000000000001', actor = '40000000-0000-4000-8000-000000000002';
const request: GenerateMockupsRequest = { business_id: business, mode: 'visual', platform: 'instagram-post', count: 1,
  brand_palette: { primary_color: '#000', secondary_color: '#fff', accent_color: '#0ff', fonts: {}, logo_url: 'logo.png' },
  selections: {} as GenerateMockupsRequest['selections'], image_model: 'gpt-image-2.5-sunburst', image_quality: 'high' };
function fixture(executor: 'image_api' | 'responses_image' = 'image_api') {
  const policy: ServerPolicy = { business_id: business, policy_id: 'studio', enabled: true, limit_micro_usd: 100,
    max_image_outputs: 100, reservation_per_output_micro_usd: 1, enabled_image_profiles: ['baseline', 'flare_candidate', 'sunburst_rescue'], responses_image_enabled: true };
  let state = createServerSnapshot(business, policy), ids = 20, activeActor = actor, locked = false, enabled = true;
  let afterClaim: 'complete' | 'uncertain' | 'lost-response' = 'complete';
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null,
    setItem: vi.fn((key: string, value: string) => { values.set(key, value); }), removeItem: (key: string) => { values.delete(key); } };
  const complete = (operation: DesignOperation) => {
    const job = state.jobs.jobs.find(item => item.operation_key === operation.operation_key)!;
    const call = job.calls[0];
    const asset: RegisteredAssetVersion = { identity: { business_id: business, asset_id: operation.operation_key, version_id: 'result-version' },
      brand_id: business, project_id: operation.context.project_id,
      storage: { storage_key: `${business}/${operation.operation_key}.png`, mime_type: 'image/png', width: 1024, height: 1024, size_bytes: 3 },
      provenance: { kind: 'image_operation', operation_key: operation.operation_key, output_index: 0, action: 'generate_image',
        quality: operation.image!.quality, model_id: IMAGE_PROFILES[operation.image!.profile].model_id,
        effective_prompt: operation.context.instruction, revised_prompt: null,
        immutable_elements: operation.context.immutable_elements, references: operation.context.references } };
    const response = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'AQID' }] }, expected_outputs: 1, duration_ms: 1 });
    state = recordServerResult(state, operation.operation_key, call.call_key, `attempt:${operation.operation_key}`, response, [asset], 11);
    state = validateServerCall(state, operation.operation_key, call.call_key, true, 12);
  };
  const client = {
    session: vi.fn(async () => ({ actorId: activeActor })),
    read: vi.fn(async () => ({ revision: 1, state: structuredClone(state), enabled, generation: {
      profile: 'flare_candidate' as const, profiles: [...policy.enabled_image_profiles], qualities: ['low', 'medium', 'high'] as const as ('low'|'medium'|'high')[],
      executor, max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: null, supports_studio_generation: enabled,
    } })),
    command: vi.fn<DesignServerClient['command']>(async (_business, command) => {
      if (command.kind !== 'enqueue') throw Error('unexpected_command');
      const operation = command.operation;
      state = applyServerCommand(state, policy, actor, command, 2).state;
      const job = state.jobs.jobs.find(item => item.operation_key === operation.operation_key)!;
      state = claimServerCall(state, policy, operation.operation_key, job.calls[0].call_key, `attempt:${operation.operation_key}`, 10, 100);
      if (afterClaim !== 'uncertain') complete(operation);
      if (afterClaim !== 'complete') throw new DesignServerClientError('server_response_unknown');
      return { revision: 1 };
    }),
    upload: vi.fn<DesignServerClient['upload']>(async input => {
      const version: RegisteredAssetVersion = { identity: { business_id: business, asset_id: input.uploadId, version_id: 'uploaded-version' },
        brand_id: input.brandId, project_id: input.projectId, provenance: { kind: 'imported', origin: 'upload' },
        storage: { storage_key: `${business}/${input.uploadId}.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: 3 } };
      state = applyServerCommand(state, policy, actor, { kind: 'register_import', version }, 1).state;
      return version;
    }),
    asset: vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' })), exploration: vi.fn(),
  } satisfies DesignServerClient;
  const prepare = vi.fn<StudioGenerationPorts['prepare']>(async input => ({ prompt: `Texto literal de marca. ${input.iteration_feedback ?? ''}`,
    platform: input.platform, image_model: input.image_model!, image_quality: input.image_quality!, size: { width: 1024, height: 1024 } }));
  const normalizeReference = vi.fn(async () => new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }));
  const ports: StudioGenerationPorts = { businessId: business, actorId: actor, client, prepare, normalizeReference, storage,
    newId: () => `40000000-0000-4000-8000-${String(++ids).padStart(12, '0')}`,
    async exclusive(_key, action) { if (locked) throw Error('busy'); locked = true;
      try { return await action(); } finally { locked = false; } },
  };
  const open = () => createStudioGenerationClient(ports);
  return { open, controller: open(), prepare, client, storage, values, normalizeReference, complete,
    mode(value: typeof afterClaim) { afterClaim = value; }, pause() { enabled = false; }, actor(value: string) { activeActor = value; }, state: () => state };
}

describe('Studio uses shared jobs with durable recovery', () => {
  it.each(['image_api', 'responses_image'] as const)('keeps selected Sunburst high and effective route %s through recovery and acknowledgement', async executor => {
    const f = fixture(executor), first = await f.controller.generate(request);
    expect(first).toMatchObject({ business_id: business, actor_id: actor, platform: request.platform,
      mockups: [{ image_model: request.image_model, image_quality: 'high', image_base64: 'AQID' }] });
    expect(f.state().jobs.jobs[0].plan.operation.image).toMatchObject({ profile: 'sunburst_rescue', quality: 'high', executor });
    expect(await f.open().recover()).toEqual(first);
    expect(f.client.command).toHaveBeenCalledTimes(1); expect(f.prepare).toHaveBeenCalledTimes(1);
    const downloads = f.client.asset.mock.calls.length;
    await f.open().acknowledge(first.mockups[0].operation_key!);
    expect(f.client.asset).toHaveBeenCalledTimes(downloads);
    expect(await f.open().recover()).toBeNull();
  });
  it('uses both previous result pixels and original reference in one feedback operation', async () => {
    const f = fixture();
    await f.controller.generate({ ...request, reference_image_base64: 'original', previous_image_base64: 'result', iteration_feedback: 'Mueve el avión a la derecha' });
    expect(f.normalizeReference.mock.calls).toEqual([['result', 1024], ['original', 1024]]);
    const operation = f.state().jobs.jobs[0].plan.operation;
    expect(operation.context.references.map(ref => ref.reference_id)).toEqual(['previous-result', 'original-reference']);
    expect(operation.context.instruction).toContain('Mueve el avión a la derecha');
    expect(f.state().jobs.jobs[0].calls[0].planned.route).toBe('images_edits');
  });
  it('recovers an acknowledged artifact after a lost enqueue response without resubmitting', async () => {
    const f = fixture(); f.mode('lost-response');
    expect((await f.controller.generate(request)).mockups).toHaveLength(1);
    expect(await f.open().hasPending()).toBe(true);
    await expect(f.open().generate(request)).rejects.toThrow('pendiente');
    await f.open().recover();
    expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('keeps uncertain attempts across reopen; recovery never restarts the provider', async () => {
    const f = fixture(); f.mode('uncertain');
    await expect(f.controller.generate(request)).rejects.toThrow('pendiente');
    await expect(f.open().recover()).rejects.toThrow('pendiente');
    await expect(f.open().acknowledge(f.state().jobs.jobs[0].operation_key)).rejects.toThrow('pendiente');
    await expect(f.open().generate(request)).rejects.toThrow('pendiente');
    expect(f.client.command).toHaveBeenCalledTimes(1);
    f.complete(f.state().jobs.jobs[0].plan.operation);
    expect((await f.open().recover())?.mockups).toHaveLength(1);
    expect(f.client.command).toHaveBeenCalledTimes(1);
  });
  it('serializes double clicks and refuses to render before a durable pending record exists', async () => {
    const f = fixture();
    const results = await Promise.allSettled([f.controller.generate(request), f.open().generate(request)]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(f.client.command).toHaveBeenCalledTimes(1);
    const broken = fixture(); broken.storage.setItem.mockImplementation(() => { throw Error('quota'); });
    await expect(broken.controller.generate(request)).rejects.toThrow('quota');
    expect(broken.client.command).not.toHaveBeenCalled();
  });
  it('rejects old servers and unsupported selections before preparing or rendering', async () => {
    const f = fixture(); f.pause();
    await expect(f.controller.generate(request)).rejects.toThrow('no está disponible');
    expect(f.prepare).not.toHaveBeenCalled(); expect(f.client.command).not.toHaveBeenCalled();
    const g = fixture();
    await expect(g.controller.generate({ ...request, image_quality: 'auto' as never })).rejects.toThrow();
    expect(g.prepare).not.toHaveBeenCalled();
  });
  it('clears only explicit pre-admission refusals and preserves a deliberate new retry', async () => {
    const f = fixture(); f.client.command.mockRejectedValueOnce(new DesignServerClientError('unsupported_server_generation', 400));
    await expect(f.controller.generate(request)).rejects.toThrow();
    expect(await f.open().hasPending()).toBe(false);
    await f.open().generate(request);
    expect(f.client.command).toHaveBeenCalledTimes(2);
  });
  it('does not cross actor or business boundaries, including an account change during preparation', async () => {
    const f = fixture();
    await expect(f.controller.generate({ ...request, business_id: actor })).rejects.toThrow('negocio');
    f.prepare.mockImplementationOnce(async input => { f.actor(business); return { prompt: 'texto', platform: input.platform,
      image_model: input.image_model!, image_quality: input.image_quality!, size: { width: 1024, height: 1024 } }; });
    await expect(f.controller.generate(request)).rejects.toThrow();
    expect(f.client.command).not.toHaveBeenCalled();
  });
});

describe('Studio prompt preparation transport', () => {
  it('addresses only desaing-server and removes reference bytes from metadata preparation', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response(JSON.stringify({ prepared: { prompt: 'Texto de marca', platform: request.platform,
      image_model: request.image_model, image_quality: request.image_quality, size: { width: 1024, height: 1024 } } }), { status: 200 }));
    const client = createDesignServerClient({ endpoint: 'https://project.supabase.co/functions/v1/desaing-server',
      getSession: async () => ({ actorId: actor, accessToken: 'test' }), fetch });
    await client.prepareStudio!({ ...request, mode: 'reference', reference_image_base64: 'private-original', previous_image_base64: 'private-result' });
    expect(String(fetch.mock.calls[0][0])).toContain('/desaing-server/studio/prepare');
    const body = JSON.parse(String(fetch.mock.calls[0][1]?.body));
    expect(body.has_reference_image).toBe(true);
    expect(body.reference_image_base64).toBeUndefined(); expect(body.previous_image_base64).toBeUndefined();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
