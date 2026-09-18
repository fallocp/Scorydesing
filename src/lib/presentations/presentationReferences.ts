import type { DesignReference } from '../../../supabase/functions/_shared/desaing/contracts';
import { assertAssetCatalog, createAssetCatalog, type RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import type { DesignServerClient } from '../desaing/serverClient';
import { prepareServerCapture } from './presentationServerDesign';

export const PRESENTATION_REFERENCE_ROLES = ['object_reference', 'image_style_reference', 'layout_reference', 'content_source', 'brand_reference'] as const;
export type PresentationReferenceRole = typeof PRESENTATION_REFERENCE_ROLES[number];
export interface PreparedPresentationReference { id: string; name: string; role: PresentationReferenceRole; blob: Blob; sha256: string }
export const presentationReferenceSelectionKey = (items: readonly PreparedPresentationReference[]) =>
  JSON.stringify(items.map(item => [item.id, item.role, item.sha256]));
/** An upload can preserve concurrent edits without making them the caller's known selection. */
export function assertPresentationReferenceSelection(expected: readonly PreparedPresentationReference[], actual: readonly PreparedPresentationReference[]): void {
  if (presentationReferenceSelectionKey(expected) !== presentationReferenceSelectionKey(actual)) {
    throw new Error('presentation_reference_revision_conflict');
  }
}
export interface PresentationReferenceScope { actor_id: string; business_id: string; document_id: string; slide_id: string }
export interface PresentationReferenceUpload { upload_id: string; brand_id: string; project_id: string; version?: RegisteredAssetVersion }
export interface PresentationReferenceDraft { items: PreparedPresentationReference[]; uploads: Record<string, PresentationReferenceUpload> }
export interface PresentationReferenceRecord { scope: PresentationReferenceScope; revision: number; value: PresentationReferenceDraft }
export interface PresentationReferenceStore {
  read(): Promise<PresentationReferenceRecord | null>;
  write(expectedRevision: number, items: PreparedPresentationReference[]): Promise<PresentationReferenceRecord>;
  upload(item: PreparedPresentationReference, client: Pick<DesignServerClient, 'session' | 'upload'>,
    options: { brandId: string; projectId: string; assertCurrent?(): Promise<void> }): Promise<{
      record: PresentationReferenceRecord; version: RegisteredAssetVersion; reference: DesignReference;
    }>;
  close(): void;
}
export interface AtomicPresentationReferenceStorage {
  read(key: string): Promise<unknown | null>;
  update(key: string, change: (previous: unknown | null) => PresentationReferenceRecord): Promise<PresentationReferenceRecord>;
  close(): void;
}
const DATABASE = 'scory-design-presentation-references-v1', STORE = 'drafts', LIMIT = 3;
const isRecord = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const exact = (value: unknown, keys: string[], required = keys): value is Record<string, unknown> => isRecord(value)
  && Object.keys(value).every(key => keys.includes(key)) && required.every(key => key in value);
const hasControlCharacter = (value: string) => Array.from(value)
  .some(character => character.charCodeAt(0) <= 31 || character.charCodeAt(0) === 127);
const id = (value: unknown, max = 256): value is string => typeof value === 'string' && !!value.trim() && value.length <= max && !hasControlCharacter(value);
const hash = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const uuid = (value: unknown): value is string => typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : isRecord(value) ? `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}` : JSON.stringify(value) ?? 'undefined';
const same = (a: unknown, b: unknown) => canonical(a) === canonical(b);
function check(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
function validateScope(scope: PresentationReferenceScope) {
  check(exact(scope, ['actor_id', 'business_id', 'document_id', 'slide_id']) && Object.values(scope).every(value => id(value)), 'invalid_presentation_reference_scope');
}
function validateItems(items: unknown): asserts items is PreparedPresentationReference[] {
  check(Array.isArray(items) && items.length <= LIMIT, 'presentation_reference_limit');
  const seen = new Set<string>();
  for (const item of items) {
    check(exact(item, ['id', 'name', 'role', 'blob', 'sha256']) && hash(item.sha256) && item.id === `reference:${item.sha256}`
      && id(item.name, 240) && PRESENTATION_REFERENCE_ROLES.includes(item.role as PresentationReferenceRole)
      && item.blob instanceof Blob && item.blob.type === 'image/png' && item.blob.size > 0 && item.blob.size <= 8388608, 'invalid_presentation_reference');
    check(!seen.has(item.id), 'duplicate_presentation_reference'); seen.add(item.id);
  }
}
async function digest(blob: Blob): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function validateBytes(items: PreparedPresentationReference[]) {
  for (const item of items) {
    const [dimensions, actualHash] = await Promise.all([inspectServerPng(new Uint8Array(await item.blob.arrayBuffer())), digest(item.blob)]);
    check(dimensions.width <= 1024 && dimensions.height <= 1024, 'presentation_reference_too_large');
    check(item.sha256 === actualHash, 'presentation_reference_bytes_mismatch');
  }
}
function validateVersion(version: RegisteredAssetVersion, scope: PresentationReferenceScope, upload: PresentationReferenceUpload, sha256: string) {
  const catalog = createAssetCatalog(scope.business_id); catalog.versions = [version]; assertAssetCatalog(catalog, scope.business_id);
  check(version.identity.asset_id === upload.upload_id && version.identity.version_id === sha256 && version.provenance.kind === 'imported' && version.provenance.origin === 'upload'
    && version.brand_id === upload.brand_id && version.project_id === upload.project_id && version.storage.mime_type === 'image/png'
    && version.storage.width <= 1024 && version.storage.height <= 1024, 'presentation_reference_upload_mismatch');
}
function validateRecord(value: unknown, scope: PresentationReferenceScope): asserts value is PresentationReferenceRecord {
  check(exact(value, ['scope', 'revision', 'value']) && Number.isSafeInteger(value.revision) && Number(value.revision) > 0
    && exact(value.value, ['items', 'uploads']) && isRecord(value.value.uploads), 'invalid_presentation_reference_record');
  validateScope(value.scope as PresentationReferenceScope);
  check(Object.keys(scope).every(key => (value.scope as unknown as Record<string, string>)[key] === scope[key as keyof PresentationReferenceScope]), 'presentation_reference_store_scope_mismatch');
  validateItems(value.value.items);
  const uploads = Object.entries(value.value.uploads), ids = new Set<string>();
  check(uploads.length <= 200, 'presentation_reference_upload_limit');
  for (const [sha256, upload] of uploads) {
    check(hash(sha256) && exact(upload, ['upload_id', 'brand_id', 'project_id', 'version'], ['upload_id', 'brand_id', 'project_id'])
      && uuid(upload.upload_id) && id(upload.brand_id) && upload.project_id === scope.document_id && !ids.has(upload.upload_id), 'invalid_presentation_reference_upload');
    ids.add(upload.upload_id);
    if (upload.version) validateVersion(upload.version as RegisteredAssetVersion, scope, upload as unknown as PresentationReferenceUpload, sha256);
  }
}
/** Decode actual image bytes, normalize once and use the normalized pixels as the stable identity. */
export async function preparePresentationReference(file: File, role: PresentationReferenceRole = 'object_reference',
  normalize: (file: File, maxEdge: number) => Promise<Blob> = prepareServerCapture): Promise<PreparedPresentationReference> {
  check(file instanceof Blob && id(file.name, 240) && file.size > 0 && file.size <= 8388608
    && PRESENTATION_REFERENCE_ROLES.includes(role), 'invalid_presentation_reference');
  const bytes = new Uint8Array(await file.slice(0, 12).arrayBuffer());
  const mime = bytes.length >= 8 && [137, 80, 78, 71, 13, 10, 26, 10].every((value, index) => bytes[index] === value) ? 'image/png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? 'image/jpeg'
      : String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP' ? 'image/webp' : null;
  check(mime && (!file.type || file.type === mime), 'invalid_presentation_reference_image');
  const blob = await normalize(file, 1024), sha256 = await digest(blob);
  const item = { id: `reference:${sha256}`, name: file.name, role, blob, sha256 };
  validateItems([item]); await validateBytes([item]); return item;
}
/** Duplicate pixels reuse the original entry and role; choosing another role is an explicit UI edit. */
export function addPresentationReference(items: PreparedPresentationReference[], item: PreparedPresentationReference, maxReferences = LIMIT): PreparedPresentationReference[] {
  validateItems(items); validateItems([item]);
  check(Number.isSafeInteger(maxReferences) && maxReferences >= 0 && maxReferences <= LIMIT, 'presentation_reference_limit');
  if (items.some(existing => existing.id === item.id)) return structuredClone(items);
  check(items.length < maxReferences, 'presentation_reference_limit'); return structuredClone([...items, item]);
}
export function createPresentationReferenceStore(scope: PresentationReferenceScope, storage: AtomicPresentationReferenceStorage): PresentationReferenceStore {
  validateScope(scope);
  const target = { ...scope }, key = JSON.stringify([target.actor_id, target.business_id, target.document_id, target.slide_id]);
  let closed = false;
  const ensureOpen = () => check(!closed, 'presentation_reference_store_closed');
  function update(change: (previous: PresentationReferenceRecord | null) => PresentationReferenceDraft) {
    return storage.update(key, raw => {
      ensureOpen(); if (raw !== null) validateRecord(raw, target);
      const before = raw as PresentationReferenceRecord | null;
      check((before?.revision ?? 0) < Number.MAX_SAFE_INTEGER, 'invalid_presentation_reference_revision');
      const next = { scope: target, revision: (before?.revision ?? 0) + 1, value: change(before) }; validateRecord(next, target); return next;
    });
  }
  async function read() {
    ensureOpen(); const raw = await storage.read(key); ensureOpen(); if (raw === null) return null;
    const record = structuredClone(raw); validateRecord(record, target); await validateBytes(record.value.items); ensureOpen(); return record;
  }
  async function assertActor(client: Pick<DesignServerClient, 'session'>) {
    ensureOpen(); const session = await client.session(); ensureOpen(); check(session.actorId === target.actor_id, 'server_session_changed');
  }
  return {
    read,
    async write(expectedRevision, items) {
      ensureOpen(); check(Number.isSafeInteger(expectedRevision) && expectedRevision >= 0 && expectedRevision < Number.MAX_SAFE_INTEGER, 'invalid_presentation_reference_revision');
      const saved = structuredClone(items); validateItems(saved); await validateBytes(saved); ensureOpen();
      const result = await update(previous => {
        check((previous?.revision ?? 0) === expectedRevision, 'presentation_reference_revision_conflict');
        return { items: saved, uploads: previous?.value.uploads ?? {} };
      });
      ensureOpen(); return structuredClone(result);
    },
    async upload(input, client, options) {
      const item = structuredClone(input); validateItems([item]); await validateBytes([item]);
      check(id(options.brandId) && options.projectId === target.document_id, 'presentation_reference_store_scope_mismatch');
      await assertActor(client); await options.assertCurrent?.(); ensureOpen();
      const before = await read(), present = before?.value.items.find(value => value.id === item.id);
      check(present && present.role === item.role && present.sha256 === item.sha256, 'presentation_reference_changed');
      let claimed = await update(previous => {
        check(previous && previous.value.items.some(value => value.id === item.id && value.role === item.role), 'presentation_reference_changed');
        const existing = previous.value.uploads[item.sha256];
        check(!existing || existing.brand_id === options.brandId && existing.project_id === options.projectId, 'presentation_reference_upload_mismatch');
        return { ...previous.value, uploads: { ...previous.value.uploads, [item.sha256]: existing ?? {
          upload_id: crypto.randomUUID(), brand_id: options.brandId, project_id: options.projectId,
        } } };
      });
      let upload = claimed.value.uploads[item.sha256], version = upload.version;
      await assertActor(client); await options.assertCurrent?.(); ensureOpen();
      if (!version) {
        // The stable ID was committed before I/O. A lost acknowledgment preserves it for an explicit retry.
        version = await client.upload({ businessId: target.business_id, uploadId: upload.upload_id,
          brandId: upload.brand_id, projectId: upload.project_id }, item.blob);
        await assertActor(client); ensureOpen(); validateVersion(version, target, upload, item.sha256);
        const dimensions = await inspectServerPng(new Uint8Array(await item.blob.arrayBuffer()));
        check(version.storage.size_bytes === item.blob.size && version.storage.width === dimensions.width
          && version.storage.height === dimensions.height, 'presentation_reference_upload_mismatch');
        const received = structuredClone(version);
        claimed = await update(previous => {
          check(previous, 'presentation_reference_changed');
          const current = previous.value.uploads[item.sha256];
          check(current?.upload_id === upload.upload_id && (!current.version || same(current.version, received)), 'presentation_reference_upload_mismatch');
          return { ...previous.value, uploads: { ...previous.value.uploads, [item.sha256]: { ...current, version: received } } };
        });
        upload = claimed.value.uploads[item.sha256];
      }
      await options.assertCurrent?.(); ensureOpen();
      return { record: structuredClone(claimed), version: structuredClone(version), reference: {
        ...version.identity, reference_id: item.id, mime_type: 'image/png', roles: [item.role],
      } };
    },
    close() { if (!closed) { closed = true; storage.close(); } },
  };
}
export async function openPresentationReferenceStore(scope: PresentationReferenceScope): Promise<PresentationReferenceStore> {
  validateScope(scope); check(typeof indexedDB !== 'undefined', 'presentation_reference_indexed_db_unavailable');
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1); let rejected = false;
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE); };
    request.onerror = () => { rejected = true; reject(request.error ?? new Error('presentation_reference_store_open_failed')); };
    request.onblocked = () => { rejected = true; reject(new Error('presentation_reference_store_upgrade_blocked')); };
    request.onsuccess = () => { if (rejected) { request.result.close(); return; } request.result.onversionchange = () => request.result.close(); resolve(request.result); };
  });
  function transact(key: string, change?: (previous: unknown | null) => PresentationReferenceRecord): Promise<unknown | null> {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, change ? 'readwrite' : 'readonly'), store = tx.objectStore(STORE);
      let value: unknown | null = null, received = false, failure: unknown;
      tx.onabort = () => reject(failure ?? tx.error ?? new Error('presentation_reference_store_transaction_aborted'));
      tx.oncomplete = () => received ? resolve(value) : reject(new Error('presentation_reference_store_missing_result'));
      const request = store.get(key); request.onerror = () => { failure = request.error; };
      request.onsuccess = () => { try {
        const previous = request.result === undefined ? null : request.result; value = change ? change(previous) : previous;
        if (change) { const write = store.put(value, key); write.onerror = () => { failure = write.error; }; } received = true;
      } catch (error) { failure = error; tx.abort(); } };
    });
  }
  return createPresentationReferenceStore(scope, { read: key => transact(key),
    update: (key, change) => transact(key, change) as Promise<PresentationReferenceRecord>, close: () => db.close() });
}
