import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import type { PresentationDesignService } from '../../components/presentations/PresentationDesignContext';
import type { SlideGeneratorController, SlideGeneratorState, SlideProposalReason } from '../../components/presentations/SlideGeneratorPanel';
import type { DesignToHtmlController, DesignToHtmlState, DesignToHtmlProposal } from '../../components/presentations/DesignToHtmlPanel';
import type { DesignOperation, DesignReference } from '../../../supabase/functions/_shared/desaing/contracts';
import type { DesignCopy, ExplorationRequest, ExplorationResult, IdeaContent } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import type { ConversationActionKind, ConversationNextAction } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { assertExplorationResult } from '../../../supabase/functions/_shared/desaing/exploration';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { designSurfaceBrand, designSurfaceSessionId, designSurfaceTarget, designSurfaceWorkspace, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import { fullDesignImmutables, fullDesignLocalInstruction } from '../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { useDesignBrandContext } from './useDesignBrandContext';
import { designBrandExplorationContext } from './designBrandContext';
import { getSlideDimensions, type PresentationSlide } from './presentationDocument';
import { assertHtmlDesignTarget, type HtmlDesignProposal, type HtmlDesignTarget } from './htmlDesignDraft';
import { preparePresentationReference, type PreparedPresentationReference } from './presentationReferences';
import type { ImageGenerationSettings } from '../imageGenerationSettings';
import { imageDataUrl } from '../desaing/labImages';
import { DesignServerClientError } from '../desaing/serverClient';
import { beginConversationAction, completeConversationAction, emptyDesignConversation, markConversationAction, advanceConversationEpoch,
  openDesignConversationStore, type DesignConversationState, type DesignConversationRecord, type DesignConversationVersion } from './designConversationStore';
import { buildConversationImageOperation, prepareConversationReferences, readConversationImage, sameConversationAsset } from './designConversationImages';
import { buildConversationHtmlSummary } from './designConversationHtml';
import { downloadContinuityBackup, type SyncedConversationStore } from './designConversationRemote';
import type { ContinuityStatus } from '../desaing/continuityStore';
import { approveServerLibraryDirection, buildPresentationMediumOperation, isUnresolvedReferenceCopy, mountServerPresentationAsset,
  presentationGenerationCapabilities, presentationLibraryResults, reviewServerLibraryResult, type PresentationLibraryResult } from './presentationServerDesign';

export type DesignConversationView = 'image' | 'html' | 'composition' | 'history';
export interface UseDesignConversationOptions {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  destination?: DesignSurfaceDestination; initialCopy?: string | DesignCopy; initialView?: 'image' | 'html'; settings: ImageGenerationSettings;
  /** Output and starting point chosen in the workspace; undefined keeps every action available. */
  format?: 'html' | 'image'; base?: 'current' | 'new';
  htmlController: RefObject<SlideGeneratorController | null>; compositionController: RefObject<DesignToHtmlController | null>;
  htmlState?: RefObject<SlideGeneratorState | null>; compositionState?: RefObject<DesignToHtmlState | null>;
  onView(view: DesignConversationView): void; onApply(slide: PresentationSlide): void | Promise<void>;
}
type Store = Awaited<ReturnType<typeof openDesignConversationStore>> & Partial<Pick<SyncedConversationStore, 'status' | 'backups'>>;
type Life = { active: boolean; actor: string; key: string; store: Store | null; record: DesignConversationRecord | null;
  queue: Promise<unknown>; locked: boolean; blocked: boolean; generation: ServerGenerationCapabilities | null };
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
const targetOf = (options: UseDesignConversationOptions): HtmlDesignTarget => ({ document: options.documentId, slide: options.slide.id, revision: options.slide.revision });
const scopeKey = (options: UseDesignConversationOptions) => JSON.stringify([options.businessId, options.documentId, options.slide.id]);
const selectedOf = (state: DesignConversationState) => state.versions.find(item => item.id === state.selected_version_id);
const imageOf = (state: DesignConversationState) => {
  const selected = selectedOf(state);
  if (selected?.kind === 'image') return selected;
  if (selected?.kind === 'html' && selected.composition) return state.versions.find(item => item.kind === 'image' && sameConversationAsset(item.asset, selected.composition!.source));
  return undefined;
};
const versionView = (version: DesignConversationVersion): DesignConversationView => version.kind === 'image' ? 'image' : version.composition ? 'composition' : 'html';
const describeError = (problem: unknown) => {
  const code = problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : problem instanceof Error ? problem.message : '';
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
    exploration_provider_timeout: 'La IA tardó demasiado en responder. Descarta la solicitud y vuelve a intentarlo.',
    exploration_provider_rejected: 'El proveedor de IA rechazó la solicitud. Descártala y vuelve a intentarlo.',
    exploration_provider_invalid_result: 'La IA devolvió una respuesta incompleta. Descarta la solicitud y vuelve a intentarlo.',
    exploration_provider_incomplete: 'La IA devolvió una respuesta incompleta. Descarta la solicitud y vuelve a intentarlo.',
    exploration_provider_unexpected_output: 'La IA devolvió una respuesta inesperada. Descarta la solicitud y vuelve a intentarlo.',
    exploration_provider_response_too_large: 'La respuesta de la IA fue demasiado grande. Descarta la solicitud y pide algo más breve.',
    exploration_provider_unknown: 'No se pudo completar la respuesta de la IA. Descarta la solicitud y vuelve a intentarlo.',
    server_exploration_outcome_unknown: 'Esta solicitud no terminó. Descártala para seguir conversando.',
    exploration_previous_unresolved: 'Hay otra respuesta en curso. Espera unos segundos o descarta la solicitud pendiente.',
  };
  return errors[code] ?? (/\s/.test(code) && !/[{}<>]/.test(code) ? code : 'No se completó la acción. Conservamos el trabajo; recupera su estado antes de repetirla.');
};

/** A single durable conversation coordinates the existing image and HTML controllers. */
export function useDesignConversation(options: UseDesignConversationOptions) {
  const latest = useRef(options); latest.current = options;
  const lifeRef = useRef<Life | null>(null);
  const [state, setState] = useState<DesignConversationState>(() => emptyDesignConversation(targetOf(options)));
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [syncStatus, setSyncStatus] = useState<ContinuityStatus>('loading');
  const [localCopies, setLocalCopies] = useState(false);
  const [generation, setGeneration] = useState<ServerGenerationCapabilities | null>(null);
  const [imageResult, setImageResult] = useState<PresentationLibraryResult | null>(null), [imagePreview, setImagePreview] = useState('');
  const [view, setView] = useState<DesignConversationView>(options.initialView ?? 'image');
  const viewRef = useRef<DesignConversationView>(options.initialView ?? 'image');
  const hydratedHtml = useRef('');
  const brand = useDesignBrandContext(options.businessId, options.service.brand), brandRef = useRef(brand); brandRef.current = brand;
  const planner = useMemo(() => options.service.exploration?.planner ?? options.service.exploration?.createPlanner?.(options.businessId)
    ?? options.service.client.exploration(options.businessId), [options.service, options.businessId]);
  const plannerRef = useRef(planner); plannerRef.current = planner;
  const active = (life: Life) => life.active && lifeRef.current === life && life.key === scopeKey(latest.current);
  const current = (life: Life) => life.record?.value ?? emptyDesignConversation(targetOf(latest.current));
  function ensure(life: Life, epoch?: number) {
    if (!active(life)) throw Error('conversation_view_closed');
    if (life.blocked) throw Error('conversation_revision_conflict');
    if (life.store?.status && life.store.status() !== 'synced') throw Error('conversation_sync_unavailable');
    if (!same(current(life).target, targetOf(latest.current)) || epoch !== undefined && current(life).epoch !== epoch) throw Error('conversation_target_changed');
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
  function save(life: Life, transform: (value: DesignConversationState) => DesignConversationState) {
    const work = life.queue.then(async () => {
      ensure(life); if (!life.store) throw Error('conversation_store_unavailable');
      const next = transform(structuredClone(current(life)));
      try { const saved = await life.store.write(life.record?.revision ?? 0, next); await assertActor(life); life.record = saved;
        if (active(life)) setState(saved.value); return saved.value;
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
  async function refreshImage(life: Life) {
    const selected = imageOf(current(life));
    if (selected?.kind !== 'image') { if (active(life)) { setImageResult(null); setImagePreview(''); } return; }
    const identity = structuredClone(selected.asset), epoch = current(life).epoch;
    const found = await readConversationImage(latest.current.service.client, latest.current.businessId, identity);
    await assertCurrent(life, epoch);
    const preview = await imageDataUrl(await latest.current.service.client.asset(identity)); await assertCurrent(life, epoch);
    const now = imageOf(current(life));
    if (now?.kind === 'image' && sameConversationAsset(now.asset, identity)) { setImageResult(found); setImagePreview(preview); }
  }
  async function run(action: (life: Life) => Promise<void>, recovering = false) {
    const life = lifeRef.current;
    if (!life || !active(life) || life.locked || !life.store) return;
    life.locked = true; setBusy(true); setError('');
    try { await life.queue; if (!recovering) ensure(life); await action(life); }
    catch (problem) { if (active(life)) setError(describeError(problem)); }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  async function loadConversation(life: Life) {
    const input = latest.current, store = life.store!;
    life.record = await store.read(); if (!active(life)) return;
    await assertActor(life); life.blocked = false;
    const writable = !store.status || store.status() === 'synced';
    if (!life.record && writable) {
      const initial = emptyDesignConversation(targetOf(input));
      if (typeof input.initialCopy === 'object') initial.copy = structuredClone(input.initialCopy);
      else if (input.initialCopy?.trim() && !isUnresolvedReferenceCopy(input.initialCopy)) initial.copy = { status: 'literal', text: input.initialCopy, source_reference_ids: [] };
      life.record = await store.write(0, initial);
    } else if (life.record && writable && life.record.value.target.revision < input.slide.revision && !life.record.value.pending) {
      const next = advanceConversationEpoch(life.record.value, targetOf(input));
      const previous = selectedOf(next); next.next_action = null;
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
    if (store.backups) setLocalCopies((await store.backups()).length > 0);
    const selected = selectedOf(life.record.value);
    if (selected) {
      show(savedVersionView(life.record.value, selected));
    }
    if (!same(life.record.value.target, targetOf(input))) setError(describeError(Error('conversation_target_changed')));
  }
  useEffect(() => {
    const life: Life = { active: true, actor: '', key: scopeKey(options), store: null, record: null, queue: Promise.resolve(), locked: false, blocked: false, generation: null };
    lifeRef.current = life; setReady(false); setBusy(false); setError(''); setImageResult(null); setImagePreview('');
    setState(emptyDesignConversation(targetOf(options))); setSyncStatus('loading'); setLocalCopies(false);
    void (async () => {
      const session = await options.service.client.session(); if (!active(life)) return; life.actor = session.actorId;
      const scope = { actor: session.actorId, business: options.businessId, document: options.documentId, slide: options.slide.id };
      const store: Store = options.service.continuity ? await options.service.continuity.openConversation(scope, status => { if (active(life)) setSyncStatus(status); })
        : await openDesignConversationStore(scope);
      if (!active(life)) { store.close(); return; } life.store = store;
      await loadConversation(life); if (!active(life) || store.status?.() === 'offline') return;
      const server = await options.service.client.read(options.businessId); await assertActor(life);
      life.generation = presentationGenerationCapabilities(server.generation, options.service.simulation, server.state); setGeneration(life.generation);
      if (!same(current(life).target, targetOf(latest.current))) { setError(describeError(Error('conversation_target_changed'))); return; }
      await refreshImage(life);
    })().catch(problem => { if (active(life)) setError(describeError(problem)); });
    return () => { life.active = false; void life.queue.finally(() => life.store?.close()); };
  }, [options.service, options.businessId, options.documentId, options.slide.id]);

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
    void run(async currentLife => { await assertCurrent(currentLife); await latest.current.htmlController.current!.updateContext({ proposal: selected.proposal }); });
  }, [ready, busy, view, state.selected_version_id, state.target.revision, options.htmlState?.current?.ready, options.htmlState?.current?.status]);

  async function syncBrand(life: Life) {
    const snapshot = brandRef.current;
    if (snapshot.status === 'loading' || snapshot.status === 'error') throw Error('Carga la identidad de la marca antes de continuar.');
    if (current(life).pending) throw Error('conversation_pending_unresolved');
    if (!same(current(life).brand, snapshot.context)) await save(life, value => ({ ...value, brand: snapshot.context,
      brand_key: snapshot.context?.fingerprint ?? null }));
  }
  async function references(life: Life) {
    const value = current(life), epoch = value.epoch;
    return prepareConversationReferences({ client: latest.current.service.client, actor: life.actor, business: latest.current.businessId,
      document: latest.current.documentId, slide: latest.current.slide.id, references: structuredClone(value.references),
      destination: latest.current.destination, assertCurrent: () => assertCurrent(life, epoch) });
  }
  async function acceptUnderstanding(life: Life, result: ExplorationResult, allowExecution: boolean) {
    const pending = current(life).pending;
    if (pending?.request?.kind !== 'understand') throw Error('conversation_pending_unresolved');
    assertExplorationResult(result, pending.request.request); await assertCurrent(life, pending.epoch);
    if (!result.design_understanding || !result.next_action) throw Error('Actualiza el servidor para usar la conversación de diseño.');
    // This restriction travels with the durable request, including recovery on another device.
    const resolvingCopy = same(pending.request.request.conversation?.available_actions, ['discuss']);
    await save(life, value => completeConversationAction(value, pending.action_id, {
      message: { id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant', text: result.message },
      understanding: result.design_understanding, copy: value.copy.status === result.design_understanding!.copy.status && value.copy.text === result.design_understanding!.copy.text
        ? value.copy : result.design_understanding!.copy, ideas: resolvingCopy ? value.ideas : result.ideas,
      next_action: resolvingCopy ? value.next_action : result.next_action,
    }));
    if (allowExecution && result.next_action.intent === 'requested' && !result.design_understanding.pending_questions.length
      && !['discuss', 'explore_ideas'].includes(result.next_action.kind)) await executeAction(life, result.next_action, pending.turn_id);
  }
  async function sendMessage(life: Life, message: string, onSaved?: () => void, resolvingCopy = false) {
    if (!message.trim() || message.length > 6000) throw Error('Escribe un mensaje de hasta 6000 caracteres.');
    await assertCurrent(life); await syncBrand(life);
    if (current(life).messages.length > 198) throw Error('conversation_message_limit');
    if (current(life).completed_action_ids.length >= 200) throw Error('conversation_action_limit');
    const capabilities = await plannerRef.current.capabilities?.(); await assertCurrent(life);
    if (capabilities === null) throw Error('La conversación de diseño no está habilitada. Revisa la configuración del servidor.');
    if (capabilities?.supports_conversation_actions !== 1) throw Error('Actualiza el servidor para activar la conversación unificada de diseño.');
    const uploaded = await references(life), value = current(life), selected = selectedOf(value), selectedImage = imageOf(value);
    const canvas = getSlideDimensions(latest.current.slide.html), visualRefs: DesignReference[] = uploaded.map(item => item.reference);
    if (selectedImage?.kind === 'image') visualRefs.push({ ...selectedImage.asset, reference_id: `image:${selectedImage.asset.asset_id}:${selectedImage.asset.version_id}`,
      mime_type: 'image/png', roles: ['object_reference', 'layout_reference'] });
    const { format, base } = latest.current;
    let actions: ConversationActionKind[] = ['discuss', 'generate_image', 'create_html', 'explore_ideas'];
    if (selectedImage?.kind === 'image') actions.push('edit_image', 'convert_image_to_html');
    // «Diseño actual» in HTML: the slide's existing HTML is the design to adjust, even when an image version is selected.
    const hasHtml = selected?.kind === 'html' && viewRef.current !== 'history' && same(selected.target, value.target)
      && !selected.composition?.unresolved_slots.length || !selected && viewRef.current === 'html' && base !== 'new'
      || format === 'html' && base === 'current' && selected?.kind !== 'html';
    if (hasHtml) actions.push('refine_html');
    const excluded: ConversationActionKind[] = format === 'html' ? ['generate_image', 'edit_image']
      : format === 'image' ? ['create_html', 'refine_html', 'convert_image_to_html'] : [];
    actions = actions.filter(kind => !excluded.includes(kind));
    const actionId = crypto.randomUUID(), turnId = crypto.randomUUID(), destination = latest.current.destination, waiting = value.next_action;
    const projectCopy = (copy: DesignCopy) => ({ ...copy, source_reference_ids: copy.source_reference_ids.filter(id => visualRefs.some(ref => ref.reference_id === id)) });
    const previousUnderstanding = value.understanding ? { ...value.understanding, copy: projectCopy(value.understanding.copy),
      references: value.understanding.references.filter(ref => visualRefs.some(item => item.reference_id === ref.reference_id)) } : null;
    const request: ExplorationRequest = { request_key: actionId, kind: 'discussion', scope: 'full_design', message,
      history: value.messages.slice(-20).map(({ role, text }) => ({ role, text })),
      context: { actor_id: life.actor, business_id: latest.current.businessId, brand_id: designSurfaceBrand(destination), project_id: latest.current.documentId,
        session_id: designSurfaceSessionId(latest.current.documentId, latest.current.slide.id, 'full_design', destination),
        workspace: designSurfaceWorkspace(destination), interaction_mode: value.mode, target: designSurfaceTarget(latest.current.documentId, latest.current.slide, destination),
        instruction: fullDesignLocalInstruction(message, canvas, null) + (value.brand ? `\nIdentidad de marca: ${JSON.stringify(value.brand)}` : ''),
        immutable_elements: value.copy.status === 'pending' ? ['Pendiente de resolver el texto literal del diseño. Las indicaciones no son texto para imprimir.', `Lienzo completo: ${canvas.width}×${canvas.height}.`]
          : fullDesignImmutables(value.copy.text, canvas, destination, value.copy.status === 'none' ? 'none' : 'literal'), references: visualRefs },
      design_brief: { copy: projectCopy(value.copy), brand: value.brand ? designBrandExplorationContext(value.brand, designSurfaceBrand(destination)) : null,
        selected_instruction: value.understanding?.resolved_instruction ?? '', preserve: value.understanding?.preserve ?? [],
        ...(previousUnderstanding ? { previous_understanding: previousUnderstanding } : {}) },
      conversation: { schema_version: 1, canvas, surface: hasHtml ? 'html' : selectedImage ? 'image' : 'empty',
        selected_image: selectedImage?.kind === 'image' ? selectedImage.asset : null, available_actions: resolvingCopy ? ['discuss'] : actions,
        // The action left waiting for this answer, so a reply such as «sí» or «HTML» resumes it instead of asking again.
        ...(!resolvingCopy && waiting && waiting.kind !== 'discuss' && waiting.intent !== 'requested' ? { pending_action: {
          kind: waiting.kind, instruction: waiting.instruction, questions: value.understanding?.pending_questions ?? [] } } : {}),
        ...(!resolvingCopy && format ? { design_format: format } : {}),
        ...(!resolvingCopy && format === 'html' && base ? { design_base: base } : {}),
        ...(hasHtml ? { current_html: { revision: String(value.target.revision),
          summary: buildConversationHtmlSummary(selected?.kind === 'html' ? selected.proposal.html : latest.current.slide.html) } } : {}) } };
    await save(life, before => beginConversationAction(before, { action_id: actionId, turn_id: turnId, kind: 'understand', phase: 'prepared',
      epoch: before.epoch, target: before.target, request: { kind: 'understand', request } }, { id: `user:${actionId}`, turn_id: turnId, role: 'user', text: message }));
    onSaved?.();
    await save(life, before => markConversationAction(before, actionId, 'dispatched'));
    try { await assertCurrent(life); const result = await plannerRef.current.plan(request); await acceptUnderstanding(life, result, true); }
    catch (problem) { if (active(life) && current(life).pending?.action_id === actionId) await save(life, before => markConversationAction(before, actionId, 'uncertain')); throw problem; }
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
        await save(life, value => completeConversationAction(value, operation.operation_key, {
          version: { id: crypto.randomUUID(), turn_id: pending.turn_id, ...(value.selected_version_id ? { parent_id: value.selected_version_id } : {}),
            target: pending.target, kind: 'image', asset: result.asset.identity }, next_action: null,
          message: { id: `assistant:${operation.operation_key}`, turn_id: pending.turn_id, role: 'assistant', text: 'La imagen está lista. Puedes pedirme ajustes y compararla antes de aprobarla.' },
        }));
        show('image'); await refreshImage(life); return;
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
  function htmlContext(value: DesignConversationState, instruction: string) {
    return { instruction: instruction + (value.brand ? `\nIdentidad de marca: ${JSON.stringify(value.brand)}` : ''), copy: value.copy.text,
      copyMode: value.copy.status === 'none' ? 'none' as const : 'literal' as const, references: structuredClone(value.references) };
  }
  async function finishHtml(life: Life, proposal: HtmlDesignProposal, composition?: { request_key: string; source: DesignToHtmlProposal['source']; unresolved_slots: string[] }) {
    const pending = current(life).pending; if (!pending || pending.kind !== 'html') throw Error('conversation_pending_unresolved');
    assertHtmlDesignTarget(proposal, pending.target); await assertCurrent(life, pending.epoch);
    await save(life, value => completeConversationAction(value, pending.action_id, { version: { id: crypto.randomUUID(), turn_id: pending.turn_id,
      ...(value.selected_version_id ? { parent_id: value.selected_version_id } : {}), target: proposal.target, kind: 'html', proposal: { ...proposal, intent: 'replace' },
      ...(composition ? { composition } : {}) }, next_action: null,
      message: { id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant', text: composition?.unresolved_slots.length
        ? 'La estructura HTML está lista. Completa las piezas señaladas en el editor antes de aplicarla.' : 'El HTML está listo para revisarlo y editarlo. Puedes pedirme otro ajuste o aplicarlo cuando quieras.' } }));
    show(composition ? 'composition' : 'html');
  }
  function fromComposition(proposal: DesignToHtmlProposal): HtmlDesignProposal {
    return { html: proposal.html, mounted: proposal.mountedAssets, intent: 'replace', canvas: proposal.canvas,
      target: { document: proposal.target.document_id, slide: proposal.target.slide_id ?? proposal.target.page_id ?? '', revision: Number(proposal.target.revision) } };
  }
  async function executeAction(life: Life, action: ConversationNextAction, turnId: string = crypto.randomUUID()) {
    await assertCurrent(life); const value = current(life);
    if (value.pending) throw Error('conversation_pending_unresolved');
    if (value.copy.status === 'pending' || value.understanding?.pending_questions.length) throw Error('Primero resolvamos el texto y las preguntas pendientes.');
    if (['discuss', 'explore_ideas'].includes(action.kind)) return;
    if (action.kind === 'refine_html' && viewRef.current === 'history') throw Error('Selecciona la versión actual para continuar editando. Esta versión del historial se conserva para comparar.');
    if (value.versions.length >= 20) throw Error('conversation_version_limit');
    if (value.messages.length >= 200) throw Error('conversation_message_limit');
    if (value.completed_action_ids.length >= 200) throw Error('conversation_action_limit');
    const input = latest.current;
    if (action.kind === 'generate_image' || action.kind === 'edit_image') {
      const uploaded = await references(life), response = await input.service.client.read(input.businessId); await assertCurrent(life);
      const generation = presentationGenerationCapabilities(response.generation, input.service.simulation, response.state);
      if (!generation) throw Error('server_generation_unavailable');
      const selected = imageOf(value), needsSelected = selected?.kind === 'image' && (action.kind === 'edit_image'
        || action.reference_ids.includes(`image:${selected.asset.asset_id}:${selected.asset.version_id}`));
      const selectedImage = needsSelected && selected?.kind === 'image' ? await readConversationImage(input.service.client, input.businessId, selected.asset) : undefined;
      // A new design based on selected pixels also uses the edit adapter: originals can exceed the 1024px extra-reference limit.
      const base = selectedImage;
      if (action.kind === 'edit_image' && !base) throw Error('Selecciona la imagen que quieres ajustar.');
      const operation = buildConversationImageOperation({ businessId: input.businessId, actorId: life.actor, documentId: input.documentId, slide: input.slide,
        destination: input.destination, instruction: action.instruction, copy: value.copy, brand: value.brand, operationKey: crypto.randomUUID(),
        generation, settings: input.settings, references: uploaded, ...(base ? { base: base.asset } : {}), mode: value.mode });
      await dispatchImage(life, operation, turnId); return;
    }
    let source: PresentationLibraryResult | null = null;
    const htmlInput = htmlContext(value, action.instruction);
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
      if (input.htmlState?.current && input.htmlState.current.status !== 'ready') throw Error('Recupera la solicitud HTML pendiente antes de preparar otra.');
      const selected = selectedOf(value);
      if (selected?.kind === 'html' && selected.composition?.unresolved_slots.length) throw Error('Completa las piezas de esta composición antes de ajustar su HTML.');
      const image = imageOf(value);
      if (image?.kind === 'image' && action.reference_ids.includes(`image:${image.asset.asset_id}:${image.asset.version_id}`)) {
        const blob = await input.service.client.asset(image.asset); await assertCurrent(life);
        const reference = await preparePresentationReference(new File([blob], 'Diseño seleccionado.png', { type: 'image/png' }), 'layout_reference');
        await assertCurrent(life);
        if (!htmlInput.references.some(item => item.sha256 === reference.sha256)) htmlInput.references.push(reference);
        if (htmlInput.references.length > 3) throw Error('El HTML admite tres imágenes de referencia. Retira una referencia para incluir este diseño.');
      }
    }
    const id = crypto.randomUUID();
    await save(life, state => beginConversationAction(state, { action_id: id, turn_id: turnId, kind: 'html', phase: 'prepared', target: state.target, epoch: state.epoch }));
    await save(life, state => markConversationAction(state, id, 'dispatched'));
    try {
      await assertCurrent(life);
      if (source) {
        show('composition'); const proposal = await input.compositionController.current!.create({ approved: true, asset: source.asset, copy: value.copy.text,
          copyMode: value.copy.status === 'none' ? 'no_text' : 'approved_text', instruction: action.instruction, replaceCompleted: true });
        await finishHtml(life, fromComposition(proposal), { request_key: proposal.requestKey, source: proposal.source, unresolved_slots: proposal.unresolvedSlots });
      } else {
        show('html'); const selected = selectedOf(value);
        const context = { ...htmlInput, ...(selected?.kind === 'html' ? { proposal: selected.proposal } : {}) };
        const proposal = action.kind === 'refine_html' ? await input.htmlController.current!.refine({ ...context, feedback: action.instruction, compare: true })
          : await input.htmlController.current!.create(context);
        await finishHtml(life, proposal);
      }
    } catch (problem) {
      if (active(life) && current(life).pending?.action_id === id) {
        const localRefusal = problem instanceof Error && ['html_unavailable', 'composition_source_required', 'composition_copy_count',
          'composition_upgrade_required', 'composition_approval_required'].includes(problem.message);
        const admissionRefusal = problem instanceof DesignServerClientError && ['html_quota_exceeded', 'html_previous_unresolved', 'server_html_expired',
          'server_feature_disabled', 'business_access_denied', 'business_write_denied', 'invalid_html_request', 'html_source_not_approved',
          'html_source_invalid', 'html_source_unavailable', 'server_policy_changed', 'html_request_too_large'].includes(problem.code);
        if (localRefusal || admissionRefusal) await save(life, state => completeConversationAction(state, id, { message: {
          id: `assistant:${id}`, turn_id: state.pending!.turn_id, role: 'assistant',
          text: 'No se generó otro HTML. Conservamos tu diseño; revisa la disponibilidad y el contexto del editor antes de continuar.' } }));
        else await save(life, state => markConversationAction(state, id, 'uncertain'));
      }
      throw problem;
    }
  }
  async function recoverAction(life: Life) {
    await loadConversation(life); if (!active(life)) return;
    await assertCurrent(life);
    const pending = current(life).pending;
    if (!pending) { await refreshImage(life); return; }
    if (pending.request?.kind === 'understand') {
      if (!plannerRef.current.recover) throw Error('No se puede recuperar esta conversación hasta actualizar el servidor.');
      let found = await plannerRef.current.recover(pending.action_id, pending.request.request); await assertCurrent(life, pending.epoch);
      if (!found) {
        if (pending.phase === 'prepared') await save(life, value => markConversationAction(value, pending.action_id, 'dispatched'));
        found = await plannerRef.current.plan(pending.request.request);
      }
      await acceptUnderstanding(life, found, false); return;
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
    await save(life, value => { const version: DesignConversationVersion = { id: crypto.randomUUID(), turn_id: crypto.randomUUID(),
      ...(value.selected_version_id ? { parent_id: value.selected_version_id } : {}), target: proposal.target, kind: 'html', proposal,
      ...(composition ? { composition } : {}) }; return { ...value, versions: [...value.versions, version], selected_version_id: version.id }; });
  }
  return {
    state, ready: ready && lifeRef.current?.key === scopeKey(options), busy, error, brand, generation, imagePreview, imageResult, view,
    syncStatus: options.service.continuity ? syncStatus : null, localCopies,
    synchronize: () => run(async life => { await loadConversation(life); await assertCurrent(life); await refreshImage(life); }, true),
    exportLocal: () => run(async life => {
      await assertActor(life);
      const local = await openDesignConversationStore({ actor: life.actor, business: latest.current.businessId, document: latest.current.documentId, slide: latest.current.slide.id });
      try { await downloadContinuityBackup({ current: life.record, attempts: await life.store?.backups?.() ?? [], legacy: await local.read() }, 'conversacion-diseno-copia-local.json'); }
      finally { local.close(); }
    }, true),
    send: async (message: string): Promise<boolean> => { let saved = false; await run(life => sendMessage(life, message, () => { saved = true; })); return saved; },
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
    executeSuggested: () => run(async life => { const action = current(life).next_action; if (action) await executeAction(life, action); }),
    executeAction: (kind: ConversationActionKind) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      const value = current(life), action: ConversationNextAction = { kind, intent: 'requested',
        instruction: value.understanding?.resolved_instruction || 'Crea el diseño con el texto, la marca y las referencias acordadas.',
        reference_ids: value.references.map(item => item.id), reason: 'Solicitaste esta acción mediante su botón.' };
      await save(life, value => ({ ...value, next_action: action })); await executeAction(life, action);
    }),
    startIdea: (idea: IdeaContent) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      if (!current(life).ideas.some(item => same(item, idea))) throw Error('Esta idea ya no pertenece a la conversación actual.');
      const action: ConversationNextAction = { kind: latest.current.format === 'html' ? 'create_html' : 'generate_image', intent: 'suggested', instruction: idea.render_instruction,
        reference_ids: idea.reference_ids, reason: 'Elegiste generar esta idea.' };
      await save(life, value => ({ ...value, next_action: action })); await executeAction(life, action);
    }),
    changeReferences: (items: PreparedPresentationReference[]) => run(async life => {
      await assertCurrent(life); if (current(life).pending) throw Error('conversation_pending_unresolved');
      await save(life, value => { const removed = value.references.filter(item => !items.some(next => next.id === item.id)).map(item => item.id);
        return { ...value, references: structuredClone(items), understanding: null, ideas: [], next_action: null,
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
      if (version.kind === 'html' && nextView === 'html') await latest.current.htmlController.current?.updateContext({ proposal: version.proposal });
      await save(life, value => ({ ...value, selected_version_id: id, next_action: null })); show(nextView);
      await refreshImage(life);
    }),
    recover: () => run(recoverAction, true),
    /** Closes a stuck request without replaying it. A late image still lands in Biblioteca. */
    discard: () => run(async life => {
      await loadConversation(life); if (!active(life)) return; await assertCurrent(life);
      const pending = current(life).pending; if (!pending) return;
      await save(life, value => completeConversationAction(value, pending.action_id, { next_action: null, message: {
        id: `assistant:${pending.action_id}`, turn_id: pending.turn_id, role: 'assistant',
        text: pending.kind === 'image' ? 'Descarté la espera de esta imagen. Si termina de generarse, la encontrarás en Biblioteca.'
          : 'Descarté la solicitud anterior. Puedes escribir de nuevo.' } }));
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
