import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { HtmlCompositionRequest, HtmlCompositionResult } from '../../../supabase/functions/_shared/desaing/composition';
import { assertHtmlCompositionRequest, assertHtmlCompositionResult, verifyHtmlCompositionRequest } from '../../../supabase/functions/_shared/desaing/composition';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';

export interface CompositionSource { blob: Blob; name: string; upload_id: string; version?: RegisteredAssetVersion }
export type SavedCompositionBinding = { omitted: true } | { asset: AssetVersion; origin: 'local' | 'server'; altText: string };
export interface CompositionDraft {
  copy_text: string; source: CompositionSource | null;
  request: HtmlCompositionRequest | null; result: HtmlCompositionResult | null;
  status: 'draft' | 'saved' | 'submitting' | 'uncertain' | 'completed';
  bindings: Record<string, SavedCompositionBinding>;
}
export interface CompositionRecord { revision: number; value: CompositionDraft }
export interface CompositionStoreScope { actor: string; business: string; session: string }
export const emptyCompositionDraft = (): CompositionDraft => ({ copy_text: '', source: null, request: null, result: null, status: 'draft', bindings: {} });
const sameAsset = (a: AssetVersion, b: AssetVersion) => a.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;
const canonical = (value: unknown): string => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.entries(value).filter(([, entry]) => entry !== undefined).sort(([a], [b]) => a.localeCompare(b))
    .map(([key, entry]) => `${JSON.stringify(key)}:${canonical(entry)}`).join(',')}}` : JSON.stringify(value) ?? '';
export function assertCompositionDraft(value: CompositionDraft, scope: CompositionStoreScope) {
  if (!value || typeof value.copy_text !== 'string' || value.copy_text.length > 12000 || value.copy_text.includes('\0')
    || !['draft', 'saved', 'submitting', 'uncertain', 'completed'].includes(value.status)
    || !value.bindings || typeof value.bindings !== 'object' || Array.isArray(value.bindings) || Object.keys(value.bindings).length > 6) throw new Error('invalid_composition_draft');
  if (value.source && (!(value.source.blob instanceof Blob) || value.source.blob.type !== 'image/png'
    || value.source.blob.size > 8388608 || value.source.blob.size < 8 || typeof value.source.name !== 'string' || !value.source.name.trim() || value.source.name.length > 240
    || typeof value.source.upload_id !== 'string' || !value.source.upload_id.trim() || value.source.upload_id.length > 200
    || (value.source.version && value.source.version.identity.business_id !== scope.business))) throw new Error('invalid_composition_source');
  if (value.request) {
    assertHtmlCompositionRequest(value.request);
    if (value.request.context.business_id !== scope.business || value.request.context.actor_id !== scope.actor
      || value.request.context.session_id !== scope.session) throw new Error('composition_scope_mismatch');
    if (!value.source?.version || !sameAsset(value.source.version.identity, value.request.design_reference)) throw new Error('composition_reference_changed');
    const lines = value.copy_text.split(/\r?\n/).filter(line => line.trim().length > 0);
    const approvedLines = value.request.copy.blocks.map(block => block.text).join('\n').split(/\r?\n/).filter(line => line.trim().length > 0);
    if (canonical(lines) !== canonical(approvedLines)) throw new Error('composition_copy_changed');
  }
  if (value.result) { if (!value.request) throw new Error('invalid_composition_draft'); assertHtmlCompositionResult(value.result, value.request); }
  if ((value.status === 'completed') !== !!value.result || (value.status !== 'draft' && !value.request)
    || (value.status === 'draft' && !!value.request)) throw new Error('invalid_composition_draft');
  for (const [slot, binding] of Object.entries(value.bindings)) {
    if (!value.result?.composition.slots.some(item => item.id === slot) || !binding || typeof binding !== 'object' || Array.isArray(binding)) throw new Error('invalid_composition_binding');
    if ('omitted' in binding) {
      if (binding.omitted !== true || Object.keys(binding).length !== 1) throw new Error('invalid_composition_binding');
    } else if (!binding.asset || binding.asset.business_id !== scope.business || !binding.asset.asset_id || !binding.asset.version_id
      || Object.keys(binding).some(key => !['asset', 'origin', 'altText'].includes(key))
      || !['local', 'server'].includes(binding.origin) || typeof binding.altText !== 'string' || binding.altText.length > 500 || binding.altText.includes('\0')
      || (value.request && sameAsset(binding.asset, value.request.design_reference))) throw new Error('composition_scope_mismatch');
  }
}
/** Pure async verification, outside the short IndexedDB transaction. */
export async function verifyCompositionDraft(value: CompositionDraft, scope: CompositionStoreScope): Promise<void> {
  assertCompositionDraft(value, scope);
  if (value.request) await verifyHtmlCompositionRequest(value.request);
  if (value.source) {
    const bytes = new Uint8Array(await value.source.blob.arrayBuffer()), dimensions = await inspectServerPng(bytes);
    const version = value.source.version;
    if (version) {
      if (version.storage.mime_type !== 'image/png' || version.storage.size_bytes !== bytes.length
        || version.storage.width !== dimensions.width || version.storage.height !== dimensions.height) throw new Error('composition_reference_changed');
      if (/^[a-f0-9]{64}$/i.test(version.identity.version_id)) {
        const digest = await crypto.subtle.digest('SHA-256', bytes);
        const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
        if (hash !== version.identity.version_id.toLowerCase()) throw new Error('composition_reference_changed');
      }
    }
  }
}
export function assertCompositionTransition(previous: CompositionDraft, next: CompositionDraft): void {
  if (!previous.request) return;
  if (previous.status === 'completed' && next.status === 'draft') return;
  if (!next.request || canonical(previous.request) !== canonical(next.request)
    || previous.source?.upload_id !== next.source?.upload_id) throw new Error('composition_request_locked');
  if (previous.result && canonical(previous.result) !== canonical(next.result)) throw new Error('composition_result_locked');
  if (previous.status === 'uncertain' && ['draft', 'saved', 'submitting'].includes(next.status)) throw new Error('composition_outcome_unknown');
}
export async function openCompositionStore(scope: CompositionStoreScope) {
  if (![scope.actor, scope.business, scope.session].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256)) throw new Error('composition_scope_mismatch');
  scope = { ...scope };
  const key = JSON.stringify([scope.actor, scope.business, scope.session]);
  let closed = false;
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open('scory-design-html-compositions-v1', 1);
    request.onupgradeneeded = () => { if (failed) request.transaction?.abort(); else request.result.createObjectStore('drafts'); };
    const failure = () => { failed = true; reject(new Error('composition_store_unavailable')); };
    request.onerror = failure; request.onblocked = failure;
    request.onsuccess = () => {
      if (failed) { request.result.close(); return; }
      request.result.onversionchange = () => { closed = true; request.result.close(); }; resolve(request.result);
    };
  });
  function transaction(expected?: number, value?: CompositionDraft): Promise<CompositionRecord | null> {
    if (closed) throw new Error('composition_store_closed');
    if (value) assertCompositionDraft(value, scope);
    const frozen = value ? structuredClone(value) : undefined;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', frozen ? 'readwrite' : 'readonly'), bucket = tx.objectStore('drafts');
      let answer: CompositionRecord | null = null, failure: unknown;
      tx.oncomplete = () => resolve(answer); tx.onabort = () => reject(failure ?? tx.error ?? new Error('composition_store_unavailable'));
      const query = bucket.get(key);
      query.onsuccess = () => { try {
        const previous = query.result as CompositionRecord | undefined;
        if (previous) { if (!Number.isSafeInteger(previous.revision) || previous.revision < 1) throw new Error('invalid_composition_draft'); assertCompositionDraft(previous.value, scope); }
        if (frozen) {
          if ((previous?.revision ?? 0) !== expected) throw new Error('composition_revision_conflict');
          if (previous) assertCompositionTransition(previous.value, frozen);
          answer = { revision: (expected ?? 0) + 1, value: frozen }; bucket.put(answer, key);
        } else answer = previous ?? null;
      } catch (error) { failure = error; tx.abort(); } };
    });
  }
  async function read() {
    const record = await transaction();
    if (record) await verifyCompositionDraft(record.value, scope);
    if (closed) throw new Error('composition_store_closed');
    return record;
  }
  return { read, write: async (revision: number, value: CompositionDraft) => {
    if (!Number.isSafeInteger(revision) || revision < 0 || revision >= Number.MAX_SAFE_INTEGER) throw new Error('invalid_composition_revision');
    // Freeze inputs before hashing; concurrent edits cannot alter the pending write.
    const frozen = structuredClone(value);
    await verifyCompositionDraft(frozen, scope);
    const previous = await read();
    if ((previous?.revision ?? 0) !== revision) throw new Error('composition_revision_conflict');
    return (await transaction(revision, frozen))!;
  }, close: () => { closed = true; db.close(); } };
}
