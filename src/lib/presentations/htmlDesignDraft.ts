import { PRESENTATION_REFERENCE_ROLES, type PreparedPresentationReference } from './presentationReferences';
import { assertPresentationSlides, type PresentationMountedAsset, type PresentationSlide } from './presentationDocument';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';

export interface HtmlDesignScope { actor: string; business: string; document: string; slide: string }
export interface HtmlDesignTarget { document: string; slide: string; revision: number }
export interface HtmlDesignProposal {
  html: string; target: HtmlDesignTarget; intent: 'insert' | 'replace';
  canvas: { width: number; height: number }; mounted: PresentationMountedAsset[];
  pending?: { source: PresentationSlide; reason: string };
}
export interface HtmlDesignDraft {
  instruction: string; feedback: string; copy: string; copyMode: 'instruction' | 'literal' | 'none';
  references: PreparedPresentationReference[]; proposal: HtmlDesignProposal | null;
  messages: { role: 'user' | 'assistant'; text: string }[];
  status: 'ready' | 'sending' | 'uncertain';
}
export const emptyHtmlDesignDraft = (): HtmlDesignDraft => ({ instruction: '', feedback: '', copy: '', copyMode: 'instruction',
  references: [], proposal: null, messages: [], status: 'ready' });
// Draft identifiers cannot contain any ASCII control byte.
const id = (value: unknown, max = 256): value is string => typeof value === 'string' && value.trim().length > 0
  && value.length <= max && !/[\u0000-\u001f\u007f]/.test(value); // eslint-disable-line no-control-regex
function assertDraftRevision(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= Number.MAX_SAFE_INTEGER) throw Error('invalid_html_design_revision');
}
export function assertHtmlDesignDraft(value: HtmlDesignDraft, scope: HtmlDesignScope) {
  if (!value || !scope || ![scope.actor, scope.business, scope.document, scope.slide].every(v => id(v))
    || !['instruction', 'literal', 'none'].includes(value.copyMode) || !['ready', 'sending', 'uncertain'].includes(value.status)
    || ![value.instruction, value.feedback, value.copy].every(v => typeof v === 'string' && v.length <= 16000)
    || !Array.isArray(value.references) || value.references.length > 3
    || !Array.isArray(value.messages) || value.messages.length > 40) throw Error('invalid_html_design_draft');
  const referenceIds = new Set<string>();
  for (const item of value.references) {
    if (!item || !(item.blob instanceof Blob) || item.blob.type !== 'image/png' || !item.blob.size || item.blob.size > 8388608
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || item.id !== `reference:${item.sha256}`
      || !id(item.name, 240) || !PRESENTATION_REFERENCE_ROLES.includes(item.role) || referenceIds.has(item.id)) throw Error('invalid_html_design_reference');
    referenceIds.add(item.id);
  }
  for (const item of value.messages) if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string'
    || item.text.length > 16000) throw Error('invalid_html_design_history');
  const p = value.proposal;
  if (p && (typeof p.html !== 'string' || p.html.length > 16 * 1024 * 1024
    || !p.target || p.target.document !== scope.document || p.target.slide !== scope.slide || !Number.isSafeInteger(p.target.revision) || p.target.revision < 1
    || !['insert', 'replace'].includes(p.intent) || !p.canvas || ![p.canvas.width, p.canvas.height].every(n => Number.isSafeInteger(n) && n >= 256 && n <= 3840)
    || !Array.isArray(p.mounted) || p.mounted.some(m => !m?.asset || m.asset.business_id !== scope.business))) throw Error('html_design_target_changed');
  if (p) assertPresentationSlides([{ id: scope.slide, revision: p.target.revision, title: '', html: p.html, mounted_assets: p.mounted }]);
  if (p?.pending) {
    const pending = p.pending;
    if (!pending.source || pending.source.id !== scope.slide || pending.source.revision !== p.target.revision
      || typeof pending.source.html !== 'string' || pending.source.html.length > 16 * 1024 * 1024
      || typeof pending.reason !== 'string' || !pending.reason.trim() || pending.reason.length > 2000
      || p.mounted.length || pending.source.mounted_assets?.some(item => item?.asset?.business_id !== scope.business)) throw Error('html_design_target_changed');
    assertPresentationSlides([pending.source]);
  }
}
export function assertHtmlDesignTarget(proposal: HtmlDesignProposal, current: HtmlDesignTarget) {
  if (!proposal?.target || !current || !id(current.document) || !id(current.slide) || !Number.isSafeInteger(current.revision) || current.revision < 1
    || proposal.target.document !== current.document || proposal.target.slide !== current.slide || proposal.target.revision !== current.revision) {
    throw Error('El lienzo cambió. La propuesta se conserva; vuelve a la versión de origen o inicia un encargo sobre la versión actual.');
  }
}
/** «Salir conservando el último borrador guardado»: back to the saved draft (or the panel's) ready for a new request.
 * An unconfirmed request is released (HTML generation keeps no server result) and a proposal made for another
 * version is dropped (the conversation keeps it in its versions); instruction, copy, references and messages stay. */
export function leaveHtmlDesignDraft(saved: HtmlDesignDraft | null, current: HtmlDesignDraft, target: HtmlDesignTarget): HtmlDesignDraft {
  const next = structuredClone(saved ?? current), p = next.proposal?.target;
  const same = !!p && p.document === target.document && p.slide === target.slide && p.revision === target.revision;
  return { ...next, status: 'ready', proposal: same ? next.proposal : null };
}
export interface HtmlDesignRecord { revision: number; value: HtmlDesignDraft }
export async function assertHtmlDesignReferenceBytes(references: PreparedPresentationReference[]) {
  for (const reference of references) {
    const bytes = await reference.blob.arrayBuffer(), dimensions = await inspectServerPng(new Uint8Array(bytes));
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const hash = Array.from(digest, byte => byte.toString(16).padStart(2, '0')).join('');
    if (dimensions.width > 1024 || dimensions.height > 1024 || hash !== reference.sha256) throw Error('invalid_html_design_reference');
  }
}
/** IndexedDB retains PNG references and editable results by actor and document, never tokens. */
export async function openHtmlDesignDraft(inputScope: HtmlDesignScope) {
  const scope = { ...inputScope };
  assertHtmlDesignDraft(emptyHtmlDesignDraft(), scope);
  const key = JSON.stringify([scope.actor, scope.business, scope.document, scope.slide]);
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    let failed = false;
    const request = indexedDB.open('scory-html-design-workspace-v1', 1);
    request.onupgradeneeded = () => { if (failed) request.transaction?.abort(); else request.result.createObjectStore('drafts'); };
    request.onerror = request.onblocked = () => { failed = true; reject(Error('No se pudo abrir el borrador de HTML de este navegador.')); };
    request.onsuccess = () => { if (failed) request.result.close(); else resolve(request.result); };
  });
  let closed = false;
  db.onversionchange = () => { closed = true; db.close(); };
  function transact(expected?: number, next?: HtmlDesignDraft): Promise<HtmlDesignRecord | null> {
    if (closed) throw Error('html_design_store_closed');
    const frozen = next ? structuredClone(next) : undefined;
    if (frozen) { assertDraftRevision(expected!); assertHtmlDesignDraft(frozen, scope); }
    return new Promise((resolve, reject) => {
      const tx = db.transaction('drafts', frozen ? 'readwrite' : 'readonly'), bucket = tx.objectStore('drafts');
      let result: HtmlDesignRecord | null = null, failure: unknown;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(failure ?? tx.error ?? Error('No se pudo guardar el borrador de HTML.'));
      const request = bucket.get(key);
      request.onsuccess = () => { try {
        const previous = request.result as HtmlDesignRecord | undefined;
        if (previous) { assertHtmlDesignDraft(previous.value, scope); if (!Number.isSafeInteger(previous.revision) || previous.revision < 1) throw Error('invalid_html_design_draft'); }
        if (!frozen) { result = previous ?? null; return; }
        if ((previous?.revision ?? 0) !== expected) throw Error('Otra pestaña modificó esta conversación. Ciérrala y vuelve a abrirla para recuperar el borrador.');
        result = { revision: (expected ?? 0) + 1, value: frozen }; bucket.put(result, key);
      } catch (e) { failure = e; tx.abort(); } };
    });
  }
  return {
    async read() { const record = await transact(); if (record) await assertHtmlDesignReferenceBytes(record.value.references); return record; },
    async write(revision: number, value: HtmlDesignDraft) {
      assertDraftRevision(revision); const frozen = structuredClone(value); assertHtmlDesignDraft(frozen, scope);
      await assertHtmlDesignReferenceBytes(frozen.references); return await transact(revision, frozen) as HtmlDesignRecord;
    },
    close() { closed = true; db.close(); },
  };
}
