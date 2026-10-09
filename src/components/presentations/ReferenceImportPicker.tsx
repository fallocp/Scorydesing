import { useEffect, useRef, useState } from 'react';
import { FileUp, Link2 } from 'lucide-react';
import { importReferencePages, prepareImportedPages, referenceImportFile, referenceImportUrl, referencePageNumbers,
  type ReferenceImportResult, type ReferenceImportSource } from '../../lib/presentations/referenceImport';
import { PRESENTATION_REFERENCE_ROLES, type PreparedPresentationReference, type PresentationReferenceRole } from '../../lib/presentations/presentationReferences';
import './ReferenceImportPicker.css';

export interface ReferenceImportPickerProps {
  businessId: string;
  remaining: number;
  disabled?: boolean;
  onImport(items: PreparedPresentationReference[]): Promise<void>;
  onBusyChange?(busy: boolean): void;
}
const labels: Record<PresentationReferenceRole, string> = { object_reference: 'Objeto o persona', image_style_reference: 'Estilo visual',
  layout_reference: 'Composición', content_source: 'Texto y contenido', brand_reference: 'Marca y paleta' };

/** Real rendered document pages become ordinary image references, with the same persistence and roles. */
export function ReferenceImportPicker({ businessId, remaining, disabled, onImport, onBusyChange }: ReferenceImportPickerProps) {
  const [open, setOpen] = useState(false), [url, setUrl] = useState(''), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [source, setSource] = useState<ReferenceImportSource | null>(null), [result, setResult] = useState<ReferenceImportResult | null>(null);
  const [selected, setSelected] = useState<number[]>([]), [start, setStart] = useState(1);
  const [role, setRole] = useState<PresentationReferenceRole>('image_style_reference');
  const controller = useRef<AbortController | null>(null), alive = useRef(true), locked = useRef(false);
  const latest = useRef({ disabled, remaining, businessId, onImport, onBusyChange }); latest.current = { disabled, remaining, businessId, onImport, onBusyChange };
  useEffect(() => { alive.current = true; return () => { alive.current = false; controller.current?.abort(); latest.current.onBusyChange?.(false); }; }, []);
  useEffect(() => { setSelected(previous => previous.slice(0, Math.max(0, remaining))); }, [remaining]);
  useEffect(() => { controller.current?.abort(); setSource(null); setResult(null); setSelected([]); setError(''); }, [businessId]);
  async function run(action: (signal: AbortSignal) => Promise<void>) {
    if (locked.current || latest.current.disabled) return;
    locked.current = true; controller.current = new AbortController(); setBusy(true); setError(''); latest.current.onBusyChange?.(true);
    try { await action(controller.current.signal); }
    catch (problem) { if (alive.current && !controller.current.signal.aborted) setError(problem instanceof Error ? problem.message : 'No se pudo importar la referencia.'); }
    finally { locked.current = false; if (alive.current) { setBusy(false); latest.current.onBusyChange?.(false); } }
  }
  async function load(next: ReferenceImportSource, signal: AbortSignal, nextStart = 1, total?: number) {
    const capturedBusiness = latest.current.businessId;
    const data = await importReferencePages(capturedBusiness, next, true, total ? referencePageNumbers(nextStart, total) : undefined, signal);
    if (!alive.current || signal.aborted || capturedBusiness !== latest.current.businessId) return;
    setSource(next); setResult(data); setStart(nextStart);
  }
  const blocked = Boolean(disabled || busy), capacity = Math.max(0, Math.min(3, remaining));
  return <section className="rip-picker" aria-label="Importar referencias de documentos o páginas" aria-busy={busy}>
    <button type="button" className="rip-toggle" disabled={blocked || capacity === 0} onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <FileUp size={15} aria-hidden="true" />Importar PDF, PPTX o página web
    </button>
    {open && <div className="rip-panel">
      <label className={`rip-file${blocked ? ' rip-disabled' : ''}`}><FileUp size={15} aria-hidden="true" />Abrir PDF o presentación completa
        <input type="file" accept=".pdf,.pptx,application/pdf,application/vnd.openxmlformats-officedocument.presentationml.presentation" disabled={blocked || capacity === 0}
          aria-label="Abrir PDF o PPTX como referencia" onChange={event => { const file = event.target.files?.[0]; event.target.value = '';
            if (file) void run(async signal => { const next = await referenceImportFile(file); setSelected([]); await load(next, signal); }); }} />
      </label>
      <p className="rip-note">Hasta 16 MB y 100 páginas. Elige las páginas que guiarán este diseño.</p>
      <div className="rip-url"><input type="url" aria-label="Enlace de referencia" placeholder="https://marca.com" value={url} disabled={blocked}
        onChange={event => setUrl(event.target.value)} /><button type="button" title="Ver página web" aria-label="Ver página web" disabled={blocked || !url.trim() || capacity === 0}
          onClick={() => void run(async signal => { const next = referenceImportUrl(url); setSelected([]); await load(next, signal); })}><Link2 size={16} /></button></div>
      {busy && <p role="status">Preparando las páginas…</p>}
      {result && source && <>
        <p className="rip-title">{result.name} · {result.pageCount} {source.kind === 'web' ? 'segmentos' : 'páginas'}</p>
        {result.notice && <p className="rip-note">{result.notice}</p>}
        <div className="rip-grid">{result.pages.map(page => <label key={page.number} className={`rip-page${selected.includes(page.number) ? ' rip-selected' : ''}`}>
          <img src={`data:image/png;base64,${page.pngBase64}`} alt={`Página ${page.number} de ${result.name}`} />
          <span><input type="checkbox" checked={selected.includes(page.number)} disabled={blocked || !selected.includes(page.number) && selected.length >= capacity}
            onChange={event => setSelected(previous => event.target.checked ? [...previous, page.number].sort((a, b) => a - b) : previous.filter(value => value !== page.number))} />Página {page.number}</span>
        </label>)}</div>
        <div className="rip-pagination"><button type="button" disabled={blocked || start <= 1} onClick={() => void run(signal => load(source, signal, start - 6, result.pageCount))}>Anterior</button>
          <span>{start}–{Math.min(start + 5, result.pageCount)} de {result.pageCount}</span>
          <button type="button" disabled={blocked || start + 6 > result.pageCount} onClick={() => void run(signal => load(source, signal, start + 6, result.pageCount))}>Siguiente</button></div>
        <label className="rip-role">Usar las páginas como<select value={role} disabled={blocked} onChange={event => setRole(event.target.value as PresentationReferenceRole)}>
          {PRESENTATION_REFERENCE_ROLES.map(value => <option key={value} value={value}>{labels[value]}</option>)}
        </select></label>
        <button type="button" className="rip-confirm" disabled={blocked || !selected.length || selected.length > capacity} onClick={() => void run(async signal => {
          const capturedBusiness = latest.current.businessId;
          const pages = await importReferencePages(capturedBusiness, source, false, selected, signal);
          const prepared = await prepareImportedPages(pages, role);
          if (!alive.current || signal.aborted || capturedBusiness !== latest.current.businessId) return;
          if (prepared.length > latest.current.remaining) throw new Error('Cambió el espacio disponible. Selecciona menos páginas.');
          await latest.current.onImport(prepared);
          if (alive.current) { setSelected([]); setOpen(false); }
        })}>Añadir {selected.length || ''} {selected.length === 1 ? 'página' : 'páginas'} de referencia</button>
        <p className="rip-note">{selected.length} seleccionadas · {capacity} espacios disponibles. Después puedes cambiar el uso de cada una.</p>
      </>}
      {error && <p className="rip-error" role="alert">{error}</p>}
    </div>}
  </section>;
}
