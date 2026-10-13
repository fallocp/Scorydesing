import { useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from 'react';
import { X, Sparkles, Wand2, Loader2, Pencil, Plus } from 'lucide-react';
import { reviewDesignCanvasHtml, useGenerateSlide } from '@/hooks/useGenerateSlide';
import { DesignHtmlRequestError, isDefinitiveHtmlFailure } from '@/lib/presentations/htmlRequestError';
import { useAuth } from '@/hooks/useAuth';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { supabase } from '@/integrations/supabase/client';
import { renderHtmlForReview } from '@/utils/xendingDesign/canvasRenderer';
import { describeVisualReview, reviewAndRepairDesign, type DesignVisualReview } from '@/lib/presentations/designVisualReview';
import { designReviewRequest } from '@/lib/presentations/designReviewRequest';
import type { DesignCanvasHtmlRequest } from '../../../supabase/functions/_shared/designCanvasHtml';
import type { ConversationDesignSource } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { AccentPlanItem, StyleUnlock } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { deriveTypeScale, formatStyleSpec, measureRoleSheet, measureStyleSamples, measureStyleSamplesCached, styleMeasureCause } from '@/lib/presentations/styleSpec';
import { describeStyleTransfer, effectiveTokens, runStyleTransfer, syntheticSourceSheet, type StyleTransferReport } from '@/lib/presentations/styleTransfer';
import { DECK_STRUCTURE_LABELS, describeSignature, sameShape, signatureOf, type DeckStructure, type DeckSystem, type SlideSignature } from '@/lib/presentations/deckSystem';
import { describeStyleLock, enforceStyleLock, releaseStyleLock, type StyleLockReport } from '@/lib/presentations/styleLock';
import { structuralEditFits, type StructuralCheckCache } from '@/lib/presentations/designStructuralCheck';
import { buildScopedRepairFeedback, correctionIsWorse, imageHoles, inheritedImageHoles, isMissingResourceIssue, isOrientationChange,
  type DesignFromExistingFlags } from '@/lib/presentations/designFromExisting';
import { VisualDesignEditor } from '@/components/VisualDesignEditor';
import { PresentationCanvas } from './PresentationCanvas';
import { PresentationReferencePicker } from './PresentationReferencePicker';
import { DesignLogoPicker, type DesignLogoSelection } from './DesignLogoPicker';
import { insertDesignLogo } from '@/lib/presentations/designLogo';
import { addPresentationReference, preparePresentationReference, type PreparedPresentationReference } from '@/lib/presentations/presentationReferences';
import { imageDataUrl } from '@/lib/desaing/labImages';
import { getSlideDimensions, type PresentationMountedAsset, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { isUnresolvedReferenceCopy } from '@/lib/presentations/presentationServerDesign';
import { reconcileMountedAssets } from '@/lib/presentations/presentationManifest';
import { measureHtmlDesignAssets } from '@/lib/presentations/htmlDesignAssets';
import { assertHtmlDesignDraft, assertHtmlDesignTarget, emptyHtmlDesignDraft, leaveHtmlDesignDraft, openHtmlDesignDraft, sameHtmlDesignTarget,
  type HtmlDesignDraft, type HtmlDesignTarget, type HtmlDesignProposal } from '@/lib/presentations/htmlDesignDraft';
import './SlideGeneratorPanel.css';

export interface SlideGeneratorPanelProps {
  currentHtml?: string; businessId?: string; documentId?: string; slideId?: string; revision?: number;
  canvas?: { width: number; height: number }; mountedAssets?: PresentationMountedAsset[];
  initialInstruction?: string; initialCopy?: string; initialCopyMode?: HtmlDesignDraft['copyMode']; initialReferences?: PreparedPresentationReference[]; surfaceLabel?: string;
  embedded?: boolean; externalConversation?: boolean;
  /** Session generation scopes saved drafts; the actual slide target stays unchanged. */
  conversationSessionId?: string;
  controllerRef?: Ref<SlideGeneratorController>;
  onProposal?(proposal: HtmlDesignProposal, reason: SlideProposalReason): void;
  /** Continue through the owning conversation so the correction becomes a saved version. */
  onCorrectComposition?(): Promise<void>;
  onState?(state: SlideGeneratorState): void;
  onInsert(html: string, target?: HtmlDesignTarget, mounted?: PresentationMountedAsset[]): void | Promise<void>;
  onApplyToCurrent(html: string, target?: HtmlDesignTarget, mounted?: PresentationMountedAsset[]): void | Promise<void>;
  onClose(): void;
  slides?: Array<{ title: string; html: string }>; currentSlide?: number; onSelectSlide?(idx: number): void;
  /** Other slides of the deck (inert markup + CSS) to reuse their components when creating. */
  styleExamples?: string[];
  /** Original deck slide, including its assets, for an optional pixel reference during creation. */
  styleSourceHtml?: string;
  /** «Ficha de estilo» measured from the base design; sent with every request. */
  styleSpec?: string;
  /** Waits (max. 8 s) for the measured spec; '' when unavailable. */
  styleSpecReady?(): Promise<string>;
  /** «Diseñar sobre lo que ya existe» pieces; undefined = current behavior. */
  fromExisting?: DesignFromExistingFlags;
  /** Result first: return the proposal without reviewing it; the owner calls `reviewLater()` (no automatic repairs). */
  backgroundReview?: boolean;
  /** Replaces the default preview (the design screen's zoomable canvas). */
  renderPreview?(html: string): ReactNode;
}
/** Per-request data from the conversation turn; never persisted in the draft. */
export interface SlideGeneratorTurn {
  /** Categories the user unlocked; undefined = the style lock only reports. */
  unlock?: StyleUnlock[];
  /** The user's request, checked by the visual review. */
  checklist?: string[];
  /** «Corregir composición»: problems of the version being corrected, compared with the result. */
  correction?: { issues: string[] };
  /** The original request kept by a scoped correction. */
  request?: string;
  /** «Estilo de la diapositiva N»: copied without AI after any generation, then verified against the source. */
  transfer?: SlideStyleTransfer;
  /** «Sistema de la presentación» of this generation (VITE_DESAING_DECK_SYSTEM); a cited slide (`transfer`) wins over it. */
  deck?: SlideDeckTurn;
}
/** Deck system for one generation: tokens applied without AI afterwards, the exemplar of the chosen arrangement and the generator's block. */
export interface SlideDeckTurn {
  system: DeckSystem;
  /** Destination slide number, deck size and its neighbors (signature comparison at the end). */
  number: number; deckSize: number; neighbors: Array<{ number: number; signature: SlideSignature }>;
  /** Apply the deck tokens without AI after generating. */
  tokens: boolean;
  /** Arrangement whose tokens apply when it has ≥2 exemplars; `label` only when this turn chose an arrangement. */
  archetype?: DeckStructure; label?: string; policy?: 'varied' | 'repeated';
  /** Inert exemplar for style_examples and its original HTML for the capture (deck base only). */
  example?: string; exemplarHtml?: string;
  /** «SISTEMA DE LA PRESENTACIÓN» block for the generator. */
  spec?: string;
  /** Categories the user unlocked in this turn: the system does not override them. */
  skip?: { typography?: boolean; colors?: boolean; components?: boolean };
  brand?: SlideStyleTransfer['brand'];
}
export interface SlideStyleTransfer {
  sourceHtml: string; sourceNumber: number; planned?: AccentPlanItem[];
  brand?: { name?: string; colors?: string[]; display?: string; body?: string };
  /** Nearby slides of the deck (with the cited one) for the standard type scale. */
  deck?: string[];
}
export type SlideProposalReason = 'generated' | 'refined' | 'edited' | 'recovered' | 'imported';
export interface SlideGeneratorContext {
  instruction?: string; copy?: string; copyMode?: HtmlDesignDraft['copyMode']; references?: PreparedPresentationReference[];
  designBase?: 'current' | 'version' | 'deck' | 'new';
  designSource?: ConversationDesignSource | null;
  sourceSlide?: PresentationSlide;
  sourceReference?: PreparedPresentationReference;
  proposal?: HtmlDesignProposal;
  /** Refine the slide's own HTML (its template) instead of the draft's last proposal. */
  fromCurrent?: boolean;
  /** Consulted deck pixels and inert examples, separate from the user's three attachments. */
  inspectionReferences?: PreparedPresentationReference[];
  inspectionExamples?: string[];
  turn?: SlideGeneratorTurn;
}
export interface SlideGeneratorState {
  ready: boolean; busy: boolean; error: string; status: HtmlDesignDraft['status'];
  context: { instruction: string; copy: string; copyMode: HtmlDesignDraft['copyMode']; references: PreparedPresentationReference[] };
  proposal: HtmlDesignProposal | null;
}
export interface SlideGeneratorController {
  updateContext(input: SlideGeneratorContext): Promise<void>;
  create(input?: SlideGeneratorContext): Promise<HtmlDesignProposal>;
  /** rewrite: regenerate the whole document from the current HTML instead of patching it. */
  refine(input: SlideGeneratorContext & { feedback: string; compare?: boolean; rewrite?: true }): Promise<HtmlDesignProposal>;
  openEditor(options?: { icons?: boolean }): Promise<void>;
  openLogos(): Promise<void>;
  recover(): Promise<HtmlDesignDraft>;
  /** Releases an unconfirmed request (HTML generation has no server-side result to recover). Keeps the proposal. */
  discardPending(): Promise<void>;
  apply(): Promise<void>;
  /** Copies the style of another slide onto the current design without AI (`turn.transfer`), verified against the source. */
  transferStyle?(input: SlideGeneratorContext): Promise<HtmlDesignProposal>;
  /** Reviews the last proposal returned without review (`backgroundReview`); never repairs it. Null when there is none. */
  reviewLater?(): Promise<{ html: string; visualReview: DesignVisualReview; worse: boolean } | null>;
}
type Store = Awaited<ReturnType<typeof openHtmlDesignDraft>>;
/** Requests above ~5 MB fail at the Edge Function boundary. */
const MAX_HTML_REQUEST_BYTES = 5 * 1048576;
type Life = { active: boolean; store?: Store; revision: number; queue: Promise<unknown> };

/** Same workspace for presentation slides and independent covers/pages. */
export function SlideGeneratorPanel(props: SlideGeneratorPanelProps) {
  const { user } = useAuth(), { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessId = props.businessId ?? activeBusinessId;
  if (!user || !businessId) return <div className={props.embedded ? 'hws-embedded' : 'hws-overlay'}><section className="hws-dialog"><p>Inicia sesión y selecciona una marca para diseñar.</p>{!props.embedded && <button onClick={props.onClose}>Cerrar</button>}</section></div>;
  const documentId = props.documentId ?? `draft:${businessId}`, slideId = props.slideId ?? 'current';
  return <HtmlDesignWorkspace key={JSON.stringify([user.id, businessId, documentId, slideId, props.conversationSessionId])} {...props}
    businessId={businessId} documentId={documentId} slideId={slideId} actorId={user.id} brandName={activeBusiness?.name ?? 'Marca actual'} />;
}
function HtmlDesignWorkspace(props: SlideGeneratorPanelProps & { actorId: string; businessId: string; documentId: string; slideId: string; brandName: string }) {
  const generate = useGenerateSlide();
  const [draft, setDraft] = useState<HtmlDesignDraft>(emptyHtmlDesignDraft), draftRef = useRef(draft); draftRef.current = draft;
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [fileBusy, setFileBusy] = useState(false), [error, setError] = useState('');
  const [editing, setEditing] = useState(false), [intent, setIntent] = useState<'insert' | 'replace'>(props.surfaceLabel ? 'replace' : 'insert');
  const [logosOpen, setLogosOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [reviewProgress, setReviewProgress] = useState('');
  const [format, setFormat] = useState<'current' | 'slide' | 'letter'>('current');
  const history = useRef<HTMLDivElement>(null);
  const lifeRef = useRef<Life | null>(null), locked = useRef(false), latest = useRef(props); latest.current = props;
  const deckCaptureRef = useRef<{ html: string; image: string } | null>(null);
  const inspectionReferencesRef = useRef<PreparedPresentationReference[]>([]);
  const reviewContextRef = useRef<{ request: DesignCanvasHtmlRequest & { expectedActorId: string }; html: string } | null>(null);
  const turnRef = useRef<SlideGeneratorTurn | null>(null), structuralRef = useRef<StructuralCheckCache['current']>(null);
  const [iconPicker, setIconPicker] = useState(false);
  // Result first: the review of the last unreviewed proposal, run later by the owner.
  const laterReviewRef = useRef<{ html: string; review(): Promise<{ visualReview: DesignVisualReview }>; correction?: string[] } | null>(null);
  const [backgroundReviewing, setBackgroundReviewing] = useState(false);
  const target: HtmlDesignTarget = { document: props.documentId, slide: props.slideId, revision: props.revision ?? 1 };
  const canvas = props.canvas ?? (format === 'letter' ? { width: 1920, height: 2485 } : format === 'slide' ? { width: 1920, height: 1080 }
    : getSlideDimensions(props.currentHtml ?? ''));
  const active = (life: Life) => life.active && lifeRef.current === life;
  const currentTarget = (): HtmlDesignTarget => ({ document: latest.current.documentId, slide: latest.current.slideId, revision: latest.current.revision ?? 1 });
  const blocked = busy || fileBusy || !ready;
  useEffect(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; }, [draft.messages]);
  useEffect(() => { if (!editing) setIconPicker(false); }, [editing]);
  useEffect(() => {
    const life: Life = { active: true, revision: 0, queue: Promise.resolve() }; lifeRef.current = life;
    void (async () => {
      const store = await openHtmlDesignDraft({ actor: props.actorId, business: props.businessId, document: props.documentId, slide: props.slideId,
        ...(props.conversationSessionId ? { session: props.conversationSessionId } : {}) });
      if (!active(life)) { store.close(); return; } life.store = store;
      const record = await store.read(); if (!active(life)) return;
      life.revision = record?.revision ?? 0;
      const initial = record?.value ?? { ...emptyHtmlDesignDraft(), instruction: props.initialInstruction ?? '', copy: props.initialCopy ?? '',
        copyMode: props.initialCopyMode ?? (props.initialCopy?.trim() ? 'literal' as const : 'instruction' as const), references: structuredClone(props.initialReferences ?? []) };
      if (initial.status === 'sending') initial.status = 'uncertain';
      if (initial.proposal) {
        setIntent(initial.proposal.intent);
        const { width, height } = initial.proposal.canvas;
        setFormat(width === 1920 && height === 2485 ? 'letter' : width === 1920 && height === 1080 ? 'slide' : 'current');
      }
      draftRef.current = initial; setDraft(initial); setDetailsOpen(!initial.proposal); setReady(true);
      if (initial.proposal) notifyProposal(initial.proposal, 'recovered');
    })().catch(e => { if (active(life)) setError(e.message); });
    return () => { life.active = false; void life.queue.finally(() => life.store?.close()); };
  }, [props.actorId, props.businessId, props.documentId, props.slideId, props.conversationSessionId]);
  function patch(partial: Partial<HtmlDesignDraft>) { const next = { ...draftRef.current, ...partial }; draftRef.current = next; setDraft(next); return next; }
  function notifyProposal(proposal: HtmlDesignProposal, reason: SlideProposalReason) {
    const life = lifeRef.current; if (!life || !active(life)) return;
    try { latest.current.onProposal?.(structuredClone(proposal), reason); } catch { /* Observers cannot invalidate a saved result. */ }
  }
  useEffect(() => {
    props.onState?.({ ready, busy: busy || fileBusy, error, status: draft.status,
      context: { instruction: draft.instruction, copy: draft.copy, copyMode: draft.copyMode, references: structuredClone(draft.references) },
      proposal: draft.proposal ? structuredClone(draft.proposal) : null });
  }, [ready, busy, fileBusy, error, draft]);
  async function assertSession(life: Life) {
    const { data, error: authError } = await supabase.auth.getSession();
    if (!active(life) || authError || data.session?.user.id !== props.actorId) throw Error('La sesión cambió. Abre el diseño con el usuario original.');
  }
  function persist(value = draftRef.current) {
    const life = lifeRef.current;
    if (!life || !active(life) || !life.store) return Promise.reject(Error('El borrador todavía no está listo.'));
    const snapshot = structuredClone(value);
    const work = life.queue.then(async () => {
      await assertSession(life); const saved = await life.store!.write(life.revision, snapshot); life.revision = saved.revision;
    });
    life.queue = work.catch(() => {}); return work;
  }
  const saveField = () => { if (ready && !locked.current) void persist().catch(e => setError(e.message)); };
  async function run<T>(action: (life: Life) => Promise<T>, propagate = false): Promise<T | undefined> {
    const life = lifeRef.current; if (!life || !active(life) || !ready || locked.current || fileBusy) {
      if (propagate) throw Error('El diseño está ocupado o todavía se está recuperando.'); return;
    }
    locked.current = true; setBusy(true); setError(''); setReviewProgress('');
    try { await life.queue; await assertSession(life); return await action(life); }
    catch (e) { if (active(life)) setError(e instanceof Error ? e.message : 'No se pudo completar el cambio.'); if (propagate) throw e; }
    finally { locked.current = false; if (active(life)) setBusy(false); }
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (props.externalConversation || !ready || locked.current || fileBusy || editing) return;
      const file = Array.from(event.clipboardData?.items ?? []).find(item => item.type.startsWith('image/'))?.getAsFile();
      if (!file) return; event.preventDefault();
      void run(async life => { const reference = await preparePresentationReference(file, 'image_style_reference'); if (!active(life)) return;
        await persist(patch({ references: addPresentationReference(draftRef.current.references, reference, 3) })); });
    };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  }, [ready, fileBusy, editing, props.externalConversation]);
  async function requestHtml(life: Life, refine: boolean, compare: boolean, fromCurrent = false, rewrite = false) {
    const flags = latest.current.fromExisting, turn = turnRef.current ?? {}, notices: string[] = [];
    turnRef.current = null;
    const before = structuredClone(draftRef.current), destination = { ...target };
    const designSource = before.designSource, sourceSlide = designSource ? before.sourceSlide : undefined;
    const startingFromSource = !!designSource && !refine;
    const nativeAdapt = startingFromSource && !!sourceSlide && designSource?.mode !== 'style_only';
    // A source selected on another slide is a design input, never a destination.
    if (startingFromSource) refine = nativeAdapt;
    const feedback = nativeAdapt ? before.instruction || 'Adapta la fuente elegida al contenido aprobado.' : before.feedback;
    if (before.status !== 'ready') throw Error('La solicitud anterior no se confirmó. Conserva la propuesta o prepara explícitamente otra versión.');
    if (!refine && !before.instruction.trim() && !before.references.length && !designSource) throw Error('Describe el diseño o añade una referencia.');
    if (before.copyMode === 'literal' && !before.copy.trim()) throw Error('Escribe el texto literal que debe llevar el diseño.');
    if (before.copyMode === 'literal' && isUnresolvedReferenceCopy(before.copy)) {
      setDetailsOpen(true);
      throw Error('Ese texto indica qué referencia leer. Escríbelo en «Tu idea» y elige «Según mis indicaciones», o pega aquí las palabras exactas del diseño.');
    }
    if (refine && !feedback.trim()) throw Error('Escribe el cambio que quieres hacer.');
    const proposalBase = fromCurrent || startingFromSource ? undefined : before.proposal;
    if (refine && proposalBase?.pending) throw Error('Comprueba las piezas de la propuesta antes de pedir otro ajuste.');
    const base = startingFromSource ? nativeAdapt ? sourceSlide!.html : undefined : proposalBase?.html ?? props.currentHtml;
    if (refine && !base) throw Error('Primero crea una propuesta.');
    if (refine && proposalBase) assertHtmlDesignTarget(proposalBase, destination);
    const size = startingFromSource ? canvas : refine ? getSlideDimensions(base!) : canvas;
    const references = await Promise.all(before.references.map(async item => ({ id: item.id, name: item.name, role: item.role, image_base64: await imageDataUrl(item.blob) })));
    // A source establishes the first composition. Further edits use the exact
    // selected HTML and its own pixels, not a fresh interpretation of that source.
    const selectedSource = startingFromSource ? await sourceEvidence(before) : undefined;
    if (selectedSource) {
      const index = references.findIndex(reference => reference.id === selectedSource.id);
      if (index < 0) references.push(selectedSource); else references[index] = selectedSource;
      if (references.length > 4) throw Error('La fuente elegida y las referencias superan el límite de cuatro imágenes.');
    }
    const inspection = designSource ? { missing: false, examples: [], references: [] } : await inspectionEvidence(before);
    if (inspection.missing) throw Error('Vuelve a consultar las diapositivas antes de crear otra versión: su captura ya no está disponible en este borrador.');
    references.push(...inspection.references);
    // Deck base: the exemplar of the chosen arrangement (deck system) replaces the nearest slides.
    const kitPath = !designSource && !refine && !!latest.current.styleExamples?.length;
    const deckSource = kitPath ? turn.deck?.exemplarHtml ?? latest.current.styleSourceHtml : undefined;
    if (deckSource && references.length < 4) {
      try {
        let image = deckCaptureRef.current?.html === deckSource ? deckCaptureRef.current.image : undefined;
        if (!image) {
          const sourceSize = getSlideDimensions(deckSource);
          image = (await renderHtmlForReview(sanitizePresentationHtml(deckSource), sourceSize.width, sourceSize.height,
            { businessId: props.businessId, expectedActorId: props.actorId, signal: AbortSignal.timeout(12000) })).image;
          deckCaptureRef.current = { html: deckSource, image };
        }
        references.push({ id: 'deck-style', name: 'Estilo de la presentación', role: 'image_style_reference', image_base64: image });
      } catch { /* Keep explicit HTML style examples when a real capture is unavailable. */ }
    }
    // The generator sees the same current design as the user whenever it is available.
    // Offline rendering must not prevent generating a proposal from its HTML and references.
    const baseSnapshot = !startingFromSource && base && (refine || compare) ? await renderHtmlForReview(base, size.width, size.height,
      { businessId: props.businessId, expectedActorId: props.actorId, signal: AbortSignal.timeout(12000) }).catch(() => undefined) : undefined;
    // The spec always arrives: wait for the measurement, or measure the chosen source slide.
    let styleSpec = !designSource && latest.current.styleSpec?.trim() ? latest.current.styleSpec : undefined;
    if (flags?.ficha_estricta) {
      let cause = '';
      const ready = () => latest.current.styleSpecReady?.().catch(problem => { cause = styleMeasureCause(problem); return ''; }) ?? Promise.resolve('');
      // The slide itself as source uses the workspace's spec (with the deck scale); another slide is measured here (cached per HTML).
      const measureSource = async (html: string) => {
        try {
          const samples = await measureStyleSamplesCached(html, getSlideDimensions(html));
          return formatStyleSpec(samples, flags.escala ? deriveTypeScale([samples]) : []);
        } catch (problem) { cause = styleMeasureCause(problem); return undefined; }
      };
      styleSpec = designSource ? sourceSlide ? sourceSlide.html === props.currentHtml && await ready() || await measureSource(sourceSlide.html) : undefined
        : await ready() || styleSpec;
      if (!styleSpec && (refine || sourceSlide)) notices.push(`Ficha no disponible${cause ? ` (${cause})` : ''}: el diseño se generó sin los valores medidos de la base.`);
    }
    // The current capture has priority over the fourth attachment.
    let render = refine ? baseSnapshot?.image : undefined;
    if (flags?.no_rehace && refine) {
      if (render && references.length >= 4) {
        const sourceId = selectedSource?.id, last = (match: (id: string) => boolean) => {
          for (let index = references.length - 1; index >= 0; index--) if (match(references[index].id)) return index;
          return -1;
        };
        const index = [last(id => id === 'deck-style'), last(id => id.startsWith('deck:')), last(id => id !== sourceId)].find(found => found >= 0)!;
        const [removed] = references.splice(index, 1);
        notices.push(`Omití la referencia «${removed.name}» para incluir la captura del diseño actual.`);
      }
      if (!render) notices.push('La captura del diseño actual no se envió: no se pudo renderizar.');
    } else if (references.length >= 4) render = undefined;
    const unlocked = turn.unlock ?? [];
    await assertSession(life); if (!sameHtmlDesignTarget(destination, currentTarget())) throw Error('El lienzo cambió mientras se preparaba el encargo.');
    const request: DesignCanvasHtmlRequest & { expectedActorId: string } = { design_system: 'design-canvas', business_id: props.businessId, expectedActorId: props.actorId,
      canvas: size, instruction: before.instruction || undefined, references,
      design_base: startingFromSource ? 'new' : refine ? proposalBase ? 'version' : 'current'
        : before.designBase ?? (latest.current.styleExamples?.length ? 'deck' : 'new'),
      ...(startingFromSource ? { design_source: designSource } : {}),
      ...(startingFromSource && sourceSlide && !nativeAdapt ? { source_html: sourceSlide.html } : {}),
      ...(before.copyMode !== 'instruction' ? { copy_mode: before.copyMode, approved_copy: before.copyMode === 'literal' ? before.copy : undefined } : {}),
      ...(before.copyMode === 'literal' ? { copy_binding: 'slots' as const } : {}),
      // Pins of an unlocked category stop applying before the model sees the base.
      ...(refine ? { current_html: flags?.candado_estilo ? releaseStyleLock(base!, unlocked) : base, iteration_feedback: feedback, render_base64: render,
        layout_diagnostics: baseSnapshot?.diagnostics } : {}),
      // A requested rewrite, or adapting a slide source's layout, regenerates instead of patching.
      // «No rehace»: adapt_layout first patches a copy of the source, unless the orientation changes.
      ...((refine && rewrite) || (nativeAdapt && designSource!.mode === 'adapt_layout' && (!flags?.no_rehace || isOrientationChange(feedback)))
        ? { edit_mode: 'rewrite' as const } : {}),
      ...(inspection.examples.length ? { style_examples: inspection.examples }
        : kitPath ? { style_examples: turn.deck?.example ? [turn.deck.example] : structuredClone(latest.current.styleExamples!) } : {}),
      ...(styleSpec ? { style_spec: styleSpec.slice(0, 4000) } : {}),
      ...(turn.deck?.spec ? { deck_system: turn.deck.spec.slice(0, 3000) } : {}),
      ...(flags?.ficha_estricta && refine ? { strict_spec: true as const } : {}),
      ...(flags?.referencias_por_turno ? { references_by_turn: true as const } : {}),
      ...(flags?.revision_pedido && turn.checklist?.length ? { request_checklist: turn.checklist.slice(0, 8) } : {}),
      ...(flags?.huecos_heredados && refine && imageHoles(base!).length ? { inherited_holes: imageHoles(base!).map(hole => hole.text).slice(0, 12) } : {}),
    };
    // Large bodies reach the function truncated («Unexpected end of JSON input»). The comparison capture is optional.
    const bytes = () => new TextEncoder().encode(JSON.stringify(request)).length;
    if (request.render_base64 && bytes() > MAX_HTML_REQUEST_BYTES) {
      delete request.render_base64;
      if (flags?.no_rehace) notices.push('La captura del diseño actual no se envió: la solicitud superaba 5 MB.');
    }
    if (bytes() > MAX_HTML_REQUEST_BYTES && request.references?.some(reference => reference.id === 'deck-style')) {
      request.references = request.references.filter(reference => reference.id !== 'deck-style');
    }
    if (bytes() > MAX_HTML_REQUEST_BYTES) throw new DesignHtmlRequestError(`El diseño y sus referencias pesan ${(bytes() / 1048576).toFixed(1)} MB y el límite es ${MAX_HTML_REQUEST_BYTES / 1048576} MB. Quita una referencia o usa imágenes más ligeras.`, true);
    await persist(patch({ status: 'sending' }));
    try {
      const adaptPatch = !!flags?.no_rehace && nativeAdapt && designSource?.mode === 'adapt_layout' && request.edit_mode !== 'rewrite';
      let response: Awaited<ReturnType<typeof generate.mutateAsync>>;
      try { response = await generate.mutateAsync(request); }
      catch (problem) {
        // The patch over the source copy did not apply: only then rewrite it.
        if (!adaptPatch || !(problem instanceof DesignHtmlRequestError) || !problem.definitive || problem.code !== 'invalid_canvas_patch') throw problem;
        request.edit_mode = 'rewrite';
        response = await generate.mutateAsync(request);
        notices.push('El ajuste puntual sobre la fuente no se pudo aplicar; la rehice conservando su estilo.');
      }
      await assertSession(life);
      const cleanCandidate = (candidate: string) => {
        const clean = sanitizePresentationHtml(candidate), actual = getSlideDimensions(clean);
        if (actual.width !== size.width || actual.height !== size.height) throw Error('La respuesta cambió las dimensiones del lienzo. La versión anterior se conserva.');
        return clean;
      };
      const assertCurrent = async () => {
        await assertSession(life);
        if (!sameHtmlDesignTarget(destination, currentTarget())) throw Error('El lienzo cambió durante la revisión. La versión anterior se conserva.');
      };
      const checkBodySize = (body: unknown) => {
        if (new TextEncoder().encode(JSON.stringify(body)).length > MAX_HTML_REQUEST_BYTES) throw Error('El diseño y su captura exceden el tamaño permitido para la revisión.');
      };
      let candidate = cleanCandidate(response.html), styleLock: StyleLockReport | undefined;
      const access = { businessId: props.businessId, expectedActorId: props.actorId };
      // Style lock without AI: compare with the base and restore what the user did not unlock.
      if (flags?.candado_estilo && refine && base) {
        try {
          const locked = await enforceStyleLock({ base, output: candidate, unlock: turn.unlock,
            // The base is usually measured already (cached per HTML).
            measure: html => html === base ? measureStyleSamplesCached(html, size) : measureStyleSamples(html, size),
            fits: (before, after) => structuralEditFits(before, after, size, access, structuralRef) });
          await assertCurrent();
          candidate = locked.html; styleLock = locked.report;
        } catch (problem) {
          if (problem instanceof Error && /sesión|lienzo cambió/i.test(problem.message)) throw problem;
          notices.push(`No pude comprobar las diferencias de estilo de esta propuesta (${styleMeasureCause(problem)}).`);
        }
      }
      // The AI rearranged; now the cited slide's style is copied without AI and verified.
      let styleTransfer: StyleTransferReport | undefined;
      if (turn.transfer) {
        try {
          const done = await transferStyle(candidate, turn.transfer, turn.request ?? feedback);
          await assertCurrent();
          candidate = cleanCandidate(done.html); styleTransfer = done.report;
        } catch (problem) {
          if (problem instanceof Error && /sesión|lienzo cambió/i.test(problem.message)) throw problem;
          notices.push(`No pude copiar el estilo de la diapositiva ${turn.transfer.sourceNumber} (${styleMeasureCause(problem)}).`);
        }
      } else if (turn.deck) {
        // «Sistema de la presentación»: its tokens without AI (unless a cited slide gives the style), then the arrangement against the neighbors.
        try {
          if (turn.deck.tokens) {
            const done = await applyDeckTokens(candidate, turn.deck, turn.request ?? feedback);
            await assertCurrent();
            candidate = cleanCandidate(done.html); styleTransfer = done.report;
          }
          const note = turn.deck.label ? await deckSignatureNote(candidate, turn.deck) : '';
          await assertCurrent();
          if (note) notices.push(note);
        } catch (problem) {
          if (problem instanceof Error && /sesión|lienzo cambió/i.test(problem.message)) throw problem;
          notices.push(`No pude aplicar el sistema de la presentación (${styleMeasureCause(problem)}).`);
        }
      }
      // Empty slots that already existed in the base are not a defect and never trigger a repair.
      const holes = flags?.huecos_heredados && refine && base ? inheritedImageHoles(base, candidate) : undefined;
      const baseBroken = new Set((baseSnapshot?.diagnostics?.issues ?? []).filter(issue => issue.code === 'missing_image').map(issue => issue.element ?? ''));
      const reviewOptions = {
        ...(holes && !holes.added.length ? { ignoreIssue: isMissingResourceIssue } : {}),
        ...(holes ? { ignoreDiagnostic: (issue: { code: string; element?: string }) => issue.code === 'missing_image' && baseBroken.has(issue.element ?? '') } : {}),
        render: (html: string) => renderHtmlForReview(html, size.width, size.height, { businessId: props.businessId, expectedActorId: props.actorId }),
        review: async (html: string, snapshot: Awaited<ReturnType<typeof renderHtmlForReview>>) => {
          const reviewRequest = designReviewRequest(request, html, snapshot);
          checkBodySize(reviewRequest); return reviewDesignCanvasHtml(reviewRequest);
        },
      };
      // Result first: show the proposal now and review it later, without automatic repairs.
      const later = latest.current.backgroundReview === true;
      const reviewed: { html: string; visualReview?: DesignVisualReview } = later ? { html: candidate } : await reviewAndRepairDesign({ html: candidate, assertCurrent, ...reviewOptions,
        ...(flags?.correccion_acotada ? { discardWorse: true, feedback: (issues: string[]) => buildScopedRepairFeedback(issues, turn.request ?? feedback) } : {}),
        repair: async (html, snapshot, feedback) => {
          const repairRequest = { ...designReviewRequest(request, html, snapshot), iteration_feedback: feedback };
          checkBodySize(repairRequest);
          return cleanCandidate((await generate.mutateAsync(repairRequest)).html);
        },
        onProgress: (stage, repairs) => { if (active(life)) setReviewProgress(stage === 'reviewing' ? 'Revisando el diseño y las referencias…' : `Corrigiendo la composición (${repairs}/2)…`); },
      });
      const { html, visualReview } = reviewed;
      laterReviewRef.current = null;
      // «Corregir composición» that leaves more problems than the version it corrects is discarded.
      if (visualReview && flags?.correccion_acotada && turn.correction && correctionIsWorse(turn.correction.issues, visualReview.issues))
        throw new DesignHtmlRequestError('La corrección dejaba más problemas que la versión anterior; conservé la versión anterior sin cambios', true);
      const { edit_mode: _editMode, ...reviewBase } = request;
      reviewContextRef.current = { request: reviewBase, html };
      const mounted = new Map((startingFromSource ? sourceSlide?.mounted_assets ?? [] : []).map(asset => [asset.element_id, asset]));
      for (const asset of refine && !startingFromSource ? proposalBase?.mounted ?? props.mountedAssets ?? [] : []) mounted.set(asset.element_id, asset);
      const measured = await measureHtmlDesignAssets({ id: props.slideId, revision: destination.revision, title: '', html: refine ? base! : sourceSlide?.html ?? '',
        mounted_assets: designSource ? [...mounted.values()] : refine ? proposalBase?.mounted ?? props.mountedAssets ?? [] : [] }, html, size);
      await assertSession(life);
      const proposal: HtmlDesignProposal = { ...measured, target: destination, canvas: size, intent: refine ? proposalBase?.intent ?? 'replace' : intent,
        ...(visualReview ? { visualReview } : {}), ...(styleLock ? { styleLock } : {}), ...(styleTransfer ? { styleTransfer } : {}),
        ...(notices.length ? { notices: notices.slice(0, 8) } : {}) };
      const next = patch({ proposal, designBase: request.design_base, status: 'ready', feedback: '', messages: [...before.messages,
        { role: 'user' as const, text: refine ? feedback : before.instruction || 'Diseña a partir de mis referencias.' },
        { role: 'assistant' as const, text: [visualReview ? describeVisualReview(visualReview) : 'Aquí está la propuesta; la reviso en segundo plano.',
          describeStyleTransfer(styleTransfer), !styleTransfer || styleTransfer.label ? describeStyleLock(styleLock) : ''].filter(Boolean).join(' ') }].slice(-40) });
      if (later) laterReviewRef.current = { html: proposal.html, correction: flags?.correccion_acotada ? turn.correction?.issues : undefined,
        review: () => reviewAndRepairDesign({ html: proposal.html, ...reviewOptions, maxRepairs: 0, assertCurrent: () => assertSession(life), repair: async same => same }) };
      await persist(next);
      if (active(life)) setDetailsOpen(false);
      notifyProposal(proposal, refine ? 'refined' : 'generated');
      return structuredClone(proposal);
    } catch (e) {
      // A server answer without HTML is final: the draft stays usable for another attempt.
      if (active(life)) { patch({ status: isDefinitiveHtmlFailure(e) ? 'ready' : 'uncertain' }); await persist().catch(() => {}); }
      throw e;
    }
  }
  /** Measured transfer of another slide's style (no AI): sizes follow the deck scale, measured from the nearby slides (cached). */
  async function transferStyle(html: string, transfer: SlideStyleTransfer, request: string) {
    const deck = (await Promise.all((transfer.deck ?? []).slice(0, 6).map(item => measureStyleSamplesCached(item, getSlideDimensions(item)).catch(() => null))))
      .flatMap(item => item?.sheet ? [item.sheet] : []);
    return runStyleTransfer({ html, sourceHtml: transfer.sourceHtml, sourceNumber: transfer.sourceNumber, request, planned: transfer.planned,
      brand: transfer.brand, deck, measure: (item, brand) => measureRoleSheet(item, getSlideDimensions(item), brand) });
  }
  /** Deck tokens (synthetic source sheet, per arrangement with ≥2 exemplars) applied and verified without AI. Sizes follow the
   * arrangement's scale; a lone cover, section or closing keeps its own sizes instead of the deck's common ones. */
  async function applyDeckTokens(html: string, deck: SlideDeckTurn, request: string) {
    const found = deck.system.archetypes.find(item => item.id === deck.archetype), own = found?.tokens ? found : undefined;
    const lone = !own && ['cover', 'section', 'closing'].includes(deck.archetype ?? '');
    const label = own ? `el sistema de la presentación (acomodo ${DECK_STRUCTURE_LABELS[own.id]}, ${own.members.length} diapositivas)`
      : `el sistema de la presentación (${deck.system.slides} diapositivas)`;
    return runStyleTransfer({ html, sourceHtml: '', sourceNumber: 0, request, brand: deck.brand, label, skip: deck.skip,
      scale: lone ? {} : effectiveTokens(deck.system, own?.id).scale,
      sourceSheet: target => syntheticSourceSheet(deck.system, { archetype: own?.id, target, keepBackground: lone }),
      measure: (item, brand) => measureRoleSheet(item, getSlideDimensions(item), brand) });
  }
  /** The measured arrangement of the result against the neighbors; a note (never a retry) when it repeats one outside a series. */
  async function deckSignatureNote(html: string, deck: SlideDeckTurn): Promise<string> {
    if (deck.policy === 'repeated' || !deck.neighbors.length) return '';
    const signature = signatureOf(await measureStyleSamples(html, getSlideDimensions(html)), { index: deck.number - 1, count: deck.deckSize });
    const same = deck.neighbors.filter(item => sameShape(item.signature, signature)).map(item => item.number);
    return same.length ? `El acomodo que quedó (${describeSignature(signature)}) repite el de la diapositiva ${same.join(' y ')}; si quieres variedad, pide otra variación.` : '';
  }
  /** «Estilo de la diapositiva N» with nothing else to change: the current design with the copied style, without any AI call. */
  async function transferOnly(life: Life, fromCurrent: boolean, turn: SlideGeneratorTurn) {
    if (!turn.transfer) throw Error('Falta la diapositiva de la que copiar el estilo.');
    const before = structuredClone(draftRef.current), destination = { ...target };
    if (before.status !== 'ready') throw Error('La solicitud anterior no se confirmó. Conserva la propuesta o prepara explícitamente otra versión.');
    const proposalBase = fromCurrent ? undefined : before.proposal, base = proposalBase?.html ?? props.currentHtml;
    if (!base) throw Error('Primero crea una propuesta.');
    if (proposalBase?.pending) throw Error('Comprueba las piezas de la propuesta antes de pedir otro ajuste.');
    const size = getSlideDimensions(base), request = turn.request ?? before.instruction, notices: string[] = [];
    setReviewProgress(`Copiando el estilo de la diapositiva ${turn.transfer.sourceNumber}…`);
    const done = await transferStyle(base, turn.transfer, request);
    await assertSession(life); if (!sameHtmlDesignTarget(destination, currentTarget())) throw Error('El lienzo cambió mientras se copiaba el estilo.');
    const html = sanitizePresentationHtml(done.html), actual = getSlideDimensions(html);
    if (actual.width !== size.width || actual.height !== size.height) throw Error('El estilo copiado cambió las dimensiones del lienzo. La versión anterior se conserva.');
    // Copied sizes and families can change how the text flows: checked on a real render, still without AI.
    const fit = await structuralEditFits(base, html, size, { businessId: props.businessId, expectedActorId: props.actorId }, structuralRef).catch(() => 'unverified' as const);
    await assertSession(life);
    if (fit === 'overflow') notices.push('Con el estilo copiado algo ya no cabe en la diapositiva; revísalo antes de aplicar o pide que lo reacomode.');
    const measured = await measureHtmlDesignAssets({ id: props.slideId, revision: destination.revision, title: '', html: base,
      mounted_assets: proposalBase?.mounted ?? props.mountedAssets ?? [] }, html, size);
    await assertSession(life);
    const proposal: HtmlDesignProposal = { ...measured, target: destination, canvas: size, intent: proposalBase?.intent ?? 'replace', styleTransfer: done.report,
      ...(notices.length ? { notices } : {}) };
    laterReviewRef.current = null;
    const next = patch({ proposal, status: 'ready', feedback: '', messages: [...before.messages, { role: 'user' as const, text: request || 'Copia el estilo.' },
      { role: 'assistant' as const, text: [describeStyleTransfer(done.report), ...notices].join(' ') }].slice(-40) });
    await persist(next);
    if (active(life)) setDetailsOpen(false);
    notifyProposal(proposal, 'refined');
    return structuredClone(proposal);
  }
  async function sourceEvidence(value: HtmlDesignDraft, recapture = false) {
    const source = value.designSource?.source;
    if (!source) return undefined;
    if (source.kind === 'slide' && (!value.sourceSlide || value.sourceSlide.id !== source.slide_id || String(value.sourceSlide.revision) !== source.revision))
      throw Error('Vuelve a seleccionar la diapositiva fuente: falta su diseño original o cambió su revisión.');
    const reference = value.sourceReference ?? (source.kind === 'reference' ? value.references.find(item => item.id === source.reference_id) : undefined);
    let pixels = reference ? await imageDataUrl(reference.blob) : undefined;
    if (!pixels && recapture && value.sourceSlide) {
      const size = getSlideDimensions(value.sourceSlide.html);
      pixels = (await renderHtmlForReview(sanitizePresentationHtml(value.sourceSlide.html), size.width, size.height,
        { businessId: props.businessId, expectedActorId: props.actorId, signal: AbortSignal.timeout(12000) })).image;
    }
    if (!pixels) throw Error('Falta la captura individual de la fuente elegida. Vuelve a seleccionarla antes de generar.');
    return { id: source.kind === 'reference' ? source.reference_id : 'design-source',
      name: 'Fuente visual elegida; conservar según el modo acordado',
      role: value.designSource!.mode === 'style_only' ? 'image_style_reference' as const : 'layout_reference' as const,
      image_base64: pixels };
  }
  async function inspectionEvidence(value: HtmlDesignDraft) {
    const receipt = value.inspection;
    const selected = (receipt?.reference_ids ?? []).map(id => inspectionReferencesRef.current.find(reference => `deck:${reference.sha256}` === id));
    return { missing: selected.some(reference => !reference), examples: structuredClone(receipt?.examples ?? []),
      references: await Promise.all(selected.filter((reference): reference is PreparedPresentationReference => !!reference).map(async reference => ({
        id: `deck:${reference.sha256}`, name: 'Diapositivas inspeccionadas; reutilizar sólo lo indicado en el encargo aprobado',
        role: 'layout_reference' as const, image_base64: await imageDataUrl(reference.blob),
      }))) };
  }
  async function reviewExisting(life: Life) {
    const before = structuredClone(draftRef.current), proposal = before.proposal;
    if (!proposal || proposal.pending || before.status !== 'ready') throw Error('Primero recupera una propuesta completa.');
    assertHtmlDesignTarget(proposal, currentTarget());
    setReviewProgress('Revisando la propuesta guardada…');
    const snapshot = await renderHtmlForReview(proposal.html, proposal.canvas.width, proposal.canvas.height,
      { businessId: props.businessId, expectedActorId: props.actorId });
    const cached = reviewContextRef.current;
    const hasSavedContext = cached?.html === proposal.html;
    const sourceReview = before.designSource && before.designBase !== 'version' && before.designBase !== 'current';
    const inspection = sourceReview ? { missing: false, examples: [], references: [] } : await inspectionEvidence(before);
    const request: DesignCanvasHtmlRequest & { expectedActorId: string } = hasSavedContext ? cached.request : {
      design_system: 'design-canvas' as const, business_id: props.businessId, expectedActorId: props.actorId, canvas: proposal.canvas,
      instruction: before.instruction || 'Revisa la propuesta guardada con las referencias y el contenido acordado.',
      design_base: before.designBase ?? (props.currentHtml ? 'current' : 'new'), copy_mode: before.copyMode === 'instruction' ? undefined : before.copyMode,
      approved_copy: before.copyMode === 'literal' ? before.copy : undefined,
      ...(sourceReview ? { design_source: before.designSource, design_base: 'new' as const,
        ...(before.sourceSlide ? { source_html: before.sourceSlide.html } : {}) } : {}),
      references: [...await Promise.all(before.references.filter(reference => before.copyMode !== 'literal' || reference.role !== 'content_source').map(async reference => ({ id: reference.id, name: reference.name,
        role: reference.role, image_base64: await imageDataUrl(reference.blob) }))), ...inspection.references],
      ...(inspection.examples.length ? { style_examples: inspection.examples } : {}),
    };
    let baseIssue = !hasSavedContext && inspection.missing ? 'Falta la captura de las diapositivas consultadas; esta revisión no pudo comparar su apariencia.' : '';
    if (!hasSavedContext && sourceReview) {
      try {
        const source = await sourceEvidence(before, true);
        if (source) request.references = [...(request.references ?? []).filter(reference => reference.id !== source.id), source];
      } catch {
        baseIssue = 'Falta la captura individual de la fuente elegida; se revisó el resultado sin poder comprobar su fidelidad.';
        delete request.design_source; delete request.source_html;
      }
    }
    if (!hasSavedContext && !sourceReview) {
      // Reopening the workspace must not silently turn a comparison with the
      // original slide into a review of only the generated result.
      const source = request.design_base === 'deck' ? latest.current.styleSourceHtml
        : request.design_base === 'current' ? latest.current.currentHtml : undefined;
      if (source) {
        const sourceSize = getSlideDimensions(source);
        request.render_base64 = (await renderHtmlForReview(sanitizePresentationHtml(source), sourceSize.width, sourceSize.height,
          { businessId: props.businessId, expectedActorId: props.actorId })).image;
      } else if (request.design_base !== 'new' && request.design_base !== 'version') {
        baseIssue = [baseIssue, 'Se revisó el resultado, pero falta la vista del diseño de origen para comprobar que conserva su estilo.'].filter(Boolean).join(' ');
      }
    }
    await assertSession(life); assertHtmlDesignTarget(proposal, currentTarget());
    const reviewRequest = designReviewRequest(request, proposal.html, snapshot);
    if (new TextEncoder().encode(JSON.stringify(reviewRequest)).length > MAX_HTML_REQUEST_BYTES) throw Error('Las referencias y la captura exceden el tamaño permitido para la revisión.');
    // Gaps inherited from the slide are reported to the review as such, never as a missing resource.
    const holeBase = latest.current.fromExisting?.huecos_heredados ? latest.current.currentHtml ?? '' : '';
    const holes = holeBase ? inheritedImageHoles(holeBase, proposal.html) : undefined;
    if (holes?.inherited.length) reviewRequest.inherited_holes = holes.inherited.map(hole => hole.text).slice(0, 12);
    const verdict = await reviewDesignCanvasHtml(reviewRequest);
    await assertSession(life); assertHtmlDesignTarget(proposal, currentTarget());
    const reviewIssues = holes && !holes.added.length ? verdict.issues.filter(issue => !isMissingResourceIssue(issue)) : verdict.issues;
    const issues = [...new Set([...reviewIssues, ...(snapshot.diagnostics?.issues.map(issue => issue.message) ?? []), ...(baseIssue ? [baseIssue] : [])])];
    if (!snapshot.diagnostics || snapshot.diagnostics.truncated) issues.push('La comprobación geométrica quedó incompleta.');
    const onlyInherited = !verdict.passed && verdict.issues.length > 0 && !reviewIssues.length;
    const nextProposal: HtmlDesignProposal = { ...proposal, visualReview: { status: (verdict.passed || onlyInherited) && !issues.length ? 'passed' : 'needs_review',
      repairs: proposal.visualReview?.repairs ?? 0, issues: issues.slice(0, 20) } };
    await persist(patch({ proposal: nextProposal })); notifyProposal(nextProposal, 'edited');
  }
  async function persistVisual(life: Life, html: string, close: boolean) {
    const proposal = draftRef.current.proposal; if (!proposal) return;
    assertHtmlDesignTarget(proposal, currentTarget());
    const clean = sanitizePresentationHtml(html), dims = getSlideDimensions(clean);
    if (dims.width !== proposal.canvas.width || dims.height !== proposal.canvas.height) throw Error('Conserva el tamaño del lienzo.');
    const measured = proposal.pending ? await measureHtmlDesignAssets(proposal.pending.source, clean, proposal.canvas) : {
      html: clean, mounted: reconcileMountedAssets({ id: props.slideId, revision: proposal.target.revision, title: '', html: proposal.html, mounted_assets: proposal.mounted }, clean), pending: undefined,
    };
    await assertSession(life);
    const nextProposal = { ...proposal, ...measured, pending: measured.pending, visualReview: undefined };
    await persist(patch({ proposal: nextProposal })); notifyProposal(nextProposal, 'edited'); if (close) setEditing(false);
  }
  async function saveVisual(html: string, close: boolean) { await run(life => persistVisual(life, html, close)); }
  async function saveLogo(logo: DesignLogoSelection) {
    await run(async life => {
      const proposal = draftRef.current.proposal;
      if (!proposal || proposal.pending) throw Error('Primero crea o recupera una propuesta completa.');
      await persistVisual(life, insertDesignLogo(proposal.html, { ...logo, canvas: proposal.canvas }), false);
    }, true);
  }
  async function updateContext(life: Life, input: SlideGeneratorContext) {
    if (draftRef.current.status !== 'ready') throw Error('Recupera la solicitud pendiente antes de sustituir su contexto.');
    const change: Partial<HtmlDesignDraft> = {};
    for (const key of ['instruction', 'copy', 'copyMode', 'references', 'designBase'] as const) {
      if (input[key] !== undefined) Object.assign(change, { [key]: structuredClone(input[key]) });
    }
    if (input.designSource !== undefined) {
      change.designSource = input.designSource ?? undefined;
      if (!input.designSource || JSON.stringify(input.designSource) !== JSON.stringify(draftRef.current.designSource)) {
        change.sourceSlide = undefined; change.sourceReference = undefined;
      }
    }
    if (input.sourceSlide !== undefined) change.sourceSlide = structuredClone(input.sourceSlide);
    if (input.sourceReference !== undefined) change.sourceReference = structuredClone(input.sourceReference);
    if (input.inspectionReferences !== undefined || input.inspectionExamples !== undefined) {
      const references = input.inspectionReferences ?? inspectionReferencesRef.current;
      if (references.length > 1) throw Error('Sólo se admite una lámina interna de diapositivas consultadas.');
      // Validate prepared references independently; they never enter the user's attachment array.
      assertHtmlDesignDraft({ ...emptyHtmlDesignDraft(), references }, { actor: props.actorId, business: props.businessId, document: props.documentId, slide: props.slideId });
      change.inspection = { reference_ids: input.inspectionReferences !== undefined ? references.map(reference => `deck:${reference.sha256}`)
        : draftRef.current.inspection?.reference_ids ?? [], examples: structuredClone(input.inspectionExamples ?? draftRef.current.inspection?.examples ?? []) };
    }
    if (input.proposal) {
      assertHtmlDesignTarget(input.proposal, currentTarget());
      const clean = sanitizePresentationHtml(input.proposal.html), size = getSlideDimensions(clean);
      if (size.width !== input.proposal.canvas.width || size.height !== input.proposal.canvas.height) throw Error('La propuesta cambió las dimensiones del lienzo.');
      change.proposal = { ...structuredClone(input.proposal), html: clean };
    }
    await assertSession(life);
    const next = { ...draftRef.current, ...change };
    assertHtmlDesignDraft(next, { actor: props.actorId, business: props.businessId, document: props.documentId, slide: props.slideId });
    await persist(next); patch(change);
    if (input.designSource !== undefined || input.sourceSlide !== undefined || input.sourceReference !== undefined) reviewContextRef.current = null;
    if (input.inspectionReferences !== undefined) inspectionReferencesRef.current = structuredClone(input.inspectionReferences);
    if (change.proposal) { setIntent(change.proposal.intent); notifyProposal(change.proposal, 'imported'); }
  }
  async function leave(life: Life) {
    const record = await life.store!.read(); await assertSession(life);
    if (record) life.revision = record.revision;
    const next = leaveHtmlDesignDraft(record?.value ?? null, draftRef.current, currentTarget());
    await persist(next); draftRef.current = next; setDraft(next);
    if (next.proposal) notifyProposal(next.proposal, 'recovered');
  }
  async function apply(life: Life) {
    const proposal = draftRef.current.proposal;
    if (!proposal) throw Error('Primero crea o recupera una propuesta.');
    if (proposal.pending) throw Error('Comprueba las piezas antes de aplicar el diseño.');
    assertHtmlDesignTarget(proposal, currentTarget()); await assertSession(life); await persist();
    if (proposal.intent === 'insert') await latest.current.onInsert(proposal.html, proposal.target, proposal.mounted);
    else await latest.current.onApplyToCurrent(proposal.html, proposal.target, proposal.mounted);
    if (active(life) && !latest.current.externalConversation) latest.current.onClose();
  }
  useImperativeHandle(props.controllerRef, () => ({
    async updateContext(input) { const frozen = structuredClone(input); await run(life => updateContext(life, frozen), true); },
    async create(input = {}) { const frozen = structuredClone(input); return (await run(async life => {
      await updateContext(life, frozen);
      const current = draftRef.current;
      // The chosen base governs continuity even if a caller names the action
      // "create". An explicitly selected source still starts a new adaptation.
      const fromCurrent = frozen.fromCurrent === true || current.designBase === 'current';
      const continuing = !frozen.designSource && (fromCurrent ? !!latest.current.currentHtml?.trim()
        : current.designBase === 'version' && !!(current.proposal?.html || latest.current.currentHtml)?.trim());
      if (continuing) await persist(patch({ feedback: frozen.instruction || current.instruction || 'Ajusta el diseño seleccionado.' }));
      turnRef.current = frozen.turn ?? null;
      return requestHtml(life, continuing, false, continuing && fromCurrent);
    }, true))!; },
    async refine(input) { const frozen = structuredClone(input); return (await run(async life => {
      await updateContext(life, frozen); await persist(patch({ feedback: frozen.feedback }));
      turnRef.current = frozen.turn ?? null;
      return requestHtml(life, true, frozen.compare === true, frozen.fromCurrent === true, frozen.rewrite === true);
    }, true))!; },
    async transferStyle(input) { const frozen = structuredClone(input); return (await run(async life => {
      await updateContext(life, frozen);
      return transferOnly(life, frozen.fromCurrent === true, frozen.turn ?? {});
    }, true))!; },
    async openEditor(options) { await run(async life => {
      if (!draftRef.current.proposal) throw Error('Primero crea o recupera una propuesta.');
      await assertSession(life); await persist(); setIconPicker(options?.icons === true); setEditing(true);
    }, true); },
    async openLogos() { await run(async life => {
      const proposal = draftRef.current.proposal;
      if (!proposal || proposal.pending) throw Error('Primero crea o recupera una propuesta completa.');
      if (editing) throw Error('Guarda los ajustes del editor antes de elegir un logo.');
      assertHtmlDesignTarget(proposal, currentTarget()); await assertSession(life); setLogosOpen(true);
    }, true); },
    async recover() { return (await run(async life => {
      const record = await life.store!.read(); await assertSession(life);
      if (record) {
        life.revision = record.revision;
        const next = structuredClone(record.value); if (next.status === 'sending') next.status = 'uncertain';
        draftRef.current = next; setDraft(next); if (next.proposal) notifyProposal(next.proposal, 'recovered');
      }
      return structuredClone(draftRef.current);
    }, true))!; },
    async discardPending() { await run(async () => { if (draftRef.current.status !== 'ready') await persist(patch({ status: 'ready' })); }, true); },
    async apply() { await run(apply, true); },
    // Outside the busy lock: the user keeps working while the review runs.
    async reviewLater() {
      const job = laterReviewRef.current, life = lifeRef.current;
      if (!job || !life || !active(life)) return null;
      laterReviewRef.current = null; setBackgroundReviewing(true);
      try {
        const { visualReview } = await job.review();
        const worse = !!job.correction && correctionIsWorse(job.correction, visualReview.issues);
        const proposal = draftRef.current.proposal;
        if (active(life) && proposal?.html === job.html) await persist(patch({ proposal: { ...proposal, visualReview } })).catch(() => {});
        return { html: job.html, visualReview, worse };
      } finally { if (active(life)) setBackgroundReviewing(false); }
    },
  }));
  if (editing && draft.proposal) return <><VisualDesignEditor html={draft.proposal.html} pieceIndex={props.currentSlide ?? 0}
    dimensions={draft.proposal.canvas} businessId={props.businessId} editableElements={[]} initialIconPicker={iconPicker}
    onSave={html => void saveVisual(html, true)} onApply={html => void saveVisual(html, false)} onCancel={() => setEditing(false)} />
    {error && <p role="alert" className="hws-editor-error">{error}</p>}</>;
  const view = draft.proposal?.html ?? props.currentHtml;
  const viewSize = draft.proposal?.canvas ?? canvas;
  // Empty slots of the proposal, shown with a shortcut to the editor's icon picker.
  const holes = props.fromExisting?.huecos_heredados && draft.proposal ? imageHoles(draft.proposal.html) : [];
  const changed = draft.proposal && !sameHtmlDesignTarget(draft.proposal.target, target);
  return <div className={props.embedded ? 'hws-embedded' : 'hws-overlay'}><section className={`hws-dialog${props.externalConversation ? ' hws-external' : ''}`} role={props.embedded ? 'region' : 'dialog'} aria-modal={props.embedded ? undefined : true} aria-label="Diseñar HTML" aria-busy={busy}>
    {!props.embedded && <header className="hws-header"><div><span className="hws-eyebrow">{props.brandName} · {viewSize.width} × {viewSize.height}</span><h2>Diseñar {props.surfaceLabel ?? 'diapositiva'}</h2><p>Describe la idea, añade ejemplos y ajusta el resultado.</p></div>
      <button aria-label="Cerrar diseño HTML" disabled={busy || fileBusy} onClick={() => {
        if (!ready) { props.onClose(); return; }
        void run(async () => { await persist(); props.onClose(); });
      }}><X /></button></header>}
    <div className="hws-body">{!props.externalConversation && <aside className="hws-conversation">
      {props.slides && props.onSelectSlide && <label>Diapositiva<select value={props.currentSlide} disabled={blocked} onChange={e => { const index = Number(e.target.value); void run(async () => { await persist(); props.onSelectSlide!(index); }); }}>
        {props.slides.map((item, index) => <option key={index} value={index}>{index + 1}. {item.title}</option>)}</select></label>}
      <label>Tu idea<textarea aria-label="Idea para HTML" value={draft.instruction} rows={3} maxLength={16000} disabled={blocked}
        placeholder="Quiero una portada con el texto a la izquierda y el mundo de mi referencia a la derecha…" onChange={e => patch({ instruction: e.target.value })} onBlur={saveField} /></label>
      <details className="hws-details" open={detailsOpen} onToggle={e => setDetailsOpen(e.currentTarget.open)}><summary>Referencias y contenido · {draft.references.length} imágenes</summary>
      <PresentationReferencePicker items={draft.references} disabled={busy || !ready} conversationReadsImages defaultRole="image_style_reference" onBusyChange={setFileBusy}
        onChange={async items => { await persist(patch({ references: items })); }} />
      <label>Contenido<select aria-label="Contenido del HTML" value={draft.copyMode} disabled={blocked} onChange={e => { patch({ copyMode: e.target.value as HtmlDesignDraft['copyMode'] }); saveField(); }}>
        <option value="instruction">Según mis indicaciones</option><option value="literal">Usar este texto literal</option><option value="none">Sin texto</option></select></label>
      {draft.copyMode === 'literal' && <textarea aria-label="Texto literal para HTML" rows={4} maxLength={16000} value={draft.copy} disabled={blocked} onChange={e => patch({ copy: e.target.value })} onBlur={saveField} />}
      {!props.canvas && <label>Formato<select aria-label="Formato HTML" value={format} disabled={blocked} onChange={e => setFormat(e.target.value as typeof format)}>
        <option value="current">Tamaño del documento</option><option value="slide">Horizontal 1920 × 1080</option><option value="letter">Carta 1920 × 2485</option></select></label>}
      {!props.surfaceLabel && <label>Destino<select aria-label="Destino HTML" value={intent} disabled={blocked} onChange={e => setIntent(e.target.value as typeof intent)}>
        <option value="insert">Nueva diapositiva</option><option value="replace">Diapositiva actual</option></select></label>}
      </details>
      <button className="hws-primary" disabled={blocked || draft.status !== 'ready'} onClick={() => void run(life => requestHtml(life, false, false))}><Wand2 size={17} />Crear propuesta HTML</button>
      <div ref={history} className="hws-messages" aria-label="Conversación de diseño">{draft.messages.map((m, index) => <p key={index} data-role={m.role}><strong>{m.role === 'user' ? 'Tú' : 'Asistente'}</strong>{m.text}</p>)}</div>
      <label>Ajustar el diseño<textarea aria-label="Cambios para HTML" rows={3} value={draft.feedback} disabled={blocked} maxLength={16000} onChange={e => patch({ feedback: e.target.value })} onBlur={saveField} placeholder="Mueve el mundo a la derecha y dale más espacio al título." /></label>
      <div className="hws-actions"><button disabled={blocked || !view || !!draft.proposal?.pending || draft.status !== 'ready'} onClick={() => void run(life => requestHtml(life, true, false))}><Sparkles size={16} />Preparar ajuste</button>
        <button disabled={blocked || !view || !draft.references.length || !!draft.proposal?.pending || draft.status !== 'ready'} onClick={() => void run(life => requestHtml(life, true, true))}>Comparar con referencias</button></div>
      {draft.status !== 'ready' && <div role="status" className="hws-notice">La respuesta anterior no quedó confirmada. La propuesta guardada se conserva. Preparar otra solicitud puede consumir una nueva llamada de HTML.
        <button disabled={blocked} onClick={() => void run(async () => { await persist(patch({ status: 'ready' })); })}>Preparar otra solicitud</button></div>}
      <p className="hws-note">Las referencias, la conversación y la propuesta se guardan en este navegador. Este proceso crea HTML; no genera imágenes nuevas.</p>
    </aside>}<main className="hws-canvas"><div className="hws-preview-title"><h3>{draft.proposal ? 'Propuesta para revisar' : 'Documento actual'}</h3>
      {!props.externalConversation && <button disabled={blocked || !draft.proposal} onClick={() => setEditing(true)}><Pencil size={16} />Editor completo</button>}</div>
      {props.externalConversation && draft.status !== 'ready' && <div className="hws-notice" role="status">La respuesta anterior no quedó confirmada. La propuesta guardada se conserva. Preparar otra solicitud puede consumir una nueva llamada de HTML.
        <button disabled={blocked} onClick={() => void run(async () => { await persist(patch({ status: 'ready' })); })}>Preparar otra solicitud</button></div>}
      {view ? props.renderPreview ? props.renderPreview(view) : <PresentationCanvas html={view} title="Vista previa del diseño HTML" />
        : <div className="hws-empty"><Plus /><p>Tu diseño aparecerá aquí.</p></div>}
      {backgroundReviewing && <p className="hws-note" role="status">Revisando en segundo plano… Puedes seguir trabajando.</p>}
      {draft.proposal?.visualReview && <div className={draft.proposal.visualReview.status === 'passed' ? 'hws-note' : 'hws-notice'} role="status">
        <p>{describeVisualReview(draft.proposal.visualReview)}</p>
        {draft.proposal.visualReview.issues.length > 0 && <details><summary>Ver problemas detectados</summary>
          <ul>{draft.proposal.visualReview.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul>
        </details>}
        {draft.proposal.visualReview.status === 'needs_review' && props.onCorrectComposition && <button disabled={blocked || !!draft.proposal.pending || draft.status !== 'ready'}
          onClick={() => void props.onCorrectComposition?.()}>Corregir composición</button>}
        {draft.proposal.visualReview.status !== 'passed' && <button disabled={blocked || !!draft.proposal.pending || draft.status !== 'ready'}
          onClick={() => void run(reviewExisting)}>Reintentar revisión sin regenerar</button>}
      </div>}
      {(draft.proposal?.styleLock || !!draft.proposal?.notices?.length) && <div className="hws-note" role="status">
        {draft.proposal.styleLock && <p>{describeStyleLock(draft.proposal.styleLock)}</p>}
        {draft.proposal.notices?.map((notice, index) => <p key={index}>{notice}</p>)}
      </div>}
      {holes.length > 0 && <div className="hws-note" role="status" aria-label="Imágenes sin cargar">
        <ul>{holes.map(hole => <li key={hole.key}>{hole.text}</li>)}</ul>
        <button disabled={blocked || !!draft.proposal?.pending || draft.status !== 'ready'} onClick={() => void run(async life => {
          await assertSession(life); await persist(); setIconPicker(true); setEditing(true);
        })}>Elegir ícono en el editor</button>
      </div>}
      {draft.proposal?.pending && <div className="hws-notice" role="status">La propuesta está guardada. Falta comprobar la posición de sus piezas antes de aplicarla.
        <button disabled={blocked} onClick={() => void run(async life => {
          const proposal = draftRef.current.proposal; if (!proposal?.pending) return;
          const measured = await measureHtmlDesignAssets(proposal.pending.source, proposal.html, proposal.canvas);
          const nextProposal = { ...proposal, ...measured, pending: measured.pending };
          await assertSession(life); await persist(patch({ proposal: nextProposal })); notifyProposal(nextProposal, 'edited');
        })}>Comprobar piezas sin regenerar</button></div>}
      {changed && <p className="hws-notice">El documento cambió desde esta propuesta. Se conserva para revisarla; crea un encargo sobre la versión actual antes de aplicar.</p>}
      <p className="hws-note">El editor completo permite ajustar texto, fuentes, capas e imágenes. Revisar o editar no modifica todavía el documento.</p>
    </main></div>
    <footer className="hws-footer"><div>{error ? <><p role="alert" className="hws-error">{error}</p>
      {props.externalConversation && draft.status === 'ready' ? <p className="hws-note">Tu versión sigue disponible. Puedes continuar desde el chat o abrir el editor.</p> : <button disabled={busy || fileBusy} onClick={() => {
        // Inside the conversation the panel stays open: return to the saved draft of the current version.
        if (!props.externalConversation || !ready) { props.onClose(); return; }
        void run(async life => { await leave(life); latest.current.onClose(); });
      }}>Salir conservando el último borrador guardado</button>}</> : <p>{busy ? reviewProgress || 'Preparando tu diseño…' : 'Aplica cuando estés conforme con el resultado.'}</p>}</div>
      {!props.externalConversation && <button className="hws-primary" disabled={blocked || !draft.proposal || !!draft.proposal.pending || !!changed} onClick={() => void run(apply)}>{busy ? <Loader2 size={17} /> : null}Aplicar diseño revisado</button>}</footer>
  </section>{logosOpen && <DesignLogoPicker businessId={props.businessId} onSelect={saveLogo} onClose={() => setLogosOpen(false)} />}</div>;
}
