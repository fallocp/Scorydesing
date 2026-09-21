import type { ReactNode } from 'react';
import type { DemoState, GlyphName, ViewName } from '../types';
import { AppIcon, BrandMark, Glyph } from './Icons';
const nav: {id:string; label:string; icon:GlyphName; view?:ViewName}[] = [
  {id:'home',label:'Inicio',icon:'home',view:'home'}, {id:'create',label:'Crear',icon:'create',view:'create'},
  {id:'library',label:'Biblioteca',icon:'library',view:'library'}, {id:'presentations',label:'Presentaciones',icon:'presentation',view:'editor'},
  {id:'free',label:'Diseño libre',icon:'pen'}, {id:'brand',label:'Marca y materiales',icon:'brand',view:'brand'},
  {id:'projects',label:'Proyectos',icon:'projects'}, {id:'templates',label:'Plantillas',icon:'templates'},
];
export function Sidebar({state}:{state:DemoState}) {
  return <aside className={`sd-sidebar${state.menuOpen?' is-open':''}`} aria-label="Navegación principal">
    <button className="sd-brand" data-action="nav" data-value="home" aria-label="ScoryDesign, inicio"><BrandMark/><span>Scory<span className="sd-brand-blue">Design</span></span></button>
    <nav className="sd-nav">{nav.map((n,i)=>{
      const selected=n.view===state.view;
      return <button key={n.id} className={`sd-nav-item${selected?' is-active':''}${i===6?' sd-nav-break':''}`} data-action={n.view?'nav':n.id} data-value={n.view} aria-current={selected?'page':undefined}>
        <AppIcon name={n.icon} small tone="neutral"/><span>{n.label}</span>{selected&&<span className="sd-nav-dot"/>}
      </button>;
    })}</nav>
    <div className="sd-sidebar-bottom"><div className="sd-studio-note"><span className="sd-mini-kicker">ESTUDIO CREATIVO</span><p>Tu siguiente<br/>gran idea<br/><b>empieza aquí.</b></p><span className="sd-note-orbit"/><Glyph name="arrow"/></div>
      <button className="sd-nav-item sd-system-link" data-action="nav" data-value="icons"><AppIcon name="settings" small/><span>Sistema visual</span></button>
      <div className="sd-account"><span className="sd-avatar">RC</span><div><strong>Fai</strong><small>Vista de demostración</small></div><span className="sd-account-dot"/></div>
    </div>
  </aside>;
}
export function Shell({state,children}:{state:DemoState;children:ReactNode}) {
  return <div className="sd-root">
    {state.menuOpen&&<button className="sd-scrim" data-action="menu" aria-label="Cerrar navegación"/>}
    <Sidebar state={state}/>
    <div className="sd-main-shell">
      <header className="sd-topbar">
        <button className="sd-icon-button sd-mobile-menu" data-action="menu" aria-label="Abrir menú"><Glyph name="menu"/></button>
        <button className="sd-business" data-action="business"><span className="sd-business-dot"/>Xending<Glyph name="chevron" size={13}/></button>
        <div className="sd-top-divider"/>
        <form className="sd-search" data-form="search"><Glyph name="search" size={18}/><input aria-label="Buscar proyectos" data-field="query" name="query" onChange={()=>{}} value={state.query} placeholder="Busca en tus proyectos, piezas o materiales…" readOnly={false}/><kbd>↵</kbd></form>
        <span className="sd-prototype-tag">Prototipo</span>
        <button className="sd-icon-button" data-action="notifications" aria-label="Notificaciones"><Glyph name="bell" size={21}/></button>
        <span className="sd-avatar sd-top-avatar">RC</span>
      </header>
      <main id="main-content" className={`sd-workspace${state.view==='editor'?' sd-editor-workspace':''}`}>{children}</main>
      <footer className="sd-footer"><span>ScoryDesign · base visual v0.1</span><span>Datos de ejemplo · Sin conexión a servicios</span></footer>
    </div>
    {state.notice&&<div className="sd-toast" role="status"><span>{state.notice}</span><button className="sd-icon-button" data-action="dismiss" aria-label="Cerrar aviso"><Glyph name="close" size={17}/></button></div>}
  </div>;
}
export function PageHeading({eyebrow,title,description,action}:{eyebrow:string;title:string;description?:string;action?:ReactNode}) {
  return <div className="sd-page-heading"><div><span className="sd-eyebrow">{eyebrow}</span><h1>{title}</h1>{description&&<p>{description}</p>}</div>{action}</div>;
}
