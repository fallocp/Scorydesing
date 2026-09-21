import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  createDesignServerClient, DesignServerClientError, isExplorationAdmissionRefusal, type PublicServerCommand,
} from '../serverClient';
import { createServerSnapshot, type ServerPolicy } from '../../../../supabase/functions/_shared/desaing/serverState';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';
import type { ExplorationRequest, ExplorationResult } from '../../../../supabase/functions/_shared/desaing/explorationContracts';

const endpoint = 'https://design.invalid/functions/v1/desaing-server';
const business = '40000000-0000-4000-8000-000000000001';
const actor = '40000000-0000-4000-8000-000000000002';
const uploadId = '40000000-0000-4000-8000-000000000003';
const other = '40000000-0000-4000-8000-000000000099';
const token = 'session-token-never-persist';
const publicKey = 'public-anon-key';
const identity = { business_id: business, asset_id: uploadId, version_id: 'version-1' };
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'client-policy', limit_micro_usd: 100,
  max_image_outputs: 1, reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
const readReply = () => ({ revision: 1, state: createServerSnapshot(business, policy), enabled: true });
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
function operation(): DesignOperation {
  return { operation_key: 'client-operation-once', action: 'generate_image', context: { actor_id: actor, business_id: business,
    brand_id: 'brand', project_id: 'project', session_id: 'session', workspace: 'presentations', interaction_mode: 'execute_change',
    target: { document_type: 'presentation', document_id: 'deck', slide_id: 'slide', revision: 'r1' },
    instruction: 'Un avión para la portada.', immutable_elements: [], references: [],
  }, image: { profile: 'baseline', quality: 'low', output_format: 'png', background: 'opaque',
    output_count: 1, executor: 'image_api', size: { width: 1024, height: 1024 } } };
}
function fixture(customEndpoint = endpoint) {
  let active: { actorId: string; accessToken: string } | null = { actorId: actor, accessToken: token };
  const getSession = vi.fn(async () => active);
  const fetch = vi.fn<typeof globalThis.fetch>();
  const client = createDesignServerClient({ endpoint: customEndpoint, publicKey, getSession, fetch });
  return { client, getSession, fetch, setSession(value: typeof active) { active = value; } };
}
function png(): Uint8Array<ArrayBuffer> {
  function chunk(name: string, data: Uint8Array): Uint8Array<ArrayBuffer> {
    const bytes = new Uint8Array(data.length + 12), view = new DataView(bytes.buffer);
    view.setUint32(0, data.length); bytes.set(new TextEncoder().encode(name), 4); bytes.set(data, 8);
    let crc = 0xffffffff;
    for (const byte of bytes.subarray(4, bytes.length - 4)) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
    view.setUint32(bytes.length - 4, (crc ^ 0xffffffff) >>> 0);
    return bytes;
  }
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, 1); view.setUint32(4, 1); header[8] = 8; header[9] = 6;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(Uint8Array.from([0, 220, 130, 60, 255])))), chunk('IEND', new Uint8Array())];
  const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) { bytes.set(part, offset); offset += part.length; }
  return bytes;
}
const upload = { businessId: business, uploadId, brandId: 'brand', projectId: 'project' };
const file = () => new Blob([png()], { type: 'image/png' });
function version(input = upload): RegisteredAssetVersion {
  return { identity: { business_id: input.businessId, asset_id: input.uploadId, version_id: 'content-hash' },
    brand_id: input.brandId, project_id: input.projectId, provenance: { kind: 'imported', origin: 'upload' },
    storage: { storage_key: `${input.businessId}/uploads/${input.uploadId}.png`, mime_type: 'image/png', width: 1, height: 1, size_bytes: png().length } };
}
const signedUrl = 'https://design.invalid/storage/v1/object/sign/desaing-assets/image.png?token=short-lived-token';

function explorationRequest(): ExplorationRequest {
  return { request_key: 'conversation-once', kind: 'directions', scope: 'asset_in_region',
    context: { ...operation().context, interaction_mode: 'explore_design' }, message: 'Propón cinco ideas.', history: [] };
}
function explorationResult(request = explorationRequest()): ExplorationResult {
  return { request_key: request.request_key, message: 'Aquí tienes cinco direcciones.', response_id: 'response-text',
    usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 }, ideas: request.kind === 'discussion' ? [] : [1, 2, 3, 4, 5].map(index => ({
      title: `Avión ${index}`, rationale: 'Una composición con espacio para el titular.',
      aspects: { subject: `Avión ${index}`, composition: 'Centro', style: 'Editorial', palette: 'Azul' },
      render_instruction: `Dibuja un avión ${index}`, reference_ids: [],
    })) };
}

describe('authenticated exploration journal client', () => {
  it('distinguishes explicit pre-admission refusal from ambiguous dispatch failures', () => {
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_quota_exceeded', 429))).toBe(true);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('server_feature_disabled', 503))).toBe(true);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('server_session_changed'))).toBe(false);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('server_response_unknown'))).toBe(false);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('server_exploration_outcome_unknown', 503))).toBe(false);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_request_conflict', 409))).toBe(false);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_previous_unresolved', 409))).toBe(true);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_previous_unresolved', 503))).toBe(false);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_quota_exceeded', 502))).toBe(false);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_reference_invalid', 400))).toBe(true);
    expect(isExplorationAdmissionRefusal(new DesignServerClientError('exploration_reference_invalid', 502))).toBe(false);
    expect(isExplorationAdmissionRefusal({ code: 'exploration_quota_exceeded', httpStatus: 429 })).toBe(false);
  });
  it('dispatches exactly one authenticated plan with the bound business and validates all five ideas', async () => {
    const f = fixture(), request = explorationRequest(), result = explorationResult();
    f.fetch.mockResolvedValueOnce(json({ result }));
    const received = await f.client.exploration(business).plan(request);
    expect(received).toEqual(result); expect(received).not.toBe(result);
    const [url, init] = f.fetch.mock.calls[0];
    expect(url).toBe(`${endpoint}/exploration/plan`);
    expect(JSON.parse(init!.body as string)).toEqual({ business_id: business, request });
    expect(new Headers(init!.headers).get('authorization')).toBe(`Bearer ${token}`);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it.each(['business', 'actor', 'invalid'])('rejects %s request mismatches before dispatch', async field => {
    const f = fixture(), request = explorationRequest();
    if (field === 'business') request.context.business_id = other;
    if (field === 'actor') request.context.actor_id = other;
    if (field === 'invalid') request.request_key = '';
    await expect(f.client.exploration(business).plan(request)).rejects.toMatchObject({ code: field === 'actor' ? 'server_session_changed' : 'server_invalid_request' });
    expect(f.fetch).not.toHaveBeenCalled();
  });
  it.each(['count', 'key', 'extra', 'usage'])('treats malformed %s success as unknown without retrying', async field => {
    const f = fixture(), result = explorationResult();
    if (field === 'count') result.ideas.pop();
    if (field === 'key') result.request_key = 'another-request';
    if (field === 'extra') Object.assign(result, { debug: token });
    if (field === 'usage') result.usage!.total_tokens++;
    f.fetch.mockResolvedValueOnce(json({ result }));
    await expect(f.client.exploration(business).plan(explorationRequest())).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('recovers an acknowledgement lost by a previous browser instance using only the readonly endpoint', async () => {
    const f = fixture(), request = explorationRequest(), result = explorationResult();
    f.fetch.mockRejectedValueOnce(new Error('connection lost'));
    await expect(f.client.exploration(business).plan(request)).rejects.toMatchObject({ code: 'server_response_unknown' });
    f.fetch.mockResolvedValueOnce(json({ result }));
    const fresh = f.client.exploration(business);
    expect(await fresh.recover!(request.request_key, request)).toEqual(result);
    expect(f.fetch.mock.calls.map(([url]) => url)).toEqual([`${endpoint}/exploration/plan`, `${endpoint}/exploration/recover`]);
    expect(JSON.parse(f.fetch.mock.calls[1][1]!.body as string)).toEqual({ business_id: business, request_key: request.request_key });
  });
  it('never guesses a recovery request and rejects a mismatched result without dispatching another plan', async () => {
    const f = fixture(), planner = f.client.exploration(business), request = explorationRequest();
    await expect(planner.recover!(request.request_key)).rejects.toMatchObject({ code: 'server_invalid_request' });
    await expect(planner.recover!('wrong-key', request)).rejects.toMatchObject({ code: 'server_invalid_request' });
    expect(f.fetch).not.toHaveBeenCalled();
    f.fetch.mockResolvedValueOnce(json({ result: { ...explorationResult(), request_key: 'wrong-key' } }));
    await expect(planner.recover!(request.request_key, request)).rejects.toMatchObject({ code: 'server_invalid_response' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('reads empty recovery without converting it into a retry', async () => {
    const f = fixture(), request = explorationRequest(); f.fetch.mockResolvedValueOnce(json({ result: null }));
    expect(await f.client.exploration(business).recover!(request.request_key, request)).toBeNull();
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('discards a completed plan after account change', async () => {
    const f = fixture(); f.fetch.mockImplementationOnce(async () => {
      f.setSession({ actorId: other, accessToken: 'other-session' }); return json({ result: explorationResult() });
    });
    await expect(f.client.exploration(business).plan(explorationRequest())).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('reads owner-scoped history while planning is paused and binds later recoveries to its requests', async () => {
    const f = fixture(), planner = f.client.exploration(business), request = explorationRequest(), result = explorationResult();
    const attempts = [{ request, status: 'completed', result }];
    f.fetch.mockResolvedValueOnce(json({ capabilities: null })).mockResolvedValueOnce(json({ attempts })).mockResolvedValueOnce(json({ result }));
    expect(await planner.capabilities!()).toBeNull();
    expect(await planner.history!(request.context.session_id)).toEqual(attempts);
    expect(await planner.recover!(request.request_key)).toEqual(result);
    expect(f.fetch.mock.calls.map(([url]) => url)).toEqual(['capabilities', 'history', 'recover'].map(route => `${endpoint}/exploration/${route}`));
  });
  it.each(['actor', 'business', 'session', 'duplicate', 'result', 'status'])('rejects history with %s violations as a whole', async field => {
    const f = fixture(), request = explorationRequest(), result = explorationResult();
    const attempt = { request, status: 'completed', result };
    if (field === 'actor') request.context.actor_id = other;
    if (field === 'business') request.context.business_id = other;
    if (field === 'session') request.context.session_id = 'other-session';
    if (field === 'result') result.ideas.pop();
    if (field === 'status') attempt.status = 'running';
    f.fetch.mockResolvedValueOnce(json({ attempts: field === 'duplicate' ? [attempt, attempt] : [attempt] }));
    await expect(f.client.exploration(business).history!('session')).rejects.toMatchObject({ code: 'server_invalid_response' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });
  it('accepts only public capabilities and never exposes accidental private fields', async () => {
    const f = fixture(), planner = f.client.exploration(business), capabilities = { model: 'gpt-5.4-mini', remaining_attempts: 2,
      remaining_micro_usd: 500000, reservation_micro_usd: 250000, max_output_tokens: 4096, max_request_bytes: 131072 };
    f.fetch.mockResolvedValueOnce(json({ capabilities })).mockResolvedValueOnce(json({ capabilities: { ...capabilities, token } }));
    expect(await planner.capabilities!()).toEqual(capabilities); expect(await planner.capabilities!()).toBeNull();
  });
  it('uses fixed public messages for admission refusal without echoing server credentials', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ error: 'exploration_quota_exceeded', debug: token }, 429));
    const error = await f.client.exploration(business).plan(explorationRequest()).catch(problem => problem);
    expect(error).toMatchObject({ code: 'exploration_quota_exceeded', httpStatus: 429 });
    expect(error.message).not.toContain(token); expect(f.fetch).toHaveBeenCalledTimes(1);
  });
});

describe('reusable authenticated design server client', () => {
  it('exposes only actor identity from session and never reads a server without authentication', async () => {
    const f = fixture();
    expect(await f.client.session()).toEqual({ actorId: actor });
    f.setSession(null);
    await expect(f.client.read(business)).rejects.toMatchObject({ code: 'server_authentication_required' });
    expect(f.fetch).not.toHaveBeenCalled();
    f.getSession.mockRejectedValueOnce(new Error(`Session failure ${token}`));
    const error = await f.client.session().catch(problem => problem);
    expect(error).toMatchObject({ code: 'server_session_unavailable' });
    expect(error.message).not.toContain(token);
  });

  it('posts authenticated JSON and validates a snapshot for the requested business', async () => {
    const f = fixture(), reply = readReply(); f.fetch.mockResolvedValueOnce(json(reply));
    expect(await f.client.read(business)).toEqual(reply);
    const [url, init] = f.fetch.mock.calls[0], headers = new Headers(init!.headers);
    expect(url).toBe(endpoint); expect(init).toMatchObject({ method: 'POST', redirect: 'error', credentials: 'omit', cache: 'no-store' });
    expect(headers.get('authorization')).toBe(`Bearer ${token}`); expect(headers.get('apikey')).toBe(publicKey);
    expect(headers.get('content-type')).toBe('application/json');
    expect(JSON.parse(init!.body as string)).toEqual({ business_id: business, command: { kind: 'read' } });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['image_api', 'responses_image'])('reads trusted generation settings for %s without dispatching', async executor => {
    const f = fixture(), generation = { profile: 'flare_candidate', executor, max_reference_edge: 1024,
      max_brief_bytes: 4000, remaining_outputs: 1 };
    f.fetch.mockResolvedValueOnce(json({ ...readReply(), generation }));
    expect((await f.client.read(business)).generation).toEqual(generation);
    expect(f.fetch).toHaveBeenCalledTimes(1);
    expect(JSON.parse(f.fetch.mock.calls[0][1]!.body as string).command).toEqual({ kind: 'read' });
  });

  it.each([undefined, null, {}, { enabled: true },
    { profile: 'flare_candidate', executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: 1, permit: 'browser-forged' },
    { profile: 'sunburst', executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: 1 },
    { profile: 'baseline', executor: 'automatic', max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: 1 },
    { profile: 'baseline', executor: 'image_api', max_reference_edge: 8192, max_brief_bytes: 4000, remaining_outputs: 1 },
    { profile: 'baseline', executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 0, remaining_outputs: 1 },
    { profile: 'baseline', executor: 'image_api', max_reference_edge: 1024, max_brief_bytes: 4000, remaining_outputs: -1 },
  ])('retains the readable library while refusing missing or invalid generation settings %#', async generation => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ ...readReply(), generation }));
    const result = await f.client.read(business);
    expect(result.generation).toBe(generation === undefined ? undefined : null); expect(result.state.business_id).toBe(business);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it.each(['business', 'revision', 'schema', 'lab'])('rejects invalid read response %s without returning any snapshot', async field => {
    const f = fixture(), reply = readReply();
    if (field === 'business') reply.state.business_id = other;
    if (field === 'revision') reply.revision = -1;
    if (field === 'schema') Object.assign(reply.state, { schema_version: 2 });
    if (field === 'lab') Object.assign(reply.state, { lab: {} });
    f.fetch.mockResolvedValueOnce(json(reply));
    await expect(f.client.read(business)).rejects.toMatchObject({ code: 'server_invalid_response' });
  });

  it.each(['http://remote.invalid/desaing-server', 'https://user:password@design.invalid/desaing-server',
    'https://design.invalid/wrong-path', `${endpoint}?key=secret`, `${endpoint}#secret`, 'data:text/plain,secret'])('rejects unsafe endpoint %s before touching credentials', invalid => {
    const getSession = vi.fn();
    expect(() => createDesignServerClient({ endpoint: invalid, getSession })).toThrow(DesignServerClientError);
    expect(getSession).not.toHaveBeenCalled();
  });

  it('permits localhost HTTP for the isolated harness and supports an absent public API key', async () => {
    const fetch = vi.fn<typeof globalThis.fetch>().mockResolvedValue(json(readReply()));
    const client = createDesignServerClient({ endpoint: 'http://127.0.0.1:3012/desaing-server/',
      getSession: async () => ({ actorId: actor, accessToken: token }), fetch });
    await client.read(business);
    expect(fetch.mock.calls[0][0]).toBe('http://127.0.0.1:3012/desaing-server');
    expect(new Headers(fetch.mock.calls[0][1]!.headers).has('apikey')).toBe(false);
  });

  it('never retries 401 or renews the request behind the caller', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ error: `Bearer ${token}` }, 401));
    const error = await f.client.command(business, { kind: 'enqueue', operation: operation() }).catch(problem => problem);
    expect(error).toMatchObject({ code: 'server_authentication_required', httpStatus: 401 });
    expect(error.message).not.toContain(token); expect(f.fetch).toHaveBeenCalledTimes(1); expect(f.getSession).toHaveBeenCalledTimes(1);
  });

  it('rejects public attempts to register imports, claim calls or forge estimates before sending', async () => {
    const f = fixture();
    for (const bad of [{ kind: 'register_import', version: version() }, { kind: 'claim' },
      { kind: 'enqueue', operation: operation(), estimates_micro_usd: [0] }]) {
      await expect(f.client.command(business, bad as PublicServerCommand)).rejects.toMatchObject({ code: 'server_invalid_request' });
    }
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('refuses an operation actor that differs from the current session', async () => {
    const f = fixture(), op = operation(); op.context.actor_id = other;
    await expect(f.client.command(business, { kind: 'enqueue', operation: op })).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('freezes the operation before waiting on authentication and keeps the caller operation key on explicit replay', async () => {
    const f = fixture(), op = operation();
    let resume!: (value: { actorId: string; accessToken: string }) => void;
    f.getSession.mockImplementationOnce(() => new Promise(resolve => { resume = resolve; }));
    f.fetch.mockImplementation(async () => json({ revision: 1, reused: true }));
    const pending = f.client.command(business, { kind: 'enqueue', operation: op });
    op.context.target.revision = 'r2'; resume({ actorId: actor, accessToken: token });
    await pending;
    expect(JSON.parse(f.fetch.mock.calls[0][1]!.body as string).command.operation.context.target.revision).toBe('r1');
    await f.client.command(business, { kind: 'enqueue', operation: operation() });
    const keys = f.fetch.mock.calls.map(([, init]) => JSON.parse(init!.body as string).command.operation.operation_key);
    expect(keys).toEqual(['client-operation-once', 'client-operation-once']);
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([new Error(`Transport failure ${token}`), new DOMException('Connection ended', 'AbortError')])('reports an unknown outcome after a network failure without automatic replay', async reason => {
    const f = fixture(); f.fetch.mockRejectedValueOnce(reason);
    const error = await f.client.command(business, { kind: 'enqueue', operation: operation() }).catch(problem => problem);
    expect(error).toMatchObject({ code: 'server_response_unknown' });
    expect(error.message).not.toContain(token); expect(JSON.stringify(error)).not.toContain(token);
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([new Response('not JSON'), json({ revision: '1' }), json({})])('treats an unreadable successful command acknowledgement as unknown', async response => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(response);
    await expect(f.client.command(business, { kind: 'recover' })).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('exposes only whitelisted server error codes and never the response body or request URL', async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(json({ error: 'job_quota_exceeded', details: token }, 429));
    await expect(f.client.command(business, { kind: 'recover' })).rejects.toMatchObject({ code: 'job_quota_exceeded', httpStatus: 429 });
    f.fetch.mockResolvedValueOnce(json({ error: token, message: signedUrl }, 500));
    const error = await f.client.read(business).catch(problem => problem);
    expect(error).toMatchObject({ code: 'server_request_rejected', httpStatus: 500 });
    expect(error.message + JSON.stringify(error)).not.toContain(token);
    expect(error.message + JSON.stringify(error)).not.toContain(signedUrl);
  });

  it('discards a response after account change but tolerates a token refresh for the same actor', async () => {
    const f = fixture();
    f.fetch.mockImplementationOnce(async () => { f.setSession({ actorId: other, accessToken: 'another-user-token' }); return json(readReply()); });
    await expect(f.client.read(business)).rejects.toMatchObject({ code: 'server_session_changed' });
    f.setSession({ actorId: actor, accessToken: token });
    f.fetch.mockImplementationOnce(async () => { f.setSession({ actorId: actor, accessToken: 'renewed-token' }); return json(readReply()); });
    expect((await f.client.read(business)).state.business_id).toBe(business);
    f.fetch.mockResolvedValueOnce(json(readReply()));
    await f.client.read(business);
    expect(new Headers(f.fetch.mock.calls[2][1]!.headers).get('authorization')).toBe('Bearer renewed-token');
  });
});

describe('PNG uploads and signed asset downloads', () => {
  it('uploads a PNG as raw bytes with encoded query fields, then validates returned immutable metadata', async () => {
    const f = fixture(), input = { ...upload, brandId: 'Brand & Co', projectId: 'Project / one ?a=b' }, image = file();
    f.fetch.mockResolvedValueOnce(json({ revision: 2, version: version(input), reused: false }));
    expect(await f.client.upload(input, image)).toEqual(version(input));
    const [rawUrl, init] = f.fetch.mock.calls[0], url = new URL(String(rawUrl));
    expect(url.pathname).toBe('/functions/v1/desaing-server/assets/upload');
    expect(Object.fromEntries(url.searchParams)).toEqual({ business_id: business, upload_id: uploadId, brand_id: input.brandId, project_id: input.projectId });
    expect(init!.body).toBe(image); expect(new Headers(init!.headers).get('content-type')).toBe('image/png');
    expect(new Headers(init!.headers).get('authorization')).toBe(`Bearer ${token}`); expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects oversized files, incompatible MIME and disguised SVG before any network upload', async () => {
    const f = fixture();
    await expect(f.client.upload(upload, new Blob([new Uint8Array(8388609)], { type: 'image/png' })))
      .rejects.toMatchObject({ code: 'server_asset_too_large' });
    await expect(f.client.upload(upload, new Blob([png()], { type: 'image/jpeg' }))).rejects.toMatchObject({ code: 'server_invalid_image' });
    await expect(f.client.upload(upload, new Blob(['<svg/>'], { type: 'image/png' }))).rejects.toMatchObject({ code: 'server_invalid_image' });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('does not replay an upload with an ambiguous acknowledgement or accept metadata from another business', async () => {
    const f = fixture(); f.fetch.mockRejectedValueOnce(new Error(`Lost upload acknowledgement ${token}`));
    await expect(f.client.upload(upload, file())).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    const wrong = version(); wrong.identity.business_id = other;
    f.fetch.mockResolvedValueOnce(json({ revision: 2, version: wrong }));
    await expect(f.client.upload(upload, file())).rejects.toMatchObject({ code: 'server_response_unknown' });
    expect(f.fetch).toHaveBeenCalledTimes(2);
  });

  it('stops an upload if the actor changes while reading its bytes', async () => {
    const f = fixture(); f.getSession.mockResolvedValueOnce({ actorId: actor, accessToken: token })
      .mockResolvedValueOnce({ actorId: other, accessToken: 'another-token' });
    await expect(f.client.upload(upload, file())).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(f.fetch).not.toHaveBeenCalled();
  });

  it('fetches a signed URL without credentials, bearer or API key and verifies the returned PNG', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ url: signedUrl, expires_in: 60 })).mockResolvedValueOnce(new Response(png()));
    const blob = await f.client.asset({ ...identity, candidate_id: 'extra-ui-field' } as typeof identity);
    expect(blob.type).toBe('image/png'); expect(new Uint8Array(await blob.arrayBuffer())).toEqual(png());
    const [signPath, signInit] = f.fetch.mock.calls[0], [downloadPath, downloadInit] = f.fetch.mock.calls[1];
    expect(signPath).toBe(`${endpoint}/assets/url`); expect(JSON.parse(signInit!.body as string)).toEqual(identity);
    expect(downloadPath).toBe(signedUrl);
    expect(downloadInit).toEqual({ method: 'GET', credentials: 'omit', redirect: 'error', cache: 'no-store' });
    expect(new Headers(downloadInit!.headers).has('authorization')).toBe(false);
    expect(new Headers(downloadInit!.headers).has('apikey')).toBe(false);
  });

  it.each(['https://other.invalid/image.png', 'http://design.invalid/image.png', 'data:image/png;base64,abc',
    'https://user:password@design.invalid/image.png', '/relative.png', `${signedUrl}#fragment`])('does not follow the untrusted signed URL %s', async url => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ url }));
    const error = await f.client.asset(identity).catch(problem => problem);
    expect(error).toMatchObject({ code: 'server_untrusted_asset_url' });
    expect(error.message).not.toContain(url); expect(f.fetch).toHaveBeenCalledTimes(1);
  });

  it('permits a same-origin signed asset from the localhost harness', async () => {
    const f = fixture('http://localhost:3012/desaing-server');
    f.fetch.mockResolvedValueOnce(json({ url: 'http://localhost:3012/private/asset.png?signature=test' }))
      .mockResolvedValueOnce(new Response(png()));
    expect((await f.client.asset(identity)).type).toBe('image/png');
    expect(f.fetch.mock.calls[1][1]?.credentials).toBe('omit');
  });

  it('binds SHA-256 version identities to the exact downloaded PNG bytes', async () => {
    const f = fixture(), bytes = png();
    const hash = createHash('sha256').update(bytes).digest('hex');
    f.fetch.mockResolvedValueOnce(json({ url: signedUrl })).mockResolvedValueOnce(new Response(bytes));
    const valid = await f.client.asset({ ...identity, version_id: hash.toUpperCase() });
    expect(new Uint8Array(await valid.arrayBuffer())).toEqual(bytes);

    f.fetch.mockResolvedValueOnce(json({ url: signedUrl })).mockResolvedValueOnce(new Response(bytes));
    await expect(f.client.asset({ ...identity, version_id: '0'.repeat(64) }))
      .rejects.toMatchObject({ code: 'server_invalid_image' });
    expect(f.fetch).toHaveBeenCalledTimes(4);
  });

  it('enforces size from both Content-Length and actual streamed bytes, including a lying small header', async () => {
    const f = fixture();
    f.fetch.mockResolvedValueOnce(json({ url: signedUrl }))
      .mockResolvedValueOnce(new Response(png(), { headers: { 'content-length': '8388609' } }));
    await expect(f.client.asset(identity)).rejects.toMatchObject({ code: 'server_asset_too_large' });
    const cancel = vi.fn();
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(8388609)); }, cancel });
    f.fetch.mockResolvedValueOnce(json({ url: signedUrl })).mockResolvedValueOnce(new Response(stream, { headers: { 'content-length': '1' } }));
    await expect(f.client.asset(identity)).rejects.toMatchObject({ code: 'server_asset_too_large' });
    expect(cancel).toHaveBeenCalledTimes(1); expect(f.fetch).toHaveBeenCalledTimes(4);
  });

  it('does not refresh a refused signed URL or return invalid raster bytes', async () => {
    const f = fixture(); f.fetch.mockResolvedValueOnce(json({ url: signedUrl })).mockResolvedValueOnce(new Response('expired token', { status: 403 }));
    await expect(f.client.asset(identity)).rejects.toMatchObject({ code: 'asset_storage_unavailable', httpStatus: 403 });
    expect(f.fetch).toHaveBeenCalledTimes(2);
    f.fetch.mockResolvedValueOnce(json({ url: signedUrl })).mockResolvedValueOnce(new Response('<svg/>'));
    await expect(f.client.asset(identity)).rejects.toMatchObject({ code: 'server_invalid_image' });
    expect(f.fetch).toHaveBeenCalledTimes(4);
  });

  it('stops before the signed fetch on account change and discards bytes if the session ends during download', async () => {
    const f = fixture();
    f.fetch.mockImplementationOnce(async () => { f.setSession(null); return json({ url: signedUrl }); });
    await expect(f.client.asset(identity)).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(f.fetch).toHaveBeenCalledTimes(1);
    f.setSession({ actorId: actor, accessToken: token });
    f.fetch.mockResolvedValueOnce(json({ url: signedUrl }))
      .mockImplementationOnce(async () => { f.setSession(null); return new Response(png()); });
    await expect(f.client.asset(identity)).rejects.toMatchObject({ code: 'server_session_changed' });
    expect(f.fetch).toHaveBeenCalledTimes(3);
  });
});
