import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Layers3, RefreshCw } from 'lucide-react';
import type { AssetVersion } from '../../../supabase/functions/_shared/desaing/contracts';
import type { IdeaSelection } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import './VisualProposalGallery.css';

export interface VisualProposalGalleryItem {
  id: string;
  title: string;
  selection: IdeaSelection;
  status: string;
  statusLabel: string;
  canGenerate: boolean;
  isLatest: boolean;
  asset?: AssetVersion;
  operationKey?: string;
  directionApproved: boolean;
  combined: boolean;
  instruction: string;
  model?: string;
  referenceCount: number;
  reservedMicroUsd?: number;
  accountedMicroUsd?: number;
}
export interface VisualProposalGalleryProps {
  items: VisualProposalGalleryItem[];
  busy: boolean;
  ready: boolean;
  error: string;
  remainingOutputs: number;
  enabled: boolean;
  simulation?: boolean;
  loadPreview(asset: AssetVersion): Promise<string>;
  onGenerate(candidateIds: string[]): void;
  onRecover(): void;
  onReview(item: VisualProposalGalleryItem): void;
  onAdjust(selection: IdeaSelection): void;
}
const assetKey = (asset: AssetVersion) => JSON.stringify([asset.business_id, asset.asset_id, asset.version_id]);
const money = (micros: number) => new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'USD',
  minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(micros / 1_000_000);

/** Shared visual review surface. Selection, previews and review never dispatch images. */
export function VisualProposalGallery(props: VisualProposalGalleryProps) {
  const [picked, setPicked] = useState<string[]>([]);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [previewError, setPreviewError] = useState(false);
  const loaded = useRef<Record<string, string>>({});
  const assets = props.items.flatMap(item => item.asset ? [item.asset] : []);
  const identities = JSON.stringify(assets.map(assetKey));
  useEffect(() => {
    let active = true;
    setPreviewError(false);
    const unique = [...new Map(assets.map(asset => [assetKey(asset), asset])).values()];
    void Promise.all(unique.filter(asset => !loaded.current[assetKey(asset)]).map(async asset => {
      try {
        const url = await props.loadPreview(asset);
        if (active) { loaded.current[assetKey(asset)] = url; setPreviews({ ...loaded.current }); }
      } catch { if (active) setPreviewError(true); }
    }));
    return () => { active = false; };
  }, [identities, props.loadPreview]);
  const eligible = props.items.filter(item => item.canGenerate);
  const selected = picked.filter(id => eligible.some(item => item.id === id));
  const enough = selected.length > 0 && selected.length <= 5 && selected.length <= props.remainingOutputs;
  const available = props.enabled && props.ready && !props.busy;
  return <section className="vpg-panel" data-testid="visual-proposals-gallery" aria-label="Propuestas visuales" aria-busy={props.busy}>
    <div className="vpg-heading"><div><span className="vpg-eyebrow">De la idea al borrador</span><h3>Propuestas visuales</h3></div><Layers3 size={22} aria-hidden="true" /></div>
    <p className="vpg-intro">Elige las ideas que quieres ver. Cada borrador crea una imagen; los resultados guardados se conservan al ajustar otra propuesta.</p>
    {props.simulation && <p className="vpg-note">Prueba simulada con imágenes de muestra, sin cargos.</p>}
    <div className="vpg-toolbar">
      <button type="button" className="mip-button" disabled={props.busy || !eligible.length}
        onClick={() => setPicked(eligible.slice(0, 5).map(item => item.id))}>Seleccionar pendientes</button>
      <button type="button" className="mip-button mip-button-primary" disabled={!available || !enough}
        onClick={() => props.onGenerate([...selected])}><ImagePlus size={16} aria-hidden="true" />Generar borradores seleccionados ({selected.length})</button>
      <button type="button" className="mip-button" disabled={props.busy} onClick={props.onRecover}>
        <RefreshCw size={15} aria-hidden="true" />Recuperar propuestas</button>
    </div>
    <p className="vpg-note" role="status">{selected.length} seleccionadas · {props.remainingOutputs} generaciones disponibles.
      {selected.length > props.remainingOutputs ? ' Elige menos propuestas para respetar el cupo disponible.' : ' Hasta cinco borradores por acción.'}</p>
    {!props.enabled && <p className="vpg-note">La generación está pausada. Puedes consultar y revisar las propuestas guardadas.</p>}
    {(props.error || previewError) && <p className="vpg-error" role="alert">{props.error || 'No se pudo cargar una vista previa. Puedes recuperar la propuesta para consultar su archivo.'}</p>}
    <div className="vpg-grid">{props.items.map(item => {
      const preview = item.asset && previews[assetKey(item.asset)];
      return <article key={item.id} className={`vpg-card${selected.includes(item.id) ? ' vpg-card-picked' : ''}`}
        data-testid="visual-proposal-card" data-candidate-id={item.id} data-status={item.status} data-idea-version={item.selection.version}>
        <div className="vpg-picture">{preview ? <img src={preview} alt={`Borrador de ${item.title}, versión ${item.selection.version}`} />
          : <div className="vpg-placeholder"><ImagePlus size={27} aria-hidden="true" /><span>{item.asset ? 'Cargando borrador…' : item.canGenerate ? 'Idea lista para visualizar' : item.statusLabel}</span></div>}</div>
        <div className="vpg-card-body"><div className="vpg-card-meta"><span>{item.combined ? 'Combinación' : 'Propuesta'} · v{item.selection.version}</span>
          {item.directionApproved && <span><Check size={12} aria-hidden="true" />Dirección elegida</span>}</div>
          <h4>{item.title}</h4><p className="vpg-status">{item.statusLabel}{!item.isLatest ? ' · Versión anterior' : ''}</p>
          {item.canGenerate && <label className="vpg-pick"><input type="checkbox" disabled={props.busy || !props.ready || (selected.length >= 5 && !selected.includes(item.id))}
            aria-label={`Generar ${item.title}, versión ${item.selection.version}`} checked={selected.includes(item.id)}
            onChange={event => setPicked(previous => event.target.checked ? [...new Set([...previous, item.id])] : previous.filter(id => id !== item.id))} />Incluir este borrador</label>}
          <div className="vpg-actions">{item.asset && <button type="button" className="mip-button mip-button-primary" disabled={props.busy}
            onClick={() => props.onReview(item)}>Revisar borrador</button>}
            <button type="button" className="mip-button" disabled={props.busy || !item.isLatest} onClick={() => props.onAdjust(item.selection)}>Ajustar idea</button></div>
          <details className="vpg-details"><summary>Encargo y consumo</summary><p className="vpg-prompt">{item.instruction}</p>
            <p>{item.referenceCount} referencias guardadas{item.model ? ` · ${item.model}` : ''}.</p>
            {item.accountedMicroUsd !== undefined ? <p>Consumo contabilizado: {money(item.accountedMicroUsd)}.</p>
              : item.reservedMicroUsd !== undefined ? <p>Reserva conservada: {money(item.reservedMicroUsd)}. El costo final está pendiente.</p>
              : <p>{item.operationKey ? 'Solicitud guardada; consulta su estado para confirmar el consumo.' : 'Sin generación solicitada.'}</p>}</details>
        </div>
      </article>;
    })}</div>
    <p className="vpg-note">Revisar un borrador permite elegir su dirección. La versión en media y la aprobación final se solicitan por separado.</p>
  </section>;
}
