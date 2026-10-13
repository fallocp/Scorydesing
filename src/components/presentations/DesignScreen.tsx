import { createContext, useContext, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type ReactNode } from 'react';
import { ArrowLeft, Check, Columns2, Loader2, MessageSquare, Minus, Plus, X } from 'lucide-react';
import { getSlideDimensions, type PresentationSlide } from '@/lib/presentations/presentationDocument';
import { sanitizePresentationHtml } from '@/lib/presentations/presentationHtml';
import { formatStepTime, type DesignStep } from '@/lib/presentations/designChatNatural';
import { DECK_STRUCTURE_LABELS, describeAccent, type DeckSystem } from '@/lib/presentations/deckSystem';
import { STYLE_ROLE_LABELS } from '@/lib/presentations/styleSpec';
import { PresentationCanvas } from './PresentationCanvas';
import './DesignScreen.css';

/** Zoom and before/after comparison of the design screen, read by the canvas wherever it is rendered. */
interface DesignScreenView { zoom: 'fit' | number; compare: { on: boolean; position: number; beforeHtml?: string } }
const ViewContext = createContext<DesignScreenView>({ zoom: 'fit', compare: { on: false, position: 50 } });
const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 1, 1.25, 1.5, 2];
const editing = (target: EventTarget | null) => target instanceof HTMLElement
  && (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT' || target.tagName === 'SELECT' || target.isContentEditable);

export interface DesignScreenLayoutProps {
  breadcrumb: string; onBack(): void; backDisabled?: boolean;
  /** Format toggle, base and history, in the top bar. */
  controls: ReactNode; apply: ReactNode;
  thumbnails: ReactNode; toolbar: ReactNode; canvas: ReactNode; versions: ReactNode; chat: ReactNode;
  /** Design shown as «Antes» in the comparison; absent = nothing to compare. */
  beforeHtml?: string;
  onUndo?(): void;
}

/** Three panels: slides, canvas with zoom and versions, and the chat. One bar on top. */
export function DesignScreenLayout(props: DesignScreenLayoutProps) {
  const [zoom, setZoom] = useState<'fit' | number>('fit');
  const [compare, setCompare] = useState(false), [position, setPosition] = useState(50);
  const [chatOpen, setChatOpen] = useState(false);
  const undo = useRef(props.onUndo); undo.current = props.onUndo;
  const canCompare = !!props.beforeHtml;
  useEffect(() => { if (!canCompare) setCompare(false); }, [canCompare]);
  // Ctrl+Z / Cmd+Z goes back one version, except while typing.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z' && !editing(event.target) && undo.current) {
        event.preventDefault(); undo.current();
      }
      if (event.key === 'Escape') setChatOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const step = (direction: 1 | -1) => setZoom(current => {
    const value = current === 'fit' ? 0.5 : current;
    const index = ZOOM_STEPS.findIndex(item => item >= value - 0.001);
    return ZOOM_STEPS[Math.min(ZOOM_STEPS.length - 1, Math.max(0, (index < 0 ? ZOOM_STEPS.length - 1 : index) + direction))];
  });
  return <ViewContext.Provider value={{ zoom, compare: { on: compare && canCompare, position, beforeHtml: props.beforeHtml } }}>
    <header className="ds-topbar">
      <button type="button" className="dc-button ds-back" onClick={props.onBack} disabled={props.backDisabled}><ArrowLeft size={15} aria-hidden />Presentaciones</button>
      <p className="ds-breadcrumb" aria-label="Ubicación">{props.breadcrumb}</p>
      <div className="ds-controls">{props.controls}
        <button type="button" className="dc-button" aria-pressed={compare && canCompare} disabled={!canCompare} onClick={() => setCompare(value => !value)}
          title={canCompare ? 'Comparar con la versión anterior' : 'Necesitas una versión para comparar'}><Columns2 size={15} aria-hidden />Comparar</button>
        <button type="button" className="dc-button ds-chat-toggle" aria-expanded={chatOpen} aria-controls="ds-chat" onClick={() => setChatOpen(value => !value)}>
          <MessageSquare size={15} aria-hidden />Chat</button>
      </div>
      <div className="ds-apply">{props.apply}</div>
    </header>
    <div className="ds-body">
      {props.thumbnails}
      <main className="ds-center" aria-label="Lienzo del diseño">
        <div className="ds-toolbar" role="toolbar" aria-label="Herramientas del lienzo">
          <div className="ds-tools">{props.toolbar}</div>
          <div className="ds-zoom" role="group" aria-label="Zoom">
            <button type="button" className="dc-button" aria-pressed={zoom === 'fit'} onClick={() => setZoom('fit')}>Ajustar</button>
            <button type="button" className="dc-button" aria-pressed={zoom === 1} onClick={() => setZoom(1)}>100%</button>
            <button type="button" className="dc-button dc-icon" aria-label="Alejar" onClick={() => step(-1)}><Minus size={15} /></button>
            <span className="ds-zoom-value" aria-live="polite">{zoom === 'fit' ? 'Ajustado' : `${Math.round(zoom * 100)}%`}</span>
            <button type="button" className="dc-button dc-icon" aria-label="Acercar" onClick={() => step(1)}><Plus size={15} /></button>
          </div>
        </div>
        <div className="ds-canvas">{props.canvas}</div>
        {compare && canCompare && <label className="ds-compare-slider">Antes<input type="range" min={0} max={100} value={position}
          aria-label="Deslizador antes y después" aria-valuetext={`${position}% antes`} onChange={event => setPosition(Number(event.target.value))} />Después</label>}
        <div className="ds-versions">{props.versions}</div>
      </main>
      <aside id="ds-chat" className={`ds-chat${chatOpen ? ' is-open' : ''}`} aria-label="Chat de diseño">
        <button type="button" className="dc-button dc-icon ds-chat-close" aria-label="Cerrar chat" onClick={() => setChatOpen(false)}><X size={16} /></button>
        {props.chat}
      </aside>
    </div>
  </ViewContext.Provider>;
}

/** The slide at the chosen zoom; with the comparison on, «Antes» covers the left part up to the slider. */
export function DesignZoomCanvas({ html, title }: { html: string; title: string }) {
  const view = useContext(ViewContext);
  const host = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const { width, height } = getSlideDimensions(html);
  useEffect(() => {
    if (!host.current || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setBox({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(host.current);
    return () => observer.disconnect();
  }, []);
  const fit = box.width && box.height ? Math.min((box.width - 32) / width, (box.height - 32) / height) : 0;
  const scale = Math.max(0.05, view.zoom === 'fit' ? fit : view.zoom);
  const before = view.compare.on ? view.compare.beforeHtml : undefined;
  const frame = (source: string, label: string) => <iframe title={label} srcDoc={sanitizePresentationHtml(source)} sandbox="" referrerPolicy="no-referrer"
    style={{ border: 0, width, height, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', inset: 0 }} />;
  return <div ref={host} className="ds-stage">
    {box.width > 0 && <div className="ds-sheet" style={{ width: width * scale, height: height * scale }}>
      {frame(html, title)}
      {before && <><div className="ds-before" style={{ clipPath: `inset(0 ${100 - view.compare.position}% 0 0)` }}>{frame(before, 'Antes del cambio')}</div>
        <div className="ds-divider" style={{ left: `${view.compare.position}%` }} aria-hidden />
        <span className="ds-tag ds-tag-before" aria-hidden>Antes</span><span className="ds-tag ds-tag-after" aria-hidden>Después</span></>}
    </div>}
  </div>;
}

/** Renders its slide only while it is (almost) visible. */
function LazyThumb({ html, title }: { html: string; title: string }) {
  const host = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    if (visible || !host.current) return;
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { setVisible(true); observer.disconnect(); } },
      { rootMargin: '240px 0px' });
    observer.observe(host.current);
    return () => observer.disconnect();
  }, [visible]);
  return <div ref={host} className="ds-thumb-preview" aria-hidden>{visible ? <PresentationCanvas html={html} title={title} /> : <span className="ds-thumb-placeholder" />}</div>;
}

/** Slides of the deck. Arrows move between them, Enter opens one; drag one to the chat to cite it as @N. */
export function SlideThumbnails({ slides, current, onSelect, disabled }: {
  slides: ReadonlyArray<PresentationSlide>; current: number; onSelect(index: number): void; disabled?: boolean;
}) {
  const list = useRef<HTMLOListElement>(null);
  const [focus, setFocus] = useState(current);
  useEffect(() => { setFocus(current); list.current?.querySelectorAll('button')[current]?.scrollIntoView?.({ block: 'nearest' }); }, [current]);
  const move = (event: ReactKeyboardEvent<HTMLOListElement>) => {
    const delta = event.key === 'ArrowDown' || event.key === 'ArrowRight' ? 1 : event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 0;
    const target = event.key === 'Home' ? 0 : event.key === 'End' ? slides.length - 1 : delta ? Math.min(slides.length - 1, Math.max(0, focus + delta)) : -1;
    if (target < 0) return;
    event.preventDefault(); setFocus(target);
    list.current?.querySelectorAll('button')[target]?.focus();
  };
  return <nav className="ds-thumbs" aria-label="Diapositivas">
    <ol ref={list} onKeyDown={move}>
      {slides.map((slide, index) => <li key={slide.id}>
        <button type="button" tabIndex={index === focus ? 0 : -1} aria-current={index === current ? 'page' : undefined}
          aria-label={`Diapositiva ${index + 1}: ${slide.title}${index === current ? ' (actual)' : ''}`} disabled={disabled && index !== current}
          title={disabled ? 'Espera a que termine el cambio en curso' : `${index + 1}. ${slide.title} · arrástrala al chat para citarla como @${index + 1}`}
          draggable onDragStart={event => { event.dataTransfer.setData('application/x-scory-slide', String(index + 1)); event.dataTransfer.setData('text/plain', `@${index + 1} `); event.dataTransfer.effectAllowed = 'copy'; }}
          onFocus={() => setFocus(index)} onClick={() => { if (index !== current) onSelect(index); }}>
          <span className="ds-thumb-number">{index + 1}</span>
          <LazyThumb html={slide.html} title={`Miniatura de la diapositiva ${index + 1}`} />
        </button>
      </li>)}
    </ol>
  </nav>;
}

/** «Sistema de la presentación», read only: what the slides share (tokens, accents, cards, backgrounds, photos) and their arrangements. */
export function DeckSystemPanel({ system, status, slides }: { system: DeckSystem | null; status: 'measuring' | 'ready' | 'failed'; slides: ReadonlyArray<PresentationSlide> }) {
  const tokens = system?.tokens, paper = tokens?.backgrounds[0]?.color ?? '#FFFFFF';
  return <details className="ds-deck-system">
    <summary>Sistema de la presentación{system ? ` · ${system.slides} diapositivas medidas` : status === 'measuring' ? ' · midiendo…' : ' · no disponible'}</summary>
    {!system || !tokens ? <p className="dc-muted" role="status">{status === 'measuring' ? 'Midiendo las diapositivas en tu navegador, sin IA…' : 'No pude medir las diapositivas de esta presentación.'}</p> : <>
      <p className="dc-muted">Lo que comparten tus diapositivas, medido sin IA. Lo aplico al crear o rediseñar; lo que tú pidas manda.</p>
      <h4>Tipografía y color</h4>
      <ul className="ds-deck-list">{tokens.roles.filter(token => token.firm).map(token => <li key={token.role}>
        <span className="ds-deck-sample" aria-hidden style={{ background: paper, color: token.color.value, fontFamily: `"${token.family.value}", sans-serif`,
          fontWeight: token.weight.value, fontStyle: token.italic.value ? 'italic' : 'normal' }}>Aa</span>
        <span><strong>{STYLE_ROLE_LABELS[token.role]}</strong> {token.family.value} {token.size.value} px · {token.weight.value}{token.italic.value ? ' · itálica' : ''}{token.upper.value ? ' · mayúsculas' : ''}
          {' · '}<span className="ds-deck-swatch" aria-hidden style={{ background: token.color.value }} />{token.color.value} <span className="dc-muted">({token.color.support} de {token.slides})</span></span>
      </li>)}</ul>
      {tokens.accents.length > 0 && <><h4>Acentos</h4><ul className="ds-deck-list">{tokens.accents.slice(0, 6).map((accent, index) => <li key={index}>
        <span className="ds-deck-swatch" aria-hidden style={{ background: accent.gradient ?? accent.color }} />
        <span>{describeAccent(accent)} <span className="dc-muted">· {Math.round(accent.frequency * 100)} % ({accent.slides} de {tokens.roles.find(token => token.role === accent.role)?.slides ?? accent.slides})</span></span></li>)}</ul></>}
      <h4>Componentes</h4>
      <ul className="ds-deck-list">
        {tokens.cards && <li><span className="ds-deck-card" aria-hidden style={{ background: tokens.cards.background, borderRadius: Math.min(tokens.cards.radius, 12),
          boxShadow: tokens.cards.shadow || undefined }} /><span>Tarjetas: fondo {tokens.cards.background}, radio {tokens.cards.radius} px, {tokens.cards.shadow ? 'sombra suave' : 'sin sombra'}
          {tokens.cards.inner ? `, ícono o número ${tokens.cards.inner === 'side' ? 'al lado' : 'arriba'}` : ''} <span className="dc-muted">({tokens.cards.slides})</span></span></li>}
        {tokens.decorations.map((line, index) => <li key={index}><span className="ds-deck-swatch" aria-hidden style={{ background: line.image || line.color }} />
          <span>Línea corta{line.below ? ` bajo ${STYLE_ROLE_LABELS[line.below].toLowerCase()}` : ''}: {line.width}×{line.height} px <span className="dc-muted">({line.slides})</span></span></li>)}
        {tokens.backgrounds.map((ground, index) => <li key={`bg${index}`}><span className="ds-deck-swatch" aria-hidden style={{ background: ground.image || ground.color }} />
          <span>Fondo {ground.image ? 'con degradado' : ground.color}: diapositivas {ground.slides.slice(0, 8).join(', ')}{ground.slides.length > 8 ? '…' : ''}</span></li>)}
        {tokens.photo && <li><span className="ds-deck-swatch" aria-hidden /><span>Fotos: radio {tokens.photo.radius} px, {tokens.photo.fit}{tokens.photo.mask ? ', con máscara o degradado' : ''}{tokens.photo.bleed ? ', a sangre' : ''}
          {' '}<span className="dc-muted">({tokens.photo.slides})</span></span></li>}
      </ul>
      <h4>Acomodos</h4>
      <ul className="ds-deck-archetypes">{system.archetypes.map(item => { const slide = slides[item.exemplar - 1];
        return <li key={item.id}>{slide && <div className="ds-deck-thumb"><LazyThumb html={slide.html} title={`Ejemplar: diapositiva ${item.exemplar}`} /></div>}
          <span><strong>{DECK_STRUCTURE_LABELS[item.id]}</strong> · {item.members.length} {item.members.length === 1 ? 'diapositiva' : 'diapositivas'}
            <br /><span className="dc-muted">{item.label} · ejemplar: {item.exemplar}</span></span></li>; })}</ul>
    </>}
  </details>;
}

/** What the turn is doing, in the thread: «✓ Leí la diapositiva · 0.4 s», «Preparando el plan…». */
export function DesignSteps({ steps }: { steps: ReadonlyArray<DesignStep> }) {
  if (!steps.length) return null;
  return <ol className="ds-steps" aria-label="Pasos" role="status">
    {steps.map(item => <li key={item.id} data-status={item.status}>
      {item.status === 'running' ? <><Loader2 size={13} className="animate-spin" aria-hidden />{item.label}</>
        : item.status === 'done' ? <><Check size={13} aria-hidden />{item.doneLabel}{item.ms !== undefined ? ` · ${formatStepTime(item.ms)}` : ''}</>
        : <><X size={13} aria-hidden />{item.label.replace(/…$/, '')}: no se completó</>}
    </li>)}
  </ol>;
}
