import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createServerGeneration, type ServerGenerationConfig, type ServerGenerationDependencies } from '../serverGeneration.ts';
import { reviewedProductionResult } from '../../../../../src/lib/presentations/presentationServerDesign';
import { createServerHandler } from '../serverHttp.ts';
import { createServerSnapshot, type ServerPolicy, type ServerSnapshot } from '../serverState.ts';
import { executeServerCommand, type BusinessRole, type ServerRead, type ServerRepository } from '../serverRepository.ts';
import type { DesignOperation, DesignReference } from '../contracts.ts';
import type { LiveWorkerProvider } from '../serverWorker.ts';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../imageResponse.ts';
import { getQuotaUsage } from '../jobLedger.ts';
import { isServerGenerationCapabilities } from '../serverGenerationContract.ts';
import type { RegisteredAssetVersion } from '../assets.ts';
import { PILOT_LIMITS } from '../pilotHttp.ts';
import { fullDesignImmutables, fullDesignImageSize, presentationDesignSessionId } from '../presentationFullDesign.ts';
import { designSurfaceSessionId, designSurfaceTarget } from '../designSurface.ts';
import { createLiveImageProvider } from '../liveImageProvider.ts';
import { buildPromptAdminTestOperations } from '../promptAdminComparison.ts';

const business = '80000000-0000-4000-8000-000000000001', actor = '80000000-0000-4000-8000-000000000002';
const upload = '80000000-0000-4000-8000-000000000003', foreign = '80000000-0000-4000-8000-000000000099';
const config: ServerGenerationConfig = { enabled: true, executor: 'responses_image', businessId: business, actorId: actor,
  policyId: 'ui-pilot-policy', expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: config.policyId, limit_micro_usd: 5000000,
  reservation_per_output_micro_usd: 1000000, max_image_outputs: 4, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };
function operation(key = 'ui-first'): DesignOperation {
  return { operation_key: key, action: 'generate_image', context: { actor_id: actor, business_id: business, brand_id: 'presentation', project_id: 'deck',
    session_id: 'session', workspace: 'presentations', interaction_mode: 'execute_change',
    target: { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: '1' },
    instruction: 'Un avión para la portada.', immutable_elements: ['Conservar texto HTML.'], references: [] },
  image: { profile: 'flare_candidate', executor: 'responses_image', quality: 'low', output_count: 1, output_format: 'png',
    background: 'opaque', size: { width: 1024, height: 1024 } } };
}
function png(width: number, height: number, color = 80): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, data: Uint8Array) => {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, -4)) { crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const stride = width * 4 + 1, raw = new Uint8Array(stride * height).fill(color);
  for (let offset = 0; offset < raw.length; offset += stride) raw[offset] = 0;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())];
  const bytes = new Uint8Array(parts.reduce((length, part) => length + part.length, 0)); let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; } return bytes;
}
const image = png(1024, 1024), mediumImage = png(1024, 1024, 140), capture = png(800, 450);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');
class Repository implements ServerRepository {
  role: BusinessRole = 'owner'; policy = structuredClone(policy); snapshot: ServerSnapshot | null = null; revision = 0;
  failEnqueueAck = false;
  read = vi.fn(async (_businessId: string, _actorId: string): Promise<ServerRead> => ({ role: this.role,
    policy: structuredClone(this.policy), state: { revision: this.revision, snapshot: structuredClone(this.snapshot) } }));
  commit = vi.fn(async (input: Parameters<ServerRepository['commit']>[0]) => {
    if (input.expectedRevision !== this.revision) return { committed: false, revision: this.revision };
    this.snapshot = structuredClone(input.snapshot); this.revision++;
    if (this.failEnqueueAck && input.event === 'job_enqueued') { this.failEnqueueAck = false; throw Error('private-database-error'); }
    return { committed: true, revision: this.revision };
  });
}
function fixture(overrides: Partial<ServerGenerationConfig> = {}, validateProduction?: ServerGenerationDependencies['validateProduction'], validatePromptAdmin?: ServerGenerationDependencies['validatePromptAdmin']) {
  const repository = new Repository(), objects = new Map<string, Uint8Array>();
  let at = 1000, dispatches = 0, beforeDispatch: (() => void) | undefined;
  const storage = {
    get: vi.fn(async (key: string) => { const bytes = objects.get(key); if (!bytes) throw Error('missing_capture'); return bytes.slice(); }),
    putImmutable: vi.fn(async (key: string, bytes: Uint8Array) => { objects.set(key, bytes.slice()); }),
    signedUrl: vi.fn(async () => 'https://project.supabase.co/storage/v1/object/sign/desaing-assets/result?token=private'),
  };
  const generate = vi.fn<LiveWorkerProvider['generate']>().mockImplementation(async input => {
    beforeDispatch?.(); await input.beforeDispatch?.(); dispatches++;
    return { result: normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 10, headers: { 'x-request-id': 'req_ui' },
      body: { data: [{ b64_json: b64(input.operation.image?.quality === 'medium' ? mediumImage : image) }],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } } }),
      effective_prompt: input.operation.context.instruction, input_manifest: [] };
  });
  const createProvider = vi.fn((): LiveWorkerProvider => ({ mode: 'live', generate }));
  const generation = createServerGeneration({ ...config, ...overrides }, { repository, storage, createProvider, now: () => at, validateProduction, validatePromptAdmin });
  const authenticate = vi.fn(async (token: string) => token === 'verified-user-jwt' ? { id: actor } : null);
  const handler = createServerHandler({ enabled: true, allowedOrigins: ['http://localhost:5173'], repository, storage, authenticate, generation });
  return { repository, storage, objects, generate, createProvider, generation, handler, authenticate,
    get dispatches() { return dispatches; }, setTime(value: number) { at = value; }, beforeDispatch(value: () => void) { beforeDispatch = value; } };
}
function request(command: unknown, token = 'verified-user-jwt') {
  return new Request('https://project.supabase.co/functions/v1/desaing-server', { method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, Origin: 'http://localhost:5173' },
    body: JSON.stringify({ business_id: business, command }) });
}
async function send(f: ReturnType<typeof fixture>, command: unknown) {
  const response = await f.handler(request(command)); return { response, body: await response.json() };
}
const enqueue = (f: ReturnType<typeof fixture>, op = operation()) => send(f, { kind: 'enqueue', operation: op });
const importInput = { businessId: business, uploadId: upload, brandId: 'presentation', projectId: 'deck' };
async function references(f: ReturnType<typeof fixture>, count = 4) {
  const values: DesignReference[] = [];
  for (let index = 0; index < count; index++) {
    const imported = await f.generation.import(actor, { ...importInput, uploadId: `80000000-0000-4000-8000-${String(10 + index).padStart(12, '0')}` }, png(20 + index, 20, index + 1));
    values.push({ ...(imported.version as RegisteredAssetVersion).identity, reference_id: `ref-${index}`,
      mime_type: 'image/png', roles: [index === 0 ? 'placement_context' as const : index === 3 ? 'image_style_reference' as const : 'object_reference' as const] });
  }
  return values;
}
async function approvedMedium(f: ReturnType<typeof fixture>, low: DesignOperation): Promise<DesignOperation> {
  const asset = f.repository.snapshot!.jobs.jobs.find(job => job.operation_key === low.operation_key)!.calls[0].receipt!.outputs[0].asset;
  const candidate = { ...asset, candidate_id: `candidate:${low.operation_key}` };
  const approval = { approval_id: `approval:${low.operation_key}`, actor_id: actor, candidate, immutable_elements: [...low.context.immutable_elements] };
  expect((await send(f, { kind: 'approve_direction', approval })).response.status).toBe(200);
  const medium = structuredClone(low); medium.operation_key = `${low.operation_key}:medium`; medium.action = 'generate_medium';
  medium.image!.quality = 'medium'; medium.context.base_asset = { ...asset };
  medium.context.direction_approval = { candidate, immutable_elements: [...approval.immutable_elements] }; medium.selected_candidates = [{ ...candidate }];
  return medium;
}

describe('administrative prompt comparisons require their durable authority', () => {
  const pair = () => buildPromptAdminTestOperations({ test_id: upload, business_id: business, actor_id: actor,
    base_prompt: 'Base conservada.', candidate_prompt: 'Base conservada con mejor jerarquía.', executor: 'responses_image',
    visual_case: { instruction: 'Composición clara de un mundo.', approved_copy: 'México · 25 USD', references: [] } });
  it('fails closed before admission when no prompt authority was configured', async () => {
    const f = fixture(); await expect(f.generation.enqueue(business, actor, pair().before)).rejects.toMatchObject({ code: 'server_prompt_admin_unavailable' });
    expect(f.createProvider).not.toHaveBeenCalled(); expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it('checks the exact authority before reservation and immediately before transport', async () => {
    const validate = vi.fn<NonNullable<ServerGenerationDependencies['validatePromptAdmin']>>(async () => {}), f = fixture({}, undefined, validate), op = pair().before;
    await f.generation.enqueue(business, actor, op); expect(f.dispatches).toBe(1);
    expect(validate.mock.calls.map(call => call[2])).toEqual(['admit', 'admit', 'dispatch', 'dispatch']);
    expect(validate.mock.calls.every(call => JSON.stringify(call[0]) === JSON.stringify(op))).toBe(true);
  });
  it('preserves the claim without sending when permission changes immediately before dispatch', async () => {
    let permitted = true;
    const validate = vi.fn<NonNullable<ServerGenerationDependencies['validatePromptAdmin']>>(async () => { if (!permitted) throw Error('prompt_admin_forbidden'); });
    const f = fixture({}, undefined, validate); f.beforeDispatch(() => { permitted = false; });
    await f.generation.enqueue(business, actor, pair().after); expect(f.dispatches).toBe(0);
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].state).toBe('uncertain');
  });
});

describe('authenticated UI capabilities and disabled generation', () => {
  it('verifies the JWT before any generation boundary I/O', async () => {
    const f = fixture(), response = await f.handler(request({ kind: 'enqueue', operation: operation() }, 'forged-jwt'));
    expect(response.status).toBe(401); expect(f.repository.read).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it('returns only trusted capabilities without constructing a provider or extra SQL reads', async () => {
    const f = fixture(), read = await send(f, { kind: 'read' });
    expect(read.body.enabled).toBe(true);
    expect(read.body.generation).toEqual({ profile: 'flare_candidate', executor: 'responses_image', max_reference_edge: 1024, max_brief_bytes: 4000,
      remaining_outputs: 4, max_references: 4, supports_recreation: true, supports_full_design: true });
    expect(f.repository.read).toHaveBeenCalledTimes(1); expect(f.createProvider).not.toHaveBeenCalled(); expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it.each(['flag', 'expiry', 'origin', 'actor', 'policy', 'budget', 'outputs', 'reserve', 'profile', 'responses', 'role', 'paused'])
  ('keeps work readable but blocks new upload/enqueue for invalid %s', async field => {
    const f = fixture(field === 'flag' ? { enabled: false } : field === 'origin' ? { actualSupabaseOrigin: 'https://other.supabase.co' }
      : field === 'actor' ? { actorId: foreign } : {});
    if (field === 'expiry') f.setTime(config.expiresAt);
    if (field === 'policy') f.repository.policy.policy_id = 'changed';
    if (field === 'budget') f.repository.policy.limit_micro_usd++;
    if (field === 'outputs') f.repository.policy.max_image_outputs++;
    if (field === 'reserve') f.repository.policy.reservation_per_output_micro_usd--;
    if (field === 'profile') f.repository.policy.enabled_image_profiles.push('baseline');
    if (field === 'responses') f.repository.policy.responses_image_enabled = false;
    if (field === 'role') f.repository.role = 'editor';
    if (field === 'paused') f.repository.policy.enabled = false;
    const read = await send(f, { kind: 'read' });
    expect(read.response.status).toBe(200); expect(read.body.enabled).toBe(false); expect(read.body.generation).toBeNull();
    expect((await enqueue(f)).response.status).toBeGreaterThanOrEqual(400);
    await expect(f.generation.import(actor, importInput, capture)).rejects.toThrow();
    expect(f.storage.putImmutable).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled(); expect(f.repository.commit).not.toHaveBeenCalled();
  });
});

describe('bounded explicit UI admission, claims and recovery', () => {
  it.each(['actor', 'baseline', 'executor', 'quality', 'outputs', 'size', 'background', 'brief', 'constraints', 'refs', 'combined'])
  ('rejects changed %s before reserving or dispatching', async field => {
    const f = fixture(), op = operation();
    if (field === 'actor') op.context.actor_id = foreign;
    if (field === 'baseline') op.image!.profile = 'baseline';
    if (field === 'executor') op.image!.executor = 'image_api';
    if (field === 'quality') op.image!.quality = 'high';
    if (field === 'outputs') op.image!.output_count = 5;
    if (field === 'size') op.image!.size.width = 2048;
    if (field === 'background') op.image!.background = 'transparent';
    if (field === 'brief') op.context.instruction = 'é'.repeat(2001);
    if (field === 'constraints') op.context.immutable_elements = ['x'.repeat(4000)];
    if (field === 'refs') op.context.references = [1, 2, 3, 4, 5].map(id => ({ business_id: business, asset_id: `ref${id}`, version_id: 'v1', reference_id: `r${id}`, mime_type: 'image/png', roles: ['target_render'] }));
    if (field === 'combined') op.action = 'approve_and_generate_medium';
    expect((await enqueue(f, op)).response.status).toBeGreaterThanOrEqual(400);
    expect(f.repository.commit).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it('rejects a capture above the 1024 edge before upload and accepts a registered capture', async () => {
    const f = fixture();
    await expect(f.generation.import(actor, importInput, png(1025, 1))).rejects.toMatchObject({ code: 'server_generation_reference_limit' });
    expect(f.storage.putImmutable).not.toHaveBeenCalled();
    const imported = await f.generation.import(actor, importInput, capture), op = operation();
    const identity = (imported.version as { identity: { business_id: string; asset_id: string; version_id: string } }).identity;
    op.context.references = [{ ...identity, reference_id: 'capture', mime_type: 'image/png', roles: ['target_render', 'placement_context'] }];
    op.context.placement = { capture_reference_id: 'capture', document_revision: '1', canvas: { width: 800, height: 450 }, region: { x: 430, y: 100, width: 330, height: 300, units: 'px' } };
    expect((await enqueue(f, op)).body.execution.status).toBe('completed'); expect(f.dispatches).toBe(1);
    const events = f.repository.commit.mock.calls.map(([input]) => input.event);
    expect(events.indexOf('call_started')).toBeGreaterThan(events.indexOf('job_enqueued'));
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].settlement).toBeNull();
  });
  it('admits only the fourth image over three existing reservations and preserves all five-dollar policy limits', async () => {
    const f = fixture();
    for (let index = 0; index < 3; index++) expect((await enqueue(f, operation(`prior-${index}`))).response.status).toBe(200);
    expect(getQuotaUsage(f.repository.snapshot!.jobs)).toEqual({ committed_micro_usd: 3000000, image_outputs: 3, unsettled_calls: 3 });
    expect((await send(f, { kind: 'read' })).body.generation.remaining_outputs).toBe(1);
    expect((await enqueue(f, operation('fourth'))).response.status).toBe(200);
    const fifth = await enqueue(f, operation('fifth'));
    expect(fifth.response.status).toBe(429); expect(fifth.body.error).toBe('job_quota_exceeded'); expect(f.dispatches).toBe(4);
    const read = await send(f, { kind: 'read' }); expect(read.body.enabled).toBe(false); expect(read.body.generation.remaining_outputs).toBe(0);
    expect(f.repository.policy).toEqual(policy); expect(f.repository.snapshot!.jobs.jobs).toHaveLength(4);
  });
  it('same-key concurrent requests claim once; replay and recovery never dispatch', async () => {
    const f = fixture();
    await Promise.all([enqueue(f), enqueue(f)]);
    expect(f.dispatches).toBe(1); expect(f.repository.snapshot!.jobs.jobs).toHaveLength(1);
    const creates = f.createProvider.mock.calls.length;
    expect((await enqueue(f)).body.reused).toBe(true);
    await send(f, { kind: 'read' }); await send(f, { kind: 'recover' });
    expect(f.dispatches).toBe(1); expect(f.createProvider).toHaveBeenCalledTimes(creates);
    const altered = operation(); altered.context.instruction = 'Changed';
    expect((await enqueue(f, altered)).response.status).toBe(409);
  });
  it('a changed configured executor cannot move a saved low direction to another route for medium', async () => {
    const f = fixture({ executor: 'image_api' }), low = operation(); low.image!.executor = 'image_api';
    expect((await enqueue(f, low)).response.status).toBe(200);
    const asset = f.repository.snapshot!.jobs.jobs[0].calls[0].receipt!.outputs[0].asset;
    const candidate = { ...asset, candidate_id: `candidate:${low.operation_key}` };
    const approval = { approval_id: 'saved-image-api-direction', actor_id: actor, candidate, immutable_elements: [...low.context.immutable_elements] };
    expect((await send(f, { kind: 'approve_direction', approval })).response.status).toBe(200);
    const medium = structuredClone(low); medium.operation_key = 'forged-route-medium'; medium.action = 'generate_medium';
    medium.image!.quality = 'medium'; medium.image!.executor = 'responses_image'; medium.context.base_asset = { ...asset };
    medium.context.direction_approval = { candidate, immutable_elements: [...approval.immutable_elements] }; medium.selected_candidates = [{ ...candidate }];
    const afterConfigurationChange = createServerGeneration(config, { repository: f.repository, storage: f.storage, createProvider: f.createProvider, now: () => 1000 });
    const commits = f.repository.commit.mock.calls.length, providers = f.createProvider.mock.calls.length;
    await expect(afterConfigurationChange.enqueue(business, actor, medium)).rejects.toMatchObject({ code: 'unsupported_server_generation', status: 400 });
    expect(f.repository.commit).toHaveBeenCalledTimes(commits); expect(f.createProvider).toHaveBeenCalledTimes(providers);
    expect(f.repository.snapshot!.jobs.jobs).toHaveLength(1); expect(f.dispatches).toBe(1);
  });
  it('replays an existing unclaimed pending operation without starting it, including when paused', async () => {
    const f = fixture(); await executeServerCommand(f.repository, business, actor, { kind: 'enqueue', operation: operation() }, () => 1000);
    f.repository.policy.enabled = false;
    const replay = await enqueue(f); expect(replay.response.status).toBe(200); expect(replay.body.reused).toBe(true);
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].attempt).toBeNull(); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it('an ambiguous enqueue acknowledgement retains the reservation and cannot turn into a paid retry', async () => {
    const f = fixture(); f.repository.failEnqueueAck = true;
    const first = await enqueue(f);
    expect(first.response.status).toBe(503); expect(first.body.error).toBe('server_generation_outcome_unknown');
    expect(JSON.stringify(first.body)).not.toContain('private-database-error');
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].reserved_micro_usd).toBe(1000000);
    expect((await enqueue(f)).body.reused).toBe(true); expect(f.dispatches).toBe(0);
  });
  it('a missing registered file after enqueue produces an unknown response instead of a definitive rejection', async () => {
    const f = fixture(), imported = await f.generation.import(actor, importInput, capture), op = operation();
    const identity = (imported.version as { identity: { business_id: string; asset_id: string; version_id: string } }).identity;
    op.context.references = [{ ...identity, reference_id: 'capture', mime_type: 'image/png', roles: ['target_render'] }];
    f.objects.clear();
    const response = await enqueue(f, op); expect(response.response.status).toBe(503); expect(response.body.error).toBe('server_generation_outcome_unknown');
    expect(f.repository.snapshot!.jobs.jobs).toHaveLength(1); expect(f.dispatches).toBe(0);
    expect((await enqueue(f, op)).body.reused).toBe(true); expect(f.dispatches).toBe(0);
  });
  it.each(['role', 'policy', 'expiry'])('rechecks %s immediately before paid transport after the durable claim', async field => {
    const f = fixture(); f.beforeDispatch(() => {
      if (field === 'role') f.repository.role = 'editor';
      if (field === 'policy') f.repository.policy.enabled = false;
      if (field === 'expiry') f.setTime(config.expiresAt);
    });
    const result = await enqueue(f);
    expect(result.response.status).toBe(200); expect(result.body.execution.status).toBe('uncertain');
    expect(f.dispatches).toBe(0); expect(f.repository.snapshot!.jobs.jobs[0].calls[0].attempt).not.toBeNull();
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].settlement).toBeNull();
  });
  it('an uncertain provider result holds its reservation, blocks the next key and is never retried by review/recover/read', async () => {
    const f = fixture(); f.generate.mockImplementationOnce(async input => {
      await input.beforeDispatch?.();
      return { result: normalizeImageTransportFailure({ duration_ms: 100, kind: 'timeout', request_sent: true }),
        effective_prompt: input.operation.context.instruction, input_manifest: [] };
    });
    expect((await enqueue(f)).body.execution.status).toBe('uncertain');
    expect((await enqueue(f, operation('next'))).response.status).toBe(409);
    await send(f, { kind: 'recover' }); await send(f, { kind: 'read' }); await enqueue(f);
    expect(f.generate).toHaveBeenCalledTimes(1); expect(getQuotaUsage(f.repository.snapshot!.jobs).committed_micro_usd).toBe(1000000);
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].settlement).toBeNull();
  });
  it('a saved failed call prevents a new dispatch while read and final review remain available', async () => {
    const f = fixture(); await enqueue(f);
    const job = f.repository.snapshot!.jobs.jobs[0], call = job.calls[0];
    f.repository.policy.enabled = false;
    expect((await send(f, { kind: 'review', operation_key: job.operation_key, call_key: call.call_key, decision: 'rejected' })).response.status).toBe(200);
    expect(f.dispatches).toBe(1);
    f.repository.policy.enabled = true;
    const failed = structuredClone(f.repository.snapshot!); failed.assets.reviews = [];
    failed.jobs.jobs[0].calls[0].state = 'failed'; failed.jobs.jobs[0].calls[0].review = null;
    f.repository.snapshot = failed;
    expect((await enqueue(f, operation('new-after-failure'))).response.status).toBe(409); expect(f.dispatches).toBe(1);
  });
  it('disabled generation still supports ordinary read/recover of an empty existing snapshot', async () => {
    const f = fixture({ enabled: false }); f.repository.snapshot = createServerSnapshot(business, policy);
    expect((await send(f, { kind: 'read' })).response.status).toBe(200);
    expect((await send(f, { kind: 'recover' })).response.status).toBe(200);
    expect(f.dispatches).toBe(0); expect(f.createProvider).not.toHaveBeenCalled();
  });
});

describe('real visual references and explicit recreation', () => {
  it.each(['image_api', 'responses_image'] as const)('admits four stored references through %s with unchanged financial pins', async executor => {
    const f = fixture({ executor }), op = operation(); op.image!.executor = executor;
    op.context.references = await references(f);
    expect((await enqueue(f, op)).body.execution.status).toBe('completed');
    expect(f.generate.mock.calls[0][0].operation.context.references).toEqual(op.context.references);
    expect(getQuotaUsage(f.repository.snapshot!.jobs)).toEqual({ committed_micro_usd: 1000000, image_outputs: 1, unsettled_calls: 1 });
    expect(f.repository.policy).toEqual(policy); expect(PILOT_LIMITS.maxReferences).toBe(2);
    expect((await send(f, { kind: 'read' })).body.generation.remaining_outputs).toBe(3);
  });
  it('rejects a fifth registered reference before any reservation or provider construction', async () => {
    const f = fixture(), op = operation(); op.context.references = await references(f, 5);
    const revision = f.repository.revision;
    const result = await enqueue(f, op);
    expect(result.body.error).toBe('server_generation_reference_limit'); expect(result.response.status).toBe(400);
    expect(f.repository.revision).toBe(revision); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it.each(['image_api', 'responses_image'] as const)('recreates a new transparent asset and promotes its approved version through %s', async executor => {
    const f = fixture({ executor }), low = operation('recreate'); low.image!.executor = executor;
    low.action = 'recreate_asset'; low.image!.background = 'transparent'; low.context.references = await references(f);
    const source = low.context.references[1];
    low.context.base_asset = { business_id: source.business_id, asset_id: source.asset_id, version_id: source.version_id };
    expect((await enqueue(f, low)).body).toMatchObject({ execution: { status: 'completed' } });
    const lowIdentity = f.repository.snapshot!.jobs.jobs[0].calls[0].receipt!.outputs[0].asset;
    expect(lowIdentity.asset_id).not.toBe(source.asset_id);
    const medium = await approvedMedium(f, low);
    expect((await enqueue(f, medium)).body.execution.status).toBe('completed');
    const mediumIdentity = f.repository.snapshot!.jobs.jobs[1].calls[0].receipt!.outputs[0].asset;
    expect(mediumIdentity.asset_id).toBe(lowIdentity.asset_id); expect(mediumIdentity.version_id).not.toBe(lowIdentity.version_id);
    const version = f.repository.snapshot!.assets.versions.find(item => item.identity.version_id === mediumIdentity.version_id)!;
    expect(version.provenance).toMatchObject({ kind: 'image_operation', action: 'generate_medium', parent: lowIdentity, references: low.context.references });
    expect(f.generate.mock.calls[1][0].operation.image).toMatchObject({ quality: 'medium', background: 'transparent', output_format: 'png' });
    expect(f.dispatches).toBe(2); expect(getQuotaUsage(f.repository.snapshot!.jobs).committed_micro_usd).toBe(2000000);
    expect((await enqueue(f, low)).body.reused).toBe(true); expect((await enqueue(f, medium)).body.reused).toBe(true); expect(f.dispatches).toBe(2);
  });
  it.each(['missing', 'wrong_version', 'wrong_role', 'foreign_business', 'opaque', 'selected_candidate', 'direction'])
  ('rejects a recreation with %s source or settings before reserving', async field => {
    const f = fixture(), op = operation(); op.action = 'recreate_asset'; op.image!.background = 'transparent';
    op.context.references = await references(f, 2); const source = op.context.references[1];
    op.context.base_asset = { business_id: source.business_id, asset_id: source.asset_id, version_id: source.version_id };
    if (field === 'missing') delete op.context.base_asset;
    if (field === 'wrong_version') op.context.base_asset!.version_id = 'different-version';
    if (field === 'wrong_role') source.roles = ['placement_context'];
    if (field === 'foreign_business') op.context.base_asset!.business_id = foreign;
    if (field === 'opaque') op.image!.background = 'opaque';
    if (field === 'selected_candidate') op.selected_candidates = [{ ...source, candidate_id: 'unrequested' }];
    if (field === 'direction') op.context.direction_approval = { candidate: { ...source, candidate_id: 'unrequested' }, immutable_elements: [] };
    const revision = f.repository.revision;
    expect((await enqueue(f, op)).response.status).toBe(400);
    expect(f.repository.revision).toBe(revision); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it.each(['background', 'references', 'imported_parent'])('rejects changed %s on medium before reserving', async field => {
    const f = fixture(), low = operation(); low.context.references = await references(f, 2);
    expect((await enqueue(f, low)).body.execution.status).toBe('completed');
    const medium = await approvedMedium(f, low);
    if (field === 'background') medium.image!.background = 'transparent';
    if (field === 'references') medium.context.references[1].roles = ['image_style_reference'];
    if (field === 'imported_parent') medium.context.base_asset = { business_id: business, asset_id: low.context.references[1].asset_id, version_id: low.context.references[1].version_id };
    const revision = f.repository.revision, providers = f.createProvider.mock.calls.length;
    expect((await enqueue(f, medium)).body.error).toBe('unsupported_server_generation');
    expect(f.repository.revision).toBe(revision); expect(f.createProvider).toHaveBeenCalledTimes(providers); expect(f.dispatches).toBe(1);
  });
});

describe('backward-compatible public generation capabilities', () => {
  const legacy = { profile: 'flare_candidate', executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: 1 };
  it('accepts legacy capabilities and the new bounded options without granting new execution settings', () => {
    expect(isServerGenerationCapabilities(legacy)).toBe(true);
    expect(isServerGenerationCapabilities({ ...legacy, max_references: 4, supports_recreation: true })).toBe(true);
    expect(isServerGenerationCapabilities({ ...legacy, max_references: 2 })).toBe(true);
    expect(isServerGenerationCapabilities({ ...legacy, supports_recreation: false })).toBe(true);
    expect(isServerGenerationCapabilities({ ...legacy, supports_full_design: true })).toBe(true);
  });
  it.each([{ max_references: 0 }, { max_references: 5 }, { max_references: 1.5 }, { max_references: '4' },
    { max_references: undefined }, { supports_recreation: 'true' }, { supports_recreation: undefined }, { supports_full_design: 'true' }, { supports_full_design: undefined }, { permit: 'forged' }])
  ('rejects untrusted capability shape %j', extension => {
    expect(isServerGenerationCapabilities({ ...legacy, ...extension })).toBe(false);
  });
});

describe('standalone full designs without invented captures', () => {
  function freeOperation(document_type: 'cover' | 'page' | 'special' = 'cover', executor: 'image_api' | 'responses_image' = 'responses_image') {
    const op = operation(`free-${document_type}`), destination = { document_type, page_id: 'page-1' };
    op.context.workspace = 'free_design'; op.context.brand_id = 'free_design';
    op.context.target = designSurfaceTarget('deck', { id: 'page-1', revision: 1 }, destination);
    op.context.session_id = designSurfaceSessionId('deck', 'page-1', 'full_design', destination);
    op.context.immutable_elements = fullDesignImmutables('Portada aprobada\nTexto exacto', { width: 1024, height: 1024 });
    op.image!.executor = executor; return op;
  }
  it.each(['image_api', 'responses_image'] as const)('runs %s through its actual adapter with zero inputs, one claim and no upload', async executor => {
    const f = fixture({ executor }), op = freeOperation('cover', executor), canvas = { width: 800, height: 450 };
    op.context.immutable_elements = fullDesignImmutables('Portada aprobada\nTexto exacto', canvas); op.image!.size = fullDesignImageSize(canvas);
    const bytes = b64(png(1536, 864)), transport = vi.fn<typeof fetch>(async () => new Response(JSON.stringify(executor === 'image_api'
      ? { data: [{ b64_json: bytes }] }
      : { id: 'resp_free', status: 'completed', error: null, incomplete_details: null,
        output: [{ id: 'ig_free', type: 'image_generation_call', status: 'completed', result: bytes }] }), { status: 200 }));
    f.createProvider.mockImplementation(() => createLiveImageProvider({ apiKey: 'local-test-only', responsesModel: PILOT_LIMITS.responsesModel, fetch: transport }));
    expect((await enqueue(f, op)).body.execution.status).toBe('completed'); expect(transport).toHaveBeenCalledTimes(1);
    const [url, input] = transport.mock.calls[0], body = JSON.parse(input!.body as string);
    expect(url).toBe(`https://api.openai.com${executor === 'image_api' ? '/v1/images/generations' : '/v1/responses'}`);
    if (executor === 'image_api') expect(body).toMatchObject({ model: 'gpt-image-2.5-flare', n: 1, size: '1536x864', quality: 'low' });
    else {
      expect(body.input[0].content).toHaveLength(1); expect(body.input[0].content[0].type).toBe('input_text');
      expect(body).toMatchObject({ max_tool_calls: 1, tools: [{ action: 'generate', size: '1536x864', quality: 'low' }] });
    }
    expect(f.storage.get).not.toHaveBeenCalled();
    expect(f.repository.snapshot!.assets.versions.every(version => version.provenance.kind === 'image_operation')).toBe(true);
    expect((await enqueue(f, op)).body.reused).toBe(true); await send(f, { kind: 'recover' }); expect(transport).toHaveBeenCalledTimes(1);
    expect(getQuotaUsage(f.repository.snapshot!.jobs)).toEqual({ committed_micro_usd: 1000000, image_outputs: 1, unsettled_calls: 1 });
    expect(f.repository.policy).toEqual(policy);
  });
  it.each(['cover', 'page', 'special'] as const)('promotes an approved %s with exact page/copy/parent and rejects another destination', async document_type => {
    const f = fixture(), low = freeOperation(document_type);
    expect((await enqueue(f, low)).body.execution.status).toBe('completed');
    const medium = await approvedMedium(f, low), altered = structuredClone(medium), revision = f.repository.revision;
    altered.context.target.page_id = 'page-2';
    altered.context.session_id = designSurfaceSessionId('deck', 'page-2', 'full_design', { document_type, page_id: 'page-2' });
    expect((await enqueue(f, altered)).body.error).toBe('unsupported_server_generation'); expect(f.repository.revision).toBe(revision);
    expect((await enqueue(f, medium)).body.execution.status).toBe('completed');
    const state = f.repository.snapshot!, saved = state.jobs.jobs[1].plan.operation;
    expect(saved.context.target).toEqual(low.context.target); expect(saved.context.references).toEqual([]);
    expect(saved.context.immutable_elements).toEqual(low.context.immutable_elements); expect(saved.context.placement).toBeUndefined();
    const asset = state.jobs.jobs[1].calls[0].receipt!.outputs[0].asset;
    expect(state.assets.versions.find(version => version.identity.version_id === asset.version_id)?.provenance)
      .toMatchObject({ kind: 'image_operation', action: 'generate_medium', parent: medium.context.base_asset });
    expect(f.generate).toHaveBeenCalledTimes(2); expect(getQuotaUsage(state.jobs).committed_micro_usd).toBe(2000000);
    expect(f.repository.policy).toEqual(policy);
  });
  it('accepts a real optional style reference without declaring it a canvas capture', async () => {
    const f = fixture(), op = freeOperation('special'); op.context.references = await references(f, 1);
    op.context.references[0].roles = ['image_style_reference'];
    expect((await enqueue(f, op)).body.execution.status).toBe('completed');
    expect(f.generate.mock.calls[0][0].operation.context.references).toEqual(op.context.references);
    expect(f.generate.mock.calls[0][0].operation.context.placement).toBeUndefined();
  });
  it.each(['missing_page', 'fake_slide', 'wrong_workspace', 'wrong_session', 'partial_placement'] as const)
  ('rejects invalid full-design %s before any reservation', async change => {
    const f = fixture(), op = freeOperation();
    if (change === 'missing_page') delete op.context.target.page_id;
    if (change === 'fake_slide') op.context.target.slide_id = 'fake';
    if (change === 'wrong_workspace') op.context.workspace = 'onboarding';
    if (change === 'wrong_session') op.context.session_id = 'presentation:deck:page-1:full_design';
    if (change === 'partial_placement') op.context.placement = { capture_reference_id: 'not-a-capture', document_revision: '1',
      canvas: { width: 1024, height: 1024 }, region: { x: 0, y: 0, width: 100, height: 100, units: 'px' } };
    expect((await enqueue(f, op)).response.status).toBe(400);
    expect(f.repository.commit).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
});

describe('brand onboarding reuses both image adapters without changing the pilot', () => {
  function brandOperation(executor: 'image_api' | 'responses_image') {
    const op = operation('brand-direction');
    const destination = { workspace: 'onboarding' as const, document_type: 'special' as const, page_id: 'brand-page', brand_id: business, brief_hash: 'a'.repeat(64) };
    op.context.workspace = 'onboarding'; op.context.brand_id = business; op.context.project_id = 'brand-draft';
    op.context.target = designSurfaceTarget('brand-draft', { id: 'brand-page', revision: 2 }, destination);
    op.context.session_id = designSurfaceSessionId('brand-draft', 'brand-page', 'full_design', destination);
    op.context.immutable_elements = fullDesignImmutables('Marca Verde', { width: 1600, height: 900 }, destination);
    op.image!.size = { width: 1536, height: 864 }; op.image!.executor = executor;
    return op;
  }
  it.each(['image_api', 'responses_image'] as const)('admits %s low and explicit medium with exact brand/draft/hash and no capture', async executor => {
    const f = fixture({ executor }), op = brandOperation(executor);
    let calls = 0;
    const transport = vi.fn<typeof fetch>(async () => {
      calls++; const bytes = b64(png(1536, 864, calls * 30));
      return new Response(JSON.stringify(executor === 'image_api' ? { data: [{ b64_json: bytes }] }
        : { id: `resp_brand_${calls}`, status: 'completed', error: null, incomplete_details: null,
          output: [{ id: `image_brand_${calls}`, type: 'image_generation_call', status: 'completed', result: bytes }] }));
    });
    f.createProvider.mockImplementation(() => createLiveImageProvider({ apiKey: 'local-test-only', responsesModel: PILOT_LIMITS.responsesModel, fetch: transport }));
    expect((await enqueue(f, op)).body.execution.status).toBe('completed');
    expect(f.storage.get).not.toHaveBeenCalled();
    const medium = await approvedMedium(f, op);
    expect(transport).toHaveBeenCalledTimes(1);
    expect((await enqueue(f, medium)).body.execution.status).toBe('completed');
    expect((await enqueue(f, medium)).body.reused).toBe(true);
    expect(transport).toHaveBeenCalledTimes(2);
    const state = f.repository.snapshot!, stored = state.jobs.jobs[1].plan.operation;
    expect(stored.context.target).toEqual(op.context.target); expect(stored.context.target.slide_id).toBeUndefined();
    expect(stored.context.immutable_elements).toEqual(op.context.immutable_elements);
    expect(stored.context.references).toEqual([]); expect(stored.context.placement).toBeUndefined();
    expect(state.jobs.jobs[1].calls[0].state).toBe('needs_review');
    expect(getQuotaUsage(state.jobs).image_outputs).toBe(2); expect(f.repository.policy).toEqual(policy);
  });
  it.each(['no_full_marker', 'hash_missing', 'hash_duplicate', 'brand', 'project', 'workspace', 'page', 'slide'] as const)
  ('rejects altered brand context %s before any reservation or provider initialization', async change => {
    const f = fixture(), op = brandOperation('responses_image');
    if (change === 'no_full_marker') op.context.immutable_elements = [];
    if (change === 'hash_missing') op.context.immutable_elements.pop();
    if (change === 'hash_duplicate') op.context.immutable_elements.push(op.context.immutable_elements.at(-1)!);
    if (change === 'brand') op.context.brand_id = 'presentation';
    if (change === 'project') op.context.project_id = 'other';
    if (change === 'workspace') op.context.workspace = 'free_design';
    if (change === 'page') op.context.target.page_id = 'other';
    if (change === 'slide') op.context.target.slide_id = 'invented';
    expect((await enqueue(f, op)).response.status).toBe(400);
    expect(f.repository.commit).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
});

describe('authenticated complete presentation images', () => {
  async function fullOperation(f: ReturnType<typeof fixture>, canvas = { width: 800, height: 450 }) {
    const op = operation('full-design'); op.context.session_id = presentationDesignSessionId('deck', 'slide', 'full_design');
    op.context.immutable_elements = fullDesignImmutables('Título aprobado\nTexto exacto', canvas);
    op.context.references = await references(f, 1);
    op.context.placement = { capture_reference_id: op.context.references[0].reference_id, document_revision: '1',
      canvas, region: { x: 0, y: 0, ...canvas, units: 'px' } };
    op.image!.size = fullDesignImageSize(canvas);
    f.generate.mockImplementation(async input => {
      await input.beforeDispatch?.();
      return { result: normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 1,
        body: { data: [{ b64_json: b64(png(input.operation.image!.size.width, input.operation.image!.size.height, input.operation.image!.quality === 'medium' ? 140 : 80)) }] } }),
        effective_prompt: input.operation.context.instruction, input_manifest: [] };
    });
    return op;
  }
  it.each([{ width: 800, height: 450 }, { width: 850, height: 1100 }, { width: 1080, height: 1080 }])
  ('admits one low plus explicitly approved medium at %j and reserves the existing budget', async canvas => {
    const f = fixture(), op = await fullOperation(f, canvas);
    expect((await enqueue(f, op)).response.status).toBe(200);
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].state).toBe('needs_review');
    const medium = await approvedMedium(f, op);
    expect((await enqueue(f, medium)).response.status).toBe(200);
    const state = f.repository.snapshot!;
    expect(state.jobs.jobs).toHaveLength(2); expect(state.jobs.jobs[1].calls[0].state).toBe('needs_review');
    expect(f.generate).toHaveBeenCalledTimes(2);
    expect(getQuotaUsage(state.jobs).image_outputs).toBe(2);
    expect(state.jobs.jobs.every(job => job.calls[0].reserved_micro_usd === policy.reservation_per_output_micro_usd)).toBe(true);
    const receipt = state.jobs.jobs[1].calls[0].receipt!.outputs[0].asset;
    expect(state.assets.versions.find(item => item.identity.version_id === receipt.version_id)?.storage).toMatchObject(fullDesignImageSize(canvas));
  });
  it.each(['missing_copy', 'wrong_session', 'partial_canvas', 'wrong_size'] as const)('rejects %s before image dispatch', async change => {
    const f = fixture(), op = await fullOperation(f);
    if (change === 'missing_copy') op.context.immutable_elements = op.context.immutable_elements.slice(0, 1);
    if (change === 'wrong_session') op.context.session_id = 'presentation:deck:slide';
    if (change === 'partial_canvas') op.context.placement!.region.width = 100;
    if (change === 'wrong_size') op.image!.size = { width: 1024, height: 1024 };
    const revision = f.repository.revision;
    expect((await enqueue(f, op)).response.status).toBe(400);
    expect(f.generate).not.toHaveBeenCalled(); expect(f.repository.revision).toBe(revision);
  });
});

describe('authenticated production images keep real pixel lineage and explicit approvals', () => {
  const documentId = 'production-snapshot', sourceHash = 'a'.repeat(64), copyVersion = 'b'.repeat(64);
  async function productionOperation(f: ReturnType<typeof fixture>, action: 'edit_image' | 'regenerate_image' = 'edit_image') {
    const imported = await f.generation.import(actor, { ...importInput, brandId: business, projectId: documentId }, png(1024,1024,30));
    const base = imported.version as RegisteredAssetVersion, op = operation(`production:${action}`);
    const destination = {workspace:'production' as const,document_type:'image' as const,brand_id:business,source_hash:sourceHash,action};
    op.action=action; op.context={...op.context,workspace:'production',brand_id:business,project_id:documentId,
      session_id:`production:${documentId}:${action}`,target:{document_type:'image',document_id:documentId,revision:'1'},
      instruction:'Cambiar el fondo y conservar el objeto.',copy_version_id:copyVersion,
      immutable_elements:fullDesignImmutables('',{width:1024,height:1024},destination),references:[],
      ...(action==='edit_image'?{base_asset:base.identity}:{})};
    return {op,base,destination};
  }
  it.each(['image_api','responses_image'] as const)('executes a direct pixel edit with %s and approves/reuses its one low output without another render', async executor => {
    const validate=vi.fn<NonNullable<ServerGenerationDependencies['validateProduction']>>(async()=>{}),f=fixture({executor},validate),{op,base,destination}=await productionOperation(f); op.image!.executor=executor;
    const transport=vi.fn<typeof fetch>(async(_url,init)=>{
      if(executor==='image_api') { const body=init!.body as FormData,files=[...body.getAll('image'),...body.getAll('image[]')]; expect(files).toHaveLength(1);
        expect(new Uint8Array(await (files[0] as Blob).arrayBuffer())).toEqual(f.objects.get(base.storage.storage_key)); }
      else { const body=JSON.parse(String(init!.body)); const images=body.input.flatMap((item:{content:unknown[]})=>item.content).filter((item:{type:string})=>item.type==='input_image');
        expect(images).toHaveLength(1); expect(images[0].image_url).toBe(`data:image/png;base64,${b64(f.objects.get(base.storage.storage_key)!)}`); }
      return new Response(JSON.stringify(executor==='image_api'?{data:[{b64_json:b64(image)}]}:{id:'resp_direct',status:'completed',error:null,incomplete_details:null,
        output:[{id:'img_direct',type:'image_generation_call',status:'completed',result:b64(image)}]}));
    });
    f.createProvider.mockImplementation(()=>createLiveImageProvider({apiKey:'fake-only',responsesModel:PILOT_LIMITS.responsesModel,fetch:transport}));
    expect((await enqueue(f,op)).response.status).toBe(200);
    let state=f.repository.snapshot!,job=state.jobs.jobs[0],call=job.calls[0]; expect(call.state).toBe('needs_review');
    const output=state.assets.versions.find(v=>v.identity.version_id===call.receipt!.outputs[0].asset.version_id)!;
    expect(output.provenance).toMatchObject({action:'edit_image',parent:base.identity,quality:'low'});
    expect(output.provenance).not.toHaveProperty('direction_approval_id');
    const selection={businessId:business,actorId:actor,documentId,surface:{id:documentId,revision:1},destination,asset:output.identity,copyVersion};
    expect(()=>reviewedProductionResult(state,selection)).toThrow('unapproved_asset');
    expect((await send(f,{kind:'review',operation_key:op.operation_key,call_key:call.call_key,decision:'approved'})).response.status).toBe(200);
    state=f.repository.snapshot!; expect(reviewedProductionResult(state,selection).approvedCopy).toBe('');
    expect(transport).toHaveBeenCalledTimes(1);
    expect(validate.mock.calls.map(call=>call[2])).toEqual(['admit','admit','dispatch','dispatch']);
    expect(()=>reviewedProductionResult(state,{...selection,copyVersion:'c'.repeat(64)})).toThrow('production_source_changed');
    expect(()=>reviewedProductionResult(state,{...selection,actorId:foreign})).toThrow('production_source_changed');
    expect((await enqueue(f,op)).body.reused).toBe(true); expect(transport).toHaveBeenCalledTimes(1);
  });
  it('regenerates from text with zero implicit base inputs and preserves staged exploration through medium', async()=>{
    const f=fixture({},async()=>{}),{op,base}=await productionOperation(f,'regenerate_image'); op.context.interaction_mode='explore_design';
    expect((await enqueue(f,op)).response.status).toBe(200); expect(f.generate.mock.calls[0][0].operation.context.base_asset).toBeUndefined();
    expect(f.generate.mock.calls[0][0].operation.context.references).toEqual([]);
    const medium=await approvedMedium(f,op); expect(f.generate).toHaveBeenCalledTimes(1);
    expect((await enqueue(f,medium)).response.status).toBe(200);
    expect(f.repository.snapshot!.jobs.jobs[1].calls[0].state).toBe('needs_review'); expect(f.generate).toHaveBeenCalledTimes(2);
    expect(f.generate.mock.calls[1][0].operation.context.base_asset).not.toEqual(base.identity);
    expect(getQuotaUsage(f.repository.snapshot!.jobs).image_outputs).toBe(2);
  });
  it('fails closed without durable validation and rechecks changed sources immediately before provider dispatch',async()=>{
    const unavailable=fixture(),a=await productionOperation(unavailable);
    expect((await enqueue(unavailable,a.op)).response.status).toBe(503);expect(unavailable.createProvider).not.toHaveBeenCalled();
    let changed=false;const validate=vi.fn(async()=>{if(changed)throw Error('production_source_changed');});
    const f=fixture({},validate),b=await productionOperation(f);f.beforeDispatch(()=>{changed=true;});
    await enqueue(f,b.op);expect(f.dispatches).toBe(0);expect(f.repository.snapshot!.jobs.jobs[0].calls[0].receipt?.outputs??[]).toEqual([]);
    expect(f.repository.snapshot!.assets.versions).toHaveLength(1);
  });
});
