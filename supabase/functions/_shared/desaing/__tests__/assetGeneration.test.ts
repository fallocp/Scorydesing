import { describe, expect, it, vi } from 'vitest';
import { createAssetGenerationOperation, readAssetGeneration, resolveAssetGenerationSize, ASSET_MAX_PROMPT_CHARACTERS } from '../assetGeneration.ts';
import { prepareLiveImageRequest } from '../liveImageProvider.ts';
import { createPipelineImageTransport, generatePipelineImage, type PipelineImageBridgePorts } from '../pipelineImageBridge.ts';
import { createServerGeneration, type ServerGenerationConfig } from '../serverGeneration.ts';
import { isServerGenerationCapabilities } from '../serverGenerationContract.ts';
import { parseServerRequest } from '../serverRequest.ts';
import type { ServerRepository, ServerRead } from '../serverRepository.ts';
import type { ServerPolicy, ServerSnapshot } from '../serverState.ts';
import type { LiveWorkerProvider } from '../serverWorker.ts';
import type { DesignOperation, DesignReference } from '../contracts.ts';
import type { RegisteredAssetVersion } from '../assets.ts';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../imageResponse.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
import { IMAGE_PROFILES, SELECTABLE_IMAGE_PROFILES, SELECTABLE_IMAGE_QUALITIES } from '../catalog.ts';
import { productionPng } from './fixtures/productionFixture.ts';

const business = '80000000-0000-4000-8000-000000000001', actor = '80000000-0000-4000-8000-000000000002';
const policyId = 'asset-unification';
const config: ServerGenerationConfig = { enabled: true, executor: 'image_api',
  expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: policyId, limit_micro_usd: PILOT_LIMITS.budgetMicroUsd,
  max_image_outputs: PILOT_LIMITS.maxOutputs, reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd,
  enabled_image_profiles: [...SELECTABLE_IMAGE_PROFILES], responses_image_enabled: true };
function operation(input: Partial<Parameters<typeof createAssetGenerationOperation>[0]> = {}) {
  return createAssetGenerationOperation({ operationKey: 'asset:first', actorId: actor, businessId: business,
    process: 'carousel', prompt: 'Diseña con el texto elegido y la fotografía de referencia.', profile: 'flare_candidate', quality: 'medium',
    executor: 'image_api', references: [], canvas: { width: 1536, height: 1024 }, ...input });
}
const outputCache = new Map<string, Uint8Array<ArrayBuffer>>();
function output(size: { width: number; height: number }) {
  const key = `${size.width}x${size.height}`;
  if (!outputCache.has(key)) outputCache.set(key, productionPng(80, size.width, size.height));
  return outputCache.get(key)!;
}
function fixture(executor: ServerGenerationConfig['executor'] = 'image_api') {
  let state: ServerSnapshot | null = null, revision = 0, time = 1000, dispatches = 0;
  const actualPolicy = structuredClone(policy), objects = new Map<string, Uint8Array>();
  const repository: ServerRepository = {
    read: vi.fn(async (): Promise<ServerRead> => ({ role: 'owner', policy: structuredClone(actualPolicy), state: { snapshot: structuredClone(state), revision } })),
    commit: vi.fn(async input => {
      if (input.expectedRevision !== revision) return { committed: false, revision };
      state = structuredClone(input.snapshot); revision++;
      return { committed: true, revision };
    }),
  };
  const storage = { get: vi.fn(async (key: string) => { const bytes = objects.get(key); if (!bytes) throw Error('missing'); return bytes.slice(); }),
    putImmutable: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes.slice()); }), signedUrl: vi.fn(async () => 'https://project.supabase.co/private') };
  const resolved: Uint8Array[] = [];
  const generate = vi.fn<LiveWorkerProvider['generate']>(async input => {
    await input.beforeDispatch?.(); dispatches++;
    for (const reference of input.operation.context.references) {
      const image = await input.resolveImage({ business_id: reference.business_id, asset_id: reference.asset_id, version_id: reference.version_id });
      resolved.push(new Uint8Array(await image.file.arrayBuffer()));
    }
    return { result: normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 12, headers: { 'x-request-id': 'asset-fake' },
      body: { data: [{ b64_json: Buffer.from(output(input.operation.image!.size)).toString('base64') }], usage: { input_tokens: 10, output_tokens: 20 } } }),
      effective_prompt: input.operation.context.instruction, input_manifest: [] };
  });
  const createProvider = vi.fn((): LiveWorkerProvider => ({ mode: 'live', generate }));
  const generation = createServerGeneration({ ...config, executor }, { repository, storage, createProvider, now: () => time });
  return { generation, repository, storage, generate, createProvider, resolved, policy: actualPolicy,
    get state() { return state; }, get dispatches() { return dispatches; }, expire() { time = config.expiresAt; } };
}

describe('shared asset generation preserves the product request', () => {
  it('keeps the exact requested canvas separately from a valid provider raster with the same ratio', () => {
    expect(resolveAssetGenerationSize({ width: 1080, height: 1350 })).toEqual({ width: 1088, height: 1360 });
    expect(resolveAssetGenerationSize({ width: 1280, height: 720 })).toEqual({ width: 1280, height: 720 });
    expect(() => resolveAssetGenerationSize({ width: 4096, height: 4096 })).toThrow();
    const op = operation({ canvas: { width: 1080, height: 1350 }, prompt: 'Texto literal: México, 25 USD.', negativeInstructions: 'No agregar cifras.' });
    expect(readAssetGeneration(op.context)).toEqual({ process: 'carousel', canvas: { width: 1080, height: 1350 },
      generationSize: { width: 1088, height: 1360 }, background: 'opaque' });
    expect(op.context.instruction).toBe('Texto literal: México, 25 USD.\n\nNegative instructions:\nNo agregar cifras.');
    expect(parseServerRequest({ business_id: business, command: { kind: 'enqueue', operation: op } }).command).toEqual({ kind: 'enqueue', operation: op });
  });
  it('admits long carousel prompts only through the scoped asset contract', async () => {
    const f = fixture(), op = operation({ prompt: 'a'.repeat(18000) });
    expect(parseServerRequest({ business_id: business, command: { kind: 'enqueue', operation: op } })).toBeDefined();
    const ordinary = structuredClone(op); ordinary.context.session_id = 'ordinary'; ordinary.context.project_id = 'ordinary'; ordinary.context.immutable_elements = [];
    expect(() => parseServerRequest({ business_id: business, command: { kind: 'enqueue', operation: ordinary } })).toThrow('invalid_server_request');
    expect(() => operation({ prompt: 'a'.repeat(ASSET_MAX_PROMPT_CHARACTERS + 1) })).toThrow('invalid_asset_generation');
    expect(() => operation({ prompt: '\na'.repeat(11000), references: [{ reference_id: 'source', business_id: business,
      asset_id: 'source', version_id: 'v1', mime_type: 'image/png', roles: ['object_reference'] }] })).toThrow('invalid_asset_generation');
    for (const mutation of [
      { ...op, action: 'generate_medium' as const },
      { ...op, context: { ...op.context, workspace: 'production' as const } },
      { ...op, context: { ...op.context, session_id: 'asset-generation:unsupported' } },
      { ...op, image: { ...op.image!, size: { width: 1024, height: 1024 } } },
      { ...op, image: { ...op.image!, background: 'transparent' as const } },
    ]) await expect(f.generation.enqueue(business, actor, mutation)).rejects.toMatchObject({ code: 'unsupported_server_generation' });
    expect(f.createProvider).not.toHaveBeenCalled(); expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it('announces the native contract while retaining support for older capability payloads', async () => {
    const f = fixture(), caps = (await f.generation.read(business, actor)).generation!;
    expect(caps.supports_asset_generation).toBe(true); expect(isServerGenerationCapabilities(caps)).toBe(true);
    const { supports_asset_generation: _support, ...old } = caps;
    expect(isServerGenerationCapabilities(old)).toBe(true);
    expect(isServerGenerationCapabilities({ ...old, supports_asset_generation: 'true' })).toBe(false);
  });
  it.each(['carousel', 'news', 'fx', 'stock', 'pipeline'] as const)('dispatches %s through one durable worker job and recovers without a new image', async process => {
    const f = fixture(), op = operation({ process, canvas: { width: 1080, height: 1350 } });
    const result = await f.generation.enqueue(business, actor, op);
    expect(result.execution).toMatchObject({ status: 'completed' });
    const saved = f.state!.assets.versions[0];
    expect(saved.provenance).toMatchObject({ kind: 'image_operation', operation_key: op.operation_key, model_id: 'gpt-image-2.5-flare', quality: 'medium' });
    expect(saved.storage).toMatchObject({ width: 1088, height: 1360 });
    expect((await f.generation.enqueue(business, actor, op)).reused).toBe(true);
    await f.generation.read(business, actor);
    expect(f.dispatches).toBe(1); expect(f.state!.jobs.jobs).toHaveLength(1); expect(f.policy).toEqual(policy);
  });
  it('uses real reference bytes and selected model/quality/background in both provider adapters', async () => {
    const bytes = productionPng(20, 32, 24);
    for (const executor of ['image_api', 'responses_image'] as const) for (const profile of SELECTABLE_IMAGE_PROFILES) {
      const f = fixture(executor);
      const imported = await f.generation.import(actor, { businessId: business, brandId: business,
        projectId: `asset-generation:stock:${business}`, uploadId: '80000000-0000-4000-8000-000000000003' }, bytes);
      const reference: DesignReference = { ...(imported.version as RegisteredAssetVersion).identity, reference_id: 'source', mime_type: 'image/png', roles: ['object_reference'] };
      const op = operation({ process: 'stock', executor, profile, quality: 'high', background: 'transparent', references: [reference] });
      f.generate.mockImplementationOnce(async input => {
        const prepared = await prepareLiveImageRequest(input, 'fake-text-model');
        expect(prepared.effective_prompt).toContain(op.context.instruction);
        expect(prepared.input_manifest[0].asset).toEqual((imported.version as RegisteredAssetVersion).identity);
        if (executor === 'image_api') {
          expect(prepared.endpoint).toBe('/v1/images/edits');
          const body = prepared.body as FormData;
          expect(body.get('model')).toBe(IMAGE_PROFILES[profile].model_id); expect(body.get('quality')).toBe('high'); expect(body.get('background')).toBe('transparent');
          expect(new Uint8Array(await (body.get('image') as Blob).arrayBuffer())).toEqual(bytes);
        } else {
          const body = JSON.parse(prepared.body as string);
          expect(body.tools[0]).toMatchObject({ model: IMAGE_PROFILES[profile].model_id, quality: 'high', background: 'transparent' });
          expect(body.input[0].content[1].image_url).toBe(`data:image/png;base64,${Buffer.from(bytes).toString('base64')}`);
        }
        await input.beforeDispatch?.();
        return { result: normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 1,
          body: { data: [{ b64_json: Buffer.from(output(op.image!.size)).toString('base64') }] } }),
          effective_prompt: prepared.effective_prompt, input_manifest: prepared.input_manifest };
      });
      expect((await f.generation.enqueue(business, actor, op)).execution).toMatchObject({ status: 'completed' });
      expect(f.generate).toHaveBeenCalledTimes(1);
    }
  });
  it('never retries an uncertain request or widens the existing authorization and budget policy', async () => {
    const f = fixture(), op = operation();
    f.generate.mockImplementationOnce(async input => ({ result: normalizeImageTransportFailure({ duration_ms: 100, kind: 'timeout', request_sent: true }),
      effective_prompt: input.operation.context.instruction, input_manifest: [] }));
    expect((await f.generation.enqueue(business, actor, op)).execution).toMatchObject({ status: 'uncertain' });
    expect((await f.generation.enqueue(business, actor, op)).reused).toBe(true);
    await expect(f.generation.enqueue(business, actor, operation({ operationKey: 'new' }))).rejects.toMatchObject({ code: 'server_previous_operation_unresolved' });
    expect(f.generate).toHaveBeenCalledTimes(1); expect(f.policy).toEqual(policy);
    const expired = fixture(); expired.expire();
    await expect(expired.generation.enqueue(business, actor, op)).rejects.toMatchObject({ code: 'server_generation_expired' });
    expect(expired.createProvider).not.toHaveBeenCalled();
  });
});

describe('pipeline compatibility delegates to the shared job', () => {
  const input = { pipelineRunId: '80000000-0000-4000-8000-000000000055', business_id: business,
    promptFinal: 'Mundo con avión, conserva México.', negativeInstructions: 'No inventar cifras.', aspectRatio: '4:5',
    imageType: 'fotografia', imageModel: 'gpt-image-2.5-sunburst' as const, imageQuality: 'high' as const };
  function bridge() {
    const f = fixture(); const catalog = new Map<string, string>();
    const ports: PipelineImageBridgePorts = { actorId: actor,
      read: id => f.generation.read(id, actor), enqueue: (id, op) => f.generation.enqueue(id, actor, op),
      asset: async identity => f.storage.get(f.state!.assets.versions.find(v => v.identity.asset_id === identity.asset_id)!.storage.storage_key),
      catalogue: vi.fn(async (id, image) => { if (!catalog.has(id)) catalog.set(id, image); }) };
    return { f, ports, catalog };
  }
  it('retains the pipeline response and catalog identity across retries after a lost acknowledgement', async () => {
    const { f, ports, catalog } = bridge(), enqueue = ports.enqueue;
    ports.enqueue = async (id, op) => { await enqueue(id, op); throw Error('lost acknowledgement'); };
    const result = await generatePipelineImage(input, ports);
    expect(result).toMatchObject({ imageModel: input.imageModel, imageQuality: input.imageQuality, imageType: 'fotografia',
      canvas: { width: 1080, height: 1350 }, generationSize: { width: 1088, height: 1360 },
      promptUsed: { promptFinal: input.promptFinal, negativeInstructions: input.negativeInstructions } });
    expect(result.imageBase64).toBeTruthy(); expect(result.assetIdentity.business_id).toBe(business);
    f.expire();
    const recovered = await generatePipelineImage(input, ports);
    expect(recovered).toEqual(result); expect(f.generate).toHaveBeenCalledTimes(1); expect(catalog.size).toBe(1);
  });
  it('recovers a catalogue failure without rendering another asset', async () => {
    const { f, ports, catalog } = bridge(), catalogue = ports.catalogue;
    ports.catalogue = vi.fn().mockRejectedValueOnce(Error('catalogue unavailable')).mockImplementation(catalogue);
    await expect(generatePipelineImage(input, ports)).rejects.toThrow('catalogue unavailable');
    await generatePipelineImage(input, ports);
    expect(f.generate).toHaveBeenCalledTimes(1); expect(catalog.size).toBe(1);
  });
  it('distinguishes an explicit new version with identical prompt from delivery retries', async () => {
    const { f, ports, catalog } = bridge();
    const firstRequest = { ...input, generationRequestId: '80000000-0000-4000-8000-000000000056' };
    const first = await generatePipelineImage(firstRequest, ports);
    expect(await generatePipelineImage(firstRequest, ports)).toEqual(first);
    const second = await generatePipelineImage({ ...firstRequest, generationRequestId: '80000000-0000-4000-8000-000000000057' }, ports);
    expect(second.operationKey).not.toBe(first.operationKey);
    expect(second.imageLibraryId).not.toBe(first.imageLibraryId);
    expect(f.generate).toHaveBeenCalledTimes(2); expect(catalog.size).toBe(2);
  });
  it('preserves uncertainty on repeated pipeline retries without creating a second render', async () => {
    const { f, ports } = bridge();
    f.generate.mockImplementationOnce(async op => ({ result: normalizeImageTransportFailure({ duration_ms: 100, kind: 'timeout', request_sent: true }),
      effective_prompt: op.operation.context.instruction, input_manifest: [] }));
    await expect(generatePipelineImage(input, ports)).rejects.toMatchObject({ code: 'pipeline_image_pending', status: 409 });
    await expect(generatePipelineImage(input, ports)).rejects.toMatchObject({ code: 'pipeline_image_pending', status: 409 });
    expect(f.generate).toHaveBeenCalledTimes(1); expect(ports.catalogue).not.toHaveBeenCalled();
  });
  it('does not turn unsupported selections or references into a legacy fallback', async () => {
    const { f, ports } = bridge();
    await expect(generatePipelineImage({ ...input, imageQuality: 'auto' }, ports)).rejects.toThrow();
    await expect(generatePipelineImage({ ...input, referenceImageBase64: 'ignored' }, ports)).rejects.toThrow();
    await expect(generatePipelineImage({ ...input, imageCount: 3 }, ports)).rejects.toThrow();
    expect(f.generate).not.toHaveBeenCalled();
  });
  it('forwards only the original user authorization to the configured Supabase engine', async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ state: {} }), { status: 200 }));
    const transport = createPipelineImageTransport({ origin: 'https://project.supabase.co', publicKey: 'public-test-key', authorization: 'Bearer original-user-token', fetch });
    await transport.read(business);
    expect(fetch).toHaveBeenCalledWith('https://project.supabase.co/functions/v1/desaing-server', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer original-user-token', apikey: 'public-test-key' }),
      body: JSON.stringify({ business_id: business, command: { kind: 'read' } }), redirect: 'error' }));
    expect(() => createPipelineImageTransport({ origin: 'http://foreign.invalid', publicKey: 'key', authorization: 'Bearer token' })).toThrow();
  });
});
