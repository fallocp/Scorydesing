import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PresentationDesignService } from '../../components/presentations/PresentationDesignContext';
import type { SlideGeneratorController, SlideGeneratorState, SlideProposalReason } from '../../components/presentations/SlideGeneratorPanel';
import type { DesignToHtmlController, DesignToHtmlState, DesignToHtmlProposal } from '../../components/presentations/DesignToHtmlPanel';
import type { DesignOperation, DesignReference } from '../../../supabase/functions/_shared/desaing/contracts';
import type { DesignCopy, ExplorationRequest, ExplorationResult, IdeaContent } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { ConversationActionKind, ConversationDesignSource, ConversationNextAction } from '../../../supabase/functions/_shared/desaing/conversationActions';
import { resolveConversationSourceMentions } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { assertExplorationResult } from '../../../supabase/functions/_shared/desaing/exploration';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { designSurfaceBrand, designSurfaceSessionId, designSurfaceTarget, designSurfaceWorkspace, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import { fullDesignImmutables, fullDesignLocalInstruction } from '../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { useDesignBrandContext } from './useDesignBrandContext';
import { designBrandExplorationContext } from './designBrandContext';
import { getSlideDimensions, type PresentationSlide } from './presentationDocument';
import { detachUnverifiedMountedImages, reconcileMountedAssets } from './presentationManifest';
import { assertHtmlDesignTarget, type HtmlDesignProposal, type HtmlDesignTarget } from './htmlDesignDraft';
import { preparePresentationReference, type PreparedPresentationReference } from './presentationReferences';
import type { ImageGenerationSettings } from '../imageGenerationSettings';
import { imageDataUrl } from '../desaing/labImages';
import { DesignServerClientError } from '../desaing/serverClient';
import { DesignHtmlRequestError, isDefinitiveHtmlFailure } from './htmlRequestError';
import { beginConversationAction, completeConversationAction, emptyDesignConversation, markConversationAction, advanceConversationEpoch,
  openDesignConversationStore, type DesignConversationState, type DesignConversationRecord, type DesignConversationVersion } from './designConversationStore';
import { buildConversationImageOperation, prepareConversationReferences, readConversationImage, sameConversationAsset } from './designConversationImages';
import { buildConversationHtmlSummary } from './designConversationHtml';
import { buildConversationPresentationContext, buildConversationInspectedSlides, selectConversationInspectionSlides,
  fitConversationPresentationRequest, buildConversationInspectionExamples } from './designConversationDeck';
import { capturePresentationInspection } from './designConversationInspection';
import { canConfirmDesign, confirmationTokens, designActionLabel, designBlockerText, designConfirmationChanges, designConfirmationKey, designPlanBlocker,
  isDesignApproval, isDesignConfirmation, isDesignGeneration, isDesignInsistence, needsResolvedCopy, samePlan } from './designConversationConfirmation';
import { conversationCopyAfterEdit } from './designConversationEdits';
import { buildDesignElementCatalog, applyDesignElementEdits } from './designElementTools';
import { DesignElementEditError, unapprovedElementTexts, type DesignElementEdit } from '../../../supabase/functions/_shared/desaing/designElementEdits';
import { structuralEditFits, type StructuralCheckCache } from './designStructuralCheck';
import { resolveConversationDesignSource, conversationDesignSourceInstruction, designEditableHtmlHash } from './designConversationSource';
import { captureConversationHtml, captureFailureOf, captureFailureText, type CaptureFailure, conversationCopyForTurn, conversationHtmlReferences, conversationVisualSummary, resolveConversationReferenceUse } from './designConversationVisuals';
import { describeVisualReview } from './designVisualReview';
import { buildScopedRepairFeedback, isOrientationChange, namedReferences, referenceNotUsedNotice, requestChecklist,
  type DesignFromExistingFlags } from './designFromExisting';
import { describeStyleLock, inferStyleUnlocks } from './styleLock';
import { DESIGN_CONVERSATION_SESSIONS, isDesignConversationSessionId, designConversationSessionToken, withDesignConversationSession,
  type DesignConversationSessionId } from '../../../supabase/functions/_shared/desaing/conversationSessions';
import { downloadContinuityBackup, type SyncedConversationStore } from './designConversationRemote';
import type { ContinuityStatus } from '../desaing/continuityStore';
import { approveServerLibraryDirection, buildPresentationMediumOperation, isUnresolvedReferenceCopy, mountServerPresentationAsset,
  presentationGenerationCapabilities, presentationLibraryResults, reviewServerLibraryResult, type PresentationLibraryResult } from './presentationServerDesign';

export type DesignConversationView = 'image' | 'html' | 'composition' | 'history';
export interface UseDesignConversationOptions {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  projectName?: string; presentationName?: string; deckSlides?: ReadonlyArray<PresentationSlide>;
  destination?: DesignSurfaceDestination; initialCopy?: string | DesignCopy; initialView?: 'image' | 'html'; settings: ImageGenerationSettings;
  /** Output and starting point chosen in the workspace; undefined keeps every action available. */
  format?: 'html' | 'image'; base?: 'current' | 'version' | 'deck' | 'new';
  /** Style kit of the presentation (other slides), used when base is 'deck'. */
  deckStyle?: Array<{ title: string; summary: string }>;
  /** Original HTML of the first style example, captured as auxiliary deck evidence. */
  deckBaseHtml?: string;
  /** «Ficha de estilo» measured from the base design (slide or deck). */
  styleSpec?: string;
  /** Waits (max. 8 s) for the measured spec; '' when unavailable. */
  styleSpecReady?(): Promise<string>;
  /** «Diseñar sobre lo que ya existe» pieces; undefined = current behavior. */
  fromExisting?: DesignFromExistingFlags;
  htmlController: RefObject<SlideGeneratorController | null>; compositionController: RefObject<DesignToHtmlController | null>;
  htmlState?: RefObject<SlideGeneratorState | null>; compositionState?: RefObject<DesignToHtmlState | null>;
  onView(view: DesignConversationView): void; onApply(slide: PresentationSlide): void | Promise<void>;
}
type Store = Awaited<ReturnType<typeof openDesignConversationStore>> & Partial<Pick<SyncedConversationStore, 'status' | 'backups'>>;
type Life = { active: boolean; actor: string; key: string; store: Store | null; record: DesignConversationRecord | null;
  session: DesignConversationSessionId;
  queue: Promise<unknown>; locked: boolean; blocked: boolean; generation: ServerGenerationCapabilities | null;
  capture?: { html: string; reference: DesignReference; version: Awaited<ReturnType<typeof prepareConversationReferences>>[number]['version'];
    prepared: PreparedPresentationReference };
  sourceCapture?: { html: string; reference: PreparedPresentationReference };
  inspection?: { key: string; prepared: PreparedPresentationReference | null; reference?: DesignReference;
    version?: Awaited<ReturnType<typeof prepareConversationReferences>>[number]['version']; capturedIds: string[] };
  previewRequest?: number;
  /** Planner request this view is waiting for; marked as interrupted if the view closes first. */
  planning?: string;
  /** Problems of the version that «Corregir composición» is fixing, consumed by its HTML request. */
  correction?: { issues: string[] } };
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
const targetOf = (options: UseDesignConversationOptions): HtmlDesignTarget => ({ document: options.documentId, slide: options.slide.id, revision: options.slide.revision });
const scopeKey = (options: UseDesignConversationOptions, session: DesignConversationSessionId = 'main') => JSON.stringify([options.businessId, options.documentId, options.slide.id, session]);
export interface DesignConversationSessionSummary { id: DesignConversationSessionId; label: string; preview: string; pending: boolean }
const sessionSummary = (id: DesignConversationSessionId, value: DesignConversationState): DesignConversationSessionSummary => ({ id,
  label: `Sesión ${DESIGN_CONVERSATION_SESSIONS.indexOf(id) + 1}`, pending: !!value.pending,
  preview: value.messages.find(message => message.role === 'user')?.text.replace(/\s+/g, ' ').trim().slice(0, 64) ?? '' });
const sessionChoiceKey = (actor: string, options: UseDesignConversationOptions) => `scory-design-active-conversation:${JSON.stringify([actor, options.businessId, options.documentId, options.slide.id])}`;
function rememberedSession(actor: string, options: UseDesignConversationOptions): DesignConversationSessionId {
  try { const id = localStorage.getItem(sessionChoiceKey(actor, options)); return isDesignConversationSessionId(id) ? id : 'main'; }
  catch { return 'main'; }
}
function rememberSession(actor: string, options: UseDesignConversationOptions, session: DesignConversationSessionId) {
  try { localStorage.setItem(sessionChoiceKey(actor, options), session); } catch { /* Conversation persistence does not depend on the local selection hint. */ }
}
/** Planner requests whose view closed while waiting (remount, reload). The next view of
 * that conversation reads their saved result instead of leaving the chat blocked. */
const interruptedPlans = new Set<string>(), INTERRUPTED_KEY = 'scory-design-interrupted-plans';
function rememberInterruptedPlan(actionId: string) {
  interruptedPlans.add(actionId);
  try { sessionStorage.setItem(INTERRUPTED_KEY, JSON.stringify([...interruptedPlans].slice(-20))); } catch { /* In-memory marker only. */ }
}
function takeInterruptedPlan(actionId: string): boolean {
  let stored: unknown = [];
  try { stored = JSON.parse(sessionStorage.getItem(INTERRUPTED_KEY) ?? '[]'); } catch { /* In-memory marker only. */ }
  const found = interruptedPlans.has(actionId) || Array.isArray(stored) && stored.includes(actionId);
  interruptedPlans.delete(actionId);
  try { sessionStorage.setItem(INTERRUPTED_KEY, JSON.stringify((Array.isArray(stored) ? stored : []).filter(id => id !== actionId))); } catch { /* In-memory marker only. */ }
  return found;
}
const selectedOf = (state: DesignConversationState) => state.versions.find(item => item.id === state.selected_version_id);
const imageOf = (state: DesignConversationState) => {
  const selected = selectedOf(state);
  if (selected?.kind === 'image') return selected;
  if (selected?.kind === 'html' && selected.composition) return state.versions.find(item => item.kind === 'image' && sameConversationAsset(item.asset, selected.composition!.source));
  return undefined;
};
const imageForBase = (state: DesignConversationState, options: Pick<UseDesignConversationOptions, 'format' | 'base'>) => {
  if (options.format === 'image' && (options.base === 'new' || options.base === 'current'
    || options.base === 'version' && selectedOf(state)?.kind !== 'image')) return undefined;
  return imageOf(state);
};
const versionView = (version: DesignConversationVersion): DesignConversationView => version.kind === 'image' ? 'image' : version.composition ? 'composition' : 'html';
// The HTML service already answers with a readable message; its machine code drives only the rewrite offer.
const problemCode = (problem: unknown) => problem instanceof DesignHtmlRequestError ? problem.message
  : problem && typeof problem === 'object' && 'code' in problem ? String(problem.code)
  : problem instanceof Error ? problem.message : '';
const definitivePlanningFailures = new Set(['exploration_provider_invalid_result', 'exploration_provider_incomplete',
  'exploration_provider_rejected', 'exploration_provider_unexpected_output', 'exploration_provider_response_too_large',
  'exploration_provider_output_limit', 'exploration_provider_refused']);
const failedPlanningMessagePrefix = 'assistant:planning-failed:';
const failedCopyPlanningMessagePrefix = 'assistant:copy-planning-failed:';
function retryablePlanningMessage(value: DesignConversationState): { message: string; resolvingCopy: boolean } | null {
  const last = value.messages.at(-1);
  if (value.pending || last?.role !== 'assistant') return null;
  const resolvingCopy = last.id.startsWith(failedCopyPlanningMessagePrefix);
  if (!resolvingCopy && !last.id.startsWith(failedPlanningMessagePrefix)) return null;
  const message = [...value.messages].reverse().find(message => message.role === 'user' && message.turn_id === last.turn_id)?.text;
  return message ? { message, resolvingCopy } : null;
}
const describeError = (problem: unknown) => {
  const code = problemCode(problem);
  const errors: Record<string, string> = {
    conversation_revision_conflict: 'Otra sesión cambió esta conversación. Sincroniza para cargar la revisión vigente; tu cambio se conserva en la copia local.',
    conversation_sync_unavailable: 'No se pudo confirmar el guardado en Supabase. Tu copia local se conserva; sincroniza antes de continuar.',
    conversation_forbidden: 'Tu sesión no tiene acceso a este trabajo. Revisa la cuenta y el negocio seleccionados.',
    conversation_size_limit: 'El historial supera el límite de guardado remoto. Tu copia local se conserva.',
    conversation_pending_unresolved: 'Hay una acción pendiente. Recupérala o descártala para continuar.',
    conversation_target_changed: 'Cambió el lienzo. Tu conversación sigue guardada; vuelve a abrirla para trabajar con esta versión.',
    server_session_changed: 'Cambió tu sesión. Vuelve a abrir este diseño.',
    conversation_message_limit: 'Esta conversación llegó a su límite de mensajes. Conservamos todo el historial.',
    conversation_version_limit: 'Este diseño llegó a 20 versiones. Conservamos todas las versiones guardadas.',
    conversation_action_limit: 'Esta conversación llegó al límite de acciones guardadas.',
    unsupported_image_selection: 'El servidor todavía no admite el modelo y la calidad seleccionados.',
    job_quota_exceeded: 'No queda presupuesto para otra imagen. Puedes revisar los resultados guardados.',
    exploration_quota_exceeded: 'No queda presupuesto para otra conversación. Puedes usar los resultados guardados.',
    server_generation_unavailable: 'La generación de imágenes no está disponible en este momento.',
    conversation_outcome_unknown: 'La respuesta sigue pendiente de confirmar. Usa Recuperar; conservamos la solicitud exacta.',
    conversation_action_not_found: 'Todavía no se encontró un resultado guardado. Puedes volver a recuperarlo sin repetir la generación.',
    exploration_provider_timeout: 'La IA tardó demasiado en responder. Recupera la solicitud para comprobar si terminó.',
    exploration_provider_rejected: 'El proveedor de IA rechazó la solicitud. Puedes ajustar tu mensaje o volver a intentarlo.',
    exploration_provider_invalid_result: 'La respuesta de la IA no pudo validarse. Puedes reintentar el mensaje o seguir conversando; tu diseño se conserva.',
    exploration_provider_incomplete: 'La IA no terminó su respuesta. Puedes reintentar el mensaje o seguir conversando; tu diseño se conserva.',
    exploration_provider_unexpected_output: 'La IA devolvió una respuesta inesperada. Puedes reintentar el mensaje o seguir conversando.',
    exploration_provider_response_too_large: 'La respuesta de la IA fue demasiado grande. Puedes pedir una propuesta más breve y continuar.',
    exploration_provider_output_limit: 'La IA alcanzó el límite de su respuesta antes de terminar. Puedes reintentar el mensaje o pedir una propuesta más breve.',
    exploration_provider_refused: 'La IA no pudo responder a esta solicitud. Puedes reformular el mensaje y continuar; tu diseño se conserva.',
    exploration_provider_unknown: 'No se pudo confirmar el resultado de la IA. Recupera la solicitud antes de repetirla.',
    server_exploration_outcome_unknown: 'Todavía no se conoce el resultado de esta solicitud. Usa Recuperar para comprobar su estado.',
    exploration_previous_unresolved: 'Hay otra respuesta en curso. Espera unos segundos o descarta la solicitud pendiente.',
  };
  // Structural edit refusals carry a readable reason (for example a removed target).
  if (problem instanceof DesignElementEditError && problem.message !== problem.code) return problem.message;
  return errors[code] ?? (/\s/.test(code) && !/[{}<>]/.test(code) ? code : 'No se completó la acción. Conservamos el trabajo; recupera su estado antes de repetirla.');
};
/** A message claiming work that was not executed in this turn. */
const CLAIMS_DONE = /(qued[oó]|queda|est[aá])\s+(confirmad|list[oa]|aprobad|cread|generad|hech)|\bya\s+(lo\s+|la\s+)?(cre[eé]|gener[eé]|hice|apliqu[eé])/i;
const firstSentence = (text: string, max: number) => (text.trim().split(/(?<=[.!?])\s/)[0] ?? '').slice(0, max).trim();
/** Visible text of an HTML document, complete (approval corpus for direct edits). */
function visibleText(html: string): string {
  if (typeof DOMParser === 'undefined') return html.replace(/<(style|script|template)\b[\s\S]*?<\/\1\s*>/gi, ' ').replace(/<[^>]+>/g, ' ');
  const document = new DOMParser().parseFromString(html, 'text/html');
  for (const node of document.querySelectorAll('style,script,template')) node.remove();
  return document.body?.textContent ?? '';
}
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;
/** Local summary of a deterministic edit, e.g. «agregué 3 bloques y los acomodé en 3 columnas». */
function structuralSummary(edits: readonly DesignElementEdit[]): string {
  const count = (kind: DesignElementEdit['kind']) => edits.filter(edit => edit.kind === kind).length;
  const reflow = edits.find(edit => edit.kind === 'reflow');
  const parts = [count('retext') && `actualicé el texto de ${plural(count('retext'), 'bloque', 'bloques')}`,
    count('duplicate') && `agregué ${plural(count('duplicate'), 'bloque', 'bloques')}`,
    count('remove') && `quité ${plural(count('remove'), 'elemento', 'elementos')}`,
    reflow?.kind === 'reflow' && `los acomodé en ${plural(reflow.columns, 'columna', 'columnas')}`].filter((part): part is string => !!part);
  return parts.length > 1 ? `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}` : parts[0] ?? 'apliqué el cambio';
}

/** The user's last instruction, skipping bare approvals («sí, créalo») that only run the plan. */
const lastInstruction = (value: DesignConversationState) => [...value.messages].reverse()
  .find(message => message.role === 'user' && !isDesignConfirmation(message.text))?.text ?? '';
/** Saved short spec (or the user's edited prompt) of each reference, by image hash. */
const referencePromptOf = (value: DesignConversationState, sha256: string) => value.reference_prompts?.[sha256]?.text;

/** A single durable conversation coordinates the existing image and HTML controllers. */
export function useDesignConversation(options: UseDesignConversationOptions) {
  const latest = useRef(options); latest.current = options;
  const [activeSession, setActiveSession] = useState<DesignConversationSessionId>('main');
  const sessionRef = useRef(activeSession); sessionRef.current = activeSession;
  const selectionHint = useRef<{ key: string; session: DesignConversationSessionId } | null>(null);
  const [sessions, setSessions] = useState<DesignConversationSessionSummary[]>([]);
  const [sessionsReady, setSessionsReady] = useState(false), [sessionsError, setSessionsError] = useState('');
  const lifeRef = useRef<Life | null>(null);
  const [state, setState] = useState<DesignConversationState>(() => emptyDesignConversation(targetOf(options)));
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [resuming, setResuming] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ContinuityStatus>('loading');
  const [localCopies, setLocalCopies] = useState(false);
  const [generation, setGeneration] = useState<ServerGenerationCapabilities | null>(null);
  const [imageResult, setImageResult] = useState<PresentationLibraryResult | null>(null), [imagePreview, setImagePreview] = useState('');
  const [imagePreviewLoading, setImagePreviewLoading] = useState(false);
  const [view, setView] = useState<DesignConversationView>(options.initialView ?? 'image');
  const viewRef = useRef<DesignConversationView>(options.initialView ?? 'image');
  const hydratedHtml = useRef('');
  const structuralBase = useRef<StructuralCheckCache['current']>(null);
  const brand = useDesignBrandContext(options.businessId, options.service.brand), brandRef = useRef(brand); brandRef.current = brand;
  const planner = useMemo(() => options.service.exploration?.planner ?? options.service.exploration?.createPlanner?.(options.businessId)
    ?? options.service.client.exploration(options.businessId), [options.service, options.businessId]);
  const plannerRef = useRef(planner); plannerRef.current = planner;
  const active = (life: Life) => life.active && lifeRef.current === life && life.key === scopeKey(latest.current, sessionRef.current);
  const current = (life: Life) => life.record?.value ?? emptyDesignConversation(targetOf(latest.current));
  function ensure(life: Life, epoch?: number, allowHistoricalTarget = false) {
    if (!active(life)) throw Error('conversation_view_closed');
    if (life.blocked) throw Error('conversation_revision_conflict');
    if (life.store?.status && life.store.status() !== 'synced') throw Error('conversation_sync_unavailable');
    if (!allowHistoricalTarget && !same(current(life).target, targetOf(latest.current)) || epoch !== undefined && current(life).epoch !== epoch) throw Error('conversation_target_changed');
  }
  async function assertActor(life: Life) {
    if (!active(life)) throw Error('conversation_view_closed');
    const session = await latest.current.service.client.session();
    if (!active(life)) throw Error('conversation_view_closed');
    if (session.actorId !== life.actor) {
      setState(emptyDesignConversation(targetOf(latest.current))); setReady(false); setImageResult(null); setImagePreview('');
      throw Error('server_session_changed');
    }
  }
  async function assertCurrent(life: Life, epoch = current(life).epoch) {
    ensure(life, epoch); await assertActor(life); ensure(life, epoch);
  }
  async function assertRemoteRevision(life: Life) {
    if (!life.store?.status) return;
    const saved = await life.store.read(); await assertCurrent(life);
    if (saved?.revision !== life.record?.revision) { life.blocked = true; throw Error('conversation_revision_conflict'); }
  }
  function save(life: Life, transform: (value: DesignConversationState) => DesignConversationState, allowHistoricalTarget = false) {
    const work = life.queue.then(async () => {
      ensure(life, undefined, allowHistoricalTarget); if (!life.store) throw Error('conversation_store_unavailable');
      const next = transform(structuredClone(current(life)));
      try { const saved = await life.store.write(life.record?.revision ?? 0, next); await assertActor(life); life.record = saved;
        if (active(life)) { setState(saved.value); setSessions(items => items.map(item => item.id === life.session ? sessionSummary(life.session, saved.value) : item)); } return saved.value;
      } catch (problem) { if (problem instanceof Error && problem.message === 'conversation_revision_conflict') life.blocked = true; throw problem; }
    });
    life.queue = work.catch(() => {}); return work;
  }
  function show(next: DesignConversationView) { viewRef.current = next; setView(next); latest.current.onView(next); }
  function savedVersionView(value: DesignConversationState, selected: DesignConversationVersion): DesignConversationView {
    if (selected.kind !== 'html') return 'image';
    if (!same(selected.target, value.target)) return 'history';
    if (!selected.composition) return 'html';
    const newest = value.versions.filter(version => version.kind === 'html' && version.composition).at(-1);
    if (newest?.id !== selected.id) return 'history';
    const live = latest.current.compositionState?.current?.proposal;
    if (live?.requestKey === selected.composition.request_key && live.html === selected.proposal.html) return 'composition';
    // The saved completed HTML contains its mounted pixels. Resume it in the existing full editor
    // on a new device; do not substitute another local composition or regenerate missing pieces.
    if (latest.current.service.continuity) return selected.composition.unresolved_slots.length || selected.proposal.pending ? 'history' : 'html';
    return 'composition';
  }
  async function refreshImage(life: Life, knownResult?: PresentationLibraryResult, background = false) {
    const request = (life.previewRequest ?? 0) + 1; life.previewRequest = request;
    const selected = imageOf(current(life));
    if (selected?.kind !== 'image') { if (active(life)) { setImageResult(null); setImagePreview(''); setImagePreviewLoading(false); } return; }
    const identity = structuredClone(selected.asset), epoch = current(life).epoch;
    const isCurrentPreview = () => { const now = imageOf(current(life)); return active(life) && life.previewRequest === request
      && current(life).epoch === epoch && now?.kind === 'image' && sameConversationAsset(now.asset, identity); };
    if (active(life)) { setImagePreviewLoading(true); setImagePreview(''); }
    try {
      const found = knownResult && sameConversationAsset(knownResult.asset.identity, identity) ? knownResult
        : await readConversationImage(latest.current.service.client, latest.current.businessId, identity);
      await assertCurrent(life, epoch); if (!isCurrentPreview()) return;
      setImageResult(found);
      const preview = await imageDataUrl(await latest.current.service.client.asset(identity)); await assertCurrent(life, epoch);
      if (isCurrentPreview()) setImagePreview(preview);
    } catch (problem) {
      if (!background) throw problem;
      if (isCurrentPreview()) setError('La imagen está guardada, pero no se pudo cargar la vista previa. Puedes volver a seleccionar esta versión para reintentar.');
    } finally { if (active(life) && life.previewRequest === request) setImagePreviewLoading(false); }
  }
  async function run(action: (life: Life) => Promise<void>, recovering = false) {
    const life = lifeRef.current;
    if (!life || !active(life) || life.locked || !life.store) return;
    life.locked = true; setBusy(true); setError('');
    try { await life.queue; if (!recovering) ensure(life); await action(life); }
    catch (problem) { if (active(life)) setError(describeError(problem)); }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  function conversationScope(life: Life, session = life.session) {
    return { actor: life.actor, business: latest.current.businessId, document: latest.current.documentId, slide: latest.current.slide.id,
      ...(session === 'main' ? {} : { session }) };
  }
  async function refreshSessions(life: Life) {
    const input = latest.current;
    const entries = await Promise.all(DESIGN_CONVERSATION_SESSIONS.map(async id => {
      if (id === life.session && life.record) return sessionSummary(id, life.record.value);
      const scope = conversationScope(life, id);
      const store = input.service.continuity ? await input.service.continuity.openConversation(scope) : await openDesignConversationStore(scope);
      try {
        const record = await store.read();
        if ('status' in store && typeof store.status === 'function' && store.status() !== 'synced') throw Error('conversation_sync_unavailable');
        return record ? sessionSummary(id, record.value) : null;
      } finally { store.close(); }
    }));
    await assertActor(life);
    const found = entries.filter((entry): entry is DesignConversationSessionSummary => entry !== null);
    setSessions(found); setSessionsReady(true); setSessionsError(''); return found;
  }
  function activateSession(life: Life, session: DesignConversationSessionId) {
    rememberSession(life.actor, latest.current, session);
    selectionHint.current = { key: sessionChoiceKey(life.actor, latest.current), session };
    // Close this lifetime immediately. Late responses still belong to its saved
    // pending request; they cannot write into the newly selected conversation.
    life.active = false; setReady(false); setBusy(false); setError(''); setLocalCopies(false);
    setState(emptyDesignConversation(targetOf(latest.current))); setImageResult(null); setImagePreview(''); setImagePreviewLoading(false);
    hydratedHtml.current = ''; show(latest.current.initialView ?? 'image'); setActiveSession(session);
  }
  function assertSessionSwitchAvailable() {
    if (latest.current.htmlState?.current?.busy || latest.current.compositionState?.current?.busy)
      throw Error('Espera a que termine el ajuste antes de cambiar de sesión.');
  }
  async function loadConversation(life: Life) {
    const input = latest.current, store = life.store!;
    life.record = await store.read(); if (!active(life)) return;
    await assertActor(life); life.blocked = false;
    const writable = !store.status || store.status() === 'synced';
    if (!life.record && writable) {
      const initial = emptyDesignConversation(targetOf(input));
      if (life.session === 'main') {
        if (typeof input.initialCopy === 'object') initial.copy = structuredClone(input.initialCopy);
        else if (input.initialCopy?.trim() && !isUnresolvedReferenceCopy(input.initialCopy)) initial.copy = { status: 'literal', text: input.initialCopy, source_reference_ids: [] };
      }
      life.record = await store.write(0, initial);
    } else if (life.record && writable && life.record.value.target.revision < input.slide.revision && !life.record.value.pending) {
      const next = advanceConversationEpoch(life.record.value, targetOf(input));
      const previous = selectedOf(next); next.next_action = null;
      next.confirmation = null;
      if (previous?.kind === 'html') {
        next.copy = conversationCopyAfterEdit(next.copy, previous.proposal.html, input.slide.html);
        if (next.understanding) next.understanding = { ...next.understanding, copy: next.copy };
      }
      if (previous?.kind === 'html') {
        next.selected_version_id = null;
        if (previous.proposal.html === input.slide.html && !previous.proposal.pending && !previous.composition?.unresolved_slots.length && next.versions.length < 20) {
          const version: DesignConversationVersion = { id: crypto.randomUUID(), turn_id: crypto.randomUUID(), parent_id: previous.id,
            target: next.target, kind: 'html', proposal: { html: input.slide.html, target: next.target, intent: 'replace',
              canvas: getSlideDimensions(input.slide.html), mounted: structuredClone(input.slide.mounted_assets ?? []) } };
          next.versions.push(version); next.selected_version_id = version.id;
        }
        show('html');
      }
      life.record = await store.write(life.record.revision, next);
    }
    await assertActor(life);
    if (!life.record) return;
    setState(life.record.value); setReady(true);
    setSessions(items => [...items.filter(item => item.id !== life.session), sessionSummary(life.session, life.record!.value)]
      .sort((a, b) => DESIGN_CONVERSATION_SESSIONS.indexOf(a.id) - DESIGN_CONVERSATION_SESSIONS.indexOf(b.id)));
    if (store.backups) setLocalCopies((await store.backups()).length > 0);
    const selected = selectedOf(life.record.value);
    if (selected) {
      show(savedVersionView(life.record.value, selected));
    }
    if (!same(life.record.value.target, targetOf(input))) setError(describeError(Error('conversation_target_changed')));
  }
  useEffect(() => {
    const life: Life = { active: true, actor: '', session: activeSession, key: scopeKey(options, activeSession), store: null, record: null, queue: Promise.resolve(), locked: false, blocked: false, generation: null };
    lifeRef.current = life; setReady(false); setBusy(false); setResuming(false); setError(''); setImageResult(null); setImagePreview(''); setImagePreviewLoading(false);
    setState(emptyDesignConversation(targetOf(options))); setSyncStatus('loading'); setLocalCopies(false);
    setSessions([]); setSessionsReady(false); setSessionsError(''); hydratedHtml.current = '';
    void (async () => {
      const session = await options.service.client.session(); if (!active(life)) return; life.actor = session.actorId;
      const choiceKey = sessionChoiceKey(life.actor, options);
      const choice = selectionHint.current?.key === choiceKey ? selectionHint.current.session : rememberedSession(life.actor, options);
      selectionHint.current = { key: choiceKey, session: choice };
      if (choice !== life.session) { activateSession(life, choice); return; }
      const scope = conversationScope(life);
      const store: Store = options.service.continuity ? await options.service.continuity.openConversation(scope, status => { if (active(life)) setSyncStatus(status); })
        : await openDesignConversationStore(scope);
      if (!active(life)) { store.close(); return; } life.store = store;
      await loadConversation(life); if (!active(life) || store.status?.() === 'offline') return;
      void resumeInterruptedPlanning(life);
      await refreshSessions(life).catch(() => { if (active(life)) setSessionsError('No se pudieron cargar las otras sesiones. Sincroniza para volver a intentarlo.'); });
      if (!active(life)) return;
      const server = await options.service.client.read(options.businessId); await assertActor(life);
      life.generation = presentationGenerationCapabilities(server.generation, options.service.simulation, server.state); setGeneration(life.generation);
      if (!same(current(life).target, targetOf(latest.current))) { setError(describeError(Error('conversation_target_changed'))); return; }
      await refreshImage(life);
    })().catch(problem => { if (active(life)) setError(describeError(problem)); });
    return () => { if (life.planning) rememberInterruptedPlan(life.planning); life.active = false; void life.queue.finally(() => life.store?.close()); };
  }, [options.service, options.businessId, options.documentId, options.slide.id, activeSession]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkSession = () => {
      const life = lifeRef.current; if (!life?.actor || !active(life)) return;
      void assertActor(life).catch(problem => { if (active(life)) setError(describeError(problem)); });
    };
    window.addEventListener('focus', checkSession); window.document.addEventListener('visibilitychange', checkSession);
    return () => { window.removeEventListener('focus', checkSession); window.document.removeEventListener('visibilitychange', checkSession); };
  }, [options.service]);

  useEffect(() => {
    const life = lifeRef.current, selected = selectedOf(state), editor = options.htmlState?.current;
    if (!ready || busy || !life || !active(life) || state.pending || viewRef.current !== 'html' || selected?.kind !== 'html'
      || selected.composition?.unresolved_slots.length || !same(selected.target, state.target) || !editor?.ready || editor.busy || editor.status !== 'ready'
      || same(editor.proposal, selected.proposal) || !options.htmlController.current) return;
    const key = `${life.actor}:${life.key}:${selected.id}`; if (hydratedHtml.current === key) return; hydratedHtml.current = key;
    void run(async currentLife => { await assertCurrent(currentLife);
      await latest.current.htmlController.current!.updateContext(savedHtmlContext(current(currentLife), selected.proposal)); });
  }, [ready, busy, view, state.selected_version_id, state.target.revision, options.htmlState?.current?.ready, options.htmlState?.current?.status]);

  async function syncBrand(life: Life) {
    const snapshot = brandRef.current;
    if (snapshot.status === 'loading' || snapshot.status === 'error') throw Error('Carga la identidad de la marca antes de continuar.');
    if (current(life).pending) throw Error('conversation_pending_unresolved');
    if (!same(current(life).brand, snapshot.context)) await save(life, value => ({ ...value, brand: snapshot.context,
      brand_key: snapshot.context?.fingerprint ?? null }));
  }
  async function references(life: Life, selected = current(life).references) {
    const value = current(life), epoch = value.epoch;
    return prepareConversationReferences({ client: latest.current.service.client, actor: life.actor, business: latest.current.businessId,
      document: latest.current.documentId, slide: latest.current.slide.id, references: structuredClone(selected),
      destination: latest.current.destination, conversationSessionId: designConversationSessionToken(life.session, value.session_generation ?? 1),
      assertCurrent: () => assertCurrent(life, epoch) });
  }
  async function htmlCapture(life: Life, html: string): Promise<DesignReference | undefined> {
    if (life.capture?.html === html) return life.capture.reference;
    const epoch = current(life).epoch;
    let capture: PreparedPresentationReference;
    try { capture = await captureConversationHtml(html, getSlideDimensions(html), { businessId: latest.current.businessId, expectedActorId: life.actor }); }
    catch {
      // The renderer can be unavailable; remain useful while explicitly declaring
      // that the planner has structural context only. Session errors still fail.
      await assertCurrent(life, epoch); return undefined;
    }
    await assertCurrent(life, epoch);
    const uploaded = await prepareConversationReferences({ client: latest.current.service.client, actor: life.actor,
      business: latest.current.businessId, document: latest.current.documentId, slide: `base:${latest.current.slide.id}`,
      references: [capture], destination: latest.current.destination, conversationSessionId: designConversationSessionToken(life.session, current(life).session_generation ?? 1),
      assertCurrent: () => assertCurrent(life, epoch) });
    await assertCurrent(life, epoch);
    const reference = { ...uploaded[0].reference, reference_id: `html:${capture.sha256}`,
      roles: ['layout_reference', 'image_style_reference'] as DesignReference['roles'] };
    life.capture = { html, reference, version: uploaded[0].version, prepared: capture }; return reference;
  }
  function workingSlide(value: DesignConversationState): PresentationSlide {
    const slide = latest.current.slide, selected = selectedOf(value);
    return latest.current.base !== 'current' && selected?.kind === 'html' && same(selected.target, value.target) && !selected.composition?.unresolved_slots.length
      ? { ...slide, html: selected.proposal.html, mounted_assets: selected.proposal.mounted } : slide;
  }
  function presentationContext(value: DesignConversationState) {
    const input = latest.current;
    return input.deckSlides?.length ? buildConversationPresentationContext({ projectId: input.businessId,
      projectName: input.projectName || value.brand?.name || 'Proyecto actual', documentId: input.documentId,
      presentationName: input.presentationName || 'Presentación actual', slides: input.deckSlides,
      currentSlideId: input.slide.id, currentSlide: input.slide }) : undefined;
  }
  async function inspectPresentation(life: Life, ids: string[], visual: boolean) {
    const input = latest.current, value = current(life), deck = presentationContext(value);
    if (!deck || !input.deckSlides?.length || !ids.length) return undefined;
    const slide = input.slide, slides = selectConversationInspectionSlides(input.deckSlides, ids, slide);
    const baseSlide = slide;
    const captureSlides = slides.some(item => item.id === baseSlide.id) ? slides : [...slides, baseSlide];
    const key = JSON.stringify(captureSlides.map(item => {
      const label = deck.slides.find(slide => slide.id === item.id);
      return [item.id, item.revision, item.html, label?.number, label?.title];
    }));
    if (visual && life.inspection?.key !== key) {
      const evidence = await capturePresentationInspection(captureSlides, deck.slides,
        { businessId: input.businessId, expectedActorId: life.actor }, () => assertCurrent(life));
      await assertCurrent(life);
      let uploaded: Awaited<ReturnType<typeof prepareConversationReferences>>[number] | undefined;
      if (evidence.reference) uploaded = (await prepareConversationReferences({ client: input.service.client, actor: life.actor,
        business: input.businessId, document: input.documentId, slide: `inspection:${input.slide.id}`, references: [evidence.reference],
        destination: input.destination, conversationSessionId: designConversationSessionToken(life.session, value.session_generation ?? 1),
        assertCurrent: () => assertCurrent(life) }))[0];
      life.inspection = { key, prepared: evidence.reference, capturedIds: evidence.capturedIds,
        ...(uploaded ? { version: uploaded.version, reference: { ...uploaded.reference,
          reference_id: `deck:${evidence.reference!.sha256}`, roles: ['layout_reference', 'image_style_reference'] } } : {}) };
    }
    const capture = visual && life.inspection?.key === key ? life.inspection : undefined;
    const inspected = buildConversationInspectedSlides(input.deckSlides, ids, undefined, slide).map(item => ({ ...item,
      ...(capture?.reference && capture.capturedIds.includes(item.id) ? { reference_id: capture.reference.reference_id } : {}) }));
    return { ...deck, inspected_slides: inspected };
  }
  async function finishPlanningFailure(life: Life, actionId: string, problem: unknown): Promise<boolean> {
    const pending = current(life).pending;
    if (!active(life) || !definitivePlanningFailures.has(problemCode(problem)) || pending?.action_id !== actionId
      || pending.kind !== 'understand' || pending.request?.kind !== 'understand') return false;
    await assertCurrent(life, pending.epoch);
    const failedMessage = pending.request.request.message;
    const prefix = same(pending.request.request.conversation?.available_actions, ['discuss'])
      ? failedCopyPlanningMessagePrefix : failedPlanningMessagePrefix;
    await save(life, value => {
      // The original user message remains the exact retry source, including an
      // internal inspection's follow-up request. Old records may lack that turn.
      const hasSource = value.messages.some(message => message.role === 'user' && message.turn_id === pending.turn_id && message.text === failedMessage);
      const before = hasSource ? value : { ...value, messages: [...value.messages, {
        id: `user:planning-failed:${actionId}`, turn_id: pending.turn_id, role: 'user' as const, text: failedMessage }] };
      return completeConversationAction(before, actionId, { next_action: null, message: {
        id: `${prefix}${actionId}`, turn_id: pending.turn_id, role: 'assistant', text: describeError(problem) } });
    });
    return true;
  }
  /** `opts.execute` is true only for a live user turn (also through its inspection rounds):
   * a recovered `requested` plan is armed but never executed without the user present. */
  async function acceptUnderstanding(life: Life, result: ExplorationResult, allowInspection: boolean, inspectionRound = 0,
    opts: { execute: boolean; sentKey?: string } = { execute: false }) {
    const pending = current(life).pending;
    if (pending?.request?.kind !== 'understand') throw Error('conversation_pending_unresolved');
    assertExplorationResult(result, pending.request.request); await assertCurrent(life, pending.epoch);
    if (!result.design_understanding || !result.next_action) throw Error('Actualiza el servidor para usar la conversación de diseño.');
    const sentAction = pending.request.request.conversation?.pending_action;
    const sentPhase = sentAction?.phase, sentQuestion = sentAction?.questions[0];
    // Reading slides keeps the waiting plan (unarmed); the next round carries the original phase.
    const waitingPlan = (value: DesignConversationState) => isDesignGeneration(value.next_action?.kind) ? value.next_action : null;
    if (result.next_action.kind === 'inspect_slides') {
      const request = pending.request.request, ids = result.next_action.slide_ids ?? [];
      selectConversationInspectionSlides(latest.current.deckSlides ?? [], ids, latest.current.slide);
      if (inspectionRound >= 3) {
        await save(life, value => completeConversationAction(value, pending.action_id, { next_action: waitingPlan(value), message: {
          id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant',
          text: 'No pude completar el análisis de esas diapositivas en este intento. Tu diseño se conserva; puedes pedirme revisar una diapositiva concreta.' } }));
        return;
      }
      await save(life, value => ({ ...completeConversationAction(value, pending.action_id, { next_action: waitingPlan(value), message: {
        id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant', text: result.message } }),
        inspected_slide_ids: [...new Set([...(value.inspected_slide_ids ?? []).filter(id => request.conversation?.presentation?.slides.some(slide => slide.id === id)), ...ids])].slice(-12) }));
      if (allowInspection) await sendMessage(life, request.message, undefined, false,
        { round: inspectionRound + 1, turnId: pending.turn_id, execute: opts.execute, ...(sentPhase ? { phase: sentPhase } : {}) });
      return;
    }
    // Captures are immutable registered context for this exact request, not user
    // attachments. Keep their IDs in the recoverable request without promoting
    // them into the persistent user-reference selection or generation inputs.
    const captures = new Set(pending.request.request.context.references.filter(reference => /^(html|deck):/.test(reference.reference_id)).map(reference => reference.reference_id));
    const request = pending.request.request;
    const sourceText = (text: string, machine = true) => resolveConversationSourceMentions(text, request, machine);
    const persistent = (id: string) => !captures.has(id);
    const proposedCopy = { ...result.design_understanding.copy, source_reference_ids: result.design_understanding.copy.source_reference_ids.filter(persistent) };
    const understanding = { ...result.design_understanding,
      resolved_instruction: sourceText(result.design_understanding.resolved_instruction),
      preserve: result.design_understanding.preserve.map(text => sourceText(text)),
      pending_questions: result.design_understanding.pending_questions.map(text => sourceText(text, false)),
      copy: conversationCopyForTurn(current(life).copy, proposedCopy, pending.request.request.message),
      references: result.design_understanding.references.filter(reference => persistent(reference.reference_id))
        .map(reference => ({ ...reference, instruction: sourceText(reference.instruction) })) };
    const userText = pending.request.request.message;
    const resolvedUse = resolveConversationReferenceUse(current(life).references, understanding, userText);
    // The server already validated intent: the client no longer forces «suggested».
    const nextAction: ConversationNextAction = { ...result.next_action,
      instruction: sourceText(result.next_action.instruction), reason: sourceText(result.next_action.reason, false),
      reference_ids: result.next_action.reference_ids.filter(persistent) };
    // This restriction travels with the durable request, including recovery on another device.
    const resolvingCopy = same(pending.request.request.conversation?.available_actions, ['discuss']);
    const before = current(life), prev = before.next_action, questions = understanding.pending_questions;
    const copy = before.copy.status === understanding.copy.status && before.copy.text === understanding.copy.text ? before.copy : understanding.copy;
    const generation = isDesignGeneration(nextAction.kind), modelText = sourceText(result.message, false);
    const strict = isDesignInsistence(userText), insistence = strict || isDesignApproval(userText);
    // Step 4: a direct edit never writes text the user did not give or approve (complete client corpus).
    let degraded = '';
    if (!resolvingCopy && nextAction.kind === 'edit_elements' && nextAction.intent === 'requested') {
      const missing = unapprovedElementTexts(nextAction.element_edits ?? [], [...before.messages.filter(item => item.role === 'user').map(item => item.text),
        userText, before.copy.text, understanding.copy.source_reference_ids.length ? understanding.copy.text : '', visibleText(workingSlide(before).html)]);
      if (missing.length) { nextAction.intent = 'suggested'; degraded = `\n\nTexto nuevo que pondré: «${missing.join('», «')}». ¿Lo pongo así?`; }
    }
    // Step 5: an approval or insistence after the same plan runs it instead of showing it again.
    let promoted = false;
    if (!resolvingCopy && generation && nextAction.intent === 'suggested' && samePlan(prev, nextAction) && !questions.length
      && (!needsResolvedCopy(nextAction.kind) || copy.status !== 'pending') && !degraded
      && (sentPhase === 'confirmation' && insistence || sentPhase === 'clarification' && strict)) { nextAction.intent = 'requested'; promoted = true; }
    // References travel only in their turn: say which attachment this plan does not use.
    const flags = latest.current.fromExisting;
    let referenceNotice = '';
    if (flags?.referencias_por_turno && !resolvingCopy && generation && latest.current.format === 'html') {
      const named = new Set(namedReferences(userText, before.references));
      const unused = before.references.filter(reference => !nextAction.reference_ids.includes(reference.id) && !named.has(reference.id)
        && !(reference.role === 'content_source' && copy.status === 'literal'));
      if (unused.length && !/No uso la referencia/.test(modelText)) referenceNotice = `\n\n${referenceNotUsedNotice(unused.map(reference => reference.name))}`;
    }
    let execute = false;
    await save(life, value => {
      const misses = value.affirmation_misses ?? 0, previousPlan = waitingPlan(value);
      let chosen: ConversationNextAction | null = resolvingCopy ? value.next_action : nextAction;
      let armed: boolean | undefined, added = '', replaced = '', nextMisses = 0;
      const preparesNothing = nextAction.kind === 'discuss' || nextAction.kind === 'explore_ideas';
      // Step 6: an answer that prepares nothing keeps the waiting plan; only a plain approval re-arms it.
      const keepPlan = !resolvingCopy && !!previousPlan && preparesNothing
        && (sentPhase === 'confirmation' || strict && nextAction.kind === 'discuss');
      if (keepPlan) { chosen = previousPlan; armed = false; }
      const next: DesignConversationState = { ...completeConversationAction(value, pending.action_id, {
        understanding: resolvedUse.understanding, copy, ideas: resolvingCopy ? value.ideas : result.ideas.map(idea => ({ ...idea,
          render_instruction: sourceText(idea.render_instruction), reference_ids: idea.reference_ids.filter(persistent) })),
        next_action: chosen }), references: resolvedUse.references };
      const key = () => designConfirmationKey(next, latest.current);
      if (keepPlan && sentPhase === 'confirmation' && insistence && !/[?¿]/.test(modelText)) {
        const blocker = designPlanBlocker(next, latest.current);
        if (opts.sentKey && opts.sentKey !== key()) added = `\n\n${designBlockerText({ reason: 'stale', detail: designConfirmationChanges(opts.sentKey, key()) })}`;
        else if (blocker === null) armed = true;
        else if (blocker.reason === 'copy' || blocker.reason === 'question') added = `\n\n${designBlockerText(blocker)}`;
      }
      // Step 7: two affirmatives in a row answered without an action get a concrete local reply.
      if (!resolvingCopy && strict && nextAction.kind === 'discuss') {
        if (misses < 1) nextMisses = 1;
        else if (previousPlan && designPlanBlocker({ ...next, next_action: previousPlan, confirmation: null }, latest.current) === null) {
          next.next_action = previousPlan; armed = true;
          replaced = `No pude prepararlo con tu respuesta. El último plan que tengo es: «${firstSentence(previousPlan.instruction, 200)}». Pulsa «${designActionLabel(previousPlan)}» o responde «sí» para crearlo.`;
        } else replaced = designBlockerText({ reason: 'none' });
      }
      // Step 9: arm a generation plan that nothing blocks.
      if (armed === undefined) armed = !resolvingCopy && generation && (!needsResolvedCopy(nextAction.kind) || next.copy.status !== 'pending') && !questions.length;
      next.confirmation = armed ? { context_key: key() } : null;
      // Step 11 (decided here, dispatched after saving).
      execute = opts.execute && nextAction.intent === 'requested' && generation && !resolvingCopy && !!next.confirmation
        && designPlanBlocker(next, latest.current) === null;
      const blocker = designPlanBlocker(next, latest.current);
      // Step 8: a blocked plan or question repeated after an insistence is replaced by its reason.
      if (!replaced && !resolvingCopy && strict && generation && !execute && !degraded && blocker && blocker.reason !== 'none'
        && (samePlan(prev, nextAction) || !!sentQuestion && confirmationTokens(questions[0] ?? '').join(' ') === confirmationTokens(sentQuestion).join(' ')
          || (!questions.length || questions[0] === sentQuestion) && needsResolvedCopy(nextAction.kind) && next.copy.status === 'pending')) replaced = designBlockerText(blocker);
      // Step 10: nothing claims to be done unless it runs now.
      if (!replaced && !execute && CLAIMS_DONE.test(modelText)) {
        if (blocker === null && next.confirmation) replaced = `Tengo el plan: ${firstSentence(understanding.resolved_instruction, 200).replace(/[.!?]+$/, '')}. Aún no lo he creado; responde «sí» o pulsa «${designActionLabel(next.next_action)}».`;
        else if (blocker && ['copy', 'question', 'stale'].includes(blocker.reason)) replaced = designBlockerText(blocker);
      }
      const armedOnly = !execute && !opts.execute && nextAction.intent === 'requested' && generation && !!next.confirmation
        ? `\n\nPulsa «${designActionLabel(next.next_action)}» para hacerlo.` : '';
      const text = (replaced || (promoted && execute ? 'Lo creo ahora con el plan que ya te mostré.' : modelText) + added) + degraded + (replaced ? '' : armedOnly) + referenceNotice;
      next.messages.push({ id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant', text: text.slice(0, 16000) });
      // A short spec per uploaded reference, generated once per image hash and kept with the conversation.
      if (flags?.prompt_base) for (const item of understanding.references) {
        const reference = next.references.find(candidate => candidate.id === item.reference_id);
        if (!reference || reference.role === 'content_source' || referencePromptOf(next, reference.sha256) || !item.instruction.trim()) continue;
        if (Object.keys(next.reference_prompts ?? {}).length >= 12) break;
        next.reference_prompts = { ...next.reference_prompts, [reference.sha256]: { text: item.instruction.trim().slice(0, 300) } };
      }
      if (nextMisses) next.affirmation_misses = nextMisses; else delete next.affirmation_misses;
      return next;
    });
    if (execute) await executeArmedPlan(life, { turnId: pending.turn_id });
  }
  /** Runs the armed plan once. With `userText` it records that message in a new turn;
   * without it, the plan runs in the given turn (same-turn execution of «requested»). */
  async function executeArmedPlan(life: Life, input: { userText?: string; turnId?: string }, onSaved?: () => void) {
    await assertCurrent(life); await assertRemoteRevision(life); await syncBrand(life);
    const value = current(life);
    if (!canConfirmDesign(value, latest.current)) throw Error('El contexto cambió. Pide actualizar la propuesta antes de crear el diseño.');
    const userText = input.userText, action = structuredClone(value.next_action!);
    const turnId = userText !== undefined ? crypto.randomUUID() : input.turnId ?? crypto.randomUUID();
    await save(life, state => ({ ...state, confirmation: null, ...(userText !== undefined ? { messages: [...state.messages,
      { id: `user:${turnId}`, turn_id: turnId, role: 'user' as const, text: userText }] } : {}) }));
    onSaved?.();
    try { await executeAction(life, action, turnId); }
    catch (problem) {
      const now = current(life);
      // A failed preflight has not spent the approval. Never re-arm after a
      // dispatch (including an uncertain or definitively failed generation).
      if (active(life) && !now.pending && now.completed_action_ids.length === value.completed_action_ids.length
        && designConfirmationKey(now, latest.current) === value.confirmation!.context_key) {
        await save(life, before => ({ ...before, confirmation: value.confirmation })).catch(() => {});
      }
      throw problem;
    }
  }
  /** Answers without the planner: saves the user's message and the concrete reason in one turn. */
  async function replyLocally(life: Life, userText: string, text: string, onSaved?: () => void) {
    if (current(life).messages.length > 198) throw Error('conversation_message_limit');
    const turnId = crypto.randomUUID();
    await save(life, value => ({ ...value, messages: [...value.messages, { id: `user:${turnId}`, turn_id: turnId, role: 'user' as const, text: userText },
      { id: `assistant:local:${crypto.randomUUID()}`, turn_id: turnId, role: 'assistant' as const, text }] }));
    onSaved?.();
  }
  async function sendMessage(life: Life, message: string, onSaved?: () => void, resolvingCopy = false,
    inspection?: { round: number; turnId: string; execute: boolean; phase?: 'clarification' | 'confirmation' }) {
    if (!message.trim() || message.length > 6000) throw Error('Escribe un mensaje de hasta 6000 caracteres.');
    await assertCurrent(life); await syncBrand(life);
    if (!resolvingCopy && !inspection && isDesignConfirmation(message)) {
      // A tolerant affirmative runs the armed plan without the planner; a stale or busy plan
      // gets its reason locally. Copy, questions or no plan go to the planner (it may be an answer).
      const blocker = designPlanBlocker(current(life), latest.current);
      if (blocker === null && current(life).confirmation) { await executeArmedPlan(life, { userText: message }, onSaved); return; }
      if (blocker?.reason === 'stale' || blocker?.reason === 'busy') { await replyLocally(life, message, designBlockerText(blocker), onSaved); return; }
    }
    if (current(life).messages.length > 198) throw Error('conversation_message_limit');
    if (current(life).completed_action_ids.length >= 200) throw Error('conversation_action_limit');
    const capabilities = await plannerRef.current.capabilities?.(); await assertCurrent(life);
    if (capabilities === null) throw Error('La conversación de diseño no está habilitada. Revisa la configuración del servidor.');
    if (capabilities?.supports_conversation_actions !== 1) throw Error('Actualiza el servidor para activar la conversación unificada de diseño.');
    const uploaded = await references(life), value = current(life), selected = selectedOf(value);
    let deck = presentationContext(value);
    const ids = value.inspected_slide_ids?.filter(id => deck?.slides.some(slide => slide.id === id)) ?? [];
    if (deck && ids.length) deck = await inspectPresentation(life, ids, capabilities.supports_visual_context === true);
    // Base controls choose the source for this turn without changing the user's
    // selected preview/history. Fresh and original designs do not inherit an old generated image.
    let selectedImage = imageForBase(value, latest.current);
    const canvas = getSlideDimensions(latest.current.slide.html), visualRefs: DesignReference[] = uploaded.map(item => item.reference);
    const { format } = latest.current;
    let actions: ConversationActionKind[] = ['discuss', 'generate_image', 'create_html', 'explore_ideas'];
    if (deck) actions.push('inspect_slides');
    const selectedHtml = selected?.kind === 'html' && viewRef.current !== 'history' && same(selected.target, value.target)
      && !selected.composition?.unresolved_slots.length;
    // «Esta versión» without a usable HTML version falls back to the slide itself.
    const usableVersion = selectedHtml || format === 'image' && selectedImage?.kind === 'image';
    const base = latest.current.base === 'version' && !usableVersion ? 'current' : latest.current.base;
    // «Diseño de la diapositiva»: the slide's own HTML is ALWAYS the base, never a generated version (deterministic).
    const slideBase = base === 'current' && (format === 'html' || format === 'image' && !selectedImage);
    // «Esta versión»: keep adjusting the selected generated HTML version.
    const versionBase = (format === 'html' || format === 'image') && base === 'version' && selectedHtml;
    const hasHtml = base !== 'new' && base !== 'deck'
      && (slideBase || (base === 'version' ? versionBase : selectedHtml || !selected && viewRef.current === 'html'));
    const slideHtml = latest.current.slide.html;
    const baseHtml = !slideBase && selectedHtml && selected?.kind === 'html' ? selected.proposal.html : slideHtml;
    const editableElements = !resolvingCopy && format !== 'image' && hasHtml && typeof DOMParser !== 'undefined'
      ? buildDesignElementCatalog(baseHtml) : [];
    const editableHash = editableElements.length ? await designEditableHtmlHash(baseHtml) : undefined;
    await assertCurrent(life);
    const hasCaptureSlot = format === 'html' || !selectedImage || visualRefs.length < 3;
    const captureHtml = hasHtml ? baseHtml : format === 'html' && base === 'deck' ? latest.current.deckBaseHtml : undefined;
    const inspectionReference = deck?.inspected_slides?.some(slide => slide.reference_id) ? life.inspection?.reference : undefined;
    if (inspectionReference) visualRefs.push(inspectionReference);
    const capture = captureHtml && !resolvingCopy && hasCaptureSlot && visualRefs.length < 4 && capabilities.supports_visual_context === true
      ? await htmlCapture(life, captureHtml) : undefined;
    if (capture) visualRefs.push(capture);
    // Keep all explicit references and the active HTML capture within the planner's
    // four-image contract. A composition's old source image is secondary here.
    if (selectedImage?.kind === 'image' && visualRefs.length < 4) visualRefs.push({ ...selectedImage.asset,
      reference_id: `image:${selectedImage.asset.asset_id}:${selectedImage.asset.version_id}`, mime_type: 'image/png', roles: ['object_reference', 'layout_reference'] });
    else selectedImage = undefined;
    const rememberedAsset = value.design_source?.source.kind === 'asset' ? value.design_source.source.asset : undefined;
    if (rememberedAsset && visualRefs.length < 4 && value.versions.some(version => version.kind === 'image' && sameConversationAsset(version.asset, rememberedAsset))
      && !visualRefs.some(reference => sameConversationAsset(reference, rememberedAsset))) {
      visualRefs.push({ ...rememberedAsset, reference_id: `image:${rememberedAsset.asset_id}:${rememberedAsset.version_id}`,
        mime_type: 'image/png', roles: ['layout_reference', 'image_style_reference'] });
    }
    if (selectedImage?.kind === 'image') actions.push('edit_image', 'convert_image_to_html');
    if (hasHtml) actions.push('refine_html');
    if (editableElements.length) actions.push('edit_elements');
    const excluded: ConversationActionKind[] = format === 'html' ? ['generate_image', 'edit_image']
      : format === 'image' ? ['create_html', 'refine_html', 'convert_image_to_html'] : [];
    // Adapting an existing design never offers «create from scratch», which would copy the reference's look instead.
    if (slideBase || versionBase) excluded.push('create_html');
    actions = actions.filter(kind => !excluded.includes(kind));
    const showSlide = versionBase && selected?.kind === 'html' && selected.proposal.html !== slideHtml;
    const deckStyle = structuredClone(latest.current.deckStyle ?? []);
    if (base === 'deck' && capture && deckStyle.length) deckStyle[0].summary = (`Captura reducida de estilo de la presentación: referencia ${capture.reference_id}. `
      + `Corresponde a este ejemplo; no es la diapositiva actual.\n${deckStyle[0].summary}`).slice(0, 4000);
    const actionId = crypto.randomUUID(), turnId = inspection?.turnId ?? crypto.randomUUID(), destination = latest.current.destination, waiting = value.next_action;
    // Taken before the save clears the confirmation; an inspection round keeps the original turn's phase.
    const sentPhase = inspection?.phase ?? (canConfirmDesign(value, latest.current) ? 'confirmation' as const : 'clarification' as const);
    const sentKey = value.confirmation?.context_key;
    const flags = latest.current.fromExisting;
    // The spec always arrives: wait for the measurement (max. 8 s) instead of sending it empty.
    const styleSpec = (flags?.ficha_estricta && format === 'html' && base !== 'new' ? await latest.current.styleSpecReady?.().catch(() => '') : '')
      || latest.current.styleSpec;
    if (flags?.ficha_estricta) await assertCurrent(life);
    const referenceNotes = flags?.prompt_base && !resolvingCopy ? value.references.flatMap(reference => {
      const note = referencePromptOf(value, reference.sha256);
      return note && visualRefs.some(item => item.reference_id === reference.id) ? [{ reference_id: reference.id, note: note.slice(0, 1500) }] : [];
    }) : undefined;
    const projectCopy = (copy: DesignCopy) => ({ ...copy, source_reference_ids: copy.source_reference_ids.filter(id => visualRefs.some(ref => ref.reference_id === id)) });
    const previous = value.understanding ? resolveConversationReferenceUse(value.references, value.understanding, '').understanding : null;
    const previousUnderstanding = previous ? { ...previous, copy: projectCopy(previous.copy),
      references: previous.references.filter(ref => visualRefs.some(item => item.reference_id === ref.reference_id)) } : null;
    const request: ExplorationRequest = fitConversationPresentationRequest({ request_key: actionId, kind: 'discussion', scope: 'full_design', message,
      history: value.messages.slice(-20).map(({ role, text }) => ({ role, text })),
      context: { actor_id: life.actor, business_id: latest.current.businessId, brand_id: designSurfaceBrand(destination), project_id: latest.current.documentId,
        session_id: withDesignConversationSession(designSurfaceSessionId(latest.current.documentId, latest.current.slide.id, 'full_design', destination),
          designConversationSessionToken(life.session, value.session_generation ?? 1)),
        workspace: designSurfaceWorkspace(destination), interaction_mode: 'execute_change', target: designSurfaceTarget(latest.current.documentId, latest.current.slide, destination),
        instruction: fullDesignLocalInstruction(message, canvas, null) + (value.brand ? `\nIdentidad de marca: ${JSON.stringify(value.brand)}` : ''),
        immutable_elements: value.copy.status === 'pending' ? ['Pendiente de resolver el texto literal del diseño. Las indicaciones no son texto para imprimir.', `Lienzo completo: ${canvas.width}×${canvas.height}.`]
          : fullDesignImmutables(value.copy.text, canvas, destination, value.copy.status === 'none' ? 'none' : 'literal'), references: visualRefs },
      design_brief: { copy: projectCopy(value.copy), brand: value.brand ? designBrandExplorationContext(value.brand, designSurfaceBrand(destination)) : null,
        selected_instruction: value.understanding?.resolved_instruction ?? '', preserve: value.understanding?.preserve ?? [],
        ...(previousUnderstanding ? { previous_understanding: previousUnderstanding } : {}) },
      conversation: { schema_version: 1, supports_design_source: 1, supports_structural_edits: 1, canvas, surface: hasHtml ? 'html' : selectedImage ? 'image' : 'empty',
        ...(value.design_source ? { design_source: value.design_source } : {}),
        ...(editableHash ? { editable_elements: editableElements, editable_html_hash: editableHash,
          editable_assets: value.brand?.logo_url ? [{ asset_id: 'brand-logo', label: `Logo de ${value.brand.name}` }] : [] } : {}),
        selected_image: selectedImage?.kind === 'image' ? selectedImage.asset : null, available_actions: resolvingCopy ? ['discuss'] : actions,
        // The action left waiting for this answer, so a reply such as «sí» or «HTML» resumes it instead of asking again.
        ...(!resolvingCopy && waiting && isDesignGeneration(waiting.kind) ? { pending_action: {
          kind: waiting.kind, instruction: waiting.instruction, questions: value.understanding?.pending_questions ?? [],
          ...(waiting.design_source ? { design_source: waiting.design_source } : {}),
          ...(waiting.rewrite ? { rewrite: true as const } : {}), phase: sentPhase } } : {}),
        ...(deck ? { presentation: deck } : {}),
        ...(!resolvingCopy && format ? { design_format: format } : {}),
        ...(!resolvingCopy && showSlide ? { slide_html: { revision: String(value.target.revision), summary: buildConversationHtmlSummary(slideHtml) } } : {}),
        ...(!resolvingCopy && format === 'html' && base ? { design_base: base } : {}),
        ...(!resolvingCopy && format === 'html' && base !== 'new' && styleSpec?.trim() ? { style_spec: styleSpec.slice(0, 4000) } : {}),
        ...(!resolvingCopy && flags && format === 'html' ? { supports_style_lock: 1 as const } : {}),
        ...(referenceNotes ? { reference_notes: referenceNotes } : {}),
        ...(!resolvingCopy && format === 'html' && base === 'deck' && deckStyle.length
          ? { deck_style: { slides: deckStyle } } : {}),
        ...(hasHtml ? { current_html: { revision: String(value.target.revision),
          summary: conversationVisualSummary(buildConversationHtmlSummary(baseHtml), capture?.reference_id
            ?? (life.inspection?.capturedIds.includes(latest.current.slide.id) ? inspectionReference?.reference_id : undefined)) } } : {}) } },
      65536, value.messages.length <= 20);
    await save(life, before => beginConversationAction({ ...before, confirmation: null,
      ...(latest.current.format && latest.current.base ? { preferences: { format: latest.current.format, base: latest.current.base } } : {}) },
      { action_id: actionId, turn_id: turnId, kind: 'understand', phase: 'prepared',
      epoch: before.epoch, target: before.target, request: { kind: 'understand', request } }, inspection ? undefined
      : { id: `user:${actionId}`, turn_id: turnId, role: 'user', text: message }));
    onSaved?.();
    await save(life, before => markConversationAction(before, actionId, 'dispatched'));
    try { await assertCurrent(life); life.planning = actionId;
      const result = await plannerRef.current.plan(request).finally(() => { if (life.planning === actionId) life.planning = undefined; });
      await acceptUnderstanding(life, result, true, inspection?.round, { execute: inspection ? inspection.execute : true, sentKey }); }
    catch (problem) {
      if (!await finishPlanningFailure(life, actionId, problem) && active(life) && current(life).pending?.action_id === actionId)
        await save(life, before => markConversationAction(before, actionId, 'uncertain'));
      throw problem;
    }
  }

  async function waitImage(life: Life, operation: DesignOperation) {
    const epoch = current(life).epoch;
    for (let attempt = 0; attempt < 90; attempt++) {
      await assertCurrent(life, epoch); const response = await latest.current.service.client.read(latest.current.businessId); await assertCurrent(life, epoch);
      life.generation = presentationGenerationCapabilities(response.generation, latest.current.service.simulation, response.state); setGeneration(life.generation);
      const result = presentationLibraryResults(response.state, latest.current.businessId).find(item => item.job.operation_key === operation.operation_key);
      if (result) {
        const pending = current(life).pending;
        if (pending?.action_id !== operation.operation_key) throw Error('conversation_pending_unresolved');
        await save(life, value => ({ ...completeConversationAction(value, operation.operation_key, {
          version: { id: crypto.randomUUID(), turn_id: pending.turn_id, ...(value.selected_version_id ? { parent_id: value.selected_version_id } : {}),
            ...(completedDesignSource(value) ? { design_source: completedDesignSource(value) } : {}),
            target: pending.target, kind: 'image', asset: result.asset.identity }, next_action: null,
          message: { id: `assistant:${operation.operation_key}`, turn_id: pending.turn_id, role: 'assistant', text: 'La imagen está lista. Puedes pedirme ajustes y compararla antes de aprobarla.' },
        }), design_source: completedDesignSource(value) ?? null, preferences: { format: latest.current.format ?? 'image', base: 'version' as const } }));
        show('image'); void refreshImage(life, result, true); return;
      }
      const job = response.state.jobs.jobs.find(item => item.operation_key === operation.operation_key);
      if (job?.calls.every(call => ['failed', 'cancelled'].includes(call.state))) {
        await save(life, value => completeConversationAction(value, operation.operation_key, { message: { id: `assistant:${operation.operation_key}`,
          turn_id: value.pending!.turn_id, role: 'assistant', text: 'La generación terminó sin una imagen. La solicitud quedó registrada; puedes ajustar el encargo y volver a intentarlo.' }, next_action: null }));
        return;
      }
      if (!job || job.calls.some(call => call.state === 'uncertain')) break;
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    throw Error('conversation_outcome_unknown');
  }
  async function dispatchImage(life: Life, operation: DesignOperation, turnId: string) {
    if (current(life).versions.length >= 20) throw Error('conversation_version_limit');
    if (current(life).messages.length >= 200) throw Error('conversation_message_limit');
    if (current(life).completed_action_ids.length >= 200) throw Error('conversation_action_limit');
    await save(life, value => beginConversationAction(value, { action_id: operation.operation_key, turn_id: turnId, kind: 'image', phase: 'prepared',
      target: value.target, epoch: value.epoch, request: { kind: 'image', operation } }));
    await save(life, value => markConversationAction(value, operation.operation_key, 'dispatched'));
    try { await assertCurrent(life); await latest.current.service.client.command(latest.current.businessId, { kind: 'enqueue', operation }); await waitImage(life, operation); }
    catch (problem) { if (active(life) && current(life).pending?.action_id === operation.operation_key) await save(life, value => markConversationAction(value, operation.operation_key, 'uncertain')); throw problem; }
  }
  function htmlContext(value: DesignConversationState, instruction: string, action?: ConversationNextAction) {
    const flags = latest.current.fromExisting;
    // References travel only in the turn whose plan cites them or whose message names them.
    const inTurn = flags?.referencias_por_turno && action
      ? new Set([...action.reference_ids, ...namedReferences(lastInstruction(value), value.references)]) : undefined;
    const selected = inTurn ? value.references.filter(reference => inTurn.has(reference.id)) : value.references;
    const sources = selected.map(reference => ({ id: reference.id, role: reference.role, chat_position: value.references.indexOf(reference) + 1,
      ...(flags?.prompt_base && referencePromptOf(value, reference.sha256) ? { ficha: referencePromptOf(value, reference.sha256) } : {}) }));
    const referenceUse = sources.length ? `\nFunciones de las referencias seleccionadas (datos): ${JSON.stringify(sources)}. Identifica cada fuente por id y función; chat_position sólo describe el adjunto original, no el orden de las imágenes enviadas ahora. Las fuentes content_source aportan sólo el texto resuelto; no copies su apariencia. El diseño base y la versión seleccionada son contexto interno, no otros adjuntos.` : '';
    return { instruction: instruction + referenceUse + (value.brand ? `\nIdentidad de marca: ${JSON.stringify(value.brand)}` : ''), copy: value.copy.text,
      copyMode: value.copy.status === 'none' ? 'none' as const : 'literal' as const,
      references: conversationHtmlReferences(selected, value.copy, value.understanding), designBase: latest.current.base };
  }
  /** Per-request turn data for the HTML panel: unlock, request checklist and correction. */
  function htmlTurn(life: Life, value: DesignConversationState): NonNullable<Parameters<SlideGeneratorController['refine']>[0]['turn']> | undefined {
    const flags = latest.current.fromExisting;
    if (!flags) return undefined;
    const request = lastInstruction(value), correction = life.correction;
    life.correction = undefined;
    const unlock = value.understanding?.unlock;
    return { request,
      ...(flags.candado_estilo && unlock ? { unlock: [...new Set([...unlock, ...inferStyleUnlocks(request)])] } : {}),
      ...(flags.revision_pedido && !correction && requestChecklist(request).length ? { checklist: requestChecklist(request) } : {}),
      ...(flags.correccion_acotada && correction ? { correction } : {}) };
  }
  function completedDesignSource(value: DesignConversationState) {
    return value.next_action?.design_source ?? (latest.current.base === 'version' && value.next_action?.from_slide !== true
      && ['create_html', 'refine_html', 'edit_image'].includes(value.next_action?.kind ?? '') ? selectedOf(value)?.design_source : undefined);
  }
  function sourceSlides() {
    // Always use the original slide indexed by its document revision. Generated
    // versions have separate immutable identities and are never that source.
    return [...(latest.current.deckSlides ?? []).filter(slide => slide.id !== latest.current.slide.id), latest.current.slide];
  }
  async function designSourceContext(life: Life, designSource: ConversationDesignSource) {
    const source = resolveConversationDesignSource(designSource, sourceSlides(), current(life).references);
    let sourceReference = source.reference, failure: CaptureFailure | undefined;
    if (source.slide) {
      const html = source.slide.html;
      if (life.sourceCapture?.html === html) sourceReference = life.sourceCapture.reference;
      else if (life.capture?.html === html) sourceReference = life.capture.prepared;
      else {
        // The capture is optional evidence: the generator already receives the source HTML.
        // Retry once only when the renderer was slow or unavailable; never cache a failure.
        for (let attempt = 1; attempt <= 2; attempt++) {
          try {
            sourceReference = await captureConversationHtml(html, getSlideDimensions(html),
              { businessId: latest.current.businessId, expectedActorId: life.actor }, { timeoutMs: 40000 });
            failure = undefined; break;
          } catch (problem) {
            await assertCurrent(life); failure = captureFailureOf(problem);
            if (!failure) throw problem;
            if (failure !== 'timeout' && failure !== 'unavailable') break;
          }
        }
        await assertCurrent(life);
        if (!failure) life.sourceCapture = { html, reference: sourceReference! };
      }
    } else if (source.asset) {
      const blob = await latest.current.service.client.asset(source.asset); await assertCurrent(life);
      sourceReference = await preparePresentationReference(new File([blob], 'Imagen elegida.png', { type: blob.type || 'image/png' }), 'layout_reference');
    }
    await assertCurrent(life);
    const context = { designSource, ...(source.slide ? { sourceSlide: structuredClone(source.slide) } : {}),
      ...(sourceReference ? { sourceReference: { ...sourceReference, role: designSource.mode === 'style_only' ? 'image_style_reference' as const : 'layout_reference' as const } } : {}) };
    return failure ? { context, failure, notice: `Seguí sin la imagen de la fuente: ${captureFailureText(failure)}.` } : { context };
  }
  function savedHtmlContext(value: DesignConversationState, proposal: HtmlDesignProposal) {
    return { ...htmlContext(value, value.understanding?.resolved_instruction || 'Revisa la propuesta guardada con las referencias y el contenido acordado.'),
      // Selecting a completed version resumes that document. Provenance stays
      // on the conversation version, never as a newly selected generator source.
      designSource: null,
      copyMode: value.copy.status === 'pending' ? 'instruction' as const : value.copy.status === 'none' ? 'none' as const : 'literal' as const,
      designBase: 'version' as const, proposal };
  }
  async function finishHtml(life: Life, proposal: HtmlDesignProposal, composition?: { request_key: string; source: DesignToHtmlProposal['source']; unresolved_slots: string[] }, notice?: string) {
    const pending = current(life).pending; if (!pending || pending.kind !== 'html') throw Error('conversation_pending_unresolved');
    assertHtmlDesignTarget(proposal, pending.target); await assertCurrent(life, pending.epoch);
    const text = composition?.unresolved_slots.length
      ? 'La estructura HTML está lista. Completa las piezas señaladas en el editor antes de aplicarla.'
      : composition ? 'El HTML está listo para revisarlo y editarlo. Puedes pedirme otro ajuste o aplicarlo cuando quieras.'
      : [describeVisualReview(proposal.visualReview), describeStyleLock(proposal.styleLock), ...(proposal.notices ?? [])].filter(Boolean).join(' ');
    await save(life, value => ({ ...completeConversationAction(value, pending.action_id, { version: { id: crypto.randomUUID(), turn_id: pending.turn_id,
      ...(value.selected_version_id ? { parent_id: value.selected_version_id } : {}), target: proposal.target, kind: 'html', proposal: { ...proposal, intent: 'replace' },
      ...(completedDesignSource(value) ? { design_source: completedDesignSource(value) } : {}),
      ...(composition ? { composition } : {}) }, next_action: null,
      message: { id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant', text: notice ? `${notice} ${text}` : text } }),
      design_source: completedDesignSource(value) ?? null,
      preferences: { format: latest.current.format ?? 'html', base: 'version' as const } }));
    show(composition ? 'composition' : 'html');
  }
  function fromComposition(proposal: DesignToHtmlProposal): HtmlDesignProposal {
    return { html: proposal.html, mounted: proposal.mountedAssets, intent: 'replace', canvas: proposal.canvas,
      target: { document: proposal.target.document_id, slide: proposal.target.slide_id ?? proposal.target.page_id ?? '', revision: Number(proposal.target.revision) } };
  }
  async function executeAction(life: Life, action: ConversationNextAction, turnId: string = crypto.randomUUID()) {
    await assertCurrent(life); const value = current(life);
    if (value.pending) throw Error('conversation_pending_unresolved');
    if (needsResolvedCopy(action.kind) && value.copy.status === 'pending' || value.understanding?.pending_questions.length) throw Error('Primero resolvamos el texto y las preguntas pendientes.');
    if (!isDesignGeneration(action.kind)) return;
    if (action.kind === 'refine_html' && viewRef.current === 'history') throw Error('Selecciona la versión actual para continuar editando. Esta versión del historial se conserva para comparar.');
    if (value.versions.length >= 20) throw Error('conversation_version_limit');
    if (value.messages.length >= 200) throw Error('conversation_message_limit');
    if (value.completed_action_ids.length >= 200) throw Error('conversation_action_limit');
    const input = latest.current;
    if (action.kind === 'edit_elements') {
      if (!input.htmlController.current || input.htmlState?.current && (!input.htmlState.current.ready || input.htmlState.current.busy))
        throw Error('El editor está cargando. Inténtalo cuando esté listo.');
      if (input.htmlState?.current && input.htmlState.current.status !== 'ready')
        throw Error('Recupera o descarta la solicitud pendiente del editor antes de preparar otro ajuste.');
      const selected = selectedOf(value), slide = workingSlide(value);
      if (viewRef.current === 'history' || selected?.kind === 'html' && selected.composition?.unresolved_slots.length)
        throw Error('Selecciona una versión editable para aplicar este ajuste.');
      if (!action.element_edits?.length || await designEditableHtmlHash(slide.html) !== action.element_html_hash) {
        await save(life, before => ({ ...before, next_action: null, confirmation: null }));
        throw Error('El diseño cambió desde la propuesta. Pide actualizar el ajuste antes de aplicarlo.');
      }
      const assets = value.brand?.logo_url ? { 'brand-logo': value.brand.logo_url } : {};
      const summary = structuralSummary(action.element_edits);
      // When the direct copy does not fit (no paid call spent yet), regenerate from the base without asking.
      const escalate = async (editedHtml: string | undefined, reason: string) => {
        const copy = editedHtml ? conversationCopyAfterEdit(value.copy, slide.html, editedHtml) : value.copy;
        if (copy.status !== 'pending' && input.format === 'html' && workingSlide(value).html.trim() && input.htmlController.current) {
          await save(life, state => ({ ...state, copy, understanding: state.understanding ? { ...state.understanding, copy } : null,
            messages: [...state.messages, { id: `assistant:escalate:${crypto.randomUUID()}`, turn_id: turnId, role: 'assistant' as const,
              text: 'La copia directa no cabía bien en la diapositiva; la rehago desde el diseño actual conservando su estilo.' }] }));
          await executeAction(life, { kind: 'refine_html', intent: 'requested', rewrite: true, instruction: `${action.instruction}\nResultado esperado: ${summary}.`,
            reason: action.reason, reference_ids: action.reference_ids }, turnId);
          return;
        }
        throw Error(`No pude hacer este cambio de forma directa: ${reason}. Pide «rehazla» para regenerarla desde el diseño actual.`);
      };
      let edited: ReturnType<typeof applyDesignElementEdits>;
      try { edited = applyDesignElementEdits(slide.html, action.element_edits, { assets }); }
      catch (problem) {
        if (problem instanceof DesignElementEditError && problem.code === 'element_reflow_root') { await escalate(undefined, problem.message.replace(/\.$/, '').toLowerCase()); return; }
        throw problem;
      }
      const editedHtml = detachUnverifiedMountedImages(slide.html, edited.html);
      // Structural edits are checked on a real render (no AI). Repeated mounted icons may lose
      // their verified mount identity in detachUnverifiedMountedImages; their pixels remain.
      const fit = edited.structural ? await structuralEditFits(slide.html, editedHtml, getSlideDimensions(slide.html),
        { businessId: input.businessId, expectedActorId: life.actor }, structuralBase) : null;
      if (fit) await assertCurrent(life);
      if (fit === 'overflow') { await escalate(editedHtml, 'el resultado no cabía en la diapositiva'); return; }
      const selectedProposal = input.base !== 'current' && selected?.kind === 'html' ? selected.proposal : undefined;
      const editSource = selectedProposal && selected?.kind === 'html' ? selected.design_source : undefined;
      const proposal: HtmlDesignProposal = { ...(selectedProposal ?? {}), html: editedHtml, target: value.target,
        canvas: selectedProposal?.canvas ?? getSlideDimensions(slide.html), mounted: reconcileMountedAssets(slide, editedHtml), intent: 'replace', pending: undefined,
        visualReview: { status: 'needs_review', repairs: 0, issues: [fit === 'unverified' ? 'No pude comprobar que todo quepa; revísalo antes de aplicar.'
          : 'Revisa el ajuste puntual antes de aplicar el diseño.'] } };
      const done = !fit ? 'El ajuste está listo. Puedes revisarlo, seguir editando o aplicarlo a la diapositiva.'
        : fit === 'fits' ? `Listo: ${summary}. Puedes revisarlo, seguir editando o aplicarlo a la diapositiva.`
          : `Listo: ${summary}. No pude comprobar que todo quepa; revísalo antes de aplicarlo.`;
      const copy = conversationCopyAfterEdit(value.copy, slide.html, editedHtml), versionId = crypto.randomUUID();
      await assertCurrent(life); await assertRemoteRevision(life);
      await save(life, before => ({ ...before, versions: [...before.versions, { id: versionId, turn_id: turnId,
        ...(before.selected_version_id ? { parent_id: before.selected_version_id } : {}), target: before.target, kind: 'html', proposal,
        ...(editSource ? { design_source: editSource } : {}) }], selected_version_id: versionId, design_source: editSource ?? null,
        copy, understanding: before.understanding ? { ...before.understanding, copy } : null, next_action: null, confirmation: null,
        preferences: { format: 'html', base: 'version' }, messages: [...before.messages, { id: `assistant:${versionId}`, turn_id: turnId,
          role: 'assistant', text: done }] }));
      show('html');
      await input.htmlController.current?.updateContext(savedHtmlContext(current(life), proposal));
      return;
    }
    // The source records where this design began. Once a version exists, its
    // exact HTML (including manual edits) is the working document. Reopening an
    // older source must not be a prerequisite for continuing that document.
    const selectedHtml = selectedOf(value);
    const continuingHtml = (action.kind === 'create_html' || action.kind === 'refine_html') && input.base === 'version'
      && selectedHtml?.kind === 'html' && same(selectedHtml.target, value.target) && action.from_slide !== true
      && (!action.design_source || same(selectedHtml.design_source, action.design_source));
    const sourceResult = action.design_source && !continuingHtml ? await designSourceContext(life, action.design_source) : undefined;
    // Only the context reaches the generator; the notice is for the final message.
    const sourceContext = sourceResult?.context, sourceNotice = sourceResult?.notice;
    if (action.kind === 'generate_image' || action.kind === 'edit_image') {
      // The image generator never receives the source HTML, so its capture is required.
      if (sourceResult?.failure)
        throw Error(`No pude capturar la diapositiva elegida como fuente (${captureFailureText(sourceResult.failure)}). Reintenta para conservar su apariencia.`);
      const visualReferences = conversationHtmlReferences(value.references, value.copy, value.understanding)
        .filter(reference => reference.id !== sourceContext?.sourceReference?.id);
      const uploaded = await references(life, visualReferences), response = await input.service.client.read(input.businessId); await assertCurrent(life);
      const generation = presentationGenerationCapabilities(response.generation, input.service.simulation, response.state);
      if (!generation) throw Error('server_generation_unavailable');
      if (sourceContext?.sourceReference) {
        const primary = await prepareConversationReferences({ client: input.service.client, actor: life.actor, business: input.businessId,
          document: input.documentId, slide: `design-source:${input.slide.id}`, references: [sourceContext.sourceReference],
          destination: input.destination, conversationSessionId: designConversationSessionToken(life.session, value.session_generation ?? 1),
          assertCurrent: () => assertCurrent(life) });
        uploaded.unshift(...primary);
      }
      const inspection = !sourceContext && value.inspected_slide_ids?.length && input.deckSlides?.length
        ? await inspectPresentation(life, value.inspected_slide_ids, true) : undefined;
      if (inspection?.inspected_slides?.some(slide => slide.reference_id) && life.inspection?.reference && life.inspection.version)
        uploaded.push({ reference: life.inspection.reference, version: life.inspection.version });
      const sourceAsset = action.design_source?.source.kind === 'asset' ? action.design_source.source.asset : undefined;
      const continuingSource = sourceContext && same(value.design_source, action.design_source) && input.base === 'version';
      const selected = !sourceContext || continuingSource || sourceAsset ? imageForBase(value, input) : undefined;
      const needsSelected = selected?.kind === 'image' && (action.kind === 'edit_image'
        || input.format === 'image' && input.base === 'version'
        || action.reference_ids.includes(`image:${selected.asset.asset_id}:${selected.asset.version_id}`));
      const selectedImage = needsSelected && selected?.kind === 'image' ? await readConversationImage(input.service.client, input.businessId, selected.asset) : undefined;
      // A new design based on selected pixels also uses the edit adapter: originals can exceed the 1024px extra-reference limit.
      const base = continuingSource && selectedImage ? selectedImage
        : sourceAsset ? await readConversationImage(input.service.client, input.businessId, sourceAsset) : selectedImage;
      if (action.kind === 'edit_image' && !base) throw Error('Selecciona la imagen que quieres ajustar.');
      if (!sourceContext && !selected && input.format === 'image' && (input.base === 'current' || input.base === 'version')
        && !(uploaded.length >= (generation.max_references ?? 4) && life.inspection?.capturedIds.includes(input.slide.id))) {
        const chosen = selectedOf(value);
        const baseHtml = input.base === 'version' && chosen?.kind === 'html' && same(chosen.target, value.target)
          && !chosen.composition?.unresolved_slots.length ? chosen.proposal.html : input.slide.html;
        const capture = await htmlCapture(life, baseHtml); await assertCurrent(life);
        if (!capture || !life.capture?.version) throw Error('No se pudo obtener la captura del diseño base. Vuelve a intentarlo para conservar su apariencia.');
        uploaded.push({ reference: { ...capture, roles: ['layout_reference'] }, version: life.capture.version });
      }
      // The prompt of the Desaing version we build on (or the user's edited «Prompt usado»).
      const cited = base ?? selectedImage, flags = input.fromExisting;
      const citedVersion = cited ? value.versions.find(version => version.kind === 'image' && sameConversationAsset(version.asset, cited.asset.identity)) : undefined;
      const sourcePrompt = flags?.prompt_base && cited ? (citedVersion && value.version_prompts?.[citedVersion.id])
        || (cited.asset.provenance.kind === 'image_operation' ? cited.asset.provenance.effective_prompt : undefined) : undefined;
      const fichas = flags?.prompt_base ? visualReferences.flatMap(reference => referencePromptOf(value, reference.sha256)
        ? [`\nFicha de la referencia ${reference.id} (datos): ${referencePromptOf(value, reference.sha256)}`] : []).join('') : '';
      const operation = buildConversationImageOperation({ businessId: input.businessId, actorId: life.actor, documentId: input.documentId, slide: input.slide,
        destination: input.destination, ...(sourcePrompt ? { sourcePrompt } : {}), instruction: action.instruction + fichas
          + (action.design_source ? conversationDesignSourceInstruction(action.design_source)
            + (sourceContext?.sourceReference ? ` La referencia principal es ${sourceContext.sourceReference.id}.` : '') : '') + (inspection?.inspected_slides?.length
          ? `\nDiapositivas consultadas (datos de referencia, reutiliza sólo lo acordado): ${JSON.stringify(inspection.inspected_slides.map(slide => ({
            number: slide.number, title: slide.title, reference_id: slide.reference_id })))}. La lámina interna deck: muestra miniaturas numeradas; no las imprimas como collage en el resultado.` : ''),
        copy: value.copy, brand: value.brand, operationKey: crypto.randomUUID(),
        generation, settings: input.settings, references: uploaded, ...(base ? { base: base.asset } : {}), mode: 'execute_change',
        conversationSessionId: designConversationSessionToken(life.session, value.session_generation ?? 1) });
      if (action.design_source) resolveConversationDesignSource(action.design_source, sourceSlides(), current(life).references);
      await dispatchImage(life, operation, turnId); return;
    }
    let source: PresentationLibraryResult | null = null;
    const htmlInput = htmlContext(value, action.instruction, action);
    // Orientation or internal arrangement of a component: a rewrite from the spec, never a patch.
    if (input.fromExisting?.no_rehace && action.kind === 'refine_html' && !action.rewrite && !action.design_source
      && isOrientationChange(lastInstruction(value))) action = { ...action, rewrite: true };
    const turn = htmlTurn(life, value);
    const inspectionEvidence: Pick<Parameters<SlideGeneratorController['updateContext']>[0], 'inspectionReferences' | 'inspectionExamples'> = {
      inspectionReferences: [], inspectionExamples: [],
    };
    if (!sourceContext && !continuingHtml && value.inspected_slide_ids?.length && input.deckSlides?.length) {
      await inspectPresentation(life, value.inspected_slide_ids, true);
      inspectionEvidence.inspectionReferences = life.inspection?.prepared ? [life.inspection.prepared] : [];
      inspectionEvidence.inspectionExamples = buildConversationInspectionExamples(input.deckSlides, value.inspected_slide_ids, input.slide);
    }
    if (action.kind === 'convert_image_to_html') {
      const selected = imageOf(value);
      if (selected?.kind !== 'image') throw Error('Selecciona la imagen que quieres convertir a HTML.');
      source = await readConversationImage(input.service.client, input.businessId, selected.asset); await assertCurrent(life);
      if (source.call.state !== 'approved') { show('image'); throw Error('Aprueba esta imagen antes de convertirla a HTML.'); }
      if (!input.compositionController.current || input.compositionState?.current && (!input.compositionState.current.ready || input.compositionState.current.busy))
        throw Error('El editor está cargando. Inténtalo cuando esté listo.');
      if (input.compositionState?.current && !['draft', 'completed'].includes(input.compositionState.current.status))
        throw Error('Recupera la conversión pendiente en el editor antes de preparar otra.');
    } else {
      if (!input.htmlController.current || input.htmlState?.current && (!input.htmlState.current.ready || input.htmlState.current.busy))
        throw Error('El editor está cargando. Inténtalo cuando esté listo.');
      // No conversation action is pending here, so an unconfirmed HTML draft is an orphan of an earlier failure:
      // HTML generation keeps no server result to recover, release it instead of blocking every new request.
      if (input.htmlState?.current && input.htmlState.current.status !== 'ready') await input.htmlController.current.discardPending();
      const selected = selectedOf(value);
      if (selected?.kind === 'html' && selected.composition?.unresolved_slots.length) throw Error('Completa las piezas de esta composición antes de ajustar su HTML.');
      const image = imageOf(value);
      if (!sourceContext && image?.kind === 'image' && action.reference_ids.includes(`image:${image.asset.asset_id}:${image.asset.version_id}`)) {
        const blob = await input.service.client.asset(image.asset); await assertCurrent(life);
        const reference = await preparePresentationReference(new File([blob], 'Diseño seleccionado.png', { type: 'image/png' }), 'layout_reference');
        await assertCurrent(life);
        if (!htmlInput.references.some(item => item.sha256 === reference.sha256)) htmlInput.references.push(reference);
        if (htmlInput.references.length > 3) throw Error('El HTML admite tres imágenes de referencia. Retira una referencia para incluir este diseño.');
      }
    }
    const id = crypto.randomUUID();
    if (action.design_source && !continuingHtml) resolveConversationDesignSource(action.design_source, sourceSlides(), current(life).references);
    await save(life, state => beginConversationAction(state, { action_id: id, turn_id: turnId, kind: 'html', phase: 'prepared', target: state.target, epoch: state.epoch }));
    await save(life, state => markConversationAction(state, id, 'dispatched'));
    try {
      await assertCurrent(life);
      if (source) {
        show('composition'); const proposal = await input.compositionController.current!.create({ approved: true, asset: source.asset, copy: value.copy.text,
          copyMode: value.copy.status === 'none' ? 'no_text' : 'approved_text', instruction: action.instruction, replaceCompleted: true });
        await finishHtml(life, fromComposition(proposal), { request_key: proposal.requestKey, source: proposal.source, unresolved_slots: proposal.unresolvedSlots }, sourceNotice);
      } else {
        show('html'); const selected = selectedOf(value), fromSlide = (action.kind === 'refine_html' || action.kind === 'create_html')
          && !sourceContext && (action.from_slide === true || !!input.slide.html.trim()
            && (input.base === 'current' || input.base === 'version' && selected?.kind !== 'html'));
        const context = { ...htmlInput, ...inspectionEvidence, ...(selected?.kind === 'html' && !fromSlide ? { proposal: selected.proposal } : {}),
          ...(sourceContext ?? { designSource: null }),
          ...(fromSlide ? { fromCurrent: true, designBase: 'current' as const } : {}), ...(turn ? { turn } : {}) };
        const proposal = sourceContext ? await input.htmlController.current!.create({ ...context, proposal: undefined })
          : action.kind === 'refine_html' || continuingHtml || fromSlide ? await input.htmlController.current!.refine({ ...context, feedback: action.instruction, compare: true,
            ...(action.kind === 'refine_html' && action.rewrite ? { rewrite: true as const } : {}) })
            : await input.htmlController.current!.create(context);
        await finishHtml(life, proposal, undefined, sourceNotice);
      }
    } catch (problem) {
      if (active(life) && current(life).pending?.action_id === id) {
        const localRefusal = problem instanceof Error && ['html_unavailable', 'composition_source_required', 'composition_copy_count',
          'composition_upgrade_required', 'composition_approval_required'].includes(problem.message);
        const admissionRefusal = problem instanceof DesignServerClientError && ['html_quota_exceeded', 'html_previous_unresolved', 'server_html_expired',
          'server_feature_disabled', 'business_access_denied', 'business_write_denied', 'invalid_html_request', 'html_source_not_approved',
          'html_source_invalid', 'html_source_unavailable', 'server_policy_changed', 'html_request_too_large'].includes(problem.code);
        // A patch that failed after its retry already spent paid calls: ask once before a full rewrite.
        if (problem instanceof DesignHtmlRequestError && problem.definitive && problem.code === 'invalid_canvas_patch'
          && action.kind === 'refine_html' && !action.rewrite) {
          await save(life, state => {
            const next = completeConversationAction(state, id, { next_action: { ...action, rewrite: true, intent: 'suggested' }, message: {
              id: `assistant:${id}`, turn_id: state.pending!.turn_id, role: 'assistant',
              text: 'No pude aplicar el ajuste como cambio puntual. ¿Lo rehago completo desde el diseño actual, conservando su estilo?' } });
            return { ...next, confirmation: designPlanBlocker(next, latest.current) === null ? { context_key: designConfirmationKey(next, latest.current) } : null };
          });
          return;
        }
        if (isDefinitiveHtmlFailure(problem)) await save(life, state => completeConversationAction(state, id, { message: {
          id: `assistant:${id}`, turn_id: state.pending!.turn_id, role: 'assistant',
          text: `No se generó el HTML (${(problem as Error).message}). Tu diseño se conserva; puedes intentarlo de nuevo.` } }));
        else if (localRefusal || admissionRefusal) await save(life, state => completeConversationAction(state, id, { message: {
          id: `assistant:${id}`, turn_id: state.pending!.turn_id, role: 'assistant',
          text: 'No se generó otro HTML. Conservamos tu diseño; revisa la disponibilidad y el contexto del editor antes de continuar.' } }));
        else await save(life, state => markConversationAction(state, id, 'uncertain'));
      }
      throw problem;
    }
  }
  /** After a remount, read (never dispatch) the saved result of the request this browser
   * was waiting for. A recovered plan is armed, never executed, without the user. */
  async function resumeInterruptedPlanning(life: Life) {
    const pending = current(life).pending, planner = plannerRef.current;
    if (pending?.kind !== 'understand' || pending.request?.kind !== 'understand' || !planner.recover || !takeInterruptedPlan(pending.action_id)) return;
    const request = pending.request.request;
    setResuming(true);
    try {
      for (let attempt = 0; attempt < 20 && active(life); attempt++) {
        const found = await planner.recover(pending.action_id, request).catch(() => null);
        if (!active(life) || current(life).pending?.action_id !== pending.action_id) return;
        if (found) { await run(running => acceptUnderstanding(running, found, true), true); return; }
        await new Promise(resolve => setTimeout(resolve, 3000));
      }
    } finally { if (active(life)) setResuming(false); }
  }
  async function recoverAction(life: Life) {
    await loadConversation(life); if (!active(life)) return;
    await assertCurrent(life);
    const pending = current(life).pending;
    if (!pending) { await refreshImage(life); return; }
    if (pending.request?.kind === 'understand') {
      if (!plannerRef.current.recover) throw Error('No se puede recuperar esta conversación hasta actualizar el servidor.');
      try {
        let found = await plannerRef.current.recover(pending.action_id, pending.request.request); await assertCurrent(life, pending.epoch);
        if (!found) {
          if (pending.phase === 'prepared') await save(life, value => markConversationAction(value, pending.action_id, 'dispatched'));
          found = await plannerRef.current.plan(pending.request.request);
        }
        await acceptUnderstanding(life, found, true); return;
      } catch (problem) { await finishPlanningFailure(life, pending.action_id, problem); throw problem; }
    }
    if (pending.request?.kind === 'image') {
      const server = await latest.current.service.client.read(latest.current.businessId); await assertCurrent(life, pending.epoch);
      if (!server.state.jobs.jobs.some(job => job.operation_key === pending.action_id)) {
        if (pending.phase === 'prepared') await save(life, value => markConversationAction(value, pending.action_id, 'dispatched'));
        await latest.current.service.client.command(latest.current.businessId, { kind: 'enqueue', operation: pending.request.operation });
      }
      await waitImage(life, pending.request.operation); return;
    }
    if (pending.kind === 'html') {
      const action = current(life).next_action;
      if (action?.kind === 'convert_image_to_html') {
        const proposal = await latest.current.compositionController.current?.recover();
        const expected = imageOf(current(life));
        if (!proposal || expected?.kind !== 'image' || !sameConversationAsset(proposal.source, expected.asset)
          || current(life).versions.some(version => version.kind === 'html' && version.composition?.request_key === proposal.requestKey))
          throw Error('conversation_action_not_found');
        await finishHtml(life, fromComposition(proposal), { request_key: proposal.requestKey, source: proposal.source, unresolved_slots: proposal.unresolvedSlots });
      } else {
        const draft = await latest.current.htmlController.current?.recover();
        if (!draft?.proposal || draft.status !== 'ready' || current(life).versions.some(version => version.kind === 'html' && same(version.proposal, draft.proposal)))
          throw Error('conversation_action_not_found');
        await finishHtml(life, draft.proposal);
      }
    }
  }
  async function recordEdit(life: Life, proposal: HtmlDesignProposal, reason: string, composition?: { request_key: string; source: DesignToHtmlProposal['source']; unresolved_slots: string[] }) {
    if (!['edited', 'recovered'].includes(reason) || current(life).pending || viewRef.current === 'history') return;
    await assertCurrent(life); assertHtmlDesignTarget(proposal, current(life).target);
    const previous = selectedOf(current(life));
    // Embedded editors may reopen their own older drafts before this conversation finishes loading.
    const resumedHtml = latest.current.service.continuity && viewRef.current === 'html' && previous?.kind === 'html'
      && previous.composition && !previous.composition.unresolved_slots.length && !composition;
    if (previous?.kind !== 'html' || !!previous.composition !== !!composition && !resumedHtml
      || composition && previous.composition?.request_key !== composition.request_key) return;
    if (previous?.kind === 'html' && same(previous.proposal, proposal) && same(previous.composition, composition)) return;
    const copy = conversationCopyAfterEdit(current(life).copy, previous.proposal.html, proposal.html);
    await save(life, value => { const version: DesignConversationVersion = { id: crypto.randomUUID(), turn_id: crypto.randomUUID(),
      ...(value.selected_version_id ? { parent_id: value.selected_version_id } : {}), target: proposal.target, kind: 'html', proposal,
      ...(previous.design_source ? { design_source: previous.design_source } : {}),
      ...(composition ? { composition } : {}) }; return { ...value, versions: [...value.versions, version], selected_version_id: version.id,
        next_action: null, confirmation: null, copy,
        understanding: value.understanding ? { ...value.understanding, copy } : null,
        preferences: { format: latest.current.format ?? 'html', base: 'version' } }; });
  }
  return {
    state, ready: ready && lifeRef.current?.key === scopeKey(options, activeSession), busy, error, brand, generation, imagePreview, imagePreviewLoading, imageResult, view,
    /** Reading the saved answer of a request interrupted by a remount. */
    resuming,
    sessions, activeSession, sessionsReady, sessionsError,
    sessionToken: designConversationSessionToken(activeSession, state.session_generation ?? 1),
    selectSession: (id: DesignConversationSessionId) => run(async life => {
      await assertActor(life); assertSessionSwitchAvailable();
      if (!isDesignConversationSessionId(id)) throw Error('No se encontró esa sesión.');
      if (id === life.session) return;
      const found = await refreshSessions(life);
      if (!found.some(session => session.id === id)) throw Error('No se encontró esa sesión.');
      activateSession(life, id);
    }, true),
    newSession: () => run(async life => {
      await assertActor(life); assertSessionSwitchAvailable();
      const found = await refreshSessions(life);
      const slot = DESIGN_CONVERSATION_SESSIONS.find(id => !found.some(session => session.id === id));
      if (!slot) throw Error('Ya tienes tres sesiones. Retoma una o reiníciala para empezar de nuevo.');
      activateSession(life, slot);
    }, true),
    resetSession: () => run(async life => {
      await assertCurrent(life); assertSessionSwitchAvailable(); await assertRemoteRevision(life);
      if (current(life).pending) throw Error('Recupera o descarta la solicitud pendiente antes de reiniciar esta sesión.');
      const saved = await life.store!.reset(life.record!.revision, targetOf(latest.current));
      await assertActor(life); life.record = saved; life.capture = undefined; life.sourceCapture = undefined; life.inspection = undefined;
      life.previewRequest = (life.previewRequest ?? 0) + 1; hydratedHtml.current = '';
      setState(saved.value); setImageResult(null); setImagePreview(''); setImagePreviewLoading(false);
      setSessions(items => items.map(item => item.id === life.session ? sessionSummary(life.session, saved.value) : item));
      show(latest.current.initialView ?? 'image');
    }),
    confirmationReady: canConfirmDesign(state, options),
    confirmationStale: !!state.confirmation && !state.pending && !canConfirmDesign(state, options),
    /** What changed after the plan was armed («el formato», «la propuesta»…), for the stale notice. */
    staleDetail: designPlanBlocker(state, options)?.reason === 'stale' ? designPlanBlocker(state, options)?.detail ?? '' : '',
    canRetryLastMessage: !!retryablePlanningMessage(state),
    syncStatus: options.service.continuity ? syncStatus : null, localCopies,
    /** Dismiss the last error once the user left the failed proposal (the work itself stays as saved). */
    clearError: () => setError(''),
    setPreferences: (preferences: NonNullable<DesignConversationState['preferences']>) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      if (!same(current(life).preferences, preferences)) await save(life, value => ({ ...value, preferences: structuredClone(preferences) }));
    }),
    synchronize: () => run(async life => { await loadConversation(life); await assertCurrent(life); await refreshSessions(life); await refreshImage(life); }, true),
    exportLocal: () => run(async life => {
      await assertActor(life);
      const local = await openDesignConversationStore(conversationScope(life));
      try { await downloadContinuityBackup({ current: life.record, attempts: await life.store?.backups?.() ?? [], legacy: await local.read() }, 'conversacion-diseno-copia-local.json'); }
      finally { local.close(); }
    }, true),
    send: async (message: string): Promise<boolean> => { let saved = false; await run(life => sendMessage(life, message, () => { saved = true; })); return saved; },
    retryLastMessage: async (): Promise<boolean> => {
      let saved = false;
      await run(async life => {
        await assertCurrent(life);
        const retry = retryablePlanningMessage(current(life));
        if (!retry) throw Error('No hay un mensaje fallido para reintentar. Puedes escribir en la conversación.');
        await sendMessage(life, retry.message, () => { saved = true; }, retry.resolvingCopy);
      });
      return saved;
    },
    resolveCopy: async (clarification = ''): Promise<boolean> => {
      let saved = false;
      await run(async life => {
        await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
        if (current(life).copy.status !== 'pending') return;
        const message = 'Resuelve únicamente el texto literal del diseño acordado. Lee y transcribe el texto de la referencia indicada en nuestra conversación; '
          + 'si falta una fuente o hay caracteres dudosos, pregunta exactamente qué falta. Conserva el encargo y las ideas. No generes imágenes ni HTML ni propongas otras ideas.'
          + (clarification.trim() ? `\nMi aclaración sobre el texto: ${clarification.trim()}` : '');
        await sendMessage(life, message, () => { saved = true; }, true);
      });
      return saved;
    },
    executeSuggested: () => run(life => executeArmedPlan(life, { userText: 'Sí, créalo.' })),
    /** «Corregir composición» limited to the detected problems; it keeps the original request, the spec and the
     * style lock, and is discarded if it leaves more problems than the selected version. */
    correctComposition: () => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      const value = current(life), selected = selectedOf(value);
      if (selected?.kind !== 'html') throw Error('Selecciona la versión HTML que quieres corregir.');
      const issues = selected.proposal.visualReview?.issues ?? [];
      const action: ConversationNextAction = { kind: 'refine_html', intent: 'requested', reference_ids: [], reason: 'Pediste corregir la composición con su botón.',
        instruction: buildScopedRepairFeedback(issues, lastInstruction(value) || value.understanding?.resolved_instruction || '') };
      let armed = false;
      await save(life, before => {
        const next = { ...before, next_action: action, confirmation: null };
        const blocker = designPlanBlocker(next, latest.current);
        if (blocker === null) { armed = true; return { ...next, confirmation: { context_key: designConfirmationKey(next, latest.current) } }; }
        const turn = crypto.randomUUID();
        return { ...next, messages: [...next.messages, { id: `assistant:${turn}`, turn_id: turn, role: 'assistant' as const, text: designBlockerText(blocker) }] };
      });
      if (!armed) return;
      life.correction = { issues };
      try { await executeArmedPlan(life, { userText: 'Corrige la composición.' }); } finally { life.correction = undefined; }
    }),
    /** Edits the «Prompt usado» of a reference (by image hash); an empty text returns to the generated spec. */
    setReferencePrompt: (sha256: string, text: string) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      await save(life, value => {
        const prompts = { ...value.reference_prompts };
        if (text.trim()) prompts[sha256] = { text: text.trim().slice(0, 1500), edited: true }; else delete prompts[sha256];
        return { ...value, reference_prompts: prompts };
      });
    }),
    /** Edits the «Prompt usado» of an image version; the next edit or citation uses it as its source prompt. */
    setVersionPrompt: (versionId: string, text: string) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      await save(life, value => {
        const prompts = { ...value.version_prompts };
        if (text.trim()) prompts[versionId] = text.trim().slice(0, 4000); else delete prompts[versionId];
        return { ...value, version_prompts: prompts };
      });
    }),
    /** A button is an explicit order: it runs in the same click, or says why it cannot. */
    executeAction: (kind: ConversationActionKind) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      const value = current(life), action: ConversationNextAction = { kind, intent: 'suggested',
        instruction: value.understanding?.resolved_instruction || 'Crea el diseño con el texto, la marca y las referencias acordadas.',
        reference_ids: value.references.map(item => item.id), reason: 'Solicitaste esta acción mediante su botón.' };
      let armed = false;
      await save(life, before => {
        const next = { ...before, next_action: action, confirmation: null };
        const blocker = designPlanBlocker(next, latest.current);
        if (blocker === null) { armed = true; return { ...next, confirmation: { context_key: designConfirmationKey(next, latest.current) } }; }
        const turn = crypto.randomUUID();
        return { ...next, messages: [...next.messages, { id: `assistant:${turn}`, turn_id: turn, role: 'assistant' as const, text: designBlockerText(blocker) }] };
      });
      if (armed) await executeArmedPlan(life, { userText: kind === 'convert_image_to_html' ? 'Hazla editable.' : 'Créalo.' });
    }),
    startIdea: (idea: IdeaContent) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      if (!current(life).ideas.some(item => same(item, idea))) throw Error('Esta idea ya no pertenece a la conversación actual.');
      await sendMessage(life, `Elijo la idea «${idea.title}». Prepara la propuesta con esta dirección y lo que hemos acordado, y explícame qué harás antes de crearla.\n${idea.render_instruction}`.slice(0, 6000));
    }),
    changeReferences: (items: PreparedPresentationReference[]) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      await save(life, value => { const removed = value.references.filter(item => !items.some(next => next.id === item.id)).map(item => item.id);
        return { ...value, references: structuredClone(items), understanding: null, ideas: [], next_action: null, confirmation: null,
          ...(value.design_source?.source.kind === 'reference' && removed.includes(value.design_source.source.reference_id) ? { design_source: null } : {}),
          copy: value.copy.source_reference_ids.some(id => removed.includes(id)) ? { status: 'pending', text: '', source_reference_ids: [] } : value.copy }; });
    }),
    setMode: (mode: DesignConversationState['mode']) => run(async life => { await assertCurrent(life);
      if (current(life).pending) throw Error('conversation_pending_unresolved'); await save(life, value => ({ ...value, mode })); }),
    selectVersion: (id: string) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      const version = current(life).versions.find(item => item.id === id); if (!version) throw Error('No se encontró esta versión.');
      let nextView = latest.current.service.continuity ? savedVersionView(current(life), version) : versionView(version);
      if (version.kind === 'html' && version.composition) {
        const live = latest.current.compositionState?.current?.proposal;
        if (!latest.current.service.continuity && (!live || live.requestKey !== version.composition.request_key || live.html !== version.proposal.html)) nextView = 'history';
      }
      if (version.kind === 'html' && !same(version.target, current(life).target)) nextView = 'history';
      if (version.kind === 'html' && nextView === 'html') await latest.current.htmlController.current?.updateContext(savedHtmlContext(current(life), version.proposal));
      await save(life, value => ({ ...value, selected_version_id: id, next_action: null, confirmation: null,
        design_source: version.design_source ?? null,
        preferences: { format: latest.current.format ?? (version.kind === 'image' ? 'image' : 'html'), base: 'version' } })); show(nextView);
      await refreshImage(life);
    }),
    recover: () => run(recoverAction, true),
    /** Closes a stuck request without replaying it. A late image still lands in Biblioteca. */
    discard: () => run(async life => {
      await loadConversation(life); if (!active(life)) return; await assertActor(life); ensure(life, undefined, true);
      const pending = current(life).pending; if (!pending) return;
      await save(life, value => completeConversationAction(value, pending.action_id, { next_action: null, message: {
        id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant',
        text: pending.kind === 'image' ? 'Descarté la espera de esta imagen. Si termina de generarse, la encontrarás en Biblioteca.'
          : 'Descarté la solicitud anterior. Puedes escribir de nuevo.' } }), true);
      // A request belongs to the revision on which it began. Explicitly closing
      // it lets this saved session continue after another session changed the slide.
      await loadConversation(life); setError('');
    }, true),
    approveImage: () => run(async life => {
      await assertCurrent(life); await assertRemoteRevision(life); if (current(life).pending) throw Error('conversation_pending_unresolved'); const selected = imageOf(current(life));
      if (selected?.kind !== 'image') throw Error('Selecciona una imagen para revisarla.');
      const found = await readConversationImage(latest.current.service.client, latest.current.businessId, selected.asset); await assertCurrent(life);
      if (found.call.state === 'approved') return;
      if (found.asset.provenance.kind === 'image_operation' && found.asset.provenance.quality === 'low')
        await approveServerLibraryDirection(latest.current.service.client, latest.current.businessId, selected.asset);
      else await reviewServerLibraryResult(latest.current.service.client, latest.current.businessId, selected.asset, 'approved');
      await refreshImage(life);
    }),
    generateMedium: () => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved'); const selected = imageOf(current(life));
      if (selected?.kind !== 'image') throw Error('Selecciona primero un borrador.');
      const input = latest.current, result = await readConversationImage(input.service.client, input.businessId, selected.asset);
      if (!result.direction) throw Error('Aprueba la dirección del borrador antes de generar en media.');
      const server = await input.service.client.read(input.businessId); await assertCurrent(life);
      const generation = presentationGenerationCapabilities(server.generation, input.service.simulation, server.state); if (!generation) throw Error('server_generation_unavailable');
      const operation = buildPresentationMediumOperation({ operation: result.job.plan.operation, draft: result.asset, approval: result.direction, actorId: life.actor,
        operationKey: crypto.randomUUID(), documentId: input.documentId, slide: input.slide, generation, destination: input.destination });
      await dispatchImage(life, operation, crypto.randomUUID());
    }),
    /** Local editable layers over the approved raster; this does not claim its
     * painted text became HTML, and does not dispatch another AI generation. */
    editImageLayers: (openLogos = false) => run(async life => {
      await assertCurrent(life); await assertRemoteRevision(life);
      const value = current(life), selected = selectedOf(value), input = latest.current;
      if (value.pending) throw Error('conversation_pending_unresolved');
      if (selected?.kind !== 'image') throw Error('Selecciona la imagen que quieres editar.');
      if (value.versions.length >= 20) throw Error('conversation_version_limit');
      const controller = input.htmlController.current;
      if (!controller || !input.htmlState?.current?.ready || input.htmlState.current.busy) throw Error('El editor está cargando. Inténtalo cuando esté listo.');
      const found = await readConversationImage(input.service.client, input.businessId, selected.asset); await assertCurrent(life);
      if (found.call.state !== 'approved') throw Error('Aprueba esta versión antes de editar sus capas.');
      const canvas = getSlideDimensions(input.slide.html);
      const slide = await mountServerPresentationAsset(input.service.client, { businessId: input.businessId, documentId: input.documentId,
        slide: input.slide, asset: found.asset, region: { x: 0, y: 0, ...canvas }, operationKey: found.job.operation_key,
        replaceFullDesign: true, destination: input.destination });
      await assertCurrent(life);
      const proposal: HtmlDesignProposal = { html: slide.html, mounted: slide.mounted_assets ?? [], canvas, target: value.target, intent: 'replace' };
      await controller.updateContext({ ...savedHtmlContext(value, proposal), copyMode: 'instruction' });
      await save(life, before => {
        const version: DesignConversationVersion = { id: crypto.randomUUID(), turn_id: crypto.randomUUID(), parent_id: selected.id,
          target: before.target, kind: 'html', proposal };
        return { ...before, next_action: null, confirmation: null, versions: [...before.versions, version], selected_version_id: version.id,
          preferences: { format: input.format ?? 'image', base: 'version' },
          messages: [...before.messages, { id: `assistant:${version.id}`, turn_id: version.turn_id, role: 'assistant',
            text: 'La imagen está en un lienzo editable. Puedes moverla y añadir logos como elementos independientes; el texto dentro de la imagen sigue formando parte de sus píxeles.' }] };
      });
      show('html'); if (openLogos) await controller.openLogos(); else await controller.openEditor();
    }),
    apply: () => run(async life => {
      await assertCurrent(life); await assertRemoteRevision(life); if (current(life).pending) throw Error('conversation_pending_unresolved'); const selected = selectedOf(current(life));
      if (viewRef.current === 'history') throw Error('Selecciona la versión actual para aplicarla. El historial se muestra para comparar.');
      if (!selected) throw Error('Selecciona un resultado antes de aplicarlo.');
      if (!same(selected.target, targetOf(latest.current))) throw Error('conversation_target_changed');
      if (selected.kind === 'html') {
        if (selected.composition?.unresolved_slots.length || selected.proposal.pending) throw Error('Completa y comprueba las piezas antes de aplicar este diseño.');
        if (selected.composition && viewRef.current === 'composition') {
          const composition = latest.current.compositionState?.current;
          if (!composition?.proposal || composition.proposal.requestKey !== selected.composition.request_key
            || composition.proposal.html !== selected.proposal.html) throw Error('Abre esta composición y revisa su versión actual antes de aplicarla.');
          await latest.current.compositionController.current?.apply();
        } else { await latest.current.htmlController.current?.updateContext({ proposal: selected.proposal }); await assertCurrent(life); await latest.current.htmlController.current?.apply(); }
      } else {
        const input = latest.current, found = await readConversationImage(input.service.client, input.businessId, selected.asset); await assertCurrent(life);
        const next = await mountServerPresentationAsset(input.service.client, { businessId: input.businessId, documentId: input.documentId, slide: input.slide,
          asset: found.asset, region: { x: 0, y: 0, ...getSlideDimensions(input.slide.html) }, operationKey: found.job.operation_key, replaceFullDesign: true, destination: input.destination });
        await assertCurrent(life); await input.onApply(next);
      }
    }),
    recordHtmlEdit: (proposal: HtmlDesignProposal, reason: SlideProposalReason) => run(life => recordEdit(life, proposal, reason)),
    recordCompositionEdit: (proposal: DesignToHtmlProposal, reason: 'generated' | 'edited' | 'recovered') => run(life => recordEdit(life,
      fromComposition(proposal), reason, { request_key: proposal.requestKey, source: proposal.source, unresolved_slots: proposal.unresolvedSlots })),
  };
}
