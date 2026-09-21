import { assets, formatsFor, initialState, slideTitles } from './data';
import type { DemoReference, DemoState, PieceType, ViewName } from './types';
/** DEMO ONLY. Replace action routing with existing host actions on integration. No network requests. */
export function reduceDemo(state:DemoState, action:string, value=''):DemoState {
 const next={...state, notice:''};
 switch(action){
  case 'nav': {
   if(!['home','create','library','editor','brand','icons'].includes(value)) return state;
   return {...next,view:value as ViewName,menuOpen:false,resultVisible:value==='create'?false:state.resultVisible};
  }
  case 'menu':return {...next,menuOpen:!state.menuOpen};
  case 'dismiss':return {...next,notice:''};
  case 'start':return {...next,view:'create',step:0,resultVisible:false};
  case 'piece':{
   const p=value as PieceType;
   if(!['image','carousel','presentation','free'].includes(p))return state;
   if(p==='presentation')return {...next,view:'editor',menuOpen:false};
   return {...next,view:'create',piece:p,step:0,formatId:p===state.piece?state.formatId:formatsFor(p)[0].id,resultVisible:false};
  }
  case 'free':return {...next,view:'create',piece:'free',step:0,formatId:'free-wide',resultVisible:false,menuOpen:false};
  case 'step':{ const i=Number(value);return Number.isInteger(i)&&i>=0&&i<=4?{...next,step:i,resultVisible:false}:state;}
  case 'next-step':return {...next,step:Math.min(4,state.step+1)};
  case 'prev-step':return state.step===0?{...next,view:'home'}:{...next,step:state.step-1};
  case 'format':return formatsFor(state.piece).some(f=>f.id===value)?{...next,formatId:value}:state;
  case 'text-mode':return ['bank','own','none'].includes(value)?{...next,textMode:value}:state;
  case 'sample-copy':return {...next,headline:initialState.headline,body:initialState.body,cta:initialState.cta};
  case 'show-example':return {...next,resultVisible:true};
  case 'back-to-summary':return {...next,resultVisible:false};
  case 'remove-ref':return {...next,references:state.references.filter(r=>r.id!==value)};
  case 'open-references':return {...next,view:'create',step:3,resultVisible:false,menuOpen:false};
  case 'open-asset':return {...next,view:'library',selectedAsset:value,filter:'all',query:'',menuOpen:false};
  case 'select-asset':return assets.some(a=>a.id===value)?{...next,selectedAsset:value}:state;
  case 'filter':return ['all','image','carousel','presentation','free'].includes(value)?{...next,filter:value}:state;
  case 'clear-search':return {...next,query:'',filter:'all'};
  case 'search':return {...next,view:'library',filter:'all',menuOpen:false};
  case 'projects':return {...next,view:'library',filter:'all',query:'',menuOpen:false,notice:'En esta base, Proyectos abre la galería de ejemplos. Codex debe conservar el destino real del proyecto.'};
  case 'templates':return {...next,view:'editor',menuOpen:false,notice:'Plantilla de muestra. Las plantillas reales deben conectarse al módulo existente.'};
  case 'use-reference':{
   const a=assets.find(x=>x.id===value);if(!a)return state;
   const refs=state.references.filter(r=>r.id!==`asset:${a.id}`);
   if(refs.length>=3)return {...next,notice:'La demo admite hasta 3 referencias. Retira una antes de añadir otra.'};
   return {...next,view:'create',step:3,resultVisible:false,references:[...refs,{id:`asset:${a.id}`,name:a.title,src:a.src,role:'Producto'}],notice:'Referencia añadida al borrador de esta sesión. No se ha guardado en la nube.'};
  }
  case 'slide':{const i=Number(value);return Number.isInteger(i)&&i>=0&&i<slideTitles.length?{...next,slide:i}:state;}
  case 'previous-slide':return {...next,slide:Math.max(0,state.slide-1)};
  case 'next-slide':return {...next,slide:Math.min(slideTitles.length-1,state.slide+1)};
  case 'business':return {...next,notice:'Xending es el negocio de ejemplo. La integración debe reutilizar el selector y los permisos actuales.'};
  case 'notifications':return {...next,notice:'No hay notificaciones reales: esta vista no está conectada a servicios.'};
  case 'brand-settings':return {...next,notice:'Conectar la identidad real de marca. Esta demo no cambia colores ni logotipos guardados.'};
  case 'news':return {...next,notice:'Xending News conserva su módulo editorial. Esta base visual no lo reemplaza.'};
  case 'fx':return {...next,notice:'Daily Report FX conserva su análisis de mercado. No se ha conectado ni inventado información financiera.'};
  case 'demo-chat':return {...next,notice:'Explorar diseño: entrada conversacional de muestra. No hay un agente conectado y no se modifica la pieza.'};
  case 'demo-edit':return {...next,notice:'Ejecutar cambio: conectar la edición existente sobre la versión seleccionada. Esta demo no ejecuta generación.'};
  default:return state;
 }
}
export function updateField(state:DemoState,field:string,value:string):DemoState {
 const fields=['idea','headline','body','cta','query','instruction','editorHeadline','editorBody'];
 if(!fields.includes(field))return state;
 return {...state,[field]:value};
}
export function updateReferenceRole(state:DemoState,id:string,role:string):DemoState {
 if(!['Producto','Estilo','Composición','Texto','Marca'].includes(role))return state;
 return {...state,references:state.references.map(r=>r.id===id?{...r,role}:r)};
}
export async function readReferences(files:File[]):Promise<DemoReference[]> {
 if(files.length>3)throw new Error('Selecciona como máximo 3 imágenes.');
 return Promise.all(files.map(async(file,index)=>{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('Usa archivos JPG, PNG o WEBP.');
  if(file.size>10*1024*1024)throw new Error('El límite de esta demo es 10 MB por archivo.');
  const src=await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>typeof reader.result==='string'?resolve(reader.result):reject(new Error('No se pudo leer la imagen.'));reader.onerror=()=>reject(new Error('Error al leer el archivo.'));reader.readAsDataURL(file);});
  // Decode to reject a renamed or corrupt non-image; preserve original bytes for the preview.
  await new Promise<void>((resolve,reject)=>{const img=new Image();img.onload=()=>resolve();img.onerror=()=>reject(new Error('Una imagen está dañada o no tiene un formato válido.'));img.src=src;});
  return {id:`local:${Date.now()}:${index}`,name:file.name,src,role:'Producto'};
 }));
}
export function appendReferences(state:DemoState,refs:DemoReference[]):DemoState {
 if(state.references.length+refs.length>3)return {...state,notice:'La selección supera las 3 referencias. Elimina una o elige menos archivos.'};
 return {...state,references:[...state.references,...refs],notice:'Imágenes cargadas solo en esta sesión del navegador. No se han enviado a un servidor.'};
}
export function escapeHtml(s:string):string {return s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]||c));}
export function downloadDemoPresentation(state:DemoState):void {
 const a=assets[0];
 const title=state.slide===0?state.editorHeadline:slideTitles[state.slide];
 const body=state.slide===0?state.editorBody:'Diapositiva de ejemplo. Contenido local.';
 const html=`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Diapositiva de ejemplo</title><style>body{margin:0;background:#f1f6fd;font-family:system-ui,sans-serif;color:#101b3b;padding:5vw}article{max-width:1100px;aspect-ratio:16/9;margin:auto;background:white;border-radius:16px;padding:6%;box-sizing:border-box;position:relative;overflow:hidden}h1{font-size:clamp(26px,4vw,55px);line-height:1.07;letter-spacing:-1.4px;white-space:pre-line;max-width:70%;position:relative;z-index:1}p{max-width:55%;font-size:clamp(12px,1.5vw,20px);position:relative;z-index:1;color:#60718c}img{position:absolute;right:0;bottom:0;width:43%;height:55%;object-fit:cover;opacity:.85}small{display:block;text-align:center;margin:20px;color:#60718c;font-size:12px}</style><article><b>Xending</b><h1>${escapeHtml(title)}</h1><p>${escapeHtml(body)}</p><img src="${a.src}" alt="Referencia de cables"></article><small>Diapositiva ${state.slide+1} de muestra · No es una exportación del proyecto real.</small></html>`;
 const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}));
 const link=document.createElement('a');link.href=url;link.download='ScoryDesign-diapositiva-demo.html';document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
