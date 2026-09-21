import { assertExplorationSession } from '../../../supabase/functions/_shared/desaing/exploration';
import type { ExplorationSession, IdeaSelection } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { DesignContext } from '../../../supabase/functions/_shared/desaing/contracts';

export interface ExplorationDraft {
  session: ExplorationSession;
  capture: Blob | null;
  capture_name: string | null;
  brief: string;
  approved_copy?: string;
  copy_mode?: 'literal' | 'none';
  visual_references?: { scope_key: string; references: DesignContext['references'] };
  applied_understanding_key?: string;
  region: { x: number; y: number; width: number; height: number } | null;
  prepared_idea?: { selection: IdeaSelection; instruction: string; original_brief: string; context: DesignContext };
}
export interface ExplorationDraftRecord { revision: number; value: ExplorationDraft }
export interface ExplorationStoreScope { actor_id: string; business_id: string; session_id: string }
export interface ExplorationStore {
  read(): Promise<ExplorationDraftRecord | null>;
  write(expectedRevision: number, value: ExplorationDraft): Promise<ExplorationDraftRecord>;
  close(): void;
}
/** The synchronous callback and its write must share one atomic transaction. */
export interface AtomicExplorationStorage {
  read(key: string): Promise<unknown | null>;
  update(key: string, change: (previous: unknown | null) => ExplorationDraftRecord): Promise<ExplorationDraftRecord>;
  close(): void;
}

const DATABASE = 'scory-design-exploration-v1';
const STORE = 'drafts';
const CAPTURE_LIMIT = 8 * 1024 * 1024;
const METADATA_LIMIT = 2 * 1024 * 1024;

function fail(code: string): never { throw new Error(code); }
function boundedText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max;
}
function validateScope(scope: ExplorationStoreScope): void {
  if (!scope || ![scope.actor_id, scope.business_id, scope.session_id]
    .every(value => boundedText(value, 256) && value.trim().length)) fail('invalid_exploration_store_scope');
}
function validateDraft(value: unknown, scope: ExplorationStoreScope): asserts value is ExplorationDraft {
  if (!value || typeof value !== 'object') fail('invalid_exploration_draft');
  const draft = value as ExplorationDraft;
  assertExplorationSession(draft.session);
  const context = draft.session.context;
  if (context.actor_id !== scope.actor_id || context.business_id !== scope.business_id
    || context.session_id !== scope.session_id) fail('exploration_store_scope_mismatch');
  if (!boundedText(draft.brief, 16_000)) fail('invalid_exploration_brief');
  if (draft.approved_copy !== undefined && (!boundedText(draft.approved_copy, 4000) || draft.approved_copy.includes('\0'))) fail('invalid_exploration_copy');
  if (draft.copy_mode !== undefined && !['literal', 'none'].includes(draft.copy_mode)) fail('invalid_exploration_copy');
  if (draft.copy_mode === 'none' && draft.approved_copy) fail('invalid_exploration_copy');
  if (draft.applied_understanding_key !== undefined && !draft.session.attempts.some(attempt => attempt.request.request_key === draft.applied_understanding_key && attempt.result?.design_understanding)) fail('invalid_exploration_understanding');
  if (draft.visual_references) {
    if (!boundedText(draft.visual_references.scope_key, 16000)) fail('invalid_exploration_references');
    assertExplorationSession({ ...draft.session, context: { ...context, references: draft.visual_references.references } });
  }
  if (draft.capture !== null) {
    if (!(draft.capture instanceof Blob) || draft.capture.type !== 'image/png'
      || draft.capture.size < 8 || draft.capture.size > CAPTURE_LIMIT) fail('invalid_exploration_capture');
    if (!boundedText(draft.capture_name, 240) || !draft.capture_name.trim()) fail('invalid_exploration_capture_name');
  } else if (draft.capture_name !== null) fail('invalid_exploration_capture_name');
  if (draft.region !== null) {
    const region = draft.region;
    if (!region || ![region.x, region.y, region.width, region.height]
      .every(number => typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 100_000)
      || region.width === 0 || region.height === 0) fail('invalid_exploration_region');
  }
  if (draft.prepared_idea !== undefined) {
    const prepared = draft.prepared_idea;
    if (!prepared || !boundedText(prepared.instruction, 16_000) || !prepared.instruction.trim()
      || !boundedText(prepared.original_brief, 16_000)) fail('invalid_exploration_prepared_idea');
    const selection = prepared.selection;
    if (!selection || !draft.session.sets.some(set => set.set_id === selection.set_id
      && set.ideas.some(idea => idea.idea_id === selection.idea_id && idea.version === selection.version))) {
      fail('invalid_exploration_prepared_selection');
    }
    const preparedContext = prepared.context;
    if (!preparedContext || preparedContext.actor_id !== scope.actor_id || preparedContext.business_id !== scope.business_id
      || preparedContext.session_id !== scope.session_id) fail('exploration_store_scope_mismatch');
    // Validate the complete copied context with the same domain rules as the session context.
    assertExplorationSession({ ...draft.session, context: preparedContext });
  }
  if (new TextEncoder().encode(JSON.stringify({ ...draft, capture: null })).byteLength > METADATA_LIMIT) {
    fail('exploration_metadata_too_large');
  }
}
function validateRecord(value: unknown, scope: ExplorationStoreScope): asserts value is ExplorationDraftRecord {
  if (!value || typeof value !== 'object') fail('invalid_exploration_record');
  const record = value as ExplorationDraftRecord;
  if (!Number.isSafeInteger(record.revision) || record.revision < 1) fail('invalid_exploration_revision');
  validateDraft(record.value, scope);
}
async function validatePng(capture: Blob | null): Promise<void> {
  if (!capture) return;
  const signature = new Uint8Array(await capture.slice(0, 8).arrayBuffer());
  if (![137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => signature[index] === byte)) {
    fail('invalid_exploration_png_signature');
  }
}

/** Local continuity only: this journal neither authorizes nor dispatches paid work. */
export function createExplorationStore(scope: ExplorationStoreScope, storage: AtomicExplorationStorage): ExplorationStore {
  validateScope(scope);
  const target = { ...scope };
  const key = JSON.stringify([target.actor_id, target.business_id, target.session_id]);
  let closed = false;
  const ensureOpen = () => { if (closed) fail('exploration_store_closed'); };
  return {
    async read() {
      ensureOpen();
      const raw = await storage.read(key);
      if (raw === null) return null;
      const record = structuredClone(raw);
      validateRecord(record, target);
      await validatePng(record.value.capture);
      return record;
    },
    async write(expectedRevision, value) {
      ensureOpen();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0
        || expectedRevision >= Number.MAX_SAFE_INTEGER) fail('invalid_exploration_revision');
      // Freeze caller state before any asynchronous work; blobs are immutable.
      const draft = structuredClone(value);
      validateDraft(draft, target);
      await validatePng(draft.capture);
      ensureOpen();
      const result = await storage.update(key, previous => {
        if (previous !== null) validateRecord(previous, target);
        const current = previous as ExplorationDraftRecord | null;
        if ((current?.revision ?? 0) !== expectedRevision) fail('exploration_revision_conflict');
        return { revision: expectedRevision + 1, value: draft };
      });
      return structuredClone(result);
    },
    close() { if (!closed) { closed = true; storage.close(); } },
  };
}

export async function openExplorationStore(scope: ExplorationStoreScope): Promise<ExplorationStore> {
  validateScope(scope);
  if (typeof indexedDB === 'undefined') fail('exploration_indexed_db_unavailable');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    let rejected = false;
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onerror = () => { rejected = true; reject(request.error ?? new Error('exploration_store_open_failed')); };
    request.onblocked = () => { rejected = true; reject(new Error('exploration_store_upgrade_blocked')); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
  function transact(key: string, change?: (previous: unknown | null) => ExplorationDraftRecord): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, change ? 'readwrite' : 'readonly');
      const store = tx.objectStore(STORE);
      let result: unknown | null = null;
      let received = false;
      let failure: unknown;
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('exploration_store_transaction_aborted'));
      // A successful put request is not a successful commit; quota errors abort the transaction.
      tx.oncomplete = () => received ? resolve(result) : reject(new Error('exploration_store_missing_result'));
      const read = store.get(key);
      read.onerror = () => { failure = read.error; };
      read.onsuccess = () => {
        try {
          const previous = read.result === undefined ? null : read.result;
          result = change ? change(previous) : previous;
          if (change) {
            const write = store.put(result, key);
            write.onerror = () => { failure = write.error; };
          }
          received = true;
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }
  return createExplorationStore(scope, {
    read: key => transact(key),
    update: (key, change) => transact(key, change) as Promise<ExplorationDraftRecord>,
    close: () => db.close(),
  });
}
