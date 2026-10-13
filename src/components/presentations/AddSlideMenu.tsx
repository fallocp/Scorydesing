import { useEffect, useRef } from 'react';
import { Check, Loader2, Sparkles, Square } from 'lucide-react';

/** «Agregar slide» with the presentation's system (VITE_DESAING_ADD_SLIDE_NEW): «Nueva con IA», «En blanco», then the templates,
 * adapted to the deck unless «Usar plantilla tal cual». Keyboard: arrows, Home/End and Escape. */
export interface AddSlideMenuProps {
  templates: ReadonlyArray<{ title: string }>;
  busy: boolean; asIs: boolean; aiDisabled?: string;
  onAsIsChange(value: boolean): void; onNewWithAi(): void; onBlank(): void; onTemplate(index: number): void; onClose(): void;
}
export function AddSlideMenu(props: AddSlideMenuProps) {
  const menu = useRef<HTMLDivElement>(null);
  const items = () => Array.from(menu.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]:not([disabled])') ?? []);
  useEffect(() => { items()[0]?.focus(); }, []);
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') { event.preventDefault(); props.onClose(); return; }
    const list = items(), at = list.indexOf(document.activeElement as HTMLElement);
    const next = event.key === 'ArrowDown' ? (at + 1) % list.length : event.key === 'ArrowUp' ? (at - 1 + list.length) % list.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? list.length - 1 : -1;
    if (next >= 0 && list.length) { event.preventDefault(); list[next].focus(); }
  };
  const item = 'w-full text-left text-xs px-2 py-1.5 rounded hover:bg-muted focus:bg-muted focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed';
  return <>
    <div className="fixed inset-0 z-40" onClick={props.onClose} />
    <div ref={menu} role="menu" aria-label="Agregar slide" aria-busy={props.busy} onKeyDown={onKeyDown}
      className="absolute right-0 top-9 z-50 w-72 max-h-96 overflow-y-auto bg-background border rounded-lg shadow-xl p-1">
      <button type="button" role="menuitem" className={`${item} flex items-start gap-2`} disabled={props.busy || !!props.aiDisabled}
        title={props.aiDisabled} onClick={props.onNewWithAi}>
        <Sparkles className="h-4 w-4 mt-0.5 text-[#E85A2C]" aria-hidden="true" />
        <span><span className="block font-medium">Nueva con IA</span>
          <span className="block text-[11px] text-muted-foreground">Escribe el contenido y te propongo el diseño con el estilo de la presentación.</span></span>
      </button>
      <button type="button" role="menuitem" className={`${item} flex items-start gap-2`} disabled={props.busy} onClick={props.onBlank}>
        <Square className="h-4 w-4 mt-0.5" aria-hidden="true" />
        <span><span className="block font-medium">En blanco</span>
          <span className="block text-[11px] text-muted-foreground">Fondo y logo de la presentación, sin texto.</span></span>
      </button>
      <div role="separator" className="my-1 border-t" />
      <p className="text-[10px] text-muted-foreground uppercase tracking-wide px-2 py-1">Insertar plantilla aquí</p>
      <button type="button" role="menuitemcheckbox" aria-checked={props.asIs} className={`${item} flex items-center gap-2`} disabled={props.busy}
        onClick={() => props.onAsIsChange(!props.asIs)}>
        <span className="h-3.5 w-3.5 border rounded-sm flex items-center justify-center" aria-hidden="true">{props.asIs && <Check className="h-3 w-3" />}</span>
        Usar plantilla tal cual
      </button>
      {props.templates.map((template, index) => (
        <button key={index} type="button" role="menuitem" className={`${item} truncate`} disabled={props.busy} onClick={() => props.onTemplate(index)}>
          {template.title}
        </button>
      ))}
      {props.busy && <p role="status" className="flex items-center gap-2 text-[11px] text-muted-foreground px-2 py-1.5">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />Preparando la diapositiva con el estilo de la presentación…</p>}
    </div>
  </>;
}
