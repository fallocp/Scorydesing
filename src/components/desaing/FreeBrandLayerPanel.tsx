import { useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { useBrandLogos } from '@/hooks/useBrandLogos';
import { useBrandDisclaimers } from '@/hooks/useBrandDisclaimers';
import { BRAND_OPTIONS, type BrandKey } from '@/utils/design-studio/buildBrandLayerHtml';
import { addBrandLayer } from '@/lib/desaing/freeBrandLayer';
import type { FreeDesignDocument } from '@/lib/desaing/freeDesignDocument';
import './FreeBrandLayerPanel.css';

/** Capa de marca for Diseño libre: the same logos, disclaimers and lockup as Xending Design, added as editable elements. */
export function FreeBrandLayerPanel({ document, onApply, onClose }: {
  document: FreeDesignDocument; onApply(html: string): Promise<void>; onClose(): void;
}) {
  const [brandKey, setBrandKey] = useState<BrandKey>('xending');
  const { logos, isLoading } = useBrandLogos(brandKey);
  const { data: presets = [] } = useBrandDisclaimers(brandKey);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [wordmark, setWordmark] = useState('Xending');
  const [disclaimer, setDisclaimer] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const defaultPreset = useMemo(() => presets.find(item => item.is_default) ?? null, [presets]);
  function selectBrand(key: BrandKey) { setBrandKey(key); setWordmark(BRAND_OPTIONS.find(item => item.key === key)?.wordmark ?? ''); setDisclaimer(''); setLogoUrl(null); }
  async function add() {
    setBusy(true); setError('');
    try {
      await onApply(await addBrandLayer(document.canvas.html, { width: document.width, height: document.height, logoUrl, wordmark, disclaimer, disclaimerTheme: theme }));
    } catch (problem) { setError(problem instanceof Error && /\s/.test(problem.message) ? problem.message : 'No se pudo agregar la capa de marca. Tu diseño se conserva.'); }
    finally { setBusy(false); }
  }
  const empty = !logoUrl && !wordmark.trim() && !disclaimer.trim();
  return <div className="fbl-backdrop" role="dialog" aria-modal="true" aria-labelledby="fbl-title"><section className="fbl-panel">
    <header><div><h2 id="fbl-title">Capa de marca</h2><p>Logo, nombre de marca y disclaimer de Xending Design. Se agregan como elementos que mueves y editas en el Editor Visual.</p></div>
      <button type="button" className="fbl-icon" aria-label="Cerrar" disabled={busy} onClick={onClose}><X size={18} /></button></header>
    <div className="fbl-body">
      <fieldset><legend>Marca</legend><div className="fbl-chips">{BRAND_OPTIONS.map(option => <button key={option.key} type="button" aria-pressed={brandKey === option.key}
        className={brandKey === option.key ? 'fbl-on' : ''} disabled={busy} onClick={() => selectBrand(option.key)}>{option.label}</button>)}</div></fieldset>
      <fieldset><legend>Logo</legend>
        {isLoading ? <p className="fbl-note">Cargando logos…</p> : <div className="fbl-logos">
          <button type="button" aria-pressed={logoUrl === null} className={logoUrl === null ? 'fbl-on' : ''} disabled={busy} onClick={() => setLogoUrl(null)}>Sin logo</button>
          {logos.map(logo => <button key={logo.url} type="button" aria-pressed={logoUrl === logo.url} title={logo.name} className={logoUrl === logo.url ? 'fbl-on' : ''}
            disabled={busy} onClick={() => setLogoUrl(logo.url)}><img src={logo.url} alt={logo.name} /></button>)}</div>}
        {!isLoading && !logos.length && <p className="fbl-note">No hay logos en la biblioteca de marca. Súbelos desde la Capa de marca de Xending Design.</p>}</fieldset>
      <label>Nombre de marca<input value={wordmark} maxLength={80} disabled={busy} onChange={event => setWordmark(event.target.value)} placeholder="Vacío para solo el logo" /></label>
      <fieldset><legend>Disclaimer</legend>
        {presets.length > 0 && <div className="fbl-chips">{presets.map(preset => <button key={preset.id} type="button" disabled={busy}
          className={disclaimer === preset.body ? 'fbl-on' : ''} onClick={() => setDisclaimer(preset.body)}>{preset.label}</button>)}
          <button type="button" disabled={busy} className={!disclaimer ? 'fbl-on' : ''} onClick={() => setDisclaimer('')}>Sin disclaimer</button></div>}
        <textarea rows={3} maxLength={1200} value={disclaimer} disabled={busy} onChange={event => setDisclaimer(event.target.value)}
          placeholder={defaultPreset ? 'Elige un texto legal guardado o escríbelo' : 'Texto legal (opcional)'} />
        <label className="fbl-inline"><input type="checkbox" checked={theme === 'light'} disabled={busy} onChange={event => setTheme(event.target.checked ? 'light' : 'dark')} />Texto blanco (para fondos oscuros)</label>
      </fieldset>
      {error && <p className="fbl-error" role="alert">{error}</p>}
    </div>
    <footer><button type="button" className="fd-button" disabled={busy} onClick={onClose}>Cancelar</button>
      <button type="button" className="fd-button fd-primary" disabled={busy || empty} onClick={() => void add()}>{busy ? 'Agregando…' : 'Agregar y abrir el editor'}</button></footer>
  </section></div>;
}
