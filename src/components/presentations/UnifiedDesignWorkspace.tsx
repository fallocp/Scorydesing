import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckStyleKit } from '@/lib/presentations/designConversationHtml';
import { measureStyleSpec } from '@/lib/presentations/styleSpec';
import { describeConversationDesignSource } from '@/lib/presentations/designConversationSource';
import { buildDesignRepairFeedback, describeVisualReview } from '@/lib/presentations/designVisualReview';
import { ArrowUp, Check, ImagePlus, Layers, Loader2, MessageSquare, Pencil, Plus, Shapes, Sparkles, X } from 'lucide-react';
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
import { SlideGeneratorPanel, type SlideGeneratorController, type SlideGeneratorState } from './SlideGeneratorPanel';
import { DesignToHtmlPanel, type DesignToHtmlController, type DesignToHtmlState } from './DesignToHtmlPanel';
import './UnifiedDesignWorkspace.css';

export interface UnifiedDesignWorkspaceProps {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  destination?: DesignSurfaceDestination; initialInstruction?: string; initialCopy?: string; initialView?: 'image' | 'html';
  projectName?: string; presentationName?: string;
  /** Current presentation, including saved edits, for context and visual references. */
  deckSlides?: ReadonlyArray<PresentationSlide>;
  onApply(slide: PresentationSlide): void | Promise<void>; onInsert?(slide: PresentationSlide): void | Promise<void>; onClose(): void;
}

/** One conversation owns context. Image/HTML engines are tools inside this workspace. */
export function UnifiedDesignWorkspace(props: UnifiedDesignWorkspaceProps) {
  const { settings, setSettings } = useImageGenerationSettings(props.businessId, 'design-conversation');
  const htmlController = useRef<SlideGeneratorController | null>(null), compositionController = useRef<DesignToHtmlController | null>(null);
  const htmlState = useRef<SlideGeneratorState | null>(null), compositionState = useRef<DesignToHtmlState | null>(null);
  const [view, setView] = useState<DesignConversationView>(props.initialView ?? 'image');
  const [applyTarget, setApplyTarget] = useState<'current' | 'new'>('current');
  const onView = useCallback((next: DesignConversationView) => setView(next), []);
  const applyResult = useCallback(async (next: PresentationSlide) => {
    if (applyTarget === 'new' && props.onInsert) await props.onInsert(next); else await props.onApply(next);
    props.onClose();
  }, [applyTarget, props.onApply, props.onInsert, props.onClose]);
  // Formato y base los elige el usuario; la IA sólo puede proponer acciones de ese formato.
  const [format, setFormat] = useState<'html' | 'image'>(props.initialView === 'html' ? 'html' : 'image');
  // Kit de estilo: hasta 3 diapositivas con contenido, las más cercanas a la actual.
  const deckKit = useMemo(() => props.deckSlides?.length ? buildDeckStyleKit(props.deckSlides, props.slide.id) : null, [props.deckSlides, props.slide.id]);
  const deckBaseHtml = deckKit?.ids[0] ? props.deckSlides?.find(slide => slide.id === deckKit.ids[0])?.html : undefined;
  const [chosenBase, setBase] = useState<'current' | 'version' | 'deck' | 'new'>(() => props.slide.html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, '').trim() ? 'current' : deckKit?.slides.length ? 'deck' : 'new');
  const [versionStyleSource, setVersionStyleSource] = useState<string | null>(null);
  // Ficha de estilo: se mide del diseño base (la diapositiva, o la diapositiva del deck más cercana) en el navegador.
  const specSource = format !== 'html' || chosenBase === 'new' ? null : chosenBase === 'deck'
    ? props.deckSlides?.find(slide => slide.id === deckKit?.ids[0])?.html ?? null
    : chosenBase === 'version' ? versionStyleSource ?? props.slide.html : props.slide.html;
  const [styleSpec, setStyleSpec] = useState({ source: '', spec: '' });
  useEffect(() => {
    if (!specSource) return;
    let alive = true;
    void measureStyleSpec(specSource, getSlideDimensions(specSource)).then(spec => { if (alive) setStyleSpec({ source: specSource, spec }); }, () => {});
    return () => { alive = false; };
  }, [specSource]);
  const spec = specSource && styleSpec.source === specSource ? styleSpec.spec : '';
  const work = useDesignConversation({ ...props, onApply: applyResult, settings, htmlController, compositionController, htmlState, compositionState, onView,
    format, base: chosenBase, deckStyle: deckKit?.slides, deckBaseHtml, styleSpec: spec });
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
  const selected = state.versions.find(item => item.id === state.selected_version_id);
  useEffect(() => { setVersionStyleSource(selected?.kind === 'html' ? selected.proposal.html : null); }, [selected]);
  // Restoring or selecting a saved design continues from that exact version.
  // Depending only on its identity preserves a later explicit base choice.
  useEffect(() => { if (selected) setBase('version'); }, [selected?.id, selected?.kind]);
  // Las imágenes generadas pueden servir como base de otra imagen; HTML conserva su propia versión editable.
  const canUseVersion = selected?.kind === 'html' || format === 'image' && selected?.kind === 'image';
  const base = chosenBase === 'version' && !canUseVersion ? 'current' : chosenBase;
  const result = work.imageResult;
  const busy = work.busy || htmlUi.busy || compositionUi.busy;
  const blocked = busy || fileBusy || importBusy || !work.ready || !!work.syncStatus && work.syncStatus !== 'synced';
  const pending = !!state.pending;
  const copyPending = state.copy.status === 'pending';
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
  }, [state.messages.length, state.ideas, busy]);
  useEffect(() => {
    if (work.ready && hydrated.current !== sessionIdentity) {
      hydrated.current = sessionIdentity;
      if (state.preferences) { setFormat(state.preferences.format); setBase(state.preferences.base); }
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
  return <div className="dc-backdrop"><section className="dc-workspace" role="dialog" aria-modal="true" aria-label="Conversación de diseño" aria-busy={busy}>
    <header className="dc-header"><div><div className="dc-brand"><span className="dc-brand-dot" style={{ background: brand?.colors.primary || undefined }} />{brand?.name || 'Marca del proyecto'}<span>· {canvas.width} × {canvas.height}</span></div>
      <h2>{title}</h2><p className="dc-location" aria-label="Ubicación del diseño">{location || 'Conversa, crea y ajusta el resultado aquí.'}</p></div>
      {format === 'image' && <div className="dc-settings"><ImageGenerationControls value={settings} onChange={setSettings} disabled={blocked || pending}
        availableModels={work.generation?.profiles?.map(profile => PRESENTATION_IMAGE_MODELS[profile])} availableQualities={work.generation?.qualities} /></div>}
      <button className="dc-button dc-icon" aria-label="Cerrar conversación de diseño" disabled={busy || fileBusy || importBusy} onClick={props.onClose}><X size={20} /></button>
    </header>
    <div className="dc-body"><aside className="dc-conversation">
      <div className="dc-context-bar">
        <div className="dc-session-picker">
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
        </div>
        <div className="dc-format" role="group" aria-label="Formato del diseño">
          <button className="dc-button" aria-pressed={format === 'html'} disabled={blocked || pending} onClick={() => changePreferences('html', base)}>HTML editable</button>
          <button className="dc-button" aria-pressed={format === 'image'} disabled={blocked || pending}
            onClick={() => changePreferences('image', chosenBase === 'deck' ? 'current' : base)}>Imagen IA</button>
        </div>
        <details className="dc-base"><summary>Usando: <strong>{baseLabel}</strong><span>Cambiar</span></summary>
          <label>Base del diseño<select aria-label="Base del diseño" value={base} disabled={blocked || pending}
            onChange={event => changePreferences(format, event.target.value as typeof base)}><option value="current">{source === 'presentation' ? 'Diapositiva original' : 'Diseño original'}</option>{canUseVersion && <option value="version">Esta versión</option>}{format === 'html' && !!deckKit?.slides.length && <option value="deck">Estilo de la presentación</option>}<option value="new">Referencias y diseño libre</option></select></label>
          <p>Elige de dónde partir. En el chat puedes indicar qué conservar y qué cambiar.</p>
        </details>
      </div>
      {referencesOpen && <div className="dc-reference-drawer"><PresentationReferencePicker items={state.references} disabled={busy || pending || !work.ready || importBusy} onBusyChange={setFileBusy} defaultRole="image_style_reference"
        onChange={items => work.changeReferences(items)} maxReferences={3} conversationReadsImages />
        <ReferenceImportPicker key={`${props.businessId}:${props.documentId}:${props.slide.id}:${props.slide.revision}`} businessId={props.businessId} remaining={3 - state.references.length} disabled={busy || pending || !work.ready || fileBusy}
          onBusyChange={setImportBusy} onImport={async items => {
            let next = state.references;
            for (const item of items) next = addPresentationReference(next, item, 3);
            await work.changeReferences(next);
          }} />
        {state.copy.status === 'literal' && <details><summary>Texto del diseño</summary><p className="dc-copy">{state.copy.text}</p></details>}
        {state.copy.status === 'none' && <p className="dc-muted">Diseño sin texto.</p>}
        {spec && <details><summary>Ficha de estilo</summary><p className="dc-muted">Estilo del diseño base. Puedes pedir qué conservar y qué cambiar.</p><pre className="dc-spec">{spec}</pre></details>}
        {brand && <details><summary>Identidad de {brand.name}</summary><p className="dc-muted">{[brand.style, brand.tone].filter(Boolean).join(' · ') || 'Paleta, tipografías y recursos guardados de esta marca.'}</p>
          <div className="dc-swatches">{Object.values(brand.colors).filter(Boolean).map((color, index) => <span key={index} style={{ background: color }} title={color} />)}</div></details>}
      </div>}
      <div ref={history} className="dc-history" aria-label="Historial de diseño" aria-live="polite">
        {!state.messages.length && <div className="dc-welcome"><MessageSquare size={26} /><h3>Empecemos por tu idea</h3><p>Añade referencias o dime qué diapositivas revisar. Antes de crear, te explicaré la propuesta para que la confirmes.</p>
          <button className="dc-button" onClick={() => { setReferencesOpen(true); composer.current?.focus(); }}>Añadir imágenes de referencia</button></div>}
        {state.messages.map(item => <article className={`dc-message dc-message-${item.role}`} key={item.id}><span>{item.role === 'user' ? 'Tú' : 'Asistente'}</span><p>{item.text}</p></article>)}
        {state.ideas.length > 0 && <div className="dc-ideas" aria-label="Ideas de diseño">{state.ideas.map((idea, index) => <article key={`${index}:${idea.title}`}><span>Idea {index + 1}</span><h4>{idea.title}</h4>
          <p>{idea.rationale}</p><button className="dc-button" disabled={blocked || pending} onClick={() => void act(() => work.startIdea(idea))}>Usar esta idea</button></article>)}</div>}
        {work.confirmationReady && <div className="dc-confirmation">
          {state.next_action?.design_source && <p>{describeConversationDesignSource(state.next_action.design_source, props.deckSlides ?? [props.slide], state.references)}</p>}
          <button className="dc-button dc-primary dc-next" disabled={blocked || pending || designPending} onClick={() => void act(() => work.executeSuggested())}>
          <Sparkles size={15} />{state.next_action?.kind === 'edit_elements' ? 'Preparar ajuste' : state.next_action?.kind === 'refine_html' || state.next_action?.kind === 'edit_image' ? 'Crear ajuste' : 'Crear diseño'}</button>
          <p>Puedes confirmar o escribir qué cambiar en la propuesta.</p></div>}
        {work.confirmationStale && <div className="dc-confirmation"><p>Cambiaron las opciones del diseño. Actualicemos la propuesta antes de crear.</p>
          <button className="dc-button dc-next" disabled={blocked || pending} onClick={() => void send('Actualiza la propuesta con el formato, la base y las referencias seleccionadas. Explícame qué harás antes de generarlo.')}>Actualizar propuesta</button></div>}
        {busy && <div className="dc-working" role="status"><Loader2 size={15} className="animate-spin" />Preparando tu diseño…</div>}
      </div>
      <div className="dc-composer">
        {error && <p role="alert" className="dc-error">{error}</p>}
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
        {pending && !busy && <div className="dc-recovery"><p>Hay una solicitud pendiente. Recupera su estado para continuar con este trabajo.</p><button className="dc-button" onClick={() => void act(() => work.recover())}>Recuperar solicitud</button>
          <button className="dc-button" onClick={() => void act(() => work.discard())}>Descartar</button></div>}
        <div className="dc-quick"><button className="dc-button" disabled={fileBusy || importBusy} onClick={() => setReferencesOpen(value => !value)} aria-expanded={referencesOpen}>
          <ImagePlus size={14} />{state.references.length ? `Referencias · ${state.references.length}` : 'Añadir referencia'}</button>
          <button className="dc-button" disabled={blocked || pending} onClick={() => void send('Explora y propón cinco ideas de diseño con mis referencias, la presentación y lo que hemos acordado. Quiero elegir una idea antes de preparar la propuesta; no generes todavía.')}><Sparkles size={14} />Explorar diseños</button></div>
        <div className="dc-input"><textarea ref={composer} aria-label="Mensaje de diseño" value={message} onChange={event => setMessage(event.target.value)} maxLength={6000} rows={3}
          disabled={blocked || pending} onPaste={paste} placeholder="Conserva el diseño y usa el texto de esta imagen, replica su composición o toma sólo su estilo…"
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <button className="dc-button" aria-label="Enviar" title="Enviar" disabled={blocked || pending || !message.trim()} onClick={() => void send()}><ArrowUp size={20} /></button></div>
        <p className="dc-muted">Primero acordamos la propuesta. Al confirmar, crearé el diseño.</p>
      </div>
    </aside><main className="dc-result">
      <div className="dc-result-bar"><div className="dc-result-label"><Layers size={17} /><span>{view === 'image' ? 'Diseño en imagen' : view === 'history' ? 'Versión guardada' : 'Diseño editable'}</span></div>
        <details className="dc-version-history"><summary>Historial{state.versions.length > 0 ? ` · ${state.versions.length}` : ''}</summary>
          <label>Versión del diseño<select aria-label="Versión del diseño" value={state.selected_version_id ?? ''} disabled={blocked || pending || !state.versions.length} onChange={event => void act(() => work.selectVersion(event.target.value))}>
            <option value="" disabled>Sin versiones todavía</option>{state.versions.map((version, index) => <option key={version.id} value={version.id}>Versión {index + 1} · {version.kind === 'image' ? 'Imagen' : 'HTML'}</option>)}</select></label></details></div>
      <div className="dc-preview-area">
        {view === 'image' && work.imagePreviewLoading && <p className="dc-muted" role="status">Cargando vista previa de la imagen…</p>}
        {view === 'history' && selected?.kind === 'html' && <div className="dc-snapshot">
          <PresentationCanvas html={selected.proposal.html} title="Versión guardada del diseño" />
          <p>{selected.composition?.unresolved_slots.length && work.syncStatus
            ? 'Esta composición conserva piezas pendientes. Puedes consultar la versión guardada; completa las piezas en su editor de origen antes de aplicarla.'
            : 'Esta es una vista del historial. Selecciona la versión actual para continuar editando o aplicarla.'}</p>
        </div>}
        {view === 'image' && (work.imagePreview ? <div className="dc-image-result"><img src={work.imagePreview} alt="Versión seleccionada del diseño" />
          <p>{quality ? `${quality.charAt(0).toUpperCase()}${quality.slice(1)} · ` : ''}{approved ? 'Versión aprobada' : result?.direction ? 'Dirección elegida' : 'Lista para revisar'}</p></div>
          : <div className="dc-empty"><div className="dc-empty-symbol"><Sparkles size={30} /></div><h3>Tu diseño, con espacio para probar</h3><p>La imagen o el HTML aparecerán aquí. Puedes conversar antes de generar.</p></div>)}
        {!work.ready && <div className="dc-empty" role="status">Cargando sesión…</div>}
        {work.ready && <div hidden={view !== 'html'}><SlideGeneratorPanel key={`html:${sessionIdentity}`} embedded externalConversation conversationSessionId={work.sessionToken} controllerRef={htmlController} onState={receiveHtmlState}
          onCorrectComposition={base === 'version' && selected?.kind === 'html' ? () => send(buildDesignRepairFeedback([],
            selected.proposal.visualReview ? describeVisualReview(selected.proposal.visualReview) : '').slice(0, 6000)) : undefined}
          styleExamples={format === 'html' && base === 'deck' ? deckKit?.examples : undefined} styleSpec={spec || undefined}
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
      </div>
      <footer className="dc-result-actions">
        {props.onInsert && <select aria-label="Destino del diseño" value={applyTarget} disabled={blocked || pending} onChange={event => setApplyTarget(event.target.value as typeof applyTarget)}>
          <option value="new">Nueva diapositiva</option><option value="current">Diapositiva actual</option></select>}
        {view === 'image' && result && <>
          {!approved && <button className="dc-button dc-primary" disabled={blocked || pending || !!result.direction && quality === 'low'} onClick={() => void act(() => work.approveImage())}><Check size={16} />{quality === 'low' ? 'Elegir esta dirección' : 'Aprobar esta versión'}</button>}
          {quality === 'low' && result.direction && <button className="dc-button dc-primary" disabled={blocked || pending} onClick={() => void act(() => work.generateMedium())}>Generar versión Medium</button>}
          <button className="dc-button" disabled={blocked || pending || !approved} onClick={() => void act(() => work.executeAction('convert_image_to_html'))}>Hacer editable</button>
          <button className="dc-button" disabled={blocked || pending || !approved} title={approved ? 'Mueve la imagen y añade elementos encima. Su contenido permanece en la imagen.' : 'Aprueba esta versión para editar sus capas'}
            onClick={() => void act(() => work.editImageLayers(false))}><Pencil size={16} />Editar capas</button>
          <button className="dc-button" disabled={blocked || pending || !approved} title={approved ? 'Añade un logo como elemento independiente' : 'Aprueba esta versión para editar sus capas'}
            onClick={() => void act(() => work.editImageLayers(true))}><Shapes size={16} />Logos</button>
        </>}
        {(view === 'html' || view === 'composition') && <><button className="dc-button" disabled={!canEdit}
          onClick={() => void act(async () => { if (view === 'composition') await compositionController.current?.openEditor(); else await htmlController.current?.openEditor(); })}><Pencil size={16} />Editar</button>
          <button className="dc-button" disabled={!canEdit} onClick={() => void act(async () => { if (view === 'composition') await compositionController.current?.openLogos(); else await htmlController.current?.openLogos(); })}><Shapes size={16} />Logos</button></>}
        <button className="dc-button dc-primary dc-apply" disabled={blocked || pending || !canApply} onClick={() => void act(() => work.apply())}>{view === 'image' ? 'Usar como imagen' : 'Aplicar diseño'}</button>
      </footer>
      <p className="dc-storage-note">{work.syncStatus ? 'Referencias, conversación y versiones con respaldo local y sincronización en Supabase.' : 'Referencias, conversación y versiones se conservan en este navegador.'}</p>
    </main></div>
  </section></div>;
}
