import { useMemo, useState } from 'react';
import { Check, Layers3, MessageSquare, RefreshCw, Sparkles } from 'lucide-react';
import type { ExplorationSession, IdeaAspect, IdeaSelection, IdeaSource, TextIdea } from '../../../supabase/functions/_shared/desaing/explorationContracts';
import './DesignExplorationPanel.css';

const aspects: Array<{ key: IdeaAspect; label: string }> = [
  { key: 'subject', label: 'Objeto' }, { key: 'composition', label: 'Composición' },
  { key: 'style', label: 'Estilo' }, { key: 'palette', label: 'Paleta' },
];
const same = (left: IdeaSelection | null, right: IdeaSelection) => !!left && left.set_id === right.set_id
  && left.idea_id === right.idea_id && left.version === right.version;
const key = (selection: IdeaSelection) => JSON.stringify([selection.set_id, selection.idea_id, selection.version]);
export interface DesignExplorationPanelProps {
  session: ExplorationSession | null;
  busy: boolean;
  error: string;
  simulation?: boolean;
  canPlan?: boolean;
  remainingAttempts?: number;
  onPlanFive(): void;
  onDiscuss(message: string): void;
  onSelect(selection: IdeaSelection): void;
  onRefine(selection: IdeaSelection, feedback: string): void;
  onCombine(sources: IdeaSource[]): void;
  onUseIdea(selection: IdeaSelection): void;
  onRecover(): void;
}

/** Controlled, provider-independent idea workspace. None of its actions render an image. */
export function DesignExplorationPanel(props: DesignExplorationPanelProps) {
  const { session, busy, error } = props;
  const [comment, setComment] = useState('');
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  const [picked, setPicked] = useState<IdeaSource[]>([]);
  const cards = useMemo(() => (session?.sets ?? []).flatMap(set => {
    const groups = new Map<string, TextIdea[]>();
    for (const idea of set.ideas) groups.set(idea.idea_id, [...(groups.get(idea.idea_id) ?? []), idea]);
    return [...groups.values()].map(versions => {
      const latest = versions.reduce((value, idea) => idea.version > value.version ? idea : value);
      const selected = versions.find(idea => same(session?.selected ?? null, { set_id: set.set_id, idea_id: idea.idea_id, version: idea.version }));
      return { set, versions, idea: selected ?? latest, latest };
    });
  }), [session]);
  const selected = cards.find(card => same(session?.selected ?? null,
    { set_id: card.set.set_id, idea_id: card.idea.idea_id, version: card.idea.version }));
  const unresolved = session?.attempts.some(attempt => attempt.status === 'running' || attempt.status === 'uncertain') ?? false;
  const working = busy || unresolved;
  const validPicks = picked.filter(source => session?.sets.some(set => set.set_id === source.set_id
    && set.ideas.some(idea => idea.idea_id === source.idea_id && idea.version === source.version)));
  const pickedAspects = new Set(validPicks.flatMap(source => source.aspects));
  const canCombine = validPicks.length >= 2 && pickedAspects.size === 4 && new Set(validPicks.map(source => source.set_id)).size === 1;
  function toggle(source: IdeaSelection, aspect: IdeaAspect) {
    setPicked(previous => {
      const existing = previous.find(item => same(item, source));
      const remove = existing?.aspects.includes(aspect);
      const kept = previous.filter(item => item.set_id === source.set_id).map(item => ({ ...item, aspects: item.aspects.filter(value => value !== aspect) }))
        .filter(item => item.aspects.length > 0);
      if (remove) return kept;
      const sameIdea = kept.find(item => same(item, source));
      if (sameIdea) sameIdea.aspects.push(aspect); else kept.push({ ...source, aspects: [aspect] });
      return kept;
    });
  }
  const sourceTitle = (source: IdeaSelection) => session?.sets.find(set => set.set_id === source.set_id)?.ideas
    .find(idea => idea.idea_id === source.idea_id && idea.version === source.version)?.title ?? 'Idea guardada';
  return <section className="dep-panel" data-testid="exploration-panel" aria-label="Explorar ideas de diseño" aria-busy={busy}>
    <div className="dep-heading"><div><h3>Exploremos la dirección</h3>
      <p>{props.simulation ? 'Prueba simulada · ' : ''}Ideas de texto; no se generan imágenes al explorar.</p></div><Sparkles size={18} aria-hidden="true" /></div>
    {!props.simulation && <p className="dep-note">El servidor conserva las solicitudes y respuestas de esta conversación. La captura, la selección y los ajustes de ideas se guardan en este navegador. Para usar una idea recuperada en otro dispositivo, vuelve a añadir la captura, el encargo y la zona originales.</p>}
    {props.remainingAttempts !== undefined && <p className="dep-note" role="status">Conversaciones disponibles: {props.remainingAttempts}.</p>}
    {props.canPlan === false && <p className="dep-note" role="status">La conversación de diseño está pausada o sin presupuesto disponible. Puedes recuperar y ajustar tus ideas guardadas.</p>}
    <p className="dep-intro">Compara cinco propuestas, conserva lo que te gusta y prepara una idea para convertirla en un borrador.</p>
    <div className="dep-toolbar"><button type="button" className="mip-button mip-button-primary" disabled={working || props.canPlan === false} onClick={props.onPlanFive}>
      <Layers3 size={15} aria-hidden="true" />Proponer cinco ideas</button>
      {session && <button type="button" className="mip-button" disabled={busy} onClick={props.onRecover}>
        <RefreshCw size={15} aria-hidden="true" />Recuperar exploración</button>}</div>
    {error && <p className="dep-error" role="alert">{error}</p>}
    {unresolved && <p className="dep-note" role="status">Hay una respuesta pendiente de confirmar. Conservamos tu exploración; recuperarla no envía otra solicitud.</p>}
    {!cards.length && <div className="dep-empty">Tus cinco ideas aparecerán aquí. Elegir una o ajustar sus aspectos no crea imágenes.</div>}
    <div className="dep-ideas" data-testid="exploration-ideas">{cards.map(({ set, idea, latest, versions }) => {
      const selection: IdeaSelection = { set_id: set.set_id, idea_id: idea.idea_id, version: idea.version };
      const chosen = same(session?.selected ?? null, selection), combined = idea.sources.length > 1;
      return <article className={`dep-card${chosen ? ' dep-card-selected' : ''}`} key={`${set.set_id}:${idea.idea_id}`}
        data-testid={`exploration-card-${idea.idea_id}`} data-idea-id={idea.idea_id} data-idea-version={idea.version}>
        <div className="dep-card-meta"><span>{combined ? 'Idea combinada' : 'Idea de diseño'}</span><span>Versión {idea.version}</span></div>
        <h4>{idea.title}</h4><p>{idea.rationale}</p>
        {versions.length > 1 && <label className="dep-version">Versión de la idea
          <select aria-label={`Versión de ${latest.title}`} value={idea.version} disabled={working}
            onChange={event => props.onSelect({ ...selection, version: Number(event.target.value) })}>
            {[...versions].sort((a, b) => b.version - a.version).map(value => <option key={value.version} value={value.version}>
              Versión {value.version}{value.version === latest.version ? ' · más reciente' : ''}</option>)}
          </select></label>}
        <fieldset className="dep-aspects" disabled={working}><legend>Aspectos para combinar</legend>
          {aspects.map(aspect => <label key={aspect.key}><input type="checkbox"
            aria-label={`${aspect.label} de ${idea.title}`} checked={validPicks.some(source => same(source, selection) && source.aspects.includes(aspect.key))}
            onChange={() => toggle(selection, aspect.key)} /><span><strong>{aspect.label}</strong>{idea.aspects[aspect.key]}</span></label>)}
        </fieldset>
        {idea.sources.length > 0 && <div className="dep-sources"><strong>Parte de estas ideas</strong>
          <ul>{idea.sources.map(source => <li key={key(source)}>{sourceTitle(source)} · v{source.version}: {source.aspects
            .map(value => aspects.find(aspect => aspect.key === value)!.label.toLowerCase()).join(', ')}</li>)}</ul></div>}
        {idea.feedback.length > 0 && <details className="dep-feedback-history"><summary>Ajustes guardados ({idea.feedback.length})</summary>
          <ul>{idea.feedback.map((value, index) => <li key={index}>{value}</li>)}</ul></details>}
        <button type="button" className={`mip-button${chosen ? ' mip-button-primary' : ''}`} disabled={working} aria-pressed={chosen}
          onClick={() => props.onSelect(selection)}>{chosen && <Check size={15} aria-hidden="true" />}{chosen ? 'Idea seleccionada' : 'Seleccionar idea'}</button>
      </article>;
    })}</div>
    {cards.length > 0 && <div className="dep-combine"><p>Elige los cuatro aspectos entre al menos dos ideas de un mismo grupo. Cada aspecto toma una sola fuente. {pickedAspects.size} de 4 elegidos.</p>
      <button type="button" className="mip-button" disabled={working || !canCombine}
        onClick={() => props.onCombine(validPicks.map(source => ({ ...source, aspects: [...source.aspects] })))}>
        <Layers3 size={15} aria-hidden="true" />Combinar aspectos elegidos</button></div>}
    {selected && session?.selected && <div className="dep-selected" data-testid="exploration-selected">
      <h4>Desarrollar: {selected.idea.title}</h4>
      <p className="dep-note">Versión {selected.idea.version}. Ajusta esta idea o pásala al encargo editable.</p>
      <label className="dep-field">Qué quieres conservar o cambiar<textarea aria-label="Comentarios para ajustar la idea" rows={3}
        disabled={working} value={feedback[key(session.selected)] ?? ''} maxLength={2000}
        onChange={event => setFeedback(previous => ({ ...previous, [key(session.selected!)]: event.target.value }))}
        placeholder="Conserva el estilo y prueba una composición con más espacio…" /></label>
      <div className="dep-toolbar"><button type="button" className="mip-button" disabled={working || !(feedback[key(session.selected)] ?? '').trim()}
        onClick={() => props.onRefine({ ...session.selected! }, feedback[key(session.selected!)]!.trim())}>Guardar ajuste</button>
        <button type="button" className="mip-button mip-button-primary" disabled={working}
          onClick={() => props.onUseIdea({ ...session.selected! })}>Usar esta idea</button></div>
      <p className="dep-note">Usar la idea prepara el encargo. Después podrás generar un borrador con un botón separado.</p>
    </div>}
    <div className="dep-discussion" data-testid="exploration-discussion"><h4><MessageSquare size={16} aria-hidden="true" />Conversación sobre el diseño</h4>
      <ol aria-label="Historial de exploración">{session?.messages.map((message, index) => <li key={`${message.request_key}:${index}`} className={`dep-message dep-message-${message.role}`}>
        <strong>{message.role === 'user' ? 'Tú' : 'Asistente'}</strong><p>{message.text}</p></li>)}</ol>
      <form onSubmit={event => { event.preventDefault(); if (!working && props.canPlan !== false && comment.trim()) props.onDiscuss(comment.trim()); }}>
        <label className="dep-field">Hablemos de las ideas<textarea aria-label="Mensaje sobre el diseño" rows={2} maxLength={4000} value={comment}
          onChange={event => setComment(event.target.value)} disabled={working} placeholder="¿Qué cambiarías para que se vea más editorial?" /></label>
        <button type="submit" className="mip-button" disabled={working || props.canPlan === false || !comment.trim()}>Enviar comentario</button>
      </form><p className="dep-note">La conversación responde con texto. No genera ni publica imágenes.</p>
    </div>
  </section>;
}
