import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Upload, X } from 'lucide-react';
import { useBrandLogos, useUploadBrandLogo } from '@/hooks/useBrandLogos';
import { readDesignLogo } from '@/lib/presentations/designLogo';
import './DesignLogoPicker.css';

export interface DesignLogoSelection { source: string; name: string }
export function DesignLogoPicker({ businessId, onSelect, onClose }: {
  businessId: string; onSelect(logo: DesignLogoSelection): Promise<void>; onClose(): void;
}) {
  const { logos, allLogos, isLoading, error: loadingError } = useBrandLogos(businessId);
  const upload = useUploadBrandLogo();
  const [all, setAll] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const closeButton = useRef<HTMLButtonElement>(null), fileInput = useRef<HTMLInputElement>(null), lock = useRef(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; const previous = document.activeElement as HTMLElement | null; closeButton.current?.focus();
    return () => { alive.current = false; previous?.focus(); }; }, []);
  async function choose(source: string | File, name: string) {
    if (lock.current) return; lock.current = true; setBusy(true); setError('');
    try {
      const data = await readDesignLogo(source);
      if (!alive.current) return;
      if (source instanceof File) await upload.mutateAsync({ file: source, brandKey: businessId, kind: 'logo' });
      if (!alive.current) return;
      await onSelect({ source: data, name });
      if (alive.current) onClose();
    } catch (problem) { if (alive.current) setError(problem instanceof Error ? problem.message : 'No se pudo añadir el logo.'); }
    finally { lock.current = false; if (alive.current) setBusy(false); }
  }
  const visible = all ? allLogos : logos;
  return <div className="dlp-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <section className="dlp-dialog" role="dialog" aria-modal="true" aria-label="Elegir logo" aria-busy={busy}
      onKeyDown={event => { if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
        if (event.key === 'Tab') { const nodes = Array.from(event.currentTarget.querySelectorAll<HTMLElement>('button:not([disabled]),input:not([disabled])')).filter(node => node.tabIndex >= 0 && !node.hidden && node.getClientRects().length > 0);
          const first = nodes[0], last = nodes.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } } }}>
      <header><div><h3><ImagePlus size={20} /> Logos</h3><p>Elige uno o sube el archivo original. Después puedes moverlo y cambiar su tamaño en el editor.</p></div>
        <button ref={closeButton} type="button" aria-label="Cerrar logos" disabled={busy} onClick={onClose}><X size={20} /></button></header>
      <div className="dlp-toolbar"><button type="button" disabled={busy} onClick={() => fileInput.current?.click()}><Upload size={16} />Subir logo</button>
        <input ref={fileInput} hidden type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/avif" aria-label="Archivo de logo" disabled={busy}
          onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void choose(file, file.name); }} />
        {allLogos.length > logos.length && <button type="button" disabled={busy} aria-pressed={all} onClick={() => setAll(value => !value)}>{all ? 'Logos de esta marca' : 'Ver todos los logos'}</button>}</div>
      {isLoading ? <p className="dlp-status" role="status">Cargando logos…</p> : visible.length ? <div className="dlp-grid">{visible.map(logo =>
        <button key={`${logo.bucket}:${logo.path}`} type="button" className="dlp-logo" disabled={busy} onClick={() => void choose(logo.url, logo.name)}>
          <span><img src={logo.url} alt="" /></span><span>{logo.name}</span></button>)}</div> : <p className="dlp-status">Aún no hay logos disponibles. Sube el que quieras usar.</p>}
      {busy && <p className="dlp-status" role="status"><Loader2 size={17} className="dlp-spinner" />Guardando el logo en tu diseño…</p>}
      {(error || loadingError) && <p className="dlp-error" role="alert">{error || 'No se pudo cargar la galería. Puedes subir tu logo.'}</p>}
    </section>
  </div>;
}
