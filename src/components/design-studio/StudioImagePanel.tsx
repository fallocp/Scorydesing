import { useEffect, useMemo, useRef, useState } from 'react';
import { ServerDesignPanel } from '@/components/presentations/ServerDesignPanel';
import type { PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import type { RegisteredAssetVersion } from '../../../supabase/functions/_shared/desaing/assets';
import type { AssetVersion, DesignOperation } from '../../../supabase/functions/_shared/desaing/contracts';
import { assertProductionSnapshot, type ProductionReceipt, type ProductionSnapshot, type ProductionSource } from '../../../supabase/functions/_shared/desaing/production';
import { canonicalExploration } from '../../../supabase/functions/_shared/desaing/explorationRepository';
import { assertStudioCarouselCurrent, assertStudioPending, assertStudioReceipt, isStudioApplyRefusal, studioSourceKey,
  type StudioCarouselContext, type StudioImageAction, type StudioPendingApply } from '@/lib/desaing/studioImageState';
import type { PresentationSlide } from '@/lib/presentations/presentationDocument';
import './StudioImagePanel.css';

export interface StudioImagePanelProps {
  service: PresentationDesignService; businessId: string; source: ProductionSource; initialAction?: StudioImageAction;
  localCarousel?: StudioCarouselContext; onClose(): void; onSaved?(receipt: ProductionReceipt, snapshot: ProductionSnapshot): Promise<void> | void;
}
const same = (a: unknown, b: unknown) => canonicalExploration(a) === canonicalExploration(b);
const code = (error: unknown) => error && typeof error === 'object' && 'code' in error ? String(error.code) : error instanceof Error ? error.message : '';
function describe(error: unknown): string {
  return ({
    server_session_changed: 'Cambió la cuenta. Cierra este panel y vuelve a abrir la imagen.',
    studio_local_changes: 'Hay cambios locales en el texto, el prompt o el plan. Ciérralo y guarda esos cambios en el flujo original antes de editar la imagen.',
    studio_source_changed: 'Cambió la fuente. Conservamos la variante; vuelve a abrir la lámina actual antes de aplicarla.',
    production_source_changed: 'Cambió la fuente guardada. Conservamos la variante. Revisa la versión actual antes de continuar.',
    server_production_source_changed: 'Cambió la fuente guardada. Conservamos la variante. Revisa la versión actual antes de continuar.',
    production_copy_required: 'Confirma el texto exacto de esta imagen, o indica que no lleva texto.',
    server_production_copy_required: 'Confirma el texto exacto de esta imagen, o indica que no lleva texto.',
    studio_storage_unavailable: 'No se pudo conservar el guardado pendiente en este navegador. Habilita el almacenamiento antes de aplicar la variante.',
    studio_pending_invalid: 'No se pudo validar el guardado pendiente. Consulta las versiones guardadas antes de continuar.',
    studio_unavailable: 'La edición de imágenes guardadas no está disponible en este entorno.',
    studio_asset_unavailable: 'No se pudo recuperar la imagen exacta del servidor. Recupera el estado para volver a cargarla.',
    server_response_unknown: 'No llegó la confirmación. Recupera el guardado con la misma solicitud; no se genera otra imagen.',
    server_production_outcome_unknown: 'El guardado todavía no se confirma. Recupera su resultado antes de crear otra variante.',
    production_apply_conflict: 'El guardado corresponde a otra versión. Recupera el resultado antes de continuar.',
    production_source_not_found: 'La imagen o lámina ya no está disponible en este negocio.',
    production_source_invalid: 'Esta fuente no contiene una imagen y un contexto válidos para editar.',
    production_png_required: 'La fuente debe estar guardada como PNG. Conserva el original y guarda una copia PNG antes de editarla.',
    production_copy_conflict: 'Esta fuente ya tiene texto aprobado. Conserva ese texto o revísalo desde el flujo original.',
    production_request_conflict: 'La solicitud corresponde a otra fuente. Recupera el estado guardado.',
    production_not_approved: 'Revisa y aprueba el resultado antes de guardar esta variante.',
    production_result_mismatch: 'El resultado corresponde a otra versión o cambió su revisión. Recupera el estado antes de aplicarlo.',
    production_base_changed: 'Cambió la imagen base. Abre de nuevo la versión actual antes de aplicar una variante.',
    production_snapshot_not_found: 'No se encontró la versión preparada. Recupera el estado o actualiza la fuente guardada.',
    production_context_too_large: 'El contexto guardado supera el límite disponible. Revisa el texto y el prompt en el flujo original; no se recortaron automáticamente.',
    unsupported_production_dimensions: 'El formato de esta imagen no es compatible con la generación disponible. El original se conserva.',
    production_storage_unavailable: 'No se pudo confirmar el archivo de la variante. Recupera su guardado antes de continuar.',
    business_access_denied: 'Ya no tienes acceso a este negocio.', business_write_denied: 'Tu acceso no permite guardar variantes en este negocio.',
  } as Record<string, string>)[code(error)] ?? 'No se pudo completar la acción. La imagen original y las variantes guardadas se conservan.';
}
type Life = { active: boolean; actor: string; locked: boolean; blocked: boolean; changed: boolean; pending: StudioPendingApply | null; snapshot: ProductionSnapshot | null };
function surface(snapshot: ProductionSnapshot): PresentationSlide {
  const { width, height } = snapshot.output_canvas;
  return { id: snapshot.source.kind === 'carousel' ? snapshot.source.slide_id : snapshot.id, revision: 1,
    title: snapshot.source.kind === 'carousel' ? 'Lámina del carrusel' : 'Imagen individual', mounted_assets: [],
    html: `<!doctype html><html><head><style>html,body{margin:0;padding:0;width:${width}px;height:${height}px;overflow:hidden}.lab-canvas{width:${width}px;height:${height}px;position:relative}</style></head><body><main class="lab-canvas"></main></body></html>` };
}

/** Production source adapter. Rendering/review is owned by the shared design panel. */
export function StudioImagePanel({ service, businessId, source, initialAction = 'compare', localCarousel, onClose, onSaved }: StudioImagePanelProps) {
  const api = useMemo(() => service.client.production?.(businessId), [service.client, businessId]);
  const sourceKey = canonicalExploration(source);
  const [snapshot, setSnapshot] = useState<ProductionSnapshot | null>(null), [base, setBase] = useState<RegisteredAssetVersion | null>(null);
  const [history, setHistory] = useState<ProductionReceipt[]>([]), [receipt, setReceipt] = useState<ProductionReceipt | null>(null);
  const [baseUrl, setBaseUrl] = useState(''), [resultUrl, setResultUrl] = useState('');
  const [visual, setVisual] = useState<'edit_image' | 'regenerate_image' | null>(null);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [pending, setPending] = useState<StudioPendingApply | null>(null), [copy, setCopy] = useState(''), [noCopy, setNoCopy] = useState(false);
  const lifeRef = useRef<Life | null>(null), dialog = useRef<HTMLDivElement>(null), trigger = useRef<HTMLElement | null>(null);
  const urls = useRef<string[]>([]), expected = useRef(localCarousel); expected.current = localCarousel;
  const active = (life: Life) => life.active && lifeRef.current === life;
  function ensure(life: Life) { if (!active(life)) throw Error('studio_closed'); if (life.changed) throw Error('server_session_changed'); }
  function forget(life: Life) {
    life.changed = true; life.blocked = true; life.snapshot = null; life.pending = null;
    if (active(life)) { setSnapshot(null); setBase(null); setBaseUrl(''); setResultUrl(''); setHistory([]); setReceipt(null); setPending(null); setVisual(null); setCopy(''); setNotice(''); setError(describe(Error('server_session_changed'))); }
  }
  async function verify(life: Life) {
    ensure(life); try { if ((await service.client.session()).actorId !== life.actor) throw Error('server_session_changed'); }
    catch { forget(life); throw Error('server_session_changed'); } ensure(life);
  }
  async function image(life: Life, identity: AssetVersion): Promise<string> {
    const blob = await service.client.asset(identity); await verify(life); const url = URL.createObjectURL(blob); urls.current.push(url); return url;
  }
  function savePending(life: Life, next: StudioPendingApply) {
    assertStudioPending(next, businessId, life.actor, source);
    try { const key = studioSourceKey(businessId, life.actor, source), raw = JSON.stringify(next); localStorage.setItem(key, raw); if (localStorage.getItem(key) !== raw) throw Error(); }
    catch { throw Error('studio_storage_unavailable'); }
    life.pending = next; setPending(next);
  }
  function clearPending(life: Life) {
    try { localStorage.removeItem(studioSourceKey(businessId, life.actor, source)); } catch { /* The durable receipt wins on the next read. */ }
    life.pending = null; setPending(null);
  }
  async function adopt(life: Life, next: ProductionSnapshot, checkLocal = true) {
    assertProductionSnapshot(next);
    if (next.actor_id !== life.actor || next.business_id !== businessId || !same(next.source, source)) throw Error('server_session_changed');
    if (checkLocal) assertStudioCarouselCurrent(next, expected.current);
    const state = await service.client.read(businessId); await verify(life);
    const registered = state.state.assets.versions.find(value => same(value.identity, next.base_asset));
    if (!registered) throw Error('studio_asset_unavailable');
    const url = await image(life, next.base_asset); ensure(life);
    life.snapshot = next; setSnapshot(next); setBase(registered); setBaseUrl(url); setCopy(next.copy.text); setNoCopy(false);
  }
  async function completed(life: Life, next: ProductionReceipt, envelope?: StudioPendingApply) {
    if (envelope) assertStudioReceipt(next, envelope);
    await verify(life); clearPending(life); life.blocked = false; setVisual(null); setReceipt(next);
    setHistory(current => [next, ...current.filter(item => item.apply_id !== next.apply_id)]);
    setNotice(source.kind === 'image' ? 'La variante se guardó como otra imagen. El original se conserva.' : 'La variante se aplicó únicamente a esta lámina. El resto del carrusel se conserva.');
    try { const url = await image(life, next.result_asset); setResultUrl(url); } catch { if (active(life)) setNotice('La variante está guardada. Vuelve a abrir la biblioteca para consultar su imagen.'); }
    await verify(life);
    const savedSource = envelope?.snapshot ?? life.snapshot;
    if (onSaved && savedSource) { try { await onSaved(next, savedSource); } catch { if (active(life) && !life.changed) setNotice('La variante está guardada. Vuelve a abrir la página para actualizar la vista.'); } }
  }
  async function refresh(life: Life) {
    if (!api) throw Error('studio_unavailable'); await verify(life);
    const read = await api.read(source); await verify(life); setHistory(read.history);
    const raw = localStorage.getItem(studioSourceKey(businessId, life.actor, source));
    let stored: StudioPendingApply | null = null;
    if (raw) { stored = JSON.parse(raw); assertStudioPending(stored, businessId, life.actor, source); }
    if (stored) {
      life.pending = stored; setPending(stored); await adopt(life, stored.snapshot, false);
      const found = read.history.find(item => item.apply_id === stored!.input.apply_id) ?? await api.recover(stored.input.apply_id);
      await verify(life); if (found) await completed(life, found, stored); return;
    }
    const next = read.snapshot ?? await api.prepare({ business_id: businessId, prepare_id: crypto.randomUUID(), source });
    await verify(life); await adopt(life, next); life.blocked = false;
  }
  async function run(action: (life: Life) => Promise<void>, recovery = false, propagate = false) {
    const life = lifeRef.current; if (!life || !active(life) || life.locked || life.changed || life.blocked && !recovery) return;
    life.locked = true; setBusy(true); setError('');
    try { await verify(life); await action(life); }
    catch (problem) { if (active(life)) { setError(describe(problem)); if (life.pending) {
      setVisual(null); if (isStudioApplyRefusal(problem)) { clearPending(life); life.blocked = false; } else life.blocked = true;
    } } if (propagate) throw problem; }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  useEffect(() => {
    const life: Life = { active: true, actor: '', locked: true, blocked: false, changed: false, pending: null, snapshot: null };
    lifeRef.current = life; setBusy(true); setError(''); setSnapshot(null); setBase(null); setReceipt(null); setPending(null); setHistory([]); setVisual(null); setBaseUrl(''); setResultUrl('');
    void (async () => { life.actor = (await service.client.session()).actorId; ensure(life); await refresh(life); })()
      .catch(problem => { if (active(life)) setError(describe(problem)); }).finally(() => { life.locked = false; if (active(life)) setBusy(false); });
    return () => { life.active = false; urls.current.forEach(url => URL.revokeObjectURL(url)); urls.current = []; };
  }, [api, businessId, sourceKey]);
  useEffect(() => {
    const check = () => { const life = lifeRef.current; if (life?.actor && active(life) && !life.changed) void verify(life).catch(() => {}); };
    window.addEventListener('focus', check); window.addEventListener('storage', check); document.addEventListener('visibilitychange', check);
    return () => { window.removeEventListener('focus', check); window.removeEventListener('storage', check); document.removeEventListener('visibilitychange', check); };
  }, [businessId, service.client]);
  useEffect(() => { trigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => { const target = trigger.current; requestAnimationFrame(() => { if (target?.isConnected && !target.closest('[inert]')) target.focus(); }); }; }, []);
  useEffect(() => { if (!visual) dialog.current?.focus(); }, [visual]);
  async function useResult(asset: RegisteredAssetVersion, approvedCopy: string, operation: DesignOperation) {
    await run(async life => {
      if (!api || !life.snapshot || life.pending || receipt || approvedCopy !== life.snapshot.copy.text
        || operation.context.project_id !== life.snapshot.id || operation.context.copy_version_id !== life.snapshot.copy.version_id) throw Error('studio_source_changed');
      const frozen: StudioPendingApply = { schema_version: 1, actor_id: life.actor, snapshot: structuredClone(life.snapshot), input: {
        business_id: businessId, apply_id: crypto.randomUUID(), snapshot_id: life.snapshot.id, source_hash: life.snapshot.source_hash,
        base_asset: life.snapshot.base_asset, result_asset: asset.identity } };
      savePending(life, frozen); await verify(life); const result = await api.apply(frozen.input); await verify(life); await completed(life, result, frozen);
    }, false, true);
  }
  function open(action: 'edit_image' | 'regenerate_image') {
    void run(async life => { if (!life.snapshot || life.pending || receipt || life.snapshot.copy.origin === 'unavailable') throw Error('production_copy_required');
      assertStudioCarouselCurrent(life.snapshot, expected.current); setVisual(action); });
  }
  if (visual && snapshot && base && !pending) return <ServerDesignPanel service={service} businessId={businessId} documentId={snapshot.id}
    slide={surface(snapshot)} destination={snapshot.source.kind === 'carousel'
      ? { workspace: 'production', document_type: 'carousel', brand_id: businessId, source_hash: snapshot.source_hash, slide_id: snapshot.source.slide_id }
      : { workspace: 'production', document_type: 'image', brand_id: businessId, source_hash: snapshot.source_hash }}
    productionSource={base} productionCopyVersion={snapshot.copy.version_id} productionPrompt={snapshot.prompt} initialProductionAction={visual}
    initialCopy={snapshot.copy.text} initialInstruction=""
    onUseProductionResult={useResult} onClose={() => setVisual(null)} />;
  return <div className="sip-overlay"><div ref={dialog} className="sip-panel" role="dialog" aria-modal="true" aria-labelledby="sip-title" tabIndex={-1}
    onKeyDown={event => { event.stopPropagation(); if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose(); }
      if (event.key === 'Tab') { const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),summary,[tabindex="0"]') ?? []);
        const first = controls[0], last = controls[controls.length - 1]; if (!first) event.preventDefault();
        else if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first.focus(); } } }}>
    <header><div><h2 id="sip-title">{source.kind === 'image' ? 'Revisar imagen guardada' : 'Revisar esta lámina'}</h2>
      <p>Edición con píxeles, regeneración desde el prompt y comparación de variantes.</p></div><button type="button" disabled={busy} onClick={onClose}>Cerrar</button></header>
    <div className="sip-body">
      {busy && <p role="status">Recuperando la versión exacta…</p>}{error && <p role="alert" className="sip-error">{error}</p>}{notice && <p role="status" className="sip-notice">{notice}</p>}
      {snapshot && <>
        <div className="sip-comparison"><figure><figcaption>Imagen original</figcaption>{baseUrl && <img src={baseUrl} alt="Imagen original guardada" />}</figure>
          {resultUrl && <figure><figcaption>Variante guardada</figcaption><img src={resultUrl} alt="Variante revisada guardada" /></figure>}</div>
        <details><summary>Prompt original y texto que se conserva</summary><p className="sip-literal">{snapshot.copy.origin === 'unavailable' ? 'El archivo no tiene un texto estructurado registrado.' : snapshot.copy.text || 'Confirmado: esta imagen no lleva texto.'}</p>
          <pre>{snapshot.prompt || 'Sin prompt registrado.'}</pre></details>
        {snapshot.copy.origin === 'unavailable' && !pending && !receipt && <fieldset disabled={busy} className="sip-copy"><legend>Confirma el texto antes de diseñar</legend>
          <p>No hemos leído el texto de los píxeles. Copia aquí las palabras y cifras que debe conservar la imagen.</p>
          <textarea aria-label="Texto exacto de la imagen" rows={5} maxLength={4000} value={copy} disabled={noCopy} onChange={event => setCopy(event.target.value)} />
          <label><input type="checkbox" checked={noCopy} onChange={event => setNoCopy(event.target.checked)} /> Confirmo que la imagen no lleva texto</label>
          <button type="button" disabled={!noCopy && !copy.trim()} onClick={() => void run(async life => {
            if (!api) throw Error('studio_unavailable'); const next = await api.prepare({ business_id: businessId, prepare_id: crypto.randomUUID(), source, confirmed_copy: noCopy ? '' : copy });
            await verify(life); await adopt(life, next); setNotice('Texto confirmado para esta versión. Ya puedes editar o explorar su diseño.');
          })}>Confirmar texto</button></fieldset>}
        {!pending && !receipt && snapshot.copy.origin !== 'unavailable' && <div className="sip-actions">
          <button type="button" className={initialAction === 'edit_image' ? 'sip-primary' : ''} disabled={busy} onClick={() => open('edit_image')}>Editar con píxeles</button>
          <button type="button" className={initialAction === 'regenerate_image' ? 'sip-primary' : ''} disabled={busy || !snapshot.prompt.trim()} onClick={() => open('regenerate_image')}>Regenerar desde el prompt</button>
          <p>Editar envía la imagen original. Regenerar crea otra imagen desde el encargo. Cada resultado se revisa antes de guardarse.</p></div>}
      </>}
      {pending && <section className="sip-pending"><h3>Guardado pendiente de confirmar</h3><p>Conservamos la misma variante y solicitud. Recuperar no genera imágenes.</p>
        <button type="button" disabled={busy} onClick={() => void run(async life => {
          if (!api || !life.pending) return; const found = await api.recover(life.pending.input.apply_id); await verify(life);
          if (found) await completed(life, found, life.pending); else setNotice('Todavía no hay un recibo confirmado. Puedes consultar otra vez o reenviar este mismo guardado.');
        }, true)}>Recuperar guardado</button>
        <button type="button" disabled={busy} onClick={() => void run(async life => {
          if (!api || !life.pending) return; const frozen = life.pending, result = await api.apply(frozen.input); await verify(life); await completed(life, result, frozen);
        }, true)}>Reenviar el mismo guardado</button></section>}
      {!!history.length && <section><h3>Versiones guardadas</h3><div className="sip-history">{history.map(item => <button type="button" key={item.apply_id} disabled={busy}
        onClick={() => void run(async life => { setResultUrl(await image(life, item.result_asset)); })}>
        <img src={item.image_url} alt="Variante guardada" /><span>Comparar · {new Date(item.applied_at).toLocaleString('es-MX')}</span></button>)}</div></section>}
      {!pending && !receipt && <div className="sip-actions"><button type="button" disabled={busy} onClick={() => void run(refresh, true)}>Recuperar estado</button>
        <button type="button" disabled={busy} onClick={() => void run(async life => {
          if (!api) throw Error('studio_unavailable'); const next = await api.prepare({ business_id: businessId, prepare_id: crypto.randomUUID(), source });
          await verify(life); await adopt(life, next); life.blocked = false; setNotice('Fuente actualizada. Las solicitudes anteriores siguen guardadas en su versión.');
        }, true)}>Actualizar fuente guardada</button></div>}
    </div>
  </div></div>;
}
