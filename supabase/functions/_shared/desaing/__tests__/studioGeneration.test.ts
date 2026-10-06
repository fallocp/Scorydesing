import { describe, expect, it, vi } from 'vitest';
import { createStudioGenerationOperation, readStudioGeneration, studioGenerationImmutables, STUDIO_GENERATION_MARKER } from '../studioGeneration.ts';
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
const policyId = 'studio-unification';
const config: ServerGenerationConfig = { enabled: true, executor: 'image_api',
  expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: policyId, limit_micro_usd: PILOT_LIMITS.budgetMicroUsd,
  max_image_outputs: PILOT_LIMITS.maxOutputs, reservation_per_output_micro_usd: PILOT_LIMITS.reservationMicroUsd,
  enabled_image_profiles: [...SELECTABLE_IMAGE_PROFILES], responses_image_enabled: true };
function operation(input: Partial<Parameters<typeof createStudioGenerationOperation>[0]> = {}) {
  return createStudioGenerationOperation({ operationKey: 'studio:first', actorId: actor, businessId: business,
    prompt: 'Diseña con el texto elegido y la fotografía de referencia.', profile: 'flare_candidate', quality: 'medium',
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
    return { result: normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 12, headers: { 'x-request-id': 'studio-fake' },
      body: { data: [{ b64_json: Buffer.from(output(input.operation.image!.size)).toString('base64') }], usage: { input_tokens: 10, output_tokens: 20 } } }),
      effective_prompt: input.operation.context.instruction, input_manifest: [] };
  });
  const createProvider = vi.fn((): LiveWorkerProvider => ({ mode: 'live', generate }));
  const generation = createServerGeneration({ ...config, executor }, { repository, storage, createProvider, now: () => time });
  return { generation, repository, storage, generate, createProvider, resolved, policy: actualPolicy,
    get state() { return state; }, get dispatches() { return dispatches; }, expire() { time = config.expiresAt; } };
}

describe('native Studio operation contract', () => {
  it('keeps legacy sizes and free copy semantics without pretending a full design was approved', () => {
    for (const canvas of [{ width: 1024, height: 1024 }, { width: 1024, height: 1536 }, { width: 1536, height: 1024 }]) {
      const op = operation({ canvas });
      expect(readStudioGeneration(op.context)).toEqual({ canvas });
      expect(op.context.immutable_elements).toEqual(studioGenerationImmutables(canvas));
      expect(op.context.immutable_elements.join('\n')).not.toContain('Texto aprobado');
      expect(parseServerRequest({ business_id: business, command: { kind: 'enqueue', operation: op } }).command).toEqual({ kind: 'enqueue', operation: op });
    }
    expect(readStudioGeneration({ ...operation().context, project_id: 'ordinary-design', session_id: 'ordinary', immutable_elements: [] })).toBeNull();
  });
  it('preserves all model/quality choices and clones reference metadata', () => {
    const reference: DesignReference = { reference_id: 'first', business_id: business, asset_id: 'source', version_id: 'source-v1', mime_type: 'image/png', roles: ['layout_reference'] };
    for (const profile of SELECTABLE_IMAGE_PROFILES) for (const quality of SELECTABLE_IMAGE_QUALITIES) {
      const op = operation({ profile, quality, references: [reference] });
      expect(op.image).toMatchObject({ profile, quality, output_count: 1 });
      expect(op.context.references).toEqual([reference]); expect(op.context.references[0]).not.toBe(reference);
    }
    expect(() => operation({ quality: 'auto' as 'low' })).toThrow('invalid_studio_generation');
    expect(() => operation({ profile: 'unknown' as 'baseline' })).toThrow('invalid_studio_generation');
  });
  it.each(['missing_marker', 'marker_version', 'canvas', 'duplicate', 'foreign_brand', 'workspace', 'session', 'base', 'placement', 'target', 'prompt'])
  ('rejects malformed %s Studio context instead of falling through to another workflow', field => {
    const op = operation();
    if (field === 'missing_marker') op.context.immutable_elements = [];
    if (field === 'marker_version') op.context.immutable_elements[0] = STUDIO_GENERATION_MARKER.replace('v1', 'v2');
    if (field === 'canvas') op.context.immutable_elements[1] = 'ScoryDesign: lienzo de Design Studio 4096×4096.';
    if (field === 'duplicate') op.context.immutable_elements.push(STUDIO_GENERATION_MARKER);
    if (field === 'foreign_brand') op.context.brand_id = 'foreign';
    if (field === 'workspace') op.context.workspace = 'production';
    if (field === 'session') op.context.session_id = 'presentation';
    if (field === 'base') op.context.base_asset = { business_id: business, asset_id: 'base', version_id: 'v1' };
    if (field === 'placement') op.context.placement = { capture_reference_id: 'source', document_revision: '1', canvas: { width: 1536, height: 1024 }, region: { x: 0, y: 0, width: 1, height: 1, units: 'normalized' } };
    if (field === 'target') op.context.target.slide_id = 'slide';
    if (field === 'prompt') op.context.instruction = 'x'.repeat(16001);
    expect(() => readStudioGeneration(op.context)).toThrow('invalid_studio_generation');
  });
  it('announces Studio separately and does not infer support from an older deployment', async () => {
    const f = fixture(), caps = (await f.generation.read(business, actor)).generation!;
    expect(caps.supports_studio_generation).toBe(true); expect(isServerGenerationCapabilities(caps)).toBe(true);
    const { supports_studio_generation: _support, ...old } = caps;
    expect(isServerGenerationCapabilities(old)).toBe(true); expect(old).not.toHaveProperty('supports_studio_generation');
    expect(isServerGenerationCapabilities({ ...old, supports_studio_generation: 'true' })).toBe(false);
    expect(f.createProvider).not.toHaveBeenCalled();
  });
});

describe('Studio shares the admitted image job and worker', () => {
  it.each(SELECTABLE_IMAGE_PROFILES.flatMap((profile, index) => (['image_api', 'responses_image'] as const).map(executor => ({ profile, executor, quality: SELECTABLE_IMAGE_QUALITIES[index] }))))
  ('dispatches $profile / $quality through $executor and recovers the same durable result', async ({ profile, executor, quality }) => {
    const f = fixture(executor), op = operation({ profile, quality, executor, prompt: 'Contexto de marca y copybank. '.repeat(180) });
    const first = await f.generation.enqueue(business, actor, op);
    expect(first.execution).toMatchObject({ status: 'completed' }); expect(f.dispatches).toBe(1);
    const saved = f.state!.assets.versions[0];
    expect(saved.provenance).toMatchObject({ kind: 'image_operation', model_id: IMAGE_PROFILES[profile].model_id, quality,
      effective_prompt: op.context.instruction, immutable_elements: op.context.immutable_elements });
    expect(saved.storage).toMatchObject({ width: 1536, height: 1024 });
    expect(f.state!.jobs.jobs[0].plan.calls[0]).toMatchObject({ executor, model_profile: profile });
    expect((await f.generation.enqueue(business, actor, op)).reused).toBe(true);
    await f.generation.read(business, actor); expect(f.dispatches).toBe(1); expect(f.state!.jobs.jobs).toHaveLength(1);
    expect(f.policy).toEqual(policy);
  });
  it('uses actual registered reference pixels and admits simultaneous same-key generation only once', async () => {
    const f = fixture(), bytes = productionPng(20, 32, 24);
    const imported = await f.generation.import(actor, { businessId: business, brandId: business, projectId: `design-studio:${business}`,
      uploadId: '80000000-0000-4000-8000-000000000003' }, bytes);
    const reference: DesignReference = { ...(imported.version as RegisteredAssetVersion).identity, reference_id: 'source', mime_type: 'image/png', roles: ['layout_reference', 'image_style_reference'] };
    const op = operation({ references: [reference] });
    await Promise.allSettled([f.generation.enqueue(business, actor, op), f.generation.enqueue(business, actor, op)]);
    expect(f.dispatches).toBe(1); expect(f.resolved).toEqual([bytes]); expect(f.state!.jobs.jobs).toHaveLength(1);
    expect(f.state!.jobs.jobs[0].plan.calls[0].route).toBe('images_edits');
    expect((await f.generation.enqueue(business, actor, op)).reused).toBe(true);
    await expect(f.generation.enqueue(business, actor, { ...op, image: { ...op.image!, quality: 'high' } })).rejects.toMatchObject({ code: 'operation_key_conflict' });
    expect(f.dispatches).toBe(1);
  });
  it('retains unknown outcomes and never turns recovery into another render', async () => {
    const f = fixture(), op = operation();
    f.generate.mockImplementationOnce(async input => ({ result: normalizeImageTransportFailure({ duration_ms: 100, kind: 'timeout', request_sent: true }),
      effective_prompt: input.operation.context.instruction, input_manifest: [] }));
    expect((await f.generation.enqueue(business, actor, op)).execution).toMatchObject({ status: 'uncertain' });
    expect((await f.generation.enqueue(business, actor, op)).reused).toBe(true);
    await f.generation.read(business, actor);
    await expect(f.generation.enqueue(business, actor, operation({ operationKey: 'new-attempt' }))).rejects.toMatchObject({ code: 'server_previous_operation_unresolved' });
    expect(f.generate).toHaveBeenCalledTimes(1);
  });
  it('does not extend the ordinary presentation brief limit or accept production/medium mutations', async () => {
    const f = fixture(), op = operation({ prompt: 'é'.repeat(12500), canvas: { width: 1024, height: 1024 } });
    const ordinary: DesignOperation = structuredClone(op);
    ordinary.context.project_id = 'deck'; ordinary.context.session_id = 'presentation'; ordinary.context.workspace = 'presentations';
    ordinary.context.target = { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '1' }; ordinary.context.immutable_elements = [];
    await expect(f.generation.enqueue(business, actor, ordinary)).rejects.toMatchObject({ code: 'request_too_large' });
    for (const changed of [
      { ...op, action: 'generate_medium' as const },
      { ...op, context: { ...op.context, workspace: 'production' as const } },
      { ...op, image: { ...op.image!, size: { width: 1024, height: 1536 } } },
      { ...op, context: { ...op.context, target: { ...op.context.target, document_id: 'other' } } },
    ]) await expect(f.generation.enqueue(business, actor, changed)).rejects.toMatchObject({ code: 'unsupported_server_generation' });
    expect(f.repository.commit).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it('keeps disabled models and expired authorization closed before a job reservation', async () => {
    const f = fixture(); f.policy.enabled_image_profiles = ['flare_candidate'];
    await expect(f.generation.enqueue(business, actor, operation({ profile: 'sunburst_rescue' }))).rejects.toMatchObject({ code: 'unsupported_server_generation' });
    f.expire(); await expect(f.generation.enqueue(business, actor, operation())).rejects.toMatchObject({ code: 'server_generation_expired' });
    expect(f.repository.commit).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
});
