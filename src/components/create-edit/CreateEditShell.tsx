import { useState, type ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Copy, Folder, Home, MapPin, Menu, PencilLine, Plus, Presentation, X } from 'lucide-react';
import './create-edit.css';

export interface CreateEditShellProps {
  businessControl: ReactNode;
  ready: boolean;
  freeDesign: boolean;
  materials: boolean;
  /** Breadcrumb trail after "Inicio"; the last item is the current page. */
  trail: { label: string; to?: string }[];
  children: ReactNode;
}
/** Shared frame of Crear y editar: navigation, header and business control. */
export function CreateEditShell({ businessControl, ready, freeDesign, materials, trail, children }: CreateEditShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const { pathname } = useLocation();
  const links = [
    { to: '/create', label: 'Crear y editar', icon: Plus },
    { to: '/assets', label: 'Biblioteca', icon: Folder },
    { to: '/presentations', label: 'Presentaciones', icon: Presentation },
    // The new design screen; existing Diseño libre documents open from Editar.
    ...(freeDesign ? [{ to: '/create/design', label: 'Diseño libre', icon: PencilLine }] : []),
    { to: '/brand-palette', label: 'Marca', icon: MapPin },
    ...(materials ? [{ to: '/materials', label: 'Materiales', icon: Copy }] : []),
  ];
  return <div className="ce-app">
    <a className="ce-skip" href="#ce-main">Ir al contenido</a>
    <aside className={`ce-sidebar ${menuOpen ? 'ce-menu-open' : ''}`} aria-label="Navegación principal">
      <Link className="ce-logo" to="/create" aria-label="ScoryDesign, Crear y editar"><span className="ce-logo-mark" aria-hidden="true"><i /><i /></span><span>Scory<span>Design</span></span></Link>
      <button className="ce-menu-close ce-icon-button" aria-label="Cerrar menú" onClick={() => setMenuOpen(false)}><X size={20} /></button>
      <nav aria-label="Herramientas">{links.map(({ to, label, icon: Icon }) => to !== '/create' && !ready
        ? <span className="ce-nav-disabled" key={to} aria-disabled="true"><Icon size={20} strokeWidth={1.7} />{label}</span>
        : <Link key={to} to={to} onClick={() => setMenuOpen(false)}
          className={pathname === to ? 'ce-nav-active' : ''} aria-current={pathname === to ? 'page' : undefined}><Icon size={20} strokeWidth={1.7} />{label}</Link>)}</nav>
      <div className="ce-sidebar-bottom"><Link to="/"><ArrowLeft size={17} />Inicio actual</Link><p>Tu espacio de diseño</p></div>
    </aside>
    <div className="ce-body">
      <header className="ce-header"><div className="ce-header-start"><button className="ce-menu-toggle ce-icon-button" aria-label="Abrir menú" aria-expanded={menuOpen} onClick={() => setMenuOpen(!menuOpen)}><Menu size={22} /></button>
        <nav className="ce-breadcrumb" aria-label="Ruta"><Home size={16} /> <span>Inicio</span>{trail.map((item, index) => <span key={item.label} className="ce-breadcrumb">
          <ChevronRight size={14} />{index === trail.length - 1 ? <strong aria-current="page">{item.label}</strong> : item.to ? <Link to={item.to}>{item.label}</Link> : <span>{item.label}</span>}</span>)}</nav></div>
        <div className="ce-business">{businessControl}</div>
      </header>
      <main id="ce-main" className="ce-main" tabIndex={-1}>{children}</main>
    </div>
  </div>;
}
