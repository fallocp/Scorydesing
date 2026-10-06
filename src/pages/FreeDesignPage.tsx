import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, Download, Plus, Copy, Palette } from 'lucide-react';
import type { OpenInEditorState } from '@/lib/create-edit/openInEditor';
import { FreeBrandLayerPanel } from '@/components/desaing/FreeBrandLayerPanel';
import { rasterizeHtml } from '@/lib/desaing/rasterizeHtml';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { usePresentationDesignService, type PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { ServerDesignPanel } from '@/components/presentations/ServerDesignPanel';
import { DesignToHtmlPanel } from '@/components/presentations/DesignToHtmlPanel';
import { MountedImagesPanel } from '@/components/presentations/MountedImagesPanel';
import { DeckComposerPanel } from '@/components/presentations/DeckComposerPanel';
import { MaterialsPanel } from '@/components/desaing/MaterialsPanel';
import { appendReviewedMaterialsBrief } from '@/lib/desaing/materialBrief';
import { PresentationCanvas } from '@/components/presentations/PresentationCanvas';
import { VisualDesignEditor } from '@/components/VisualDesignEditor';
import { UnifiedDesignWorkspace } from '@/components/presentations/UnifiedDesignWorkspace';
import { HtmlSectionEditor } from '@/components/HtmlSectionEditor';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { detachUnverifiedMountedImages, reconcileMountedAssets } from '@/lib/presentations/presentationManifest';
import { reviseSlide, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { assertFreeDesignDocument, createFreeDesignDocument, duplicateFreeDesignDocument, updateFreeDesignCanvas,
  type FreeDesignDocument, type FreeDesignKind, type FreeDesignWorkspace } from '@/lib/desaing/freeDesignDocument';
import { openFreeDesignStore, type FreeDesignRecord } from '@/lib/desaing/freeDesignStore';
import type { ContinuityStatus, ContinuityStore } from '@/lib/desaing/continuityStore';
import { downloadContinuityBackup } from '@/lib/presentations/designConversationRemote';
import { prepareReviewedPresentation, saveReviewedPresentation } from '@/lib/presentations/reviewedPresentationProject';
import { presentationProjectPort } from '@/lib/presentations/presentationProjectPort';
import type { RegisteredAssetVersion } from '../../supabase/functions/_shared/desaing/assets';
import './FreeDesignPage.css';

type Panel = { kind: 'design' | 'piece' | 'html' | 'direct_html' | 'mount' | 'visual' | 'code' | 'deck' | 'materials' | 'brand'; document: FreeDesignDocument; asset?: RegisteredAssetVersion; copy?: string; copyMode?: 'approved_text' | 'no_text' };
type Life = { active: boolean; actor: string; store: (Awaited<ReturnType<typeof openFreeDesignStore>> & Partial<Pick<ContinuityStore<FreeDesignWorkspace>, 'status' | 'backups'>>) | null; record: FreeDesignRecord | null; work: Promise<unknown>; blocked: boolean };
const kinds: Record<FreeDesignKind, string> = { cover: 'Portada', page: 'Página', special: 'Diseño especial' };
const errorMessage = (error: unknown) => ({
  free_revision_conflict: 'Otra pestaña modificó tus diseños. Recarga para recuperar esa versión.',
  conversation_revision_conflict: 'Otra sesión modificó tus diseños. Sincroniza para cargar su revisión. Tu copia local se conserva.',
  conversation_sync_unavailable: 'No se pudo confirmar el guardado remoto. Tu copia local se conserva; sincroniza antes de continuar.',
  conversation_forbidden: 'Tu sesión no tiene acceso a este trabajo. Revisa la cuenta y el negocio.',
  free_document_scope_mismatch: 'El documento pertenece a otro negocio o usuario.',
  slide_revision_conflict: 'El lienzo cambió. El resultado de diseño se conserva; vuelve a abrirlo desde la versión actual.',
  free_canvas_size_changed: 'El HTML debe conservar las dimensiones de este lienzo.',
  server_session_changed: 'Cambió tu sesión. Recarga antes de continuar.',
  free_store_unavailable: 'No se pudo abrir el guardado de este dispositivo.',
}[error instanceof Error ? error.message : ''] ?? 'No se pudo guardar el cambio. Tu versión anterior se conserva; revisa el documento antes de continuar.');

export default function FreeDesignPage() {
  const { activeBusinessId } = useActiveBusiness(), service = usePresentationDesignService(), navigate = useNavigate();
  if (!service || !activeBusinessId) return <div className="fd-page"><button onClick={() => navigate('/')}>Volver</button>
    <h1>Diseño libre</h1><p>{!activeBusinessId ? 'Selecciona un negocio para abrir tus diseños.' : 'Diseño libre todavía no está habilitado en este entorno.'}</p></div>;
  return <FreeDesignWorkspacePage key={activeBusinessId} businessId={activeBusinessId} service={service} />;
}
export function FreeDesignWorkspacePage({ businessId, service }: { businessId: string; service: PresentationDesignService }) {
  const navigate = useNavigate(), lifeRef = useRef<Life | null>(null), location = useLocation();
  const openRequest = useRef<OpenInEditorState | null>((location.state as OpenInEditorState | null)?.openEditor === 'visual' ? location.state as OpenInEditorState : null);
  const [record, setRecord] = useState<FreeDesignRecord | null>(null), [writing, setBusy] = useState(false), [error, setError] = useState('');
  const [importing, setImporting] = useState(false), [exporting, setExporting] = useState(false);
  const [syncStatus, setSyncStatus] = useState<ContinuityStatus>('loading'), [localCopies, setLocalCopies] = useState(false);
  const busy = writing || importing || !!service.continuity && syncStatus !== 'synced';
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const [panel, setPanel] = useState<Panel | null>(null), [creating, setCreating] = useState(false);
  const panelRef = useRef(panel); panelRef.current = panel;
  const createdPresentation = useRef<string | null>(null);
  const [newName, setNewName] = useState('Mi portada'), [newKind, setNewKind] = useState<FreeDesignKind>('cover');
  const [format, setFormat] = useState<'horizontal' | 'vertical' | 'square'>('horizontal');
  const [brief, setBrief] = useState(''), [copy, setCopy] = useState('');
  const document = record?.value.documents.find(item => item.id === record.value.selected_id);
  const active = (life: Life) => life.active && lifeRef.current === life;
  useEffect(() => {
    const life: Life = { active: true, actor: '', store: null, record: null, work: Promise.resolve(), blocked: false }; lifeRef.current = life;
    setBusy(true); setImporting(false); setError(''); setSyncStatus('loading'); setLocalCopies(false);
    const work = (async () => {
      life.actor = (await service.client.session()).actorId;
      if (!service.continuity) await service.client.read(businessId);
      const scope = { actor_id: life.actor, business_id: businessId };
      const store: NonNullable<Life['store']> = service.continuity ? await service.continuity.openFreeWorkspace(scope, status => { if (active(life)) setSyncStatus(status); })
        : await openFreeDesignStore(scope);
      if (!active(life)) { store.close(); return; } life.store = store; life.record = await store.read();
      if (active(life)) { setRecord(life.record); setCreating(!life.record.value.documents.length); }
      // Crear y editar → "Abrir en el editor": open the existing Editor Visual on the new document once.
      const requested = life.record.value.documents.find(item => item.id === openRequest.current?.documentId);
      if (active(life) && requested) { openRequest.current = null; setPanel({ kind: 'visual', document: structuredClone(requested) }); navigate('.', { replace: true, state: null }); }
      if (store.backups && active(life)) setLocalCopies((await store.backups()).length > 0);
    })().catch(problem => { if (active(life)) setError(errorMessage(problem)); }).finally(() => { if (active(life)) setBusy(false); });
    life.work = work;
    return () => { life.active = false; void life.work.finally(() => life.store?.close()); };
  }, [businessId, service.client, sessionEpoch]);
  useEffect(() => {
    const check = async () => {
      const life = lifeRef.current; if (!life || !active(life) || !life.actor) return;
      try { if ((await service.client.session()).actorId === life.actor) return; } catch { /* The previous account's canvas must disappear. */ }
      if (!active(life)) return;
      life.blocked = true; life.active = false; setRecord(null); setPanel(null); setBrief(''); setCopy(''); setSessionEpoch(value => value + 1);
    };
    window.addEventListener('focus', check); window.addEventListener('storage', check); window.document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('storage', check); window.document.removeEventListener('visibilitychange', check); };
  }, [service.client]);
  useEffect(() => { setBrief(document?.brief ?? ''); setCopy(document?.approved_copy ?? ''); }, [document?.id]);
  function change(update: (value: FreeDesignWorkspace, actor: string) => FreeDesignWorkspace) {
    const life = lifeRef.current;
    if (!life || !active(life) || life.blocked) return Promise.reject(new Error('free_revision_conflict'));
    setBusy(true); setError('');
    const work = life.work.then(async () => {
      if (!active(life) || !life.store || !life.record) throw new Error('free_store_unavailable');
      if (life.store.status && life.store.status() !== 'synced') throw new Error('conversation_sync_unavailable');
      if ((await service.client.session()).actorId !== life.actor) {
        life.blocked = true; setRecord(null); setPanel(null); setBrief(''); setCopy(''); setSessionEpoch(value => value + 1); throw new Error('server_session_changed');
      }
      if (!active(life)) throw new Error('free_view_closed');
      const next = await life.store.write(life.record.revision, update(structuredClone(life.record.value), life.actor));
      life.record = next;
      if (!active(life)) throw new Error('free_view_closed');
      setRecord(next); return next;
    });
    life.work = work.catch(problem => { if (active(life)) { if (problem instanceof Error && problem.message === 'free_revision_conflict') life.blocked = true; setError(errorMessage(problem)); } })
      .finally(() => { if (active(life)) setBusy(false); });
    return work;
  }
  function updateBrief(value: FreeDesignWorkspace) {
    if (!document) return value;
    return { ...value, documents: value.documents.map(item => item.id === document.id ? { ...item, brief, approved_copy: copy } : item) };
  }
  async function open(kind: Panel['kind']) {
    if (!document || busy) return;
    try { const next = await change(updateBrief); const saved = next.value.documents.find(item => item.id === document.id)!;
      setPanel({ kind, document: structuredClone(saved) }); } catch { /* Page keeps the error and old canvas. */ }
  }
  function apply(next: PresentationSlide, target: FreeDesignDocument) {
    return change(value => ({ ...value, documents: value.documents.map(item => item.id === target.id
      ? updateFreeDesignCanvas(item, next, target.canvas.revision) : item) }));
  }
  async function saveEditor(html: string, close: boolean) {
    if (!panel) return;
    if (busy) {
      setError(syncStatus === 'conflict' ? 'Otra sesión guardó cambios. No se guardó: descarga tu copia local y sincroniza.'
        : service.continuity && syncStatus !== 'synced' ? 'Todavía no se confirma la conexión con Supabase. Espera unos segundos y vuelve a guardar.'
          : 'Hay un guardado en curso. Espera a que termine y vuelve a guardar.');
      return;
    }
    if (lifeRef.current?.blocked) { setError('Otra sesión guardó cambios. Cierra el editor y pulsa «Sincronizar»; tus cambios de aquí no se guardaron.'); return; }
    const target = panel.document, clean = sanitizePresentationHtml(html);
    const safe = panel.kind === 'code' ? detachUnverifiedMountedImages(target.canvas.html, clean) : clean;
    const mounted = reconcileMountedAssets(target.canvas, safe);
    const next = reviseSlide([target.canvas], { slide_id: target.canvas.id, expected_revision: target.canvas.revision,
      html: safe, mounted_assets: mounted })[0];
    try { const saved = await apply(next, target); if (panelRef.current !== panel) return;
      if (close) setPanel(null); else setPanel({ ...panel, document: saved.value.documents.find(item => item.id === target.id)! }); } catch { /* Keep editor open. */ }
  }
  function download(text: string | Blob, type: string, name: string) {
    const url = URL.createObjectURL(typeof text === 'string' ? new Blob([text], { type }) : text); const link = window.document.createElement('a');
    link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  /** Browser-side PNG at the exact canvas size; no render server. */
  async function exportPng() {
    if (!document || exporting) return;
    setExporting(true); setError('');
    try {
      const saved = (await change(updateBrief)).value.documents.find(item => item.id === document.id)!;
      const png = await rasterizeHtml(sanitizePresentationHtml(saved.canvas.html), saved.width, saved.height);
      download(png, 'image/png', `${saved.name.replace(/[^\p{L}\p{N}_. -]/gu, '').slice(0, 80) || 'diseno'}.png`);
    } catch { setError('No se pudo generar el PNG en este navegador. Descarga el HTML como respaldo.'); }
    finally { setExporting(false); }
  }
  async function exportDocument(json: boolean) {
    if (!document) return;
    try { const saved = (await change(updateBrief)).value.documents.find(item => item.id === document.id)!;
      download(json ? JSON.stringify(saved, null, 2) : sanitizePresentationHtml(saved.canvas.html), json ? 'application/json' : 'text/html',
        `${saved.name.replace(/[^\p{L}\p{N}_. -]/gu, '').slice(0, 80) || 'diseno'}.${json ? 'json' : 'html'}`); } catch { /* Keep error visible. */ }
  }
  if (panel?.kind === 'visual') return <><VisualDesignEditor html={panel.document.canvas.html} pieceIndex={0}
    dimensions={{ width: panel.document.width, height: panel.document.height }} editableElements={[]} businessId={businessId}
    onSave={html => void saveEditor(html, true)} onApply={html => void saveEditor(html, false)} onCancel={() => setPanel(null)} />
    {error && <p role="alert" className="fd-editor-error">{error}</p>}</>;
  if (panel?.kind === 'code') return <><HtmlSectionEditor html={panel.document.canvas.html} pieceIndex={0}
    onSave={html => void saveEditor(html, true)} onCancel={() => setPanel(null)} />{error && <p role="alert" className="fd-editor-error">{error}</p>}</>;
  const destination = panel ? { document_type: panel.document.kind, page_id: panel.document.canvas.id, brand_id: 'free-design' } : undefined;
  return <main className="fd-page" aria-busy={busy}>
    <header className="fd-header"><div><button className="fd-link" disabled={busy} onClick={() => {
      if (!document) navigate('/'); else void change(updateBrief).then(() => navigate('/')).catch(() => {});
    }}><ArrowLeft size={16} />Inicio</button><h1><Palette />Diseño libre</h1><p>Portadas, páginas y diseños especiales con piezas reutilizables y HTML editable.</p></div>
      <button className="fd-button fd-primary" disabled={busy || !record} onClick={() => setCreating(true)}><Plus size={16} />Nuevo diseño</button></header>
    {error && <p className="fd-error" role="alert">{error}</p>}
    {service.continuity && <div className="fd-note" aria-live="polite"><p>{syncStatus === 'synced' ? 'Diseños guardados en Supabase para continuar en otro dispositivo.'
      : syncStatus === 'conflict' ? 'Otra sesión guardó cambios. Tu copia local se conserva.'
      : syncStatus === 'offline' ? 'Guardado remoto sin confirmar. Puedes consultar la copia local.' : 'Cargando los diseños guardados…'}</p>
      {localCopies && <p>Hay copias locales conservadas de guardados interrumpidos o en conflicto.</p>}
      <button className="fd-button" disabled={writing || importing || !!panel} onClick={() => {
        void (async () => {
          if (syncStatus === 'synced' && document && (brief !== document.brief || copy !== document.approved_copy)) {
            try { await change(updateBrief); } catch { /* Failed CAS is preserved before loading the winner. */ }
          }
          setSessionEpoch(value => value + 1);
        })();
      }}>Sincronizar</button>
      <button className="fd-button" disabled={writing || importing} onClick={() => {
        const life = lifeRef.current; if (!life?.store) return;
        void (async () => {
          if ((await service.client.session()).actorId !== life.actor) throw Error('server_session_changed');
          const local = await openFreeDesignStore({ actor_id: life.actor, business_id: businessId });
          try { await downloadContinuityBackup({ current: life.record, attempts: await life.store?.backups?.() ?? [], legacy: await local.read() }, 'disenos-copia-local.json'); }
          finally { local.close(); }
        })().catch(problem => { if (active(life)) setError(errorMessage(problem)); });
      }}>Descargar copia local</button></div>}
    <div className="fd-layout"><aside className="fd-sidebar"><h2>Mis diseños</h2><p className="fd-note">{service.continuity ? 'Tus diseños y conversaciones se recuperan con la misma cuenta y negocio.' : 'Guardados en este dispositivo. Exporta un respaldo para llevarlos a otro navegador.'}</p>
      {record?.value.documents.map(item => <button className={`fd-document ${item.id === document?.id ? 'fd-selected' : ''}`} key={item.id} disabled={busy}
        onClick={() => void change(value => ({ ...updateBrief(value), selected_id: item.id })).catch(() => {})}>
        <strong>{item.name}</strong><span>{kinds[item.kind]} · {item.width} × {item.height}</span></button>)}
      <label className="fd-button fd-import">Importar respaldo<input aria-label="Importar diseño libre" type="file" accept="application/json,.json" disabled={busy || !record}
        onChange={event => { const file = event.target.files?.[0]; if (!file || busy) return;
          const life = lifeRef.current; setImporting(true);
          void (async () => {
            if (file.size > 18 * 1024 * 1024) throw new Error('invalid_free_document');
            await change(updateBrief);
            const incoming = JSON.parse(await file.text()) as FreeDesignDocument;
            if (!life || !active(life)) return;
            await change((value, actor) => {
              assertFreeDesignDocument(incoming, { actor_id: incoming.actor_id, business_id: businessId });
              const imported = duplicateFreeDesignDocument({ ...incoming, actor_id: actor });
              imported.canvas.html = sanitizePresentationHtml(imported.canvas.html);
              imported.canvas.mounted_assets = reconcileMountedAssets(imported.canvas, imported.canvas.html);
              return { documents: [...value.documents, imported], selected_id: imported.id };
            });
          })().catch(problem => { if (life && active(life)) setError(errorMessage(problem)); }).finally(() => { if (life && active(life)) setImporting(false); }); event.target.value = ''; }} /></label>
    </aside><section className="fd-content">
      {creating && <form className="fd-create" onSubmit={event => { event.preventDefault();
        void change((value, actor) => { const created = createFreeDesignDocument({ actor_id: actor, business_id: businessId }, { name: newName, kind: newKind, format });
          return { documents: [...updateBrief(value).documents, created], selected_id: created.id }; }).then(() => setCreating(false)).catch(() => {});
      }}><h2>Crear un lienzo</h2><div className="fd-fields"><label>Nombre<input aria-label="Nombre del diseño" value={newName} maxLength={160} onChange={event => setNewName(event.target.value)} /></label>
        <label>Tipo<select aria-label="Tipo de diseño" value={newKind} onChange={event => setNewKind(event.target.value as FreeDesignKind)}>{Object.entries(kinds).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select></label>
        <label>Formato<select aria-label="Formato del lienzo" value={format} onChange={event => setFormat(event.target.value as typeof format)}><option value="horizontal">Horizontal</option><option value="vertical">Vertical</option><option value="square">Cuadrado</option></select></label></div>
        <button className="fd-button fd-primary" disabled={busy || !record || !newName.trim()}>Crear lienzo</button>{document && <button className="fd-button" type="button" onClick={() => setCreating(false)}>Cancelar</button>}</form>}
      {document ? <><div className="fd-title"><div><p className="fd-kicker">{kinds[document.kind]} · Versión {document.canvas.revision}</p><h2>{document.name}</h2></div>
        <button className="fd-button" disabled={busy} onClick={() => void change(value => { const source = updateBrief(value).documents.find(item => item.id === document.id)!;
          const duplicate = duplicateFreeDesignDocument(source); return { documents: [...updateBrief(value).documents, duplicate], selected_id: duplicate.id }; }).catch(() => {})}><Copy size={15} />Duplicar</button></div>
        <div className="fd-canvas"><PresentationCanvas html={document.canvas.html} title={`Lienzo: ${document.name}`} /></div>
        <div className="fd-toolbar"><button className="fd-button fd-primary" disabled={busy} onClick={() => void open('design')}>Diseñar con IA</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('direct_html')}>Diseñar HTML con IA</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('html')}>Hacer editable una imagen</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('piece')}>Crear pieza</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('mount')}>Añadir imágenes montadas</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('brand')}>Capa de marca</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('visual')}>Editor Visual</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('code')}>Editar HTML</button></div>
        <section className="fd-brief"><h3>Contenido e idea</h3><label>Qué quieres diseñar<textarea aria-label="Idea del diseño" rows={3} maxLength={8000} value={brief} disabled={busy} onChange={event => setBrief(event.target.value)} /></label>
          {service.client.materials && <button className="fd-button" disabled={busy} onClick={() => void open('materials')}>Materiales de referencia</button>}
          <label>Texto que debe conservarse<textarea aria-label="Texto del diseño libre" rows={4} maxLength={4000} value={copy} disabled={busy} onChange={event => setCopy(event.target.value)} /></label>
          <div className="fd-toolbar"><button className="fd-button" disabled={busy || (brief === document.brief && copy === document.approved_copy)} onClick={() => void change(updateBrief).catch(() => {})}>Guardar indicaciones</button>
            <span className="fd-note">{brief === document.brief && copy === document.approved_copy ? 'Indicaciones guardadas.' : 'Indicaciones pendientes de guardar.'}</span></div></section>
        <div className="fd-toolbar"><button className="fd-button fd-primary" disabled={busy || exporting} onClick={() => void exportPng()}><Download size={16} />{exporting ? 'Preparando PNG…' : `Descargar PNG ${document.width}×${document.height}`}</button>
          <button className="fd-button" disabled={busy} onClick={() => void exportDocument(false)}><Download size={16} />Descargar HTML</button>
          <button className="fd-button" disabled={busy} onClick={() => void exportDocument(true)}>Exportar respaldo</button>
          <button className="fd-button" disabled={busy} onClick={() => void open('deck')}>Crear presentación con este diseño</button>
          <button className="fd-link" disabled={busy} onClick={() => void change(updateBrief).then(() => navigate('/presentations')).catch(() => {})}>Ir a Presentaciones</button></div>
      </> : !creating && <p>Abre un diseño guardado o crea tu primer lienzo.</p>}
    </section></div>
    {panel?.kind === 'materials' && <MaterialsPanel client={service.client} businessId={businessId} onClose={() => setPanel(null)}
      onUse={async selection => {
        const nextBrief = appendReviewedMaterialsBrief(panel.document.brief, selection.text);
        await change(value => ({ ...value, documents: value.documents.map(item => item.id === panel.document.id ? { ...item, brief: nextBrief } : item) }));
        if (panelRef.current === panel) { setBrief(nextBrief); setPanel(null); }
      }} />}
    {panel && ['design', 'direct_html'].includes(panel.kind) && <UnifiedDesignWorkspace key={`conversation:${panel.document.id}`} service={service}
      businessId={businessId} documentId={panel.document.id} slide={panel.document.canvas} destination={destination}
      initialView={panel.kind === 'direct_html' ? 'html' : 'image'} initialInstruction={panel.document.brief} initialCopy={panel.document.approved_copy}
      onClose={() => setPanel(null)} onApply={async next => { await apply(next, panel.document); }} />}
    {panel?.kind === 'piece' && <ServerDesignPanel key={`${panel.document.id}:${panel.kind}`} service={service} businessId={businessId}
      documentId={panel.document.id} slide={panel.document.canvas} destination={destination} initialScope="asset_in_region"
      initialCopy={panel.document.approved_copy} initialInstruction={panel.document.brief}
      onClose={() => setPanel(null)} onApply={async next => { await apply(next, panel.document); }}
      onUseDesignForHtml={(asset, approvedCopy, copyMode) => setPanel({ ...panel, kind: 'html', asset, copy: approvedCopy, copyMode })} />}
    {panel?.kind === 'html' && <DesignToHtmlPanel service={service} businessId={businessId} documentId={panel.document.id} slide={panel.document.canvas}
      destination={destination} initialAsset={panel.asset} initialCopy={panel.copy ?? panel.document.approved_copy} initialCopyMode={panel.copyMode}
      onApply={async next => { await apply(next, panel.document); }} onClose={() => setPanel(null)} />}
    {panel?.kind === 'brand' && <FreeBrandLayerPanel document={panel.document} onClose={() => setPanel(null)} onApply={async html => {
      const target = panel.document, next = reviseSlide([target.canvas], { slide_id: target.canvas.id, expected_revision: target.canvas.revision,
        html, mounted_assets: reconcileMountedAssets(target.canvas, html) })[0];
      const saved = await apply(next, target), updated = saved.value.documents.find(item => item.id === target.id)!;
      // Place and adjust the brand elements in the existing Editor Visual.
      if (panelRef.current === panel) setPanel({ kind: 'visual', document: structuredClone(updated) });
    }} />}
    {panel?.kind === 'mount' && <MountedImagesPanel businessId={businessId} client={service.client} documentId={panel.document.id} slide={panel.document.canvas}
      onApply={async next => { await apply(next, panel.document); }} onClose={() => setPanel(null)} />}
    {panel?.kind === 'deck' && <DeckComposerPanel businessId={businessId} documentId={panel.document.id} source={panel.document.canvas}
      client={service.client} onClose={() => { setPanel(null); if (createdPresentation.current) { createdPresentation.current = null; navigate('/presentations'); } }} onApply={async (slides, name, draftId) => {
        const life = lifeRef.current; if (!life || !active(life)) throw new Error('server_session_changed');
        const deck = prepareReviewedPresentation(slides, businessId);
        await saveReviewedPresentation(presentationProjectPort, { id: draftId, business_id: businessId, name, slides: deck }, async () => {
          if (!active(life) || (await service.client.session()).actorId !== life.actor) throw new Error('server_session_changed');
        });
        if (!active(life)) return;
        try { localStorage.setItem(`xending-active-presentation-${businessId}`, draftId); } catch { /* Created project is also discoverable in the project menu. */ }
        createdPresentation.current = draftId;
      }} />}
  </main>;
}
