import { PRESENTATION_REFERENCE_ROLES, type PreparedPresentationReference } from './presentationReferences';
import { assertPresentationSlides, type PresentationMountedAsset, type PresentationSlide } from './presentationDocument';
import { inspectServerPng } from '../../../supabase/functions/_shared/desaing/serverPng';
import type { DesignVisualReview } from './designVisualReview';
import type { StyleLockReport } from './styleLock';
import type { StyleTransferReport } from './styleTransfer';
import { assertConversationDesignSource, type ConversationDesignSource } from '../../../supabase/functions/_shared/desaing/conversationActions';
import { isDesignConversationSessionToken } from '../../../supabase/functions/_shared/desaing/conversationSessions';

export interface HtmlDesignScope { actor: string; business: string; document: string; slide: string; session?: string }
export interface HtmlDesignTarget { document: string; slide: string; revision: number }
export interface HtmlDesignProposal {
  html: string; target: HtmlDesignTarget; intent: 'insert' | 'replace';
  canvas: { width: number; height: number }; mounted: PresentationMountedAsset[];
  pending?: { source: PresentationSlide; reason: string };
  visualReview?: DesignVisualReview;
  /** Style lock result against the base («Diferencias de estilo»). */
  styleLock?: StyleLockReport;
  /** «Estilo de la diapositiva N»: what was compared with the source and the user's indications. */
  styleTransfer?: StyleTransferReport;
  /** Short notices of this generation (omitted capture or reference, discarded correction). */
  notices?: string[];
}
export interface HtmlDesignDraft {
  instruction: string; feedback: string; copy: string; copyMode: 'instruction' | 'literal' | 'none';
  designBase?: 'current' | 'version' | 'deck' | 'new';
  designSource?: ConversationDesignSource;
  /** Native source snapshot and its individual pixels survive review/reload. */
  sourceSlide?: PresentationSlide;
  sourceReference?: PreparedPresentationReference;
  references: PreparedPresentationReference[]; proposal: HtmlDesignProposal | null;
  /** Receipt of consulted deck evidence. Contact-sheet pixels stay ephemeral, outside user attachments. */
  inspection?: { reference_ids: string[]; examples: string[] };
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
    || scope.session !== undefined && !isDesignConversationSessionToken(scope.session)
    || !['instruction', 'literal', 'none'].includes(value.copyMode) || !['ready', 'sending', 'uncertain'].includes(value.status)
    || value.designBase !== undefined && !['current', 'version', 'deck', 'new'].includes(value.designBase)
    || ![value.instruction, value.feedback, value.copy].every(v => typeof v === 'string' && v.length <= 16000)
    || !Array.isArray(value.references) || value.references.length > 3
    || !Array.isArray(value.messages) || value.messages.length > 40) throw Error('invalid_html_design_draft');
  const referenceIds = new Set<string>();
  if (value.designSource !== undefined) {
    assertConversationDesignSource(value.designSource);
    if (value.designSource.source.kind === 'asset' && value.designSource.source.asset.business_id !== scope.business)
      throw Error('invalid_html_design_source');
  }
  if (value.sourceSlide !== undefined) {
    const source = value.designSource?.source, slide = value.sourceSlide;
    if (source?.kind !== 'slide' || slide?.id !== source.slide_id || String(slide?.revision) !== source.revision
      || typeof slide.html !== 'string' || slide.html.length > 16 * 1024 * 1024
      || slide.mounted_assets?.some(item => item?.asset?.business_id !== scope.business)) throw Error('invalid_html_design_source');
    assertPresentationSlides([slide]);
  }
  if (value.sourceReference !== undefined) {
    if (!value.designSource || value.designSource.source.kind === 'reference' && value.sourceReference.id !== value.designSource.source.reference_id)
      throw Error('invalid_html_design_source');
    assertHtmlDesignDraft({ ...emptyHtmlDesignDraft(), references: [value.sourceReference] }, scope);
  }
  if (value.inspection && (!Array.isArray(value.inspection.reference_ids) || value.inspection.reference_ids.length > 1
    || value.inspection.reference_ids.some(reference => typeof reference !== 'string' || !/^deck:[a-f0-9]{64}$/.test(reference))
    || !Array.isArray(value.inspection.examples) || value.inspection.examples.length > 3
    || value.inspection.examples.some(example => typeof example !== 'string' || !example.trim() || example.length > 40000)))
    throw Error('invalid_html_design_inspection');
  for (const item of value.references) {
    if (!item || !(item.blob instanceof Blob) || item.blob.type !== 'image/png' || !item.blob.size || item.blob.size > 8388608
      || typeof item.sha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.sha256) || item.id !== `reference:${item.sha256}`
      || !id(item.name, 240) || !PRESENTATION_REFERENCE_ROLES.includes(item.role) || referenceIds.has(item.id)) throw Error('invalid_html_design_reference');
    referenceIds.add(item.id);
  }
  for (const item of value.messages) if (!item || !['user', 'assistant'].includes(item.role) || typeof item.text !== 'string'
    || item.text.length > 16000) throw Error('invalid_html_design_history');
  const p = value.proposal;
  if (p?.visualReview && (!['passed', 'needs_review', 'unavailable'].includes(p.visualReview.status)
    || !Number.isInteger(p.visualReview.repairs) || p.visualReview.repairs < 0 || p.visualReview.repairs > 2
    || !Array.isArray(p.visualReview.issues) || p.visualReview.issues.length > 20
    || p.visualReview.issues.some(issue => typeof issue !== 'string' || issue.length > 4000))) throw Error('invalid_html_design_review');
  const shortList = (list: unknown, max: number) => Array.isArray(list) && list.length <= max && list.every(item => typeof item === 'string' && item.length <= 1000);
  if (p?.styleLock && (!['none', 'reported', 'restored', 'overflow'].includes(p.styleLock.status) || !shortList(p.styleLock.differences, 30)
    || p.styleLock.question !== undefined && (typeof p.styleLock.question !== 'string' || p.styleLock.question.length > 400)
    || [p.styleLock.compared, p.styleLock.released].some(count => count !== undefined && (!Number.isSafeInteger(count) || count < 0)))) throw Error('invalid_html_design_review');
  const transfer = p?.styleTransfer;
  if (transfer && (![transfer.source, transfer.checked, transfer.assertions].every(count => Number.isSafeInteger(count) && count >= 0)
    || !shortList(transfer.fixed, 30) || !shortList(transfer.failed, 30) || !shortList(transfer.skipped, 12) || !shortList(transfer.accents, 12)
    || transfer.label !== undefined && (typeof transfer.label !== 'string' || transfer.label.length > 200))) throw Error('invalid_html_design_review');
  if (p?.notices !== undefined && !shortList(p.notices, 8)) throw Error('invalid_html_design_review');
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
/** JSON storage may reorder object keys; target identity depends only on its values. */
export function sameHtmlDesignTarget(a: HtmlDesignTarget | null | undefined, b: HtmlDesignTarget | null | undefined): boolean {
  return !!a && !!b && a.document === b.document && a.slide === b.slide && a.revision === b.revision;
}
export function assertHtmlDesignTarget(proposal: HtmlDesignProposal, current: HtmlDesignTarget) {
  if (!proposal?.target || !current || !id(current.document) || !id(current.slide) || !Number.isSafeInteger(current.revision) || current.revision < 1
    || !sameHtmlDesignTarget(proposal.target, current)) {
    throw Error('El lienzo cambió. La propuesta se conserva; vuelve a la versión de origen o inicia un encargo sobre la versión actual.');
  }
}
/** «Salir conservando el último borrador guardado»: back to the saved draft (or the panel's) ready for a new request.
 * An unconfirmed request is released (HTML generation keeps no server result) and a proposal made for another
 * version is dropped (the conversation keeps it in its versions); instruction, copy, references and messages stay. */
export function leaveHtmlDesignDraft(saved: HtmlDesignDraft | null, current: HtmlDesignDraft, target: HtmlDesignTarget): HtmlDesignDraft {
  const next = structuredClone(saved ?? current), p = next.proposal?.target;
  const same = sameHtmlDesignTarget(p, target);
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
  const key = JSON.stringify([scope.actor, scope.business, scope.document, scope.slide, ...(scope.session ? [scope.session] : [])]);
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
    async read() { const record = await transact(); if (record) await assertHtmlDesignReferenceBytes([...record.value.references,
      ...(record.value.sourceReference ? [record.value.sourceReference] : [])]); return record; },
    async write(revision: number, value: HtmlDesignDraft) {
      assertDraftRevision(revision); const frozen = structuredClone(value); assertHtmlDesignDraft(frozen, scope);
      await assertHtmlDesignReferenceBytes([...frozen.references, ...(frozen.sourceReference ? [frozen.sourceReference] : [])]);
      return await transact(revision, frozen) as HtmlDesignRecord;
    },
    close() { closed = true; db.close(); },
  };
}
