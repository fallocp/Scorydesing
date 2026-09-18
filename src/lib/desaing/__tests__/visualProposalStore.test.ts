import { describe, expect, it } from 'vitest';
import { createVisualProposalStore, openVisualProposalStore, type AtomicVisualProposalStorage, type VisualProposalDraft,
  type VisualProposalDraftRecord, type VisualProposalStoreScope } from '../visualProposalStore';
import { beginExploration, createExplorationSession, finishExploration, refineTextIdea } from '../../../../supabase/functions/_shared/desaing/exploration';
import { bindVisualProposalOperation, createVisualProposalSet, syncVisualProposalSet } from '../../../../supabase/functions/_shared/desaing/visualProposals';
import { context, request, result } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures/explorationFixture';
import type { DesignOperation } from '../../../../supabase/functions/_shared/desaing/contracts';

class MemoryStorage implements AtomicVisualProposalStorage {
  values = new Map<string, unknown>(); denied = false; closes = 0;
  private tail: Promise<unknown> = Promise.resolve();
  async read(key: string) { return structuredClone(this.values.get(key) ?? null); }
  update(key: string, change: (previous: unknown | null) => VisualProposalDraftRecord) {
    const result = this.tail.catch(() => {}).then(() => {
      const next = structuredClone(change(structuredClone(this.values.get(key) ?? null)));
      if (this.denied) throw new Error('QuotaExceededError');
      this.values.set(key, next); return structuredClone(next);
    });
    this.tail = result; return result;
  }
  close() { this.closes++; }
}
const scope: VisualProposalStoreScope = { actor_id: 'actor', business_id: 'business', session_id: 'session' };
function session(target = scope) {
  const req = request(); req.context = { ...context(), ...target };
  return finishExploration(beginExploration(createExplorationSession(req.context, 'asset_in_region'), req), result());
}
function draft(target = scope): VisualProposalDraft { return { sets: [createVisualProposalSet(session(target), 'request-1')], submissions: {} }; }
function fixture() { const storage = new MemoryStorage(); return { storage, store: createVisualProposalStore(scope, storage) }; }
function prepared(): VisualProposalDraft {
  const value = draft(), set = value.sets[0];
  const operation: DesignOperation = { operation_key: 'render-1', action: 'generate_image',
    context: { ...set.context, instruction: set.candidates[0].instruction },
    image: { profile: 'baseline', quality: 'low', size: { width: 1024, height: 1024 }, output_format: 'png', background: 'opaque', output_count: 1, executor: 'image_api' } };
  value.sets[0] = bindVisualProposalOperation(set, set.candidates[0].id, operation, session(), set.context);
  value.submissions[operation.operation_key] = { state: 'saved' }; return value;
}

describe('isolated local visual proposal journal', () => {
  it('restores exact operation and source versions without duplicating capture bytes or sharing mutable caller state', async () => {
    const { storage, store } = fixture(), input = prepared();
    expect(await store.read()).toBeNull();
    const saving = store.write(0, input); input.sets[0].candidates[0].title = 'changed';
    const saved = await saving; saved.value.sets[0].candidates[0].operation!.context.instruction = 'changed';
    const reopened = await createVisualProposalStore(scope, storage).read();
    expect(reopened!.value).toEqual(prepared()); expect(reopened!.value).not.toHaveProperty('capture');
    expect(reopened!.revision).toBe(1);
  });
  it('uses an atomic CAS across tabs and refuses stale overwrites of an admitted operation', async () => {
    const { storage, store } = fixture(), other = createVisualProposalStore(scope, storage);
    const results = await Promise.allSettled([store.write(0, prepared()), other.write(0, prepared())]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const submitted = prepared(); submitted.submissions['render-1'] = { state: 'submitting' };
    await other.write(1, submitted);
    await expect(store.write(1, prepared())).rejects.toThrow('visual_proposal_revision_conflict');
    expect((await store.read())!.value.submissions['render-1'].state).toBe('submitting');
  });
  it('separates actor/business/session keys and validates every write against a frozen scope', async () => {
    const storage = new MemoryStorage(), mutable = { ...scope }, store = createVisualProposalStore(mutable, storage);
    mutable.business_id = 'changed'; await store.write(0, draft());
    const targets = [{ ...scope, actor_id: 'other' }, { ...scope, business_id: 'other' }, { ...scope, session_id: 'other' },
      { actor_id: 'a:b', business_id: 'c', session_id: 'd' }, { actor_id: 'a', business_id: 'b:c', session_id: 'd' }];
    for (const target of targets) {
      await expect(store.write(1, draft(target))).rejects.toThrow('visual_proposal_store_scope_mismatch');
      await createVisualProposalStore(target, storage).write(0, draft(target));
    }
    expect(storage.values.size).toBe(6);
  });
  it('keeps all five directions and the previous CAS revision intact when storage quota prevents saving admission', async () => {
    const { storage, store } = fixture(); await store.write(0, draft()); storage.denied = true;
    await expect(store.write(1, prepared())).rejects.toThrow('QuotaExceededError');
    const value = await store.read();
    expect(value!.revision).toBe(1); expect(value!.value.sets[0].candidates).toHaveLength(5);
    expect(value!.value.sets[0].candidates.every(candidate => !candidate.operation)).toBe(true);
  });
  it('allows append-only refinement while refusing replaced operations, removed alternatives and changed ancestry', async () => {
    const { store } = fixture(), original = prepared(); await store.write(0, original);
    const next = structuredClone(original), refined = refineTextIdea(session(), original.sets[0].candidates[0].selection, 'De perfil');
    next.sets[0] = syncVisualProposalSet(next.sets[0], refined); await store.write(1, next);
    const replaced = structuredClone(next); replaced.sets[0].candidates[0].operation!.operation_key = 'new-render';
    replaced.submissions = { 'new-render': { state: 'saved' } };
    await expect(store.write(2, replaced)).rejects.toThrow('visual_proposal_history_conflict');
    const removed = structuredClone(next); removed.sets[0].candidates.splice(2, 1);
    await expect(store.write(2, removed)).rejects.toThrow('visual_proposal_history_conflict');
    const changed = structuredClone(next); changed.sets[0].candidates[1].title = 'Different idea';
    await expect(store.write(2, changed)).rejects.toThrow('visual_proposal_history_conflict');
    expect((await store.read())!.value.sets[0].candidates).toHaveLength(6);
  });
  it('preserves uncertain/confirmed submissions across reload and rejects transitions that could dispatch them again', async () => {
    const { store } = fixture(), value = prepared(); value.submissions['render-1'] = { state: 'submitting' };
    await store.write(0, value);
    value.submissions['render-1'] = { state: 'uncertain', error_code: 'outcome_unknown' }; await store.write(1, value);
    for (const state of ['saved', 'submitting'] as const) {
      const repeat = structuredClone(value); repeat.submissions['render-1'] = { state };
      await expect(store.write(2, repeat)).rejects.toThrow('visual_proposal_submission_conflict');
    }
    value.submissions['render-1'] = { state: 'confirmed' }; await store.write(2, value);
    value.submissions['render-1'] = { state: 'uncertain' };
    await expect(store.write(3, value)).rejects.toThrow('visual_proposal_submission_conflict');
  });
  it('retains one upload identity per set and rejects unrelated uploads, changed ids and capture blobs', async () => {
    const { store } = fixture(), value = draft();
    value.uploads = { [value.sets[0].id]: { upload_id: 'stable-capture-upload' } }; await store.write(0, value);
    const changed = structuredClone(value); changed.uploads![value.sets[0].id].upload_id = 'duplicate-upload';
    await expect(store.write(1, changed)).rejects.toThrow('visual_proposal_upload_conflict');
    await expect(store.write(1, { ...value, uploads: { missing: { upload_id: 'missing' } } })).rejects.toThrow('invalid_visual_proposal_upload');
    await expect(store.write(1, { ...value, capture: new Blob(['capture']) } as VisualProposalDraft)).rejects.toThrow('invalid_visual_proposal_draft');
  });
  it('never resets corrupted or foreign persisted records to an empty journal', async () => {
    const { store, storage } = fixture(); await store.write(0, draft());
    const key = [...storage.values.keys()][0], corrupted = { revision: 1, value: draft({ ...scope, actor_id: 'other' }) };
    storage.values.set(key, corrupted);
    await expect(store.read()).rejects.toThrow('visual_proposal_store_scope_mismatch');
    await expect(store.write(1, draft())).rejects.toThrow('visual_proposal_store_scope_mismatch');
    expect(storage.values.get(key)).toEqual(corrupted);
  });
  it('rejects invalid revisions, unknown submissions and use after close; IndexedDB absence fails explicitly', async () => {
    const { store, storage } = fixture();
    for (const revision of [-1, NaN, 0.5, Number.MAX_SAFE_INTEGER]) await expect(store.write(revision, draft())).rejects.toThrow('invalid_visual_proposal_revision');
    await expect(store.write(0, { ...draft(), submissions: { unknown: { state: 'confirmed' } } })).rejects.toThrow('invalid_visual_proposal_submission');
    store.close(); store.close(); expect(storage.closes).toBe(1);
    await expect(store.read()).rejects.toThrow('visual_proposal_store_closed');
    await expect(store.write(0, draft())).rejects.toThrow('visual_proposal_store_closed');
    if (typeof indexedDB === 'undefined') await expect(openVisualProposalStore(scope)).rejects.toThrow('visual_proposal_indexed_db_unavailable');
  });
});
