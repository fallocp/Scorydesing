import { useEffect, useRef, useState } from 'react';
import { ImagePlus, X } from 'lucide-react';
import { addPresentationReference, preparePresentationReference, PRESENTATION_REFERENCE_ROLES,
  type PreparedPresentationReference, type PresentationReferenceRole } from '../../lib/presentations/presentationReferences';
import './PresentationReferencePicker.css';

export interface PresentationReferencePickerProps {
  items: PreparedPresentationReference[];
  onChange(items: PreparedPresentationReference[]): void | Promise<void>;
  disabled?: boolean;
  maxReferences?: number;
  onBusyChange?(busy: boolean): void;
  conversationReadsImages?: boolean;
  defaultRole?: PresentationReferenceRole;
}
const labels: Record<PresentationReferenceRole, string> = {
  object_reference: 'Objeto o persona', image_style_reference: 'Estilo visual', layout_reference: 'Composición',
  content_source: 'Texto y contenido', brand_reference: 'Marca',
};
const roleHelp: Record<PresentationReferenceRole, string> = {
  content_source: 'Aporta las palabras y los datos. Conserva el estilo de la base elegida.',
  image_style_reference: 'Aporta tipografía, colores y tratamiento visual; adapta el contenido aprobado.',
  layout_reference: 'Guía la distribución, proporciones y posición de los elementos.',
  brand_reference: 'Aporta la identidad visual de la marca indicada.',
  object_reference: 'Muestra el objeto o la persona que debe aparecer.',
};
/** Local files only; previews and roles never upload or call an image/text model. */
export function PresentationReferencePicker({ items, onChange, disabled = false, maxReferences = 3, onBusyChange, conversationReadsImages, defaultRole = 'object_reference' }: PresentationReferencePickerProps) {
  const [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const latest = useRef({ items, onChange, disabled, maxReferences }); latest.current = { items, onChange, disabled, maxReferences };
  const alive = useRef(true), locked = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const urls = Object.fromEntries(items.map(item => [item.id, URL.createObjectURL(item.blob)])); setPreviews(urls);
    return () => Object.values(urls).forEach(url => URL.revokeObjectURL(url));
  }, [items]);
  async function change(action: () => Promise<PreparedPresentationReference[]>) {
    if (locked.current || latest.current.disabled) return;
    locked.current = true; setBusy(true); onBusyChange?.(true); setError('');
    try {
      const before = latest.current.items, next = await action();
      if (!alive.current) return;
      if (latest.current.disabled || latest.current.items !== before) throw new Error('Las referencias cambiaron. Vuelve a seleccionar el archivo.');
      await latest.current.onChange(next);
    } catch (problem) { if (alive.current) setError(problem instanceof Error && !/^[a-z_]+$/.test(problem.message)
      ? problem.message : 'No se pudo guardar la referencia. Usa una imagen PNG, JPEG o WebP de hasta 8 MB y respeta el límite indicado.'); }
    finally { locked.current = false; if (alive.current) { setBusy(false); onBusyChange?.(false); } }
  }
  const limit = Math.max(0, Math.min(3, maxReferences)), blocked = disabled || busy;
  return <section className="prp-picker" aria-label="Referencias adicionales" aria-busy={busy} data-testid="presentation-reference-picker">
    <div className="prp-heading"><h3>Referencias adicionales</h3><span>{items.length} / {limit}</span></div>
    <p>Añade una imagen y elige qué tomar de ella: texto, estilo, composición, marca u objetos.</p>
    <label className={`prp-add${blocked || items.length >= limit ? ' prp-add-disabled' : ''}`}>
      <ImagePlus size={16} aria-hidden="true" />Añadir referencia
      <input type="file" accept="image/png,image/jpeg,image/webp" aria-label="Añadir referencia visual" disabled={blocked || items.length >= limit}
        onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void change(async () =>
          addPresentationReference(latest.current.items, await preparePresentationReference(file, defaultRole), limit)); }} />
    </label>
    {items.length > 0 && <ul className="prp-list">{items.map((item, index) => <li key={item.id} data-testid="presentation-reference-item" data-reference-id={item.id}>
      {previews[item.id] && <img src={previews[item.id]} alt={`Referencia: ${item.name}`} />}
      <div className="prp-detail"><span className="prp-name" title={item.name}>Imagen {index + 1} · {item.name}</span>
        <select aria-label={`Uso de ${item.name}`} value={item.role} disabled={blocked} onChange={event => {
          const role = event.target.value as PresentationReferenceRole;
          void change(async () => latest.current.items.map(value => value.id === item.id ? { ...value, role } : value));
        }}>{PRESENTATION_REFERENCE_ROLES.map(role => <option key={role} value={role}>{labels[role]}</option>)}</select>
        <p className="prp-note">{roleHelp[item.role]}</p></div>
      <button type="button" className="prp-remove" aria-label={`Quitar ${item.name}`} disabled={blocked}
        onClick={() => void change(async () => latest.current.items.filter(value => value.id !== item.id))}><X size={15} aria-hidden="true" /></button>
    </li>)}</ul>}
    <p className="prp-note">{conversationReadsImages ? 'Al enviar un mensaje, el agente lee estas imágenes. Puedes decir «el texto de la primera y el mundo de la segunda».' : 'Estas imágenes se usan al generar el diseño.'}</p>
    {error && <p role="alert" className="prp-error">{error}</p>}
  </section>;
}
