import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { entryKey, entryRoute, originLabels, readEntry } from '@/lib/create-edit/entry';
import './create-edit.css';

/** Navigation context only: never changes the target's copy, HTML or generation state. */
export function CreateEntryHandoff() {
  const location = useLocation();
  const { user } = useAuth();
  const { activeBusinessId } = useActiveBusiness();
  // Pages inside Crear y editar read the brief directly.
  if (new URLSearchParams(location.search).get('from') !== 'create' || location.pathname.startsWith('/create') || !user || !activeBusinessId) return null;
  return <ScopedHandoff key={`${user.id}:${activeBusinessId}:${location.key}`} storageKey={entryKey(user.id, activeBusinessId)} pathname={location.pathname} />;
}
function ScopedHandoff({ storageKey, pathname }: { storageKey: string; pathname: string }) {
  const [status, setStatus] = useState('');
  const [entry] = useState(() => {
    try { return readEntry(window.sessionStorage, storageKey); } catch { return null; }
  });
  if (!entry || entryRoute(entry).split('?')[0] !== pathname) return null;
  async function copyBrief() {
    try { await navigator.clipboard.writeText(entry!.brief); setStatus('Indicaciones copiadas.'); }
    catch { setStatus('No se pudieron copiar. Selecciona el texto para copiarlo manualmente.'); }
  }
  return <section className="ce-handoff" aria-label="Indicaciones de Crear y editar"><div><Link to="/create">← Crear y editar</Link><strong>{originLabels[entry.origin]}</strong>
    <small>Continúa en la herramienta actual.</small></div>{entry.brief && <details open><summary>Tu idea e indicaciones</summary><p>{entry.brief}</p>
      <div><button onClick={() => void copyBrief()}>Copiar indicaciones</button>
        <small>Pégalas en el campo de instrucciones de la herramienta cuando las necesites.</small></div><span role="status">{status}</span></details>}</section>;
}
