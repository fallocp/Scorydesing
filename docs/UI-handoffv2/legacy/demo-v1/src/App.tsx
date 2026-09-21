import { useEffect, useState } from 'react';
import type { FormEvent, MouseEvent } from 'react';
import { DesignView } from './DesignView';
import { initialState } from './data';
import { appendReferences, downloadDemoPresentation, readReferences, reduceDemo, updateField, updateReferenceRole } from './demo-controller';
import type { DemoState } from './types';
import './styles/design.css';
/** Standalone reference app. This controller is deliberately not a backend integration. */
export default function App() {
 const [state,setState]=useState<DemoState>(initialState);
 useEffect(()=>{window.scrollTo({top:0});},[state.view]);
 function onClick(event:MouseEvent<HTMLDivElement>){
  const target=event.target instanceof Element?event.target.closest<HTMLElement>('[data-action]'):null;
  if(!target||target.tagName==='SELECT')return;
  const action=target.dataset.action;if(!action)return;
  event.preventDefault();
  if(action==='export-demo'){downloadDemoPresentation(state);return;}
  setState(current=>reduceDemo(current,action,target.dataset.value||''));
 }
 async function onChange(event:FormEvent<HTMLDivElement>){
  const target=event.target as HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement;
  if(target instanceof HTMLInputElement&&target.type==='file'&&target.dataset.upload){
   const files=Array.from(target.files||[]);target.value='';if(!files.length)return;
   try{const refs=await readReferences(files);setState(s=>appendReferences(s,refs));}
   catch(e){setState(s=>({...s,notice:e instanceof Error?e.message:'No se pudo cargar el archivo.'}));}return;
  }
  if(target.dataset.action==='ref-role'){const id=target.dataset.id||'',value=target.value;setState(s=>updateReferenceRole(s,id,value));return;}
  if(target.dataset.field){const field=target.dataset.field,value=target.value;setState(s=>updateField(s,field,value));}
 }
 function onSubmit(event:FormEvent<HTMLDivElement>){event.preventDefault();const form=event.target as HTMLFormElement;setState(s=>reduceDemo(s,form.dataset.form==='search'?'search':'start'));}
 return <div onClick={onClick} onChange={onChange} onSubmit={onSubmit}><DesignView state={state}/></div>;
}
