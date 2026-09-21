import type { DemoState, PieceType } from '../types';
import { assets, pieces } from '../data';
import { demoAssets } from '../demo-assets';
import { AppIcon, Glyph } from '../ui/Icons';
export function ModuleCards({selected}:{selected?:PieceType}) {
  return <div className="sd-module-grid">{pieces.map(p=><button key={p.id} className={`sd-module-card${selected===p.id?' is-selected':''}`} data-action="piece" data-value={p.id} aria-pressed={selected===p.id}>
    <div className="sd-card-top"><AppIcon name={p.icon} tone={p.tone}/><span className="sd-circle-arrow"><Glyph name={selected===p.id?'check':'chevron'} size={15}/></span></div>
    <h3>{p.label}</h3><p>{p.description}</p>
  </button>)}</div>;
}
export function Home({state}:{state:DemoState}) {
 return <>
   <section className="sd-hero" aria-labelledby="home-title">
     <div className="sd-hero-art" style={{backgroundImage:`url("${demoAssets.hero}")`}} aria-hidden="true"/>
     <div className="sd-hero-haze"/>
     <div className="sd-hero-content"><span className="sd-eyebrow">IDEAS QUE TOMAN FORMA</span><h1 id="home-title">¿Qué quieres<br/><span>crear hoy?</span></h1><p>Convierte tus ideas en contenido visual.<br/>Tu marca, siempre presente.</p></div>
     <div className="sd-hero-caption">UN ESPACIO.<br/>TODAS TUS IDEAS.<i/></div>
     <form className="sd-prompt-bar" data-form="idea"><Glyph name="spark" size={23}/><input aria-label="Describe lo que quieres crear" data-field="idea" onChange={()=>{}} value={state.idea} placeholder="Describe lo que quieres crear…"/><label className="sd-icon-button sd-attach-button" title="Añadir referencias"><Glyph name="attach" size={20}/><input className="sd-visually-hidden" type="file" data-upload="reference" accept="image/png,image/jpeg,image/webp" multiple aria-label="Añadir referencias"/></label><button className="sd-button sd-primary" type="submit">Continuar <Glyph name="arrow" size={20}/></button></form>
   </section>
   <ModuleCards/>
   <section className="sd-section"><div className="sd-section-heading"><h2>Continuar trabajando</h2><button className="sd-text-button" data-action="nav" data-value="library">Ver todos <Glyph name="arrow" size={16}/></button></div>
     <div className="sd-project-grid">{assets.map(a=><button className="sd-project-card" key={a.id} data-action="open-asset" data-value={a.id}><div className="sd-project-image"><img src={a.src} alt={`Vista de ejemplo: ${a.title}`}/><span className="sd-project-type">{pieces.find(p=>p.id===a.kind)?.label}</span><span className="sd-project-more"><Glyph name="more" size={18}/></span></div><h3>{a.title}</h3><p>{a.note}</p></button>)}</div>
   </section>
   <section className="sd-section sd-quick-section"><div className="sd-section-heading"><h2>Accesos rápidos</h2><span className="sd-subtle-label">TU CONTEXTO, A LA MANO</span></div><div className="sd-quick-grid">
     <button className="sd-quick-card sd-news-card" data-action="news"><AppIcon name="news" tone="blue"/><div><h3>Xending News</h3><p>Prepara y revisa tus ediciones de noticias.</p></div><span className="sd-circle-arrow"><Glyph name="chevron" size={16}/></span></button>
     <button className="sd-quick-card sd-fx-card" data-action="fx"><AppIcon name="chart" tone="blue"/><div><h3>Daily Report FX</h3><p>Contenido de mercado y reporte cambiario.</p></div><span className="sd-circle-arrow"><Glyph name="chevron" size={16}/></span></button>
   </div></section>
 </>;
}
