import { useEffect, useRef, useState } from 'react';
import type { DesignServerClient } from '@/lib/desaing/serverClient';
import { createPromptAdminComparisonController, type PromptComparisonState } from '@/lib/desaing/promptAdminComparison';
import type { PromptAdminTest, PromptAdminReview, PromptAdminReviewInput } from '../../../supabase/functions/_shared/desaing/promptAdmin';
import './PromptAdminComparison.css';

export interface PromptAdminComparisonProps {
  client: DesignServerClient; test: PromptAdminTest; review?: PromptAdminReview;
  onReview(input: PromptAdminReviewInput): Promise<void>; disabled?: boolean; onBusyChange?(busy: boolean): void;
}
function message(problem: unknown) {
  const code = problem && typeof problem === 'object' && 'code' in problem ? String(problem.code) : problem instanceof Error ? problem.message : '';
  return ({ server_session_changed: 'Cambió tu sesión. Cierra la comparación y vuelve a abrirla.',
    prompt_comparison_quota: 'Se necesitan dos generaciones disponibles para iniciar esta comparación. No se generó ninguna imagen.',
    prompt_comparison_uncertain: 'Hay un resultado pendiente de confirmar. Recupera los resultados; no se reenviarán automáticamente.',
    prompt_comparison_configuration_changed: 'Cambió la configuración del ejecutor. Prepara una nueva prueba con la configuración actual.',
    prompt_comparison_review_frozen: 'Esta revisión ya se envió. Recupera el estado antes de cambiar su contenido.',
    prompt_comparison_storage_unavailable: 'No se pudo conservar la solicitud. La generación no se inició.',
    prompt_admin_forbidden: 'Tu sesión no puede administrar este prompt.' } as Record<string, string>)[code]
    ?? 'No se pudo completar la comparación. Recupera los resultados antes de continuar.';
}
export function PromptAdminComparison({ client, test, review, onReview, disabled = false, onBusyChange }: PromptAdminComparisonProps) {
  const [state, setState] = useState<PromptComparisonState | null>(null), [error, setError] = useState('');
  const [images, setImages] = useState<Record<string, string>>({});
  const [criteria, setCriteria] = useState({ copy: false, visual: false, regression: false }), [notes, setNotes] = useState('');
  const [frozen, setFrozen] = useState(false), [reviewed, setReviewed] = useState(false);
  const [savedDecision, setSavedDecision] = useState<'approved' | 'rejected'>('approved');
  const controller = useRef<ReturnType<typeof createPromptAdminComparisonController> | null>(null);
  const callbacks = useRef({ onReview, onBusyChange }); callbacks.current = { onReview, onBusyChange };
  useEffect(() => {
    let active = true;
    setState(null); setImages({}); setError(''); setCriteria({ copy: false, visual: false, regression: false }); setNotes(''); setReviewed(false); setFrozen(false);
    const control = createPromptAdminComparisonController({ client, test, onChange: next => {
      if (active) { setState(next); callbacks.current.onBusyChange?.(next.busy); }
    } }); controller.current = control;
    const failed = (problem: unknown) => { if (active) { setError(message(problem));
      if (problem instanceof Error && problem.message === 'server_session_changed') { control.close(); setState(null); setImages({}); } } };
    void control.load().then(() => { if (!active) return; const saved = control.savedReview(); if (saved) { setFrozen(true); setCriteria(saved.criteria); setNotes(saved.notes); setSavedDecision(saved.decision); } }).catch(failed);
    const check = () => { void client.session().then(session => { if (session.actorId !== test.actor_id) throw Error('server_session_changed'); }).catch(failed); };
    window.addEventListener('focus', check); window.addEventListener('storage', check); document.addEventListener('visibilitychange', check);
    return () => { active = false; control.close(); controller.current = null; callbacks.current.onBusyChange?.(false);
      window.removeEventListener('focus', check); window.removeEventListener('storage', check); document.removeEventListener('visibilitychange', check); };
  }, [client, test.id, test.test_hash]);
  const assetKeys = state?.items.map(item => item.asset ? `${item.asset.identity.asset_id}:${item.asset.identity.version_id}` : '').join('|') ?? '';
  useEffect(() => {
    let active = true; const urls: string[] = []; setImages({});
    void (async () => {
      const pairs = await Promise.all((state?.items ?? []).map(async item => {
        if (!item.asset) return null; const blob = await client.asset(item.asset.identity);
        if ((await client.session()).actorId !== test.actor_id) throw Error('server_session_changed');
        if (!active) return null; const url = URL.createObjectURL(blob); urls.push(url); return [item.side, url] as const;
      })); if (active) setImages(Object.fromEntries(pairs.filter((value): value is NonNullable<typeof value> => value !== null)));
    })().catch(problem => { if (active) { setError(message(problem)); setImages({}); } });
    return () => { active = false; urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [client, test.actor_id, assetKeys]);
  async function run(action: (control: NonNullable<typeof controller.current>) => Promise<unknown>) {
    const control = controller.current; if (!control || disabled || state?.busy) return; setError('');
    try { await action(control); } catch (problem) { setError(message(problem)); }
  }
  const locked = disabled || !!state?.busy, done = reviewed || !!review;
  const both = state?.items.length === 2 && state.items.every(item => ['needs_review', 'approved', 'rejected'].includes(item.status) && item.asset && images[item.side]);
  const bothApproved = both && state!.items.every(item => item.status === 'approved');
  async function submit(decision: 'approved' | 'rejected') {
    await run(async control => { try { await control.review({ decision, criteria, notes }, input => callbacks.current.onReview(input)); setReviewed(true); }
      finally { const saved = control.savedReview(); setFrozen(!!saved); if (saved) setSavedDecision(saved.decision); } });
  }
  return <section className="pac-panel" aria-label="Comparación visual del prompt" aria-busy={state?.busy ?? true}>
    <h3>Comparación visual</h3>
    <p>Dos imágenes nuevas con el mismo caso, referencias, modelo, calidad baja y formato PNG de 1024 × 1024. Sólo cambia el bloque maestro.</p>
    <p>El corpus comprueba la estructura de las solicitudes. La calidad visual requiere revisar estas dos imágenes.</p>
    {error && <p className="pac-error" role="alert">{error}</p>}
    <div className="pac-actions"><button type="button" disabled={locked || !state?.canGenerate || done}
      onClick={() => void run(control => control.generate())}>{state?.needed === 1 ? 'Generar lado pendiente (1)' : 'Generar comparación (2)'}</button>
      <button type="button" disabled={locked} onClick={() => void run(control => control.load())}>Recuperar resultados</button></div>
    {state?.ready && state.needed > 0 && state.remaining !== null && state.remaining < state.needed && <p role="status">La comparación necesita {state.needed} generaciones; quedan {state.remaining}. No se inició ningún envío nuevo.</p>}
    <div className="pac-grid">{state?.items.map(item => <article key={item.side} data-testid={`prompt-comparison-${item.side}`}>
      <h4>{item.side === 'before' ? 'Prompt base' : 'Prompt propuesto'}</h4>
      {images[item.side] ? <img src={images[item.side]} alt={item.side === 'before' ? 'Resultado del prompt base' : 'Resultado del prompt propuesto'} /> : <div className="pac-placeholder">{item.status === 'saved' ? 'Sin generar' : 'Resultado pendiente'}</div>}
      <p>{item.status === 'approved' ? 'Imagen revisada y aprobada' : item.status === 'needs_review' ? 'Revisa el texto, el objeto y los detalles' : item.status === 'saved' ? 'Solicitud preparada' : 'Recupera el estado antes de continuar'}</p>
      {item.status === 'needs_review' && <button type="button" disabled={locked || !images[item.side]} onClick={() => void run(control => control.approve(item.side))}>
        {item.side === 'before' ? 'Aprobar imagen base' : 'Aprobar imagen propuesta'}</button>}
    </article>)}</div>
    {done ? <p role="status">Revisión visual guardada. Publicar el prompt requiere la acción administrativa separada.</p> : <fieldset disabled={locked || !both || frozen}>
      <legend>Criterios de comparación</legend>
      {([['copy', 'Texto, cifras e inmutables correctos'], ['visual', 'La propuesta cumple la mejora visual buscada'], ['regression', 'No observo regresiones en el caso comparado']] as const).map(([key, label]) =>
        <label key={key}><input type="checkbox" checked={criteria[key]} onChange={event => setCriteria(current => ({ ...current, [key]: event.target.checked }))} />{label}</label>)}
      <label>Motivo de la decisión<textarea aria-label="Motivo de la comparación" value={notes} maxLength={4000} onChange={event => setNotes(event.target.value)} /></label>
    </fieldset>}
    {!done && <div className="pac-actions"><button type="button" disabled={locked || !both || !notes.trim() || ((!frozen || savedDecision === 'approved') && (!bothApproved || !Object.values(criteria).every(Boolean)))}
      onClick={() => void submit(frozen ? savedDecision : 'approved')}>{frozen ? 'Reenviar la misma revisión' : 'Aprobar comparación'}</button>
      {!frozen && <button type="button" disabled={locked || !both || !notes.trim()} onClick={() => void submit('rejected')}>Rechazar comparación</button>}</div>}
  </section>;
}
