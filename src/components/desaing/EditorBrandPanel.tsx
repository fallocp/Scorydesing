import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Loader2, Trash2, Upload, X } from 'lucide-react';
import { useBrandLogos, useDeleteBrandLogo, useUploadBrandLogo, type BrandLogo } from '@/hooks/useBrandLogos';
import { useBrandDisclaimers, useDeleteBrandDisclaimer, useSaveBrandDisclaimer } from '@/hooks/useBrandDisclaimers';
import { useDeletePromoter, usePromoters, useSavePromoter } from '@/hooks/usePromoters';
import { BRAND_OPTIONS, type BrandKey, type BrandLayerPatch } from '@/utils/design-studio/buildBrandLayerHtml';
import { sampleBottomColor } from '@/utils/design-studio/sampleImageColor';
import { addBrandLayer, backgroundImageSource, hasBrandLayer, patchBrandLayer, readBrandLayer, removeBrandLayer } from '@/lib/desaing/freeBrandLayer';
import './EditorBrandPanel.css';

const message = (problem: unknown, fallback: string) => problem instanceof Error && problem.message ? problem.message : fallback;

/**
 * "Marca" inside the Editor Visual, with the tools of Montar marca (Xending Design): brand, logo library with upload,
 * delete and URL, brand name, saved legal texts, text color, cover for a baked-in disclaimer and the person block.
 * Logo, name and legal text are swapped in place; layout settings rebuild only the brand elements.
 */
export function EditorBrandPanel({ html, width, height, onChange }: {
  html: string; width: number; height: number; onChange(html: string): void;
}) {
  const [initial] = useState(() => readBrandLayer(html));
  // Opens with the tools visible, like Montar marca; the header folds it away from the design.
  const [open, setOpen] = useState(true);
  const [brandKey, setBrandKey] = useState<BrandKey>('xending');
  const { logos, isLoading: loadingLogos } = useBrandLogos(brandKey);
  const uploadLogo = useUploadBrandLogo(), deleteLogo = useDeleteBrandLogo();
  const { data: presets = [], error: presetsError } = useBrandDisclaimers(brandKey);
  const savePreset = useSaveBrandDisclaimer(), deletePreset = useDeleteBrandDisclaimer();
  const { data: promoters = [] } = usePromoters();
  const savePromoter = useSavePromoter(), deletePromoter = useDeletePromoter();
  const [logoUrl, setLogoUrl] = useState<string | null>(initial.logoUrl);
  const [logoDraft, setLogoDraft] = useState('');
  const [wordmark, setWordmark] = useState(initial.wordmark ?? 'Xending');
  const [disclaimer, setDisclaimer] = useState(initial.disclaimer ?? '');
  const [presetLabel, setPresetLabel] = useState('');
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [cover, setCover] = useState<{ heightPct: number; color: string } | null>(null);
  const [person, setPerson] = useState({ photoUrl: '', fullName: '', role: '' });
  const [working, setWorking] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const present = hasBrandLayer(html);
  const htmlRef = useRef(html);
  useEffect(() => { htmlRef.current = html; }, [html]);
  // Prefill the legal text once per brand with its default preset (never over what the user typed).
  const prefilled = useRef<BrandKey | null>(initial.disclaimer ? brandKey : null);
  useEffect(() => {
    if (prefilled.current === brandKey || !presets.length) return;
    prefilled.current = brandKey;
    setDisclaimer(current => current || (presets.find(item => item.is_default) ?? presets[0]).body);
  }, [brandKey, presets]);

  const state = (patch: Partial<{ logoUrl: string | null; wordmark: string; disclaimer: string; theme: 'dark' | 'light';
    cover: typeof cover; person: typeof person }> = {}) => {
    const value = { logoUrl, wordmark, disclaimer, theme, cover, person, ...patch };
    return { width, height, logoUrl: value.logoUrl, wordmark: value.wordmark, disclaimer: value.disclaimer, disclaimerTheme: value.theme,
      cover: value.cover, promoter: value.person.fullName.trim() && value.person.photoUrl ? value.person : null };
  };
  async function work(task: () => Promise<void>) {
    setWorking(true); setError(''); setNotice('');
    try { await task(); } catch (problem) { setError(message(problem, 'No se pudo aplicar el cambio de marca.')); } finally { setWorking(false); }
  }
  /** Rebuilds only the brand elements (their positions reset); the rest of the design is untouched. */
  const rebuild = (patch: Parameters<typeof state>[0]) => work(async () => onChange(await addBrandLayer(htmlRef.current, state(patch))));
  /** Content swaps keep positions; if the element was never mounted, the brand layer is rebuilt. */
  const swap = (patch: BrandLayerPatch, next: Parameters<typeof state>[0]) => {
    if (!hasBrandLayer(htmlRef.current)) return;
    void work(async () => {
      const result = await patchBrandLayer(htmlRef.current, patch);
      onChange(result.missing.length ? await addBrandLayer(htmlRef.current, state(next)) : result.html);
    });
  };
  const layout = (patch: Parameters<typeof state>[0]) => { if (hasBrandLayer(htmlRef.current)) void rebuild(patch); };

  function selectLogo(url: string | null) { setLogoUrl(url); swap({ logoUrl: url }, { logoUrl: url }); }
  function selectBrand(key: BrandKey) {
    const name = BRAND_OPTIONS.find(item => item.key === key)?.wordmark ?? '';
    setBrandKey(key); setWordmark(name); swap({ wordmark: name }, { wordmark: name });
  }
  const upload = (file: File | undefined, kind: 'logo' | 'person') => file && void work(async () => {
    const url = await uploadLogo.mutateAsync({ file, brandKey, kind: kind === 'logo' ? 'logo' : 'promoter' });
    if (kind === 'logo') selectLogo(url);
    else { const next = { ...person, photoUrl: url }; setPerson(next); layout({ person: next }); }
  });
  const removeLogo = (logo: BrandLogo) => {
    if (!window.confirm(`¿Borrar "${logo.name}"? Se elimina del storage y no se puede recuperar.`)) return;
    void work(async () => { await deleteLogo.mutateAsync(logo); if (logoUrl === logo.url) selectLogo(null); });
  };
  const sampleCover = () => void work(async () => {
    const source = backgroundImageSource(htmlRef.current);
    const color = (source && await sampleBottomColor(source)) || '#FFFFFF';
    const next = { heightPct: cover?.heightPct ?? 9, color }; setCover(next); layout({ cover: next });
  });

  // The buttons show at the top and again at the bottom of the long panel; the status only at the top.
  const buttons = <div className="ebp-actions">
    <button type="button" className="ebp-primary" disabled={working} onClick={() => void rebuild({})}>{present ? 'Reponer marca' : 'Agregar marca'}</button>
    {present && <button type="button" disabled={working} onClick={() => onChange(removeBrandLayer(htmlRef.current))}><Trash2 size={13} />Quitar marca</button>}</div>;
  return <aside className="ebp" aria-label="Montar marca">
    <button type="button" className="ebp-toggle" aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span>Montar marca<small className="ebp-hint"> · logo, disclaimer, persona</small></span>
      {working && <Loader2 size={14} className="ebp-spin" />}<ChevronDown size={16} className={open ? '' : 'ebp-up'} /></button>
    {open && <div className="ebp-body">
      <p className="ebp-note">Elige el logo y pulsa «{present ? 'Reponer marca' : 'Agregar marca'}». Después lo mueves y ajustas en el lienzo.
        Pulsa «Aplicar» antes de cambiar la marca para conservar lo que moviste.</p>
      <div className="ebp-chips">{BRAND_OPTIONS.map(option => <button key={option.key} type="button" aria-pressed={brandKey === option.key}
        className={brandKey === option.key ? 'ebp-on' : ''} onClick={() => selectBrand(option.key)}>{option.label}</button>)}</div>
      {error && <p className="ebp-error" role="alert">{error}</p>}
      {notice && <p className="ebp-note" role="status">{notice}</p>}
      {buttons}

      <div className="ebp-row"><strong>Logo</strong><label className="ebp-link"><Upload size={13} />Subir
        <input type="file" accept="image/*" hidden onChange={event => { upload(event.target.files?.[0], 'logo'); event.target.value = ''; }} /></label></div>
      {loadingLogos ? <p className="ebp-note">Cargando logos…</p> : <div className="ebp-logos">
        <button type="button" aria-pressed={!logoUrl} className={!logoUrl ? 'ebp-on' : ''} onClick={() => selectLogo(null)}>Sin logo</button>
        {logos.map(logo => <span key={logo.url} className="ebp-logo">
          <button type="button" aria-pressed={logoUrl === logo.url} title={logo.name} className={logoUrl === logo.url ? 'ebp-on' : ''} onClick={() => selectLogo(logo.url)}>
            <img src={logo.url} alt={logo.name} /></button>
          {logo.deletable && <button type="button" className="ebp-x" aria-label={`Borrar ${logo.name}`} onClick={() => removeLogo(logo)}><X size={11} /></button>}</span>)}</div>}
      <div className="ebp-inline"><input aria-label="URL del logo" value={logoDraft} placeholder="…o pega la URL del logo" onChange={event => setLogoDraft(event.target.value)} />
        <button type="button" disabled={!/^https:\/\//i.test(logoDraft.trim())} onClick={() => { selectLogo(logoDraft.trim()); setLogoDraft(''); }}>Usar</button></div>

      <label className="ebp-field">Nombre de marca<input aria-label="Nombre de marca" value={wordmark} maxLength={80} placeholder="Vacío para solo el logo"
        onChange={event => setWordmark(event.target.value)} onBlur={() => swap({ wordmark }, { wordmark })} /></label>

      <div className="ebp-field"><strong>Disclaimer</strong>
        {presetsError && <p className="ebp-error">No pude leer los textos guardados: {presetsError.message}</p>}
        {presets.length > 0 && <div className="ebp-chips">{presets.map(preset => <span key={preset.id} className="ebp-preset">
          <button type="button" className={disclaimer === preset.body ? 'ebp-on' : ''} onClick={() => { setDisclaimer(preset.body); swap({ disclaimer: preset.body }, { disclaimer: preset.body }); }}>{preset.label}</button>
          <button type="button" className="ebp-x" aria-label={`Quitar ${preset.label}`} onClick={() => void work(async () => { await deletePreset.mutateAsync(preset.id); })}><X size={11} /></button></span>)}</div>}
        <textarea aria-label="Disclaimer" rows={3} maxLength={1200} value={disclaimer} onChange={event => setDisclaimer(event.target.value)}
          onBlur={() => swap({ disclaimer }, { disclaimer })} />
        <div className="ebp-inline"><input aria-label="Nombre del texto guardado" value={presetLabel} maxLength={60} placeholder="Nombre para guardarlo (ej.: TC)"
          onChange={event => setPresetLabel(event.target.value)} />
          <button type="button" disabled={!presetLabel.trim() || !disclaimer.trim()} onClick={() => void work(async () => {
            await savePreset.mutateAsync({ brandKey, label: presetLabel.trim(), body: disclaimer.trim() }); setPresetLabel(''); setNotice('Texto guardado.'); })}>Guardar</button></div>
        <div className="ebp-chips">{(['dark', 'light'] as const).map(value => <button key={value} type="button" aria-pressed={theme === value}
          className={theme === value ? 'ebp-on' : ''} onClick={() => { setTheme(value); layout({ theme: value }); }}>{value === 'dark' ? 'Texto oscuro' : 'Texto blanco'}</button>)}</div></div>

      <div className="ebp-field"><div className="ebp-row"><strong>Tapar disclaimer original</strong>
        {cover ? <button type="button" className="ebp-link" onClick={() => { setCover(null); layout({ cover: null }); }}>Quitar</button>
          : <button type="button" className="ebp-link" onClick={sampleCover}>Activar</button>}</div>
        {cover && <div className="ebp-inline"><input type="range" aria-label="Altura de la franja" min={3} max={25} value={cover.heightPct}
          onChange={event => setCover({ ...cover, heightPct: Number(event.target.value) })} onPointerUp={() => layout({ cover })} onKeyUp={() => layout({ cover })} />
          <input type="color" aria-label="Color de la franja" value={cover.color} onChange={event => { const next = { ...cover, color: event.target.value }; setCover(next); layout({ cover: next }); }} /></div>}</div>

      <div className="ebp-field"><div className="ebp-row"><strong>Persona (opcional)</strong><label className="ebp-link"><Upload size={13} />Foto
        <input type="file" accept="image/*" hidden onChange={event => { upload(event.target.files?.[0], 'person'); event.target.value = ''; }} /></label></div>
        {promoters.length > 0 && <div className="ebp-chips">{promoters.map(promoter => <span key={promoter.id} className="ebp-preset">
          <button type="button" className={person.fullName === promoter.full_name ? 'ebp-on' : ''} onClick={() => {
            const next = { photoUrl: promoter.photo_url ?? '', fullName: promoter.full_name, role: promoter.role ?? '' }; setPerson(next); layout({ person: next }); }}>{promoter.full_name}</button>
          <button type="button" className="ebp-x" aria-label={`Quitar ${promoter.full_name}`} onClick={() => deletePromoter.mutate(promoter.id)}><X size={11} /></button></span>)}</div>}
        <input aria-label="Nombre de la persona" value={person.fullName} placeholder="Nombre" onChange={event => setPerson({ ...person, fullName: event.target.value })} onBlur={() => layout({ person })} />
        <input aria-label="Rol de la persona" value={person.role} placeholder="Rol" onChange={event => setPerson({ ...person, role: event.target.value })} onBlur={() => layout({ person })} />
        {person.photoUrl && <div className="ebp-row"><img className="ebp-avatar" src={person.photoUrl} alt="" />
          <button type="button" className="ebp-link" onClick={() => { const next = { ...person, photoUrl: '' }; setPerson(next); layout({ person: next }); }}>Quitar foto</button></div>}
        <button type="button" className="ebp-link" disabled={!person.fullName.trim()} onClick={() => void work(async () => {
          const existing = promoters.find(item => item.full_name === person.fullName.trim());
          await savePromoter.mutateAsync({ id: existing?.id, fullName: person.fullName.trim(), role: person.role, photoUrl: person.photoUrl || null });
          setNotice(existing ? 'Persona actualizada.' : 'Persona guardada.'); })}>Guardar esta persona como promotor</button>
        {person.fullName.trim() && !person.photoUrl && <p className="ebp-note">Añade una foto para mostrar a la persona en el diseño.</p>}</div>

      {buttons}
    </div>}
  </aside>;
}
