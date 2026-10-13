import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckStyleKit } from '@/lib/presentations/designConversationHtml';
import { measureDesignSpec, measureRoleSheet, measureStyleSamples, measureStyleSamplesCached, styleMeasureCause, type DesignSpecResult } from '@/lib/presentations/styleSpec';
import { inferStyleUnlocks } from '@/lib/presentations/styleLock';
import { buildTransferPlan, describeTransferRows, parseStyleAssertions, styleSourceSlide, transferPalette } from '@/lib/presentations/styleTransfer';
import { describeConversationDesignSource } from '@/lib/presentations/designConversationSource';
import { designActionLabel, isDesignConfirmation, isDesignGeneration, needsResolvedCopy } from '@/lib/presentations/designConversationConfirmation';
import { deckPickFor, measureDeckSystem, type DeckSystem } from '@/lib/presentations/deckSystem';
import type { DesignUnderstanding } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import { buildDesignRepairFeedback, describeVisualReview } from '@/lib/presentations/designVisualReview';
import { ArrowUp, Check, ImagePlus, Layers, Loader2, MessageSquare, Pencil, Plus, Shapes, Sparkles, Undo2, Wand2, X } from 'lucide-react';
import type { PresentationSlide } from '@/lib/presentations/presentationDocument';
import { getSlideDimensions, reviseSlide } from '@/lib/presentations/presentationDocument';
import type { DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import type { DesignConversationSessionId } from '../../../supabase/functions/_shared/desaing/conversationSessions';
import type { PresentationDesignService } from './PresentationDesignContext';
import { useDesignConversation, type DesignConversationView } from '@/lib/presentations/useDesignConversation';
import { useImageGenerationSettings } from '@/hooks/useImageGenerationSettings';
import { ImageGenerationControls } from '@/components/image-generation/ImageGenerationControls';
import { PRESENTATION_IMAGE_MODELS } from '@/lib/presentations/presentationServerDesign';
import { PresentationReferencePicker } from './PresentationReferencePicker';
import { ReferenceImportPicker } from './ReferenceImportPicker';
import { PresentationCanvas } from './PresentationCanvas';
import { addPresentationReference, preparePresentationReference } from '@/lib/presentations/presentationReferences';
import { sameHtmlDesignTarget } from '@/lib/presentations/htmlDesignDraft';
import { versionReview } from '@/lib/presentations/designConversationStore';
import { SlideGeneratorPanel, type SlideGeneratorController, type SlideGeneratorState } from './SlideGeneratorPanel';
import { DesignToHtmlPanel, type DesignToHtmlController, type DesignToHtmlState } from './DesignToHtmlPanel';
import { DeckSystemPanel, DesignScreenLayout, DesignSteps, DesignZoomCanvas, SlideThumbnails } from './DesignScreen';
import './UnifiedDesignWorkspace.css';

export interface UnifiedDesignWorkspaceProps {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  destination?: DesignSurfaceDestination; initialInstruction?: string; initialCopy?: string; initialView?: 'image' | 'html';
  projectName?: string; presentationName?: string;
  /** Current presentation, including saved edits, for context and visual references. */
  deckSlides?: ReadonlyArray<PresentationSlide>;
  onApply(slide: PresentationSlide): void | Promise<void>; onInsert?(slide: PresentationSlide): void | Promise<void>; onClose(): void;
  /** 'screen': full-screen design (VITE_DESAING_DESIGN_SCREEN) with the natural chat. Default: the popup. */
  layout?: 'popup' | 'screen';
  /** Design screen: the URL owns slide, session and format. */
  initialSession?: DesignConversationSessionId; urlFormat?: 'html' | 'image';
  onSelectSlide?(index: number): void; onSessionChange?(session: DesignConversationSessionId): void; onFormatChange?(format: 'html' | 'image'): void;
}

/** Measured slides (base and deck) are cached per HTML. */
const measureSlide = (html: string) => measureStyleSamplesCached(html, getSlideDimensions(html));
const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const UNLOCK_LABELS = { typography: 'tipografía', colors: 'colores', components: 'estilo de tarjetas', layout: 'acomodo' } as const;

/** One conversation owns context. Image/HTML engines are tools inside this workspace. */
export function UnifiedDesignWorkspace(props: UnifiedDesignWorkspaceProps) {
  const { settings, setSettings } = useImageGenerationSettings(props.businessId, 'design-conversation');
  const htmlController = useRef<SlideGeneratorController | null>(null), compositionController = useRef<DesignToHtmlController | null>(null);
  const htmlState = useRef<SlideGeneratorState | null>(null), compositionState = useRef<DesignToHtmlState | null>(null);
  const [view, setView] = useState<DesignConversationView>(props.initialView ?? 'image');
  const [applyTarget, setApplyTarget] = useState<'current' | 'new'>('current');
  const onView = useCallback((next: DesignConversationView) => setView(next), []);
  const screen = props.layout === 'screen';
  const applyResult = useCallback(async (next: PresentationSlide) => {
    if (applyTarget === 'new' && props.onInsert) await props.onInsert(next); else await props.onApply(next);
    // The screen stays open on the applied slide; the popup closes.
    if (!screen) props.onClose();
  }, [applyTarget, props.onApply, props.onInsert, props.onClose, screen]);
  // Formato y base los elige el usuario; la IA sólo puede proponer acciones de ese formato.
  const [format, setFormat] = useState<'html' | 'image'>(props.initialView === 'html' ? 'html' : 'image');
  // «Sistema de la presentación» (VITE_DESAING_DECK_SYSTEM): measured without AI from this presentation of this business only.
  const deckFlags = props.service.deckSystem, deckScope = `${props.businessId}:${props.documentId}`;
  const deckIndex = Math.max(0, props.deckSlides?.findIndex(slide => slide.id === props.slide.id) ?? 0);
  const deckFingerprint = useMemo(() => (props.deckSlides ?? []).map(slide => `${slide.id}:${slide.revision}`).join(','), [props.deckSlides]);
  const [deckMeasure, setDeckMeasure] = useState<{ scope: string; fingerprint: string; system: DeckSystem | null; status: 'measuring' | 'ready' | 'failed' } | null>(null);
  // Never another business's or presentation's system.
  const deckFound = deckFlags && deckMeasure?.scope === deckScope ? deckMeasure.system : null, deckArrangement = !!deckFlags?.arquetipo;
  const deckSystem = deckFlags && deckFound ? { system: deckFound, flags: deckFlags } : undefined;
  // What the arrangement pick reads (last request, copy, the planner's choice); set after each conversation change.
  const [deckAsk, setDeckAsk] = useState<{ message: string; copy: string; understanding: DesignUnderstanding | null }>({ message: '', copy: '', understanding: null });
  const deckExemplar = useMemo(() => deckFound && deckArrangement
    ? deckPickFor(deckFound, { number: deckIndex + 1, message: deckAsk.message, copy: deckAsk.copy, understanding: deckAsk.understanding })?.archetype.exemplarId
    : undefined, [deckFound, deckArrangement, deckIndex, deckAsk]);
  // Kit de estilo: hasta 3 diapositivas con contenido, las más cercanas a la actual; con el sistema, el ejemplar del acomodo elegido.
  const deckKit = useMemo(() => props.deckSlides?.length ? buildDeckStyleKit(props.deckSlides, props.slide.id, deckExemplar ? { exemplarId: deckExemplar } : undefined) : null,
    [props.deckSlides, props.slide.id, deckExemplar]);
  const deckBaseHtml = deckKit?.ids[0] ? props.deckSlides?.find(slide => slide.id === deckKit.ids[0])?.html : undefined;
  const [chosenBase, setBase] = useState<'current' | 'version' | 'deck' | 'new'>(() => props.slide.html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, '').trim() ? 'current' : deckKit?.slides.length ? 'deck' : 'new');
  const [versionStyleSource, setVersionStyleSource] = useState<string | null>(null);
  // Ficha de estilo: se mide del diseño base (la diapositiva, o la diapositiva del deck más cercana) en el navegador.
  const specSource = format !== 'html' || chosenBase === 'new' ? null : chosenBase === 'deck'
    ? props.deckSlides?.find(slide => slide.id === deckKit?.ids[0])?.html ?? null
    : chosenBase === 'version' ? versionStyleSource ?? props.slide.html : props.slide.html;
  const flags = props.service.fromExisting;
  // `failed`: concrete cause when the base could not be measured ('' = no failure).
  const [styleSpec, setStyleSpec] = useState({ source: '', spec: '', scale: '', failed: '' });
  const specJob = useRef<{ source: string; base: Promise<DesignSpecResult>; full: Promise<DesignSpecResult> } | null>(null);
  const specSourceRef = useRef(specSource); specSourceRef.current = specSource;
  // Slides measured for the standard scale: the base plus the nearest deck slides.
  const scaleSlides = useMemo(() => {
    if (!flags?.escala || !props.deckSlides?.length) return [];
    const index = Math.max(0, props.deckSlides.findIndex(slide => slide.id === props.slide.id));
    return props.deckSlides.map((slide, position) => ({ slide, distance: Math.abs(position - index) }))
      .filter(item => item.slide.html.trim()).sort((a, b) => a.distance - b.distance).slice(0, 6).map(item => item.slide.html);
  }, [flags?.escala, props.deckSlides, props.slide.id]);
  useEffect(() => {
    if (!specSource) return;
    let alive = true;
    // The base is measured first and alone; the nearby slides only refine the scale.
    const job = measureDesignSpec({ base: specSource, nearby: scaleSlides, withScale: !!flags?.escala, measure: measureSlide });
    specJob.current = { source: specSource, ...job };
    const show = (result: DesignSpecResult) => { if (alive) setStyleSpec({ source: specSource, spec: result.spec, scale: result.scale, failed: '' }); };
    job.base.then(show, problem => { if (alive) setStyleSpec({ source: specSource, spec: '', scale: '', failed: styleMeasureCause(problem) }); });
    job.full.then(show, () => {});
    return () => { alive = false; };
  }, [specSource, scaleSlides, flags?.escala]);
  const spec = specSource && styleSpec.source === specSource ? styleSpec.spec : '';
  const specFailed = specSource && styleSpec.source === specSource ? styleSpec.failed : '';
  const scaleLine = specSource && styleSpec.source === specSource ? styleSpec.scale : '';
  /** The base's spec always arrives (with the deck scale if it is ready within 3 s more).
   * Rejects with the concrete cause when the base cannot be measured. */
  const styleSpecReady = useCallback(async () => {
    const job = specJob.current;
    if (!job || job.source !== specSourceRef.current) return '';
    const base = await job.base;
    return (await Promise.race([job.full.then(result => result.spec, () => ''), sleep(3000).then(() => '')])) || base.spec;
  }, []);
  const work = useDesignConversation({ ...props, onApply: applyResult, settings, htmlController, compositionController, htmlState, compositionState, onView,
    format, base: chosenBase, deckStyle: deckKit?.slides, deckBaseHtml, styleSpec: spec,
    ...(flags ? { fromExisting: flags, styleSpecReady } : {}), ...(deckSystem ? { deckSystem } : {}),
    ...(screen ? { natural: true, ...(props.initialSession ? { initialSession: props.initialSession } : {}) } : {}) });
  const [previewOriginal, setPreviewOriginal] = useState(false);
  const [message, setMessage] = useState(props.initialInstruction ?? ''), [referencesOpen, setReferencesOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false), [localError, setLocalError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [htmlUi, setHtmlUi] = useState<Pick<SlideGeneratorState, 'ready' | 'busy' | 'error' | 'status' | 'proposal'>>({ ready: false, busy: false, error: '', status: 'ready', proposal: null });
  const [compositionUi, setCompositionUi] = useState({ ready: false, busy: false, error: '', canApply: false });
  const history = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null), hydrated = useRef<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const sessionIdentity = work.sessionToken ?? 'main';
  const sessionIdentityRef = useRef(sessionIdentity); sessionIdentityRef.current = sessionIdentity;
  const previousSession = useRef(sessionIdentity);
  const state = work.state, canvas = getSlideDimensions(props.slide.html);
  const deckRequest = [...state.messages].reverse().find(item => item.role === 'user' && !isDesignConfirmation(item.text))?.text ?? '';
  const deckChoice = JSON.stringify([state.understanding?.archetype_id ?? null, state.understanding?.variation ?? null]);
  useEffect(() => { if (deckFlags) setDeckAsk({ message: deckRequest, copy: state.copy.text, understanding: state.understanding }); },
    [deckFlags, deckRequest, state.copy.text, deckChoice]);
  // The deck is measured once per revision of its slides (cached per id:revision); the brand name separates its brand title from titles.
  const deckBrand = (state.brand ?? work.brand.context)?.name ?? '';
  useEffect(() => {
    const slides = props.deckSlides;
    if (!deckFlags || !slides || slides.length < 2) return;
    let alive = true;
    setDeckMeasure(old => ({ scope: deckScope, fingerprint: deckFingerprint, system: old?.scope === deckScope ? old.system : null, status: 'measuring' }));
    void measureDeckSystem({ key: `${deckScope}:${deckBrand}`, slides, current: deckIndex, measure: html => measureStyleSamples(html, getSlideDimensions(html), 8000, deckBrand) })
      .then(result => { if (alive) setDeckMeasure({ scope: deckScope, fingerprint: deckFingerprint, system: result.system, status: result.system ? 'ready' : 'failed' }); },
        () => { if (alive) setDeckMeasure({ scope: deckScope, fingerprint: deckFingerprint, system: null, status: 'failed' }); });
    return () => { alive = false; };
  }, [deckFlags, deckScope, deckFingerprint, deckBrand]);
  const selected = state.versions.find(item => item.id === state.selected_version_id);
  useEffect(() => { setVersionStyleSource(selected?.kind === 'html' ? selected.proposal.html : null); }, [selected]);
  // Restoring or selecting a saved design continues from that exact version.
  // Depending only on its identity preserves a later explicit base choice.
  useEffect(() => { if (selected) { setBase('version'); setPreviewOriginal(false); } }, [selected?.id, selected?.kind]);
  // Design screen: the URL follows the session and the format, so a reload reopens them.
  useEffect(() => { if (screen && work.ready && work.activeSession) props.onSessionChange?.(work.activeSession); }, [screen, work.ready, work.activeSession]);
  useEffect(() => { if (screen) props.onFormatChange?.(format); }, [screen, format]);
  // Las imágenes generadas pueden servir como base de otra imagen; HTML conserva su propia versión editable.
  const canUseVersion = selected?.kind === 'html' || format === 'image' && selected?.kind === 'image';
  const base = chosenBase === 'version' && !canUseVersion ? 'current' : chosenBase;
  const result = work.imageResult;
  const busy = work.busy || htmlUi.busy || compositionUi.busy;
  const blocked = busy || fileBusy || importBusy || !work.ready || !!work.syncStatus && work.syncStatus !== 'synced';
  const pending = !!state.pending;
  // Same predicate as the plan itself: the initial pending copy never blocks a direct edit.
  const copyPending = state.copy.status === 'pending' && needsResolvedCopy(state.next_action?.kind);
  const pendingQuestions = state.understanding?.pending_questions ?? [];
  const designPending = copyPending || pendingQuestions.length > 0;
  const brand = state.brand ?? work.brand.context;
  const source = props.destination?.document_type ?? 'presentation';
  const title = source === 'presentation' ? 'Diseñar diapositiva' : source === 'cover' ? 'Diseñar portada' : source === 'page' ? 'Diseñar página' : 'Diseñar una pieza';
  const slideIndex = props.deckSlides?.findIndex(slide => slide.id === props.slide.id) ?? -1;
  const location = [props.projectName && `Proyecto: ${props.projectName}`, source === 'presentation' && props.presentationName && `Presentación: ${props.presentationName}`,
    source === 'presentation' && slideIndex >= 0 && `Diapositiva ${slideIndex + 1} de ${props.deckSlides!.length}`].filter(Boolean).join(' · ');
  const baseLabel = base === 'version' ? 'Esta versión' : base === 'deck' ? 'Estilo de la presentación' : base === 'new' ? 'Referencias y marca'
    : source === 'presentation' ? 'Diapositiva original' : 'Diseño original';
  const currentTarget = { document: props.documentId, slide: props.slide.id, revision: props.slide.revision };
  const editableHtml = htmlUi.ready && htmlUi.status === 'ready' && !!htmlUi.proposal && sameHtmlDesignTarget(htmlUi.proposal.target, currentTarget);
  const canEdit = !blocked && !pending && (view === 'composition' ? compositionUi.canApply : view === 'html' && editableHtml);
  const receiveHtmlState = useCallback((next: SlideGeneratorState) => {
    if (sessionIdentityRef.current !== sessionIdentity) return;
    htmlState.current = next;
    setHtmlUi(old => old.ready === next.ready && old.busy === next.busy && old.error === next.error && old.status === next.status
      && old.proposal?.html === next.proposal?.html && !!old.proposal?.pending === !!next.proposal?.pending
      && (!old.proposal && !next.proposal || sameHtmlDesignTarget(old.proposal?.target, next.proposal?.target))
      ? old : { ready: next.ready, busy: next.busy, error: next.error, status: next.status, proposal: next.proposal });
  }, [sessionIdentity]);
  const receiveCompositionState = useCallback((next: DesignToHtmlState) => {
    if (sessionIdentityRef.current !== sessionIdentity) return;
    compositionState.current = next;
    setCompositionUi(old => old.ready === next.ready && old.busy === next.busy && old.error === next.error && old.canApply === next.canApply
      ? old : { ready: next.ready, busy: next.busy, error: next.error, canApply: next.canApply });
  }, [sessionIdentity]);
  useEffect(() => {
    if (previousSession.current === sessionIdentity) return;
    previousSession.current = sessionIdentity; hydrated.current = null;
    setMessage(''); setReferencesOpen(false); setConfirmReset(false); setLocalError(''); setApplyTarget('current');
    setFormat(props.initialView === 'html' ? 'html' : 'image');
    setBase(props.slide.html.replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, '').trim() ? 'current' : deckKit?.slides.length ? 'deck' : 'new');
    setVersionStyleSource(null); htmlState.current = null; compositionState.current = null;
    setHtmlUi({ ready: false, busy: false, error: '', status: 'ready', proposal: null }); setCompositionUi({ ready: false, busy: false, error: '', canApply: false });
  }, [sessionIdentity]);
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [state.messages.length, state.ideas, busy, work.liveReply, work.steps?.length]);
  useEffect(() => {
    if (work.ready && hydrated.current !== sessionIdentity) {
      hydrated.current = sessionIdentity;
      // A format named in the URL (design screen) wins over the saved preference.
      if (state.preferences) { const urlFormat = screen ? props.urlFormat : undefined;
        setFormat(urlFormat ?? state.preferences.format);
        setBase(urlFormat === 'image' && state.preferences.base === 'deck' ? 'current' : state.preferences.base); }
      if (state.messages.length) setMessage(''); composer.current?.focus();
    }
  }, [work.ready, state.messages.length, state.preferences, sessionIdentity]);
  async function act(task: () => Promise<unknown>) {
    setLocalError('');
    try { await task(); } catch (problem) { setLocalError(problem instanceof Error ? problem.message : 'No se pudo completar la acción. Tu trabajo se conserva.'); }
  }
  async function send(text = message) {
    if (!text.trim() || blocked || pending) return;
    await act(async () => { if (await work.send(text.trim())) setMessage(''); });
  }
  async function changePreferences(nextFormat: typeof format, nextBase: typeof chosenBase) {
    if (blocked || pending) return;
    await act(async () => {
      await work.setPreferences({ format: nextFormat, base: nextBase });
      setFormat(nextFormat); setBase(nextBase);
    });
  }
  async function paste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (blocked || pending) return;
    const image = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))?.getAsFile();
    if (!image) return;
    event.preventDefault(); setFileBusy(true);
    try { const prepared = await preparePresentationReference(image, 'image_style_reference'); await work.changeReferences(addPresentationReference(state.references, prepared, 3)); setReferencesOpen(true); }
    catch (problem) { setLocalError(problem instanceof Error ? problem.message : 'No se pudo añadir la imagen.'); }
    finally { setFileBusy(false); }
  }
  const approved = result?.call.state === 'approved';
  const quality = result?.asset.provenance.kind === 'image_operation' ? result.asset.provenance.quality : undefined;
  const selectedTargetCurrent = !!selected && sameHtmlDesignTarget(selected.target, currentTarget);
  const canApply = selectedTargetCurrent && (view === 'image' ? approved : view === 'composition' ? compositionUi.canApply
    : view === 'html' && selected.kind === 'html' && !selected.proposal.pending && editableHtml && !htmlUi.proposal?.pending
      && htmlUi.proposal?.html === selected.proposal.html);
  const error = localError || work.error;
  // «Lo que tienes / Lo que pides / Qué cambio / Qué conservo», built locally from the spec and the plan (no AI).
  const lastAsk = [...state.messages].reverse().find(item => item.role === 'user')?.text ?? '';
  const plan = state.next_action && isDesignGeneration(state.next_action.kind) ? state.next_action : null;
  const unlocked = state.understanding?.unlock ? [...new Set([...state.understanding.unlock, ...inferStyleUnlocks(lastAsk)])] : null;
  const comparison = flags?.candado_estilo && format === 'html' && plan && state.understanding ? {
    have: scaleLine || (specFailed ? `Ficha no disponible: ${specFailed}` : spec.split('\n').find(line => line.startsWith('- ')) ?? 'El diseño actual'),
    ask: lastAsk.slice(0, 300),
    change: `${plan.instruction.split(/(?<=[.!?])\s/)[0].slice(0, 220)} ${unlocked ? unlocked.length
      ? `Desbloqueo: ${unlocked.map(item => UNLOCK_LABELS[item]).join(', ')}.` : 'Sin desbloquear estilos.' : 'Sólo aviso las diferencias de estilo.'}`,
    keep: [(Object.keys(UNLOCK_LABELS) as Array<keyof typeof UNLOCK_LABELS>).filter(item => !unlocked?.includes(item)).map(item => UNLOCK_LABELS[item]).join(', '),
      ...state.understanding.preserve.slice(0, 3)].filter(Boolean).join('; ') || 'Nada: desbloqueaste todo el estilo.',
  } : null;
  // «Estilo de la diapositiva N»: the accents the transfer will apply, shown as «elemento → propuesta» before executing (no AI).
  const transferSource = flags?.transferencia && format === 'html' && plan && props.deckSlides?.length
    ? styleSourceSlide(lastAsk, props.deckSlides.length, slideIndex + 1) : null;
  const accentKey = transferSource && specSource ? JSON.stringify([transferSource, lastAsk, state.understanding?.accent_plan ?? [], specSource.length]) : '';
  const [accentRows, setAccentRows] = useState<{ key: string; rows: Array<{ element: string; proposal: string }> } | null>(null);
  useEffect(() => {
    if (!accentKey || !transferSource || !specSource) return;
    let alive = true;
    const sourceHtml = props.deckSlides![transferSource - 1].html, brandName = brand?.name ?? '';
    void Promise.all([measureRoleSheet(sourceHtml, getSlideDimensions(sourceHtml), brandName), measureRoleSheet(specSource, getSlideDimensions(specSource), brandName)])
      .then(([source, target]) => {
        const assertions = parseStyleAssertions(lastAsk), palette = transferPalette(brand ? Object.values(brand.colors).filter(Boolean) : [], source);
        const plan = buildTransferPlan(source, target, { planned: state.understanding?.accent_plan, assertions, palette });
        if (alive) setAccentRows({ key: accentKey, rows: describeTransferRows(plan, target, assertions, palette) });
      }, () => { if (alive) setAccentRows({ key: accentKey, rows: [] }); });
    return () => { alive = false; };
  }, [accentKey]);
  const accentTable = transferSource && accentRows?.key === accentKey && <div className="dc-accent-plan">
    <p>Copio sin IA el estilo de la diapositiva {transferSource} (tipografía de la escala, colores, líneas y tarjetas) y después lo comparo con el resultado.</p>
    {accentRows.rows.length ? <table className="dc-accent-table"><caption>Acentos propuestos</caption>
      <thead><tr><th scope="col">Elemento</th><th scope="col">Propuesta</th></tr></thead>
      <tbody>{accentRows.rows.map(row => <tr key={row.element}><th scope="row">{row.element}</th><td>{row.proposal}</td></tr>)}</tbody></table>
      : <p className="dc-muted">La diapositiva {transferSource} no tiene acentos de color que repetir aquí.</p>}
    <p className="dc-muted">Confirma o escribe qué palabras cambiar, por ejemplo: «en el título, coral sólo “flujo”».</p></div>;
  const versionPrompt = flags?.prompt_base && selected?.kind === 'image' ? state.version_prompts?.[selected.id]
    ?? (result?.asset.provenance.kind === 'image_operation' ? result.asset.provenance.effective_prompt : '') : undefined;
  // «Corregir composición» of the selected HTML version (button in the panel and, on the screen, under the review note).
  const selectedReview = versionReview(state, selected);
  const correctComposition = base === 'version' && selected?.kind === 'html' ? flags?.correccion_acotada
    ? () => act(() => work.correctComposition())
    : () => send(buildDesignRepairFeedback([],
      selectedReview ? describeVisualReview(selectedReview) : '').slice(0, 6000)) : undefined;
  // Pieces shared by the popup and the design screen: same controls, same handlers.
  const imageSettings = format === 'image' && <div className="dc-settings"><ImageGenerationControls value={settings} onChange={setSettings} disabled={blocked || pending}
    availableModels={work.generation?.profiles?.map(profile => PRESENTATION_IMAGE_MODELS[profile])} availableQualities={work.generation?.qualities} /></div>;
  const sessionPicker = <div className="dc-session-picker">
    <div className="dc-session-controls"><select aria-label="Sesión de diseño" value={work.activeSession ?? 'main'} disabled={blocked || work.sessionsReady === false}
      onChange={event => void act(() => work.selectSession(event.target.value as DesignConversationSessionId))}>
      {(work.sessions?.length ? work.sessions : [{ id: work.activeSession ?? 'main', label: 'Sesión 1', preview: '', pending: false }]).map(session =>
        <option key={session.id} value={session.id}>{session.label}{session.preview ? ` · ${session.preview}` : ''}{session.pending ? ' · Pendiente' : ''}</option>)}
    </select><button className="dc-button" disabled={blocked || work.sessionsReady === false || (work.sessions?.length ?? 1) >= 3}
      title={(work.sessions?.length ?? 1) >= 3 ? 'Máximo tres sesiones. Puedes retomar o reiniciar una.' : 'Empieza un chat nuevo y conserva los anteriores'}
      onClick={() => void act(() => work.newSession())}><Plus size={14} />Nueva sesión</button></div>
    <div className="dc-session-meta"><span>{work.sessions?.length || 1}/3 sesiones</span>
      <button type="button" className="dc-session-reset" disabled={blocked || pending || work.sessionsReady === false}
        title={pending ? 'Recupera o descarta la solicitud pendiente antes de reiniciar' : 'Vacía sólo esta sesión para empezar de nuevo'}
        onClick={() => setConfirmReset(true)}>Reiniciar sesión</button></div>
    {confirmReset && <div className="dc-session-confirm" role="group" aria-label="Confirmar reinicio de sesión">
      <p>Se limpiarán el chat, las referencias y las versiones de esta sesión. La diapositiva guardada y las otras sesiones se conservan.</p>
      <button className="dc-button" disabled={blocked || pending} onClick={() => void act(async () => { await work.resetSession(); setConfirmReset(false); })}>Sí, reiniciar</button>
      <button className="dc-button" disabled={busy} onClick={() => setConfirmReset(false)}>Cancelar</button>
    </div>}
    {work.sessionsError && <p role="alert" className="dc-error">{work.sessionsError} <button className="dc-session-reset" disabled={busy}
      onClick={() => void act(() => work.synchronize())}>Reintentar</button></p>}
  </div>;
  const formatToggle = <div className="dc-format" role="group" aria-label="Formato del diseño">
    <button className="dc-button" aria-pressed={format === 'html'} disabled={blocked || pending} onClick={() => changePreferences('html', base)}>HTML editable</button>
    <button className="dc-button" aria-pressed={format === 'image'} disabled={blocked || pending}
      onClick={() => changePreferences('image', chosenBase === 'deck' ? 'current' : base)}>Imagen IA</button>
  </div>;
  const baseOptions = <><option value="current">{source === 'presentation' ? 'Diapositiva original' : 'Diseño original'}</option>{canUseVersion && <option value="version">Esta versión</option>}{format === 'html' && !!deckKit?.slides.length && <option value="deck">Estilo de la presentación</option>}<option value="new">Referencias y diseño libre</option></>;
  const referenceDrawer = referencesOpen && <div className="dc-reference-drawer"><PresentationReferencePicker items={state.references} disabled={busy || pending || !work.ready || importBusy} onBusyChange={setFileBusy} defaultRole="image_style_reference"
    onChange={items => work.changeReferences(items)} maxReferences={3} conversationReadsImages />
    <ReferenceImportPicker key={`${props.businessId}:${props.documentId}:${props.slide.id}:${props.slide.revision}`} businessId={props.businessId} remaining={3 - state.references.length} disabled={busy || pending || !work.ready || fileBusy}
      onBusyChange={setImportBusy} onImport={async items => {
        let next = state.references;
        for (const item of items) next = addPresentationReference(next, item, 3);
        await work.changeReferences(next);
      }} />
    {state.copy.status === 'literal' && <details><summary>Texto del diseño</summary><p className="dc-copy">{state.copy.text}</p></details>}
    {state.copy.status === 'none' && <p className="dc-muted">{format === 'html' && (base === 'current' || base === 'version')
      ? 'Sin texto nuevo: se conserva el texto del diseño.' : 'Diseño sin texto.'}</p>}
    {spec && <details><summary>Ficha de estilo</summary><p className="dc-muted">Estilo del diseño base. Puedes pedir qué conservar y qué cambiar.</p><pre className="dc-spec">{spec}</pre></details>}
    {flags && scaleLine && <p className="dc-muted" aria-label="Escala tipográfica">{scaleLine} (px, tolerancia ±2)</p>}
    {flags?.ficha_estricta && specFailed && <p className="dc-muted" role="status">Ficha no disponible: no se pudo medir el diseño base ({specFailed}). Se enviará sin valores medidos.</p>}
    {flags?.prompt_base && state.references.map(reference => {
      const saved = state.reference_prompts?.[reference.sha256];
      return saved ? <details key={reference.id} className="dc-prompt"><summary>Prompt usado · {reference.name}</summary>
        <textarea aria-label={`Prompt usado de ${reference.name}`} defaultValue={saved.text} maxLength={1500} disabled={blocked || pending}
          onBlur={event => { if (event.target.value.trim() !== saved.text) void act(() => work.setReferencePrompt(reference.sha256, event.target.value)); }} />
        <p className="dc-muted">{saved.edited ? 'Editado por ti; se usa en el siguiente turno.' : 'Ficha generada una sola vez para esta imagen. Puedes editarla.'}</p></details> : null;
    })}
    {brand && <details><summary>Identidad de {brand.name}</summary><p className="dc-muted">{[brand.style, brand.tone].filter(Boolean).join(' · ') || 'Paleta, tipografías y recursos guardados de esta marca.'}</p>
      <div className="dc-swatches">{Object.values(brand.colors).filter(Boolean).map((color, index) => <span key={index} style={{ background: color }} title={color} />)}</div></details>}
  </div>;
  const welcome = !state.messages.length && <div className="dc-welcome"><MessageSquare size={26} /><h3>Empecemos por tu idea</h3><p>{screen
    ? 'Dime qué quieres cambiar y lo hago. Arrastra una miniatura aquí o escribe @2 para usar otra diapositiva.'
    : 'Dime qué quieres cambiar y lo hago. Si un cambio tiene consecuencias que no pediste, te lo digo antes.'}</p>
    <button className="dc-button" onClick={() => { setReferencesOpen(true); composer.current?.focus(); }}>Añadir imágenes de referencia</button></div>;
  const messages = state.messages.map(item => <article className={`dc-message dc-message-${item.role}`} key={item.id}><span>{item.role === 'user' ? 'Tú' : 'Asistente'}</span><p>{item.text}</p></article>);
  const ideas = state.ideas.length > 0 && <div className="dc-ideas" aria-label="Ideas de diseño">{state.ideas.map((idea, index) => <article key={`${index}:${idea.title}`}><span>Idea {index + 1}</span><h4>{idea.title}</h4>
    <p>{idea.rationale}</p><button className="dc-button" disabled={blocked || pending} onClick={() => void act(() => work.startIdea(idea))}>Usar esta idea</button></article>)}</div>;
  const confirmation = work.confirmationReady && <div className="dc-confirmation">
    {state.next_action?.design_source && <p>{describeConversationDesignSource(state.next_action.design_source, props.deckSlides ?? [props.slide], state.references)}</p>}
    <button className="dc-button dc-primary dc-next" disabled={blocked || pending || designPending} onClick={() => void act(() => work.executeSuggested())}>
    <Sparkles size={15} />{designActionLabel(state.next_action)}</button>
    <p>Puedes confirmar o escribir qué cambiar en la propuesta.</p></div>;
  const staleNotice = work.confirmationStale && <div className="dc-confirmation"><p>{work.staleDetail ? `Cambiaste ${work.staleDetail} después de la propuesta.` : 'Cambiaron las opciones del diseño.'} Actualicemos la propuesta antes de crear.</p>
    <button className="dc-button dc-next" disabled={blocked || pending} onClick={() => void send('Actualiza la propuesta con el formato, la base y las referencias seleccionadas.')}>Actualizar propuesta</button></div>;
  // Design screen: a thumbnail dropped on the chat cites that slide as @N.
  const dropSlide = (event: React.DragEvent<HTMLElement>) => {
    const number = event.dataTransfer.getData('application/x-scory-slide');
    if (!/^\d{1,3}$/.test(number) || blocked || pending) return;
    event.preventDefault();
    const field = composer.current, at = field?.selectionStart ?? message.length;
    setMessage(value => { const before = value.slice(0, at);
      return `${before}${before && !/\s$/.test(before) ? ' ' : ''}@${number} ${value.slice(at)}`.slice(0, 6000); });
    field?.focus();
  };
  const composerBlock = <div className="dc-composer">
    {error && <p role="alert" className="dc-error">{error}</p>}
    {flags?.ficha_estricta && specFailed && format === 'html' && <p className="dc-muted" role="status">Ficha no disponible para el diseño base: {specFailed}.</p>}
    {work.canRetryLastMessage && !pending && <button className="dc-button" disabled={blocked}
      onClick={() => void act(() => work.retryLastMessage())}>Reintentar mensaje</button>}
    {designPending && !!state.messages.length && <div className="dc-recovery" id="dc-design-pending" role="status">
      <p>{copyPending ? 'Falta resolver el texto literal antes de generar. Puedo leer las referencias; también puedes escribir el texto exacto abajo y pulsar «Resolver texto».'
        : 'Antes de generar, responde en la conversación:'}</p>
      {pendingQuestions.map((question, index) => <p key={index}>{question}</p>)}
      {copyPending && <button className="dc-button" disabled={blocked || pending} onClick={() => void act(async () => {
        if (await work.resolveCopy(message)) setMessage('');
      })}>Resolver texto</button>}
    </div>}
    {/* Sólo cuando hay algo que hacer: conflicto, guardado sin confirmar, carga o copias locales conservadas. */}
    {work.syncStatus && (work.syncStatus !== 'synced' || work.localCopies) && <div className="dc-recovery" aria-live="polite"><p>{work.syncStatus === 'synced' ? 'Guardado en Supabase. Puedes continuar en otro dispositivo.'
      : work.syncStatus === 'conflict' ? 'Otra sesión guardó cambios. Sincroniza para cargar esa revisión; tu copia local se conserva.'
      : work.syncStatus === 'offline' ? 'Guardado remoto sin confirmar. Conservamos la copia local; sincroniza antes de continuar.' : 'Cargando el trabajo guardado…'}</p>
      {work.localCopies && <p>Hay copias locales conservadas de guardados interrumpidos o en conflicto.</p>}
      <button className="dc-button" disabled={busy || fileBusy} onClick={() => void act(() => work.synchronize())}>Sincronizar</button>
      <button className="dc-button" disabled={busy || fileBusy} onClick={() => void act(() => work.exportLocal())}>Descargar copia local</button></div>}
    {work.brand.status === 'error' && <p className="dc-error">No se pudo cargar la marca. <button className="dc-button" disabled={blocked || pending} onClick={work.brand.refresh}>Volver a cargar</button></p>}
    {pending && !busy && !work.resuming && <div className="dc-recovery"><p>Hay una solicitud pendiente. Recupera su estado para continuar con este trabajo.</p><button className="dc-button" onClick={() => void act(() => work.recover())}>Recuperar solicitud</button>
      <button className="dc-button" onClick={() => void act(() => work.discard())}>Descartar</button></div>}
    <div className="dc-quick"><button className="dc-button" disabled={fileBusy || importBusy} onClick={() => setReferencesOpen(value => !value)} aria-expanded={referencesOpen}>
      <ImagePlus size={14} />{state.references.length ? `Referencias · ${state.references.length}` : 'Añadir referencia'}</button>
      <button className="dc-button" disabled={blocked || pending} onClick={() => void send('Explora y propón cinco ideas de diseño con mis referencias, la presentación y lo que hemos acordado. Quiero elegir una idea antes de preparar la propuesta; no generes todavía.')}><Sparkles size={14} />Explorar diseños</button></div>
    <div className="dc-input" {...(screen ? { onDrop: dropSlide, onDragOver: (event: React.DragEvent<HTMLElement>) => { if (event.dataTransfer.types.includes('application/x-scory-slide')) event.preventDefault(); } } : {})}>
      <textarea ref={composer} aria-label="Mensaje de diseño" value={message} onChange={event => setMessage(event.target.value)} maxLength={6000} rows={3}
      disabled={blocked || pending} onPaste={paste} placeholder={screen ? 'Pide un cambio o cita otra diapositiva con @2…' : 'Conserva el diseño y usa el texto de esta imagen, replica su composición o toma sólo su estilo…'}
      onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
      <button className="dc-button" aria-label="Enviar" title="Enviar" disabled={blocked || pending || !message.trim()} onClick={() => void send()}><ArrowUp size={20} /></button></div>
    <p className="dc-muted">{screen ? 'Te digo qué voy a hacer antes de cambiar algo que no pediste.' : 'Pídeme el cambio y lo hago; si tiene consecuencias que no pediste, te pregunto antes.'}</p>
  </div>;
  const versionHistory = <details className="dc-version-history"><summary>Historial{state.versions.length > 0 ? ` · ${state.versions.length}` : ''}</summary>
    <label>Versión del diseño<select aria-label="Versión del diseño" value={state.selected_version_id ?? ''} disabled={blocked || pending || !state.versions.length} onChange={event => void act(() => work.selectVersion(event.target.value))}>
      <option value="" disabled>Sin versiones todavía</option>{state.versions.map((version, index) => <option key={version.id} value={version.id}>Versión {index + 1} · {version.kind === 'image' ? 'Imagen' : 'HTML'}</option>)}</select></label></details>;
  const previewArea = <div className="dc-preview-area">
    {view === 'image' && work.imagePreviewLoading && <p className="dc-muted" role="status">Cargando vista previa de la imagen…</p>}
    {view === 'history' && selected?.kind === 'html' && <div className="dc-snapshot">
      {screen ? <DesignZoomCanvas html={selected.proposal.html} title="Versión guardada del diseño" /> : <PresentationCanvas html={selected.proposal.html} title="Versión guardada del diseño" />}
      <p>{selected.composition?.unresolved_slots.length && work.syncStatus
        ? 'Esta composición conserva piezas pendientes. Puedes consultar la versión guardada; completa las piezas en su editor de origen antes de aplicarla.'
        : 'Esta es una vista del historial. Selecciona la versión actual para continuar editando o aplicarla.'}</p>
    </div>}
    {view === 'image' && (work.imagePreview ? <div className="dc-image-result"><img src={work.imagePreview} alt="Versión seleccionada del diseño" />
      <p>{quality ? `${quality.charAt(0).toUpperCase()}${quality.slice(1)} · ` : ''}{approved ? 'Versión aprobada' : result?.direction ? 'Dirección elegida' : 'Lista para revisar'}</p>
      {versionPrompt !== undefined && selected?.kind === 'image' && <details className="dc-prompt"><summary>Prompt usado</summary>
        <textarea key={selected.id} aria-label="Prompt usado de esta versión" defaultValue={versionPrompt} maxLength={4000} disabled={blocked || pending}
          onBlur={event => { if (event.target.value.trim() !== versionPrompt.trim()) void act(() => work.setVersionPrompt(selected.id, event.target.value)); }} />
        <p className="dc-muted">Al editar o citar esta versión se envía como «Prompt de origen» (recortado a 1500 caracteres) seguido de los cambios que pidas.</p>
      </details>}</div>
      : <div className="dc-empty"><div className="dc-empty-symbol"><Sparkles size={30} /></div><h3>Tu diseño, con espacio para probar</h3><p>La imagen o el HTML aparecerán aquí. Puedes conversar antes de generar.</p></div>)}
    {!work.ready && <div className="dc-empty" role="status">Cargando sesión…</div>}
    {work.ready && <div hidden={view !== 'html'}><SlideGeneratorPanel key={`html:${sessionIdentity}`} embedded externalConversation conversationSessionId={work.sessionToken} controllerRef={htmlController} onState={receiveHtmlState}
      onCorrectComposition={correctComposition}
      styleExamples={format === 'html' && base === 'deck' ? deckKit?.examples : undefined} styleSpec={spec || undefined}
      {...(flags ? { fromExisting: flags, styleSpecReady } : {})}
      {...(screen ? { backgroundReview: true, renderPreview: (html: string) => <DesignZoomCanvas html={html} title="Vista previa del diseño HTML" /> } : {})}
      styleSourceHtml={deckBaseHtml}
      onProposal={(proposal, reason) => {
        if (sessionIdentityRef.current !== sessionIdentity) return;
        if (reason === 'generated' || reason === 'refined') { setVersionStyleSource(proposal.html); setBase('version'); }
        if (reason === 'edited' && work.ready) void act(() => work.recordHtmlEdit(proposal, reason));
      }} businessId={props.businessId} documentId={props.documentId}
      slideId={props.slide.id} revision={props.slide.revision} currentHtml={props.slide.html} mountedAssets={props.slide.mounted_assets} canvas={canvas}
      surfaceLabel={source === 'presentation' ? 'diapositiva' : source === 'cover' ? 'portada' : 'página'}
      onApplyToCurrent={async (html, target, mounted) => {
        if (sessionIdentityRef.current !== sessionIdentity) throw Error('Cambió la sesión de diseño. Vuelve a abrir su propuesta para aplicarla.');
        if (!target || target.document !== props.documentId || target.slide !== props.slide.id || target.revision !== props.slide.revision) throw Error('El documento cambió. Reabre la conversación.');
        await applyResult(reviseSlide([props.slide], { slide_id: props.slide.id, expected_revision: props.slide.revision, html, mounted_assets: mounted ?? [] })[0]);
      }} onInsert={async () => { throw Error('Elige el destino desde la conversación.'); }} onClose={() => { setLocalError(''); work.clearError(); }} /></div>}
    {work.ready && <div hidden={view !== 'composition'}><DesignToHtmlPanel key={`composition:${sessionIdentity}`} embedded externalConversation conversationSessionId={work.sessionToken} controllerRef={compositionController} onState={receiveCompositionState}
      onProposal={(proposal, reason) => { if (sessionIdentityRef.current === sessionIdentity && reason === 'edited' && work.ready) void act(() => work.recordCompositionEdit(proposal, reason)); }} service={props.service} businessId={props.businessId} documentId={props.documentId}
      slide={props.slide} destination={props.destination} onApply={async slide => {
        if (sessionIdentityRef.current !== sessionIdentity) throw Error('Cambió la sesión de diseño. Vuelve a abrir su propuesta para aplicarla.');
        await applyResult(slide);
      }} onClose={() => {}} /></div>}
  </div>;
  const destinationSelect = props.onInsert && <select aria-label="Destino del diseño" value={applyTarget} disabled={blocked || pending} onChange={event => setApplyTarget(event.target.value as typeof applyTarget)}>
    <option value="new">Nueva diapositiva</option><option value="current">Diapositiva actual</option></select>;
  const imageActions = view === 'image' && result && <>
    {!approved && <button className="dc-button dc-primary" disabled={blocked || pending || !!result.direction && quality === 'low'} onClick={() => void act(() => work.approveImage())}><Check size={16} />{quality === 'low' ? 'Elegir esta dirección' : 'Aprobar esta versión'}</button>}
    {quality === 'low' && result.direction && <button className="dc-button dc-primary" disabled={blocked || pending} onClick={() => void act(() => work.generateMedium())}>Generar versión Medium</button>}
    <button className="dc-button" disabled={blocked || pending || !approved} onClick={() => void act(() => work.executeAction('convert_image_to_html'))}>Hacer editable</button>
    <button className="dc-button" disabled={blocked || pending || !approved} title={approved ? 'Mueve la imagen y añade elementos encima. Su contenido permanece en la imagen.' : 'Aprueba esta versión para editar sus capas'}
      onClick={() => void act(() => work.editImageLayers(false))}><Pencil size={16} />Editar capas</button>
    <button className="dc-button" disabled={blocked || pending || !approved} title={approved ? 'Añade un logo como elemento independiente' : 'Aprueba esta versión para editar sus capas'}
      onClick={() => void act(() => work.editImageLayers(true))}><Shapes size={16} />Logos</button>
  </>;
  const openEditor = (icons = false) => act(async () => {
    if (view === 'composition') await compositionController.current?.openEditor(); else await htmlController.current?.openEditor(icons ? { icons: true } : undefined);
  });
  const openLogos = () => act(async () => { if (view === 'composition') await compositionController.current?.openLogos(); else await htmlController.current?.openLogos(); });
  const applyButton = <button className="dc-button dc-primary dc-apply" disabled={blocked || pending || !canApply} onClick={() => void act(() => work.apply())}>{view === 'image' ? 'Usar como imagen' : 'Aplicar diseño'}</button>;

  if (!screen) return <div className="dc-backdrop"><section className="dc-workspace" role="dialog" aria-modal="true" aria-label="Conversación de diseño" aria-busy={busy}>
    <header className="dc-header"><div><div className="dc-brand"><span className="dc-brand-dot" style={{ background: brand?.colors.primary || undefined }} />{brand?.name || 'Marca del proyecto'}<span>· {canvas.width} × {canvas.height}</span></div>
      <h2>{title}</h2><p className="dc-location" aria-label="Ubicación del diseño">{location || 'Conversa, crea y ajusta el resultado aquí.'}</p></div>
      {imageSettings}
      <button className="dc-button dc-icon" aria-label="Cerrar conversación de diseño" disabled={busy || fileBusy || importBusy} onClick={props.onClose}><X size={20} /></button>
    </header>
    <div className="dc-body"><aside className="dc-conversation">
      <div className="dc-context-bar">
        {sessionPicker}
        {formatToggle}
        <details className="dc-base"><summary>Usando: <strong>{baseLabel}</strong><span>Cambiar</span></summary>
          <label>Base del diseño<select aria-label="Base del diseño" value={base} disabled={blocked || pending}
            onChange={event => changePreferences(format, event.target.value as typeof base)}>{baseOptions}</select></label>
          <p>Elige de dónde partir. En el chat puedes indicar qué conservar y qué cambiar.</p>
        </details>
      </div>
      {referenceDrawer}
      <div ref={history} className="dc-history" aria-label="Historial de diseño" aria-live="polite">
        {welcome}
        {messages}
        {ideas}
        {comparison && <dl className="dc-compare" aria-label="Lo que tienes y lo que pides">
          <div><dt>Lo que tienes</dt><dd>{comparison.have}</dd></div>
          <div><dt>Lo que pides</dt><dd>{comparison.ask}</dd></div>
          <div><dt>Qué cambio</dt><dd>{comparison.change}</dd></div>
          <div><dt>Qué conservo</dt><dd>{comparison.keep}</dd></div>
        </dl>}
        {plan && accentTable}
        {confirmation}
        {staleNotice}
        {(busy || work.resuming) && <div className="dc-working" role="status"><Loader2 size={15} className="animate-spin" />{work.resuming && !busy ? 'Recuperando la respuesta de tu último mensaje…' : 'Preparando tu diseño…'}</div>}
      </div>
      {composerBlock}
    </aside><main className="dc-result">
      <div className="dc-result-bar"><div className="dc-result-label"><Layers size={17} /><span>{view === 'image' ? 'Diseño en imagen' : view === 'history' ? 'Versión guardada' : 'Diseño editable'}</span></div>
        {versionHistory}</div>
      {previewArea}
      <footer className="dc-result-actions">
        {destinationSelect}
        {imageActions}
        {(view === 'html' || view === 'composition') && <><button className="dc-button" disabled={!canEdit}
          onClick={() => void openEditor()}><Pencil size={16} />Editar</button>
          <button className="dc-button" disabled={!canEdit} onClick={() => void openLogos()}><Shapes size={16} />Logos</button></>}
        {applyButton}
      </footer>
      <p className="dc-storage-note">{work.syncStatus ? 'Referencias, conversación y versiones con respaldo local y sincronización en Supabase.' : 'Referencias, conversación y versiones se conservan en este navegador.'}</p>
    </main></div>
  </section></div>;

  // Design screen: slides on the left, the canvas with its versions in the center and the chat on the right.
  const deck = props.deckSlides?.length ? props.deckSlides : [props.slide];
  const currentIndex = Math.max(0, deck.findIndex(item => item.id === props.slide.id));
  const parent = selected?.parent_id ? state.versions.find(item => item.id === selected.parent_id) : undefined;
  const beforeHtml = view === 'html' && !previewOriginal && selected?.kind === 'html' ? parent?.kind === 'html' ? parent.proposal.html : props.slide.html : undefined;
  const showOriginal = () => { if (blocked || pending) return; setPreviewOriginal(true); if (format === 'html' && base !== 'current') void changePreferences(format, 'current'); };
  const showVersion = (id: string) => {
    if (blocked || pending) return;
    setPreviewOriginal(false);
    if (id !== state.selected_version_id) void act(() => work.selectVersion(id)); else if (base !== 'version') void changePreferences(format, 'version');
  };
  // Ctrl+Z / «Deshacer»: back to the version this one came from, or to the original slide.
  const undo = () => { if (parent) showVersion(parent.id); else if (selected && !previewOriginal) showOriginal(); };
  const steps = work.steps ?? [];
  const running = steps.some(item => item.status === 'running' && item.id !== 'background-review');
  const canCorrect = !!correctComposition && selected?.kind === 'html' && selectedReview?.status === 'needs_review' && !previewOriginal;
  const planCard = plan && (comparison || work.confirmationReady) && <section className="ds-plan" aria-label="Plan del cambio">
    <h3>Así quedará</h3><p>{comparison?.change ?? plan.instruction.split(/(?<=[.!?])\s/)[0].slice(0, 220)}</p>
    <h3>Se conserva</h3><p>{comparison?.keep ?? (state.understanding?.preserve.slice(0, 3).join('; ') || 'El resto del diseño, tal como está.')}</p>
    {state.next_action?.design_source && !transferSource && <p>{describeConversationDesignSource(state.next_action.design_source, props.deckSlides ?? [props.slide], state.references)}</p>}
    {accentTable}
    {work.confirmationReady && <button className="dc-button dc-primary" disabled={blocked || pending || designPending} onClick={() => void act(() => work.executeSuggested())}>
      <Sparkles size={15} />{designActionLabel(state.next_action)}</button>}
  </section>;
  return <div className="dc-workspace ds-screen" aria-busy={busy}>
    <DesignScreenLayout breadcrumb={`${props.presentationName || 'Presentación'} · Diapositiva ${currentIndex + 1} de ${deck.length}`}
      onBack={props.onClose} backDisabled={busy || fileBusy || importBusy} beforeHtml={beforeHtml} onUndo={blocked || pending ? undefined : undo}
      controls={<>{formatToggle}
        <label className="ds-select"><span>Base</span><select aria-label="Base del diseño" value={base} disabled={blocked || pending}
          onChange={event => changePreferences(format, event.target.value as typeof base)}>{baseOptions}</select></label>
        {versionHistory}</>}
      apply={<>{destinationSelect}{applyButton}</>}
      thumbnails={<SlideThumbnails slides={deck} current={currentIndex} disabled={busy || pending} onSelect={index => props.onSelectSlide?.(index)} />}
      toolbar={<>
        <button type="button" className="dc-button" aria-keyshortcuts="Control+Z" disabled={blocked || pending || !parent && (!selected || previewOriginal)} onClick={undo}><Undo2 size={15} />Deshacer</button>
        {view === 'image' ? imageActions : <>
          <button type="button" className="dc-button" disabled={!canEdit || previewOriginal} onClick={() => void openEditor()}><Pencil size={15} />Editar elemento</button>
          <button type="button" className="dc-button" disabled={!canEdit || previewOriginal} onClick={() => void openEditor(view === 'html')}
            title="Elige un ícono en el editor"><Shapes size={15} />Íconos</button>
          <button type="button" className="dc-button" disabled={!canEdit || previewOriginal} onClick={() => void openLogos()}><Shapes size={15} />Logos</button>
          {flags?.transferencia && format === 'html' && deck.length > 1 && <label className="ds-select"><span>Copiar estilo de…</span>
            <select aria-label="Copiar estilo de otra diapositiva" value="" disabled={blocked || pending}
              onChange={event => { const number = Number(event.target.value); if (number) void send(`Pon las letras y colores como la diapositiva ${number}`); }}>
              <option value="">Elige</option>
              {deck.map((item, index) => index === currentIndex ? null : <option key={item.id} value={index + 1}>{index + 1}. {item.title || 'Sin título'}</option>)}
            </select></label>}
        </>}</>}
      canvas={<>{previewOriginal && <div className="ds-original"><p>Diapositiva original. Elige una versión abajo para volver a ella.</p>
        <DesignZoomCanvas html={props.slide.html} title="Diapositiva original" /></div>}
        <div hidden={previewOriginal}>{previewArea}</div></>}
      versions={<><span id="ds-versions-label">Versiones</span>
        <div role="group" aria-labelledby="ds-versions-label" className="ds-tools">
          <button type="button" className="dc-button" aria-pressed={previewOriginal || !selected} disabled={blocked || pending} onClick={showOriginal}>Original</button>
          {state.versions.map((version, index) => <button type="button" key={version.id} className="dc-button" disabled={blocked || pending}
            aria-pressed={!previewOriginal && version.id === state.selected_version_id} onClick={() => showVersion(version.id)}>
            v{index + 1}{version.kind === 'image' ? ' · imagen' : ''}</button>)}
        </div></>}
      chat={<>
        <div className="ds-chat-head">{sessionPicker}{imageSettings}
          {deckFlags && deck.length > 1 && <DeckSystemPanel system={deckSystem?.system ?? null} slides={deck}
            status={deckMeasure?.scope === deckScope ? deckMeasure.status : 'measuring'} />}</div>
        {referenceDrawer}
        <div ref={history} className="dc-history" aria-label="Historial de diseño" aria-live="polite">
          {welcome}
          {messages}
          {canCorrect && <div className="ds-note-actions"><button type="button" className="dc-button" disabled={blocked || pending}
            onClick={() => void correctComposition?.()}><Wand2 size={14} />Corregir</button></div>}
          {ideas}
          {planCard}
          {!plan && confirmation}
          {staleNotice}
          <DesignSteps steps={steps} />
          {work.liveReply && <article className="dc-message dc-message-assistant ds-live"><span>Asistente</span><p>{work.liveReply}</p></article>}
          {(busy || work.resuming) && !running && !work.liveReply && <div className="dc-working" role="status"><Loader2 size={15} className="animate-spin" />{work.resuming && !busy ? 'Recuperando la respuesta de tu último mensaje…' : 'Pensando…'}</div>}
        </div>
        {composerBlock}
      </>} />
  </div>;
}
