import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import { X, Sparkles, Wand2, Loader2, Pencil, Plus } from 'lucide-react';
import { useGenerateSlide } from '@/hooks/useGenerateSlide';
import { useAuth } from '@/hooks/useAuth';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { supabase } from '@/integrations/supabase/client';
import { renderHtmlToPng } from '@/utils/xendingDesign/canvasRenderer';
import { VisualDesignEditor } from '@/components/VisualDesignEditor';
import { PresentationCanvas } from './PresentationCanvas';
import { PresentationReferencePicker } from './PresentationReferencePicker';
import { addPresentationReference, preparePresentationReference, type PreparedPresentationReference } from '@/lib/presentations/presentationReferences';
import { imageDataUrl } from '@/lib/desaing/labImages';
import { getSlideDimensions, type PresentationMountedAsset } from '@/lib/presentations/presentationDocument';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { isUnresolvedReferenceCopy } from '@/lib/presentations/presentationServerDesign';
import { reconcileMountedAssets } from '@/lib/presentations/presentationManifest';
import { measureHtmlDesignAssets } from '@/lib/presentations/htmlDesignAssets';
import { assertHtmlDesignTarget, emptyHtmlDesignDraft, openHtmlDesignDraft,
  type HtmlDesignDraft, type HtmlDesignTarget, type HtmlDesignProposal } from '@/lib/presentations/htmlDesignDraft';
import './SlideGeneratorPanel.css';

export interface SlideGeneratorPanelProps {
  currentHtml?: string; businessId?: string; documentId?: string; slideId?: string; revision?: number;
  canvas?: { width: number; height: number }; mountedAssets?: PresentationMountedAsset[];
  initialInstruction?: string; initialCopy?: string; initialCopyMode?: HtmlDesignDraft['copyMode']; initialReferences?: PreparedPresentationReference[]; surfaceLabel?: string;
  embedded?: boolean; externalConversation?: boolean;
  controllerRef?: Ref<SlideGeneratorController>;
  onProposal?(proposal: HtmlDesignProposal, reason: SlideProposalReason): void;
  onState?(state: SlideGeneratorState): void;
  onInsert(html: string, target?: HtmlDesignTarget, mounted?: PresentationMountedAsset[]): void | Promise<void>;
  onApplyToCurrent(html: string, target?: HtmlDesignTarget, mounted?: PresentationMountedAsset[]): void | Promise<void>;
  onClose(): void;
  slides?: Array<{ title: string; html: string }>; currentSlide?: number; onSelectSlide?(idx: number): void;
  /** Other slides of the deck (inert markup + CSS) to reuse their components when creating. */
  styleExamples?: string[];
}
export type SlideProposalReason = 'generated' | 'refined' | 'edited' | 'recovered' | 'imported';
export interface SlideGeneratorContext {
  instruction?: string; copy?: string; copyMode?: HtmlDesignDraft['copyMode']; references?: PreparedPresentationReference[];
  proposal?: HtmlDesignProposal;
}
export interface SlideGeneratorState {
  ready: boolean; busy: boolean; error: string; status: HtmlDesignDraft['status'];
  context: { instruction: string; copy: string; copyMode: HtmlDesignDraft['copyMode']; references: PreparedPresentationReference[] };
  proposal: HtmlDesignProposal | null;
}
export interface SlideGeneratorController {
  updateContext(input: SlideGeneratorContext): Promise<void>;
  create(input?: SlideGeneratorContext): Promise<HtmlDesignProposal>;
  refine(input: SlideGeneratorContext & { feedback: string; compare?: boolean }): Promise<HtmlDesignProposal>;
  openEditor(): Promise<void>;
  recover(): Promise<HtmlDesignDraft>;
  apply(): Promise<void>;
}
type Store = Awaited<ReturnType<typeof openHtmlDesignDraft>>;
type Life = { active: boolean; store?: Store; revision: number; queue: Promise<unknown> };

/** Same workspace for presentation slides and independent covers/pages. */
export function SlideGeneratorPanel(props: SlideGeneratorPanelProps) {
  const { user } = useAuth(), { activeBusinessId, activeBusiness } = useActiveBusiness();
  const businessId = props.businessId ?? activeBusinessId;
  if (!user || !businessId) return <div className={props.embedded ? 'hws-embedded' : 'hws-overlay'}><section className="hws-dialog"><p>Inicia sesión y selecciona una marca para diseñar.</p>{!props.embedded && <button onClick={props.onClose}>Cerrar</button>}</section></div>;
  const documentId = props.documentId ?? `draft:${businessId}`, slideId = props.slideId ?? 'current';
  return <HtmlDesignWorkspace key={JSON.stringify([user.id, businessId, documentId, slideId])} {...props}
    businessId={businessId} documentId={documentId} slideId={slideId} actorId={user.id} brandName={activeBusiness?.name ?? 'Marca actual'} />;
}
function HtmlDesignWorkspace(props: SlideGeneratorPanelProps & { actorId: string; businessId: string; documentId: string; slideId: string; brandName: string }) {
  const generate = useGenerateSlide();
  const [draft, setDraft] = useState<HtmlDesignDraft>(emptyHtmlDesignDraft), draftRef = useRef(draft); draftRef.current = draft;
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [fileBusy, setFileBusy] = useState(false), [error, setError] = useState('');
  const [editing, setEditing] = useState(false), [intent, setIntent] = useState<'insert' | 'replace'>(props.surfaceLabel ? 'replace' : 'insert');
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [format, setFormat] = useState<'current' | 'slide' | 'letter'>('current');
  const history = useRef<HTMLDivElement>(null);
  const lifeRef = useRef<Life | null>(null), locked = useRef(false), latest = useRef(props); latest.current = props;
  const target: HtmlDesignTarget = { document: props.documentId, slide: props.slideId, revision: props.revision ?? 1 };
  const canvas = props.canvas ?? (format === 'letter' ? { width: 1920, height: 2485 } : format === 'slide' ? { width: 1920, height: 1080 }
    : getSlideDimensions(props.currentHtml ?? ''));
  const active = (life: Life) => life.active && lifeRef.current === life;
  const currentTarget = (): HtmlDesignTarget => ({ document: latest.current.documentId, slide: latest.current.slideId, revision: latest.current.revision ?? 1 });
  const blocked = busy || fileBusy || !ready;
  useEffect(() => { if (history.current) history.current.scrollTop = history.current.scrollHeight; }, [draft.messages]);
  useEffect(() => {
    const life: Life = { active: true, revision: 0, queue: Promise.resolve() }; lifeRef.current = life;
    void (async () => {
      const store = await openHtmlDesignDraft({ actor: props.actorId, business: props.businessId, document: props.documentId, slide: props.slideId });
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
  }, [props.actorId, props.businessId, props.documentId, props.slideId]);
  function patch(partial: Partial<HtmlDesignDraft>) { const next = { ...draftRef.current, ...partial }; draftRef.current = next; setDraft(next); return next; }
  function notifyProposal(proposal: HtmlDesignProposal, reason: SlideProposalReason) {
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
    locked.current = true; setBusy(true); setError('');
    try { await life.queue; await assertSession(life); return await action(life); }
    catch (e) { if (active(life)) setError(e instanceof Error ? e.message : 'No se pudo completar el cambio.'); if (propagate) throw e; }
    finally { locked.current = false; if (active(life)) setBusy(false); }
  }
  useEffect(() => {
    const paste = (event: ClipboardEvent) => {
      if (props.externalConversation || !ready || locked.current || fileBusy || editing) return;
      const file = Array.from(event.clipboardData?.items ?? []).find(item => item.type.startsWith('image/'))?.getAsFile();
      if (!file) return; event.preventDefault();
      void run(async life => { const reference = await preparePresentationReference(file); if (!active(life)) return;
        await persist(patch({ references: addPresentationReference(draftRef.current.references, reference, 3) })); });
    };
    window.addEventListener('paste', paste); return () => window.removeEventListener('paste', paste);
  }, [ready, fileBusy, editing, props.externalConversation]);
  async function requestHtml(life: Life, refine: boolean, compare: boolean) {
    const before = structuredClone(draftRef.current), destination = { ...target };
    if (before.status !== 'ready') throw Error('La solicitud anterior no se confirmó. Conserva la propuesta o prepara explícitamente otra versión.');
    if (!refine && !before.instruction.trim() && !before.references.length) throw Error('Describe el diseño o añade una referencia.');
    if (before.copyMode === 'literal' && !before.copy.trim()) throw Error('Escribe el texto literal que debe llevar el diseño.');
    if (before.copyMode === 'literal' && isUnresolvedReferenceCopy(before.copy)) {
      setDetailsOpen(true);
      throw Error('Ese texto indica qué referencia leer. Escríbelo en «Tu idea» y elige «Según mis indicaciones», o pega aquí las palabras exactas del diseño.');
    }
    if (refine && !before.feedback.trim()) throw Error('Escribe el cambio que quieres hacer.');
    if (refine && before.proposal?.pending) throw Error('Comprueba las piezas de la propuesta antes de pedir otro ajuste.');
    const base = before.proposal?.html ?? props.currentHtml;
    if (refine && !base) throw Error('Primero crea una propuesta.');
    if (refine && before.proposal) assertHtmlDesignTarget(before.proposal, destination);
    const size = refine ? getSlideDimensions(base!) : canvas;
    const references = await Promise.all(before.references.map(async item => ({ id: item.id, name: item.name, role: item.role, image_base64: await imageDataUrl(item.blob) })));
    const render = compare && base ? await renderHtmlToPng(base, 'xending', size.width, size.height) : undefined;
    await assertSession(life); if (JSON.stringify(destination) !== JSON.stringify(currentTarget())) throw Error('El lienzo cambió mientras se preparaba el encargo.');
    await persist(patch({ status: 'sending' }));
    try {
      const response = await generate.mutateAsync({ design_system: 'design-canvas', business_id: props.businessId, expectedActorId: props.actorId,
        canvas: size, instruction: before.instruction || undefined, references,
        ...(before.copyMode !== 'instruction' ? { copy_mode: before.copyMode, approved_copy: before.copyMode === 'literal' ? before.copy : undefined } : {}),
        ...(refine ? { current_html: base, iteration_feedback: before.feedback, render_base64: render } : {}),
        ...(!refine && latest.current.styleExamples?.length ? { style_examples: structuredClone(latest.current.styleExamples) } : {}),
      });
      await assertSession(life);
      const html = sanitizePresentationHtml(response.html);
      const actual = getSlideDimensions(html);
      if (actual.width !== size.width || actual.height !== size.height) throw Error('La respuesta cambió las dimensiones del lienzo. La versión anterior se conserva.');
      const measured = await measureHtmlDesignAssets({ id: props.slideId, revision: destination.revision, title: '', html: refine ? base! : '',
        mounted_assets: refine ? before.proposal?.mounted ?? props.mountedAssets ?? [] : [] }, html, size);
      await assertSession(life);
      const proposal: HtmlDesignProposal = { ...measured, target: destination, canvas: size, intent: refine ? before.proposal?.intent ?? 'replace' : intent };
      const next = patch({ proposal, status: 'ready', feedback: '', messages: [...before.messages,
        { role: 'user' as const, text: refine ? before.feedback : before.instruction || 'Diseña a partir de mis referencias.' },
        { role: 'assistant' as const, text: 'La propuesta está lista. Puedes pedir ajustes, editarla directamente o aplicarla al documento.' }].slice(-40) });
      await persist(next);
      if (active(life)) setDetailsOpen(false);
      notifyProposal(proposal, refine ? 'refined' : 'generated');
      return structuredClone(proposal);
    } catch (e) {
      if (active(life)) { patch({ status: 'uncertain' }); await persist().catch(() => {}); }
      throw e;
    }
  }
  async function saveVisual(html: string, close: boolean) {
    await run(async life => {
      const proposal = draftRef.current.proposal; if (!proposal) return;
      const clean = sanitizePresentationHtml(html), dims = getSlideDimensions(clean);
      if (dims.width !== proposal.canvas.width || dims.height !== proposal.canvas.height) throw Error('Conserva el tamaño del lienzo.');
      const measured = proposal.pending ? await measureHtmlDesignAssets(proposal.pending.source, clean, proposal.canvas) : {
        html: clean, mounted: reconcileMountedAssets({ id: props.slideId, revision: proposal.target.revision, title: '', html: proposal.html, mounted_assets: proposal.mounted }, clean), pending: undefined,
      };
      await assertSession(life);
      const nextProposal = { ...proposal, ...measured, pending: measured.pending };
      await persist(patch({ proposal: nextProposal })); notifyProposal(nextProposal, 'edited'); if (close) setEditing(false);
    });
  }
  async function updateContext(life: Life, input: SlideGeneratorContext) {
    if (draftRef.current.status !== 'ready') throw Error('Recupera la solicitud pendiente antes de sustituir su contexto.');
    const change: Partial<HtmlDesignDraft> = {};
    for (const key of ['instruction', 'copy', 'copyMode', 'references'] as const) {
      if (input[key] !== undefined) Object.assign(change, { [key]: structuredClone(input[key]) });
    }
    if (input.proposal) {
      assertHtmlDesignTarget(input.proposal, currentTarget());
      const clean = sanitizePresentationHtml(input.proposal.html), size = getSlideDimensions(clean);
      if (size.width !== input.proposal.canvas.width || size.height !== input.proposal.canvas.height) throw Error('La propuesta cambió las dimensiones del lienzo.');
      change.proposal = { ...structuredClone(input.proposal), html: clean };
    }
    await assertSession(life);
    const next = { ...draftRef.current, ...change };
    await persist(next); patch(change);
    if (change.proposal) { setIntent(change.proposal.intent); notifyProposal(change.proposal, 'imported'); }
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
    async create(input = {}) { const frozen = structuredClone(input); return (await run(async life => { await updateContext(life, frozen); return requestHtml(life, false, false); }, true))!; },
    async refine(input) { const frozen = structuredClone(input); return (await run(async life => {
      await updateContext(life, frozen); await persist(patch({ feedback: frozen.feedback }));
      return requestHtml(life, true, frozen.compare === true);
    }, true))!; },
    async openEditor() { await run(async life => {
      if (!draftRef.current.proposal) throw Error('Primero crea o recupera una propuesta.');
      await assertSession(life); await persist(); setEditing(true);
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
    async apply() { await run(apply, true); },
  }));
  if (editing && draft.proposal) return <><VisualDesignEditor html={draft.proposal.html} pieceIndex={props.currentSlide ?? 0}
    dimensions={draft.proposal.canvas} businessId={props.businessId} editableElements={[]}
    onSave={html => void saveVisual(html, true)} onApply={html => void saveVisual(html, false)} onCancel={() => setEditing(false)} />
    {error && <p role="alert" className="hws-editor-error">{error}</p>}</>;
  const view = draft.proposal?.html ?? props.currentHtml;
  const viewSize = draft.proposal?.canvas ?? canvas;
  const changed = draft.proposal && JSON.stringify(draft.proposal.target) !== JSON.stringify(target);
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
      <PresentationReferencePicker items={draft.references} disabled={busy || !ready} conversationReadsImages onBusyChange={setFileBusy}
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
      {view ? <PresentationCanvas html={view} title="Vista previa del diseño HTML" /> : <div className="hws-empty"><Plus /><p>Tu diseño aparecerá aquí.</p></div>}
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
      <button disabled={busy || fileBusy} onClick={props.onClose}>Salir conservando el último borrador guardado</button></> : <p>{busy ? 'Preparando tu diseño…' : 'Aplica cuando estés conforme con el resultado.'}</p>}</div>
      {!props.externalConversation && <button className="hws-primary" disabled={blocked || !draft.proposal || !!draft.proposal.pending || !!changed} onClick={() => void run(apply)}>{busy ? <Loader2 size={17} /> : null}Aplicar diseño revisado</button>}</footer>
  </section></div>;
}
