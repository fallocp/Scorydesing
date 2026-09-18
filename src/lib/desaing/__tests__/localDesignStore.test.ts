import { describe, expect, it } from 'vitest';
import { LocalDesignStore, openBrowserDesignStore } from '../localDesignStore';
import type { LocalExclusiveLock, LocalKeyValueStorage } from '../localDesignStore';
import { beginJobCall, beginJobValidation, enqueueImageJob, finishJobValidation, getQuotaUsage, recordJobResult, recoverImageJobs, reviewJobCall } from '../../../../supabase/functions/_shared/desaing/jobLedger';
import { registerAssetVersion, reviewAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import type { RegisteredAssetVersion } from '../../../../supabase/functions/_shared/desaing/assets';
import { normalizeImageResponse } from '../../../../supabase/functions/_shared/desaing/imageResponse';
import { environment, imageOperation } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures';

/** Test doubles exercise the serialization/transaction contract, not browser implementation internals. */
class MemoryStorage implements LocalKeyValueStorage {
  values = new Map<string, string>();
  denied = false;
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) {
    if (this.denied) throw new Error('storage_quota_exceeded');
    this.values.set(key, value);
  }
}
class SerialLocks implements LocalExclusiveLock {
  private tails = new Map<string, Promise<unknown>>();
  async runExclusive<T>(name: string, callback: () => T): Promise<T> {
    const previous = this.tails.get(name) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(callback);
    this.tails.set(name, next);
    return next;
  }
}
const policy = { policy_id: 'lab-policy', limit_micro_usd: 100, max_image_outputs: 1 };
function fixture() {
  const storage = new MemoryStorage(), locks = new SerialLocks();
  return { storage, locks, store: new LocalDesignStore(storage, locks, 'business-a', policy) };
}
function enqueue(store: LocalDesignStore, operation = imageOperation()) {
  return store.transact(state => {
    const queued = enqueueImageJob(state.jobs, operation, environment(operation), [100], 10);
    return { state: { ...state, jobs: queued.ledger }, result: queued.job };
  });
}
function generatedVersion(): RegisteredAssetVersion {
  const op = imageOperation();
  return {
    identity: { business_id: 'business-a', asset_id: 'plane', version_id: 'v1' },
    brand_id: op.context.brand_id, project_id: op.context.project_id,
    storage: { storage_key: 'business-a/experimental/plane/v1.png', mime_type: 'image/png', width: 1024, height: 1024, size_bytes: 100 },
    provenance: { kind: 'image_operation', operation_key: op.operation_key, output_index: 0,
      action: 'generate_image', model_id: 'gpt-image-2', quality: 'low', effective_prompt: op.context.instruction,
      revised_prompt: null, references: [], immutable_elements: [...op.context.immutable_elements] },
  };
}

describe('persistent local design transaction adapter', () => {
  it('serializes two tabs double-clicking one operation into one reservation', async () => {
    const { storage, locks, store } = fixture();
    const otherTab = new LocalDesignStore(storage, locks, 'business-a', policy);
    const [first, second] = await Promise.all([enqueue(store), enqueue(otherTab)]);
    expect(first.operation_key).toBe(second.operation_key);
    const state = await store.read();
    expect(state.jobs.jobs).toHaveLength(1);
    expect(getQuotaUsage(state.jobs).committed_micro_usd).toBe(100);
    expect(storage.values.size).toBe(1);
  });
  it('cannot overbook quota when separate operations race in different clients', async () => {
    const { storage, locks, store } = fixture();
    const other = new LocalDesignStore(storage, locks, 'business-a', policy);
    const op = imageOperation(); op.operation_key = 'second-operation';
    const results = await Promise.allSettled([enqueue(store), enqueue(other, op)]);
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect((await store.read()).jobs.jobs).toHaveLength(1);
  });
  it('reopens serialized state in a new store and recovers expired work without clearing the quota', async () => {
    const { store, storage, locks } = fixture();
    const job = await enqueue(store);
    await store.transact(state => ({ state: { ...state,
      jobs: beginJobCall(state.jobs, job.operation_key, job.calls[0].call_key, 'attempt-one', 20, 100) }, result: null }));
    const reopened = new LocalDesignStore(storage, locks, 'business-a', policy);
    await reopened.transact(state => ({ state: { ...state, jobs: recoverImageJobs(state.jobs, 120) }, result: null }));
    const restored = await reopened.read();
    expect(restored.jobs.jobs[0].calls[0].state).toBe('uncertain');
    expect(restored.jobs.policy.limit_micro_usd).toBe(100);
    expect(getQuotaUsage(restored.jobs).committed_micro_usd).toBe(100);
    expect(restored.jobs.jobs[0].plan.operation.context.target.slide_id).toBe('slide-2');
  });
  it('requires explicit policy migration when configured quotas change instead of silently resetting capacity', async () => {
    const { store, storage, locks } = fixture();
    await enqueue(store);
    const changed = new LocalDesignStore(storage, locks, 'business-a', { ...policy, limit_micro_usd: 1 });
    await expect(changed.read()).rejects.toThrow('local_policy_mismatch');
    await expect(enqueue(changed)).rejects.toThrow('local_policy_mismatch');
    expect((await store.read()).jobs.jobs).toHaveLength(1);
  });
  it('commits asset metadata and result together and rejects a missing output or unrelated version', async () => {
    const { store } = fixture();
    const job = await enqueue(store);
    await store.transact(state => ({ state: { ...state,
      jobs: beginJobCall(state.jobs, job.operation_key, job.calls[0].call_key, 'attempt-one', 20, 100) }, result: null }));
    const version = generatedVersion();
    const result = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'aW1hZ2U=' }] }, duration_ms: 1, expected_outputs: 1 });
    const receipt = (jobs: Parameters<typeof recordJobResult>[0]) => recordJobResult(jobs, job.operation_key,
      job.calls[0].call_key, 'attempt-one', result, [{ index: 0, asset: version.identity }], 30);
    await expect(store.transact(state => ({ state: { ...state, jobs: receipt(state.jobs) }, result: null }))).rejects.toThrow();
    expect((await store.read()).jobs.jobs[0].calls[0].state).toBe('running');
    const unrelated = structuredClone(version);
    unrelated.provenance = { kind: 'imported', origin: 'existing_library' };
    await expect(store.transact(state => ({ state: { ...state, jobs: receipt(state.jobs),
      assets: registerAssetVersion(state.assets, unrelated) }, result: null }))).rejects.toThrow('local_output_provenance_mismatch');
    expect((await store.read()).assets.versions).toHaveLength(0);
    await store.transact(state => ({ state: { ...state, jobs: receipt(state.jobs),
      assets: registerAssetVersion(state.assets, version) }, result: null }));
    const restored = await store.read();
    expect(restored.jobs.jobs[0].calls[0].state).toBe('result_received');
    expect(restored.assets.versions[0]).toEqual(version);
    const review = { review_id: 'review-one', actor_id: 'actor-a', asset: version.identity,
      decision: 'approved' as const, reason: 'Reviewed in its target composition.' };
    // An asset cannot bypass output validation and job review by writing only the catalog decision.
    await expect(store.transact(state => ({ state: { ...state,
      assets: reviewAssetVersion(state.assets, review) }, result: null }))).rejects.toThrow('local_output_review_mismatch');
    await store.transact(state => {
      let jobs = beginJobValidation(state.jobs, job.operation_key, job.calls[0].call_key, 31);
      jobs = finishJobValidation(jobs, job.operation_key, job.calls[0].call_key, true, 32);
      jobs = reviewJobCall(jobs, job.operation_key, job.calls[0].call_key, 'approved', 'actor-a', 33);
      return { state: { ...state, jobs, assets: reviewAssetVersion(state.assets, review) }, result: null };
    });
    const reviewed = await store.read();
    expect(reviewed.jobs.jobs[0].calls[0].state).toBe('approved');
    expect(reviewed.assets.reviews[0].decision).toBe('approved');
  });
  it('leaves the previous state intact on quota/storage errors and returns no dispatchable work', async () => {
    const { store, storage } = fixture();
    await enqueue(store);
    const before = [...storage.values.values()][0];
    storage.denied = true;
    await expect(store.transact(state => {
      const job = state.jobs.jobs[0];
      return { state: { ...state, jobs: beginJobCall(state.jobs, job.operation_key, job.calls[0].call_key,
        'attempt-one', 20, 100) }, result: job };
    })).rejects.toThrow('storage_quota_exceeded');
    expect([...storage.values.values()][0]).toBe(before);
    expect((await store.read()).jobs.jobs[0].calls[0].state).toBe('pending');
  });
  it('rejects an edited child of a different base even when the operation, business and model match', async () => {
    const { store } = fixture();
    const base = generatedVersion(); base.provenance = { kind: 'imported', origin: 'upload' };
    const otherBase = structuredClone(base);
    otherBase.identity.asset_id = 'different-plane';
    otherBase.storage.storage_key = 'business-a/experimental/different-plane/v1.png';
    await store.transact(state => ({ state: { ...state,
      assets: registerAssetVersion(registerAssetVersion(state.assets, base), otherBase) }, result: null }));
    const op = imageOperation(); op.action = 'edit_image'; op.context.base_asset = base.identity;
    const job = await enqueue(store, op);
    await store.transact(state => ({ state: { ...state,
      jobs: beginJobCall(state.jobs, job.operation_key, job.calls[0].call_key, 'attempt-edit', 20, 100) }, result: null }));
    const child = generatedVersion();
    child.identity = { ...otherBase.identity, version_id: 'v2' };
    child.storage.storage_key = 'business-a/experimental/different-plane/v2.png';
    if (child.provenance.kind !== 'image_operation') throw new Error('Invalid fixture');
    child.provenance.action = 'edit_image'; child.provenance.parent = otherBase.identity;
    const result = normalizeImageResponse({ status: 200, body: { data: [{ b64_json: 'aW1hZ2U=' }] }, duration_ms: 1, expected_outputs: 1 });
    await expect(store.transact(state => ({ state: { ...state,
      assets: registerAssetVersion(state.assets, child), jobs: recordJobResult(state.jobs, job.operation_key,
        job.calls[0].call_key, 'attempt-edit', result, [{ index: 0, asset: child.identity }], 30) }, result: null })))
      .rejects.toThrow('local_output_parent_mismatch');
    expect((await store.read()).assets.versions).toHaveLength(2);
    expect((await store.read()).jobs.jobs[0].calls[0].state).toBe('running');
  });
  it('fails closed on corrupted JSON or future schema instead of silently starting another empty queue', async () => {
    const { store, storage } = fixture();
    await enqueue(store);
    const key = [...storage.values.keys()][0];
    const original = JSON.parse(storage.values.get(key)!);
    storage.values.set(key, '{broken');
    await expect(store.read()).rejects.toThrow('corrupt_local_design_json');
    storage.values.set(key, JSON.stringify({ ...original, schema_version: 2 }));
    await expect(enqueue(store)).rejects.toThrow('incompatible_local_design_state');
    expect(JSON.parse(storage.values.get(key)!).schema_version).toBe(2);
  });
  it('separates tenant storage and returns snapshots detached from saved data', async () => {
    const { store, storage, locks } = fixture();
    const saved = await enqueue(store);
    saved.plan.operation.context.instruction = 'mutated outside transaction';
    const snapshot = await store.read(); snapshot.assets.business_id = 'business-b';
    expect((await store.read()).assets.business_id).toBe('business-a');
    expect((await store.read()).jobs.jobs[0].plan.operation.context.instruction).not.toBe('mutated outside transaction');
    const other = new LocalDesignStore(storage, locks, 'business-b', policy);
    expect((await other.read()).jobs.jobs).toEqual([]);
  });
  it('does not commit if a change throws or the returned value is uncloneable', async () => {
    const { store, storage } = fixture();
    await expect(store.transact(() => { throw new Error('validation failed'); })).rejects.toThrow('validation failed');
    await expect(store.transact(state => ({ state, result: () => 'function' }))).rejects.toThrow();
    expect(storage.values.size).toBe(0);
  });
  it('rejects a missing Web Locks environment instead of using an unsafe in-memory fallback', () => {
    expect(() => openBrowserDesignStore('business-a', policy)).toThrow('local_transaction_support_unavailable');
  });
});
