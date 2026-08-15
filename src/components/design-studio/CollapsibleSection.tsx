/**
 * CollapsibleSection — encabezado plegable con el mismo aspecto en todo el studio.
 *
 * La página del Design Studio es una columna larga: el carrusel, el armado del PDF
 * y los 50 mockups guardados viven uno debajo del otro, así que llegar a lo de
 * abajo es un scroll enorme aunque solo estés trabajando en una cosa. Cada bloque
 * grande se puede cerrar y la navegación se vuelve corta.
 *
 * El encabezado completo es el botón: en un bloque cerrado el único blanco de clic
 * obvio es su título, y obligar a apuntarle a un chevrón de 16px es peor. Por eso
 * `aside` recibe texto, no controles — un botón dentro de otro botón no es HTML
 * válido y el clic interno dispararía el plegado.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp, type LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';

interface CollapsibleSectionProps {
  title: string;
  Icon?: LucideIcon;
  /** Línea de contexto bajo el título. Visible abierto y cerrado. */
  subtitle?: ReactNode;
  /** Al lado del título: contador, estado. Sin controles. */
  badge?: ReactNode;
  /** A la derecha, antes del chevrón: pistas de uso. Sin controles. */
  aside?: ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** Clases del contenedor del contenido. */
  bodyClassName?: string;
  children: ReactNode;
}

export function CollapsibleSection({
  title,
  Icon,
  subtitle,
  badge,
  aside,
  defaultOpen = true,
  className,
  bodyClassName,
  children,
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <section className={cn('rounded-lg border border-border/60 bg-muted/20', className)}>
      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        className={cn(
          'flex w-full items-start justify-between gap-3 rounded-lg px-4 py-3 text-left transition-colors',
          'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-foreground">
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {title}
            {badge}
          </span>
          {subtitle && (
            <span className="mt-0.5 block text-xs text-muted-foreground">{subtitle}</span>
          )}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {aside && <span className="hidden text-xs text-muted-foreground sm:block">{aside}</span>}
          {isOpen ? (
            <ChevronUp className="h-4 w-4 text-muted-foreground" />
          ) : (
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          )}
        </span>
      </button>

      {isOpen && (
        <div className={cn('border-t border-border/60 p-4', bodyClassName)}>{children}</div>
      )}
    </section>
  );
}
