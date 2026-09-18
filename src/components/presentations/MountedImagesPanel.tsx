import { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Link2, Loader2, Upload, X } from 'lucide-react';
import type { PresentationSlide } from '../../lib/presentations/presentationDocument';
import { getSlideDimensions } from '../../lib/presentations/presentationDocument';
import { extractPresentationAsset, importPresentationAsset, listPresentationAssets, mountPresentationAsset, readPresentationAsset, validatePresentationRaster } from '../../lib/presentations/presentationAssets';
import type { PixelExtractionRecipe } from '../../lib/presentations/presentationExtraction';
import { ManualExtractionEditor } from './ManualExtractionEditor';
import { composePresentationImage, sanitizePresentationHtml } from '../../lib/presentations/presentationHtml';
import { imageDataUrl } from '../../lib/desaing/labImages';
import './MountedImagesPanel.css';

export interface MountedImagesPanelProps {
  businessId: string;
  documentId: string;
  slide: PresentationSlide;
  onApply: (next: PresentationSlide) => void;
  onClose: () => void;
}

type LibraryAsset = Awaited<ReturnType<typeof listPresentationAssets>>[number];
type Region = { x: number; y: number; width: number; height: number };
type Selection = { kind: 'library'; item: LibraryAsset }
  | { kind: 'file'; file: File; previewUrl: string; width: number; height: number };

function message(error: unknown): string {
  const value = error instanceof Error ? error.message : '';
  const known: Record<string, string> = {
    slide_revision_conflict: 'La diapositiva cambió mientras preparabas la imagen. Cierra este panel y revisa la versión actual.',
    slide_not_found: 'La diapositiva ya no está disponible. Vuelve a seleccionar el destino.',
    business_mismatch: 'La imagen pertenece a otro negocio. Selecciona una imagen de esta biblioteca.',
    unapproved_asset: 'La imagen necesita revisión antes de montarla.',
    invalid_mounted_region: 'Revisa la posición y el tamaño de la imagen.',
    indexed_db_unavailable: 'Este navegador no permite abrir la biblioteca local.',
  };
  if (known[value]) return known[value];
  return value && !/^[a-z0-9_]+$/i.test(value) ? value : 'No se pudo completar el cambio. Tu diapositiva se conserva.';
}

function fitRegion(region: Region, canvas: { width: number; height: number }): Region {
  const width = Math.min(canvas.width, Math.max(1, region.width));
  const height = Math.min(canvas.height, Math.max(1, region.height));
  return { width, height, x: Math.max(0, Math.min(region.x, canvas.width - width)),
    y: Math.max(0, Math.min(region.y, canvas.height - height)) };
}

function rasterDataUrl(value: string): boolean {
  return /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}

export function MountedImagesPanel({ businessId, documentId, slide, onApply, onClose }: MountedImagesPanelProps) {
  const canvas = useMemo(() => getSlideDimensions(slide.html), [slide.html]);
  const safeHtml = useMemo(() => sanitizePresentationHtml(slide.html), [slide.html]);
  const [library, setLibrary] = useState<LibraryAsset[]>([]);
  const [selection, setSelection] = useState<Selection | null>(null);
  const [extracting, setExtracting] = useState(false);
  const [region, setRegion] = useState<Region>({ x: canvas.width * .54, y: canvas.height * .18,
    width: canvas.width * .4, height: canvas.height * .64 });
  const [keepRatio, setKeepRatio] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availableWidth, setAvailableWidth] = useState(700);
  const fileInput = useRef<HTMLInputElement>(null);
  const previewContainer = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);
  const locked = useRef(false);
  const operation = useRef(0);
  const ownedUrl = useRef<string | null>(null);
  const latestTarget = useRef({ businessId, documentId, slideId: slide.id, revision: slide.revision });
  latestTarget.current = { businessId, documentId, slideId: slide.id, revision: slide.revision };

  useEffect(() => {
    alive.current = true;
    const previousFocus = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    return () => {
      alive.current = false;
      operation.current++;
      if (ownedUrl.current) URL.revokeObjectURL(ownedUrl.current);
      previousFocus?.focus();
    };
  }, []);

  useEffect(() => {
    let current = true;
    operation.current++;
    locked.current = false;
    setSelection(null); setExtracting(false); setLibrary([]); setLoading(true); setError(null); setBusy(false);
    if (ownedUrl.current) { URL.revokeObjectURL(ownedUrl.current); ownedUrl.current = null; }
    setRegion({ x: canvas.width * .54, y: canvas.height * .18, width: canvas.width * .4, height: canvas.height * .64 });
    listPresentationAssets(businessId).then(items => {
      if (current) setLibrary(items.filter(item => item.version.identity.business_id === businessId && rasterDataUrl(item.dataUrl)));
    }).catch(problem => { if (current) setError(message(problem)); })
      .finally(() => { if (current) setLoading(false); });
    return () => { current = false; };
  }, [businessId, documentId, slide.id]);

  useEffect(() => { setRegion(current => fitRegion(current, canvas)); }, [canvas.width, canvas.height]);
  useEffect(() => {
    const element = previewContainer.current;
    if (!element) return;
    const measure = () => setAvailableWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const selectedDimensions = selection?.kind === 'file'
    ? { width: selection.width, height: selection.height }
    : selection?.item.version.storage;
  const ratio = selectedDimensions ? selectedDimensions.width / selectedDimensions.height : region.width / region.height;
  const previewUrl = selection?.kind === 'file' ? selection.previewUrl : selection?.item.dataUrl;
  const previewElementId = useMemo(() => `mounted-preview-${crypto.randomUUID()}`, []);
  const previewHtml = useMemo(() => previewUrl
    ? composePresentationImage(safeHtml, previewUrl, region, previewElementId,
      selection?.kind === 'library' ? selection.item.version.identity : undefined)
    : safeHtml, [safeHtml, previewUrl, region, previewElementId, selection]);
  const scale = Math.min(Math.max(1, availableWidth) / canvas.width, 500 / canvas.height, 1);

  function selectImage(next: Selection) {
    if (ownedUrl.current && (next.kind !== 'file' || next.previewUrl !== ownedUrl.current)) {
      URL.revokeObjectURL(ownedUrl.current); ownedUrl.current = null;
    }
    const dimensions = next.kind === 'file' ? next : next.item.version.storage;
    const aspect = dimensions.width / dimensions.height;
    setSelection(next); setExtracting(false); setError(null);
    if (keepRatio) setRegion(current => {
      let width = Math.min(current.width, canvas.width), height = width / aspect;
      if (height > canvas.height) { height = canvas.height; width = height * aspect; }
      return fitRegion({ ...current, width, height }, canvas);
    });
  }

  async function chooseFile(file: File | undefined) {
    if (!file || busy || locked.current) return;
    const request = ++operation.current;
    locked.current = true;
    setBusy(true); setError(null);
    let url: string | null = null;
    try {
      const { width, height, mimeType } = await validatePresentationRaster(file);
      const inlinePreview = await imageDataUrl(file.slice(0, file.size, mimeType));
      if (!alive.current || operation.current !== request) return;
      // An opaque-origin sandbox cannot reliably read a parent-owned Blob URL.
      url = inlinePreview;
      selectImage({ kind: 'file', file, previewUrl: url, width, height });
      url = null;
    } catch (problem) { if (alive.current && operation.current === request) setError(message(problem)); }
    finally {
      if (url) URL.revokeObjectURL(url);
      if (alive.current && operation.current === request) { locked.current = false; setBusy(false); }
    }
  }

  function setDimension(key: keyof Region, value: number) {
    if (!Number.isFinite(value)) return;
    setRegion(current => {
      const next = { ...current, [key]: value };
      if (keepRatio && (key === 'width' || key === 'height')) {
        if (key === 'width') next.height = next.width / ratio;
        else next.width = next.height * ratio;
        const factor = Math.min(1, canvas.width / Math.max(next.width, 1), canvas.height / Math.max(next.height, 1));
        next.width *= factor; next.height *= factor;
      }
      return fitRegion(next, canvas);
    });
  }

  async function mount() {
    if (!selection || busy || locked.current) return;
    const captured = { businessId, documentId, slideId: slide.id, revision: slide.revision };
    const sourceSlide = structuredClone(slide), targetRegion = structuredClone(region), chosen = selection;
    const request = ++operation.current;
    locked.current = true;
    setBusy(true); setError(null);
    try {
      const item = chosen.kind === 'library' ? chosen.item : await importPresentationAsset(captured.businessId, chosen.file);
      const next = await mountPresentationAsset(captured.businessId, sourceSlide, item.version, item.dataUrl, targetRegion, captured.revision);
      if (!alive.current || operation.current !== request) return;
      const live = latestTarget.current;
      if (live.businessId !== captured.businessId || live.documentId !== captured.documentId
        || live.slideId !== captured.slideId || live.revision !== captured.revision) {
        throw new Error('La diapositiva cambió mientras preparabas la imagen. Cierra el panel y revisa el destino antes de montarla.');
      }
      await onApply(next);
      onClose();
    } catch (problem) { if (alive.current && operation.current === request) setError(message(problem)); }
    finally { if (alive.current && operation.current === request) { locked.current = false; setBusy(false); } }
  }

  async function saveExtraction(recipe: PixelExtractionRecipe) {
    if (!selection || busy || locked.current) return;
    const captured = { businessId, documentId, slideId: slide.id, revision: slide.revision }, chosen = selection;
    const request = ++operation.current;
    locked.current = true; setBusy(true); setError(null);
    const isCurrent = () => alive.current && operation.current === request
      && JSON.stringify(latestTarget.current) === JSON.stringify(captured);
    try {
      const source = chosen.kind === 'library' ? chosen.item : await importPresentationAsset(captured.businessId, chosen.file);
      if (!isCurrent()) return;
      const extracted = await extractPresentationAsset(captured.businessId, source.version, recipe);
      if (!isCurrent()) return;
      setLibrary(current => [...current.filter(item => item.version.identity.version_id !== source.version.identity.version_id), source, extracted]);
      selectImage({ kind: 'library', item: extracted });
    } catch (problem) { if (isCurrent()) setError(message(problem)); }
    finally { if (alive.current && operation.current === request) { locked.current = false; setBusy(false); } }
  }

  return <div className="mip-backdrop" onKeyDown={event => {
    if (event.key === 'Escape' && !busy) { event.preventDefault(); onClose(); }
    if (event.key === 'Tab') {
      const elements = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? []);
      const first = elements[0], last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}>
    <div className="mip-dialog" ref={dialog} role="dialog" aria-modal="true" aria-labelledby="mip-title" aria-describedby="mip-description" aria-busy={busy}>
      <header className="mip-header">
        <div><h2 id="mip-title"><ImagePlus size={21} aria-hidden="true" />Añadir imágenes montadas</h2>
          <p id="mip-description">Elige una pieza y colócala sobre la diapositiva. El texto seguirá siendo editable.</p></div>
        <button className="mip-icon-button" ref={closeButton} type="button" aria-label="Cerrar panel" disabled={busy} onClick={onClose}><X size={20} aria-hidden="true" /></button>
      </header>
      <div className="mip-body">
        <aside className="mip-library">
          <div className="mip-section-heading"><h3>Tu biblioteca</h3><span>PNG · JPEG · WebP</span></div>
          <p className="mip-note">Biblioteca local de este negocio.</p>
          <input className="mip-file-input" ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" disabled={busy}
            onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; void chooseFile(file); }} aria-label="Seleccionar imagen PNG, JPEG o WebP" />
          <button className="mip-button mip-upload" type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} aria-hidden="true" />Subir una imagen</button>
          {selection?.kind === 'file' && <div className="mip-file-choice"><Check size={15} aria-hidden="true" /><span>{selection.file.name}</span><small>Se guardará al montar.</small></div>}
          {loading ? <p className="mip-empty" role="status"><Loader2 className="mip-spin" size={19} aria-hidden="true" />Cargando imágenes…</p>
            : library.length ? <div className="mip-gallery">{library.map((item, index) => {
              const identity = item.version.identity;
              const selected = selection?.kind === 'library' && selection.item.version.identity.asset_id === identity.asset_id
                && selection.item.version.identity.version_id === identity.version_id;
              return <button className="mip-library-item" type="button" key={`${identity.asset_id}:${identity.version_id}`} disabled={busy}
                aria-pressed={selected} aria-label={`Usar imagen guardada ${index + 1}`} onClick={() => selectImage({ kind: 'library', item })}>
                <img src={item.dataUrl} alt={`Imagen guardada ${index + 1}`} />
                <span>{item.version.storage.width} × {item.version.storage.height}{item.version.provenance.kind === 'pixel_extraction' ? ' · Extracción manual' : ''}</span>
                {selected && <Check className="mip-selected-check" size={16} aria-hidden="true" />}
              </button>;
            })}</div> : <div className="mip-empty"><ImagePlus size={30} aria-hidden="true" /><strong>La primera pieza empieza aquí.</strong><span>Sube una imagen para usarla en esta diapositiva y reutilizarla después.</span></div>}
        </aside>
        <section className="mip-workspace" aria-label="Colocación de la imagen">
          {selection && selectedDimensions && previewUrl && <div className="mip-extraction-launch">
            {!extracting && <button className="mip-button" type="button" disabled={busy} onClick={() => setExtracting(true)}>Extraer pieza manualmente</button>}
            {extracting && <ManualExtractionEditor sourceUrl={previewUrl} width={selectedDimensions.width} height={selectedDimensions.height} disabled={busy}
              readSource={() => selection.kind === 'file' ? Promise.resolve(selection.file) : readPresentationAsset(businessId, selection.item.version)}
              onSave={saveExtraction} onCancel={() => setExtracting(false)} />}
          </div>}
          <div className="mip-section-heading"><h3>{slide.title || 'Diapositiva'}</h3><span>{canvas.width} × {canvas.height} px</span></div>
          <div ref={previewContainer} className="mip-preview-container">
            <div className="mip-preview" style={{ width: canvas.width * scale, height: canvas.height * scale }}>
              <iframe title="Vista previa de la diapositiva" sandbox="" tabIndex={-1} srcDoc={previewHtml}
                width={canvas.width} height={canvas.height} style={{ width: canvas.width, height: canvas.height, transform: `scale(${scale})` }} />
              <div className="mip-region" aria-hidden="true" style={{ left: region.x * scale, top: region.y * scale,
                width: region.width * scale, height: region.height * scale, background: previewUrl ? 'transparent' : undefined }}>
                {!previewUrl && <span>Tu imagen aquí</span>}
              </div>
            </div>
          </div>
          <div className="mip-controls">
            <div className="mip-section-heading"><h3>Posición y tamaño</h3><label className="mip-ratio"><input type="checkbox" checked={keepRatio} disabled={busy}
              onChange={event => { setKeepRatio(event.target.checked); if (event.target.checked && selectedDimensions) {
                const aspect = selectedDimensions.width / selectedDimensions.height;
                setRegion(current => {
                  const height = Math.min(canvas.height, current.width / aspect);
                  return fitRegion({ ...current, height, width: height * aspect }, canvas);
                });
              } }} /><Link2 size={13} aria-hidden="true" />Conservar proporción</label></div>
            <div className="mip-numeric-grid">{([
              ['x', 'Izquierda'], ['y', 'Arriba'], ['width', 'Ancho'], ['height', 'Alto'],
            ] as const).map(([key, label]) => <label key={key}><span>{label} <small>px</small></span>
              <input type="number" value={Math.round(region[key])} min={key === 'x' || key === 'y' ? 0 : 1}
                max={key === 'x' || key === 'width' ? canvas.width : canvas.height} step={1} disabled={busy}
                onChange={event => { if (event.target.value !== '') setDimension(key, Number(event.target.value)); }} />
            </label>)}</div>
            <label className="mip-size"><span>Tamaño en el lienzo <strong>{Math.round(region.width / canvas.width * 100)}%</strong></span>
              <input type="range" min={5} max={100} step={1} value={region.width / canvas.width * 100} disabled={busy}
                onChange={event => setDimension('width', canvas.width * Number(event.target.value) / 100)} /></label>
            <p className="mip-note">La pieza conserva sus píxeles. Colocar, mover o escalar no genera otra imagen.</p>
          </div>
        </section>
      </div>
      <footer className="mip-footer">
        <div>{error && <p className="mip-error" role="alert">{error}</p>}{!error && <p className="mip-note">Montar guarda la pieza elegida y su posición en esta versión.</p>}</div>
        <button className="mip-button mip-button-primary" type="button" disabled={busy || !selection || extracting} onClick={() => void mount()}>
          {busy ? <Loader2 className="mip-spin" size={17} aria-hidden="true" /> : <ImagePlus size={17} aria-hidden="true" />}
          {busy ? 'Preparando imagen…' : 'Montar imagen'}
        </button>
      </footer>
    </div>
  </div>;
}

export default MountedImagesPanel;
