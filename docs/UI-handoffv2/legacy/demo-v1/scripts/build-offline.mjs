/** Generates a self-contained HTML preview from the pure JSX views.
 * This preview uses a small demonstration renderer, NOT the React runtime.
 * Production integration uses src/App.tsx with the host application's React/Vite setup.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const ts=require(process.env.SCORY_TYPESCRIPT_PATH||'typescript');
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const source=path.join(root,'src');
const modules={};
function walk(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())walk(file);else if(/\.tsx?$/.test(file)&&!['App.tsx','main.tsx'].includes(entry.name)){
 const relative=path.relative(source,file).replaceAll('\\','/').replace(/\.tsx?$/,'');
 const result=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,strict:true},fileName:file,reportDiagnostics:true});
 const errors=(result.diagnostics||[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
 if(errors.length)throw new Error(ts.formatDiagnosticsWithColorAndContext(errors,{getCurrentDirectory:()=>root,getCanonicalFileName:f=>f,getNewLine:()=> '\n'}));
 modules[relative]=result.outputText;
}}}
walk(source);
const bundle=Object.entries(modules).map(([id,code])=>`${JSON.stringify(id)}:function(module,exports,require){\n${code}\n}`).join(',\n');
const css=['tokens.css','design.css','demo-page.css'].map(f=>fs.readFileSync(path.join(source,'styles',f),'utf8').replace(/@import[^;]*;/g,'')).join('\n');
const runtime=String.raw`
const jsx=(type,props)=>({type,props:props||{}}), Fragment=Symbol('fragment');
const cache={};
function req(id,from=''){
 if(id==='react/jsx-runtime')return {jsx,jsxs:jsx,Fragment};
 if(id.startsWith('.')){const parts=(from.split('/').slice(0,-1).join('/')+'/'+id).split('/'),out=[];for(const p of parts){if(p==='..')out.pop();else if(p&&p!=='.')out.push(p);}id=out.join('/');}
 if(cache[id])return cache[id].exports;
 if(!factories[id])throw new Error('Missing demo module: '+id);
 const m={exports:{}};cache[id]=m;factories[id](m,m.exports,s=>req(s,id));return m.exports;
}
function escape(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
const voidTags=new Set(['input','img','br','hr','meta','link','source','area','base','col','embed','param','track','wbr']);
const unitless=new Set(['opacity','zIndex','fontWeight','lineHeight','flex','flexGrow','flexShrink','order','aspectRatio','gridRow','gridColumn']);
function render(node,selectValue){
 if(node===null||node===undefined||typeof node==='boolean')return '';
 if(typeof node==='string'||typeof node==='number')return escape(node);
 if(Array.isArray(node))return node.map(n=>render(n,selectValue)).join('');
 const {type,props}=node;
 if(type===Fragment)return render(props.children,selectValue);
 if(typeof type==='function')return render(type(props),selectValue);
 let attrs='';
 for(const [k,v] of Object.entries(props)){
  if(['children','key','ref'].includes(k)||k.startsWith('on')||v===undefined||v===null)continue;
  if((type==='textarea'||type==='select')&&k==='value')continue;
  if(k==='style'){const styles=Object.entries(v).map(([name,value])=>{const css=name.startsWith('--')?name:name.replace(/[A-Z]/g,c=>'-'+c.toLowerCase());return css+':'+(typeof value==='number'&&!unitless.has(name)?value+'px':value);}).join(';');attrs+=' style="'+escape(styles)+'"';continue;}
  const name=({className:'class',htmlFor:'for',tabIndex:'tabindex',readOnly:'readonly',strokeWidth:'stroke-width',strokeLinecap:'stroke-linecap',strokeLinejoin:'stroke-linejoin',fillRule:'fill-rule',clipRule:'clip-rule'}[k]||k);
  if(typeof v==='boolean'&&!name.startsWith('aria-')&&!name.startsWith('data-')){if(v)attrs+=' '+name;continue;}
  attrs+=' '+name+'="'+escape(v)+'"';
 }
 if(type==='option'&&String(props.value??props.children)===String(selectValue))attrs+=' selected';
 if(voidTags.has(type))return '<'+type+attrs+'>';
 const children=type==='textarea'?(props.value??props.children):props.children;
 return '<'+type+attrs+'>'+render(children,type==='select'?props.value:selectValue)+'</'+type+'>';
}
const {initialState}=req('data'), {DesignView}=req('DesignView'), actions=req('demo-controller');
let state=JSON.parse(JSON.stringify(initialState));
const initialView=location.hash.slice(1).split('/');
if(['create','library','editor','brand','icons'].includes(initialView[0]))state.view=initialView[0];
if(initialView[0]==='create'&&/^[0-4]$/.test(initialView[1]||''))state.step=Number(initialView[1]);
const mount=document.getElementById('root');
function draw(){
 const focused=document.activeElement, field=focused&&focused.dataset&&focused.dataset.field;
 let selection=null;try{if(field&&typeof focused.selectionStart==='number')selection=[focused.selectionStart,focused.selectionEnd];}catch{}
 mount.innerHTML=render(DesignView({state}));
 if(field){const el=mount.querySelector('[data-field="'+CSS.escape(field)+'"]');if(el){el.focus({preventScroll:true});if(selection)try{el.setSelectionRange(selection[0],selection[1]);}catch{}}}
}
function dispatch(action,value){const previousView=state.view;state=actions.reduceDemo(state,action,value||'');draw();if(previousView!==state.view)window.scrollTo(0,0);}
mount.addEventListener('click',event=>{const target=event.target.closest('[data-action]');if(!target||target.tagName==='SELECT'||target.disabled)return;event.preventDefault();const action=target.dataset.action;if(action==='export-demo'){actions.downloadDemoPresentation(state);return;}dispatch(action,target.dataset.value);});
mount.addEventListener('submit',event=>{event.preventDefault();dispatch(event.target.dataset.form==='search'?'search':'start');});
mount.addEventListener('input',event=>{const el=event.target;if(el.dataset.field){state=actions.updateField(state,el.dataset.field,el.value);draw();}});
mount.addEventListener('change',async event=>{const el=event.target;if(el.dataset.action==='ref-role'){state=actions.updateReferenceRole(state,el.dataset.id,el.value);draw();return;}if(el.type==='file'&&el.dataset.upload){const files=Array.from(el.files||[]);el.value='';if(!files.length)return;try{const refs=await actions.readReferences(files);state=actions.appendReferences(state,refs);}catch(e){state={...state,notice:e instanceof Error?e.message:'No se pudo leer el archivo.'};}draw();}});
draw();
`;
const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f1f6fd"><title>ScoryDesign · Prototipo visual</title><style>${css}</style></head><body><div id="root"></div><script>const factories={${bundle}};\n${runtime}</script></body></html>`;
fs.writeFileSync(path.join(root,'ScoryDesign-preview.html'),html);
console.log(`Preview generated: ${Object.keys(modules).length} TypeScript modules; syntax diagnostics passed; ${(Buffer.byteLength(html)/1024).toFixed(0)} KB. This is not a React production build.`);
