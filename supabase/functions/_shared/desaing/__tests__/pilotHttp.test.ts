import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { authenticatePilotToken, checkPilotModels, createPilotHandler, PILOT_LIMITS, type PilotConfig, type PilotDependencies } from '../pilotHttp.ts';
import type { AssetVersion, DesignOperation } from '../contracts.ts';
import type { ServerPolicy, ServerSnapshot } from '../serverState.ts';
import type { ServerRepository, ServerRead, BusinessRole } from '../serverRepository.ts';
import type { LiveWorkerProvider } from '../serverWorker.ts';
import { normalizeImageResponse, normalizeImageTransportFailure } from '../imageResponse.ts';
import { getQuotaUsage } from '../jobLedger.ts';
import { createLiveImageProvider } from '../liveImageProvider.ts';

const business = '60000000-0000-4000-8000-000000000001', actor = '60000000-0000-4000-8000-000000000002';
const foreign = '60000000-0000-4000-8000-000000000099', uploadId = '60000000-0000-4000-8000-000000000003';
const token = 'dedicated-private-pilot-token-at-least-32';
const config: PilotConfig = { enabled: true, token, businessId: business, actorId: actor, policyId: 'pilot-test-policy',
  expectedSupabaseOrigin: 'https://project.supabase.co', actualSupabaseOrigin: 'https://project.supabase.co', expiresAt: 100000 };
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: config.policyId, limit_micro_usd: 5000000,
  reservation_per_output_micro_usd: 1000000, max_image_outputs: 4, enabled_image_profiles: ['flare_candidate'], responses_image_enabled: true };
function operation(key = 'pilot-low-1'): DesignOperation {
  return { operation_key: key, action: 'generate_image', context: { actor_id: actor, business_id: business, brand_id: 'brand',
    project_id: 'project', session_id: 'session', workspace: 'presentations', interaction_mode: 'execute_change',
    target: { document_type: 'presentation', document_id: 'deck', slide_id: 'cover', revision: '1' },
    instruction: 'Un avión como pieza independiente.', immutable_elements: ['Conservar texto HTML.'], references: [] },
  image: { profile: 'flare_candidate', quality: 'low', size: { width: 1024, height: 1024 }, output_format: 'png',
    background: 'opaque', output_count: 1, executor: 'image_api' } };
}
function png(width: number, height: number, color = 120): Uint8Array<ArrayBuffer> {
  const chunk = (type: string, content: Uint8Array) => {
    const bytes = new Uint8Array(content.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, content.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(content, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, bytes.length - 4)) { crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1; }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0); return bytes;
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer); view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const stride = width * 4 + 1, raw = new Uint8Array(stride * height).fill(color);
  for (let offset = 0; offset < raw.length; offset += stride) raw[offset] = 0;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND', new Uint8Array())];
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0)); let offset = 0;
  for (const part of parts) { output.set(part, offset); offset += part.length; } return output;
}
const generatedPng = png(1024, 1024), mediumPng = png(1024, 1024, 180), referencePng = png(2, 2);
const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

class Repository implements ServerRepository {
  policy = structuredClone(policy); role: BusinessRole = 'owner'; revision = 0; snapshot: ServerSnapshot | null = null;
  failAfterEnqueue = false;
  read = vi.fn(async (businessId: string, actorId: string): Promise<ServerRead> => {
    if (businessId !== business || actorId !== actor) throw Error('Unexpected unpinned identity');
    return { policy: structuredClone(this.policy), role: this.role, state: { revision: this.revision, snapshot: structuredClone(this.snapshot) } };
  });
  commit = vi.fn(async (input: Parameters<ServerRepository['commit']>[0]) => {
    if (input.expectedRevision !== this.revision) return { committed: false, revision: this.revision };
    this.snapshot = structuredClone(input.snapshot); this.revision++;
    if (this.failAfterEnqueue && input.event === 'job_enqueued') { this.failAfterEnqueue = false; throw Error(`Ambiguous database ${token}`); }
    return { committed: true, revision: this.revision };
  });
}
function fixture(overrides: Partial<PilotConfig> = {}) {
  const repository = new Repository(), objects = new Map<string, Uint8Array>();
  let at = 1000;
  const storage = {
    get: vi.fn(async (key: string) => { const bytes = objects.get(key); if (!bytes) throw Error('Missing private object'); return bytes.slice(); }),
    putImmutable: vi.fn(async (key: string, bytes: Uint8Array) => { const old = objects.get(key);
      if (old && b64(old) !== b64(bytes)) throw Error('immutable_conflict'); objects.set(key, bytes.slice()); }),
    signedUrl: vi.fn(async () => { throw Error('Pilot must not return signed URLs'); }),
  };
  const generate = vi.fn<LiveWorkerProvider['generate']>().mockImplementation(async input => {
    await input.beforeDispatch?.();
    return { result: normalizeImageResponse({ status: 200, expected_outputs: 1, duration_ms: 10, headers: { 'x-request-id': 'req_pilot' },
      body: { data: [{ b64_json: b64(input.operation.image?.quality === 'medium' ? mediumPng : generatedPng) }],
        usage: { input_tokens: 10, output_tokens: 20, total_tokens: 30 } } }),
    effective_prompt: input.operation.context.instruction, input_manifest: [] };
  });
  const createProvider = vi.fn((): LiveWorkerProvider => ({ mode: 'live', generate }));
  const checkModels = vi.fn<PilotDependencies['checkModels']>().mockResolvedValue({ checked: true, image_model_available: true, responses_model_available: true, error: null });
  const handler = createPilotHandler({ ...config, ...overrides }, { repository, storage, createProvider, checkModels, now: () => at });
  return { handler, repository, storage, objects, generate, createProvider, checkModels, setTime(value: number) { at = value; } };
}
function request(body: unknown, options: { authorization?: string | null; origin?: string; method?: string } = {}) {
  const method = options.method ?? 'POST';
  return new Request('https://project.supabase.co/functions/v1/desaing-pilot', { method, headers: { 'Content-Type': 'application/json',
    ...(options.authorization === null ? {} : { Authorization: options.authorization ?? `Bearer ${token}` }), ...(options.origin ? { Origin: options.origin } : {}) },
  ...(method === 'POST' ? { body: JSON.stringify(body) } : {}) });
}
const importBody = (bytes = referencePng) => ({ action: 'import', upload_id: uploadId, brand_id: 'brand', project_id: 'project', b64_json: b64(bytes) });
async function execute(f: ReturnType<typeof fixture>, op = operation()) {
  const response = await f.handler(request({ action: 'execute', operation: op }));
  return { response, body: await response.json() };
}

describe('administrative pilot authentication, configuration and scope', () => {
  it('is disabled by default and performs no repository/storage/provider calls', async () => {
    const f = fixture({ enabled: false, token: '' });
    expect(await (await f.handler(request({ action: 'status' }))).json()).toEqual({ error: 'pilot_disabled' });
    expect(f.repository.read).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
  });
  it.each([null, 'Bearer ordinary-user-jwt', 'Bearer service-role-is-not-the-pilot-token', `Bearer ${token}x`])('rejects wrong credentials before I/O', async authorization => {
    const f = fixture(), response = await f.handler(request({ action: 'status' }, { authorization }));
    expect(response.status).toBe(401); expect(f.repository.read).not.toHaveBeenCalled();
  });
  it('compares exact token bytes, including prefixes and suffixes', async () => {
    expect(await authenticatePilotToken(token, token)).toBe(true);
    expect(await authenticatePilotToken(token.slice(0, -1), token)).toBe(false);
    expect(await authenticatePilotToken(`${token}x`, token)).toBe(false);
    expect(await authenticatePilotToken('x'.repeat(8193), token)).toBe(false);
  });
  it('refuses browser Origins and non-POST requests without CORS headers', async () => {
    const f = fixture();
    const browser = await f.handler(request({ action: 'status' }, { origin: 'https://app.invalid' }));
    expect(browser.status).toBe(403); expect(browser.headers.has('access-control-allow-origin')).toBe(false);
    expect((await f.handler(request(null, { method: 'GET' }))).status).toBe(405); expect(f.repository.read).not.toHaveBeenCalled();
  });
  it.each([{ expectedSupabaseOrigin: 'https://another.supabase.co' }, { expiresAt: 0 }, { token: '' }, { actorId: 'invalid' }])
  ('rejects absent or mismatched trusted pins before any I/O', async override => {
    const f = fixture(override), response = await f.handler(request({ action: 'status' }));
    expect(response.status).toBe(503); expect(f.repository.read).not.toHaveBeenCalled();
  });
  it.each(['limit', 'reserve', 'outputs', 'profile', 'policy', 'responses', 'role'])('rejects altered %s policy or administrator membership', async field => {
    const f = fixture();
    if (field === 'limit') f.repository.policy.limit_micro_usd++;
    if (field === 'reserve') f.repository.policy.reservation_per_output_micro_usd--;
    if (field === 'outputs') f.repository.policy.max_image_outputs++;
    if (field === 'profile') f.repository.policy.enabled_image_profiles = [];
    if (field === 'policy') f.repository.policy.policy_id = 'changed';
    if (field === 'responses') f.repository.policy.responses_image_enabled = false;
    if (field === 'role') f.repository.role = 'editor';
    expect((await f.handler(request({ action: 'status' }))).status).toBe(field === 'role' ? 403 : 409);
    expect(f.createProvider).not.toHaveBeenCalled();
  });
  it('only lists model access when explicitly requested and never generates during status', async () => {
    const f = fixture();
    const status = await (await f.handler(request({ action: 'status' }))).json();
    expect(status.limits).toEqual(PILOT_LIMITS); expect(status).not.toHaveProperty('models');
    expect(f.checkModels).not.toHaveBeenCalled(); expect(f.createProvider).not.toHaveBeenCalled();
    const checked = await (await f.handler(request({ action: 'status', check_models: true }))).json();
    expect(checked.models.image_model_available).toBe(true); expect(f.checkModels).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(checked)).not.toContain(token); expect(f.repository.commit).not.toHaveBeenCalled();
  });
  it('keeps status readable after expiry but blocks new generation and upload', async () => {
    const f = fixture(); f.setTime(config.expiresAt);
    expect((await (await f.handler(request({ action: 'status' }))).json()).expired).toBe(true);
    expect((await execute(f)).response.status).toBe(403);
    expect((await f.handler(request(importBody()))).status).toBe(403);
    expect(f.createProvider).not.toHaveBeenCalled(); expect(f.storage.putImmutable).not.toHaveBeenCalled();
  });
});

describe('pilot assets and bounded paid operation admission', () => {
  it.each(['image_api', 'responses_image'] as const)('admits a registered capture with reference roles and placement through %s using a stubbed provider', async executor => {
    const f = fixture(), capture = png(800, 450);
    const imported = await (await f.handler(request(importBody(capture)))).json();
    const op = operation(`reference-placement-${executor}`); op.image!.executor = executor;
    op.context.target.document_type = 'cover';
    op.context.references = [{ ...imported.version.identity, reference_id: 'pilot-cover-capture', mime_type: 'image/png',
      roles: ['target_render', 'placement_context', 'image_style_reference'] }];
    op.context.placement = { capture_reference_id: 'pilot-cover-capture', document_revision: '1',
      canvas: { width: 800, height: 450 }, region: { x: 430, y: 100, width: 330, height: 300, units: 'px' } };
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(JSON.stringify(executor === 'image_api'
      ? { data: [{ b64_json: b64(generatedPng) }] }
      : { id: 'resp_capture', status: 'completed', output: [{ id: 'ig_capture', type: 'image_generation_call', status: 'completed', result: b64(generatedPng) }] }),
    { headers: { 'x-request-id': 'req_capture' } }));
    f.createProvider.mockReturnValue(createLiveImageProvider({ apiKey: 'sk-stub-no-network', responsesModel: PILOT_LIMITS.responsesModel, fetch }));
    const result = await execute(f, op);
    expect(result.response.status).toBe(200); expect(result.body.execution.status).toBe('completed');
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(f.repository.snapshot!.jobs.jobs[0].plan.operation.context.references).toEqual(op.context.references);
    expect(f.repository.snapshot!.jobs.jobs[0].plan.operation.context.placement).toEqual(op.context.placement);
    expect(f.storage.get).toHaveBeenCalledWith(imported.version.storage.storage_key);
    const wire = fetch.mock.calls[0][1]!.body;
    if (executor === 'image_api') {
      expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/images/edits');
      expect(b64(new Uint8Array(await ((wire as FormData).get('image') as Blob).arrayBuffer()))).toBe(b64(capture));
      expect((wire as FormData).get('prompt')).toContain('región x=430');
    } else {
      expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/responses');
      expect(JSON.parse(wire as string).input[0].content[1].image_url).toBe(`data:image/png;base64,${b64(capture)}`);
      expect(JSON.parse(wire as string).input[0].content[0].text).toContain('región x=430');
    }
  });

  it('imports valid raster bytes idempotently and returns bytes only on explicit registered read_asset', async () => {
    const f = fixture();
    const imported = await (await f.handler(request(importBody()))).json();
    expect(imported.version.identity.business_id).toBe(business); expect(imported).not.toHaveProperty('b64_json');
    expect((await f.handler(request(importBody()))).status).toBe(200); expect(f.storage.putImmutable).toHaveBeenCalledTimes(1);
    const read = await (await f.handler(request({ action: 'read_asset', asset: imported.version.identity }))).json();
    expect(read.b64_json).toBe(b64(referencePng)); expect(f.storage.signedUrl).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled();
    f.objects.set(imported.version.storage.storage_key, png(2, 2, 125));
    expect((await f.handler(request({ action: 'read_asset', asset: imported.version.identity }))).status).toBe(400);
  });
  it('does not read an unregistered or foreign asset, or accept references above 1024 pixels', async () => {
    const f = fixture(), identity = { business_id: business, asset_id: 'missing', version_id: '0'.repeat(64) };
    expect((await f.handler(request({ action: 'read_asset', asset: identity }))).status).toBe(400);
    expect((await f.handler(request({ action: 'read_asset', asset: { ...identity, business_id: foreign } }))).status).toBe(403);
    expect((await f.handler(request(importBody(png(1025, 1))))).status).toBe(400);
    expect(f.storage.get).not.toHaveBeenCalled(); expect(f.storage.putImmutable).not.toHaveBeenCalled();
  });
  it.each(['actor', 'business', 'sunburst', 'baseline', 'high', 'count', 'size', 'combined_medium', 'brief', 'constraints', 'references'])
  ('rejects outside-pilot %s input before any claim or generation', async field => {
    const f = fixture(), op = operation();
    if (field === 'actor') op.context.actor_id = foreign;
    if (field === 'business') op.context.business_id = foreign;
    if (field === 'sunburst') op.image!.profile = 'sunburst_rescue';
    if (field === 'baseline') op.image!.profile = 'baseline';
    if (field === 'high') op.image!.quality = 'high';
    if (field === 'count') op.image!.output_count = 2;
    if (field === 'size') op.image!.size.width = 2048;
    if (field === 'combined_medium') op.action = 'approve_and_generate_medium';
    if (field === 'brief') op.context.instruction = 'é'.repeat(2001);
    if (field === 'constraints') op.context.immutable_elements = ['x'.repeat(4000)];
    if (field === 'references') op.context.references = Array.from({ length: 3 }, (_, i) => ({ business_id: business, asset_id: `ref${i}`, version_id: 'v1',
      reference_id: `r${i}`, mime_type: 'image/png', roles: ['target_render'] }));
    expect((await execute(f, op)).response.status).toBeGreaterThanOrEqual(400);
    expect(f.repository.commit).not.toHaveBeenCalled(); expect(f.generate).not.toHaveBeenCalled();
  });
  it('records one render after durable claim and never sends a duplicate for explicit operation replay', async () => {
    const f = fixture(), first = await execute(f);
    expect(first.response.status).toBe(200); expect(first.body.execution.status).toBe('completed');
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].state).toBe('needs_review');
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].settlement).toBeNull();
    expect(getQuotaUsage(f.repository.snapshot!.jobs).committed_micro_usd).toBe(1000000);
    expect((await execute(f)).body.execution.status).toBe('already_started');
    expect(f.generate).toHaveBeenCalledTimes(1); expect(f.createProvider).toHaveBeenCalledTimes(1);
    const changed = operation(); changed.context.instruction = 'Different instruction';
    expect((await execute(f, changed)).response.status).toBe(409); expect(f.generate).toHaveBeenCalledTimes(1);
  });
  it('keeps an ambiguous enqueue attempt pending without automatic execution; explicit same-key replay can continue before any claim', async () => {
    const f = fixture(); f.repository.failAfterEnqueue = true;
    const first = await execute(f); expect(first.response.status).toBe(503); expect(JSON.stringify(first.body)).not.toContain(token);
    expect(f.generate).not.toHaveBeenCalled(); expect(f.repository.snapshot!.jobs.jobs[0].calls[0].attempt).toBeNull();
    expect((await execute(f)).body.execution.status).toBe('completed'); expect(f.generate).toHaveBeenCalledTimes(1);
  });
  it.each(['failed', 'uncertain'] as const)('blocks new renders after a %s result but permits read-only same-key replay', async status => {
    const f = fixture();
    f.generate.mockImplementationOnce(async input => { await input.beforeDispatch?.(); return { result: {
      ...normalizeImageTransportFailure({ kind: 'network', request_sent: status === 'uncertain', duration_ms: 10 }), status },
    effective_prompt: input.operation.context.instruction, input_manifest: [] }; });
    expect((await execute(f)).body.execution.status).toBe('uncertain');
    expect(f.repository.snapshot!.jobs.jobs[0].calls[0].state).toBe(status);
    expect((await execute(f, operation('new-after-failure'))).body.error).toBe('pilot_previous_operation_unresolved');
    expect((await execute(f)).body.execution.status).toBe('already_started'); expect(f.generate).toHaveBeenCalledTimes(1);
  });
  it('caps four successful unsettled calls and keeps all reservation estimates without automatic zero settlement', async () => {
    const f = fixture();
    for (let i = 0; i < 4; i++) expect((await execute(f, operation(`low-${i}`))).body.execution.status).toBe('completed');
    expect((await execute(f, operation('low-5'))).response.status).toBe(429);
    expect(f.generate).toHaveBeenCalledTimes(4);
    expect(getQuotaUsage(f.repository.snapshot!.jobs)).toEqual({ committed_micro_usd: 4000000, image_outputs: 4, unsettled_calls: 4 });
  });
  it('persists direction and final review separately; medium requires the exact saved approval and remains unapproved', async () => {
    const f = fixture(), low = (await execute(f)).body;
    const identity: AssetVersion = low.execution.asset, candidate = { ...identity, candidate_id: 'chosen-direction' };
    const op = operation('pilot-medium'); op.action = 'generate_medium'; op.image!.quality = 'medium'; op.context.base_asset = identity;
    op.selected_candidates = [candidate]; op.context.direction_approval = { candidate, immutable_elements: [...op.context.immutable_elements] };
    expect((await execute(f, op)).response.status).toBe(400); expect(f.generate).toHaveBeenCalledTimes(1);
    const approval = { approval_id: 'chosen-approval', actor_id: actor, candidate, immutable_elements: [...op.context.immutable_elements] };
    expect((await f.handler(request({ action: 'approve_direction', approval }))).status).toBe(200);
    expect(f.generate).toHaveBeenCalledTimes(1);
    const lowCall = f.repository.snapshot!.jobs.jobs[0].calls[0];
    expect((await f.handler(request({ action: 'review', operation_key: operation().operation_key, call_key: lowCall.call_key, decision: 'approved' }))).status).toBe(200);
    const result = await execute(f, op);
    expect(result.body.execution.status).toBe('completed'); expect(result.body.execution.asset.asset_id).toBe(identity.asset_id);
    expect(result.body.execution.asset.version_id).not.toBe(identity.version_id);
    expect(f.repository.snapshot!.jobs.jobs[1].calls[0].state).toBe('needs_review');
    expect(f.generate).toHaveBeenCalledTimes(2);
  });
});

describe('explicit non-generation model access check', () => {
  it('sends one GET to the fixed models endpoint and returns only availability booleans', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(JSON.stringify({ data: [
      { id: PILOT_LIMITS.imageModel, sensitive_extra: token }, { id: PILOT_LIMITS.responsesModel }] })));
    expect(await checkPilotModels('sk-model-access-fixture', fetch)).toEqual({ checked: true, image_model_available: true, responses_model_available: true, error: null });
    expect(fetch).toHaveBeenCalledTimes(1); expect(fetch.mock.calls[0][0]).toBe('https://api.openai.com/v1/models');
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: 'GET', credentials: 'omit', redirect: 'error', headers: { Authorization: 'Bearer sk-model-access-fixture' } });
  });
  it('uses fixed errors with no retries, no model fallback and no leaked response content', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValueOnce(new Response(token, { status: 401 }));
    const result = await checkPilotModels('sk-model-access-fixture', fetch);
    expect(result).toMatchObject({ error: 'pilot_model_access_unavailable', image_model_available: null });
    expect(JSON.stringify(result)).not.toContain(token); expect(fetch).toHaveBeenCalledTimes(1);
  });
});
