import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { createServerHandler, type ServerHttpDependencies } from '../serverHttp.ts';
import {
  executeServerCommand, readServerState, ServerBoundaryError,
  type BusinessRole, type ServerRead, type ServerRepository,
} from '../serverRepository.ts';
import { boundedBody, parseServerRequest } from '../serverRequest.ts';
import { importServerAsset, serverAssetUrl, type PrivateAssetStorage } from '../serverStorage.ts';
import { inspectServerPng } from '../serverPng.ts';
import { claimServerCall, type ServerPolicy, type ServerSnapshot } from '../serverState.ts';
import type { DesignOperation } from '../contracts.ts';
import { getQuotaUsage } from '../jobLedger.ts';

const business = '10000000-0000-4000-8000-000000000001';
const actor = '10000000-0000-4000-8000-000000000002';
const foreign = '20000000-0000-4000-8000-000000000001';
const uploadId = '10000000-0000-4000-8000-000000000003';
const policy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'boundary-policy', limit_micro_usd: 200,
  max_image_outputs: 2, reservation_per_output_micro_usd: 100, enabled_image_profiles: ['baseline'], responses_image_enabled: false };
function operation(key = 'boundary-operation'): DesignOperation {
  return { operation_key: key, action: 'generate_image', context: {
    actor_id: actor, business_id: business, brand_id: 'brand', project_id: 'project', session_id: 'session',
    workspace: 'presentations', interaction_mode: 'execute_change', instruction: 'Crear un avión.', immutable_elements: [], references: [],
    target: { document_type: 'presentation', document_id: 'deck', revision: 'r1', slide_id: 'slide' },
  }, image: { profile: 'baseline', quality: 'low', size: { width: 1024, height: 1024 },
    output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } };
}

/** Transaction adapter fixture: commit compares revision synchronously before publishing its copy. */
class MemoryRepository implements ServerRepository {
  policy = structuredClone(policy);
  role: BusinessRole = 'editor';
  revision = 0;
  snapshot: ServerSnapshot | null = null;
  conflictsRemaining = 0;
  commitFailure: 'before' | 'after' | null = null;
  constructor(readonly trace: string[] = []) {}
  read = vi.fn(async (businessId: string, actorId: string): Promise<ServerRead> => {
    this.trace.push('read');
    if (businessId !== business || actorId !== actor) throw new ServerBoundaryError('business_access_denied', 403);
    return { role: this.role, policy: structuredClone(this.policy), state: { revision: this.revision, snapshot: structuredClone(this.snapshot) } };
  });
  commit = vi.fn(async (input: Parameters<ServerRepository['commit']>[0]) => {
    this.trace.push('commit');
    if (this.commitFailure === 'before') throw new Error('Database transport unknown; secret=never-return');
    if (input.businessId !== business || input.actorId !== actor || this.role === 'viewer') throw new ServerBoundaryError('business_write_denied', 403);
    if (this.conflictsRemaining-- > 0 || input.expectedRevision !== this.revision) return { committed: false, revision: this.revision };
    this.snapshot = structuredClone(input.snapshot); this.revision++;
    if (this.commitFailure === 'after') throw new Error('Database acknowledgement lost; secret=never-return');
    return { committed: true, revision: this.revision };
  });
}
class MemoryStorage implements PrivateAssetStorage {
  readonly objects = new Map<string, Uint8Array>();
  beforePut?: () => Promise<void>;
  constructor(readonly trace: string[] = []) {}
  putImmutable = vi.fn(async (key: string, bytes: Uint8Array) => {
    this.trace.push('put');
    await this.beforePut?.();
    const previous = this.objects.get(key);
    if (previous && (previous.length !== bytes.length || previous.some((byte, i) => byte !== bytes[i]))) {
      throw new ServerBoundaryError('immutable_object_conflict', 409);
    }
    this.objects.set(key, bytes.slice());
  });
  signedUrl = vi.fn(async (key: string, expiresIn: number) => {
    this.trace.push('sign');
    if (!this.objects.has(key)) throw new Error('Missing private object');
    return `https://storage.invalid/private/${key}?expires=${expiresIn}&token=test-token`;
  });
}
function harness() {
  const repository = new MemoryRepository(), storage = new MemoryStorage();
  const authenticate = vi.fn(async (token: string) => token === 'verified-session' ? { id: actor } : null);
  const dependencies: ServerHttpDependencies = { enabled: true, allowedOrigins: ['http://localhost:3012'], authenticate, repository, storage };
  return { repository, storage, authenticate, dependencies, handler: createServerHandler(dependencies) };
}
const payload = () => ({ business_id: business, command: { kind: 'enqueue', operation: operation() } });
function jsonRequest(body: unknown, options: { token?: string | null; path?: string; origin?: string; contentType?: string } = {}) {
  return new Request(`http://localhost/functions/v1/desaing-server${options.path ?? ''}`, { method: 'POST', headers: {
    'content-type': options.contentType ?? 'application/json',
    ...(options.token === null ? {} : { authorization: `Bearer ${options.token ?? 'verified-session'}` }),
    ...(options.origin ? { origin: options.origin } : {}),
  }, body: JSON.stringify(body) });
}
const uploadInput = { businessId: business, uploadId, brandId: 'brand', projectId: 'project' };

function crc32(bytes: Uint8Array): number {
  let remainder = 0xffffffff;
  for (const byte of bytes) {
    remainder ^= byte;
    for (let bit = 0; bit < 8; bit++) remainder = remainder & 1 ? (remainder >>> 1) ^ 0xedb88320 : remainder >>> 1;
  }
  return (remainder ^ 0xffffffff) >>> 0;
}
function chunk(type: string, content: Uint8Array = new Uint8Array()): Uint8Array {
  const bytes = new Uint8Array(content.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, content.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(content, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
const signature = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function concat(...parts: Uint8Array[]) {
  const joined = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of parts) { joined.set(part, cursor); cursor += part.length; }
  return joined;
}
function png(options: { width?: number; height?: number; color?: number; depth?: number; interlace?: number;
  raw?: Uint8Array; compressed?: Uint8Array; filter?: number; extra?: Uint8Array; split?: boolean } = {}): Uint8Array<ArrayBuffer> {
  const width = options.width ?? 2, height = options.height ?? 2, color = options.color ?? 6;
  const ihdr = new Uint8Array(13), view = new DataView(ihdr.buffer);
  view.setUint32(0, width); view.setUint32(4, height); ihdr[8] = options.depth ?? 8; ihdr[9] = color; ihdr[12] = options.interlace ?? 0;
  const stride = width * ({ 0: 1, 2: 3, 4: 2, 6: 4 }[color] ?? 1) + 1;
  const raw = options.raw ?? new Uint8Array(stride * height).fill(120);
  if (!options.raw) for (let offset = 0; offset < raw.length; offset += stride) raw[offset] = options.filter ?? 0;
  const compressed = options.compressed ?? new Uint8Array(deflateSync(raw));
  const data = options.split ? [chunk('IDAT', compressed.subarray(0, Math.floor(compressed.length / 2))),
    chunk('IDAT', compressed.subarray(Math.floor(compressed.length / 2)))] : [chunk('IDAT', compressed)];
  return concat(signature, chunk('IHDR', ihdr), ...(options.extra ? [options.extra] : []), ...data, chunk('IEND'));
}

describe('HTTP authentication and strict public command boundary', () => {
  it('authenticates the bearer token before body parsing, business reads or private storage access', async () => {
    const h = harness();
    const missing = await h.handler(jsonRequest(payload(), { token: null }));
    expect(missing.status).toBe(401); expect(h.authenticate).not.toHaveBeenCalled();
    const invalid = await h.handler(new Request('http://localhost/functions/v1/desaing-server', { method: 'POST',
      headers: { authorization: 'Bearer forged-session', 'content-type': 'application/json' }, body: 'not json' }));
    expect(invalid.status).toBe(401); expect(h.authenticate).toHaveBeenCalledWith('forged-session');
    expect(h.repository.read).not.toHaveBeenCalled(); expect(h.storage.signedUrl).not.toHaveBeenCalled();
  });

  it('uses the authenticated actor and denies both cross-business access and a forged operation actor', async () => {
    const h = harness(), request = payload(); request.command.operation.context.actor_id = foreign;
    const forged = await h.handler(jsonRequest(request));
    expect(forged.status).toBe(403); expect(h.repository.read).toHaveBeenCalledWith(business, actor);
    const other = await h.handler(jsonRequest({ business_id: foreign, command: { kind: 'read' } }));
    expect(other.status).toBe(403); expect(h.repository.commit).not.toHaveBeenCalled();
  });

  it('permits a viewer to read while denying writes before commit', async () => {
    const h = harness(); h.repository.role = 'viewer';
    const read = await h.handler(jsonRequest({ business_id: business, command: { kind: 'read' } }));
    expect(read.status).toBe(200);
    const write = await h.handler(jsonRequest(payload()));
    expect(write.status).toBe(403); expect(h.repository.commit).not.toHaveBeenCalled();
    expect(h.repository.snapshot).toBeNull();
  });

  it.each(['register_import', 'claim', 'begin', 'record_result', 'validate', 'settle', 'call_started'])
  ('never exposes internal command %s through HTTP', async kind => {
    const h = harness();
    const response = await h.handler(jsonRequest({ business_id: business, command: { kind } }));
    expect(response.status).toBe(400); expect(h.repository.read).not.toHaveBeenCalled();
    expect(h.storage.putImmutable).not.toHaveBeenCalled();
  });

  it.each(['estimate', 'authorization', 'policy', 'model'])('rejects forged %s settings instead of trusting browser policy', async field => {
    const h = harness(), body = payload() as unknown as Record<string, any>;
    if (field === 'estimate') body.command.estimates_micro_usd = [0];
    if (field === 'authorization') body.command.operation.authorization = { actor_id: actor, authorization_id: 'forged' };
    if (field === 'policy') body.policy = { enabled: true, limit_micro_usd: 99999999 };
    if (field === 'model') body.command.operation.image.model_id = 'client-chosen-model';
    expect((await h.handler(jsonRequest(body))).status).toBe(400);
    expect(h.repository.read).not.toHaveBeenCalled();
  });

  it('rejects malformed JSON, invalid UTF-8, excess fields and oversized streamed or declared bodies', async () => {
    const h = harness();
    for (const body of ['{bad', Uint8Array.from([0xff])]) {
      const response = await h.handler(new Request('http://localhost/functions/v1/desaing-server', { method: 'POST',
        headers: { authorization: 'Bearer verified-session', 'content-type': 'application/json' }, body }));
      expect(response.status).toBe(400);
    }
    expect(() => parseServerRequest({ business_id: business, command: { kind: 'recover', actor_id: foreign } })).toThrow('invalid_server_request');
    expect((await h.handler(jsonRequest('x'.repeat(262145)))).status).toBe(413);
    const declared = new Request('http://localhost/', { method: 'POST', headers: { 'content-length': '100' }, body: 'x' });
    await expect(boundedBody(declared, 10)).rejects.toMatchObject({ code: 'request_too_large', status: 413 });
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(11)); }, cancel() { cancelled = true; } });
    const streaming = new Request('http://localhost/', { method: 'POST', body: stream, duplex: 'half' } as RequestInit);
    await expect(boundedBody(streaming, 10)).rejects.toMatchObject({ code: 'request_too_large' });
    expect(cancelled).toBe(true); expect(h.repository.read).not.toHaveBeenCalled();
  });

  it('denies unlisted origins and remains disabled by configuration before authentication', async () => {
    const h = harness();
    expect((await h.handler(jsonRequest(payload(), { origin: 'https://untrusted.invalid' }))).status).toBe(403);
    h.dependencies.enabled = false;
    expect((await h.handler(jsonRequest(payload()))).status).toBe(503);
    expect(h.authenticate).not.toHaveBeenCalled(); expect(h.repository.read).not.toHaveBeenCalled();
  });

  it('maps a tenant disabled flag to unavailable but allows an existing-operation replay', async () => {
    const h = harness();
    expect((await h.handler(jsonRequest(payload()))).status).toBe(200);
    h.repository.policy.enabled = false;
    expect((await h.handler(jsonRequest(payload()))).status).toBe(200);
    const next = payload(); next.command.operation.operation_key = 'new-operation';
    expect((await h.handler(jsonRequest(next))).status).toBe(503);
    expect(h.repository.commit).toHaveBeenCalledTimes(1);
  });

  it('returns only a fixed error when an authenticated database call throws confidential diagnostic text', async () => {
    const h = harness(); h.repository.commitFailure = 'before';
    const response = await h.handler(jsonRequest(payload())), text = await response.text();
    expect(response.status).toBe(503); expect(text).toBe('{"error":"server_operation_unavailable"}');
    expect(text).not.toContain('secret'); expect(h.repository.commit).toHaveBeenCalledTimes(1);
  });

  it('does not sign an unknown, wrong-version or cross-business asset supplied by the browser', async () => {
    const h = harness();
    const missing = await h.handler(jsonRequest({ business_id: business, asset_id: uploadId, version_id: 'unknown' }, { path: '/assets/url' }));
    expect(missing.status).toBe(404);
    const other = await h.handler(jsonRequest({ business_id: foreign, asset_id: uploadId, version_id: 'unknown' }, { path: '/assets/url' }));
    expect(other.status).toBe(403); expect(h.storage.signedUrl).not.toHaveBeenCalled();
    const injected = await h.handler(jsonRequest({ business_id: business, asset_id: uploadId, version_id: 'unknown', storage_key: `${foreign}/secret.png` }, { path: '/assets/url' }));
    expect(injected.status).toBe(400); expect(h.storage.signedUrl).not.toHaveBeenCalled();
  });
});

describe('server repository compare-and-swap and uncertain outcomes', () => {
  it('replays a concurrent identical operation once without duplicate reservation or audit', async () => {
    const repository = new MemoryRepository();
    const results = await Promise.all([1, 2].map(() => executeServerCommand(repository, business, actor,
      { kind: 'enqueue', operation: operation() }, () => 10)));
    expect(results.map(result => (result as Record<string, unknown>).reused).sort()).toEqual([false, true]);
    expect(repository.revision).toBe(1); expect(repository.snapshot!.jobs.jobs).toHaveLength(1);
    expect(getQuotaUsage(repository.snapshot!.jobs).committed_micro_usd).toBe(100);
  });

  it('rechecks the remaining quota after losing a CAS race for the last reservation', async () => {
    const repository = new MemoryRepository(); repository.policy.limit_micro_usd = 100;
    const results = await Promise.allSettled(['one', 'two'].map(key => executeServerCommand(repository, business, actor,
      { kind: 'enqueue', operation: operation(key) }, () => 10)));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({ reason: { code: 'job_quota_exceeded' } });
    expect(repository.revision).toBe(1); expect(repository.snapshot!.jobs.jobs).toHaveLength(1);
  });

  it('retries only explicit CAS conflicts and stops after its bounded conflict count', async () => {
    const repository = new MemoryRepository(); repository.conflictsRemaining = 2;
    const completed = await executeServerCommand(repository, business, actor, { kind: 'enqueue', operation: operation() }, () => 10);
    expect(completed.revision).toBe(1); expect(repository.commit).toHaveBeenCalledTimes(3);
    const blocked = new MemoryRepository(); blocked.conflictsRemaining = 99;
    await expect(executeServerCommand(blocked, business, actor, { kind: 'enqueue', operation: operation() }, () => 10))
      .rejects.toMatchObject({ code: 'concurrent_state_change', status: 409 });
    expect(blocked.commit).toHaveBeenCalledTimes(6); expect(blocked.snapshot).toBeNull();
  });

  it('does not retry an ambiguous commit; a later user replay recovers the already committed operation', async () => {
    const repository = new MemoryRepository(); repository.commitFailure = 'after';
    await expect(executeServerCommand(repository, business, actor, { kind: 'enqueue', operation: operation() }, () => 10))
      .rejects.toThrow('acknowledgement lost');
    expect(repository.commit).toHaveBeenCalledTimes(1); expect(repository.revision).toBe(1);
    repository.commitFailure = null;
    const replay = await executeServerCommand(repository, business, actor, { kind: 'enqueue', operation: operation() }, () => 11);
    expect(replay).toMatchObject({ reused: true }); expect(repository.commit).toHaveBeenCalledTimes(1);
  });

  it('recovers an expired attempt as uncertain after serialization, preserving its reservation with the tenant disabled', async () => {
    const repository = new MemoryRepository();
    await executeServerCommand(repository, business, actor, { kind: 'enqueue', operation: operation() }, () => 10);
    const call = repository.snapshot!.jobs.jobs[0].calls[0];
    repository.snapshot = JSON.parse(JSON.stringify(claimServerCall(repository.snapshot!, repository.policy,
      operation().operation_key, call.call_key, 'attempt-once', 20, 10)));
    repository.policy.enabled = false;
    await executeServerCommand(repository, business, actor, { kind: 'recover' }, () => 30);
    const snapshot = (await readServerState(repository, business, actor)).state;
    expect(snapshot.jobs.jobs[0].calls[0].state).toBe('uncertain');
    expect(getQuotaUsage(snapshot.jobs)).toEqual({ committed_micro_usd: 100, image_outputs: 1, unsettled_calls: 1 });
    const revisions = repository.revision;
    await executeServerCommand(repository, business, actor, { kind: 'recover' }, () => 31);
    expect(repository.revision).toBe(revisions);
  });
});

describe('private PNG upload and scoped signing boundary', () => {
  it('waits for verified immutable storage before committing metadata, then signs only its exact registered version', async () => {
    const trace: string[] = [], repository = new MemoryRepository(trace), storage = new MemoryStorage(trace);
    let announce!: () => void, finish!: () => void;
    const putStarted = new Promise<void>(resolve => { announce = resolve; });
    const releasePut = new Promise<void>(resolve => { finish = resolve; });
    storage.beforePut = async () => { announce(); await releasePut; };
    const importing = importServerAsset(repository, storage, actor, uploadInput, png());
    await putStarted;
    expect(repository.commit).not.toHaveBeenCalled(); expect(repository.snapshot).toBeNull();
    finish(); await importing;
    expect(trace.indexOf('put')).toBeLessThan(trace.indexOf('commit'));
    const version = repository.snapshot!.assets.versions[0];
    expect(version.identity.version_id).toMatch(/^[0-9a-f]{64}$/);
    expect(version.storage.storage_key).toBe(`${business}/uploads/${uploadId}.png`);
    expect(JSON.stringify(repository.snapshot)).not.toMatch(/base64|https:\/\//);
    repository.role = 'viewer';
    const signed = await serverAssetUrl(repository, storage, actor, business, uploadId, version.identity.version_id);
    expect(signed.expires_in).toBe(60); expect(storage.signedUrl).toHaveBeenCalledWith(version.storage.storage_key, 60);
  });

  it('replays a registered import after JSONB key reordering without rewriting the object or metadata', async () => {
    const repository = new MemoryRepository(), storage = new MemoryStorage(), bytes = png();
    await importServerAsset(repository, storage, actor, uploadInput, bytes);
    function reordered(value: unknown): unknown {
      if (Array.isArray(value)) return value.map(reordered);
      if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reordered(item)]));
      return value;
    }
    repository.snapshot = reordered(repository.snapshot) as ServerSnapshot;
    repository.policy.enabled = false;
    const again = await importServerAsset(repository, storage, actor, uploadInput, bytes);
    expect(again).toMatchObject({ reused: true }); expect(storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(repository.commit).toHaveBeenCalledTimes(1); expect(repository.snapshot.assets.versions).toHaveLength(1);
  });

  it('rejects upload ID reuse with changed bytes or ownership metadata before any second storage write', async () => {
    const repository = new MemoryRepository(), storage = new MemoryStorage();
    await importServerAsset(repository, storage, actor, uploadInput, png());
    await expect(importServerAsset(repository, storage, actor, uploadInput, png({ filter: 1 })))
      .rejects.toMatchObject({ code: 'upload_key_conflict', status: 409 });
    await expect(importServerAsset(repository, storage, actor, { ...uploadInput, brandId: 'another-brand' }, png()))
      .rejects.toMatchObject({ code: 'upload_key_conflict' });
    expect(storage.putImmutable).toHaveBeenCalledTimes(1); expect(repository.commit).toHaveBeenCalledTimes(1);
  });

  it('keeps an interrupted upload private and unregistered, then completes the same upload without replacing bytes', async () => {
    const repository = new MemoryRepository(), storage = new MemoryStorage(), bytes = png();
    repository.commitFailure = 'before';
    await expect(importServerAsset(repository, storage, actor, uploadInput, bytes)).rejects.toThrow('transport unknown');
    expect(storage.objects.size).toBe(1); expect(repository.snapshot).toBeNull();
    await expect(serverAssetUrl(repository, storage, actor, business, uploadId, 'unknown')).rejects.toMatchObject({ code: 'asset_not_found' });
    expect(storage.signedUrl).not.toHaveBeenCalled();
    repository.commitFailure = null;
    await importServerAsset(repository, storage, actor, uploadInput, bytes);
    expect(storage.objects.size).toBe(1); expect(repository.snapshot!.assets.versions).toHaveLength(1);
    expect(repository.revision).toBe(1);
  });

  it('rejects membership, viewer and disabled-policy uploads without private storage writes', async () => {
    const repository = new MemoryRepository(), storage = new MemoryStorage();
    await expect(importServerAsset(repository, storage, foreign, uploadInput, png())).rejects.toMatchObject({ status: 403 });
    repository.role = 'viewer';
    await expect(importServerAsset(repository, storage, actor, uploadInput, new Uint8Array())).rejects.toMatchObject({ status: 403 });
    repository.role = 'editor'; repository.policy.enabled = false;
    await expect(importServerAsset(repository, storage, actor, uploadInput, png())).rejects.toMatchObject({ status: 503 });
    expect(storage.putImmutable).not.toHaveBeenCalled(); expect(repository.commit).not.toHaveBeenCalled();
  });

  it('checks upload HTTP content type and bounded PNG bytes before registering anything', async () => {
    const h = harness(), query = `?business_id=${business}&upload_id=${uploadId}&brand_id=brand&project_id=project`;
    const url = `http://localhost/functions/v1/desaing-server/assets/upload${query}`;
    expect((await h.handler(new Request(url, { method: 'POST', headers: { authorization: 'Bearer verified-session', 'content-type': 'image/jpeg' }, body: png() }))).status).toBe(415);
    const falsePng = new TextEncoder().encode('<svg onload="alert(1)"></svg>');
    const invalid = await h.handler(new Request(url, { method: 'POST', headers: { authorization: 'Bearer verified-session', 'content-type': 'image/png' }, body: falsePng }));
    expect(invalid.status).toBe(400); expect(h.storage.putImmutable).not.toHaveBeenCalled(); expect(h.repository.commit).not.toHaveBeenCalled();
  });
});

describe('bounded server PNG codec with actual zlib scanlines and CRCs', () => {
  it.each([0, 2, 4, 6])('accepts the documented noninterlaced 8-bit color type %s', async color => {
    await expect(inspectServerPng(png({ color }))).resolves.toEqual({ width: 2, height: 2 });
  });

  it('handles contiguous split IDAT chunks and a nonzero input buffer offset', async () => {
    const bytes = png({ width: 3, height: 4, split: true }), wrapped = concat(new Uint8Array(7), bytes, new Uint8Array(5));
    await expect(inspectServerPng(wrapped.subarray(7, wrapped.length - 5))).resolves.toEqual({ width: 3, height: 4 });
  });

  it('rejects excessive empty IDAT chunks even when the complete encoded image is small', async () => {
    const bytes = png({ width: 1, height: 1 });
    const tooManyChunks = concat(bytes.subarray(0, 33), ...Array.from({ length: 4097 }, () => chunk('IDAT')), bytes.subarray(33));
    expect(tooManyChunks.byteLength).toBeLessThan(60000);
    await expect(inspectServerPng(tooManyChunks)).rejects.toMatchObject({ code: 'invalid_png' });
  });

  it('rejects CRC corruption, truncated chunks and bytes after IEND', async () => {
    const corrupt = png(); corrupt[29] ^= 1;
    await expect(inspectServerPng(corrupt)).rejects.toMatchObject({ code: 'invalid_png' });
    await expect(inspectServerPng(png().subarray(0, png().length - 3))).rejects.toMatchObject({ code: 'invalid_png' });
    await expect(inspectServerPng(concat(png(), new Uint8Array([1])))).rejects.toMatchObject({ code: 'invalid_png' });
  });

  it.each([{ depth: 16 }, { color: 3 }, { interlace: 1 }, { extra: chunk('aaAA') },
    { extra: chunk('acTL', new Uint8Array(8)) }])('rejects PNG features outside the initial codec subset: %j', async options => {
    await expect(inspectServerPng(png(options))).rejects.toMatchObject({ code: 'invalid_png' });
  });

  it('preserves supported provider metadata, including C2PA, without rewriting the file', async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const extra = concat(chunk('gAMA', Uint8Array.from([0, 0, 177, 143])),
      chunk('iCCP', concat(encode('profile\0\0'), deflateSync(new Uint8Array(128)))),
      chunk('tEXt', encode('Author\0fixture')),
      chunk('zTXt', concat(encode('Description\0\0'), deflateSync(encode('fixture')))),
      chunk('iTXt', concat(encode('Description\0\x01\x00en\0\0'), deflateSync(encode('prueba')))),
      chunk('caBX', encode('opaque provenance fixture')));
    const bytes = png({ extra }), before = bytes.slice();
    await expect(inspectServerPng(bytes)).resolves.toEqual({ width: 2, height: 2 });
    expect(bytes).toEqual(before);
  });

  it('bounds compressed metadata as a total, and rejects malformed metadata', async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    const half = chunk('zTXt', concat(encode('Note\0\0'), deflateSync(new Uint8Array(600000))));
    const extras = [concat(half, half), chunk('iCCP', concat(encode('ICC\0\0'), deflateSync(new Uint8Array(1100000)))),
      chunk('zTXt', encode('key\0\0bad deflate')), chunk('iTXt', encode('key\0\x02\x00en\0\0text')),
      chunk('tEXt', encode(' key\0text')), chunk('sRGB', Uint8Array.of(4)),
      concat(chunk('gAMA', Uint8Array.of(0, 0, 1, 0)), chunk('gAMA', Uint8Array.of(0, 0, 1, 0)))];
    for (const extra of extras) await expect(inspectServerPng(png({ extra }))).rejects.toMatchObject({ code: 'invalid_png' });
  });

  it('accepts trailing text but rejects a gap between IDAT chunks', async () => {
    const bytes = png();
    const text = chunk('tEXt', new TextEncoder().encode('Note\0fixture'));
    const prefix = bytes.subarray(0, bytes.length - 12), end = bytes.subarray(bytes.length - 12);
    await expect(inspectServerPng(concat(prefix, text, end))).resolves.toEqual({ width: 2, height: 2 });
    await expect(inspectServerPng(concat(prefix, text, chunk('IDAT'), end))).rejects.toMatchObject({ code: 'invalid_png' });
    await expect(inspectServerPng(concat(prefix, chunk('gAMA', Uint8Array.of(0, 0, 1, 0)), end)))
      .rejects.toMatchObject({ code: 'invalid_png' });
  });

  it('rejects excessive dimensions, zero dimensions and excessive encoded bytes before decompression', async () => {
    for (const dimensions of [{ width: 0, height: 2 }, { width: 4097, height: 1 }, { width: 4096, height: 4096 }]) {
      await expect(inspectServerPng(png({ ...dimensions, raw: new Uint8Array([0]) }))).rejects.toMatchObject({ code: 'invalid_png' });
    }
    await expect(inspectServerPng(new Uint8Array(8388609))).rejects.toMatchObject({ code: 'invalid_png' });
  });

  it('rejects malformed deflate, scanline underflow/overflow, invalid row filters and a compressed expansion bomb', async () => {
    const options = [
      { compressed: Uint8Array.from([0, 1, 2, 3]) },
      { raw: new Uint8Array(4) }, { raw: new Uint8Array(6) }, { raw: Uint8Array.from([5, 0, 0, 0, 0]) },
      { raw: new Uint8Array(128 * 1024) },
    ];
    for (const option of options) {
      await expect(inspectServerPng(png({ width: 1, height: 1, ...option }))).rejects.toMatchObject({ code: 'invalid_png' });
    }
  });
});
