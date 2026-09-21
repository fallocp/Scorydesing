import type { GlyphName, Tone } from '../types';
/** Original SVG drawings. No SF Symbols or Apple font files are distributed. */
export function Glyph({name, size=22}: {name: GlyphName; size?:number}) {
  const paths: Record<GlyphName, React.ReactNode> = {
    home:<><path d="m3.5 10 8.5-7 8.5 7v9a1.6 1.6 0 0 1-1.6 1.6H15v-7H9v7H5.1a1.6 1.6 0 0 1-1.6-1.6z"/><path d="M8 6.3v2" opacity=".25"/></>,
    create:<><rect x="3" y="3" width="18" height="18" rx="5"/><path d="M12 7.5v9M7.5 12h9"/></>,
    library:<><path d="M3 8h7l2-3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="currentColor" opacity=".15"/><path d="M3 8h7l2-3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 11h18M6 5h4"/></>,
    presentation:<><rect x="3" y="4" width="18" height="13" rx="3"/><path d="M12 17v4m-4 0h8m-1.5-10.5-5-2.8v5.6z"/></>,
    pen:<><path d="m14.5 4.5 5 5M4 20l1.4-5.8L16.2 3.5a2.1 2.1 0 0 1 3 0l1.3 1.3a2.1 2.1 0 0 1 0 3L9.8 18.6z"/><path d="m5.4 14.2 4.4 4.4M13 21h8" opacity=".65"/></>,
    brand:<><path d="m12 2.7 8.4 4.8v9L12 21.3l-8.4-4.8v-9z"/><path d="m3.6 7.5 8.4 4.8 8.4-4.8M12 12.3v9"/><path d="m7.8 5.1 8.4 4.8" opacity=".5"/></>,
    projects:<><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><rect x="2.5" y="7" width="19" height="14" rx="3"/><path d="M2.5 12h19m-12 0v3h5v-3"/></>,
    templates:<>{[3,13].flatMap(x=>[3,13].map(y=><rect key={x+':'+y} x={x} y={y} width="8" height="8" rx="2" fill={x===3&&y===3?'currentColor':'none'}/>))}</>,
    trash:<><path d="M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/></>,
    image:<><rect x="2.5" y="3" width="19" height="18" rx="4.5"/><circle cx="15.8" cy="8.2" r="1.5" fill="currentColor" stroke="none"/><path d="m3 17 5.7-6 4.2 4.2 2.8-2.8L21 18"/></>,
    carousel:<><rect x="7" y="3" width="14" height="16" rx="3" opacity=".6"/><rect x="3" y="7" width="14" height="16" rx="3"/><path d="M7 11v8" opacity=".5"/></>,
    news:<><rect x="6" y="3" width="15" height="18" rx="3"/><path d="M3 7v12a2 2 0 0 0 2 2M10 7h7M10 11h7M10 15h4"/></>,
    chart:<><rect x="3" y="13" width="3.5" height="8" rx="1.5" fill="currentColor" stroke="none"/><rect x="10.3" y="8" width="3.5" height="13" rx="1.5" fill="currentColor" stroke="none"/><rect x="17.5" y="3" width="3.5" height="18" rx="1.5" fill="currentColor" stroke="none"/></>,
    arrow:<path d="M4 12h15m-6-6 6 6-6 6"/>, back:<path d="M20 12H5m6-6-6 6 6 6"/>, chevron:<path d="m9 5 7 7-7 7"/>,
    search:<><circle cx="10.3" cy="10.3" r="6.8"/><path d="m15.4 15.4 5.1 5.1"/></>,
    bell:<><path d="M5 16c2-3 1-4 1.6-8a5.5 5.5 0 0 1 10.8 0c.6 4-.4 5 1.6 8l1 1H4z"/><path d="M10 21h4M12 2v1"/></>,
    settings:<><path d="m9 3-1 3-3 1 .3 3.2L3 12l2.3 1.8L5 17l3 1 1 3h6l1-3 3-1-.3-3.2L21 12l-2.3-1.8L19 7l-3-1-1-3z"/><circle cx="12" cy="12" r="3"/></>,
    attach:<path d="m8 12 6.5-6.5a3.2 3.2 0 0 1 4.5 4.5L10.2 19a4.9 4.9 0 0 1-7-7L12.5 2.8m-7 11.5 8-8"/>,
    check:<path d="m5 12 4.5 4.5L19 7"/>, close:<path d="m6 6 12 12M6 18 18 6"/>, menu:<path d="M4 6h16M4 12h16M4 18h16"/>,
    spark:<><path d="M12 3c.4 5.5 3.5 8.6 9 9-5.5.4-8.6 3.5-9 9-.4-5.5-3.5-8.6-9-9 5.5-.4 8.6-3.5 9-9Z" fill="currentColor" stroke="none"/><path d="M20 1v5M17.5 3.5h5"/></>,
    download:<><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
    more:<>{[5,12,19].map(x=><circle key={x} cx={x} cy="12" r="1.5" fill="currentColor" stroke="none"/>)}</>,
    grid:<><rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 9h18M9 9v12"/></>,
    folder:<path d="M3 7a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>,
    document:<><path d="M5 3h10l5 5v13H5zM15 3v5h5M9 12h7M9 16h5"/></>,
    copy:<><rect x="8" y="7" width="13" height="15" rx="3"/><path d="M5 17H3V2h13v2"/></>,
    upload:<><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
    expand:<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths[name]}</svg>;
}
export function AppIcon({name,tone='neutral',small=false}:{name:GlyphName;tone?:Tone;small?:boolean}) {
  return <span className={`sd-app-icon sd-tone-${tone}${small?' sd-icon-small':''}`}><Glyph name={name} size={small?21:26}/></span>;
}
export function BrandMark() { return <span className="sd-brand-mark" aria-hidden="true"><i/><i/></span>; }
