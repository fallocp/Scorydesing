import { assertDeckComposerRow, assertPresentationTemplate, deckComposerHash, deckComposerRowHash, isDeckComposerId,
  makeDeckComposerRow, verifyPresentationTemplate, type DeckComposerRow, type PresentationTemplate } from './presentationTemplate';

export interface DeckComposerScope { actor: string; business: string; document: string; source: string }
export interface DeckComposerDraft {
  id: string;
  name: string;
  template: PresentationTemplate;
  template_reviewed: boolean;
  rows: DeckComposerRow[];
  publication: null | { fingerprint: string; status: 'pending' | 'completed' };
}
export interface DeckComposerRecord { revision: number; scope: DeckComposerScope; value: DeckComposerDraft }
const check = (value: unknown, message: string) => { if (!value) throw new Error(message); };
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}` : JSON.stringify(value) ?? '';

export function makeDeckComposerDraft(template: PresentationTemplate): DeckComposerDraft {
  return { id: crypto.randomUUID(), name: `${template.source.title || 'Presentación'} — nueva presentación`.slice(0, 160), template: structuredClone(template),
    template_reviewed: false, rows: [makeDeckComposerRow(template, 'Diapositiva 1'), makeDeckComposerRow(template, 'Diapositiva 2')], publication: null };
}
export function assertDeckComposerDraft(value: DeckComposerDraft, scope: DeckComposerScope): void {
  check(value && isDeckComposerId(value.id) && typeof value.name === 'string' && value.name.length <= 160 && !value.name.includes('\0')
    && typeof value.template_reviewed === 'boolean', 'invalid_deck_draft');
  assertPresentationTemplate(value.template, scope.business);
  check(value.template.source.id === scope.source, 'deck_scope_mismatch');
  check(Array.isArray(value.rows) && value.rows.length >= 2 && value.rows.length <= 20 && new Set(value.rows.map(row => row.id)).size === value.rows.length, 'invalid_deck_size');
  value.rows.forEach(row => assertDeckComposerRow(row, value.template));
  if (!value.template_reviewed) check(value.rows.every(row => row.reviewed_hash === null), 'deck_review_required');
  if (value.publication !== null) {
    check(value.publication && ['pending', 'completed'].includes(value.publication.status)
      && /^sha256:[a-f\d]{64}$/.test(value.publication.fingerprint) && value.name.trim() && value.template_reviewed
      && value.rows.every(row => row.reviewed_hash !== null), 'invalid_deck_publication');
  }
}
export async function deckComposerPublicationHash(value: DeckComposerDraft): Promise<string> {
  return deckComposerHash([value.id, value.name, value.template.fingerprint, value.rows.map(row => [row.id, row.title, row.reviewed_hash])]);
}
export async function verifyDeckComposerDraft(value: DeckComposerDraft, scope: DeckComposerScope): Promise<void> {
  assertDeckComposerDraft(value, scope);
  await verifyPresentationTemplate(value.template, scope.business);
  for (const row of value.rows) if (row.reviewed_hash !== null) {
    assertDeckComposerRow(row, value.template, true);
    check(row.reviewed_hash === await deckComposerRowHash(value.template, row), 'deck_review_changed');
  }
  if (value.publication) check(value.publication.fingerprint === await deckComposerPublicationHash(value), 'deck_publication_changed');
}
export function assertDeckComposerTransition(before: DeckComposerDraft, after: DeckComposerDraft): void {
  if (before.publication?.status === 'completed' && after.publication === null && before.id !== after.id) return;
  check(before.id === after.id && canonical(before.template) === canonical(after.template), 'deck_template_locked');
  if (before.publication) {
    check(after.publication && before.publication.fingerprint === after.publication.fingerprint
      && canonical({ ...before, publication: null }) === canonical({ ...after, publication: null }), 'deck_publication_locked');
    if (before.publication.status === 'completed') check(after.publication?.status === 'completed', 'deck_publication_locked');
  }
}
export function assertDeckComposerRecord(record: DeckComposerRecord, scope: DeckComposerScope): void {
  check(Number.isSafeInteger(record.revision) && record.revision > 0, 'invalid_deck_revision');
  check(canonical(record.scope) === canonical(scope), 'deck_scope_mismatch');
  assertDeckComposerDraft(record.value, scope);
}
/** Local drafts retain one copy of the template; repeated slides store only their literal field values. */
export async function openDeckComposerStore(scope: DeckComposerScope) {
  check(Object.values(scope).length === 4 && Object.values(scope).every(value => typeof value === 'string' && value.length > 0 && value.length <= 256), 'deck_scope_mismatch');
  const frozenScope = { ...scope }, key = JSON.stringify([scope.actor, scope.business, scope.document, scope.source]);
  let closed = false;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open('scory-presentation-composer-v1', 1);
    request.onupgradeneeded = () => { if (failed) request.transaction?.abort(); else request.result.createObjectStore('drafts'); };
    const failure = () => { failed = true; reject(new Error('deck_store_unavailable')); };
    request.onerror = failure; request.onblocked = failure;
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => { closed = true; request.result.close(); };
      resolve(request.result);
    };
  });
  function transaction(expected?: number, value?: DeckComposerDraft): Promise<DeckComposerRecord | null> {
    if (closed) throw new Error('deck_store_closed');
    const frozen = value ? structuredClone(value) : undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', frozen ? 'readwrite' : 'readonly'), bucket = tx.objectStore('drafts');
      let result: DeckComposerRecord | null = null, problem: unknown;
      tx.oncomplete = () => resolve(result); tx.onabort = () => reject(problem ?? tx.error ?? new Error('deck_store_unavailable'));
      const query = bucket.get(key);
      query.onsuccess = () => { try {
        const previous = query.result as DeckComposerRecord | undefined;
        if (previous) assertDeckComposerRecord(previous, frozenScope);
        if (frozen) {
          check((previous?.revision ?? 0) === expected, 'deck_revision_conflict');
          if (previous) assertDeckComposerTransition(previous.value, frozen);
          result = { revision: (expected ?? 0) + 1, scope: frozenScope, value: frozen }; bucket.put(result, key);
        } else result = previous ?? null;
      } catch (error) { problem = error; tx.abort(); } };
    });
  }
  return {
    async read() { const record = await transaction(); if (record) await verifyDeckComposerDraft(record.value, frozenScope); return record; },
    async write(revision: number, value: DeckComposerDraft) {
      check(Number.isSafeInteger(revision) && revision >= 0 && revision < Number.MAX_SAFE_INTEGER, 'invalid_deck_revision');
      const frozen = structuredClone(value); await verifyDeckComposerDraft(frozen, frozenScope);
      return (await transaction(revision, frozen))!;
    },
    close() { closed = true; db.close(); },
  };
}
