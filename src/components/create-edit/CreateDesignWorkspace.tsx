import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Check, Download, ImagePlus, Loader2, PencilRuler, Plus, RefreshCw, ScanText, Sparkles, Wand2 } from 'lucide-react';
import type { FreeDesignDocument } from '@/lib/desaing/freeDesignDocument';
import { rasterizeHtml } from '@/lib/desaing/rasterizeHtml';
import { CreateDesignEditor } from './CreateDesignEditor';
import type { PresentationDesignService } from '@/components/presentations/PresentationDesignContext';
import { PresentationReferencePicker } from '@/components/presentations/PresentationReferencePicker';
import { ImageGenerationControls } from '@/components/image-generation/ImageGenerationControls';
import { useImageGenerationSettings } from '@/hooks/useImageGenerationSettings';
import { PRESENTATION_IMAGE_MODELS } from '@/lib/presentations/presentationServerDesign';
import { DESIGN_FORMAT_GROUPS, DESIGN_FORMAT_OPTIONS, designFormatOption, type DesignFormatGroup } from '@/lib/create-edit/formats';
import { layerObjectRegion, layerTextBox, MAX_DESIGN_VERSIONS, MONTHLY_SPEND_WARNING_MICRO_USD, overlaysText } from '@/lib/create-edit/designRun';
import { useCreateDesign } from '@/lib/create-edit/useCreateDesign';
import { renderCover } from '@/lib/create-edit/coverComposer';
import { XENDING_STYLES, XENDING_STYLE_LABELS } from '../../../supabase/functions/_shared/desaing/xendingVisualSystem';
import type { FormatPresetId } from '../../../supabase/functions/_shared/desaing/formats';
import './create-design.css';

const usd = (micro: number) => (micro / 1_000_000).toLocaleString('es-MX', { style: 'currency', currency: 'USD' });

export function CreateDesignWorkspace({ service, businessId, actorId, initialInstruction }: {
  service: PresentationDesignService; businessId: string; actorId: string; initialInstruction?: string;
}) {
  const navigate = useNavigate();
  const { settings, setSettings } = useImageGenerationSettings(businessId, 'create-design');
  const work = useCreateDesign({ service, businessId, actorId, initialInstruction, settings });
  const { setup, setSetup, generation, selected } = work;
  const [change, setChange] = useState('');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const loaded = useRef(new Set<string>());
  const option = designFormatOption(setup.formatId), cover = option.mode === 'compose_assets';
  const disabled = work.busy || work.brand.status === 'loading';
  const canGenerate = !disabled && !!generation && (setup.noText || !!setup.copy.trim());
  // With references, the first step is the vision reading (text, what to take from each image, render plan).
  const readFirst = work.references.length > 0 && !work.readingCurrent;
  // Editable covers and separate layers: text drawn over the image stays exact and editable without regenerating.
  const overlayText = overlaysText(setup) ? setup.copy : '';
  const object = selected ? work.objects.get(selected.asset.identity.version_id) ?? null : null;
  // Composed preview: cropped cover and/or background + object layer + text, at the exact final canvas.
  const composed = cover || !!object;
  const [coverUrl, setCoverUrl] = useState('');
  const blobs = useRef(new Map<string, Blob>());
  const personal = setup.formatId === 'linkedin_personal_cover';
  const blobOf = async (result: NonNullable<typeof selected>) => {
    const id = result.asset.identity.version_id, cached = blobs.current.get(id);
    if (cached) return cached;
    const blob = await work.imageBlob(result); blobs.current.set(id, blob); return blob;
  };
  const renderFinal = async (image: Blob) => renderCover({ image, canvas: option.canvas, text: overlayText, layout: setup.coverLayout, personal,
    ...(object ? { box: layerTextBox(option.canvas, setup.coverLayout, personal),
      object: { image: await blobOf(object), region: layerObjectRegion(option.canvas, setup.coverLayout.align) } } : {}) });
  // A version edited in the Editor Visual shows and downloads its saved design (moves, text, brand).
  const edited = selected ? work.documents.get(selected.asset.identity.version_id) ?? null : null;
  const finalPng = async (result: NonNullable<typeof selected>) => {
    const saved = work.documents.get(result.asset.identity.version_id);
    if (saved) return rasterizeHtml(saved.canvas.html, saved.width, saved.height);
    const image = await blobOf(result);
    return composed ? renderFinal(image) : image;
  };
  const [editing, setEditing] = useState<{ versionId: string; document: FreeDesignDocument } | null>(null);
  useEffect(() => {
    if (!(composed || edited) || !selected) return;
    let active = true;
    // The previous render stays visible until the new one is ready, then it is released.
    const timer = setTimeout(() => void (async () => {
      const rendered = await finalPng(selected); if (!active) return;
      const url = URL.createObjectURL(rendered);
      setCoverUrl(previous => { if (previous) URL.revokeObjectURL(previous); return url; });
    })().catch(() => undefined), 250);
    return () => { active = false; clearTimeout(timer); };
  }, [composed, edited?.canvas.revision, edited?.id, selected?.asset.identity.version_id, object?.asset.identity.version_id, overlayText, setup.coverLayout.align, setup.coverLayout.size, setup.coverLayout.color, setup.formatId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load each saved version once; object URLs are released on unmount.
  useEffect(() => {
    for (const result of work.results) {
      const id = result.asset.identity.version_id;
      if (loaded.current.has(id)) continue;
      loaded.current.add(id);
      void work.imageUrl(result).then(url => setUrls(value => ({ ...value, [id]: url }))).catch(() => loaded.current.delete(id));
    }
  }, [work.results]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { setUrls(value => { Object.values(value).forEach(url => URL.revokeObjectURL(url)); return {}; });
    setCoverUrl(previous => { if (previous) URL.revokeObjectURL(previous); return ''; }); }, []);

  const groups = Object.keys(DESIGN_FORMAT_GROUPS) as DesignFormatGroup[];
  const selectedUrl = !selected ? '' : composed || edited ? coverUrl : urls[selected.asset.identity.version_id];
  const layout = (patch: Partial<typeof setup.coverLayout>) => setSetup({ ...setup, coverLayout: { ...setup.coverLayout, ...patch } });
  const approved = selected?.call.state === 'approved';
  // Progress, errors and notices sit next to the buttons that caused them: under the result once a version exists.
  const status = <>
    {work.progress && <p className="ced-progress" role="status"><Loader2 size={15} className="ced-spin" />{work.progress.label}
      <span>{work.progress.done} de {work.progress.total}</span></p>}
    {work.error && <p className="ce-error" role="alert">{work.error}</p>}
    {work.notice && <p className="ced-notice" role="status">{work.notice}</p>}</>;
  return <div className="ced">
    <button type="button" className="ced-back" onClick={() => navigate('/create')}><ArrowLeft size={16} />Crear y editar</button>
    <div className="ced-intro"><div><p className="ce-eyebrow">DISEÑO NUEVO</p><h1>Diseña con tu marca</h1>
      <p>Elige el formato y el estilo, añade tus referencias y crea varias versiones para comparar.</p></div>
      <div className="ced-brand"><span className="ce-brand-dot" style={{ background: work.brand.context?.colors.primary || undefined }} />
        <div><strong>{work.brand.context?.name || 'Marca del negocio'}</strong><span>Este mes en imágenes: {usd(work.monthlySpend)}</span></div></div></div>

    {work.monthlySpend >= MONTHLY_SPEND_WARNING_MICRO_USD && <p className="ced-warning" role="status">
      Este mes ya llevas {usd(work.monthlySpend)} en imágenes (referencia: {usd(MONTHLY_SPEND_WARNING_MICRO_USD)}). Puedes seguir generando.</p>}

    <section className="ced-bar" aria-label="Ajustes del diseño">
      <label className="ced-field"><span>Formato</span>
        <select aria-label="Formato" value={setup.formatId} disabled={disabled} onChange={event => setSetup({ ...setup, formatId: event.target.value as FormatPresetId })}>
          {groups.map(group => <optgroup key={group} label={DESIGN_FORMAT_GROUPS[group]}>{DESIGN_FORMAT_OPTIONS.filter(item => item.group === group).map(item =>
            <option key={item.id} value={item.id}>{item.label} · {item.canvas.width}×{item.canvas.height}</option>)}</optgroup>)}
        </select></label>
      <div className="ced-field"><span id="ced-style-label">Estilo</span>
        <div className="ced-segmented" role="radiogroup" aria-labelledby="ced-style-label">{XENDING_STYLES.map(style => <button key={style} type="button" role="radio"
          aria-checked={setup.style === style} className={setup.style === style ? 'ced-on' : ''} disabled={disabled}
          onClick={() => setSetup({ ...setup, style })}>{XENDING_STYLE_LABELS[style].replace(' Xending', '')}</button>)}</div></div>
      <ImageGenerationControls className="ced-image-controls" value={settings} onChange={setSettings} disabled={disabled}
        availableModels={generation?.profiles?.map(profile => PRESENTATION_IMAGE_MODELS[profile])} availableQualities={generation?.qualities} />
      <label className="ced-field ced-count"><span>Versiones</span>
        <select aria-label="Número de versiones" value={setup.count} disabled={disabled} onChange={event => setSetup({ ...setup, count: Number(event.target.value) })}>
          {Array.from({ length: MAX_DESIGN_VERSIONS }, (_, index) => index + 1).map(count => <option key={count} value={count}>{count}</option>)}</select></label>
    </section>

    <div className="ced-layout">
      <section className="ced-panel ced-brief" aria-label="Contenido del diseño">
        <PresentationReferencePicker items={work.references} onChange={items => work.setReferences(items)} disabled={disabled} maxReferences={3} />
        {work.references.length > 0 && <div className="ced-field"><span id="ced-mode-label">Cómo usar las referencias</span>
          <div className="ced-segmented ced-two" role="radiogroup" aria-labelledby="ced-mode-label">{([['faithful', 'Recrear fiel'], ['vary', 'Variar']] as const).map(([mode, label]) =>
            <button key={mode} type="button" role="radio" aria-checked={setup.referenceMode === mode} className={setup.referenceMode === mode ? 'ced-on' : ''} disabled={disabled}
              onClick={() => setSetup({ ...setup, referenceMode: mode, reading: null })}>{label}</button>)}</div>
          <p className="ced-muted">{setup.referenceMode === 'faithful' ? 'Conserva la distribución de la imagen de Composición y cambia el objeto o mundo por el de la otra imagen.'
            : 'Toma la idea, el texto y el mundo, y propone distribuciones nuevas.'}</p></div>}
        {work.references.length > 0 && <label className="ced-check"><input id="ced-logo" type="checkbox" checked={setup.includeLogo} disabled={disabled}
          onChange={event => setSetup({ ...setup, includeLogo: event.target.checked, reading: null })} />Incluir el logo que aparece en las referencias</label>}
        {work.references.length > 0 && work.readingCurrent && setup.reading && <details className="ced-reading" open>
          <summary>Así entendí tus referencias</summary>
          <textarea aria-label="Plan a partir de las referencias" rows={5} maxLength={6000} value={setup.reading.instruction} disabled={disabled}
            onChange={event => work.setReading(event.target.value)} />
          {setup.reading.notes.length > 0 && <ul>{setup.reading.notes.map(note => <li key={note.position}><strong>Imagen {note.position}:</strong> {note.text}</li>)}</ul>}
          <p className="ced-muted">Puedes corregir este plan; se usa tal cual al crear.</p></details>}
        {work.references.length > 0 && setup.reading && !work.readingCurrent && <p className="ced-muted">Cambiaste las referencias o sus roles: vuelve a analizarlas.</p>}
        <div className="ced-label"><label htmlFor="ced-copy">Texto exacto de la pieza</label>
          {work.references.length > 0 && <button type="button" className="ced-link" disabled={disabled} onClick={() => void work.understand()}>
            <ScanText size={14} />{work.readingCurrent ? 'Volver a analizar' : 'Leer de la imagen'}</button>}</div>
        <textarea id="ced-copy" rows={4} maxLength={4000} value={setup.copy} disabled={disabled || setup.noText}
          placeholder="Escribe aquí el texto tal como debe aparecer: título, subtítulo, URL…" onChange={event => setSetup({ ...setup, copy: event.target.value })} />
        <label className="ced-check"><input id="ced-no-text" type="checkbox" checked={setup.noText} disabled={disabled} onChange={event => setSetup({ ...setup, noText: event.target.checked })} />Sin texto en la imagen</label>
        <label className="ced-check"><input id="ced-layers" type="checkbox" checked={setup.layers} disabled={disabled}
          onChange={event => setSetup({ ...setup, layers: event.target.checked })} />Capas separadas: fondo, objeto y texto por separado</label>
        {setup.layers && <p className="ced-muted">Cada versión crea 2 imágenes: el fondo sin el objeto y el objeto con fondo transparente. En el editor mueves el objeto y el texto por separado.</p>}
        {cover && !setup.noText && !setup.layers && <fieldset className="ced-cover-mode" disabled={disabled}><legend>Texto en la portada</legend>
          <label><input type="radio" name="ced-cover-text" checked={setup.coverText === 'editable'} onChange={() => setSetup({ ...setup, coverText: 'editable' })} />
            <span><strong>Editable</strong> (recomendado): la IA crea el fondo y el texto se coloca exacto encima. Lo cambias sin volver a generar.</span></label>
          <label><input type="radio" name="ced-cover-text" checked={setup.coverText === 'image'} onChange={() => setSetup({ ...setup, coverText: 'image' })} />
            <span><strong>Dentro del diseño</strong>: la IA dibuja el texto con estilo propio (3D, integrado a la escena).</span></label></fieldset>}
        <label className="ced-label" htmlFor="ced-instruction">Qué quieres <span>Opcional</span></label>
        <textarea id="ced-instruction" rows={3} maxLength={8000} value={setup.instruction} disabled={disabled}
          placeholder="Por ejemplo: junta las dos imágenes; composición de la primera y el mundo de la segunda." onChange={event => setSetup({ ...setup, instruction: event.target.value })} />
        {readFirst ? <button type="button" className="ce-primary ced-generate" disabled={disabled || !generation} onClick={() => void work.understand()}>
          {work.busy && work.progress ? <Loader2 size={18} className="ced-spin" /> : <ScanText size={18} />}Analizar referencias</button>
          : <button type="button" className="ce-primary ced-generate" disabled={!canGenerate} onClick={() => void work.generate()}>
            {work.busy && work.progress ? <Loader2 size={18} className="ced-spin" /> : <Sparkles size={18} />}
            {setup.count > 1 ? `Crear ${setup.count} versiones` : 'Crear versión'}</button>}
        {readFirst && <p className="ced-muted">La IA mira cada imagen con detalle: lee el texto (sin logos), decide qué tomar de cada una según su rol y arma el plan. Lo revisas y después creas.
          {canGenerate && <> <button type="button" className="ced-link ced-inline" disabled={disabled} onClick={() => void work.generate()}>Crear sin analizar</button></>}</p>}
        <p className="ced-muted">{!generation ? 'La generación de imágenes no está disponible en este momento.'
          : cover ? 'La IA genera una franja 3:1 y la recortamos al centro a la medida exacta de LinkedIn. Nada se genera hasta que pulses el botón.'
            : 'Nada se genera hasta que pulses el botón. Cada versión se guarda en el servidor.'}</p>
        {!selected && status}
        {(work.blocking.length > 0 || work.error.includes('sigue en proceso')) && <div className="ced-blocking">
          <p>Hay otra imagen de este negocio en proceso. Si lleva varios minutos sin avanzar, descártala para continuar.</p>
          <button type="button" className="ced-button" disabled={work.busy} onClick={() => void work.discardStuck()}>Descartar solicitudes atascadas</button></div>}
      </section>

      <section className="ced-panel ced-result" aria-label="Resultado">
        <div className="ced-preview" style={{ aspectRatio: `${option.canvas.width} / ${option.canvas.height}` }}>
          {selectedUrl ? <img src={selectedUrl} alt="Versión seleccionada del diseño" />
            : <div className="ced-empty">{work.pending.length || work.progress ? <><Loader2 size={28} className="ced-spin" /><p>Creando tu diseño…</p></>
              : <><Sparkles size={28} /><p>Tus versiones aparecerán aquí.</p></>}</div>}
        </div>
        {work.results.length > 0 && <><h2 className="ced-subtitle">Versiones</h2>
          <div className="ced-versions" role="listbox" aria-label="Versiones del diseño">{work.results.map((result, index) => {
            const id = result.asset.identity.version_id, active = selected?.asset.identity.version_id === id;
            return <button key={id} type="button" role="option" aria-selected={active} className={active ? 'ced-version ced-on' : 'ced-version'}
              onClick={() => work.select(result)}>{urls[id] ? <img src={urls[id]} alt={`Versión ${index + 1}`} /> : <Loader2 size={16} className="ced-spin" />}
              <span>V{index + 1}{result.call.state === 'approved' ? ' · aprobada' : result.job.plan.operation.action === 'edit_image' ? ' · ajuste' : ''}
                {work.objects.has(id) ? ' · capas' : ''}{work.documents.has(id) ? ' · editada' : ''}</span></button>;
          })}{work.pending.map(job => <div key={job.operation_key} className="ced-version ced-pending"><Loader2 size={16} className="ced-spin" /><span>En proceso</span></div>)}</div></>}
        {selected && <>
          {edited && <p className="ced-muted">Esta versión tiene cambios guardados en el editor: la vista previa, la descarga y Mockups usan esa versión editada.
            Para cambiar textos o la marca, usa «Seguir editando».</p>}
          {overlayText.trim() && !edited && <div className="ced-cover-layout" role="group" aria-label="Texto sobre la portada">
            <label className="ced-field"><span>Alineación</span><select aria-label="Alineación del texto" value={setup.coverLayout.align} disabled={disabled}
              onChange={event => layout({ align: event.target.value as typeof setup.coverLayout.align })}>
              <option value="left">Izquierda</option><option value="center">Centro</option><option value="right">Derecha</option></select></label>
            <label className="ced-field"><span>Tamaño</span><select aria-label="Tamaño del texto" value={setup.coverLayout.size} disabled={disabled}
              onChange={event => layout({ size: event.target.value as typeof setup.coverLayout.size })}>
              <option value="small">Pequeño</option><option value="medium">Mediano</option><option value="large">Grande</option></select></label>
            <label className="ced-field"><span>Color</span><select aria-label="Color del texto" value={setup.coverLayout.color} disabled={disabled}
              onChange={event => layout({ color: event.target.value as typeof setup.coverLayout.color })}>
              <option value="navy">Navy</option><option value="white">Blanco</option></select></label>
            <label className="ced-field"><span>Palabra en color</span><input aria-label="Palabra del título en color" value={setup.coverLayout.highlight} maxLength={80}
              disabled={disabled} placeholder="Ej.: mundo" onChange={event => layout({ highlight: event.target.value })} /></label>
            <p className="ced-muted">El texto sale de «Texto exacto»: las 2 primeras líneas son el título; una línea en MAYÚSCULAS o con • es la línea de servicios, y un dominio es la URL. Cambiarlo no genera otra imagen.</p></div>}
          <div className="ced-adjust"><label className="ced-label" htmlFor="ced-change">Ajustar la versión elegida</label>
            <div><input id="ced-change" value={change} maxLength={2000} disabled={disabled} placeholder="Ej.: título más grande, quita el avión, fondo más claro…"
              onChange={event => setChange(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && change.trim() && !disabled) void work.edit(selected, change).then(() => setChange('')); }} />
              <button type="button" className="ced-button" disabled={disabled || !change.trim() || !generation} onClick={() => void work.edit(selected, change).then(() => setChange(''))}><Wand2 size={16} />Ajustar</button></div></div>
          <div className="ced-actions">
            <button type="button" className="ced-button" disabled={disabled} onClick={() => work.newDesign()}><Plus size={16} />Nuevo diseño</button>
            <button type="button" className="ced-button" disabled={disabled} onClick={() => void work.refresh()}><RefreshCw size={16} />Actualizar</button>
            <button type="button" className="ced-button" disabled={disabled} onClick={() => void work.download(selected, () => finalPng(selected))}><Download size={16} />Descargar PNG{composed || edited ? ` ${option.canvas.width}×${option.canvas.height}` : ''}</button>
            <button type="button" className="ced-button" disabled={disabled} title="Sube el PNG final a Mockups guardados de Xending Design"
              onClick={() => void work.saveToMockups(selected, () => finalPng(selected))}><ImagePlus size={16} />Guardar en Mockups</button>
            <button type="button" className="ced-button" disabled={disabled || approved} onClick={() => void work.approve(selected)}><Check size={16} />{approved ? 'Aprobada' : 'Aprobar'}</button>
            <button type="button" className="ce-primary" disabled={disabled} title="Mueve, edita textos y monta la marca en el Editor Visual; tus cambios se guardan en esta versión"
              onClick={() => { const versionId = selected.asset.identity.version_id; void work.openInEditor(selected, document => setEditing({ versionId, document })); }}>
              <PencilRuler size={16} />{edited ? 'Seguir editando' : 'Abrir en el editor'}</button>
          </div>
          {status}
          {edited && <p className="ced-muted">«Ajustar» crea una versión nueva a partir de la imagen original; las ediciones del editor se quedan en esta versión.</p>}</>}
      </section>
    </div>
    {editing && <CreateDesignEditor service={service} businessId={businessId} document={editing.document}
      onClose={saved => { work.editorClosed(editing.versionId, saved); setEditing(null); }} />}
  </div>;
}
