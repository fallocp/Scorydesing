import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { X, Sparkles, Check, RefreshCw, ImagePlus } from 'lucide-react';
import type { DesignOperation } from '../../../supabase/functions/_shared/desaing/contracts';
import type { ExplorationScope } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { fullDesignImmutables, readPresentationFullDesign, ONBOARDING_DIRECTION_PREFIX } from '../../../supabase/functions/_shared/desaing/presentationFullDesign';
import { designSurfaceTarget, designSurfaceSessionId, designSurfaceBrand, type DesignSurfaceDestination, type ProductionImageAction } from '../../../supabase/functions/_shared/desaing/designSurface';
import type { ServerSnapshot } from '../../../supabase/functions/_shared/desaing/serverState';
import type { ServerGenerationCapabilities } from '../../../supabase/functions/_shared/desaing/serverGenerationContract';
import { getAssetReviewStatus, type RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { PresentationDesignService } from './PresentationDesignContext';
import { getSlideDimensions, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { approveServerLibraryDirection, assertDesignRegion, assertPresentationBrief, buildPresentationDirectionApproval, buildPresentationImageOperation, buildPresentationMediumOperation, mountServerPresentationAsset, prepareServerCapture, presentationDraftCandidate, presentationGenerationCapabilities, presentationLibraryResults, reviewedOnboardingDirection, reviewedProductionResult, isDirectProductionOperation, reviewServerLibraryResult, type DesignRegion } from '@/lib/presentations/presentationServerDesign';
import { composePresentationImage, sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { imageDataUrl } from '@/lib/desaing/labImages';
import { usePresentationExploration } from '@/lib/presentations/usePresentationExploration';
import { DesignExplorationPanel } from '@/components/desaing/DesignExplorationPanel';
import { VisualProposalGallery, type VisualProposalGalleryItem } from '@/components/desaing/VisualProposalGallery';
import { usePresentationVisualProposals } from '@/lib/presentations/usePresentationVisualProposals';
import { usePresentationReferences } from '@/lib/presentations/usePresentationReferences';
import { PresentationReferencePicker } from './PresentationReferencePicker';
import { MaterialsPanel } from '@/components/desaing/MaterialsPanel';
import { appendReviewedMaterialsBrief } from '@/lib/desaing/materialBrief';
import { projectVisualProposalSet } from '../../../supabase/functions/_shared/desaing/visualProposals';
import type { VisualProposalServerRead } from '@/lib/desaing/visualProposalController';
import './MountedImagesPanel.css';
import './ServerDesignPanel.css';

const sourceLabel = (type: DesignOperation['context']['target']['document_type']): string => ({
  image: 'Imagen', carousel: 'Carrusel', presentation: 'Presentación', cover: 'Portada', page: 'Página', special: 'Diseño especial',
})[type];
const briefExcerpt = (instruction: string): string => {
  const brief = instruction.replace(/\s+/g, ' ').trim();
  return brief.length > 100 ? `${brief.slice(0, 99)}…` : brief;
};

function describe(error: unknown, standalone = false): string {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
  const messages: Record<string, string> = {
    approved_copy_required: 'Escribe el texto aprobado que debe conservar el diseño completo.',
    onboarding_direction_changed: 'Cambió el borrador de marca. Revisa una dirección creada para su versión actual.',
    invalid_onboarding_context: 'La dirección no corresponde a este negocio y borrador de marca.',
    unsupported_full_design: 'El servidor no permite generar diseños completos ahora. Puedes recuperar resultados guardados.',
    server_response_unknown: 'No llegó la confirmación. Recupera el estado antes de iniciar otra pieza; conservamos la solicitud original.',
    server_capture_response_unknown: 'No se confirmó la captura. Reintenta con el mismo archivo; conservamos su identificador.',
    server_authentication_required: 'Inicia sesión para consultar tus piezas.', server_session_changed: 'Cambió la sesión. Cierra y vuelve a abrir este panel.',
    business_access_denied: 'Ya no tienes acceso a este negocio.', business_write_denied: 'Tu acceso permite consultar, pero no crear o aprobar piezas.',
    server_disabled: 'El servidor experimental todavía no está habilitado.', server_feature_disabled: 'La creación está pausada para este negocio.',
    server_policy_missing: 'Este negocio todavía no tiene configurado el experimento.', job_quota_exceeded: 'No hay cuota disponible para otra pieza.',
    slide_revision_conflict: 'La diapositiva cambió. Conservamos la pieza; abre la biblioteca desde la versión actual para reutilizarla.',
    invalid_mounted_region: 'La zona debe quedar dentro de la diapositiva.', unapproved_asset: 'Revisa y aprueba esta pieza antes de montarla.',
    asset_bytes_mismatch: 'El archivo no coincide con la versión registrada.',
    direction_approval_mismatch: 'La dirección guardada corresponde a otra versión. Recupera el estado antes de continuar.',
    server_review_conflict: 'Cambió la revisión de esta pieza. Recupera el estado para consultar su resultado.',
    server_generation_unavailable: 'La generación no está disponible. Puedes revisar y reutilizar tus piezas guardadas.',
    server_generation_outcome_unknown: 'No se pudo confirmar la generación. Recupera el estado de esta solicitud; no se enviará otra imagen automáticamente.',
    server_generation_expired: 'Terminó la ventana de generación. Puedes seguir revisando y reutilizando tus piezas.',
    server_previous_operation_unresolved: 'Hay una generación pendiente de resolver. Recupera su estado antes de crear otra pieza.',
    unsupported_server_generation: 'La solicitud guardada no coincide con la configuración de generación disponible. Conservamos sus datos.',
    server_generation_reference_limit: 'Una referencia supera el límite de generación. Conservamos la captura y la solicitud guardadas.',
    server_generation_configuration_invalid: 'La configuración del servidor no permite generar ahora. Puedes revisar las piezas guardadas.',
    server_generation_changed: 'Cambió la configuración de generación. Conservamos el borrador y sus referencias; no se cambiará de modelo para generar en media.',
    design_brief_too_large: 'El encargo supera el límite de texto disponible. Acórtalo antes de generar.',
    invalid_design_brief: 'Describe la pieza que quieres crear.',
    capture_exceeds_generation_limit: 'La referencia supera el tamaño permitido para esta generación. Conservamos la versión guardada.',
    invalid_capture_dimensions: 'No se pudo adaptar el tamaño de esta captura. Usa una imagen de hasta 24 megapíxeles.',
    exploration_context_changed: 'Cambió la captura, la zona o el encargo. Vuelve a explorar con el contexto actual antes de usar esta idea.',
  };
  const message = messages[code] ?? 'No se pudo completar la acción. La diapositiva y los trabajos guardados se conservan.';
  return standalone ? message.replace(/La diapositiva/g, 'El lienzo').replace(/la diapositiva/g, 'el lienzo') : message;
}

interface ServerDesignPanelProps {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  onApply?(next: PresentationSlide): void; onClose(): void;
  initialScope?: ExplorationScope;
  destination?: DesignSurfaceDestination;
  initialCopy?: string;
  initialInstruction?: string;
  onUseDesignForHtml?(asset: RegisteredAssetVersion, approvedCopy?: string): void;
  onUseBrandDirection?(asset: RegisteredAssetVersion, approvedCopy?: string): Promise<void> | void;
  productionSource?: RegisteredAssetVersion;
  productionCopyVersion?: string;
  productionPrompt?: string;
  initialProductionAction?: ProductionImageAction;
  onUseProductionResult?(asset: RegisteredAssetVersion, approvedCopy: string, operation: DesignOperation): Promise<void> | void;
}
/** Each scope owns its own hook lifetime and saved requests; switching never starts a render. */
export function ServerDesignPanel(props: ServerDesignPanelProps) {
  const onboarding = props.destination?.workspace === 'onboarding';
  const production = props.destination?.workspace === 'production';
  const [productionAction, setProductionAction] = useState<ProductionImageAction>(props.initialProductionAction ?? 'edit_image');
  const destination = props.destination?.workspace === 'production' ? { ...props.destination, action: productionAction } : props.destination;
  const [scope, setScope] = useState<ExplorationScope | null>(null), key = useRef('');
  useEffect(() => {
    let active = true;
    void props.service.client.session().then(session => {
      if (!active) return;
      const surface = props.destination ? designSurfaceSessionId(props.documentId, props.slide.id, 'asset_in_region', props.destination) : `${props.documentId}:${props.slide.id}`;
      key.current = `desaing-scope:${session.actorId}:${props.businessId}:${surface}`;
      const saved = localStorage.getItem(key.current);
      if (props.initialScope || onboarding || production) localStorage.setItem(key.current, onboarding || production ? 'full_design' : props.initialScope!);
      setScope(onboarding || production ? 'full_design' : props.initialScope ?? (saved === 'full_design' ? 'full_design' : 'asset_in_region'));
    }).catch(() => { if (active) setScope(onboarding || production ? 'full_design' : props.initialScope ?? 'asset_in_region'); });
    return () => { active = false; };
  }, [props.service.client, props.businessId, props.documentId, props.slide.id, props.initialScope,
    props.destination?.document_type, props.destination?.page_id, props.destination?.brand_id, props.destination?.brief_hash, onboarding, production]);
  if (!scope) return null;
  return <ServerDesignScopePanel key={`${scope}:${props.destination?.workspace ?? ''}:${props.destination?.document_type ?? ''}:${props.destination?.page_id ?? ''}:${props.destination?.brand_id ?? ''}:${onboarding ? `${props.slide.revision}:${props.destination?.brief_hash}` : production ? `${props.documentId}:${productionAction}` : ''}`} {...props} destination={destination} scope={scope} onProductionAction={setProductionAction} onScope={next => {
    if (key.current) localStorage.setItem(key.current, next); setScope(next);
  }} />;
}
function ServerDesignScopePanel({ service, businessId, documentId, slide, onApply, onClose, onUseDesignForHtml, onUseBrandDirection, scope, onScope, destination, initialCopy, initialInstruction,
  productionSource, productionCopyVersion, productionPrompt, onUseProductionResult, onProductionAction }: ServerDesignPanelProps & {
  scope: ExplorationScope; onScope(scope: ExplorationScope): void; onProductionAction(action: ProductionImageAction): void;
}) {
  const full = scope === 'full_design';
  const onboarding = destination?.workspace === 'onboarding';
  const production = destination?.workspace === 'production';
  const target = designSurfaceTarget(documentId, slide, destination);
  const targetSession = designSurfaceSessionId(documentId, slide.id, scope, destination);
  const client = service.client, canvas = useMemo(() => getSlideDimensions(slide.html), [slide.html]);
  const initialRegion = full ? { x: 0, y: 0, ...canvas } : { x: Math.round(canvas.width * .57), y: Math.round(canvas.height * .49), width: Math.round(canvas.width * .35), height: Math.round(canvas.height * .43) };
  const [region, setRegion] = useState<DesignRegion>(initialRegion);
  const [instruction, setInstruction] = useState(initialInstruction ?? '');
  const [materialsOpen, setMaterialsOpen] = useState(false);
  const materialsTrigger = useRef<HTMLButtonElement>(null);
  const [approvedCopy, setApprovedCopy] = useState(initialCopy ?? '');
  const [capture, setCapture] = useState<File | null>(null);
  const [productionPreview, setProductionPreview] = useState('');
  const effectiveInstruction = production && destination.action === 'regenerate_image' && productionPrompt && !instruction.includes(productionPrompt)
    ? [productionPrompt, instruction.trim() ? `Cambios solicitados:\n${instruction.trim()}` : ''].filter(Boolean).join('\n\n') : instruction;
  const [state, setState] = useState<ServerSnapshot | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [generation, setGeneration] = useState<ServerGenerationCapabilities | null>(null);
  const [operationKey, setOperationKey] = useState<string | null>(null);
  const [pending, setPending] = useState<DesignOperation | null>(null);
  const [libraryChoice, setLibraryChoice] = useState<RegisteredAssetVersion | null>(null);
  const [compareDraft, setCompareDraft] = useState(false);
  const [proposalReview, setProposalReview] = useState(false);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [operationBusy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [referenceInputBusy, setReferenceInputBusy] = useState(false);
  const requestRegion = useRef<DesignRegion>(initialRegion);
  const references = usePresentationReferences({ client, businessId, documentId, slideId: slide.id, destination, captureSlots: full && !capture ? 0 : 1 });
  const planner = useMemo(() => service.exploration?.createPlanner?.(businessId) ?? service.exploration?.planner, [service.exploration, businessId]);
  const exploration = usePresentationExploration({ planner: loading || !references.ready ? undefined : planner, client, businessId, documentId, slide,
    enabled: !loading && references.ready,
    instruction: effectiveInstruction, region: libraryChoice ? requestRegion.current : region, capture, scope, approvedCopy, destination, productionSource, productionCopyVersion,
    referenceScope: full ? { references: references.referenceScope.references } : references.referenceScope,
    restore(value) { setInstruction(value.instruction); setRegion(value.region); setCapture(value.capture); setApprovedCopy(value.approvedCopy ?? ''); } });
  const receiveProposalSnapshot = useCallback((response: VisualProposalServerRead) => {
    setState(response.state); setEnabled(response.enabled);
    setGeneration(presentationGenerationCapabilities(response.generation, service.simulation, response.state));
  }, [service.simulation]);
  const proposals = usePresentationVisualProposals({ client, businessId, documentId, slide,
    session: exploration.session, capture, region: libraryChoice ? requestRegion.current : region, scope, approvedCopy, destination, productionSource, productionCopyVersion,
    prepareSession: exploration.prepareVisualSession, onBind: exploration.bindVisualRender,
    referenceKey: references.referenceKey, recreateReferenceId: full ? undefined : references.recreateReferenceId, prepareReferences: references.prepare,
    simulation: service.simulation, disabled: loading || !references.ready || !exploration.ready || !service.exploration,
    onSnapshot: receiveProposalSnapshot });
  const otherBusy = operationBusy || exploration.busy || proposals.busy || references.busy;
  const busy = otherBusy || referenceInputBusy;
  const loadProposalPreview = useCallback(async (asset: Parameters<typeof client.asset>[0]) => imageDataUrl(await client.asset(asset)), [client]);
  const alive = useRef(true), locked = useRef(false), refreshing = useRef(false), initialized = useRef(false);
  const pendingRef = useRef<DesignOperation | null>(null), storageKey = useRef('');
  const openedActor = useRef('');
  const dialog = useRef<HTMLDivElement>(null), close = useRef<HTMLButtonElement>(null), frame = useRef<HTMLIFrameElement>(null);
  const cache = useRef<Record<string, string>>({});
  const job = state?.jobs.jobs.find(item => item.operation_key === operationKey);
  const call = job?.calls[0];
  const identity = call?.receipt?.outputs[0]?.asset;
  const output = identity ? state?.assets.versions.find(v => v.identity.asset_id === identity.asset_id && v.identity.version_id === identity.version_id) : undefined;
  const libraryResults = useMemo(() => state ? presentationLibraryResults(state, businessId)
    .filter(item => {
      const context = item.job.plan.operation.context;
      return !!readPresentationFullDesign(context) === full && (!production || context.workspace === 'production' && context.session_id === targetSession
        && context.copy_version_id === productionCopyVersion && context.actor_id === openedActor.current)
        && (!onboarding || context.workspace === 'onboarding'
        && context.session_id === targetSession && context.target.revision === String(slide.revision) && context.brand_id === businessId
        && context.immutable_elements.includes(`${ONBOARDING_DIRECTION_PREFIX}${destination?.brief_hash}.`)
        && context.actor_id === openedActor.current);
    }) : [], [state, businessId, full, onboarding, production, productionCopyVersion, targetSession, slide.revision, destination?.brief_hash]);
  const libraryResult = libraryChoice ? libraryResults.find(item => item.asset.identity.asset_id === libraryChoice.identity.asset_id
    && item.asset.identity.version_id === libraryChoice.identity.version_id) : undefined;
  const selected = libraryChoice ? state?.assets.versions.find(item => item.identity.asset_id === libraryChoice.identity.asset_id
    && item.identity.version_id === libraryChoice.identity.version_id) : output;
  const selectedInstruction = libraryResult?.job.plan.operation.context.instruction
    ?? (selected?.provenance.kind === 'image_operation' ? selected.provenance.effective_prompt : '');
  const isDraft = !!job && ['generate_image', 'recreate_asset', 'edit_image', 'regenerate_image'].includes(job.plan.operation.action)
    && job.plan.operation.image?.quality === 'low' && !isDirectProductionOperation(job.plan.operation);
  const isMedium = job?.plan.operation.action === 'generate_medium' || job?.plan.operation.action === 'approve_and_generate_medium';
  const canGenerate = enabled && !!generation && generation.remaining_outputs > 0 && (!full || !!generation.supports_full_design);
  const mediumSettingsMatch = !!generation && job?.plan.operation.image?.profile === generation.profile
    && job.plan.operation.image.executor === generation.executor;
  const candidate = isDraft && output ? presentationDraftCandidate(job!.plan.operation, output) : undefined;
  const direction = candidate ? state?.assets.direction_approvals.find(approval => approval.candidate.business_id === candidate.business_id
    && approval.candidate.asset_id === candidate.asset_id && approval.candidate.version_id === candidate.version_id
    && approval.candidate.candidate_id === candidate.candidate_id
    && JSON.stringify(approval.immutable_elements) === JSON.stringify(job!.plan.operation.context.immutable_elements)) : undefined;
  const parent = isMedium && job?.plan.operation.context.base_asset;
  const draft = parent ? state?.assets.versions.find(v => v.identity.asset_id === parent.asset_id && v.identity.version_id === parent.version_id) : undefined;
  const comparisonDraft = libraryChoice ? libraryResult?.draft : draft;
  const previewAsset = compareDraft && comparisonDraft ? comparisonDraft : selected;
  const previewKey = previewAsset ? `${previewAsset.identity.asset_id}:${previewAsset.identity.version_id}` : '';
  const preview = previews[previewKey];
  const approved = selected && state && getAssetReviewStatus(state.assets, selected.identity) === 'approved';
  const active = call && ['pending', 'running', 'result_received', 'validating'].includes(call.state);
  const reusable = libraryResults.filter(item => item.call.state === 'approved').map(item => item.asset);
  const pendingResults = libraryResults.filter(result => result.call.state === 'needs_review');
  const statuses: Record<string, string> = { pending: 'Solicitud guardada', running: 'Preparando la pieza…', result_received: 'Resultado recibido', validating: 'Validando archivo…',
    needs_review: 'Pieza lista para revisar', approved: 'Pieza aprobada', rejected: 'Pieza rechazada', failed: 'No se completó la pieza', cancelled: 'Solicitud cancelada', uncertain: 'Resultado pendiente de conciliación; no se reenviará automáticamente.' };
  const status = call?.state === 'needs_review' && isDraft ? direction ? 'Dirección aprobada' : 'Borrador listo para elegir dirección'
    : call?.state === 'needs_review' && isMedium ? 'Versión en media lista para revisar'
    : call?.state === 'approved' && isMedium ? 'Versión final aprobada' : call ? statuses[call.state] : '';
  useEffect(() => {
    let current = true; setProductionPreview('');
    if (production && productionSource) void client.asset(productionSource.identity).then(imageDataUrl).then(value => {
      if (current) setProductionPreview(value);
    }).catch(() => { if (current) setError('No se pudo leer la imagen original guardada.'); });
    return () => { current = false; };
  }, [client, production, productionSource?.identity.asset_id, productionSource?.identity.version_id]);

  function remember(value: DesignOperation | null) {
    // Fail before enqueue if the browser cannot retain the operation key for recovery.
    if (value) localStorage.setItem(storageKey.current, JSON.stringify(value));
    else localStorage.removeItem(storageKey.current);
    pendingRef.current = value; setPending(value);
  }
  async function refresh(recover = false) {
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      if (recover) await client.command(businessId, { kind: 'recover' });
      const response = await client.read(businessId);
      if (!alive.current) return;
      setState(response.state); setEnabled(response.enabled);
      setGeneration(presentationGenerationCapabilities(response.generation, service.simulation, response.state));
      if (!initialized.current) {
        const session = await client.session();
        if (!alive.current) return;
        openedActor.current = session.actorId;
        storageKey.current = `desaing-request:${session.actorId}:${businessId}:${destination ? targetSession : `${documentId}:${slide.id}${full ? ':full_design' : ''}`}${onboarding ? `:revision:${slide.revision}` : ''}`;
        const saved = localStorage.getItem(storageKey.current);
        let savedOperation: DesignOperation | null = null;
        if (saved) {
          try { savedOperation = JSON.parse(saved); } catch { throw new Error('invalid_saved_request'); }
          if (savedOperation?.context?.actor_id !== session.actorId || savedOperation.context.business_id !== businessId
            || savedOperation.context.target.document_id !== documentId || savedOperation.context.target.document_type !== target.document_type
            || savedOperation.context.target.slide_id !== target.slide_id || savedOperation.context.target.page_id !== target.page_id
            || !!readPresentationFullDesign(savedOperation.context) !== full) throw new Error('invalid_saved_request');
        }
        const latest = response.state.jobs.jobs.filter(j => j.plan.operation.context.target.document_id === documentId
          && j.plan.operation.context.target.document_type === target.document_type && j.plan.operation.context.target.slide_id === target.slide_id
          && j.plan.operation.context.target.page_id === target.page_id && j.plan.operation.context.actor_id === session.actorId
          && j.plan.operation.context.session_id === targetSession
          && (!onboarding || j.plan.operation.context.target.revision === String(slide.revision))
          && (!onboarding || j.plan.operation.context.immutable_elements.includes(`${ONBOARDING_DIRECTION_PREFIX}${destination?.brief_hash}.`))
          && !!readPresentationFullDesign(j.plan.operation.context) === full).at(-1);
        const restored = savedOperation ?? latest?.plan.operation;
        if (restored) { setOperationKey(restored.operation_key); setInstruction(restored.context.instruction);
          setApprovedCopy(readPresentationFullDesign(restored.context)?.approvedCopy ?? '');
          if (restored.context.placement) { const { units: _, ...savedRegion } = restored.context.placement.region; setRegion(savedRegion); }
        }
        if (savedOperation) { pendingRef.current = savedOperation; setPending(savedOperation); }
        initialized.current = true;
      }
      if (pendingRef.current && response.state.jobs.jobs.some(j => j.operation_key === pendingRef.current?.operation_key)) remember(null);
    } finally { refreshing.current = false; if (alive.current) setLoading(false); }
  }
  async function run(action: () => Promise<void>, closing = false) {
    if (locked.current) return;
    locked.current = true; setBusy(true); setError('');
    try {
      if (!closing && openedActor.current && (await client.session()).actorId !== openedActor.current) throw new Error('server_session_changed');
      if (alive.current) await action();
    } catch (problem) { if (alive.current) setError(describe(problem, !!destination)); }
    finally { locked.current = false; if (alive.current) setBusy(false); }
  }
  function closeDesign() {
    if (busy) return;
    void run(async () => {
      if (exploration.ready) await exploration.prepareVisualSession();
      if (alive.current) onClose();
    }, true);
  }
  useEffect(() => {
    alive.current = true; const previous = document.activeElement as HTMLElement | null; close.current?.focus();
    void refresh().catch(problem => { if (alive.current) setError(describe(problem, !!destination)); });
    return () => { alive.current = false; previous?.focus(); };
  }, []);
  useEffect(() => {
    const element = frame.current?.parentElement;
    if (!element) return;
    const resize = () => { if (frame.current) frame.current.style.transform = `scale(${element.clientWidth / canvas.width})`; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element);
    return () => observer.disconnect();
  }, [canvas.width]);
  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => { if (!locked.current) void refresh().catch(problem => { if (alive.current) setError(describe(problem, !!destination)); }); }, 1000);
    return () => clearInterval(timer);
  }, [active]);
  useEffect(() => {
    if (!previewAsset || cache.current[previewKey]) return;
    let current = true;
    client.asset(previewAsset.identity).then(imageDataUrl).then(url => { if (current && alive.current) {
      cache.current[previewKey] = url; setPreviews({ ...cache.current });
    } }).catch(problem => { if (current && alive.current) setError(describe(problem, !!destination)); });
    return () => { current = false; };
  }, [previewKey]);

  async function submit() {
    const preparedSelection = exploration.preparedSelection;
    const preparedProposal = preparedSelection && proposals.currentSet?.candidates.find(candidate =>
      candidate.selection.set_id === preparedSelection.set_id && candidate.selection.idea_id === preparedSelection.idea_id
      && candidate.selection.version === preparedSelection.version);
    if (!pendingRef.current && preparedProposal) {
      const next = await proposals.generate([preparedProposal.id]);
      const saved = next?.currentSet?.candidates.find(candidate => candidate.id === preparedProposal.id);
      if (saved?.operation && alive.current) {
        setOperationKey(saved.operation.operation_key); setLibraryChoice(null); setCompareDraft(false);
        await refresh();
      }
      return;
    }
    let operation = pendingRef.current;
    if (!operation) {
      const settings = generation;
      if (!enabled || !settings) throw new Error('server_generation_unavailable');
      assertPresentationBrief(effectiveInstruction, settings, full ? fullDesignImmutables(approvedCopy, canvas, destination) : undefined);
      if (full && !settings.supports_full_design) throw new Error('unsupported_full_design');
      if (!capture && !full) throw new Error('capture_required');
      assertDesignRegion(slide, region);
      const { actorId } = await client.session();
      let reference: RegisteredAssetVersion | undefined;
      if (capture) {
        const file = await prepareServerCapture(capture, settings.max_reference_edge);
        if (!alive.current) return;
        const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
        const hash = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, '0')).join('');
        const captureKey = `${storageKey.current}:capture`;
        const previousCapture = JSON.parse(localStorage.getItem(captureKey) ?? 'null');
        const uploadId = previousCapture?.hash === hash && previousCapture?.revision === slide.revision
          && typeof previousCapture?.uploadId === 'string' ? previousCapture.uploadId : crypto.randomUUID();
        localStorage.setItem(captureKey, JSON.stringify({ uploadId, hash, revision: slide.revision }));
        try { reference = await client.upload({ businessId, uploadId, brandId: designSurfaceBrand(destination), projectId: documentId }, file); }
        catch (error) {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'server_response_unknown') throw new Error('server_capture_response_unknown');
          throw error;
        }
      }
      if (!alive.current) return;
      const additionalReferences = await references.prepare(settings);
      if (!alive.current) return;
      operation = buildPresentationImageOperation({ businessId, actorId, documentId, slide, reference, region, instruction: effectiveInstruction,
        generation: settings, interactionMode: service.exploration ? exploration.mode : 'execute_change', operationKey: crypto.randomUUID(),
        additionalReferences, recreateReferenceId: full ? undefined : references.recreateReferenceId, scope, approvedCopy, destination, productionSource, productionCopyVersion });
      if (service.exploration) operation.operation_key = await exploration.bindRender(operation.operation_key);
      remember(operation);
    }
    await enqueue(operation);
  }
  async function enqueue(operation: DesignOperation) {
    setOperationKey(operation.operation_key); setLibraryChoice(null); setCompareDraft(false);
    try { await client.command(businessId, { kind: 'enqueue', operation }); }
    catch (error) {
      // These explicit rejections precede a write. Ambiguous responses/409 keep
      // the frozen request so a later recovery cannot silently create a new render.
      if (error && typeof error === 'object' && 'httpStatus' in error
        && [400, 401, 403, 413, 415, 422, 429].includes(Number(error.httpStatus))) {
        remember(null);
        const base = operation.context.base_asset;
        const original = base && state?.assets.versions.find(v => v.identity.asset_id === base.asset_id && v.identity.version_id === base.version_id);
        setOperationKey(original?.provenance.kind === 'image_operation' ? original.provenance.operation_key : null);
      }
      throw error;
    }
    if (alive.current) await refresh();
  }
  const previewHtml = useMemo(() => preview && previewAsset ? composePresentationImage(full
    ? `<style>html,body{margin:0;padding:0;width:${canvas.width}px;height:${canvas.height}px;overflow:hidden}.slide{position:relative;width:${canvas.width}px;height:${canvas.height}px;background:white}</style><main class="slide"></main>` : slide.html,
    preview, region, 'server-piece-preview', previewAsset.identity)
    : sanitizePresentationHtml(slide.html), [slide.html, preview, previewAsset, region, full, canvas]);
  const fixedRequest = !!operationKey || !!pending;
  const canNew = !pending && !active && (!call || !!direction || ['approved', 'rejected', 'failed', 'cancelled'].includes(call.state));
  function selectLibrary(asset: RegisteredAssetVersion) {
    if (!libraryChoice) requestRegion.current = { ...region };
    setLibraryChoice(asset); setCompareDraft(false); setRegion(initialRegion); setError('');
  }
  const proposalItems = useMemo<VisualProposalGalleryItem[]>(() => {
    if (!proposals.currentSet) return [];
    const projected = projectVisualProposalSet(proposals.currentSet, state);
    const labels: Record<string, string> = { unsubmitted: 'Sin generar', pending: 'Solicitud guardada', running: 'Generando borrador…',
      result_received: 'Resultado recibido', validating: 'Validando imagen…', needs_review: 'Borrador listo para revisar',
      approved: 'Resultado aprobado', rejected: 'Resultado rechazado', cancelled: 'Solicitud cancelada', failed: 'No se completó el borrador',
      uncertain: 'Pendiente de confirmar; recupera su estado' };
    return projected.map(view => {
      const versions = exploration.session?.sets.find(set => set.set_id === view.candidate.selection.set_id)?.ideas
        .filter(idea => idea.idea_id === view.candidate.selection.idea_id) ?? [];
      const isLatest = Math.max(...versions.map(idea => idea.version)) === view.candidate.selection.version;
      const local = proposals.views.find(item => item.candidate.id === view.candidate.id)?.submission_state;
      const status = view.state === 'unsubmitted' && (local === 'submitting' || local === 'uncertain') ? 'uncertain' : view.state;
      return { id: view.candidate.id, title: view.candidate.title, selection: view.candidate.selection,
        status, statusLabel: labels[status], isLatest, canGenerate: isLatest && status === 'unsubmitted' && (!local || local === 'saved'),
        asset: view.assets[0]?.identity, operationKey: view.candidate.operation?.operation_key, directionApproved: view.direction_approved,
        combined: view.candidate.sources.length > 1, instruction: view.candidate.instruction, model: view.model_ids.join(', ') || undefined,
        referenceCount: view.candidate.operation?.context.references.length ?? 0,
        reservedMicroUsd: view.job ? view.reserved_micro_usd : undefined,
        accountedMicroUsd: view.settled_micro_usd ?? undefined };
    });
  }, [proposals.currentSet, proposals.views, state, exploration.session]);
  function reviewProposal(item: VisualProposalGalleryItem) {
    if (!item.asset || !item.operationKey || busy) return;
    const operation = state?.jobs.jobs.find(value => value.operation_key === item.operationKey)?.plan.operation;
    if (!operation) return;
    setOperationKey(item.operationKey); setLibraryChoice(null); setCompareDraft(false); setProposalReview(true); setError('');
    if (operation.context.placement) {
      const { units: _, ...savedRegion } = operation.context.placement.region;
      setRegion(savedRegion);
    }
  }

  return <div className="mip-backdrop" onKeyDown={event => {
    if (materialsOpen) return;
    if (event.key === 'Escape' && !busy) closeDesign();
    if (event.key === 'Tab') {
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), summary') ?? []);
      const first = elements[0], last = elements.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><div ref={dialog} className="mip-dialog sdp-dialog" role="dialog" aria-modal={!materialsOpen} aria-hidden={materialsOpen || undefined}
    {...(materialsOpen ? { inert: '' } : {})} aria-labelledby="sdp-title" aria-busy={busy}>
    <header className="mip-header"><div><h2 id="sdp-title"><Sparkles size={21} />{onboarding ? 'Explorar la dirección de marca' : full ? destination ? 'Diseñar el lienzo completo' : 'Diseñar la diapositiva completa' : libraryChoice ? 'Revisar pieza guardada' : destination ? 'Crear una pieza para este lienzo' : 'Crear una pieza para este slide'}</h2>
      <p>{service.simulation ? 'Prueba con imágenes de muestra. No se usan modelos de IA ni se generan cargos.' : libraryChoice
        ? onboarding ? 'Revisa esta dirección antes de incorporarla al borrador de marca.' : 'Revisa esta pieza antes de reutilizarla en tu HTML.' : 'Genera un borrador y elige su dirección. Cada nueva versión necesita cupo disponible.'}</p></div>
      <button ref={close} className="mip-icon-button" aria-label="Cerrar creación de pieza" disabled={busy} onClick={closeDesign}><X size={20} /></button></header>
    <div className="mip-body sdp-body"><aside className="mip-library">
      {!onboarding && !production && <div className="sdp-mode" role="group" aria-label="Alcance del diseño">
        {(['asset_in_region', 'full_design'] as const).map(next => <button key={next} className="mip-button"
          aria-pressed={scope === next} disabled={busy || loading || !!pending || !!active || (next === 'full_design' && !generation?.supports_full_design && !full)}
          onClick={() => void run(async () => {
            if (exploration.ready) await exploration.prepareVisualSession();
            if (alive.current) onScope(next);
          })}>{next === 'full_design' ? 'Diseño completo' : 'Pieza en región'}</button>)}
      </div>}
      {production && <>
        <label className="sdp-field">Acción sobre la imagen<select aria-label="Acción sobre la imagen" value={destination.action ?? 'edit_image'}
          disabled={busy || loading || !!pending || !!active} onChange={event => {
            const next = event.target.value as ProductionImageAction;
            void run(async () => { if (exploration.ready) await exploration.prepareVisualSession(); if (alive.current) onProductionAction(next); });
          }}><option value="edit_image">Editar píxeles</option><option value="regenerate_image">Regenerar desde texto</option></select></label>
        {productionPreview && <img src={productionPreview} alt="Imagen original guardada" className="sdp-production-source" />}
        <p className="mip-note">{destination.action === 'regenerate_image' ? 'La solicitud usa el prompt original completo. La imagen anterior no se envía automáticamente como referencia.' : 'Se enviarán los píxeles de esta versión exacta y tus instrucciones de cambio.'}</p>
        <p className="mip-note" data-testid="production-output-size">Salida proporcional: {canvas.width} × {canvas.height} px. Original: {productionSource?.storage.width} × {productionSource?.storage.height} px. Sin recorte ni deformación.</p>
        <details><summary>Prompt original</summary><p className="sdp-original-prompt">{productionPrompt || 'Sin prompt guardado.'}</p></details>
        <p className="mip-note">Sunburst no está habilitado por la configuración y el presupuesto actuales.</p>
        <p className="mip-note">Las ideas parten del encargo y el texto confirmado. La imagen original se utiliza al generar la edición.</p>
      </>}
      {proposalReview && <button className="mip-button sdp-full" disabled={busy} onClick={() => setProposalReview(false)}>Volver a propuestas</button>}
      {service.exploration && !libraryChoice && <div className="sdp-mode" role="group" aria-label="Modo de diseño">
        <button className="mip-button" aria-pressed={exploration.mode === 'execute_change'} disabled={busy || !exploration.ready}
          onClick={() => void exploration.setMode('execute_change')}>Ejecutar cambio</button>
        <button className="mip-button" aria-pressed={exploration.mode === 'explore_design'} disabled={busy || !exploration.ready}
          onClick={() => void exploration.setMode('explore_design')}>Explorar diseño</button>
      </div>}
      {service.exploration && (!exploration.ready || exploration.mode === 'execute_change') && exploration.error && <div role="alert">
        <p className="mip-error">{exploration.error}</p>
        <button className="mip-button sdp-full" disabled={busy} onClick={() => void exploration.recover()}>Recuperar exploración</button>
      </div>}
      <label className="sdp-field">{onboarding ? 'Dirección que quieres explorar' : libraryChoice ? 'Encargo de la pieza seleccionada' : full ? '¿Qué diseño completo necesitas?' : '¿Qué pieza necesitas?'}<textarea
        aria-label={libraryChoice ? 'Encargo de la pieza seleccionada' : 'Descripción de la pieza'} value={libraryChoice ? selectedInstruction : instruction}
        maxLength={16000} rows={4} readOnly={!!libraryChoice} disabled={busy || loading || !exploration.ready || (!libraryChoice && fixedRequest)}
        placeholder="Un avión visto de perfil que combine con esta portada…" onChange={e => { if (!libraryChoice) setInstruction(e.target.value); }} /></label>
      {client.materials && !production && !libraryChoice && !fixedRequest && <button ref={materialsTrigger} className="mip-button" disabled={busy || loading || !exploration.ready}
        onClick={() => setMaterialsOpen(true)}>Materiales de referencia</button>}
      {full && <label className="sdp-field">{onboarding ? 'Nombre de marca confirmado' : 'Texto aprobado'}<textarea aria-label="Texto aprobado"
        value={(libraryResult || job) ? readPresentationFullDesign((libraryResult?.job ?? job)!.plan.operation.context)?.approvedCopy ?? approvedCopy : approvedCopy} maxLength={4000} rows={5}
        readOnly={onboarding || production} disabled={busy || loading || !exploration.ready || fixedRequest || !!libraryChoice} onChange={event => setApprovedCopy(event.target.value)}
        placeholder="Título y textos exactos que debe incluir el diseño" /><span className="mip-note">{onboarding ? 'El nombre procede de la ficha confirmada. Revisa sus letras en el resultado visual antes de aprobarlo.' : 'Al generar, autorizas usar literalmente este texto. Revisa las letras del resultado visual antes de aprobarlo.'}</span></label>}
      {!production && !fixedRequest && !libraryChoice && <label className="sdp-field">{full ? 'Diseño actual o referencia (opcional)' : destination ? 'Captura de este lienzo' : 'Captura de esta diapositiva'}<input className="sdp-capture" type="file" accept="image/png,image/jpeg,image/webp" disabled={busy || loading || !exploration.ready}
        onChange={e => setCapture(e.target.files?.[0] ?? null)} />{service.exploration && capture && <span className="mip-note" data-testid="exploration-capture-name">Captura conservada: {capture.name}</span>}</label>}
      {full && capture && !fixedRequest && !libraryChoice && <button className="mip-button" disabled={busy} onClick={() => {
        setCapture(null); const input = dialog.current?.querySelector<HTMLInputElement>('.sdp-capture'); if (input) input.value = '';
      }}>Quitar captura</button>}
      <p className="mip-note">{production ? 'Ejecutar cambio permite revisar y usar una imagen. Explorar diseño ofrece cinco ideas y revisión de borrador antes de generar en media. Aplicar conserva el original y crea una nueva versión.' : onboarding ? 'Explora cinco ideas, genera los borradores que elijas y revisa la versión en media. Usar una dirección la añade al borrador; guardar el perfil requiere otra acción explícita.' : full ? 'Puedes diseñar desde cero con tu texto aprobado o añadir referencias. Después de aprobarlo podrás reconstruir su HTML editable o dejarlo como imagen.' : libraryChoice ? `Estás revisando una pieza guardada. Ajusta la zona para probarla en este ${destination ? 'lienzo' : 'slide'}.` : fixedRequest ? 'La captura y la zona están guardadas con esta solicitud.' : 'Adjunta una captura de la versión actual. Se enviará como referencia junto con la zona marcada.'}</p>
      {!fixedRequest && !libraryChoice && <>
        <PresentationReferencePicker items={references.items} onChange={references.change} disabled={otherBusy || !references.ready} onBusyChange={setReferenceInputBusy}
          maxReferences={Math.max(0, Math.min(3, (generation?.max_references ?? 2) - (full && !capture ? 0 : 1)))} />
        {references.error && <p className="mip-error" role="alert">{references.error}</p>}
        {!full && references.items.some(item => item.role === 'object_reference') && <label className="sdp-field">Acción con las referencias
          <select aria-label="Acción con las referencias" value={references.recreateReferenceId ?? ''} disabled={busy || !references.ready}
            onChange={event => references.chooseSource(event.target.value || undefined)}>
            <option value="">Crear una composición</option>
            {references.items.filter(item => item.role === 'object_reference').map(item => <option key={item.id} value={item.id}
              disabled={!generation?.supports_recreation}>Recrear: {item.name}</option>)}
          </select>
          {references.recreateReferenceId && <span className="mip-note">La IA creará una pieza nueva y solicitará fondo transparente. Revisa sus detalles; no conserva los píxeles originales.</span>}
        </label>}
      </>}
      {!loading && !canGenerate && <p className="mip-note">La generación está pausada; puedes revisar y reutilizar piezas.</p>}
      {generation && <p className="mip-note" data-testid="server-generation-quota">Generaciones disponibles: {generation.remaining_outputs}.</p>}
      {canGenerate && generation?.remaining_outputs === 1 && !job && !pending && !libraryChoice && <p className="mip-note">
        Queda una generación. Si creas un borrador, no habrá cupo para generar después su versión en media con este presupuesto.</p>}
      {!job && !libraryChoice && <button className="mip-button mip-button-primary sdp-full" disabled={busy || loading || !canGenerate || (!pending && (!references.ready || (!full && !capture) || !effectiveInstruction.trim() || (full && !production && !approvedCopy.trim())))}
        onClick={() => void run(submit)}><Sparkles size={16} />{pending ? 'Reenviar solicitud guardada' : service.simulation ? 'Generar muestra' : production && exploration.mode === 'execute_change' ? 'Generar imagen' : 'Generar borrador'}</button>}
      {call && !libraryChoice && <p className="sdp-status" role="status">{status}</p>}
      {libraryChoice && <button className="mip-button sdp-full" disabled={busy} onClick={() => {
        setLibraryChoice(null); setCompareDraft(false); setRegion(requestRegion.current); setError('');
      }}>{destination ? 'Volver a la solicitud del lienzo' : 'Volver a la solicitud del slide'}</button>}
      <button className="mip-button sdp-full" disabled={busy || loading} onClick={() => void run(() => refresh(true))}><RefreshCw size={15} />Recuperar estado</button>
      {!libraryChoice && (active || call?.state === 'uncertain') && <button className="mip-button sdp-full" disabled={busy} onClick={() => void run(async () => {
        await client.command(businessId, { kind: 'cancel', operation_key: job!.operation_key }); if (alive.current) await refresh();
      })}>Cancelar solicitud</button>}
      {!libraryChoice && (job || pending) && <button className="mip-button sdp-full" disabled={busy || !canNew} onClick={() => {
        setOperationKey(null); setLibraryChoice(null); setCompareDraft(false); setCapture(null); setInstruction(''); setRegion(initialRegion); setError('');
      }}>Nueva pieza</button>}
      <section className="sdp-library" data-testid="server-pending-results"><h3>Resultados pendientes</h3>
        <p className="mip-note">{onboarding ? 'Direcciones de la versión actual de este borrador de marca. Revisarlas no genera imágenes.' : 'Incluye piezas de otras portadas y documentos de este negocio. Revisarlas no genera imágenes.'}</p>
        {pendingResults.length ? pendingResults.map(result => <button key={`${result.asset.identity.asset_id}:${result.asset.identity.version_id}`}
          data-testid={`server-result-${result.asset.identity.version_id}`} data-asset-id={result.asset.identity.asset_id} data-version-id={result.asset.identity.version_id}
          className="mip-button sdp-full sdp-result-button" disabled={busy}
          aria-pressed={libraryChoice?.identity.asset_id === result.asset.identity.asset_id && libraryChoice?.identity.version_id === result.asset.identity.version_id}
          onClick={() => selectLibrary(result.asset)}><span>{result.asset.provenance.kind === 'image_operation' && result.asset.provenance.quality === 'low' ? 'Revisar borrador' : 'Revisar versión en media'}</span>
          <small>{sourceLabel(result.job.plan.operation.context.target.document_type)} · {briefExcerpt(result.job.plan.operation.context.instruction)}</small>
          <small>{result.direction ? 'Dirección aprobada' : 'Pendiente de revisión'}</small></button>) : <p className="mip-note">No hay piezas pendientes de revisión.</p>}
      </section>
      <div className="sdp-library"><h3>Piezas aprobadas</h3><p className="mip-note">Reutilizar una pieza no genera otra imagen.</p>
        {reusable.length ? reusable.map((asset, index) => <button key={`${asset.identity.asset_id}:${asset.identity.version_id}`} className="mip-button sdp-full"
          disabled={busy} aria-pressed={libraryChoice?.identity.asset_id === asset.identity.asset_id && libraryChoice?.identity.version_id === asset.identity.version_id} onClick={() => selectLibrary(asset)}>
          <ImagePlus size={15} />Usar pieza guardada {index + 1}</button>) : <p className="mip-note">Las piezas aparecerán aquí al aprobarlas.</p>}</div>
    </aside><section className="mip-workspace">
      {service.exploration && exploration.mode === 'explore_design' && !libraryChoice && !proposalReview && proposalItems.length > 0 && <VisualProposalGallery
        items={proposalItems} busy={busy} ready={proposals.ready} error={proposals.error} enabled={canGenerate}
        remainingOutputs={generation?.remaining_outputs ?? 0} simulation={service.simulation} loadPreview={loadProposalPreview}
        onGenerate={ids => void proposals.generate(ids)} onRecover={() => void proposals.recover()} onReview={reviewProposal}
        onAdjust={selection => { void exploration.select(selection).then(() => {
          dialog.current?.querySelector('[data-testid="exploration-selected"]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }); }} />}
      {service.exploration && proposals.error && (proposalReview || !!libraryChoice || exploration.mode !== 'explore_design' || !proposalItems.length) && <div role="alert"><p className="mip-error">{proposals.error}</p>
        <button className="mip-button" disabled={busy} onClick={() => void proposals.recover()}>Recuperar propuestas</button></div>}
      {service.exploration && exploration.mode === 'explore_design' && !libraryChoice && !proposalReview && <DesignExplorationPanel
        session={exploration.session} busy={busy || loading || !exploration.ready} error={exploration.error}
        simulation={service.exploration.simulation ?? !service.exploration.createPlanner} canPlan={exploration.canPlan && (!full || production || !!approvedCopy.trim())} remainingAttempts={exploration.capabilities?.remaining_attempts}
        onPlanFive={() => void exploration.planFive()} onDiscuss={message => void exploration.discuss(message)}
        onSelect={selection => void exploration.select(selection)} onRefine={(selection, feedback) => void exploration.refine(selection, feedback)}
        onCombine={sources => void exploration.combine(sources)} onUseIdea={selection => void exploration.useIdea(selection)} onRecover={() => void exploration.recover()} />}
      <div className="mip-section-heading"><h3>{slide.title}</h3><span>{canvas.width} × {canvas.height} px</span></div>
      <div className="sdp-preview" style={{ aspectRatio: `${canvas.width}/${canvas.height}` }}><iframe ref={frame} title={onboarding ? 'Vista previa de dirección de marca' : 'Vista previa de pieza en HTML'} sandbox="" tabIndex={-1} srcDoc={previewHtml}
        style={{ width: canvas.width, height: canvas.height }} onLoad={e => {
          const frame = e.currentTarget; frame.style.transform = `scale(${frame.parentElement!.clientWidth / canvas.width})`;
        }} />{!full && <div className="sdp-zone" style={{ left: `${region.x / canvas.width * 100}%`, top: `${region.y / canvas.height * 100}%`, width: `${region.width / canvas.width * 100}%`, height: `${region.height / canvas.height * 100}%` }}>{!preview && <span>Zona de la pieza</span>}</div>}</div>
      {!full && <div className="mip-numeric-grid">{([['x', 'Izquierda'], ['y', 'Arriba'], ['width', 'Ancho'], ['height', 'Alto']] as const).map(([key, label]) => <label key={key}><span>{label} · px</span>
        <input type="number" aria-label={label} value={region[key]} min={key === 'x' || key === 'y' ? 0 : 1} disabled={busy || (fixedRequest && !libraryChoice)}
          onChange={e => setRegion(previous => ({ ...previous, [key]: Number(e.target.value) }))} /></label>)}</div>}
      {libraryResult && <div className="sdp-review" data-testid="server-library-review">
        <p className="sdp-source"><strong>Origen: {sourceLabel(libraryResult.job.plan.operation.context.target.document_type)}</strong>
          <span>Calidad: {libraryResult.asset.provenance.kind === 'image_operation' && libraryResult.asset.provenance.quality === 'low' ? 'borrador' : 'media'}</span></p>
        <p className="sdp-status" role="status">{libraryResult.direction ? 'Dirección aprobada' : statuses[libraryResult.call.state]}</p>
        {libraryResult.draft && <div className="sdp-comparison" role="group" aria-label="Comparar versiones">
          <button className="mip-button" aria-pressed={compareDraft} disabled={busy} onClick={() => setCompareDraft(true)}>Ver borrador aprobado</button>
          <button className="mip-button" aria-pressed={!compareDraft} disabled={busy} onClick={() => setCompareDraft(false)}>Ver versión en media</button>
          <p className="mip-note">Mostrando: {compareDraft ? 'borrador de la dirección aprobada' : 'nueva versión en media'}.</p>
        </div>}
        {libraryResult.call.state === 'needs_review' && (libraryResult.asset.provenance.kind === 'image_operation' && libraryResult.asset.provenance.quality === 'low' && !isDirectProductionOperation(libraryResult.job.plan.operation)
          ? <><p>{libraryResult.direction ? 'Esta dirección ya está elegida. Puedes comparar sus versiones en media desde los resultados pendientes.'
            : `Aprobar dirección guarda esta elección. El borrador no se convierte en una versión final ni se monta en el ${destination ? 'lienzo' : 'slide'}.`}</p>
            {!libraryResult.direction && ['generate_image', 'recreate_asset', 'edit_image', 'regenerate_image'].includes(libraryResult.job.plan.operation.action) && <button className="mip-button mip-button-primary"
              disabled={busy || !preview} onClick={() => void run(async () => {
                await approveServerLibraryDirection(client, businessId, libraryResult.asset.identity); if (alive.current) await refresh();
              })}><Check size={16} />Aprobar dirección</button>}</>
          : <><p>Revisa la versión en media y su borrador. Aprobarla permite reutilizarla; el montaje en este {destination ? 'lienzo' : 'slide'} es una acción posterior.</p>
            <button className="mip-button mip-button-primary" disabled={busy || !preview || compareDraft} onClick={() => void run(async () => {
              await reviewServerLibraryResult(client, businessId, libraryResult.asset.identity, 'approved'); if (alive.current) await refresh();
            })}><Check size={16} />Aprobar versión final</button></>)}
        {libraryResult.call.state === 'needs_review' && !libraryResult.direction && <button className="mip-button" disabled={busy || compareDraft} onClick={() => void run(async () => {
          await reviewServerLibraryResult(client, businessId, libraryResult.asset.identity, 'rejected'); if (alive.current) await refresh();
        })}>Rechazar pieza</button>}
        {libraryResult.call.state === 'approved' && <p>{onboarding ? 'Esta dirección está aprobada. Puedes incorporarla al borrador de marca.' : `Esta versión está aprobada. Puedes ajustar su zona y montarla en el ${destination ? 'lienzo' : 'slide'} actual.`}</p>}
        {libraryResult.call.state === 'rejected' && <p>Esta versión fue rechazada y no puede montarse.</p>}
      </div>}
      {output && !libraryChoice && <div className="sdp-review">
        {isDraft ? <><p>{direction ? 'La dirección está guardada. Generar en media crea una nueva versión basada en este borrador; después podrás comparar y revisar los detalles.'
          : `Este borrador permite elegir la dirección visual. Aprobar dirección guarda tu elección sin generar otra imagen ni modificar el ${destination ? 'lienzo' : 'slide'}.`}</p>
          {call?.state === 'needs_review' && (!direction ? <button className="mip-button mip-button-primary" disabled={busy || !preview} onClick={() => void run(async () => {
            const { actorId } = await client.session();
            await client.command(businessId, { kind: 'approve_direction', approval: buildPresentationDirectionApproval({ operation: job!.plan.operation, draft: output, actorId }) });
            if (alive.current) await refresh();
          })}><Check size={16} />Aprobar dirección</button> : <button className="mip-button mip-button-primary" disabled={busy || !canGenerate || !mediumSettingsMatch || !preview} onClick={() => void run(async () => {
            if (!enabled || !generation) throw new Error('server_generation_unavailable');
            const { actorId } = await client.session();
            const operation = buildPresentationMediumOperation({ operation: job!.plan.operation, draft: output, approval: direction,
              actorId, operationKey: crypto.randomUUID(), documentId, slide, generation, destination });
            remember(operation); await enqueue(operation);
          })}><Sparkles size={16} />Generar versión en media</button>)}
          {direction && generation && !mediumSettingsMatch && <p className="mip-note">Cambió la configuración de generación. Conservamos la dirección elegida y sus referencias; no se cambiará de modelo para generar en media.</p>}
        </> : <><p>Revisa esta nueva versión y compárala con la dirección elegida. Aprobar el resultado no modifica el {destination ? 'lienzo' : 'slide'}.</p>
          {draft && <div className="sdp-comparison" role="group" aria-label="Comparar versiones">
            <button className="mip-button" aria-pressed={compareDraft} disabled={busy} onClick={() => setCompareDraft(true)}>Ver borrador aprobado</button>
            <button className="mip-button" aria-pressed={!compareDraft} disabled={busy} onClick={() => setCompareDraft(false)}>Ver versión en media</button>
            <p className="mip-note">Mostrando: {compareDraft ? 'borrador de la dirección aprobada' : 'nueva versión en media'}.</p>
          </div>}
        {call?.state === 'needs_review' && <button className="mip-button mip-button-primary" disabled={busy || !preview || compareDraft} onClick={() => void run(async () => {
          await client.command(businessId, { kind: 'review', operation_key: job!.operation_key, call_key: call.call_key, decision: 'approved' }); if (alive.current) await refresh();
        })}><Check size={16} />Aprobar versión final</button>}</>}
        {call?.state === 'needs_review' && !direction && <button className="mip-button" disabled={busy} onClick={() => void run(async () => {
          await client.command(businessId, { kind: 'review', operation_key: job!.operation_key, call_key: call.call_key, decision: 'rejected' }); if (alive.current) await refresh();
        })}>Rechazar pieza</button>}</div>}
      <p className="mip-note">{production ? 'Revisa el texto, los detalles y el formato. Aprobar esta imagen no sustituye la versión guardada; aplicarla requiere el botón separado.' : onboarding ? 'Esta imagen es una propuesta de dirección. Aprobarla no publica el perfil ni modifica el prompt maestro.' : full ? 'Este resultado es una imagen. La conversión a HTML crea otra versión para revisar antes de aplicarla.' : `Los textos y la estructura del ${destination ? 'lienzo' : 'slide'} conservan su edición independiente.`}</p>
    </section></div>
    <footer className="mip-footer"><div>{error ? <p className="mip-error" role="alert">{error}</p> : <p className="mip-note">{loading ? 'Conectando con tus trabajos…' : 'Puedes cerrar este panel y recuperar el trabajo después.'}</p>}</div>
      {production && onUseProductionResult && <button className="mip-button mip-button-primary" disabled={busy || !approved || !preview || compareDraft}
        onClick={() => void run(async () => {
          if (!selected || !destination || !productionCopyVersion) throw new Error('unapproved_asset');
          const { actorId } = await client.session(); const response = await client.read(businessId);
          const reviewed = reviewedProductionResult(response.state, { businessId, actorId, documentId, surface: slide, destination,
            asset: selected.identity, copyVersion: productionCopyVersion });
          if ((await client.session()).actorId !== actorId) throw new Error('server_session_changed');
          if (alive.current) await onUseProductionResult(reviewed.asset, reviewed.approvedCopy, reviewed.operation);
        })}>Usar imagen aprobada</button>}
      {onboarding && onUseBrandDirection && <button className="mip-button mip-button-primary"
        disabled={busy || !approved || !preview || compareDraft || selected?.provenance.kind !== 'image_operation' || selected.provenance.quality !== 'medium'}
        onClick={() => void run(async () => {
          if (!selected || !destination) throw new Error('unapproved_asset');
          const { actorId } = await client.session();
          const response = await client.read(businessId);
          const reviewed = reviewedOnboardingDirection(response.state, { businessId, actorId, documentId, surface: slide, destination, asset: selected.identity });
          if ((await client.session()).actorId !== actorId) throw new Error('server_session_changed');
          if (alive.current) await onUseBrandDirection(reviewed.asset, reviewed.approvedCopy);
        })}>Usar dirección revisada</button>}
      {!onboarding && !production && full && onUseDesignForHtml && <button className="mip-button mip-button-primary" disabled={busy || !approved || !preview || compareDraft}
        onClick={() => void run(async () => {
          const response = await client.read(businessId), operation = libraryResult?.job.plan.operation ?? job?.plan.operation;
          if (!operation || !selected || getAssetReviewStatus(response.state.assets, selected.identity) !== 'approved'
            || selected.provenance.kind !== 'image_operation' || selected.provenance.quality !== 'medium') throw new Error('unapproved_asset');
          const design = readPresentationFullDesign(operation.context);
          if (!design) throw new Error('unsupported_full_design');
          if (alive.current) onUseDesignForHtml(selected, design.approvedCopy);
        })}>Usar diseño para HTML</button>}
      {!onboarding && !production && onApply && <button className="mip-button mip-button-primary" disabled={busy || !approved || !preview || compareDraft} onClick={() => void run(async () => {
        const next = await mountServerPresentationAsset(client, { businessId, documentId, slide, asset: selected!, region,
          replaceFullDesign: full, destination,
          ...(!libraryChoice && job ? { operationKey: job.operation_key } : {}) });
        if (!alive.current) return; onApply(next); onClose();
      })}><ImagePlus size={16} />{full ? 'Dejar como imagen' : 'Montar pieza aprobada'}</button>}</footer>
  </div>{materialsOpen && <MaterialsPanel client={client} businessId={businessId} returnFocus={materialsTrigger.current} onClose={() => setMaterialsOpen(false)}
    onUse={async selection => {
      if (!alive.current || fixedRequest || libraryChoice) throw new Error('materials_source_changed');
      setInstruction(appendReviewedMaterialsBrief(instruction, selection.text, 16000)); setMaterialsOpen(false);
    }} />}</div>;
}
