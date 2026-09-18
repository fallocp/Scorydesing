import { useEffect, useRef, useState } from 'react';
import {
  ArrowDownToLine, ArrowRight, Check, CheckCircle2, ChevronDown, CircleAlert,
  Compass, FileText, FlaskConical, Globe2, History, ImagePlus, Layers3,
  LayoutTemplate, Loader2, Monitor, MousePointer2, Pause, Plane, Play,
  RefreshCw, ShieldCheck, Sparkles, Wand2,
} from 'lucide-react';
import type { LabActions, LabCandidateView, LabViewModel } from '../../lib/desaing/labTypes';
import './DesaingLab.css';

export interface DesaingLabProps { model: LabViewModel; actions: LabActions }
type Scenario = 'success' | 'partial_failure' | 'interrupted';

const stateLabels: Record<LabCandidateView['jobState'], string> = {
  pending: 'Pendiente', running: 'En proceso', result_received: 'Recibido',
  validating: 'En revisión técnica', needs_review: 'Por revisar', approved: 'Aprobado',
  rejected: 'Rechazado', failed: 'Falló', cancelled: 'Cancelado', uncertain: 'Por recuperar',
};
const jobStateText = (value: string) => value.replace(
  /\b(pending|running|result_received|validating|needs_review|approved|rejected|failed|cancelled|uncertain)\b/g,
  state => stateLabels[state as LabCandidateView['jobState']].toLocaleLowerCase('es'),
);
const workspaceOptions = [
  { value: 'onboarding', label: 'Onboarding', icon: Compass },
  { value: 'presentations', label: 'Presentaciones', icon: Monitor },
  { value: 'free_design', label: 'Diseño libre', icon: LayoutTemplate },
] as const;

/** The preview preserves the document's pixel canvas while fitting narrow/iPad screens. */
function CompositionPreview({ composition }: { composition: LabViewModel['composition'] }) {
  const container = useRef<HTMLDivElement>(null);
  const [availableWidth, setAvailableWidth] = useState(560);
  useEffect(() => {
    const element = container.current;
    if (!element) return;
    const measure = () => setAvailableWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const scale = Math.min(Math.max(availableWidth, 1) / composition.width, 460 / composition.height, 1);
  return <div ref={container} style={{ width: '100%', minWidth: 0, display: 'flex', justifyContent: 'center' }}>
    <div style={{ width: composition.width * scale, height: composition.height * scale, position: 'relative', flexShrink: 0 }}>
      <iframe
        className="dl-preview-frame"
        title="Vista previa HTML"
        sandbox=""
        srcDoc={composition.html}
        width={composition.width}
        height={composition.height}
        style={{ width: composition.width, height: composition.height, maxHeight: 'none',
          transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0 }}
      />
    </div>
  </div>;
}

function CandidateCard({ candidate, selected, busy, onSelect }: {
  candidate: LabCandidateView; selected: boolean; busy: boolean; onSelect: (id: string) => Promise<void>;
}) {
  const stateTone = candidate.resultApproved ? 'dl-badge-green'
    : candidate.jobState === 'failed' || candidate.jobState === 'rejected' ? 'dl-badge-red' : '';
  return <article className="dl-candidate" data-selected={selected}>
    <button type="button" className="dl-candidate-select" disabled={busy}
      aria-pressed={selected} aria-label={`Seleccionar ${candidate.title}`}
      onClick={() => void onSelect(candidate.id)}>
      <div className="dl-candidate-visual">
        <img src={candidate.previewUrl} alt={`${candidate.title}, muestra diagramática de simulación`} />
        {selected && <span className="dl-candidate-selected"><Check size={13} aria-hidden="true" /></span>}
      </div>
      <div className="dl-candidate-copy">
        <div className="dl-candidate-title">
          <span>{candidate.title}</span>
          <span className={`dl-badge ${candidate.quality === 'medium' ? 'dl-badge-green' : ''}`}>
            {candidate.quality === 'medium' ? 'Media' : 'Borrador'}
          </span>
        </div>
        <div className="dl-inline" style={{ gap: 5 }}>
          <span className={`dl-badge ${stateTone}`}>{stateLabels[candidate.jobState]}</span>
          {candidate.directionApproved && <span className="dl-candidate-subtitle">Dirección aprobada</span>}
        </div>
      </div>
    </button>
  </article>;
}

export function DesaingLab({ model, actions }: DesaingLabProps) {
  const [prompt, setPrompt] = useState(model.prompt);
  const [scenario, setScenario] = useState<Scenario>('success');
  const [title, setTitle] = useState(model.composition.title);
  const [subtitle, setSubtitle] = useState(model.composition.subtitle);
  const [position, setPosition] = useState({ x: model.composition.x, y: model.composition.y, widthPercent: model.composition.widthPercent });
  const generationPointer = useRef(false);
  const submittedPosition = useRef('');
  useEffect(() => setPrompt(model.prompt), [model.prompt]);
  useEffect(() => setTitle(model.composition.title), [model.composition.title]);
  useEffect(() => setSubtitle(model.composition.subtitle), [model.composition.subtitle]);
  useEffect(() => {
    if (model.busy) return;
    const saved = { x: model.composition.x, y: model.composition.y, widthPercent: model.composition.widthPercent };
    setPosition(saved);
    submittedPosition.current = JSON.stringify(saved);
  }, [model.composition.x, model.composition.y, model.composition.widthPercent, model.busy]);

  const selected = model.candidates.find(candidate => candidate.id === model.selectedId);
  const savePrompt = async (): Promise<boolean> => {
    if (prompt === model.prompt) return true;
    try { await actions.onPrompt(prompt); return true; }
    // The entry controller displays the storage error. Do not continue using an older prompt.
    catch { return false; }
  };
  const withSavedPrompt = async (action: () => Promise<void>) => {
    generationPointer.current = false;
    if (!await savePrompt()) return;
    await action();
  };
  const promptActionPointer = {
    onPointerDown: () => { generationPointer.current = true; },
    onPointerUp: () => { generationPointer.current = false; },
    onPointerCancel: () => { generationPointer.current = false; },
  };
  const generate = async (count: 1 | 5) => {
    generationPointer.current = false;
    if (!await savePrompt()) return;
    await actions.onGenerate(count, scenario);
  };
  const savePosition = async () => {
    const serialized = JSON.stringify(position);
    if (serialized === submittedPosition.current) return;
    submittedPosition.current = serialized;
    await actions.onCompositionChange(position);
  };
  const readyToGenerate = Boolean(prompt.trim()) && Boolean(model.format) && !model.busy;
  const canReview = selected?.jobState === 'needs_review';
  const canApproveDirection = Boolean(selected && selected.quality === 'low' && !selected.directionApproved
    && (canReview || selected.resultApproved));
  const canMedium = Boolean(selected && selected.quality === 'low' && selected.directionApproved);
  const format = model.formats.find(item => item.id === model.format);

  return <div className="desaing-lab">
    <header className="dl-topbar">
      <div className="dl-topbar-inner">
        <div className="dl-brand">
          <span className="dl-brand-icon"><Sparkles size={20} strokeWidth={1.6} aria-hidden="true" /></span>
          <span className="dl-brand-name">ScoryDesign</span>
          <span className="dl-brand-divider" />
          <span className="dl-brand-subtitle">DesAIng · Laboratorio</span>
        </div>
        <div className="dl-topbar-status">
          <span className="dl-local-dot">Sesión local</span>
          <span>{model.actualCalls} llamadas a IA</span>
        </div>
      </div>
    </header>

    <main className="dl-container">
      <div className="dl-hero">
        <div>
          <div className="dl-eyebrow">Espacio experimental</div>
          <h1>Dale forma a la idea.</h1>
          <p className="dl-hero-description">Explora una dirección, revisa sus versiones y compón una pieza editable.</p>
        </div>
        <button type="button" className="dl-button" disabled={model.busy} onClick={() => void actions.onRecover()}>
          <RefreshCw size={14} aria-hidden="true" /> Recuperar sesión
        </button>
      </div>

      <div className="dl-simulation" role="note">
        <ShieldCheck size={19} strokeWidth={1.7} aria-hidden="true" />
        <div>
          <strong>Simulación local · Sin costo</strong>
          <p>Los aviones y mundos son muestras diagramáticas, no resultados de IA. Tus pruebas se guardan en este navegador.</p>
        </div>
      </div>

      <nav className="dl-workspaces" aria-label="Espacio de diseño">
        {workspaceOptions.map(({ value, label, icon: Icon }) => <button key={value} type="button" className="dl-workspace"
          aria-pressed={model.workspace === value} disabled={model.busy} data-commit-prompt {...promptActionPointer}
          onClick={() => void withSavedPrompt(() => actions.onWorkspace(value))}>
          <Icon size={15} aria-hidden="true" />{label}
        </button>)}
      </nav>

      {model.error && <div className="dl-error" role="alert"><CircleAlert size={17} aria-hidden="true" /><span>{model.error}</span></div>}
      {model.notice && <div className="dl-notice" role="status"><CheckCircle2 size={16} aria-hidden="true" /><span>{model.notice}</span></div>}

      <div className="dl-layout">
        <aside className="dl-sidebar dl-panel" aria-labelledby="dl-idea-heading">
          <div className="dl-panel-heading">
            <div className="dl-panel-title"><span className="dl-step">01</span><h2 id="dl-idea-heading">La idea</h2></div>
            <Wand2 size={16} strokeWidth={1.6} aria-hidden="true" />
          </div>
          <div className="dl-panel-content">
            <div className="dl-field">
              <span className="dl-label">Cómo quieres trabajar</span>
              <div className="dl-modes" role="group" aria-label="Modo de interacción">
                <button type="button" className="dl-mode" aria-pressed={model.mode === 'execute_change'} disabled={model.busy}
                  data-commit-prompt {...promptActionPointer}
                  onClick={() => void withSavedPrompt(() => actions.onMode('execute_change'))}><MousePointer2 size={13} aria-hidden="true" />Ejecutar cambio</button>
                <button type="button" className="dl-mode" aria-pressed={model.mode === 'explore_design'} disabled={model.busy}
                  data-commit-prompt {...promptActionPointer}
                  onClick={() => void withSavedPrompt(() => actions.onMode('explore_design'))}><Compass size={13} aria-hidden="true" />Explorar diseño</button>
              </div>
              <span className="dl-field-note">{model.mode === 'explore_design'
                ? 'Prueba alternativas y elige qué dirección desarrollar.'
                : 'Trabaja sobre una instrucción y un resultado concreto.'}</span>
            </div>

            <div className="dl-field dl-prompt-field">
              <label className="dl-label" htmlFor="dl-prompt">Tu instrucción <span className="dl-badge">Editable</span></label>
              <textarea id="dl-prompt" className="dl-textarea" value={prompt} disabled={model.busy}
                onChange={event => setPrompt(event.target.value)}
                onBlur={event => {
                  const target = event.relatedTarget as HTMLElement | null;
                  if (!generationPointer.current && !target?.closest('[data-commit-prompt]')) void savePrompt();
                }}
                placeholder="Quiero un avión que encaje a la derecha, conservando el título y la composición…" />
              <div className="dl-prompt-examples" aria-label="Ideas para probar">
                <button type="button" className="dl-chip" disabled={model.busy} data-commit-prompt {...promptActionPointer}
                  onClick={() => setPrompt('Crea un avión independiente que encaje a la derecha. Conserva el título y deja espacio para el texto.')}>
                  <Plane size={12} aria-hidden="true" />Un avión aquí</button>
                <button type="button" className="dl-chip" disabled={model.busy} data-commit-prompt {...promptActionPointer}
                  onClick={() => setPrompt('Explora una portada con un mundo como pieza principal, espacio en blanco y texto editable.')}>
                  <Globe2 size={12} aria-hidden="true" />Un mundo en portada</button>
              </div>
              <span className="dl-field-note">La instrucción se conserva al cambiar de modo.</span>
            </div>

            <div className="dl-field">
              <label className="dl-label" htmlFor="dl-format">Formato de la composición</label>
              <select id="dl-format" className="dl-select" value={model.format} disabled={model.busy}
                data-commit-prompt {...promptActionPointer}
                onChange={event => { const value = event.target.value; void withSavedPrompt(() => actions.onFormat(value)); }}>
                {model.formats.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              <span className="dl-field-note">Presentaciones, portadas y páginas comparten las mismas piezas.</span>
            </div>

            <div className="dl-stack">
              <button type="button" className="dl-button dl-button-primary dl-button-full" disabled={!readyToGenerate}
                data-commit-prompt {...promptActionPointer} onClick={() => void generate(1)}>
                {model.busy ? <Loader2 size={15} className="dl-spin" aria-hidden="true" /> : <Sparkles size={15} aria-hidden="true" />}
                Simular un borrador
              </button>
              <button type="button" className="dl-button dl-button-full" disabled={!readyToGenerate}
                data-commit-prompt {...promptActionPointer} onClick={() => void generate(5)}>
                <Layers3 size={15} aria-hidden="true" />Simular cinco ideas
              </button>
            </div>

            <hr className="dl-separator" />
            <div className="dl-budget">
              <div className="dl-stat-row"><span>Llamadas reales</span><strong>{model.actualCalls}</strong></div>
              <div className="dl-stat-row"><span>Ejecuciones simuladas</span><strong>{model.simulatedCalls}</strong></div>
              <div className="dl-stat-row"><span>Costo de esta sesión</span><strong>$0</strong></div>
              <details className="dl-qa-details">
                <summary>Pruebas de recuperación</summary>
                <label htmlFor="dl-scenario" className="dl-field-note">Resultado que simulará el siguiente encargo</label>
                <select id="dl-scenario" className="dl-select" value={scenario} disabled={model.busy}
                  onChange={event => setScenario(event.target.value as Scenario)}>
                  <option value="success">Completar correctamente</option>
                  <option value="partial_failure">Simular un fallo parcial</option>
                  <option value="interrupted">Simular interrupción</option>
                </select>
              </details>
            </div>
          </div>
        </aside>

        <div className="dl-main-column">
          <section className="dl-panel" aria-labelledby="dl-directions-heading">
            <div className="dl-panel-heading">
              <div className="dl-panel-title"><span className="dl-step">02</span><h2 id="dl-directions-heading">Direcciones y versiones</h2></div>
              <span className="dl-result-count">{model.candidates.length} {model.candidates.length === 1 ? 'pieza' : 'piezas'}</span>
            </div>
            {model.candidates.length > 0
              ? <div className="dl-gallery">{model.candidates.map(candidate => <CandidateCard key={candidate.id}
                candidate={candidate} selected={candidate.id === model.selectedId} busy={model.busy} onSelect={actions.onSelect} />)}</div>
              : <div className="dl-empty">
                <div className="dl-empty-icon"><Plane size={34} strokeWidth={1.25} aria-hidden="true" /></div>
                <h3>Una idea, varias posibilidades.</h3>
                <p>Escribe una instrucción y prueba un borrador o cinco alternativas. Después elige una para llevarla a tu composición.</p>
              </div>}
            {selected && <div className="dl-selection">
              <div className="dl-selection-title">
                <strong>{selected.title}</strong>
                <span className="dl-candidate-subtitle">{selected.quality === 'medium' ? 'Versión media' : 'Dirección en borrador'}</span>
              </div>
              <div className="dl-inline">
                <button type="button" className="dl-button dl-button-small" disabled={model.busy || !canApproveDirection}
                  onClick={() => void actions.onApproveDirection(selected.id)}>
                  <Check size={14} aria-hidden="true" />{selected.directionApproved ? 'Dirección aprobada' : 'Aprobar dirección'}
                </button>
                <button type="button" className="dl-button dl-button-small" disabled={model.busy || !canMedium}
                  onClick={() => void actions.onMedium(selected.id)}>
                  <Sparkles size={14} aria-hidden="true" />Simular versión en media
                </button>
                <button type="button" className="dl-button dl-button-small dl-button-accent" disabled={model.busy || !canReview || selected.resultApproved}
                  onClick={() => void actions.onApproveResult(selected.id)}>
                  <CheckCircle2 size={14} aria-hidden="true" />{selected.resultApproved ? 'Resultado aprobado' : 'Aprobar resultado'}
                </button>
                <button type="button" className="dl-button dl-button-small dl-button-primary" disabled={model.busy || !selected.resultApproved}
                  onClick={() => void actions.onMount(selected.id)}>
                  <ImagePlus size={14} aria-hidden="true" />Montar en HTML
                </button>
              </div>
              <p>{selected.resultApproved
                ? 'La pieza está lista para montarla y reutilizarla. Cambiar su posición no genera otra imagen.'
                : selected.quality === 'medium'
                  ? 'Revisa esta nueva versión y aprueba el resultado antes de montarlo en la composición.'
                  : selected.directionApproved
                  ? 'La dirección está guardada. La versión en media es otra ejecución y también necesita revisión.'
                  : 'Aprobar la dirección guarda tu elección; no crea una nueva versión.'}</p>
            </div>}
          </section>

          <section className="dl-panel" aria-labelledby="dl-composition-heading">
            <div className="dl-panel-heading">
              <div className="dl-panel-title"><span className="dl-step">03</span><h2 id="dl-composition-heading">Composición editable</h2></div>
              <button type="button" className="dl-button dl-button-small" disabled={model.busy || !model.composition.html}
                onClick={() => void actions.onExportHtml()}><ArrowDownToLine size={13} aria-hidden="true" />Exportar HTML</button>
            </div>
            <div className="dl-composition-body">
              <div className="dl-preview">
                {model.composition.html ? <CompositionPreview composition={model.composition} />
                  : <div className="dl-preview-empty"><LayoutTemplate size={29} strokeWidth={1.3} aria-hidden="true" />Aquí aparecerá tu composición.</div>}
              </div>
              <div className="dl-composition-controls">
                <h3>Editar la pieza</h3>
                <div className="dl-field">
                  <label className="dl-label" htmlFor="dl-title">Título</label>
                  <input id="dl-title" className="dl-input" value={title} disabled={model.busy}
                    onChange={event => setTitle(event.target.value)}
                    onBlur={() => { if (title !== model.composition.title) void actions.onCompositionChange({ title }); }} />
                </div>
                <div className="dl-field">
                  <label className="dl-label" htmlFor="dl-subtitle">Subtítulo</label>
                  <input id="dl-subtitle" className="dl-input" value={subtitle} disabled={model.busy}
                    onChange={event => setSubtitle(event.target.value)}
                    onBlur={() => { if (subtitle !== model.composition.subtitle) void actions.onCompositionChange({ subtitle }); }} />
                </div>
                {([
                  { key: 'x', label: 'Posición horizontal', min: 0, max: 80 },
                  { key: 'y', label: 'Posición vertical', min: 0, max: 80 },
                  { key: 'widthPercent', label: 'Tamaño de la pieza', min: 10, max: 80 },
                ] as const).map(({ key, label, min, max }) => <div className="dl-field" key={key}>
                  <label className="dl-label" htmlFor={`dl-${key}`}>{label}<span className="dl-range-value">{Math.round(position[key] * 10) / 10}%</span></label>
                  <input id={`dl-${key}`} className="dl-range" type="range" min={min} max={max} step={1}
                    value={position[key]} disabled={model.busy || !model.composition.mounted}
                    onChange={event => setPosition(current => ({ ...current, [key]: Number(event.target.value) }))}
                    onPointerUp={() => void savePosition()} onKeyUp={() => void savePosition()} onBlur={() => void savePosition()} />
                </div>)}
                <span className="dl-field-note">{model.composition.mounted
                  ? 'Texto, posición y escala: cero llamadas de imagen.'
                  : 'Aprueba y monta una pieza para ajustar su posición.'}</span>
              </div>
            </div>
            <div className="dl-composition-foot">
              <span>{format?.label ?? 'Lienzo'} · {model.composition.width} × {model.composition.height} px</span>
              <span className="dl-inline"><FileText size={12} aria-hidden="true" />Revisión {model.composition.revision} · HTML + piezas independientes</span>
            </div>
          </section>
        </div>
      </div>

      <details className="dl-panel dl-jobs" open={model.jobs.some(job => job.pending || job.canCancel)}>
        <summary>
          <span className="dl-jobs-heading"><History size={16} strokeWidth={1.6} aria-hidden="true" />Historial de simulaciones<span className="dl-badge">{model.jobs.length}</span></span>
          <ChevronDown size={15} aria-hidden="true" />
        </summary>
        <div className="dl-job-list">
          {model.jobs.length === 0 ? <p className="dl-jobs-empty">Tus encargos y su estado aparecerán aquí.</p>
            : model.jobs.map(job => <div className="dl-job" key={job.id}>
              <div><div className="dl-job-title">{job.label}</div><div className="dl-job-meta">{jobStateText(job.states)}</div></div>
              <div className="dl-inline">
                {job.pending && <button type="button" className="dl-button dl-button-small" disabled={model.busy}
                  onClick={() => void actions.onContinue(job.id)}><Play size={12} aria-hidden="true" />Continuar pendientes</button>}
                {job.canCancel && <button type="button" className="dl-button dl-button-small dl-button-quiet dl-button-danger" disabled={model.busy}
                  onClick={() => void actions.onCancel(job.id)}><Pause size={12} aria-hidden="true" />Cancelar</button>}
              </div>
            </div>)}
        </div>
      </details>

      <footer className="dl-footer">
        <span className="dl-inline"><FlaskConical size={12} aria-hidden="true" />DesAIng · Laboratorio de interacción y continuidad</span>
        <span className="dl-inline">Idea<ArrowRight size={11} aria-hidden="true" />Dirección<ArrowRight size={11} aria-hidden="true" />Composición</span>
      </footer>
    </main>
  </div>;
}

export default DesaingLab;
