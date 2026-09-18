import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileText, RefreshCw, Upload, X } from 'lucide-react';
import type { DesignServerClient } from '@/lib/desaing/serverClient';
import { prepareMaterialFile, isMaterialsAdmissionRefusal } from '@/lib/desaing/materialsClient';
import { buildReviewedMaterialsSelection, materialCorrections, materialFindingValues, materialIdentityKey, materialIdFromHash,
  type ReviewedMaterialsSelection } from '@/lib/desaing/materialsPanelState';
import { MATERIALS_COLLECTION_ID, MATERIALS_LIMITS, makeMaterialAnalysisRequest, materialHash,
  type MaterialAnalysisAttempt, type MaterialAnalysisRequest, type MaterialCollection, type MaterialMime,
  type MaterialReview, type MaterialsCapabilities, type MaterialVersion } from '../../../supabase/functions/_shared/desaing/materials';
import './MaterialsPanel.css';

export type { ReviewedMaterialsSelection } from '@/lib/desaing/materialsPanelState';
export interface MaterialsPanelProps { client: DesignServerClient; businessId: string; returnFocus?: HTMLElement | null; onClose(): void; onUse?(selection: ReviewedMaterialsSelection): Promise<void> }
type Life = { active: boolean; actor: string; collection: MaterialCollection | null; attempts: MaterialAnalysisAttempt[]; locked: boolean; blocked: boolean; sessionChanged: boolean; pending: MaterialAnalysisRequest | null };
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const problemCode = (problem: unknown) => problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : problem instanceof Error ? problem.message : '';
function errorMessage(problem: unknown): string {
  const code = problemCode(problem);
  return ({
    materials_revision_conflict: 'Otra pestaña cambió la biblioteca. Recupera la biblioteca para ver su versión actual.',
    material_revision_conflict: 'Otra pestaña cambió la biblioteca. Recupera la biblioteca para ver su versión actual.',
    materials_review_required: 'Aprueba la ficha correspondiente a los materiales y las indicaciones actuales antes de usarla.',
    materials_findings_required: 'Selecciona al menos un hallazgo revisado para usarlo.',
    materials_use_too_large: 'Los hallazgos elegidos superan el espacio disponible. Selecciona menos o acorta sus correcciones antes de usarlos.',
    materials_brief_too_long: 'La ficha y el texto que ya tienes superan el espacio disponible. Selecciona menos hallazgos o acorta sus correcciones antes de usarlos.',
    materials_correction_invalid: 'Cada hallazgo necesita texto y admite hasta 2.000 caracteres.',
    materials_selection_required: 'Selecciona entre uno y cuatro materiales para analizarlos.',
    materials_upload_too_large: 'El archivo supera el tamaño admitido: 8 MiB para PDF o imagen y 64 KiB para texto.',
    materials_unsupported_file: 'Usa PDF, PNG, JPG, WebP o un archivo de texto TXT/MD.',
    invalid_material_file: 'No se pudo leer este archivo. Usa un PDF, una imagen compatible o texto UTF-8.',
    materials_unavailable: 'La biblioteca de materiales no está disponible en esta conexión.',
    materials_source_changed: 'Cambió la selección o la ficha guardada. Recupera la biblioteca antes de usarla.',
    materials_sources_changed: 'Cambió la selección guardada. Recupera la biblioteca antes de volver a analizarla.',
    materials_input_limit: 'La selección supera el límite de lectura. Elige menos materiales o documentos más breves.',
    invalid_materials_request: 'Revisa el tipo y tamaño del archivo. Los documentos necesitan bytes válidos y el texto debe ser UTF-8.',
    server_session_changed: 'Cambió tu sesión. Cierra y vuelve a abrir el panel con la cuenta correspondiente.',
    server_materials_outcome_unknown: 'El análisis quedó pendiente de confirmar. Usa Recuperar análisis; no se reenviará automáticamente.',
    materials_quota_exceeded: 'No queda cupo para otro análisis. Puedes revisar y reutilizar las fichas guardadas.',
    materials_previous_unresolved: 'Hay un análisis pendiente. Recupera su resultado antes de iniciar otro.',
    server_materials_expired: 'Terminó la ventana de análisis. Los materiales y las fichas guardadas siguen disponibles.',
  } as Record<string, string>)[code] ?? 'No se pudo completar la acción. Los materiales guardados se conservan; recupera la biblioteca antes de volver a intentar.';
}
const categories: Record<string, string> = { identity: 'Identidad', audience: 'Audiencia', tone: 'Tono', color: 'Color', typography: 'Tipografía', logo: 'Logo', legal: 'Texto legal', layout: 'Composición', other: 'Otro dato', conflict: 'Contradicción', pending: 'Pendiente' };
const certainty = { explicit: 'Explícito en la fuente', inferred: 'Interpretación', uncertain: 'Sin confirmar' };
const accept = 'application/pdf,image/png,image/jpeg,image/webp,text/plain,text/markdown,.txt,.md';

export function MaterialsPanel({ client, businessId, returnFocus, onClose, onUse }: MaterialsPanelProps) {
  const api = useMemo(() => client.materials?.(businessId), [client, businessId]);
  const [collection, setCollection] = useState<MaterialCollection | null>(null), [attempts, setAttempts] = useState<MaterialAnalysisAttempt[]>([]);
  const [capabilities, setCapabilities] = useState<MaterialsCapabilities | null>(null), [request, setRequest] = useState<MaterialAnalysisRequest | null>(null);
  const [brief, setBrief] = useState(''), [idea, setIdea] = useState(''), [ideaName, setIdeaName] = useState('Idea o documentación.txt');
  const [shownKey, setShownKey] = useState(''), [values, setValues] = useState<Record<string, string>>({}), [useIds, setUseIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(true), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [versions, setVersions] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<{ source: MaterialVersion; url: string; text?: string; page?: number } | null>(null);
  const lifeRef = useRef<Life | null>(null), dialog = useRef<HTMLElement>(null), edits = useRef({ brief, values }); edits.current = { brief, values };
  const active = (life: Life) => life.active && lifeRef.current === life;
  function ensure(life: Life) { if (!active(life)) throw new Error('materials_view_closed'); if (life.sessionChanged) throw new Error('server_session_changed'); }
  function invalidateSession(life: Life) {
    life.blocked = true; life.sessionChanged = true; life.collection = null; life.attempts = []; life.pending = null;
    if (active(life)) {
      setCollection(null); setAttempts([]); setCapabilities(null); setRequest(null); setShownKey(''); setPreview(null);
      setBrief(''); setValues({}); setUseIds([]); setVersions({}); setIdea(''); setIdeaName('Idea o documentación.txt'); setNotice('');
      edits.current = { brief: '', values: {} }; setError(errorMessage(new Error('server_session_changed')));
    }
  }
  async function verifyActor(life: Life) {
    ensure(life);
    try { if ((await client.session()).actorId !== life.actor) throw new Error('server_session_changed'); }
    catch { invalidateSession(life); throw new Error('server_session_changed'); }
    ensure(life);
  }
  function adopt(life: Life, next: MaterialCollection) {
    ensure(life); if (next.actor_id !== life.actor || next.business_id !== businessId || next.collection_id !== MATERIALS_COLLECTION_ID) throw new Error('server_session_changed');
    life.collection = next; setCollection(next); setBrief(next.brief); edits.current.brief = next.brief;
  }
  function adoptAttempts(life: Life, next: MaterialAnalysisAttempt[]) { ensure(life); life.attempts = next; setAttempts(next); }
  async function refresh(life: Life) {
    if (!api) throw new Error('materials_unavailable'); await verifyActor(life);
    const next = await api.read(MATERIALS_COLLECTION_ID); await verifyActor(life);
    const [history, limits] = await Promise.all([api.history(MATERIALS_COLLECTION_ID), api.capabilities()]);
    await verifyActor(life); adopt(life, next); adoptAttempts(life, history); setCapabilities(limits); life.blocked = false;
    if (next.review) setShownKey(next.review.analysis_key);
    else if (next.selected.length) { const current = await makeMaterialAnalysisRequest(next); ensure(life);
      const match = history.find(item => item.request.request_key === current.request_key); if (match) setShownKey(match.request.request_key); }
  }
  async function run(action: (life: Life) => Promise<void>, allowBlocked = false) {
    const life = lifeRef.current; if (!life || !active(life) || life.locked || (life.blocked && !allowBlocked)) return;
    life.locked = true; setBusy(true); setError(''); setNotice('');
    try { await verifyActor(life); await action(life); }
    catch (problem) { if (active(life)) { if (/revision_conflict|server_response_unknown/.test(problemCode(problem))) life.blocked = true; setError(errorMessage(problem)); } }
    finally { life.locked = false; if (active(life)) setBusy(false); }
  }
  async function save(life: Life, change: { brief?: string; selected?: MaterialCollection['selected']; review?: MaterialReview | null }) {
    if (!api || !life.collection) throw new Error('materials_unavailable'); await verifyActor(life);
    const current = life.collection;
    const next = await api.save({ business_id: businessId, collection_id: MATERIALS_COLLECTION_ID, expected_revision: current.revision,
      selected: change.selected ?? current.selected, brief: change.brief ?? current.brief,
      review: Object.prototype.hasOwnProperty.call(change, 'review') ? change.review! : current.review });
    await verifyActor(life); adopt(life, next); return next;
  }
  useEffect(() => {
    const trigger = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    dialog.current?.focus();
    return () => { requestAnimationFrame(() => { if (trigger?.isConnected && !trigger.closest('[inert]') && !document.querySelector('.mtl-dialog')) trigger.focus(); }); };
  }, []);
  useEffect(() => {
    const life: Life = { active: true, actor: '', collection: null, attempts: [], locked: true, blocked: false, sessionChanged: false, pending: null };
    lifeRef.current = life; setBusy(true); setError(''); setCollection(null); setAttempts([]); setShownKey(''); setPreview(null);
    void (async () => { life.actor = (await client.session()).actorId; ensure(life); await refresh(life); })()
      .catch(problem => { if (active(life)) setError(errorMessage(problem)); })
      .finally(() => { life.locked = false; if (active(life)) setBusy(false); });
    return () => { life.active = false; };
  }, [api, client, businessId]);
  useEffect(() => {
    const verify = () => { const life = lifeRef.current; if (life?.actor && active(life) && !life.sessionChanged) void verifyActor(life).catch(() => {}); };
    window.addEventListener('focus', verify); window.addEventListener('storage', verify); document.addEventListener('visibilitychange', verify);
    return () => { window.removeEventListener('focus', verify); window.removeEventListener('storage', verify); document.removeEventListener('visibilitychange', verify); };
  }, [client, businessId]);
  useEffect(() => { let current = true; setRequest(null);
    if (collection?.selected.length) void makeMaterialAnalysisRequest(collection).then(value => { if (current) setRequest(value); }).catch(() => {});
    return () => { current = false; };
  }, [collection]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview.url); }, [preview]);
  const shown = attempts.find(item => item.request.request_key === shownKey)
    ?? attempts.find(item => item.request.request_key === request?.request_key);
  const result = shown?.result;
  useEffect(() => {
    if (result) { setValues(materialFindingValues(result, collection?.review ?? null)); setUseIds(result.findings.map(finding => finding.id)); }
    else { setValues({}); setUseIds([]); }
  }, [result, collection?.review]);
  const dirtyBrief = !!collection && brief !== collection.brief;
  const matches = !!result && result.request_key === request?.request_key && result.source_hash === request.source_hash && !dirtyBrief;
  const savedValues = result ? materialFindingValues(result, collection?.review ?? null) : {};
  const dirtyValues = !!result && !equal(values, savedValues);
  const approved = matches && !dirtyValues && collection?.review?.approved === true && collection.review.analysis_key === result?.request_key;
  const blocked = busy || !!lifeRef.current?.blocked || !collection;
  const currentAttempt = attempts.find(item => item.request.request_key === request?.request_key);
  const groups = useMemo(() => { const map = new Map<string, MaterialVersion[]>(); for (const version of collection?.materials ?? []) map.set(version.material_id, [...(map.get(version.material_id) ?? []), version]); return [...map.values()]; }, [collection?.materials]);

  async function flushBrief(life: Life) {
    if (life.collection && edits.current.brief !== life.collection.brief) await save(life, { brief: edits.current.brief, review: null });
  }
  async function flushEdits(life: Life) {
    const intendedBrief = edits.current.brief;
    if (dirtyValues && result?.request_key === request?.request_key) await saveReview(life, false);
    edits.current.brief = intendedBrief; setBrief(intendedBrief);
    await flushBrief(life);
  }
  async function upload(file: File, materialId?: string) {
    await run(async life => {
      if (!api || !life.collection) throw new Error('materials_unavailable');
      const prepared = await prepareMaterialFile(file); ensure(life);
      const versionId = await materialHash(new Uint8Array(await prepared.arrayBuffer())); ensure(life);
      await flushEdits(life);
      const existing = life.collection.materials.find(item => item.version_id === versionId && (!materialId || item.material_id === materialId));
      if (existing) {
        const selected = life.collection.selected.filter(item => item.material_id !== existing.material_id);
        if (selected.length < 4) await save(life, { selected: [...selected, { material_id: existing.material_id, version_id: existing.version_id }], review: null });
        setNotice('Este archivo ya estaba guardado. Reutilizamos su versión sin subir otra copia.'); return;
      }
      const next = await api.upload({ business_id: businessId, collection_id: MATERIALS_COLLECTION_ID,
        material_id: materialId ?? materialIdFromHash(versionId), version_id: versionId, expected_revision: life.collection.revision,
        filename: prepared.name.slice(0, 160), mime_type: prepared.type as MaterialMime }, prepared);
      await verifyActor(life); adopt(life, next); setVersions(previous => ({ ...previous, [materialId ?? materialIdFromHash(versionId)]: versionId }));
      setNotice('Material guardado. Analiza la selección cuando quieras preparar su ficha.');
      if (file.type === 'text/plain' && file.name === ideaName) setIdea('');
    });
  }
  function choose(version: MaterialVersion, selected: boolean) {
    void run(async life => { await flushEdits(life); const current = life.collection!;
      const next = current.selected.filter(item => item.material_id !== version.material_id);
      if (selected) next.push({ material_id: version.material_id, version_id: version.version_id });
      await save(life, { selected: next, review: null }); });
  }
  async function viewSource(life: Life, source: MaterialVersion, page?: number) {
    if (!api) throw new Error('materials_unavailable');
    const blob = await api.source(MATERIALS_COLLECTION_ID, source); await verifyActor(life);
    const text = source.mime_type.startsWith('text/') ? await blob.text() : undefined; ensure(life);
    setPreview({ source, url: URL.createObjectURL(blob), text, page });
  }
  async function saveReview(life: Life, approve: boolean) {
    if (!result || !request || result.request_key !== request.request_key || (approve && dirtyBrief)) throw new Error('materials_review_required');
    const corrections = materialCorrections(result, edits.current.values);
    await save(life, { review: { analysis_key: result.request_key, source_hash: result.source_hash, corrections, approved: approve } });
    setNotice(approve ? 'Ficha aprobada. Puedes usar los hallazgos elegidos sin generar otro análisis.' : 'Correcciones guardadas. Revisa la ficha antes de aprobarla.');
  }
  function close() {
    const life = lifeRef.current;
    if (!life?.collection || life.blocked) { onClose(); return; }
    void run(async current => {
      await flushEdits(current); ensure(current); onClose();
    });
  }
  return <div className="mtl-overlay" onKeyDown={event => {
    if (event.key === 'Escape') { event.stopPropagation(); event.preventDefault(); if (!busy) close(); }
    if (event.key === 'Tab') { event.stopPropagation(); const items = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]),a[href],input:not([disabled]),select:not([disabled]),textarea:not([disabled])') ?? []).filter(item => item.offsetParent !== null);
      const first = items[0], last = items[items.length - 1]; if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
  }}><section ref={dialog} tabIndex={-1} className="mtl-dialog" role="dialog" aria-modal="true" aria-labelledby="mtl-title">
    <header className="mtl-header"><div><h2 id="mtl-title">Materiales del proyecto</h2><p>Conserva archivos e ideas, revisa su interpretación y reutiliza la ficha aprobada en tus diseños.</p></div>
      <button className="mtl-close" aria-label="Cerrar biblioteca de materiales" disabled={busy} onClick={close}><X size={20} /></button></header>
    <div className="mtl-body"><aside className="mtl-library"><div><h3>Biblioteca privada de tu cuenta</h3><p className="mtl-note">Reutiliza los materiales de este negocio en Presentaciones y diseño libre.</p></div>
      <label className="mtl-upload"><span><Upload size={15} /> Añadir archivo</span><input type="file" accept={accept} aria-label="Añadir material" disabled={blocked || groups.length >= MATERIALS_LIMITS.maxMaterials}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} /></label>
      <p className="mtl-note">PDF, imágenes o TXT/MD. Hasta 8 MiB por PDF/imagen, 20 páginas y 64 KiB de texto.</p>
      <details className="mtl-idea"><summary>Pegar una idea o documentación</summary><label>Nombre<input aria-label="Nombre de la idea" value={ideaName} maxLength={160} disabled={blocked} onChange={event => setIdeaName(event.target.value)} /></label>
        <label>Texto<textarea aria-label="Texto del material" value={idea} maxLength={65536} rows={5} disabled={blocked} onChange={event => setIdea(event.target.value)} /></label>
        <button disabled={blocked || !idea.trim() || !ideaName.trim() || groups.length >= MATERIALS_LIMITS.maxMaterials}
          onClick={() => void upload(new File([idea], ideaName, { type: 'text/plain' }))}>Guardar texto como material</button></details>
      <div><h3>Materiales guardados</h3><p className="mtl-note">{collection?.selected.length ?? 0} de 4 seleccionados para la ficha.</p></div>
      <ul className="mtl-materials">{groups.map(group => {
        const chosen = collection?.selected.find(item => item.material_id === group[0].material_id);
        const version = group.find(item => item.version_id === versions[group[0].material_id]) ?? group.find(item => item.version_id === chosen?.version_id) ?? group[group.length - 1];
        const selected = chosen?.version_id === version.version_id;
        return <li key={version.material_id} className="mtl-material" data-selected={selected}>
          <label className="mtl-select-material"><input type="checkbox" aria-label={`Seleccionar ${version.filename}`} checked={selected}
            disabled={blocked || (!chosen && (collection?.selected.length ?? 0) >= 4)} onChange={event => choose(version, event.target.checked)} /><span>{version.filename}</span></label>
          <div className="mtl-material-meta"><small>{version.mime_type === 'application/pdf' ? `PDF · ${version.page_count} páginas` : version.mime_type.startsWith('text/') ? 'Documento de texto' : 'Imagen'} · {Math.ceil(version.size_bytes / 1024)} KiB</small>
            <small>Versión {version.version_id.slice(0, 12)}</small></div>
          {group.length > 1 && <label>Versión<select aria-label={`Versión de ${version.filename}`} value={version.version_id} disabled={blocked} onChange={event => {
            const next = group.find(item => item.version_id === event.target.value)!; setVersions(previous => ({ ...previous, [next.material_id]: next.version_id })); if (chosen) choose(next, true);
          }}>{group.map((item, index) => <option key={item.version_id} value={item.version_id}>{index + 1}. {item.filename} · {item.version_id.slice(0, 8)}</option>)}</select></label>}
          <div className="mtl-actions"><button disabled={blocked} onClick={() => void run(life => viewSource(life, version))}>Ver original</button>
            <label className="mtl-file-button">Nueva versión<input type="file" accept={accept} aria-label={`Nueva versión de ${version.filename}`} disabled={blocked || (collection?.materials.length ?? 0) >= 40}
              onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file, version.material_id); }} /></label></div>
        </li>;
      })}</ul>
      {!groups.length && !busy && <p className="mtl-note">Añade el primer material para conservarlo y preparar su ficha.</p>}
      <button disabled={busy || lifeRef.current?.sessionChanged} onClick={() => void run(async life => { if (!life.blocked) await flushEdits(life); await refresh(life); setNotice('Biblioteca recuperada. No se ejecutó otro análisis.'); }, true)}><RefreshCw size={14} />Recuperar biblioteca</button>
    </aside><main className="mtl-content"><section className="mtl-brief"><label>Qué quieres entender y qué reglas conservar<textarea aria-label="Indicaciones para analizar materiales" value={brief} maxLength={8000} rows={3} disabled={blocked}
        onChange={event => setBrief(event.target.value)} placeholder="Ejemplo: identifica audiencia, tono y cifras que deban mantenerse. Señala contradicciones entre fuentes." /></label>
      <div className="mtl-actions"><button disabled={blocked || !dirtyBrief} onClick={() => void run(flushEdits)}>Guardar indicaciones</button>
        <button className="mtl-primary" disabled={blocked || !collection?.selected.length || ((dirtyBrief || !currentAttempt?.result) && !capabilities?.remaining_attempts) || currentAttempt?.status === 'uncertain' || currentAttempt?.status === 'running'}
          onClick={() => void run(async life => {
            await flushEdits(life); if (!life.collection?.selected.length || !api) throw new Error('materials_selection_required');
            const next = await makeMaterialAnalysisRequest(life.collection); ensure(life);
            const cached = life.attempts.find(item => item.request.request_key === next.request_key && item.result);
            if (cached) { setShownKey(next.request_key); setNotice('Reutilizamos la ficha guardada para esta selección e indicaciones.'); return; }
            life.pending = next; setShownKey(next.request_key);
            try { const analysis = await api.analyze(next); await verifyActor(life);
              adoptAttempts(life, [...life.attempts.filter(item => item.request.request_key !== next.request_key), { request: next, status: 'completed', result: analysis }]);
              life.pending = null;
            } catch (problem) { if (active(life) && !life.sessionChanged && !isMaterialsAdmissionRefusal(problem)) adoptAttempts(life, [...life.attempts.filter(item => item.request.request_key !== next.request_key), { request: next, status: 'uncertain' }]); throw problem; }
            const limits = await api.capabilities().catch(() => null); await verifyActor(life); setCapabilities(limits);
          })}><FileText size={14} />{currentAttempt?.result && !dirtyBrief ? 'Reutilizar ficha guardada' : 'Analizar selección'}</button>
        <button disabled={blocked || (!shown && !request && !lifeRef.current?.pending)} onClick={() => void run(async life => {
          const pending = life.pending ?? shown?.request ?? request; if (!pending || !api) return;
          const found = await api.recover(pending); await verifyActor(life);
          if (found) { adoptAttempts(life, [...life.attempts.filter(item => item.request.request_key !== pending.request_key), { request: pending, status: 'completed', result: found }]); setShownKey(pending.request_key); life.pending = null; }
          else setNotice('Todavía no hay un resultado confirmado. Consultar su estado no inicia otro análisis.');
        })}><RefreshCw size={14} />Recuperar análisis</button></div>
      <p className="mtl-note">Subir, corregir, aprobar y reutilizar no ejecuta modelos. Analizar selección solicita una lectura de los materiales elegidos.</p>
      {dirtyBrief && <p className="mtl-warning">Cambiaste las indicaciones. La ficha anterior permanece visible; necesitarás revisar la ficha de esta nueva selección antes de usarla.</p>}
      {notice && <p className="mtl-status" role="status">{notice}</p>}
    </section>
    {preview && <section className="mtl-source"><div className="mtl-sheet-heading"><div><h3>{preview.source.filename}</h3><p className="mtl-note">Original · versión {preview.source.version_id.slice(0, 12)}{preview.page ? ` · página ${preview.page}` : ''}</p></div>
      <button onClick={() => setPreview(null)} aria-label="Cerrar vista del material"><X size={14} /></button></div>
      {preview.text !== undefined ? <pre>{preview.text}</pre> : preview.source.mime_type === 'image/png' ? <img src={preview.url} alt={preview.source.filename} /> : <iframe src={`${preview.url}#page=${preview.page ?? 1}`} title={`PDF: ${preview.source.filename}`} />}
      <a className="mtl-download" href={preview.url} download={preview.source.filename}>Descargar original</a></section>}
    {result ? <section className="mtl-sheet"><div className="mtl-sheet-heading"><div><h3>Ficha de materiales</h3><p className="mtl-note">Análisis {result.analyzer_version} · fuentes {result.source_hash.slice(0, 12)}</p></div>
      <span className="mtl-badge">{approved ? 'Ficha aprobada' : matches ? 'Por revisar' : 'Otra selección o versión'}</span></div>
      <div><p className="mtl-note">Resumen del análisis original</p><p className="mtl-original">{result.summary}</p></div>
      {!matches && <p className="mtl-warning">Esta ficha corresponde a otros materiales o indicaciones. Puedes consultarla; su aprobación no se aplica a la selección actual.</p>}
      {result.warnings.length > 0 && <div className="mtl-warning"><strong>Límites de la lectura</strong><ul>{result.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></div>}
      {result.findings.map(finding => <article key={finding.id} className="mtl-finding"><div className="mtl-finding-header"><strong>{categories[finding.category]}</strong><span className="mtl-badge">{certainty[finding.certainty]}</span></div>
        <textarea aria-label={`Hallazgo ${finding.id}`} rows={3} maxLength={2000} value={values[finding.id] ?? finding.value} disabled={blocked || !matches}
          onChange={event => setValues(current => ({ ...current, [finding.id]: event.target.value }))} />
        {(values[finding.id] ?? finding.value) !== finding.value && <p className="mtl-original">Interpretación original: {finding.value}</p>}
        {finding.evidence.map((evidence, index) => {
          const source = collection?.materials.find(item => materialIdentityKey(item) === materialIdentityKey(evidence));
          return <div className="mtl-evidence" key={index}><strong>{source?.filename ?? 'Fuente'} · versión {evidence.version_id.slice(0, 12)}{evidence.page !== null ? ` · página ${evidence.page}` : ''}</strong>
            {evidence.quote !== null && <blockquote>«{evidence.quote}»</blockquote>}<span>{evidence.observation}</span>
            {source && <button disabled={blocked} onClick={() => void run(life => viewSource(life, source, evidence.page ?? undefined))}>Ver fuente de este hallazgo</button>}</div>;
        })}
        {onUse && <label className="mtl-select-material"><input type="checkbox" checked={useIds.includes(finding.id)} disabled={blocked}
          onChange={event => setUseIds(previous => event.target.checked ? [...previous, finding.id] : previous.filter(id => id !== finding.id))} />Incluir al usar la ficha</label>}
      </article>)}
      <div className="mtl-actions"><button disabled={blocked || !matches || !dirtyValues} onClick={() => void run(life => saveReview(life, false))}>Guardar correcciones</button>
        <button className="mtl-primary" disabled={blocked || !matches || approved} onClick={() => void run(life => saveReview(life, true))}><Check size={15} />Aprobar ficha</button></div>
      <p className="mtl-note">Las correcciones conservan el análisis original y su evidencia. Aprobar la ficha no publica una dirección de marca ni modifica el prompt maestro.</p>
    </section> : <div className="mtl-empty">{shown?.status === 'uncertain' || shown?.status === 'running' ? 'El análisis está pendiente. Puedes recuperar su resultado sin volver a enviarlo.' : 'Selecciona materiales y pulsa Analizar selección para preparar una ficha con referencias a sus fuentes.'}</div>}
    {attempts.length > 0 && <section className="mtl-history"><h3>Análisis guardados</h3><div className="mtl-history-list">{[...attempts].reverse().map(item => <button key={item.request.request_key} disabled={busy}
      onClick={() => void run(async life => { await flushEdits(life); setShownKey(item.request.request_key); })}>{item.request.sources.length} materiales · {item.request.source_hash.slice(0, 8)} · {item.status === 'completed' ? 'Ficha disponible' : 'Pendiente'}</button>)}</div></section>}
    </main></div>
    <footer className="mtl-footer"><div>{error && <p className="mtl-error" role="alert">{error}</p>}<p className="mtl-note">{busy ? 'Preparando materiales…' : 'Los archivos y las fichas guardadas se recuperan desde el servidor.'}</p></div>
      <div className="mtl-actions">{onUse && <button className="mtl-primary" disabled={blocked || !approved || !useIds.length} onClick={() => void run(async life => {
        if (!api || !result || !life.collection) throw new Error('materials_review_required');
        const expected = life.collection.revision, fresh = await api.read(MATERIALS_COLLECTION_ID); ensure(life);
        if (fresh.revision !== expected || fresh.actor_id !== life.actor || fresh.business_id !== businessId) throw new Error('materials_source_changed');
        const selection = await buildReviewedMaterialsSelection(fresh, result, useIds); await verifyActor(life);
        await onUse(selection); ensure(life); onClose();
      })}>Usar ficha revisada</button>}<button disabled={busy} onClick={close}>Cerrar</button></div></footer>
  </section></div>;
}
