import { describe, expect, it } from 'vitest';
import { createExplorationStore, openExplorationStore } from '../explorationStore';
import type { AtomicExplorationStorage, ExplorationDraft, ExplorationDraftRecord, ExplorationStoreScope } from '../explorationStore';
import { context } from '../../../../supabase/functions/_shared/desaing/__tests__/fixtures';
import { beginExploration, finishExploration, selectTextIdea } from '../../../../supabase/functions/_shared/desaing/exploration';

/** The same atomic contract as an IDB readwrite transaction, shared by both clients. */
class MemoryStorage implements AtomicExplorationStorage {
  values = new Map<string, unknown>();
  denied = false;
  closes = 0;
  private tail: Promise<unknown> = Promise.resolve();
  async read(key: string) { return structuredClone(this.values.get(key) ?? null); }
  update(key: string, change: (previous: unknown | null) => ExplorationDraftRecord) {
    const result = this.tail.catch(() => {}).then(() => {
      const next = structuredClone(change(structuredClone(this.values.get(key) ?? null)));
      if (this.denied) throw new Error('QuotaExceededError');
      this.values.set(key, next);
      return structuredClone(next);
    });
    this.tail = result;
    return result;
  }
  close() { this.closes += 1; }
}
const scope: ExplorationStoreScope = { actor_id: 'actor-a', business_id: 'business-a', session_id: 'session-a' };
const png = () => new Blob([new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 0])], { type: 'image/png' });
function draft(target = scope): ExplorationDraft {
  return {
    session: {
      schema_version: 1, revision: 0,
      context: { ...context(), ...target, interaction_mode: 'explore_design' },
      scope: 'asset_in_region', messages: [], sets: [], attempts: [], selected: null, render_bindings: [],
    },
    capture: png(), capture_name: 'portada.png', brief: 'Cinco ideas para esta portada',
    region: { x: 20, y: 30, width: 200, height: 150 },
  };
}
function fixture(target = scope) {
  const storage = new MemoryStorage();
  return { storage, store: createExplorationStore(target, storage) };
}

describe('local exploration continuity', () => {
  it('keeps full-design copy and capture in a separate session without rewriting piece history', async () => {
    const { storage, store } = fixture();
    await store.write(0, draft());
    const fullScope = { ...scope, session_id: `${scope.session_id}:full_design` }, full = draft(fullScope);
    full.session.scope = 'full_design'; full.approved_copy = 'Título aprobado\nTexto literal'; full.brief = 'Diseño completo';
    const fullStore = createExplorationStore(fullScope, storage); await fullStore.write(0, full);
    const restored = await createExplorationStore(fullScope, storage).read();
    expect(restored?.value.approved_copy).toBe(full.approved_copy);
    expect(restored?.value.session.scope).toBe('full_design');
    expect(await restored!.value.capture!.arrayBuffer()).toEqual(await full.capture!.arrayBuffer());
    expect((await store.read())?.value).toEqual(draft());
    await expect(fullStore.write(1, { ...full, approved_copy: 'x'.repeat(4001) })).rejects.toThrow('invalid_exploration_copy');
    await expect(store.write(1, full)).rejects.toThrow('exploration_store_scope_mismatch');
  });
  it('reopens the full session, original PNG blob, brief and region as detached snapshots', async () => {
    const { storage, store } = fixture();
    expect(await store.read()).toBeNull();
    const input = draft();
    const saving = store.write(0, input);
    input.brief = 'mutated while the PNG was being checked';
    const saved = await saving;
    expect(saved.revision).toBe(1);
    saved.value.brief = 'mutated return';
    const restored = await createExplorationStore(scope, storage).read();
    expect(restored!.value.brief).toBe('Cinco ideas para esta portada');
    expect(restored!.value.session.context.target).toEqual(context().target);
    expect(restored!.value.region).toEqual(input.region);
    expect(restored!.value.capture).toBeInstanceOf(Blob);
    expect(await restored!.value.capture!.arrayBuffer()).toEqual(await png().arrayBuffer());
  });

  it('allows only one tab to claim a revision before planning and never overwrites its result', async () => {
    const { storage, store } = fixture();
    const second = createExplorationStore(scope, storage);
    const results = await Promise.allSettled([store.write(0, draft()), second.write(0, draft())]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1);
    const rejected = results.find(result => result.status === 'rejected') as PromiseRejectedResult;
    expect(rejected.reason.message).toBe('exploration_revision_conflict');
    const next = draft(); next.brief = 'new feedback';
    await second.write(1, next);
    await expect(store.write(1, draft())).rejects.toThrow('exploration_revision_conflict');
    expect((await store.read())!.value.brief).toBe('new feedback');
  });

  it('separates actor, business and session even when identifiers contain delimiters', async () => {
    const storage = new MemoryStorage();
    const scopes = [scope,
      { ...scope, actor_id: 'another-actor' }, { ...scope, business_id: 'another-business' },
      { ...scope, session_id: 'another-session' },
      { actor_id: 'a:b', business_id: 'c', session_id: 'd' },
      { actor_id: 'a', business_id: 'b:c', session_id: 'd' }];
    for (const target of scopes) await createExplorationStore(target, storage).write(0, draft(target));
    expect(storage.values.size).toBe(scopes.length);
    const other = createExplorationStore({ ...scope, actor_id: 'unused-actor' }, storage);
    expect(await other.read()).toBeNull();
  });

  it('rejects a copied or corrupted record without replacing it with a new empty session', async () => {
    const { storage, store } = fixture();
    await store.write(0, draft());
    const [key] = storage.values.keys();
    const original = structuredClone(storage.values.get(key)) as ExplorationDraftRecord;
    original.value.session.context.business_id = 'another-business';
    storage.values.set(key, original);
    await expect(store.read()).rejects.toThrow();
    await expect(store.write(1, draft())).rejects.toThrow();
    expect(storage.values.get(key)).toEqual(original);
    storage.values.set(key, { revision: 1, value: { ...draft(), session: {} } });
    await expect(store.read()).rejects.toThrow();
    await expect(store.write(0, draft())).rejects.toThrow();
  });

  it('checks scope on each write and freezes scope against external mutation', async () => {
    const mutableScope = { ...scope };
    const { store, storage } = fixture(mutableScope);
    mutableScope.actor_id = 'changed-after-open';
    await store.write(0, draft());
    for (const field of ['actor_id', 'business_id', 'session_id'] as const) {
      await expect(store.write(1, draft({ ...scope, [field]: 'other' }))).rejects.toThrow('exploration_store_scope_mismatch');
    }
    expect(storage.values.size).toBe(1);
    expect((await store.read())!.revision).toBe(1);
  });

  it('keeps the prior session and blob intact after a quota failure', async () => {
    const { store, storage } = fixture();
    await store.write(0, draft());
    storage.denied = true;
    const next = draft(); next.brief = 'not saved'; next.capture = null; next.capture_name = null;
    await expect(store.write(1, next)).rejects.toThrow('QuotaExceededError');
    const restored = await store.read();
    expect(restored!.revision).toBe(1);
    expect(restored!.value.capture).toBeInstanceOf(Blob);
    expect(restored!.value.brief).not.toBe('not saved');
  });

  it('rejects oversized, disguised or incorrectly named captures before committing', async () => {
    const { store, storage } = fixture();
    const invalid = [
      { capture: new Blob(['not png!'], { type: 'image/png' }), capture_name: 'fake.png' },
      { capture: new Blob([new Uint8Array(8 * 1024 * 1024 + 1)], { type: 'image/png' }), capture_name: 'large.png' },
      { capture: new Blob(['jpegbytes'], { type: 'image/jpeg' }), capture_name: 'photo.jpg' },
      { capture: png(), capture_name: '' }, { capture: null, capture_name: 'missing.png' },
    ];
    for (const change of invalid) await expect(store.write(0, { ...draft(), ...change })).rejects.toThrow();
    expect(storage.values.size).toBe(0);
    await expect(store.write(0, { ...draft(), capture: null, capture_name: null })).resolves.toMatchObject({ revision: 1 });
  });

  it('bounds persisted fields and rejects invalid revisions or region geometry', async () => {
    const { store, storage } = fixture();
    for (const revision of [-1, 0.5, NaN, Number.MAX_SAFE_INTEGER]) {
      await expect(store.write(revision, draft())).rejects.toThrow('invalid_exploration_revision');
    }
    await expect(store.write(0, { ...draft(), brief: 'a'.repeat(16_001) })).rejects.toThrow('invalid_exploration_brief');
    for (const change of [{ x: -1 }, { width: 0 }, { height: Infinity }, { y: NaN }]) {
      await expect(store.write(0, { ...draft(), region: { ...draft().region!, ...change } }))
        .rejects.toThrow('invalid_exploration_region');
    }
    expect(storage.values.size).toBe(0);
  });

  it('does not accept an invented prepared idea or a source from a different scope', async () => {
    const { store } = fixture();
    const input = draft();
    input.prepared_idea = {
      selection: { set_id: 'missing', idea_id: 'missing', version: 1 }, instruction: 'render this idea',
      original_brief: input.brief, context: input.session.context,
    };
    await expect(store.write(0, input)).rejects.toThrow('invalid_exploration_prepared_selection');
  });

  it('retains the prepared idea source without changing it into an image or an authorization', async () => {
    const { store } = fixture();
    const input = draft();
    const request = { request_key: 'five-directions', kind: 'directions' as const, scope: input.session.scope,
      context: input.session.context, message: input.brief, history: [] };
    input.session = finishExploration(beginExploration(input.session, request), {
      request_key: request.request_key, message: 'Cinco direcciones para revisar.', response_id: null, usage: null,
      ideas: Array.from({ length: 5 }, (_, index) => ({ title: `Idea ${index}`, rationale: 'Encaja en la portada.',
        aspects: { subject: `Avión ${index}`, composition: 'Diagonal', style: 'Editorial', palette: 'Azul' },
        render_instruction: `Dibuja el avión ${index}.`, reference_ids: [] })),
    });
    const selection = { set_id: request.request_key, idea_id: `${request.request_key}:idea:1`, version: 1 };
    input.session = selectTextIdea(input.session, selection);
    input.prepared_idea = { selection, instruction: 'Dibuja el avión 0.', original_brief: input.brief,
      context: input.session.context };
    await store.write(0, input);
    const restored = await store.read();
    expect(restored!.value.prepared_idea).toEqual(input.prepared_idea);
    expect(restored!.value.session.render_bindings).toEqual([]);
    input.prepared_idea.context = { ...input.prepared_idea.context, actor_id: 'another-actor' };
    await expect(store.write(1, input)).rejects.toThrow('exploration_store_scope_mismatch');
    expect((await store.read())!.revision).toBe(1);
  });

  it('closes deliberately and never falls back to a nonpersistent browser store', async () => {
    const { storage, store } = fixture();
    store.close(); store.close();
    expect(storage.closes).toBe(1);
    await expect(store.read()).rejects.toThrow('exploration_store_closed');
    await expect(store.write(0, draft())).rejects.toThrow('exploration_store_closed');
    await expect(openExplorationStore(scope)).rejects.toThrow('exploration_indexed_db_unavailable');
    expect(() => createExplorationStore({ ...scope, actor_id: '' }, storage)).toThrow('invalid_exploration_store_scope');
  });
});
