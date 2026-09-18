import { assertVisualProposalSet, type VisualProposalSet } from '../../../supabase/functions/_shared/desaing/visualProposals';
import { assertAssetCatalog, createAssetCatalog, type RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';

export interface VisualProposalSubmission { state: 'saved' | 'submitting' | 'confirmed' | 'uncertain'; error_code?: string }
export interface VisualProposalUpload { upload_id: string; reference?: RegisteredAssetVersion }
export interface VisualProposalDraft { sets: VisualProposalSet[]; submissions: Record<string, VisualProposalSubmission>; uploads?: Record<string, VisualProposalUpload> }
export interface VisualProposalDraftRecord { revision: number; value: VisualProposalDraft }
export interface VisualProposalStoreScope { actor_id: string; business_id: string; session_id: string }
export interface VisualProposalStore {
  read(): Promise<VisualProposalDraftRecord | null>;
  write(expectedRevision: number, value: VisualProposalDraft): Promise<VisualProposalDraftRecord>;
  close(): void;
}
export interface AtomicVisualProposalStorage {
  read(key: string): Promise<unknown | null>;
  update(key: string, change: (previous: unknown | null) => VisualProposalDraftRecord): Promise<VisualProposalDraftRecord>;
  close(): void;
}
const DATABASE = 'scory-design-visual-proposals-v1', STORE = 'drafts';
function fail(code: string): never { throw new Error(code); }
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const hasControlCharacter = (value: string) => Array.from(value)
  .some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
const id = (value: unknown, max = 256): value is string => typeof value === 'string' && !!value.trim() && value.length <= max && !hasControlCharacter(value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : record(value) ? `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}` : JSON.stringify(value) ?? 'undefined';
function validateScope(scope: VisualProposalStoreScope) {
  if (!scope || ![scope.actor_id, scope.business_id, scope.session_id].every(value => id(value))) fail('invalid_visual_proposal_store_scope');
}
function validateDraft(value: unknown, scope: VisualProposalStoreScope): asserts value is VisualProposalDraft {
  if (!record(value) || Object.keys(value).some(key => !['sets', 'submissions', 'uploads'].includes(key))
    || !Array.isArray(value.sets) || value.sets.length > 100 || !record(value.submissions)) fail('invalid_visual_proposal_draft');
  const sets = new Set<string>(), operations = new Set<string>();
  for (const set of value.sets) {
    assertVisualProposalSet(set);
    if (set.context.actor_id !== scope.actor_id || set.context.business_id !== scope.business_id || set.context.session_id !== scope.session_id) fail('visual_proposal_store_scope_mismatch');
    if (sets.has(set.id)) fail('duplicate_visual_proposal_set');
    sets.add(set.id);
    for (const candidate of set.candidates) if (candidate.operation) {
      if (operations.has(candidate.operation.operation_key)) fail('visual_proposal_operation_key_conflict');
      operations.add(candidate.operation.operation_key);
    }
  }
  for (const [key, submission] of Object.entries(value.submissions)) {
    if (!operations.has(key) || !record(submission) || Object.keys(submission).some(field => !['state', 'error_code'].includes(field))
      || !['saved', 'submitting', 'confirmed', 'uncertain'].includes(String(submission.state))
      || submission.error_code !== undefined && !id(submission.error_code, 200)) fail('invalid_visual_proposal_submission');
  }
  if (value.uploads !== undefined) {
    if (!record(value.uploads)) fail('invalid_visual_proposal_upload');
    const uploadIds = new Set<string>();
    for (const [setId, upload] of Object.entries(value.uploads)) {
      if (!sets.has(setId) || !record(upload) || Object.keys(upload).some(key => !['upload_id', 'reference'].includes(key))
        || !id(upload.upload_id, 200) || uploadIds.has(upload.upload_id)) fail('invalid_visual_proposal_upload');
      uploadIds.add(upload.upload_id);
      if (upload.reference !== undefined) {
        const catalog = createAssetCatalog(scope.business_id); catalog.versions = [upload.reference as RegisteredAssetVersion];
        assertAssetCatalog(catalog, scope.business_id);
        if (catalog.versions[0].provenance.kind !== 'imported' || catalog.versions[0].storage.mime_type !== 'image/png') fail('invalid_visual_proposal_upload');
      }
    }
  }
  // Never duplicate capture blobs or include provider keys and unknown attachments in this journal.
  if (new TextEncoder().encode(JSON.stringify(value)).length > 4 * 1024 * 1024) fail('visual_proposal_metadata_too_large');
}
function validateRecord(value: unknown, scope: VisualProposalStoreScope): asserts value is VisualProposalDraftRecord {
  if (!record(value) || Object.keys(value).length !== 2 || !Number.isSafeInteger(value.revision) || Number(value.revision) < 1) fail('invalid_visual_proposal_record');
  validateDraft(value.value, scope);
}
function validateContinuity(previous: VisualProposalDraft, next: VisualProposalDraft) {
  for (const old of previous.sets) {
    const current = next.sets.find(set => set.id === old.id);
    if (!current || canonical(current.context) !== canonical(old.context)) fail('visual_proposal_history_conflict');
    for (const candidate of old.candidates) {
      const saved = current.candidates.find(item => item.id === candidate.id);
      if (!saved) fail('visual_proposal_history_conflict');
      const { operation: before, ...beforeText } = candidate, { operation: after, ...afterText } = saved;
      if (canonical(beforeText) !== canonical(afterText) || before && canonical(before) !== canonical(after)) fail('visual_proposal_history_conflict');
    }
  }
  for (const [key, old] of Object.entries(previous.submissions)) {
    const current = next.submissions[key];
    if (!current || old.state === 'confirmed' && current.state !== 'confirmed'
      || old.state === 'uncertain' && !['uncertain', 'confirmed'].includes(current.state)) fail('visual_proposal_submission_conflict');
  }
  for (const [key, old] of Object.entries(previous.uploads ?? {})) {
    const current = next.uploads?.[key];
    if (!current || current.upload_id !== old.upload_id || old.reference && canonical(old.reference) !== canonical(current.reference)) fail('visual_proposal_upload_conflict');
  }
}
/** Atomic local continuity only. No read/write here sends a provider call or grants an authorization. */
export function createVisualProposalStore(scope: VisualProposalStoreScope, storage: AtomicVisualProposalStorage): VisualProposalStore {
  validateScope(scope);
  const target = { ...scope }, key = JSON.stringify([target.actor_id, target.business_id, target.session_id]);
  let closed = false;
  const ensureOpen = () => { if (closed) fail('visual_proposal_store_closed'); };
  return {
    async read() {
      ensureOpen(); const raw = await storage.read(key); ensureOpen();
      if (raw === null) return null;
      const value = structuredClone(raw); validateRecord(value, target); return value;
    },
    async write(expectedRevision, value) {
      ensureOpen();
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0 || expectedRevision >= Number.MAX_SAFE_INTEGER) fail('invalid_visual_proposal_revision');
      const draft = structuredClone(value); validateDraft(draft, target);
      const result = await storage.update(key, previous => {
        ensureOpen(); if (previous !== null) validateRecord(previous, target);
        if (((previous as VisualProposalDraftRecord | null)?.revision ?? 0) !== expectedRevision) fail('visual_proposal_revision_conflict');
        if (previous !== null) validateContinuity((previous as VisualProposalDraftRecord).value, draft);
        return { revision: expectedRevision + 1, value: draft };
      });
      ensureOpen(); return structuredClone(result);
    },
    close() { if (!closed) { closed = true; storage.close(); } },
  };
}
export async function openVisualProposalStore(scope: VisualProposalStoreScope): Promise<VisualProposalStore> {
  validateScope(scope);
  if (typeof indexedDB === 'undefined') fail('visual_proposal_indexed_db_unavailable');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1); let rejected = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => { rejected = true; reject(request.error ?? new Error('visual_proposal_store_open_failed')); };
    request.onblocked = () => { rejected = true; reject(new Error('visual_proposal_store_upgrade_blocked')); };
    request.onsuccess = () => {
      if (rejected) { request.result.close(); return; }
      request.result.onversionchange = () => request.result.close(); resolve(request.result);
    };
  });
  function transact(key: string, change?: (previous: unknown | null) => VisualProposalDraftRecord): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, change ? 'readwrite' : 'readonly'), store = tx.objectStore(STORE);
      let result: unknown | null = null, received = false, failure: unknown;
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('visual_proposal_store_transaction_aborted'));
      tx.oncomplete = () => received ? resolve(result) : reject(new Error('visual_proposal_store_missing_result'));
      const read = store.get(key);
      read.onerror = () => { failure = read.error; };
      read.onsuccess = () => {
        try {
          const previous = read.result === undefined ? null : read.result;
          result = change ? change(previous) : previous;
          if (change) { const write = store.put(result, key); write.onerror = () => { failure = write.error; }; }
          received = true;
        } catch (error) { failure = error; tx.abort(); }
      };
    });
  }
  return createVisualProposalStore(scope, { read: key => transact(key),
    update: (key, change) => transact(key, change) as Promise<VisualProposalDraftRecord>, close: () => db.close() });
}
