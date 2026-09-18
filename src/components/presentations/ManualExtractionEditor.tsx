import { useEffect, useRef, useState } from 'react';
import { assertPixelExtractionRecipe } from '../../../supabase/functions/_shared/desaing/pixelExtraction';
import { extractPresentationPixels, type PixelExtractionRecipe } from '../../lib/presentations/presentationExtraction';
import { imageDataUrl } from '../../lib/desaing/labImages';

interface Props {
  sourceUrl: string; width: number; height: number; disabled: boolean;
  readSource: () => Promise<Blob>;
  onSave: (recipe: PixelExtractionRecipe) => Promise<void>;
  onCancel: () => void;
}

export function ManualExtractionEditor({ sourceUrl, width, height, disabled, readSource, onSave, onCancel }: Props) {
  const [mode, setMode] = useState<'rectangle' | 'polygon'>('rectangle');
  const [crop, setCrop] = useState({ x: 0, y: 0, width, height });
  const [points, setPoints] = useState<{ x: number; y: number }[]>([]);
  const [review, setReview] = useState<{ url: string; recipe: PixelExtractionRecipe } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const nonce = useRef(0), alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; nonce.current++; }; }, []);

  function change(edit: () => void) {
    if (disabled || locked.current) return;
    nonce.current++; setReview(null); setError(null); edit();
  }
  function currentRecipe(): PixelExtractionRecipe {
    if (mode === 'rectangle') return { crop: { ...crop }, mask: { kind: 'rectangle' } };
    const xs = points.map(point => point.x), ys = points.map(point => point.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return { crop: { x, y, width: Math.max(...xs) - x, height: Math.max(...ys) - y }, mask: { kind: 'polygon', points: structuredClone(points) } };
  }
  async function preview() {
    if (disabled || locked.current) return;
    const request = ++nonce.current;
    locked.current = true; setBusy(true); setError(null); setReview(null);
    try {
      const recipe = currentRecipe();
      assertPixelExtractionRecipe(recipe, { width, height });
      const blob = await extractPresentationPixels(await readSource(), recipe);
      const url = await imageDataUrl(blob);
      if (alive.current && nonce.current === request) setReview({ recipe, url });
    } catch (problem) {
      if (alive.current && nonce.current === request) setError(problem instanceof Error && !/^[a-z0-9_]+$/i.test(problem.message)
        ? problem.message : mode === 'polygon' ? 'Marca al menos tres puntos distintos, sin cruzar el contorno.' : 'El recorte debe quedar dentro de la imagen, con medidas enteras mayores que cero.');
    } finally { if (alive.current && nonce.current === request) { locked.current = false; setBusy(false); } }
  }
  const pending = disabled || busy;
  return <section className="mip-extraction" data-testid="manual-extraction" aria-label="Extracción manual de píxeles" aria-busy={pending}>
    <div className="mip-section-heading"><h3>Extraer pieza manualmente</h3><button className="mip-button" type="button" disabled={pending} onClick={onCancel}>Volver al montaje</button></div>
    <p className="mip-note">Recorta un rectángulo o marca el contorno del objeto. Se conservan los píxeles seleccionados; el contorno elimina lo que queda fuera. No usa IA.</p>
    <div className="mip-extraction-actions" role="group" aria-label="Tipo de extracción">
      <button className="mip-button" type="button" disabled={pending} aria-pressed={mode === 'rectangle'} onClick={() => change(() => setMode('rectangle'))}>Recorte rectangular</button>
      <button className="mip-button" type="button" disabled={pending} aria-pressed={mode === 'polygon'} onClick={() => change(() => setMode('polygon'))}>Contorno con transparencia</button>
    </div>
    <div className="mip-extraction-source">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Imagen original y contorno manual" onPointerDown={event => {
        if (mode !== 'polygon' || pending || points.length >= 128) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = Math.max(0, Math.min(width, Math.round((event.clientX - rect.left) / rect.width * width)));
        const y = Math.max(0, Math.min(height, Math.round((event.clientY - rect.top) / rect.height * height)));
        change(() => setPoints(current => [...current, { x, y }]));
      }}>
        <image href={sourceUrl} width={width} height={height} />
        {mode === 'rectangle' ? <rect {...crop} className="mip-extraction-outline" vectorEffect="non-scaling-stroke" /> : <>
          <polygon points={points.map(point => `${point.x},${point.y}`).join(' ')} className="mip-extraction-outline" vectorEffect="non-scaling-stroke" />
          {points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={Math.max(width, height) / 150} fill="#176b5f" stroke="white" strokeWidth={Math.max(width, height) / 450} />)}
        </>}
      </svg>
    </div>
    {mode === 'rectangle' ? <div className="mip-numeric-grid">{([
      ['x', 'Recorte izquierda'], ['y', 'Recorte arriba'], ['width', 'Recorte ancho'], ['height', 'Recorte alto'],
    ] as const).map(([key, label]) => <label key={key}><span>{label}</span><input type="number" aria-label={label} value={crop[key]} step={1}
      min={key === 'x' || key === 'y' ? 0 : 1} max={key === 'x' || key === 'width' ? width : height} disabled={pending}
      onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) change(() => setCrop(current => ({ ...current, [key]: Math.round(value) }))); }} /></label>)}</div>
      : <><p className="mip-note">Toca la imagen para añadir puntos alrededor del objeto, en orden. También puedes ajustar sus coordenadas aquí. El borde será nítido, sin suavizado.</p>
        <div className="mip-extraction-points">{points.map((point, index) => <div className="mip-extraction-point" key={index}><span>{index + 1}</span>{(['x', 'y'] as const).map(key => <label key={key}><span>{key.toUpperCase()}</span>
          <input aria-label={`Punto ${index + 1} ${key}`} type="number" value={point[key]} min={0} max={key === 'x' ? width : height} step={1} disabled={pending}
            onChange={event => { const value = Number(event.target.value); if (Number.isFinite(value)) change(() => setPoints(current => current.map((item, i) => i === index ? { ...item, [key]: Math.round(value) } : item))); }} /></label>)}
          <button className="mip-button" type="button" aria-label={`Quitar punto ${index + 1}`} disabled={pending} onClick={() => change(() => setPoints(current => current.filter((_, i) => i !== index)))}>×</button></div>)}</div>
        <div className="mip-extraction-actions"><button className="mip-button" type="button" disabled={pending || points.length >= 128} onClick={() => change(() => setPoints(current => [...current, { x: Math.floor(width / 2), y: Math.floor(height / 2) }]))}>Añadir punto por coordenadas</button>
          <button className="mip-button" type="button" disabled={pending || !points.length} onClick={() => change(() => setPoints([]))}>Borrar contorno</button></div></>}
    <div className="mip-extraction-actions"><button className="mip-button" type="button" disabled={pending || mode === 'polygon' && points.length < 3} onClick={() => void preview()}>{busy ? 'Preparando recorte…' : 'Revisar extracción'}</button></div>
    {error && <p className="mip-error" role="alert">{error}</p>}
    {review && <div className="mip-extraction-review" data-testid="manual-extraction-review"><h4>Revisa la pieza antes de guardarla</h4><img src={review.url} alt="Vista previa de los píxeles extraídos" />
      <p className="mip-note">{review.recipe.crop.width} × {review.recipe.crop.height} px · PNG. El patrón de cuadros indica transparencia real.</p>
      <div className="mip-extraction-actions"><button className="mip-button mip-button-primary" type="button" disabled={pending} onClick={() => void onSave(structuredClone(review.recipe))}>Guardar pieza revisada</button>
        <a className="mip-button" href={review.url} download="pieza-extraida.png">Descargar PNG</a></div></div>}
  </section>;
}
