import { useEffect, useMemo, useRef, useState } from 'react';
import { X, Layers, RefreshCw } from 'lucide-react';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import { getAssetReviewStatus } from '../../../supabase/functions/_shared/desaing/assets';
import { htmlCompositionSessionId, makeApprovedCompositionCopy, verifyHtmlCompositionRequest, type HtmlCompositionRequest } from '../../../supabase/functions/_shared/desaing/composition';
import type { PresentationDesignService } from './PresentationDesignContext';
import { designSurfaceTarget, designSurfaceWorkspace, designSurfaceBrand, type DesignSurfaceDestination } from '../../../supabase/functions/_shared/desaing/designSurface';
import { getSlideDimensions, reviseSlide, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { prepareServerCapture } from '@/lib/presentations/presentationServerDesign';
import { imageDataUrl } from '@/lib/desaing/labImages';
import { DesignServerClientError } from '@/lib/desaing/serverClient';
import type { HtmlCapabilities } from '@/lib/desaing/htmlClient';
import { openCompositionStore, emptyCompositionDraft, type CompositionDraft, type CompositionRecord, type CompositionSource, type SavedCompositionBinding } from '@/lib/presentations/compositionStore';
import { renderHtmlComposition, type CompositionBindings } from '@/lib/presentations/presentationComposition';
import { extractPresentationAsset, importPresentationAsset, listPresentationAssets, readPresentationAsset, type PresentationLibraryAsset } from '@/lib/presentations/presentationAssets';
import { ManualExtractionEditor } from './ManualExtractionEditor';
import './MountedImagesPanel.css';
import './DesignToHtmlPanel.css';

interface Props {
  service: PresentationDesignService; businessId: string; documentId: string; slide: PresentationSlide;
  initialAsset?: RegisteredAssetVersion; initialCopy?: string;
  destination?: DesignSurfaceDestination;
  onApply(slide: PresentationSlide): void; onClose(): void;
}
type Life = { active: boolean; store: Awaited<ReturnType<typeof openCompositionStore>> | null; record: CompositionRecord | null; work: Promise<unknown>; locked: boolean; actor: string; blocked: boolean };
const code = (problem: unknown) => problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : problem instanceof Error ? problem.message : '';
const messages: Record<string, string> = {
  composition_revision_conflict: 'Otra pestaña cambió esta composición. Cierra y vuelve a abrir para recuperar sus cambios.',
  composition_reference_changed: 'Hay una conversión guardada con otra referencia. Recupera ese trabajo antes de cambiarla.',
  server_session_changed: 'Cambió tu sesión. Abre este panel nuevamente.',
  server_html_outcome_unknown: 'La conversión está pendiente de confirmar. Recupera su resultado; no se enviará otra solicitud.',
  server_response_unknown: 'No se confirmó la respuesta. Recupera la composición guardada antes de volver a generar.',
  html_quota_exceeded: 'No queda presupuesto para otra conversión. Puedes revisar y montar las composiciones guardadas.',
  html_previous_unresolved: 'Hay una solicitud pendiente de confirmar. Recupera su resultado antes de continuar.',
  slide_revision_conflict: 'Cambió la diapositiva. El resultado queda guardado para que puedas revisarlo.',
  html_source_not_approved: 'Revisa y aprueba esta versión del diseño antes de convertirla.',
  composition_copy_count: 'Usa entre una y doce líneas de contenido aprobado.',
  composition_piece_not_approved: 'Una de las piezas dejó de estar aprobada. Elige otra antes de aplicar.',
};
const initialText = (html: string) => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return Array.from(doc.querySelectorAll('h1,h2,h3,p,li')).map(node => node.textContent?.trim()).filter(Boolean).slice(0, 12).join('\n');
};
export function DesignToHtmlPanel({ service, businessId, documentId, slide, initialAsset, initialCopy, onApply, onClose, destination }: Props) {
  const client = service.client, api = useMemo(() => client.html?.(businessId), [client, businessId]);
  const canvas = useMemo(() => getSlideDimensions(slide.html), [slide.html]);
  const target = useMemo(() => designSurfaceTarget(documentId, slide, destination), [documentId, slide.id, slide.revision, destination?.document_type, destination?.page_id]);
  const sessionId = htmlCompositionSessionId(target);
  const [draft, setDraft] = useState<CompositionDraft>(emptyCompositionDraft), [copyText, setCopyText] = useState(initialCopy ?? initialText(slide.html));
  const [approved, setApproved] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [capabilities, setCapabilities] = useState<HtmlCapabilities | null>(null), [sourceUrl, setSourceUrl] = useState('');
  const [library, setLibrary] = useState<PresentationLibraryAsset[]>([]), [serverAssets, setServerAssets] = useState<RegisteredAssetVersion[]>([]);
  const [bindings, setBindings] = useState<CompositionBindings>({}), [cropping, setCropping] = useState<string | null>(null);
  const lifeRef = useRef<Life | null>(null), frame = useRef<HTMLIFrameElement>(null);
  const sourceLocal = useRef<PresentationLibraryAsset | null>(null);
  const active = (life: Life) => life.active && lifeRef.current === life;
  function ensure(life: Life) { if (!active(life)) throw new Error('composition_view_closed'); if (life.blocked) throw new Error('composition_revision_conflict'); }
  function save(life: Life, change: (value: CompositionDraft) => CompositionDraft) {
    const task = life.work.then(async () => {
      ensure(life); if (!life.store) throw new Error('composition_store_unavailable');
      const value = change(structuredClone(life.record?.value ?? emptyCompositionDraft()));
      try { const next = await life.store.write(life.record?.revision ?? 0, value); life.record = next;
        if (active(life)) setDraft(next.value); return next.value;
      } catch (problem) { if (code(problem) === 'composition_revision_conflict') life.blocked = true; throw problem; }
    });
    life.work = task.catch(() => {}); return task;
  }
  async function run(action: (life: Life) => Promise<void>) {
    const life = lifeRef.current; if (!life || !active(life) || life.locked) return;
    life.locked = true; setBusy(true); setError('');
    try { await life.work; ensure(life); await action(life); }
    catch (problem) { if (active(life)) setError(destination && code(problem) === 'slide_revision_conflict'
      ? 'Cambió el lienzo. El resultado queda guardado para que puedas revisarlo.' : messages[code(problem)] ?? 'No se pudo completar la acción. La referencia y la composición guardadas se conservan.'); }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  const close = () => {
    const life = lifeRef.current;
    if (!life || !active(life) || life.blocked || !life.record) { onClose(); return; }
    void run(async current => {
      if (!current.record!.value.request && current.record!.value.copy_text !== copyText) await save(current, value => ({ ...value, copy_text: copyText }));
      ensure(current); onClose();
    });
  };
  const sameAsset = (a: RegisteredAssetVersion['identity'] | undefined, b: RegisteredAssetVersion['identity']) =>
    a?.business_id === b.business_id && a.asset_id === b.asset_id && a.version_id === b.version_id;
  useEffect(() => {
    const life: Life = { active: true, store: null, record: null, work: Promise.resolve(), locked: true, actor: '', blocked: false };
    lifeRef.current = life; setReady(false); setBusy(true); sourceLocal.current = null;
    const task = (async () => {
      if (!api) throw new Error('html_unavailable');
      life.actor = (await client.session()).actorId;
      const store = await openCompositionStore({ actor: life.actor, business: businessId, session: sessionId });
      if (!active(life)) { store.close(); return; } life.store = store;
      life.record = await store.read(); ensure(life);
      if (!life.record) {
        let source: CompositionSource | null = null;
        if (initialAsset) { const blob = await client.asset(initialAsset.identity); ensure(life);
          source = { blob, version: initialAsset, name: 'Diseño aprobado.png', upload_id: crypto.randomUUID() }; }
        const value = { ...emptyCompositionDraft(), copy_text: initialCopy ?? initialText(slide.html), source };
        life.record = await store.write(0, value);
      } else if (initialAsset && !sameAsset(life.record.value.source?.version?.identity, initialAsset.identity)) {
        if (['saved', 'submitting', 'uncertain'].includes(life.record.value.status)) throw new Error('composition_reference_changed');
        const blob = await client.asset(initialAsset.identity); ensure(life);
        life.record = await store.write(life.record.revision, { ...emptyCompositionDraft(), copy_text: initialCopy ?? initialText(slide.html),
          source: { blob, version: initialAsset, name: 'Diseño aprobado.png', upload_id: crypto.randomUUID() } });
      }
      ensure(life); setDraft(life.record.value); setCopyText(life.record.value.copy_text); setApproved(!!life.record.value.request);
      const [caps, local, remote] = await Promise.all([api.capabilities(), listPresentationAssets(businessId), client.read(businessId)]);
      ensure(life); setCapabilities(caps); setLibrary(local); setServerAssets(remote.state.assets.versions.filter(asset =>
        asset.provenance.kind === 'image_operation' && getAssetReviewStatus(remote.state.assets, asset.identity) === 'approved'));
      setReady(true);
    })().catch(problem => { if (active(life)) setError(messages[code(problem)] ?? 'No se pudo abrir esta composición. Cierra y vuelve a abrir para recuperar tu trabajo.'); })
      .finally(() => { life.locked = false; if (active(life)) setBusy(false); });
    life.work = task;
    return () => { life.active = false; void life.work.finally(() => life.store?.close()); };
  }, [api, businessId, documentId, slide.id, sessionId, destination?.brand_id]);
  useEffect(() => {
    if (!ready || busy || draft.request || draft.copy_text === copyText) return;
    const life = lifeRef.current!;
    const timer = setTimeout(() => { void save(life, value => value.request ? value : { ...value, copy_text: copyText })
      .catch(problem => { if (active(life)) setError(messages[code(problem)] ?? 'No se pudo guardar el texto.'); }); }, 250);
    return () => clearTimeout(timer);
  }, [copyText, ready, busy, draft.request, draft.copy_text]);
  useEffect(() => {
    let current = true; setSourceUrl(''); sourceLocal.current = null;
    if (draft.source) void imageDataUrl(draft.source.blob).then(url => { if (current) setSourceUrl(url); });
    return () => { current = false; };
  }, [draft.source?.upload_id]);
  useEffect(() => {
    const life = lifeRef.current; if (!life || !draft.result) { setBindings({}); return; }
    let current = true; setBindings({});
    void (async () => {
      const resolved: CompositionBindings = {};
      for (const [slot, binding] of Object.entries(draft.bindings)) {
        if ('omitted' in binding) resolved[slot] = { omitted: true };
        else {
          const local = binding.origin === 'local' ? library.find(item => item.version.identity.asset_id === binding.asset.asset_id && item.version.identity.version_id === binding.asset.version_id) : null;
          const blob = binding.origin === 'local' ? local ? await readPresentationAsset(businessId, local.version) : null : await client.asset(binding.asset);
          if (!blob) throw new Error('asset_not_found');
          resolved[slot] = { asset: binding.asset, dataUrl: await imageDataUrl(blob), altText: binding.altText };
        }
      }
      if (current && active(life)) setBindings(resolved);
    })().catch(() => { if (current && active(life)) setError('Una pieza no está disponible. Vuelve a elegirla antes de aplicar el HTML.'); });
    return () => { current = false; };
  }, [draft.result, draft.bindings, library, businessId, client]);
  const rendered = useMemo(() => {
    if (!draft.request || !draft.result) return null;
    try { return renderHtmlComposition(draft.request, draft.result, bindings, { allowUnresolved: true }); } catch { return null; }
  }, [draft.request, draft.result, bindings]);
  useEffect(() => {
    const element = frame.current?.parentElement; if (!element) return;
    const resize = () => { if (frame.current) frame.current.style.transform = `scale(${element.clientWidth / canvas.width})`; };
    resize(); const observer = new ResizeObserver(resize); observer.observe(element); return () => observer.disconnect();
  }, [!!rendered, canvas.width]);
  async function generate(life: Life) {
    if (!api || !capabilities || capabilities.remaining_attempts < 1 || !approved) throw new Error('html_unavailable');
    let value = life.record!.value;
    if (!value.source) throw new Error('composition_source_required');
    if (['submitting', 'uncertain', 'completed'].includes(value.status)) return;
    if (!value.request) {
      const lines = copyText.split(/\r?\n/).filter(text => text.trim());
      if (lines.length < 1 || lines.length > 12) throw new Error('composition_copy_count');
      const copy = await makeApprovedCompositionCopy(lines
        .map((text, index) => ({ id: `copy_${index + 1}`, role: index === 0 ? 'title' as const : 'body' as const, text })));
      ensure(life);
      if (!value.source.version) {
        const version = await api.upload({ businessId, uploadId: value.source.upload_id, brandId: designSurfaceBrand(destination), projectId: documentId }, value.source.blob);
        ensure(life); value = await save(life, current => ({ ...current, source: { ...current.source!, version } }));
      }
      const reference = value.source!.version!;
      const request: HtmlCompositionRequest = { request_key: crypto.randomUUID(), canvas, copy, design_reference: reference.identity,
        context: { actor_id: life.actor, business_id: businessId, brand_id: designSurfaceBrand(destination), project_id: documentId,
          session_id: sessionId, workspace: designSurfaceWorkspace(destination), interaction_mode: 'execute_change', target, copy_version_id: copy.version_id,
          instruction: 'Convertir este diseño aprobado en una composición editable. Conservar literalmente el contenido aprobado; separar texto, formas y piezas.',
          immutable_elements: ['No sustituir los textos aprobados por texto leído de la imagen.'],
          references: [{ ...reference.identity, reference_id: 'approved-design', mime_type: 'image/png', roles: ['layout_reference'] }] } };
      await save(life, current => ({ ...current, copy_text: copyText, request, status: 'saved' }));
    }
    value = await save(life, current => ({ ...current, status: 'submitting' }));
    try {
      const result = await api.plan(value.request!); ensure(life);
      await save(life, current => ({ ...current, result, status: 'completed' }));
    } catch (problem) {
      if (active(life)) {
        const refused = problem instanceof DesignServerClientError && ['html_quota_exceeded', 'html_previous_unresolved', 'server_html_expired', 'server_feature_disabled', 'business_access_denied', 'business_write_denied', 'invalid_html_request', 'html_source_not_approved', 'html_source_invalid', 'html_source_unavailable', 'server_policy_changed', 'html_request_too_large'].includes(problem.code);
        await save(life, current => ({ ...current, status: refused ? 'saved' : 'uncertain' }));
      }
      throw problem;
    } finally { if (active(life)) setCapabilities(await api.capabilities().catch(() => null)); }
  }
  async function recover(life: Life) {
    if (!api) return;
    const value = life.record!.value;
    if (value.request) {
      const result = await api.recover(value.request); ensure(life);
      if (result) await save(life, current => ({ ...current, result, status: 'completed' }));
      else setError('Todavía no hay un resultado confirmado. La solicitud se conserva sin reenviarse.');
    } else {
      const attempts = await api.history(sessionId); ensure(life);
      const last = attempts.at(-1);
      if (last) {
        const blob = await client.asset(last.request.design_reference); ensure(life);
        const remote = await client.read(businessId); ensure(life);
        const version = remote.state.assets.versions.find(asset => asset.identity.asset_id === last.request.design_reference.asset_id && asset.identity.version_id === last.request.design_reference.version_id);
        if (!version) throw new Error('asset_not_found');
        const text = last.request.copy.blocks.map(block => block.text).join('\n');
        await save(life, () => ({ ...emptyCompositionDraft(), copy_text: text, request: last.request, result: last.result ?? null,
          status: last.status === 'completed' ? 'completed' : 'uncertain', source: { blob, version, name: 'Diseño recuperado.png', upload_id: crypto.randomUUID() } })); setCopyText(text);
      }
    }
    setCapabilities(await api.capabilities());
  }
  async function bind(life: Life, slot: string, value: SavedCompositionBinding) { await save(life, current => ({ ...current, bindings: { ...current.bindings, [slot]: value } })); }
  const frozen = !!draft.request, canApply = rendered && rendered.unresolvedSlots.length === 0 && Object.keys(bindings).length === Object.keys(draft.bindings).length;
  return <div className="mip-backdrop" onKeyDown={event => { if (event.key === 'Escape' && !busy) close(); }}><div className="mip-dialog hcp-dialog" role="dialog" aria-modal="true" aria-labelledby="hcp-title" aria-busy={busy}>
    <header className="mip-header"><div><h2 id="hcp-title"><Layers size={21} />Usar diseño para HTML</h2><p>Revisa el contenido y separa las piezas para obtener una composición editable.</p></div>
      <button className="mip-icon-button" aria-label="Cerrar diseño para HTML" disabled={busy} onClick={close}><X size={20} /></button></header>
    <div className="mip-body hcp-body"><aside className="mip-library">
      <label className="sdp-field">Diseño elegido<input type="file" aria-label="Diseño para convertir" accept="image/png,image/jpeg,image/webp" disabled={busy || !ready || frozen}
        onChange={event => { const file = event.target.files?.[0]; if (file) void run(async life => { const blob = await prepareServerCapture(file, capabilities?.max_reference_edge ?? 1536); ensure(life);
          await save(life, current => ({ ...current, source: { blob, name: file.name, upload_id: crypto.randomUUID() } })); setApproved(false); }); }} /></label>
      {draft.source && <p className="mip-note">{draft.source.name}</p>}
      <label className="sdp-field">Texto aprobado<textarea aria-label="Contenido aprobado para HTML" value={copyText} rows={8} maxLength={12000} disabled={busy || !ready || frozen}
        onChange={event => { setCopyText(event.target.value); setApproved(false); }} /></label>
      <p className="mip-note">Una línea por bloque, hasta 12. La primera será el título. Revisa las cifras y palabras: este texto se conservará literalmente.</p>
      {!frozen || draft.status === 'saved' ? <><label className="hcp-confirm"><input type="checkbox" checked={approved} disabled={busy || !ready}
        onChange={event => setApproved(event.target.checked)} />He revisado el diseño y apruebo este contenido.</label>
        <button className="mip-button mip-button-primary" disabled={busy || !ready || !approved || !draft.source || !copyText.trim() || !capabilities?.remaining_attempts}
          onClick={() => void run(generate)}>{draft.status === 'saved' ? 'Enviar solicitud guardada' : 'Crear HTML editable'}</button></> : <p className="sdp-status" role="status">{draft.status === 'completed' ? 'Composición lista para revisar' : 'Conversión pendiente de confirmar'}</p>}
      {!capabilities && ready && <p className="mip-note">La conversión está pausada. Puedes recuperar y revisar trabajos guardados.</p>}
      <button className="mip-button" disabled={busy || !ready} onClick={() => void run(recover)}><RefreshCw size={15} />Recuperar composición</button>
      {draft.status === 'completed' && <button className="mip-button" disabled={busy} onClick={() => void run(async life => {
        await save(life, current => ({ ...emptyCompositionDraft(), copy_text: current.copy_text, source: current.source })); setApproved(false); })}>Preparar otra conversión</button>}
      {service.simulation && <p className="mip-note">Prueba local con resultados simulados, sin llamadas de pago.</p>}
      <p className="mip-note">Asignar, extraer o mover las piezas después de convertir no genera nuevas imágenes.</p>
    </aside><section className="mip-workspace">
      <div className="hcp-comparison"><section><h3>Diseño de referencia</h3>{sourceUrl ? <img src={sourceUrl} alt="Diseño elegido como referencia" /> : <p>Añade un diseño ya elegido o usa una propuesta aprobada.</p>}</section>
        <section><h3>Composición editable</h3>{rendered ? <div className="hcp-preview" style={{ aspectRatio: `${canvas.width}/${canvas.height}` }}><iframe ref={frame} title="Composición HTML editable" sandbox="" tabIndex={-1}
          srcDoc={rendered.html} style={{ width: canvas.width, height: canvas.height }} onLoad={event => { event.currentTarget.style.transform = `scale(${event.currentTarget.parentElement!.clientWidth / canvas.width})`; }} /></div> : <p>La composición aparecerá aquí para que puedas compararla antes de aplicarla.</p>}</section></div>
      {draft.result && <div className="hcp-inventory"><span>{draft.result.composition.texts.length} textos editables</span><span>{draft.result.composition.shapes.length} formas</span><span>{draft.result.composition.slots.length} espacios para piezas</span></div>}
      {draft.result?.composition.slots.map(slot => <section className="hcp-slot" key={slot.id} data-testid="composition-slot" data-slot-id={slot.id}>
        <h3>{slot.label}</h3><p className="mip-note">{slot.box.width} × {slot.box.height} px · {bindings[slot.id] ? 'Elección guardada' : 'Elige una pieza, extráela del diseño u omítela explícitamente.'}</p>
        <select aria-label={`Pieza para ${slot.label}`} disabled={busy} value="" onChange={event => {
          const [origin, index] = event.target.value.split(':');
          if (origin === 'local' && library[Number(index)]) void run(life => bind(life, slot.id, { origin: 'local', asset: library[Number(index)].version.identity, altText: slot.label }));
          if (origin === 'server' && serverAssets[Number(index)]) void run(life => bind(life, slot.id, { origin: 'server', asset: serverAssets[Number(index)].identity, altText: slot.label }));
        }}><option value="">Elegir de la biblioteca…</option>{library.map((item, index) => <option key={`local${index}`} value={`local:${index}`}>Pieza local {index + 1} · {item.version.storage.width}×{item.version.storage.height}</option>)}
          {serverAssets.map((item, index) => <option key={`server${index}`} value={`server:${index}`}>Pieza aprobada {index + 1} · {item.storage.width}×{item.storage.height}</option>)}</select>
        <label className="mip-button">Subir pieza<input type="file" aria-label={`Subir pieza para ${slot.label}`} accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; if (file) void run(async life => { const item = await importPresentationAsset(businessId, file); ensure(life);
            setLibrary(await listPresentationAssets(businessId)); await bind(life, slot.id, { origin: 'local', asset: item.version.identity, altText: slot.label }); }); }} /></label>
        <button className="mip-button" disabled={busy || !draft.source} onClick={() => setCropping(cropping === slot.id ? null : slot.id)}>Extraer del diseño</button>
        <button className="mip-button" disabled={busy} onClick={() => void run(life => bind(life, slot.id, { omitted: true }))}>Omitir esta pieza</button>
        {cropping === slot.id && draft.source && <ManualExtractionEditor sourceUrl={sourceUrl} width={draft.source.version?.storage.width ?? 1} height={draft.source.version?.storage.height ?? 1}
          disabled={busy} readSource={async () => draft.source!.blob} onCancel={() => setCropping(null)} onSave={recipe => run(async life => {
            if (!sourceLocal.current) sourceLocal.current = await importPresentationAsset(businessId, new File([draft.source!.blob], 'referencia-composicion.png', { type: 'image/png' }));
            const piece = await extractPresentationAsset(businessId, sourceLocal.current.version, recipe); ensure(life);
            setLibrary(await listPresentationAssets(businessId)); await bind(life, slot.id, { origin: 'local', asset: piece.version.identity, altText: slot.label }); setCropping(null);
          })} />}
      </section>)}
      {draft.result && <p className="mip-note">El editor permite ajustar posiciones y tipografía después de aplicar. Revisa también el espacio ocupado por cada texto.</p>}
    </section></div>
    <footer className="mip-footer"><div>{error ? <p className="mip-error" role="alert">{error}</p> : <p className="mip-note">{busy ? 'Preparando la composición…' : destination ? 'El lienzo se modifica al aplicar el resultado revisado.' : 'El slide se modifica al aplicar el resultado revisado.'}</p>}</div>
      <button className="mip-button mip-button-primary" disabled={busy || !ready || !canApply} onClick={() => void run(async life => {
        const current = life.record!.value;
        if (!current.request || !current.result || current.request.context.target.revision !== String(slide.revision)
          || current.request.context.target.document_type !== target.document_type || current.request.context.target.document_id !== target.document_id
          || current.request.context.target.page_id !== target.page_id || current.request.context.target.slide_id !== target.slide_id
          || current.request.context.brand_id !== designSurfaceBrand(destination) || current.request.context.workspace !== designSurfaceWorkspace(destination)) throw new Error('slide_revision_conflict');
        await verifyHtmlCompositionRequest(current.request);
        const who = await client.session(); ensure(life);
        if (who.actorId !== life.actor) throw new Error('server_session_changed');
        const remote = await client.read(businessId); ensure(life);
        if (current.source?.version?.provenance.kind === 'image_operation'
          && getAssetReviewStatus(remote.state.assets, current.request.design_reference) !== 'approved') throw new Error('html_source_not_approved');
        const resolved: CompositionBindings = {};
        for (const [slot, binding] of Object.entries(current.bindings)) {
          if ('omitted' in binding) { resolved[slot] = { omitted: true }; continue; }
          let blob: Blob;
          if (binding.origin === 'local') {
            const local = library.find(item => sameAsset(item.version.identity, binding.asset));
            if (!local) throw new Error('asset_not_found');
            blob = await readPresentationAsset(businessId, local.version);
          } else {
            if (getAssetReviewStatus(remote.state.assets, binding.asset) !== 'approved') throw new Error('composition_piece_not_approved');
            blob = await client.asset(binding.asset);
          }
          ensure(life); resolved[slot] = { asset: binding.asset, dataUrl: await imageDataUrl(blob), altText: binding.altText };
        }
        const output = renderHtmlComposition(current.request, current.result, resolved);
        ensure(life); onApply(reviseSlide([slide], { slide_id: slide.id, expected_revision: slide.revision, html: output.html, mounted_assets: output.mountedAssets })[0]); onClose();
      })}>Aplicar HTML revisado</button></footer>
  </div></div>;
}
