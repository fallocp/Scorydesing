import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { buildDeckStyleKit } from '@/lib/presentations/designConversationHtml';
import { measureStyleSpec } from '@/lib/presentations/styleSpec';
import { ArrowUp, Check, ImagePlus, Layers, Loader2, MessageSquare, Pencil, Sparkles, X } from 'lucide-react';
import type { PresentationSlide } from '@/lib/presentations/presentationDocument';
import { getSlideDimensions, reviseSlide } from '@/lib/presentations/presentationDocument';
import type { DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import type { ConversationActionKind } from '../../../supabase/functions/_shared/desaing/conversationActions';
import type { PresentationDesignService } from './PresentationDesignContext';
import { useDesignConversation, type DesignConversationView } from '@/lib/presentations/useDesignConversation';
import { useImageGenerationSettings } from '@/hooks/useImageGenerationSettings';
import { ImageGenerationControls } from '@/components/image-generation/ImageGenerationControls';
import { PRESENTATION_IMAGE_MODELS } from '@/lib/presentations/presentationServerDesign';
import { PresentationReferencePicker } from './PresentationReferencePicker';
import { PresentationCanvas } from './PresentationCanvas';
import { addPresentationReference, preparePresentationReference } from '@/lib/presentations/presentationReferences';
import { SlideGeneratorPanel, type SlideGeneratorController, type SlideGeneratorState } from './SlideGeneratorPanel';
import { DesignToHtmlPanel, type DesignToHtmlController, type DesignToHtmlState } from './DesignToHtmlPanel';
import './UnifiedDesignWorkspace.css';

export interface UnifiedDesignWorkspaceProps {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  destination?: DesignSurfaceDestination; initialInstruction?: string; initialCopy?: string; initialView?: 'image' | 'html';
  /** Slides of the presentation, for the «Estilo de la presentación» base. */
  deckSlides?: ReadonlyArray<PresentationSlide>;
  onApply(slide: PresentationSlide): void | Promise<void>; onInsert?(slide: PresentationSlide): void | Promise<void>; onClose(): void;
}
const actionLabels: Partial<Record<ConversationActionKind, string>> = {
  generate_image: 'Generar este diseño', edit_image: 'Crear la versión corregida', create_html: 'Crear el HTML',
  refine_html: 'Preparar el ajuste HTML', convert_image_to_html: 'Hacer editable esta imagen',
};

/** One conversation owns context. Image/HTML engines are tools inside this workspace. */
export function UnifiedDesignWorkspace(props: UnifiedDesignWorkspaceProps) {
  const { settings, setSettings } = useImageGenerationSettings(props.businessId, 'design-conversation');
  const htmlController = useRef<SlideGeneratorController | null>(null), compositionController = useRef<DesignToHtmlController | null>(null);
  const htmlState = useRef<SlideGeneratorState | null>(null), compositionState = useRef<DesignToHtmlState | null>(null);
  const [view, setView] = useState<DesignConversationView>(props.initialView ?? 'image');
  const [applyTarget, setApplyTarget] = useState<'current' | 'new'>(props.onInsert ? 'new' : 'current');
  const onView = useCallback((next: DesignConversationView) => setView(next), []);
  const applyResult = useCallback(async (next: PresentationSlide) => {
    if (applyTarget === 'new' && props.onInsert) await props.onInsert(next); else await props.onApply(next);
    props.onClose();
  }, [applyTarget, props.onApply, props.onInsert, props.onClose]);
  // Formato y base los elige el usuario; la IA sólo puede proponer acciones de ese formato.
  const [format, setFormat] = useState<'html' | 'image'>(props.initialView === 'html' ? 'html' : 'image');
  // Kit de estilo: hasta 3 diapositivas con contenido, las más cercanas a la actual.
  const deckKit = useMemo(() => props.deckSlides?.length ? buildDeckStyleKit(props.deckSlides, props.slide.id) : null, [props.deckSlides, props.slide.id]);
  const [chosenBase, setBase] = useState<'current' | 'version' | 'deck' | 'new'>(() => props.slide.html
    .replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>|<[^>]+>/gi, '').trim() ? 'current' : deckKit?.slides.length ? 'deck' : 'new');
  // Ficha de estilo: se mide del diseño base (la diapositiva, o la diapositiva del deck más cercana) en el navegador.
  const specSource = format !== 'html' || chosenBase === 'new' ? null : chosenBase === 'deck'
    ? props.deckSlides?.find(slide => slide.id === deckKit?.ids[0])?.html ?? null : props.slide.html;
  const [styleSpec, setStyleSpec] = useState({ source: '', spec: '' });
  useEffect(() => {
    if (!specSource) return;
    let alive = true;
    void measureStyleSpec(specSource, getSlideDimensions(specSource)).then(spec => { if (alive) setStyleSpec({ source: specSource, spec }); }, () => {});
    return () => { alive = false; };
  }, [specSource]);
  const spec = specSource && styleSpec.source === specSource ? styleSpec.spec : '';
  const work = useDesignConversation({ ...props, onApply: applyResult, settings, htmlController, compositionController, htmlState, compositionState, onView,
    format, base: chosenBase, deckStyle: deckKit?.slides, styleSpec: spec });
  const [message, setMessage] = useState(props.initialInstruction ?? ''), [referencesOpen, setReferencesOpen] = useState(false);
  const [fileBusy, setFileBusy] = useState(false), [localError, setLocalError] = useState('');
  const [htmlUi, setHtmlUi] = useState({ ready: false, busy: false, error: '' });
  const [compositionUi, setCompositionUi] = useState({ ready: false, busy: false, error: '', canApply: false });
  const history = useRef<HTMLDivElement>(null), composer = useRef<HTMLTextAreaElement>(null), hydrated = useRef(false);
  const state = work.state, canvas = getSlideDimensions(props.slide.html);
  const selected = state.versions.find(item => item.id === state.selected_version_id);
  // «Esta versión» sólo existe con una versión HTML seleccionada; si no, la base es la diapositiva.
  const base = chosenBase === 'version' && selected?.kind !== 'html' ? 'current' : chosenBase;
  const result = work.imageResult;
  const busy = work.busy || htmlUi.busy || compositionUi.busy;
  const blocked = busy || fileBusy || !work.ready || !!work.syncStatus && work.syncStatus !== 'synced';
  const pending = !!state.pending;
  const copyPending = state.copy.status === 'pending';
  const pendingQuestions = state.understanding?.pending_questions ?? [];
  const designPending = copyPending || pendingQuestions.length > 0;
  const brand = state.brand ?? work.brand.context;
  const source = props.destination?.document_type ?? 'presentation';
  const title = source === 'presentation' ? 'Diseñar diapositiva' : source === 'cover' ? 'Diseñar portada' : source === 'page' ? 'Diseñar página' : 'Diseñar una pieza';
  const receiveHtmlState = useCallback((next: SlideGeneratorState) => {
    htmlState.current = next;
    setHtmlUi(old => old.ready === next.ready && old.busy === next.busy && old.error === next.error ? old : { ready: next.ready, busy: next.busy, error: next.error });
  }, []);
  const receiveCompositionState = useCallback((next: DesignToHtmlState) => {
    compositionState.current = next;
    setCompositionUi(old => old.ready === next.ready && old.busy === next.busy && old.error === next.error && old.canApply === next.canApply
      ? old : { ready: next.ready, busy: next.busy, error: next.error, canApply: next.canApply });
  }, []);
  useEffect(() => {
    if (history.current) history.current.scrollTop = history.current.scrollHeight;
  }, [state.messages.length, state.ideas, busy]);
  useEffect(() => {
    if (work.ready && !hydrated.current) { hydrated.current = true; if (state.messages.length) setMessage(''); composer.current?.focus(); }
  }, [work.ready, state.messages.length]);
  async function act(task: () => Promise<unknown>) {
    setLocalError('');
    try { await task(); } catch (problem) { setLocalError(problem instanceof Error ? problem.message : 'No se pudo completar la acción. Tu trabajo se conserva.'); }
  }
  async function send(text = message) {
    if (!text.trim() || blocked || pending) return;
    await act(async () => { if (await work.send(text.trim())) setMessage(''); });
  }
  async function paste(event: React.ClipboardEvent<HTMLTextAreaElement>) {
    if (blocked || pending) return;
    const image = Array.from(event.clipboardData.items).find(item => item.type.startsWith('image/'))?.getAsFile();
    if (!image) return;
    event.preventDefault(); setFileBusy(true);
    try { const prepared = await preparePresentationReference(image); await work.changeReferences(addPresentationReference(state.references, prepared, 3)); setReferencesOpen(true); }
    catch (problem) { setLocalError(problem instanceof Error ? problem.message : 'No se pudo añadir la imagen.'); }
    finally { setFileBusy(false); }
  }
  const approved = result?.call.state === 'approved';
  const quality = result?.asset.provenance.kind === 'image_operation' ? result.asset.provenance.quality : undefined;
  const canApply = view === 'image' ? approved : view === 'composition' ? compositionUi.canApply : view === 'html' && !!selected && selected.kind === 'html' && !selected.proposal.pending;
  const error = localError || work.error;
  return <div className="dc-backdrop"><section className="dc-workspace" role="dialog" aria-modal="true" aria-label="Conversación de diseño" aria-busy={busy}>
    <header className="dc-header"><div><div className="dc-brand"><span className="dc-brand-dot" style={{ background: brand?.colors.primary || undefined }} />{brand?.name || 'Marca del proyecto'}<span>· {canvas.width} × {canvas.height}</span></div>
      <h2>{title}</h2><p>Conversa, crea y ajusta el resultado aquí.</p></div>
      <div className="dc-settings"><ImageGenerationControls value={settings} onChange={setSettings} disabled={blocked || pending}
        availableModels={work.generation?.profiles?.map(profile => PRESENTATION_IMAGE_MODELS[profile])} availableQualities={work.generation?.qualities} /></div>
      <button className="dc-button dc-icon" aria-label="Cerrar conversación de diseño" disabled={busy || fileBusy} onClick={props.onClose}><X size={20} /></button>
    </header>
    <div className="dc-body"><aside className="dc-conversation">
      <div className="dc-context-bar"><div className="dc-context-controls"><label className="dc-mode"><span className="sr-only">Modo de diseño</span><select aria-label="Modo de diseño" value={state.mode} disabled={blocked || pending}
        onChange={event => void act(() => work.setMode(event.target.value as typeof state.mode))}><option value="execute_change">Ejecutar cambio</option><option value="explore_design">Explorar diseño</option></select></label>
        <label className="dc-mode"><span className="sr-only">Formato</span><select aria-label="Formato del diseño" value={format} disabled={blocked || pending}
          onChange={event => setFormat(event.target.value as typeof format)}><option value="html">HTML editable</option><option value="image">Imagen IA</option></select></label>
        {format === 'html' && <label className="dc-mode"><span className="sr-only">Base</span><select aria-label="Base del diseño" value={base} disabled={blocked || pending}
          onChange={event => setBase(event.target.value as typeof base)}><option value="current">Diseño de la diapositiva</option>{selected?.kind === 'html' && <option value="version">Esta versión</option>}{!!deckKit?.slides.length && <option value="deck">Estilo de la presentación</option>}<option value="new">Diseño nuevo</option></select></label>}</div>
        <button className="dc-button dc-reference-toggle" disabled={fileBusy} onClick={() => setReferencesOpen(value => !value)} aria-expanded={referencesOpen}><ImagePlus size={16} />Referencias · {state.references.length}</button></div>
      {referencesOpen && <div className="dc-reference-drawer"><PresentationReferencePicker items={state.references} disabled={busy || pending || !work.ready} onBusyChange={setFileBusy}
        onChange={items => work.changeReferences(items)} maxReferences={3} conversationReadsImages />
        {state.copy.status === 'literal' && <details><summary>Texto del diseño</summary><p className="dc-copy">{state.copy.text}</p></details>}
        {state.copy.status === 'none' && <p className="dc-muted">Diseño sin texto.</p>}
        {spec && <details><summary>Ficha de estilo</summary><p className="dc-muted">Medida del diseño base; se envía siempre a la IA.</p><pre className="dc-spec">{spec}</pre></details>}
        {brand && <details><summary>Identidad de {brand.name}</summary><p className="dc-muted">{[brand.style, brand.tone].filter(Boolean).join(' · ') || 'Paleta, tipografías y recursos guardados de esta marca.'}</p>
          <div className="dc-swatches">{Object.values(brand.colors).filter(Boolean).map((color, index) => <span key={index} style={{ background: color }} title={color} />)}</div></details>}
      </div>}
      <div ref={history} className="dc-history" aria-label="Historial de diseño" aria-live="polite">
        {!state.messages.length && <div className="dc-welcome"><MessageSquare size={26} /><h3>Empecemos por tu idea</h3><p>Puedes añadir ejemplos y decirme qué conservar de cada uno.</p>
          <button className="dc-button" onClick={() => { setMessage('Usa el texto y la composición de la primera imagen y el mundo de la segunda. Crea una portada con mi marca.'); composer.current?.focus(); }}>Usar dos referencias para una portada</button></div>}
        {state.messages.map(item => <article className={`dc-message dc-message-${item.role}`} key={item.id}><span>{item.role === 'user' ? 'Tú' : 'Asistente'}</span><p>{item.text}</p></article>)}
        {state.ideas.length > 0 && <div className="dc-ideas" aria-label="Ideas de diseño">{state.ideas.map((idea, index) => <article key={`${index}:${idea.title}`}><span>Idea {index + 1}</span><h4>{idea.title}</h4>
          <p>{idea.rationale}</p><button className="dc-button" aria-describedby={designPending ? 'dc-design-pending' : undefined} disabled={blocked || pending || designPending} onClick={() => void act(() => work.startIdea(idea))}>Generar esta idea</button></article>)}</div>}
        {state.next_action && actionLabels[state.next_action.kind] && <button className="dc-button dc-next" aria-describedby={designPending ? 'dc-design-pending' : undefined} disabled={blocked || pending || designPending} onClick={() => void act(() => work.executeSuggested())}>
          <Sparkles size={15} />{actionLabels[state.next_action.kind]}</button>}
        {busy && <div className="dc-working" role="status"><Loader2 size={15} className="animate-spin" />Preparando tu diseño…</div>}
      </div>
      <div className="dc-composer">
        {error && <p role="alert" className="dc-error">{error}</p>}
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
        <p className="dc-basis" role="status">{format === 'image' ? 'Se creará una imagen IA a partir de tus referencias' + (result ? ' y la imagen seleccionada.' : '.')
          : base === 'current' ? 'Se partirá del diseño de esta diapositiva (no de las versiones generadas): sigue su patrón y acomoda la información nueva.'
          : base === 'version' ? 'Se seguirá ajustando la versión seleccionada.'
          : base === 'deck' ? `Se creará con el estilo de la presentación (${deckKit?.slides.map(slide => slide.title).join(', ')}).`
          : 'Se creará un HTML nuevo a partir de tus referencias.'} Puedes cambiarlo arriba en «Formato» y «Base».</p>
        <div className="dc-quick"><button className="dc-button" disabled={blocked || pending} onClick={() => void send('Propón cinco ideas de diseño con mis referencias y lo que hemos acordado. No generes imágenes todavía.')}>Dame cinco ideas</button>
          {format === 'image' && <button className="dc-button" disabled={blocked || pending} onClick={() => void send('Crea una imagen con las referencias y el diseño que hemos acordado.')}>Crear imagen</button>}
          {format === 'html' && <button className="dc-button" disabled={blocked || pending} onClick={() => void send(base === 'current'
            ? 'Aplica lo acordado al diseño actual de la diapositiva: conserva su estructura y acomoda el texto con las referencias.'
            : base === 'version' ? 'Ajusta la versión seleccionada con lo que hemos acordado.'
            : base === 'deck' ? 'Crea esta diapositiva con los componentes y el estilo de la presentación, con la información de las referencias y lo que hemos acordado.'
            : 'Crea HTML editable nuevo a partir de las referencias y lo que hemos acordado.')}>
            {base === 'current' ? 'Aplicar al diseño actual' : base === 'version' ? 'Ajustar esta versión' : base === 'deck' ? 'Crear con el estilo del deck' : 'Crear HTML'}</button>}</div>
        <div className="dc-input"><textarea ref={composer} aria-label="Mensaje de diseño" value={message} onChange={event => setMessage(event.target.value)} maxLength={6000} rows={3}
          disabled={blocked || pending} onPaste={paste} placeholder="Usa el texto de la primera imagen y el mundo de la segunda…"
          onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); void send(); } }} />
          <button className="dc-button" aria-label="Enviar" title="Enviar" disabled={blocked || pending || !message.trim()} onClick={() => void send()}><ArrowUp size={20} /></button></div>
        <p className="dc-muted">Si pides crear o corregir, prepararé una versión para revisar. Tus preguntas se responden en la conversación.</p>
      </div>
    </aside><main className="dc-result">
      <div className="dc-result-bar"><div className="dc-result-label"><Layers size={17} /><span>{view === 'image' ? 'Diseño en imagen' : view === 'history' ? 'Versión guardada' : 'Diseño editable'}</span></div>
        <select aria-label="Versión del diseño" value={state.selected_version_id ?? ''} disabled={blocked || pending || !state.versions.length} onChange={event => void act(() => work.selectVersion(event.target.value))}>
          <option value="" disabled>Sin versiones todavía</option>{state.versions.map((version, index) => <option key={version.id} value={version.id}>Versión {index + 1} · {version.kind === 'image' ? 'Imagen' : 'HTML'}</option>)}</select></div>
      <div className="dc-preview-area">
        {view === 'history' && selected?.kind === 'html' && <div className="dc-snapshot">
          <PresentationCanvas html={selected.proposal.html} title="Versión guardada del diseño" />
          <p>{selected.composition?.unresolved_slots.length && work.syncStatus
            ? 'Esta composición conserva piezas pendientes. Puedes consultar la versión guardada; completa las piezas en su editor de origen antes de aplicarla.'
            : 'Esta es una vista del historial. Selecciona la versión actual para continuar editando o aplicarla.'}</p>
        </div>}
        {view === 'image' && (work.imagePreview ? <div className="dc-image-result"><img src={work.imagePreview} alt="Versión seleccionada del diseño" />
          <p>{quality ? `${quality.charAt(0).toUpperCase()}${quality.slice(1)} · ` : ''}{approved ? 'Versión aprobada' : result?.direction ? 'Dirección elegida' : 'Lista para revisar'}</p></div>
          : <div className="dc-empty"><div className="dc-empty-symbol"><Sparkles size={30} /></div><h3>Tu diseño, con espacio para probar</h3><p>La imagen o el HTML aparecerán aquí. Puedes conversar antes de generar.</p></div>)}
        <div hidden={view !== 'html'}><SlideGeneratorPanel embedded externalConversation controllerRef={htmlController} onState={receiveHtmlState}
          styleExamples={format === 'html' && base === 'deck' ? deckKit?.examples : undefined} styleSpec={spec || undefined}
          onProposal={(proposal, reason) => { if (reason === 'edited' && work.ready) void act(() => work.recordHtmlEdit(proposal, reason)); }} businessId={props.businessId} documentId={props.documentId}
          slideId={props.slide.id} revision={props.slide.revision} currentHtml={props.slide.html} mountedAssets={props.slide.mounted_assets} canvas={canvas}
          surfaceLabel={source === 'presentation' ? 'diapositiva' : source === 'cover' ? 'portada' : 'página'}
          onApplyToCurrent={async (html, target, mounted) => {
            if (!target || target.document !== props.documentId || target.slide !== props.slide.id || target.revision !== props.slide.revision) throw Error('El documento cambió. Reabre la conversación.');
            await applyResult(reviseSlide([props.slide], { slide_id: props.slide.id, expected_revision: props.slide.revision, html, mounted_assets: mounted ?? [] })[0]);
          }} onInsert={async () => { throw Error('Elige el destino desde la conversación.'); }} onClose={() => {}} /></div>
        <div hidden={view !== 'composition'}><DesignToHtmlPanel embedded externalConversation controllerRef={compositionController} onState={receiveCompositionState}
          onProposal={(proposal, reason) => { if (reason === 'edited' && work.ready) void act(() => work.recordCompositionEdit(proposal, reason)); }} service={props.service} businessId={props.businessId} documentId={props.documentId}
          slide={props.slide} destination={props.destination} onApply={applyResult} onClose={() => {}} /></div>
      </div>
      <footer className="dc-result-actions">
        {props.onInsert && <select aria-label="Destino del diseño" value={applyTarget} disabled={blocked || pending} onChange={event => setApplyTarget(event.target.value as typeof applyTarget)}>
          <option value="new">Nueva diapositiva</option><option value="current">Diapositiva actual</option></select>}
        {view === 'image' && result && <>
          {!approved && <button className="dc-button dc-primary" disabled={blocked || pending || !!result.direction && quality === 'low'} onClick={() => void act(() => work.approveImage())}><Check size={16} />{quality === 'low' ? 'Elegir esta dirección' : 'Aprobar esta versión'}</button>}
          {quality === 'low' && result.direction && <button className="dc-button dc-primary" disabled={blocked || pending} onClick={() => void act(() => work.generateMedium())}>Generar versión Medium</button>}
          <button className="dc-button" disabled={blocked || pending || !approved} onClick={() => void act(() => work.executeAction('convert_image_to_html'))}>Hacer editable</button>
        </>}
        {(view === 'html' || view === 'composition') && <button className="dc-button" disabled={blocked || pending || view === 'composition' && !compositionUi.canApply || view === 'html' && !htmlState.current?.proposal}
          onClick={() => void act(async () => { if (view === 'composition') await compositionController.current?.openEditor(); else await htmlController.current?.openEditor(); })}><Pencil size={16} />Editor completo</button>}
        <button className="dc-button dc-primary dc-apply" disabled={blocked || pending || !canApply} onClick={() => void act(() => work.apply())}>{view === 'image' ? 'Usar como imagen' : 'Aplicar diseño revisado'}</button>
      </footer>
      <p className="dc-storage-note">{work.syncStatus ? 'Referencias, conversación y versiones con respaldo local y sincronización en Supabase.' : 'Referencias, conversación y versiones se conservan en este navegador.'}</p>
    </main></div>
  </section></div>;
}
