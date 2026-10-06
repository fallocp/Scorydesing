import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronRight, Copy, Folder, Image, LayoutTemplate, Newspaper, PencilLine, Plus, Presentation, Sparkles, TrendingUp } from 'lucide-react';
import { originLabels, type CreateEntry, type EntryOrigin, type PieceKind } from '@/lib/create-edit/entry';
import { CreateEditShell } from './CreateEditShell';

export interface CreateEditHomeProps {
  businessName: string;
  brandName?: string;
  businessControl: ReactNode;
  ready: boolean;
  freeDesign: boolean;
  materials: boolean;
  onboarding: boolean;
  entry: CreateEntry;
  onChange: (entry: CreateEntry) => void;
  onOpen: () => void;
  error?: string;
}
const pieces = [
  { key: 'image', title: 'Imagen', text: 'Una idea, un copy y el estilo de tu marca.', icon: Image, detail: 'Publicaciones y visuales' },
  { key: 'carousel', title: 'Carrusel', text: 'Del copy a la historia. Después, cada lámina.', icon: Copy, detail: 'Contenido en secuencia' },
  { key: 'presentation', title: 'Presentación', text: 'Explora el diseño y llévalo al editor.', icon: Presentation, detail: 'Diapositivas editables' },
  { key: 'free', title: 'Diseño libre', text: 'Dale forma a una portada, página o idea.', icon: PencilLine, detail: 'Portadas y páginas' },
] as const;
const origins = [
  { key: 'new', text: 'Partir de una idea', icon: Plus },
  { key: 'template', text: 'Personalizar una base', icon: LayoutTemplate },
  { key: 'edit', text: 'Retomar o regenerar', icon: PencilLine },
] as const;

export function CreateEditHome(props: CreateEditHomeProps) {
  const { entry, onChange, ready } = props;
  const selectedPiece = pieces.find(piece => piece.key === entry.piece)!;
  const blocked = !ready || entry.piece === 'free' && !props.freeDesign;
  const setOrigin = (origin: EntryOrigin) => onChange({ ...entry, origin });
  const setPiece = (piece: PieceKind) => onChange({ ...entry, piece });
  return <CreateEditShell businessControl={props.businessControl} ready={ready} freeDesign={props.freeDesign} materials={props.materials}
    trail={[{ label: 'Crear y editar' }]}>
        <div className="ce-intro"><div><p className="ce-eyebrow">TU PRÓXIMA IDEA, EN MARCHA</p><h1>¿Qué vamos a crear?</h1><p>Empieza con una idea o sigue donde lo dejaste.</p></div>
          <div className="ce-brand"><span className="ce-brand-dot" /><div><strong>{props.businessName}</strong><span>{props.brandName || 'Selecciona tu negocio para comenzar'}</span></div></div>
        </div>
        <div className="ce-origins" role="group" aria-label="Cómo quieres empezar">{origins.map(({ key, text, icon: Icon }) => <button key={key} disabled={!ready}
          className={entry.origin === key ? 'ce-origin ce-selected' : 'ce-origin'} aria-pressed={entry.origin === key} onClick={() => setOrigin(key)}>
          <span className="ce-origin-icon"><Icon size={21} /></span><span><strong>{originLabels[key]}</strong><small>{text}</small></span><span className="ce-radio" aria-hidden="true" /></button>)}</div>

        <section className="ce-workspace" aria-labelledby="ce-piece-title">
          <div className="ce-section-heading"><div><h2 id="ce-piece-title">{entry.origin === 'edit' ? '¿Qué quieres editar?' : 'Elige el tipo de pieza'}</h2><p>El formato y el estilo se eligen dentro de cada herramienta.</p></div><span className="ce-step-label">{originLabels[entry.origin]}</span></div>
          <div className="ce-pieces" role="group" aria-label="Tipo de pieza">{pieces.map(({ key, title, text, icon: Icon, detail }) => <button key={key}
            disabled={!ready || key === 'free' && !props.freeDesign} aria-pressed={entry.piece === key} onClick={() => setPiece(key)}
            className={`ce-piece ce-${key} ${entry.piece === key ? 'ce-selected' : ''}`}>
            <span className="ce-piece-top"><span className="ce-app-icon"><Icon size={28} strokeWidth={1.6} /></span><span className="ce-piece-arrow"><ChevronRight size={17} /></span></span>
            <strong>{title}</strong><span className="ce-piece-description">{text}</span>
            <span className={`ce-piece-art ce-art-${key}`} aria-hidden="true"><i /><i /><i /><b /></span>
            <small>{key === 'free' && !props.freeDesign ? 'No habilitado en este entorno' : detail}</small>
          </button>)}</div>
          {entry.origin === 'template' ? <div className="ce-template-note"><LayoutTemplate size={24} /><div><h3>Primero, una base real</h3>
            <p>El catálogo de bases de este espacio está por preparar. Para Presentaciones, comenzaremos con el diseño Xending existente y guardaremos su estilo como base.</p>
            <button className="ce-text-button" onClick={() => setOrigin('edit')}>Abrir un trabajo existente <ArrowRight size={16} /></button></div></div>
            : <div className="ce-brief"><label htmlFor="ce-intention"><Sparkles size={18} />{entry.origin === 'edit' ? '¿Qué te gustaría ajustar?' : 'Cuéntanos tu idea'} <span>Opcional</span></label>
              <textarea id="ce-intention" disabled={!ready} maxLength={8000} value={entry.brief} onChange={event => onChange({ ...entry, brief: event.target.value })}
                placeholder={entry.origin === 'edit' ? 'Por ejemplo: ajustar el texto y conservar el diseño…' : 'Por ejemplo: un carrusel sobre pagos internacionales, con estilo Navy…'} rows={2} />
              <div className="ce-brief-footer"><p>{entry.origin === 'edit' ? 'Elige el trabajo en su biblioteca o editor.' : 'Tus indicaciones te acompañan al abrir la herramienta.'}</p>
                <button className="ce-primary" disabled={blocked} onClick={props.onOpen}>{entry.origin === 'edit' ? 'Buscar' : 'Continuar con'} {selectedPiece.title.toLowerCase()} <ArrowRight size={18} /></button></div>
            </div>}
          {!ready && <p className="ce-notice">Selecciona un negocio en la cabecera para empezar.</p>}
          {props.error && <p role="alert" className="ce-error">{props.error}</p>}
        </section>
        <section className="ce-quick" aria-labelledby="ce-quick-title"><div className="ce-section-heading"><div><h2 id="ce-quick-title">¿Ya sabes a dónde ir?</h2><p>Tus herramientas y procesos de siempre.</p></div></div>
          <div className="ce-shortcuts">{[
            { to: '/design-studio?tab=studio', label: 'Studio', text: 'Copys, estilos e imágenes', icon: Sparkles },
            { to: '/design-studio?tab=news', label: 'Xending News', text: 'Tu edición editorial', icon: Newspaper },
            { to: '/design-studio?tab=fx-daily', label: 'Daily Report', text: 'Tu reporte de siempre', icon: TrendingUp },
            { to: '/assets', label: 'Biblioteca', text: 'Imágenes y diseños guardados', icon: Folder },
          ].map(({ to, label, text, icon: Icon }) => ready ? <Link key={label} to={to}><Icon size={21} strokeWidth={1.6} /><span><strong>{label}</strong><small>{text}</small></span><ChevronRight size={16} /></Link>
            : <div key={label} className="ce-shortcut-disabled"><Icon size={21} /><span><strong>{label}</strong><small>{text}</small></span></div>)}</div>
        </section>
        <footer className="ce-footer"><span>Ideas claras. Diseños con tu identidad.</span>{props.onboarding && ready && <Link to="/onboarding">Configurar marca <ArrowRight size={14} /></Link>}</footer>
  </CreateEditShell>;
}
