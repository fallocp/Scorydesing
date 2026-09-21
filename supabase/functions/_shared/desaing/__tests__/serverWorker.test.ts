import { deflateSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import { registerAssetVersion, type RegisteredAssetVersion } from '../assets.ts';
import type { DesignOperation, DesignReference } from '../contracts.ts';
import { getQuotaUsage } from '../jobLedger.ts';
import { ServerBoundaryError, type BusinessRole, type ServerRead, type ServerRepository } from '../serverRepository.ts';
import { applyServerCommand, assertServerSnapshot, createServerSnapshot, type ServerPolicy, type ServerSnapshot } from '../serverState.ts';
import { runLiveServerCall, runSimulatedServerCall, type LiveWorkerInput, type SimulatedProvider, type WorkerStorage } from '../serverWorker.ts';
import { createLiveImageProvider } from '../liveImageProvider.ts';
import type { LiveExecutionPermit } from '../liveExecution.ts';

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const business = uuid(1), actor = uuid(2), attempt = uuid(90);
const basePolicy: ServerPolicy = { business_id: business, enabled: true, policy_id: 'worker-test-policy',
  limit_micro_usd: 1000, max_image_outputs: 10, reservation_per_output_micro_usd: 100,
  enabled_image_profiles: ['baseline'], responses_image_enabled: false };
type CommitInput = Parameters<ServerRepository['commit']>[0];

function operation(): DesignOperation {
  return { operation_key: uuid(10), action: 'generate_image', context: {
    actor_id: actor, business_id: business, brand_id: 'brand', project_id: 'project', session_id: uuid(3),
    workspace: 'presentations', interaction_mode: 'execute_change', instruction: 'Un avión para la portada.',
    immutable_elements: ['Mantener los colores de marca.'], references: [],
    target: { document_type: 'presentation', document_id: uuid(4), revision: 'r1', slide_id: uuid(5) },
  }, image: { profile: 'baseline', quality: 'low', size: { width: 1024, height: 1024 },
    output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } };
}

// Fully decodable PNG fixtures: real zlib scanlines and CRCs, not header-only stubs.
function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return (crc ^ 0xffffffff) >>> 0;
}
function chunk(type: string, content = new Uint8Array()): Uint8Array {
  const bytes = new Uint8Array(content.length + 12), view = new DataView(bytes.buffer);
  view.setUint32(0, content.length); bytes.set(new TextEncoder().encode(type), 4); bytes.set(content, 8);
  view.setUint32(bytes.length - 4, crc32(bytes.subarray(4, bytes.length - 4)));
  return bytes;
}
function png(width: number, height: number, color = 120): Uint8Array {
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, width); view.setUint32(4, height); header[8] = 8; header[9] = 6;
  const stride = width * 4 + 1, raw = new Uint8Array(stride * height).fill(color);
  for (let offset = 0; offset < raw.length; offset += stride) raw[offset] = 0;
  const parts = [Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))), chunk('IEND')];
  const result = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) { result.set(part, offset); offset += part.length; }
  return result;
}
const outputPng = png(1024, 1024);
const smallPng = png(2, 2);
const mediumPng = png(1024, 1024, 180);

/** Revision checks and publication happen synchronously, just as one atomic CAS. */
class MemoryRepository implements ServerRepository {
  policy = structuredClone(basePolicy);
  role: BusinessRole = 'editor';
  revision = 1;
  snapshot: ServerSnapshot;
  readonly events: CommitInput[] = [];
  readonly conflicts = new Map<string, number>();
  failure: { event: string; phase: 'before' | 'after' } | null = null;
  beforeCommit?: (input: CommitInput) => void;
  constructor(state: ServerSnapshot) { this.snapshot = structuredClone(state); }
  read = vi.fn(async (businessId: string, actorId: string): Promise<ServerRead> => {
    if (businessId !== business || actorId !== actor) throw new ServerBoundaryError('business_access_denied', 403);
    return { role: this.role, policy: structuredClone(this.policy),
      state: { revision: this.revision, snapshot: structuredClone(this.snapshot) } };
  });
  commit = vi.fn(async (input: CommitInput) => {
    this.beforeCommit?.(input);
    if (input.businessId !== business || input.actorId !== actor || this.role === 'viewer') {
      throw new ServerBoundaryError('business_write_denied', 403);
    }
    if (!this.policy.enabled && ['job_enqueued', 'asset_imported', 'call_started'].includes(input.event)) {
      throw new ServerBoundaryError('server_feature_disabled', 503);
    }
    if (this.failure?.event === input.event && this.failure.phase === 'before') {
      this.failure = null;
      throw new Error('Database transport lost before write; private-token=do-not-leak');
    }
    const conflicts = this.conflicts.get(input.event) ?? 0;
    if (conflicts > 0 || input.expectedRevision !== this.revision) {
      if (conflicts > 0) this.conflicts.set(input.event, conflicts - 1);
      return { committed: false, revision: this.revision };
    }
    assertServerSnapshot(input.snapshot, business);
    this.snapshot = structuredClone(input.snapshot);
    this.revision++;
    this.events.push(structuredClone(input));
    if (this.failure?.event === input.event && this.failure.phase === 'after') {
      this.failure = null;
      throw new Error('Database acknowledgement lost after write; private-token=do-not-leak');
    }
    return { committed: true, revision: this.revision };
  });
}

class MemoryStorage implements WorkerStorage {
  readonly objects = new Map<string, Uint8Array>();
  failure = false;
  get = vi.fn(async (key: string) => {
    const bytes = this.objects.get(key);
    if (!bytes) throw new Error('Private reference absent; private-token=do-not-leak');
    return bytes.slice();
  });
  putImmutable = vi.fn(async (key: string, bytes: Uint8Array) => {
    if (this.failure) throw new Error('Storage failed; private-token=do-not-leak');
    if (this.objects.has(key)) throw new Error('Immutable object already exists');
    this.objects.set(key, bytes.slice());
  });
}

function imported(asset: number, bytes = smallPng): RegisteredAssetVersion {
  return { identity: { business_id: business, asset_id: uuid(asset), version_id: uuid(asset + 1) },
    brand_id: 'brand', project_id: 'project', provenance: { kind: 'imported', origin: 'upload' },
    storage: { storage_key: `${business}/imported/${uuid(asset)}/v1.png`, mime_type: 'image/png',
      width: 2, height: 2, size_bytes: bytes.length } };
}
function reference(version: RegisteredAssetVersion, reference_id: string): DesignReference {
  return { ...version.identity, reference_id, mime_type: version.storage.mime_type, roles: ['object_reference'] };
}
function harness(op = operation(), imports: Array<{ version: RegisteredAssetVersion; bytes?: Uint8Array }> = [],
  policyChanges: Partial<ServerPolicy> = {}) {
  const policy = { ...structuredClone(basePolicy), ...policyChanges };
  let state = createServerSnapshot(business, policy);
  const storage = new MemoryStorage();
  for (const item of imports) {
    state.assets = registerAssetVersion(state.assets, item.version);
    if (item.bytes) storage.objects.set(item.version.storage.storage_key, item.bytes.slice());
  }
  state = applyServerCommand(state, policy, actor, { kind: 'enqueue', operation: op }, 10).state;
  const repository = new MemoryRepository(state); repository.policy = policy;
  const provider: SimulatedProvider & { generate: ReturnType<typeof vi.fn<SimulatedProvider['generate']>> } = {
    mode: 'simulation', generate: vi.fn<SimulatedProvider['generate']>(async () => ({ bytes: outputPng.slice(), mimeType: 'image/png' })),
  };
  let time = 100;
  const options = { repository, storage, provider, businessId: business, actorId: actor,
    operationKey: op.operation_key, callKey: state.jobs.jobs[0].calls[0].call_key,
    now: () => ++time, attemptId: attempt };
  const call = () => repository.snapshot.jobs.jobs[0].calls[0];
  return { repository, storage, provider, options, call, run: () => runSimulatedServerCall(options) };
}
function reserved(h: Pick<ReturnType<typeof harness>, 'repository' | 'call'>) {
  expect(getQuotaUsage(h.repository.snapshot.jobs)).toMatchObject({ committed_micro_usd: 100, image_outputs: 1 });
  expect(h.call().settlement).toBeNull();
}

/** JSONB preserves values and array order, but not the insertion order of object keys. */
function reverseObjectKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reverseObjectKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).reverse().map(([key, entry]) => [key, reverseObjectKeys(entry)]));
  }
  return value;
}

describe('simulation worker durable dispatch boundary', () => {
  it('commits the claim before dispatch and atomically saves verified output, provenance and zero simulated cost', async () => {
    const h = harness();
    h.provider.generate.mockImplementation(async input => {
      expect(h.repository.events.map(event => event.event)).toEqual(['call_started']);
      expect(h.call()).toMatchObject({ state: 'running', attempt: { attempt_id: attempt } });
      expect(input.attemptId).toBe(attempt); expect(input.references).toEqual([]);
      expect(input.job.operation_key).toBe(h.options.operationKey);
      reserved(h);
      return { bytes: outputPng.slice(), mimeType: 'image/png' };
    });
    const result = await h.run();
    expect(result.status).toBe('completed'); expect(result.attempt_id).toBe(attempt);
    expect(h.provider.generate).toHaveBeenCalledTimes(1);
    expect(h.repository.events.map(event => event.event)).toEqual(['call_started', 'output_recorded']);
    expect(h.call()).toMatchObject({ state: 'needs_review', settlement: { actual_micro_usd: 0 }, review: null });
    expect(h.call().receipt?.outputs).toEqual([{ index: 0, asset: result.asset }]);
    expect(h.repository.snapshot.assets.versions).toHaveLength(1);
    const version = h.repository.snapshot.assets.versions[0];
    expect(version).toMatchObject({ identity: result.asset, brand_id: 'brand', project_id: 'project',
      storage: { storage_key: `${business}/generated/${attempt}/0.png`, width: 1024, height: 1024, size_bytes: outputPng.length },
      provenance: { kind: 'image_operation', operation_key: h.options.operationKey, action: 'generate_image', quality: 'low',
        immutable_elements: operation().context.immutable_elements } });
    expect(h.storage.objects.get(version.storage.storage_key)).toEqual(outputPng);
    expect(getQuotaUsage(h.repository.snapshot.jobs)).toEqual({ committed_micro_usd: 0, image_outputs: 1, unsettled_calls: 0 });
    expect(JSON.stringify(h.repository.snapshot)).not.toContain('b64_json');
  });

  it('replays a completed call without another dispatch, upload or audit', async () => {
    const h = harness(); await h.run();
    const saved = structuredClone(h.repository.snapshot), revision = h.repository.revision;
    expect((await h.run()).status).toBe('already_started');
    expect(h.provider.generate).toHaveBeenCalledTimes(1); expect(h.storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(h.repository.snapshot).toEqual(saved); expect(h.repository.revision).toBe(revision);
  });

  it('lets only one of two workers that read the same pending revision claim and dispatch', async () => {
    const h = harness();
    const pending = await h.repository.read(business, actor);
    h.repository.read.mockResolvedValueOnce(structuredClone(pending)).mockResolvedValueOnce(structuredClone(pending));
    const results = await Promise.all([h.run(), runSimulatedServerCall({ ...h.options, attemptId: uuid(91) })]);
    expect(results.map(result => result.status).sort()).toEqual(['already_started', 'completed']);
    expect(h.provider.generate).toHaveBeenCalledTimes(1);
    expect(h.repository.events.filter(event => event.event === 'call_started')).toHaveLength(1);
  });

  it('retries explicit claim CAS conflicts but dispatches only after one successful durable claim', async () => {
    const h = harness(); h.repository.conflicts.set('call_started', 2);
    expect((await h.run()).status).toBe('completed');
    expect(h.repository.commit.mock.calls.filter(([input]) => input.event === 'call_started')).toHaveLength(3);
    expect(h.provider.generate).toHaveBeenCalledTimes(1);
    expect(h.repository.events.filter(event => event.event === 'call_started')).toHaveLength(1);
  });

  it('stops after six rejected claim CAS attempts with no dispatch or automatic reservation release', async () => {
    const h = harness(); h.repository.conflicts.set('call_started', 6);
    expect(await h.run()).toMatchObject({ status: 'uncertain', error_code: 'claim_conflict_limit' });
    expect(h.repository.commit).toHaveBeenCalledTimes(6); expect(h.provider.generate).not.toHaveBeenCalled();
    expect(h.call().state).toBe('pending'); expect(h.call().attempt).toBeNull(); reserved(h);
  });

  it.each(['before', 'after'] as const)('never dispatches or retries after an ambiguous claim acknowledgement (%s write)', async phase => {
    const h = harness(); h.repository.failure = { event: 'call_started', phase };
    const result = await h.run();
    expect(result).toMatchObject({ status: 'uncertain', error_code: 'claim_outcome_unknown' });
    expect(h.repository.commit).toHaveBeenCalledTimes(1); expect(h.provider.generate).not.toHaveBeenCalled();
    expect(h.storage.putImmutable).not.toHaveBeenCalled();
    expect(h.call().state).toBe(phase === 'before' ? 'pending' : 'running'); reserved(h);
    expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it('retains reservation and records uncertainty when the provider outcome is unknown, including replay', async () => {
    const h = harness(); h.provider.generate.mockRejectedValue(new Error('Provider disconnected; private-token=do-not-leak'));
    const result = await h.run();
    expect(result).toMatchObject({ status: 'uncertain', error_code: 'simulation_provider_unknown' });
    expect(h.call().state).toBe('uncertain'); reserved(h);
    expect(h.repository.snapshot.assets.versions).toEqual([]); expect(h.storage.putImmutable).not.toHaveBeenCalled();
    expect((await h.run()).status).toBe('already_started'); expect(h.provider.generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it('retains the durable claim and reservation if immutable upload fails', async () => {
    const h = harness(); h.storage.failure = true;
    expect(await h.run()).toMatchObject({ status: 'uncertain', error_code: 'simulation_storage_unknown' });
    expect(h.call().state).toBe('uncertain'); reserved(h);
    expect(h.repository.snapshot.assets.versions).toEqual([]); expect(h.storage.objects.size).toBe(0);
    expect((await h.run()).status).toBe('already_started'); expect(h.provider.generate).toHaveBeenCalledTimes(1);
  });

  it.each(['malformed', 'wrong_dimensions'] as const)('refuses %s output before upload without refunding an uncertain attempt', async invalid => {
    const h = harness();
    h.provider.generate.mockResolvedValue({ bytes: invalid === 'malformed' ? Uint8Array.from([137, 80, 78, 71]) : smallPng,
      mimeType: 'image/png' });
    expect(await h.run()).toMatchObject({ status: 'uncertain', error_code: 'simulation_result_invalid' });
    expect(h.storage.putImmutable).not.toHaveBeenCalled(); expect(h.call().state).toBe('uncertain'); reserved(h);
    expect(h.repository.snapshot.assets.versions).toEqual([]);
  });

  it('retries only result persistence on explicit CAS conflicts, retaining one provider result and one immutable upload', async () => {
    const h = harness(); h.repository.conflicts.set('output_recorded', 2);
    expect((await h.run()).status).toBe('completed');
    expect(h.repository.commit.mock.calls.filter(([input]) => input.event === 'output_recorded')).toHaveLength(3);
    expect(h.provider.generate).toHaveBeenCalledTimes(1); expect(h.storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(h.repository.snapshot.assets.versions).toHaveLength(1);
  });

  it('recognizes an identical receipt concurrently persisted before its CAS acknowledgement', async () => {
    const h = harness();
    let published = false;
    h.repository.beforeCommit = input => {
      if (input.event !== 'output_recorded' || published) return;
      published = true;
      // Another coordinator committed the exact receipt while this CAS held its old revision.
      h.repository.snapshot = structuredClone(input.snapshot);
      h.repository.revision++;
      h.repository.events.push(structuredClone(input));
    };
    expect((await h.run()).status).toBe('completed');
    expect(h.repository.commit).toHaveBeenCalledTimes(2);
    expect(h.repository.events.map(event => event.event)).toEqual(['call_started', 'output_recorded']);
    expect(h.repository.snapshot.assets.versions).toHaveLength(1);
    expect(h.provider.generate).toHaveBeenCalledTimes(1); expect(h.storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(h.call().settlement?.actual_micro_usd).toBe(0);
  });

  it.each(['approved', 'rejected'] as const)('preserves a concurrent %s review after reading JSONB-reordered receipt metadata', async decision => {
    const h = harness();
    let reviewed: ServerSnapshot | undefined;
    h.repository.beforeCommit = input => {
      if (input.event !== 'output_recorded' || reviewed) return;
      // A competing coordinator stores the complete output, then the user reviews
      // it before this worker's stale output CAS returns. Both changes have audits.
      h.repository.snapshot = structuredClone(input.snapshot);
      h.repository.revision++;
      h.repository.events.push(structuredClone(input));
      const change = applyServerCommand(h.repository.snapshot, h.repository.policy, actor, {
        kind: 'review', operation_key: h.options.operationKey, call_key: h.options.callKey, decision,
      }, 500);
      expect(change.event?.kind).toBe('output_reviewed');
      const reordered = reverseObjectKeys(change.state);
      assertServerSnapshot(reordered, business);
      expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(change.state));
      reviewed = structuredClone(reordered);
      h.repository.events.push({ ...input, event: 'output_reviewed', expectedRevision: h.repository.revision,
        snapshot: structuredClone(reviewed) });
      h.repository.snapshot = structuredClone(reviewed);
      h.repository.revision++;
    };

    const result = await h.run();
    expect(result.status).toBe('completed');
    expect(reviewed).toBeDefined(); expect(h.repository.snapshot).toEqual(reviewed);
    expect(h.call()).toMatchObject({ state: decision, review: { decision, actor_id: actor, reviewed_at: 500 },
      settlement: { actual_micro_usd: 0 } });
    expect(h.repository.snapshot.assets.reviews).toHaveLength(1);
    expect(h.repository.snapshot.assets.reviews[0]).toMatchObject({ decision, actor_id: actor, asset: result.asset });
    expect(h.repository.snapshot.assets.versions).toHaveLength(1);
    expect(h.repository.events.map(event => event.event)).toEqual(['call_started', 'output_recorded', 'output_reviewed']);
    expect(h.repository.revision).toBe(4);
    expect(h.repository.commit).toHaveBeenCalledTimes(2);
    expect(h.provider.generate).toHaveBeenCalledTimes(1); expect(h.storage.putImmutable).toHaveBeenCalledTimes(1);
    expect(getQuotaUsage(h.repository.snapshot.jobs)).toEqual({ committed_micro_usd: 0, image_outputs: 1, unsettled_calls: 0 });
  });

  it('preserves durable bytes after six result CAS conflicts and never regenerates that claimed call', async () => {
    const h = harness(); h.repository.conflicts.set('output_recorded', 6);
    expect(await h.run()).toMatchObject({ status: 'uncertain', error_code: 'result_conflict_limit' });
    expect(h.repository.commit.mock.calls.filter(([input]) => input.event === 'output_recorded')).toHaveLength(6);
    expect(h.storage.objects.get(`${business}/generated/${attempt}/0.png`)).toEqual(outputPng); reserved(h);
    expect(h.repository.snapshot.assets.versions).toHaveLength(0);
    expect((await h.run()).status).toBe('already_started'); expect(h.provider.generate).toHaveBeenCalledTimes(1);
  });

  it.each(['before', 'after'] as const)('does not retry an ambiguous result commit (%s write) or regenerate its durable bytes', async phase => {
    const h = harness(); h.repository.failure = { event: 'output_recorded', phase };
    const result = await h.run();
    expect(result).toMatchObject({ status: 'uncertain', error_code: 'result_commit_unknown' });
    expect(h.repository.commit.mock.calls.filter(([input]) => input.event === 'output_recorded')).toHaveLength(1);
    expect(h.storage.objects.get(`${business}/generated/${attempt}/0.png`)).toEqual(outputPng);
    expect(h.repository.snapshot.assets.versions).toHaveLength(phase === 'before' ? 0 : 1);
    if (phase === 'before') reserved(h);
    else expect(getQuotaUsage(h.repository.snapshot.jobs).committed_micro_usd).toBe(0);
    expect((await h.run()).status).toBe('already_started'); expect(h.provider.generate).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private-token');
  });

  it('keeps in-flight completion enabled after the policy is disabled', async () => {
    const h = harness();
    h.provider.generate.mockImplementation(async () => {
      h.repository.policy.enabled = false;
      return { bytes: outputPng.slice(), mimeType: 'image/png' };
    });
    expect((await h.run()).status).toBe('completed');
    expect(h.call().state).toBe('needs_review'); expect(h.call().settlement?.actual_micro_usd).toBe(0);
  });

  it('cannot publish a result after writer authorization is revoked during dispatch', async () => {
    const h = harness();
    h.provider.generate.mockImplementation(async () => {
      h.repository.role = 'viewer';
      return { bytes: outputPng.slice(), mimeType: 'image/png' };
    });
    expect((await h.run()).status).toBe('uncertain');
    expect(h.repository.snapshot.assets.versions).toEqual([]); expect(h.call().receipt).toBeNull(); reserved(h);
    expect(h.storage.objects.get(`${business}/generated/${attempt}/0.png`)).toEqual(outputPng);
    expect(h.provider.generate).toHaveBeenCalledTimes(1);
    expect(h.repository.events.map(event => event.event)).toEqual(['call_started']);
  });

  it('does not dispatch when writer authorization is revoked between read and claim commit', async () => {
    const h = harness();
    h.repository.beforeCommit = input => { if (input.event === 'call_started') h.repository.role = 'viewer'; };
    expect(await h.run()).toMatchObject({ status: 'uncertain', error_code: 'claim_outcome_unknown' });
    expect(h.repository.commit).toHaveBeenCalledTimes(1); expect(h.provider.generate).not.toHaveBeenCalled();
    expect(h.call().attempt).toBeNull(); reserved(h);
  });

  it('rejects viewers before a claim or file access', async () => {
    const h = harness(); h.repository.role = 'viewer';
    await expect(h.run()).rejects.toMatchObject({ code: 'forbidden' });
    expect(h.repository.commit).not.toHaveBeenCalled(); expect(h.storage.get).not.toHaveBeenCalled();
    expect(h.provider.generate).not.toHaveBeenCalled();
  });

  it('blocks a pending simulation after the policy is disabled without releasing its existing reservation', async () => {
    const h = harness(); h.repository.policy.enabled = false;
    await expect(h.run()).rejects.toMatchObject({ code: 'simulation_disabled' });
    expect(h.repository.commit).not.toHaveBeenCalled(); expect(h.provider.generate).not.toHaveBeenCalled();
    expect(h.call().attempt).toBeNull(); reserved(h);
  });

  it('requires an explicit simulation provider before reading server state', async () => {
    const h = harness();
    await expect(runSimulatedServerCall({ ...h.options, provider: {
      // @ts-expect-error An untrusted runtime adapter must not enable a live provider.
      mode: 'live', generate: h.provider.generate,
    } })).rejects.toMatchObject({ code: 'simulation_provider_required' });
    expect(h.repository.read).not.toHaveBeenCalled(); expect(h.provider.generate).not.toHaveBeenCalled();
  });

  it.each(['action', 'proposal_batch', 'executor', 'quality', 'format'] as const)('rejects unsupported %s before claiming or dispatching', async variant => {
    const op = operation();
    if (variant === 'action') op.action = 'regenerate_image';
    if (variant === 'proposal_batch') {
      op.action = 'generate_proposals'; op.image!.output_count = 5;
      op.proposals = Array.from({ length: 5 }, (_, i) => ({ candidate_id: `candidate-${i}`, instruction: `Dirección ${i}`, reference_ids: [] }));
    }
    if (variant === 'executor') op.image!.executor = 'responses_image';
    if (variant === 'quality') op.image!.quality = 'auto';
    if (variant === 'format') op.image!.output_format = 'webp';
    const h = harness(op, [], { responses_image_enabled: true });
    await expect(h.run()).rejects.toMatchObject({ code: 'unsupported_simulation_operation' });
    expect(h.repository.commit).not.toHaveBeenCalled(); expect(h.provider.generate).not.toHaveBeenCalled();
  });

  it('loads actual ordered reference bytes once per version while keeping independent bytes for each reference role', async () => {
    const worldBytes = png(2, 2, 40), coinBytes = png(2, 2, 200);
    const world = imported(30, worldBytes), coin = imported(40, coinBytes), op = operation();
    op.context.references = [reference(coin, 'coin'), reference(world, 'world'),
      { ...reference(coin, 'coin-style'), roles: ['image_style_reference'] }];
    const h = harness(op, [{ version: world, bytes: worldBytes }, { version: coin, bytes: coinBytes }]);
    h.repository.conflicts.set('call_started', 2);
    h.provider.generate.mockImplementation(async ({ references }) => {
      expect(references.map(item => item.reference)).toEqual(op.context.references);
      expect(references.map(item => item.version)).toEqual([coin, world, coin]);
      expect(references.map(item => item.bytes)).toEqual([coinBytes, worldBytes, coinBytes]);
      references[0].bytes[0] = 0;
      expect(references[2].bytes).toEqual(coinBytes);
      expect(h.storage.objects.get(coin.storage.storage_key)).toEqual(coinBytes);
      return { bytes: outputPng.slice(), mimeType: 'image/png' };
    });
    expect((await h.run()).status).toBe('completed');
    expect(h.storage.get.mock.calls.map(([key]) => key)).toEqual([coin.storage.storage_key, world.storage.storage_key]);
    expect(h.repository.snapshot.assets.versions.at(-1)?.provenance).toMatchObject({ references: op.context.references });
  });

  it('fails a missing reference before a durable claim and without dispatch', async () => {
    const version = imported(30), op = operation(); op.context.references = [reference(version, 'world')];
    const h = harness(op, [{ version }]);
    await expect(h.run()).rejects.toMatchObject({ code: 'reference_file_unavailable' });
    expect(h.repository.commit).not.toHaveBeenCalled(); expect(h.provider.generate).not.toHaveBeenCalled();
    expect(h.call().attempt).toBeNull(); reserved(h);
  });

  it.each(['png_crc', 'dimensions', 'byte_count', 'mime'] as const)('rejects reference %s mismatch before a claim', async mismatch => {
    const bytes = smallPng.slice(), version = imported(30, bytes), op = operation();
    if (mismatch === 'png_crc') bytes[bytes.length - 1] ^= 1;
    if (mismatch === 'dimensions') version.storage.width = 3;
    if (mismatch === 'byte_count') version.storage.size_bytes++;
    if (mismatch === 'mime') version.storage.mime_type = 'image/jpeg';
    op.context.references = [reference(version, 'world')];
    const h = harness(op, [{ version, bytes }]);
    await expect(h.run()).rejects.toMatchObject({ code: 'invalid_reference_bytes' });
    expect(h.repository.commit).not.toHaveBeenCalled(); expect(h.provider.generate).not.toHaveBeenCalled();
    expect(h.call().attempt).toBeNull(); reserved(h);
  });
});

async function mediumHarness(combined = false, sameBytes = false) {
  const capture = imported(30), low = operation(); low.context.references = [reference(capture, 'capture')];
  const h = harness(low, [{ version: capture, bytes: smallPng }]);
  const first = await h.run();
  expect(first.status).toBe('completed');
  const candidate = { ...first.asset!, candidate_id: `candidate:${low.operation_key}` };
  const approval = { approval_id: uuid(70), actor_id: actor, candidate,
    immutable_elements: [...low.context.immutable_elements] };
  if (!combined) h.repository.snapshot = applyServerCommand(h.repository.snapshot, h.repository.policy, actor,
    { kind: 'approve_direction', approval }, 300).state;
  const op: DesignOperation = { ...structuredClone(low), operation_key: uuid(11),
    action: combined ? 'approve_and_generate_medium' : 'generate_medium', selected_candidates: [candidate],
    image: { ...low.image!, quality: 'medium' }, context: { ...structuredClone(low.context), base_asset: first.asset!,
      ...(!combined ? { direction_approval: { candidate, immutable_elements: approval.immutable_elements } } : {}) } };
  h.repository.snapshot = applyServerCommand(h.repository.snapshot, h.repository.policy, actor, { kind: 'enqueue', operation: op }, 301).state;
  h.repository.revision += 2;
  h.provider.generate.mockImplementation(async input => {
    expect(input.base?.version.identity).toEqual(first.asset);
    expect(input.base?.bytes).toEqual(outputPng);
    expect(input.references.map(item => item.reference.reference_id)).toEqual(['capture']);
    expect(input.references[0].bytes).toEqual(smallPng);
    return { bytes: (sameBytes ? outputPng : mediumPng).slice(), mimeType: 'image/png' };
  });
  const options = { ...h.options, operationKey: op.operation_key,
    callKey: h.repository.snapshot.jobs.jobs[1].calls[0].call_key, attemptId: uuid(91), now: () => 400 };
  return { ...h, op, candidate, first, options, run: () => runSimulatedServerCall(options) };
}

describe('simulation low direction and medium lineage', () => {
  it.each([false, true])('promotes exact low direction with real base bytes (combined approval: %s)', async combined => {
    const h = await mediumHarness(combined);
    expect(h.repository.snapshot.jobs.jobs[0].calls[0].state).toBe('needs_review');
    const result = await h.run(); expect(result.status).toBe('completed');
    expect(result.asset!.asset_id).toBe(h.first.asset!.asset_id);
    expect(result.asset!.version_id).not.toBe(h.first.asset!.version_id);
    const version = h.repository.snapshot.assets.versions.at(-1)!;
    expect(version.provenance).toMatchObject({ parent: h.first.asset, candidate_id: h.candidate.candidate_id,
      action: h.op.action, quality: 'medium', direction_approval_id: expect.any(String) });
    expect(h.repository.snapshot.jobs.jobs[1].calls[0]).toMatchObject({ state: 'needs_review', review: null,
      settlement: { actual_micro_usd: 0 } });
    expect(h.provider.generate).toHaveBeenCalledTimes(2);
    expect(h.storage.get.mock.calls.map(([key]) => key)).toEqual([
      `${business}/imported/${uuid(30)}/v1.png`, `${business}/generated/${attempt}/0.png`, `${business}/imported/${uuid(30)}/v1.png`,
    ]);
    expect((await h.run()).status).toBe('already_started');
    expect(h.provider.generate).toHaveBeenCalledTimes(2);
  });

  it('refuses identical parent bytes instead of inventing a distinct content hash', async () => {
    const h = await mediumHarness(false, true);
    expect(await h.run()).toMatchObject({ status: 'uncertain', error_code: 'result_parent_conflict' });
    expect(h.repository.snapshot.assets.versions).toHaveLength(2); // capture and original low only
    expect(h.repository.snapshot.jobs.jobs[1].calls[0].settlement).toBeNull();
    expect((await h.run()).status).toBe('already_started');
    expect(h.provider.generate).toHaveBeenCalledTimes(2);
  });

  it('requires persisted exact approval even if a caller changes the pending operation snapshot', async () => {
    const h = await mediumHarness(); h.repository.snapshot.assets.direction_approvals = [];
    await expect(h.run()).rejects.toMatchObject({ code: 'server_direction_not_recorded' });
    expect(h.provider.generate).toHaveBeenCalledTimes(1);
  });

  it('fails missing medium base bytes before another durable claim or dispatch', async () => {
    const h = await mediumHarness(); h.storage.objects.delete(`${business}/generated/${attempt}/0.png`);
    await expect(h.run()).rejects.toMatchObject({ code: 'reference_file_unavailable' });
    expect(h.repository.snapshot.jobs.jobs[1].calls[0].attempt).toBeNull();
    expect(h.provider.generate).toHaveBeenCalledTimes(1);
  });
});

function liveHarness(executor: 'image_api' | 'responses_image' = 'image_api', refs = false,
  profile: 'baseline' | 'flare_candidate' | 'sunburst_rescue' = 'baseline') {
  const op = operation(); op.image!.executor = executor; op.image!.profile = profile;
  const capture = imported(30); if (refs) op.context.references = [reference(capture, 'capture')];
  const h = harness(op, refs ? [{ version: capture, bytes: smallPng }] : [], { responses_image_enabled: true,
    enabled_image_profiles: [profile] });
  let pixels = outputPng, status = 200;
  const transport = vi.fn<typeof fetch>(async () => {
    expect(h.call().state).toBe('running');
    expect(h.repository.events[0]?.event).toBe('call_started');
    const b64 = Buffer.from(pixels).toString('base64');
    const body = executor === 'image_api' ? { data: [{ b64_json: b64, revised_prompt: 'Prompt del proveedor.' }],
      usage: { input_tokens: 12, output_tokens: 20, total_tokens: 32 } }
      : { id: 'resp_test', status: 'completed', output: [{ type: 'image_generation_call', id: 'ig_test', status: 'completed', result: b64,
        usage: { input_tokens: 12, output_tokens: 20, total_tokens: 32 } }],
        usage: { input_tokens: 100, output_tokens: 200, total_tokens: 300 } };
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'x-request-id': 'req_test' } });
  });
  const provider = createLiveImageProvider({ apiKey: 'fake-unit-test-key', responsesModel: 'test-text-model', fetch: transport });
  const permit: LiveExecutionPermit = { enabled: true, businessId: business, actorId: actor, policyId: h.repository.policy.policy_id,
    expiresAt: 10000, maxImageOutputs: 1, maxReservationMicroUsd: 100, approvedBudgetMicroUsd: 1000,
    approvedOperation: structuredClone(op), isolatedTargetApproved: true, expectedSupabaseOrigin: 'https://isolated.example.test' };
  const options: LiveWorkerInput = { ...h.options, provider, permit,
    target: { actualSupabaseOrigin: 'https://isolated.example.test', productionSupabaseOrigin: 'https://production.example.test' } };
  return { ...h, options, permit, transport, setPixels: (next: Uint8Array) => { pixels = next; },
    setStatus: (next: number) => { status = next; }, run: () => runLiveServerCall(options) };
}

describe('live worker, only injected fake HTTP transport and explicit trusted permits', () => {
  it.each(['image_api', 'responses_image'] as const)('recreates through %s using actual source and reference bytes, preserving the imported originals', async executor => {
    const h = liveHarness(executor, false, 'flare_candidate'), op = structuredClone(h.permit.approvedOperation);
    const imports = [30, 32, 34, 36].map((id, index) => { const bytes = png(2, 2, 60 + index); return { bytes, version: imported(id, bytes) }; });
    let state = createServerSnapshot(business, h.repository.policy);
    for (const item of imports) {
      state.assets = registerAssetVersion(state.assets, item.version);
      h.storage.objects.set(item.version.storage.storage_key, item.bytes);
    }
    op.action = 'recreate_asset'; op.image!.background = 'transparent';
    op.context.references = imports.map((item, index) => ({ ...reference(item.version, `ref-${index}`),
      roles: [index === 0 ? 'placement_context' : index === 3 ? 'image_style_reference' : 'object_reference'] }));
    op.context.base_asset = { ...imports[1].version.identity };
    h.permit.approvedOperation = structuredClone(op);
    h.repository.snapshot = applyServerCommand(state, h.repository.policy, actor, { kind: 'enqueue', operation: op }, 10).state;
    expect((await h.run()).status).toBe('completed'); expect(h.transport).toHaveBeenCalledTimes(1);
    expect(h.storage.get).toHaveBeenCalledTimes(4);
    const expected = [imports[1].bytes, ...imports.map(item => item.bytes)];
    if (executor === 'image_api') {
      const wire = h.transport.mock.calls[0][1]!.body as FormData, files = wire.getAll('image[]') as File[];
      expect(wire.get('background')).toBe('transparent'); expect(files).toHaveLength(5);
      for (let index = 0; index < files.length; index++) expect(new Uint8Array(await files[index].arrayBuffer())).toEqual(expected[index]);
    } else {
      const wire = JSON.parse(String(h.transport.mock.calls[0][1]!.body));
      expect(wire.tools[0]).toMatchObject({ action: 'edit', background: 'transparent' });
      expect(wire.input[0].content.slice(1).map((item: { image_url: string }) => item.image_url))
        .toEqual(expected.map(bytes => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`));
    }
    const output = h.repository.snapshot.assets.versions.at(-1)!;
    expect(output.provenance).toMatchObject({ kind: 'image_operation', action: 'recreate_asset', references: op.context.references });
    expect(output.provenance).not.toHaveProperty('parent'); expect(output.identity.asset_id).not.toBe(op.context.base_asset.asset_id);
    expect(h.repository.snapshot.assets.versions.slice(0, 4)).toEqual(imports.map(item => item.version));
    expect(h.call().state).toBe('needs_review'); expect(h.call().settlement).toBeNull();
    expect(h.storage.objects.get(output.storage.storage_key)).toEqual(outputPng);
    expect((await h.run()).status).toBe('already_started'); expect(h.transport).toHaveBeenCalledTimes(1); reserved(h);
  });

  it.each(['object_role', 'base_reference', 'transparent_background'])('blocks recreation missing %s before reading pixels or claiming a worker', async field => {
    const h = liveHarness('image_api', true), op = structuredClone(h.permit.approvedOperation);
    op.action = 'recreate_asset'; op.image!.background = 'transparent';
    const source = h.repository.snapshot.assets.versions[0]; op.context.base_asset = { ...source.identity };
    if (field === 'object_role') op.context.references[0].roles = ['image_style_reference'];
    if (field === 'base_reference') op.context.references = [];
    if (field === 'transparent_background') op.image!.background = 'opaque';
    h.repository.snapshot.jobs = createServerSnapshot(business, h.repository.policy).jobs;
    h.repository.snapshot = applyServerCommand(h.repository.snapshot, h.repository.policy, actor, { kind: 'enqueue', operation: op }, 10).state;
    h.permit.approvedOperation = structuredClone(op);
    await expect(h.run()).rejects.toMatchObject({ code: 'unsupported_live_operation' });
    expect(h.storage.get).not.toHaveBeenCalled(); expect(h.repository.commit).not.toHaveBeenCalled(); expect(h.transport).not.toHaveBeenCalled();
  });

  it('dispatches to an explicitly owner-approved development project without a fictional production origin', async () => {
    const h = liveHarness();
    delete h.permit.isolatedTargetApproved;
    h.permit.targetClassification = 'owner-approved-development';
    h.permit.targetApprovalId = 'fai-xending-pilot-2026-09-17';
    h.options.target = { actualSupabaseOrigin: h.permit.expectedSupabaseOrigin,
      expectedSupabaseOrigin: h.permit.expectedSupabaseOrigin, targetClassification: 'owner-approved-development',
      targetApprovalId: h.permit.targetApprovalId };
    expect((await h.run()).status).toBe('completed');
    expect(h.transport).toHaveBeenCalledTimes(1); reserved(h);
  });

  it('rejects a development permit without the matching trusted runtime acknowledgment before files or fetch', async () => {
    const h = liveHarness('image_api', true);
    h.permit.targetClassification = 'owner-approved-development'; h.permit.targetApprovalId = 'fai-xending-pilot-2026-09-17';
    await expect(h.run()).rejects.toThrow('live_development_target_not_approved');
    expect(h.transport).not.toHaveBeenCalled(); expect(h.storage.get).not.toHaveBeenCalled();
    expect(h.repository.commit).not.toHaveBeenCalled();
  });

  it('sends approved medium base bytes first, creates a child, and never settles its cost automatically', async () => {
    const h = await mediumHarness();
    const transport = vi.fn<typeof fetch>(async (_url, init) => {
      expect(h.repository.snapshot.jobs.jobs[1].calls[0].state).toBe('running');
      const files = (init!.body as FormData).getAll('image[]') as File[];
      expect(files).toHaveLength(2);
      expect(new Uint8Array(await files[0].arrayBuffer())).toEqual(outputPng);
      expect(new Uint8Array(await files[1].arrayBuffer())).toEqual(smallPng);
      expect((init!.body as FormData).get('quality')).toBe('medium');
      return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from(mediumPng).toString('base64') }] }),
        { status: 200, headers: { 'x-request-id': 'req_medium' } });
    });
    const template = liveHarness(); template.permit.approvedOperation = structuredClone(h.op);
    const options: LiveWorkerInput = { ...h.options, permit: template.permit, target: template.options.target,
      provider: createLiveImageProvider({ apiKey: 'fake-unit-key', responsesModel: 'test-text-model', fetch: transport }) };
    const result = await runLiveServerCall(options);
    expect(result.status).toBe('completed'); expect(result.asset!.asset_id).toBe(h.first.asset!.asset_id);
    expect(h.repository.snapshot.assets.versions.at(-1)?.provenance).toMatchObject({ parent: h.first.asset,
      candidate_id: h.candidate.candidate_id, direction_approval_id: expect.any(String), quality: 'medium' });
    expect(h.repository.snapshot.jobs.jobs[1].calls[0].settlement).toBeNull();
    expect(getQuotaUsage(h.repository.snapshot.jobs).committed_micro_usd).toBe(100);
    expect((await runLiveServerCall(options)).status).toBe('already_started'); expect(transport).toHaveBeenCalledTimes(1);
  });

  it('rejects content whose registered SHA256 identity does not match its valid PNG bytes', async () => {
    const h = liveHarness('image_api', true);
    const version = h.repository.snapshot.assets.versions[0]; version.identity.version_id = 'a'.repeat(64);
    const op = operation(); op.context.references = [reference(version, 'capture')];
    h.repository.snapshot.jobs = createServerSnapshot(business, h.repository.policy).jobs;
    h.repository.snapshot = applyServerCommand(h.repository.snapshot, h.repository.policy, actor, { kind: 'enqueue', operation: op }, 10).state;
    h.permit.approvedOperation = structuredClone(op);
    await expect(h.run()).rejects.toMatchObject({ code: 'invalid_reference_bytes' });
    expect(h.transport).not.toHaveBeenCalled(); expect(h.repository.commit).not.toHaveBeenCalled();
  });

  it.each(['image_api', 'responses_image'] as const)('allows explicitly enabled flare candidate only with exact %s operation approval', async executor => {
    const h = liveHarness(executor, false, 'flare_candidate');
    expect((await h.run()).status).toBe('completed');
    expect(h.repository.snapshot.assets.versions[0].provenance).toMatchObject({ model_id: 'gpt-image-2.5-flare' });
    const body = JSON.parse(String(h.transport.mock.calls[0][1]!.body));
    expect(executor === 'image_api' ? body.model : body.tools[0].model).toBe('gpt-image-2.5-flare');
    expect(h.transport).toHaveBeenCalledTimes(1); reserved(h);
  });

  it('blocks a flare candidate whose profile was disabled after enqueue', async () => {
    const h = liveHarness('image_api', false, 'flare_candidate'); h.repository.policy.enabled_image_profiles = ['baseline'];
    await expect(h.run()).rejects.toMatchObject({ code: 'live_policy_mismatch' });
    expect(h.transport).not.toHaveBeenCalled(); expect(h.repository.commit).not.toHaveBeenCalled();
  });

  it.each(['image_api', 'responses_image'] as const)('sends an explicitly selected Sunburst through %s once with its exact permit', async executor => {
    const h = liveHarness(executor, false, 'sunburst_rescue');
    expect((await h.run()).status).toBe('completed');
    const body = JSON.parse(String(h.transport.mock.calls[0][1]!.body));
    expect(executor === 'image_api' ? body.model : body.tools[0].model).toBe('gpt-image-2.5-sunburst');
    expect(h.repository.snapshot.assets.versions[0].provenance).toMatchObject({ model_id: 'gpt-image-2.5-sunburst' });
    expect((await h.run()).status).toBe('already_started'); expect(h.transport).toHaveBeenCalledTimes(1); reserved(h);
  });

  it('does not switch an approved Flare operation to Sunburst even if both are enabled', async () => {
    const h = liveHarness('image_api', false, 'sunburst_rescue');
    h.repository.policy.enabled_image_profiles.push('flare_candidate');
    h.permit.approvedOperation.image!.profile = 'flare_candidate';
    await expect(h.run()).rejects.toMatchObject({ code: 'live_permit_scope_mismatch' });
    expect(h.transport).not.toHaveBeenCalled(); expect(h.repository.commit).not.toHaveBeenCalled();
  });

  it.each([['image_api', false, '/v1/images/generations'], ['image_api', true, '/v1/images/edits'],
    ['responses_image', true, '/v1/responses']] as const)('dispatches %s with refs %s once after CAS to %s, retaining the real reservation', async (executor, refs, route) => {
    const h = liveHarness(executor, refs);
    const result = await h.run(); expect(result.status).toBe('completed');
    expect(h.transport).toHaveBeenCalledTimes(1);
    expect(String(h.transport.mock.calls[0][0])).toBe(`https://api.openai.com${route}`);
    expect(h.call()).toMatchObject({ state: 'needs_review', settlement: null, receipt: { request_id: 'req_test',
      usage: { input_tokens: 12, output_tokens: 20, total_tokens: 32 } } });
    expect(getQuotaUsage(h.repository.snapshot.jobs)).toEqual({ committed_micro_usd: 100, image_outputs: 1, unsettled_calls: 1 });
    expect(h.repository.snapshot.assets.versions.at(-1)?.provenance).toMatchObject({ model_id: 'gpt-image-2', quality: 'low' });
    expect(JSON.stringify(h.repository.snapshot)).not.toContain('fake-unit-test-key');
    expect(JSON.stringify(h.repository.snapshot)).not.toContain('b64_json');
    if (executor === 'responses_image') expect(h.call().receipt).toHaveProperty('response_usage.response.total_tokens', 300);
    expect((await h.run()).status).toBe('already_started'); expect(h.transport).toHaveBeenCalledTimes(1);
  });

  it.each(['absent', 'disabled', 'expired', 'business', 'actor', 'policy', 'scope', 'target', 'production', 'isolation', 'budget', 'count'] as const)
    ('rejects invalid %s permit before files, claim or HTTP dispatch', async variant => {
      const h = liveHarness('image_api', true);
      if (variant === 'absent') h.options.permit = undefined;
      if (variant === 'disabled') Object.assign(h.permit, { enabled: false });
      if (variant === 'expired') h.permit.expiresAt = 1;
      if (variant === 'business') h.permit.businessId = uuid(99);
      if (variant === 'actor') h.permit.actorId = uuid(99);
      if (variant === 'policy') h.permit.policyId = 'other-policy';
      if (variant === 'scope') h.permit.approvedOperation.context.target.revision = 'other-slide-revision';
      if (variant === 'target') h.options.target!.actualSupabaseOrigin = 'https://another.example.test';
      if (variant === 'production') h.options.target!.productionSupabaseOrigin = h.options.target!.actualSupabaseOrigin;
      if (variant === 'isolation') Object.assign(h.permit, { isolatedTargetApproved: false });
      if (variant === 'budget') h.permit.maxReservationMicroUsd = 99;
      if (variant === 'count') Object.assign(h.permit, { maxImageOutputs: 2 });
      await expect(h.run()).rejects.toThrow();
      expect(h.storage.get).not.toHaveBeenCalled(); expect(h.repository.commit).not.toHaveBeenCalled();
      expect(h.transport).not.toHaveBeenCalled(); expect(h.call().attempt).toBeNull();
    });

  it('allows one live dispatch when two workers race for the same operation', async () => {
    const h = liveHarness();
    const results = await Promise.all([h.run(), runLiveServerCall({ ...h.options, attemptId: uuid(91) })]);
    expect(results.map(result => result.status).sort()).toEqual(['already_started', 'completed']);
    expect(h.transport).toHaveBeenCalledTimes(1); expect(h.storage.putImmutable).toHaveBeenCalledTimes(1);
  });

  it.each(['claim', 'result'] as const)('never retries HTTP after an ambiguous %s acknowledgement', async phase => {
    const h = liveHarness(); h.repository.failure = { event: phase === 'claim' ? 'call_started' : 'output_recorded', phase: 'after' };
    expect((await h.run()).status).toBe('uncertain');
    expect(h.transport).toHaveBeenCalledTimes(phase === 'claim' ? 0 : 1);
    expect((await h.run()).status).toBe('already_started');
    expect(h.transport).toHaveBeenCalledTimes(phase === 'claim' ? 0 : 1); reserved(h);
  });

  it('records a provider timeout without automatic retry or releasing budget', async () => {
    const h = liveHarness(); h.transport.mockRejectedValue(new Error('secret upstream socket failure'));
    expect(await h.run()).toMatchObject({ status: 'uncertain' });
    expect(h.call().state).toBe('uncertain'); reserved(h);
    expect((await h.run()).status).toBe('already_started'); expect(h.transport).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(h.repository.snapshot)).not.toContain('secret');
  });

  it.each(['pixels', 'storage'] as const)('retains usage and request evidence after %s failure', async failure => {
    const h = liveHarness('responses_image');
    if (failure === 'pixels') h.setPixels(smallPng); else h.storage.failure = true;
    expect((await h.run()).status).toBe('uncertain');
    expect(h.call().receipt).toMatchObject({ outputs: [], request_id: 'req_test', usage: { total_tokens: 32 },
      response_usage: { response_id: 'resp_test', response: { total_tokens: 300 } } });
    expect(h.repository.snapshot.assets.versions).toHaveLength(0); reserved(h);
    expect(h.transport).toHaveBeenCalledTimes(1);
  });

  it('saves valid bytes from an incomplete response without approving or settling them', async () => {
    const h = liveHarness(); h.setStatus(500);
    const result = await h.run(); expect(result).toMatchObject({ status: 'uncertain', error_code: 'image_provider_error' });
    expect(h.call().state).toBe('uncertain'); expect(h.call().receipt?.outputs).toHaveLength(1);
    expect(h.repository.snapshot.assets.versions).toHaveLength(1); expect(h.storage.objects.size).toBe(1); reserved(h);
  });

  it.each(['disabled', 'viewer', 'expired', 'cancelled'] as const)('rechecks %s after wire preparation and before actual fetch', async change => {
    const h = liveHarness('image_api', true), provider = h.options.provider;
    h.options.provider = { mode: 'live', async generate(input) {
      if (change === 'disabled') h.repository.policy.enabled = false;
      if (change === 'viewer') h.repository.role = 'viewer';
      if (change === 'expired') h.options.now = () => 20000;
      if (change === 'cancelled') h.repository.snapshot = applyServerCommand(h.repository.snapshot, h.repository.policy, actor,
        { kind: 'cancel', operation_key: operation().operation_key }, 200).state;
      return provider.generate(input);
    } };
    // Closure deliberately lets the runtime clock advance during async preparation.
    if (change === 'expired') { let ticks = 100; h.options.now = () => ticks;
      const generate = h.options.provider.generate; h.options.provider.generate = async input => { ticks = 20000; return generate(input); }; }
    expect((await h.run()).status).toBe('uncertain');
    expect(h.transport).not.toHaveBeenCalled(); reserved(h);
  });
});
