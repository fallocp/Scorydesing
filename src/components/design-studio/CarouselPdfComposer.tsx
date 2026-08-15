/**
 * CarouselPdfComposer — arma el PDF de LinkedIn eligiendo las piezas y su orden.
 *
 * Existe por lo que pasa después de montar la marca: "Montar marca" guarda una
 * variante NUEVA, así que la pieza final no es la que generó el carrusel y la
 * galería la ordena por fecha de creación, no por orden de lectura. El export
 * automático del carrusel sigue apuntando a los slides sin marca, y no hay forma
 * de que adivine qué variante quedó buena ni en qué posición va.
 *
 * Para Instagram no hace falta: las imágenes se bajan una por una y el orden lo
 * pone la app al subirlas. El PDF es el único entregable donde el orden queda
 * congelado en el archivo.
 */

import { useMemo, useState } from 'react';
import { FileText, Loader2, MoveLeft, MoveRight, X } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import type { SavedMockup } from '@/hooks/useDesignMockups';
import { exportOrderedPdf } from '@/utils/design-studio/exportCarousel';
import { CollapsibleSection } from './CollapsibleSection';

interface CarouselPdfComposerProps {
  mockups: SavedMockup[];
}

export function CarouselPdfComposer({ mockups }: CarouselPdfComposerProps) {
  const { toast } = useToast();
  /** Ids en orden de lectura. El arreglo ES el orden: la posición es el número. */
  const [order, setOrder] = useState<string[]>([]);
  const [fileName, setFileName] = useState('carrusel');
  const [isExporting, setIsExporting] = useState(false);
  /** Tamaño de las miniaturas del selector. */
  const [tileSize, setTileSize] = useState<'md' | 'lg'>('md');

  const byId = useMemo(() => new Map(mockups.map((m) => [m.id, m])), [mockups]);

  /**
   * Piezas elegidas, saltando las que ya no existen.
   *
   * Un mockup borrado desde la galería sigue en `order` hasta que se re-renderiza
   * esto, y exportar un id fantasma tiraría el render server con una URL muerta.
   */
  const selected = useMemo(
    () => order.map((id) => byId.get(id)).filter((m): m is SavedMockup => !!m),
    [order, byId],
  );

  /** Mezclar formatos deja bandas blancas: se avisa antes, no después. */
  const mixedPlatforms = new Set(selected.map((m) => m.platform)).size > 1;

  const positionOf = (id: string) => order.indexOf(id);

  const toggle = (id: string) => {
    setOrder((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const move = (from: number, to: number) => {
    setOrder((prev) => {
      if (to < 0 || to >= prev.length) return prev;
      const next = [...prev];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  };

  const handleExport = async () => {
    if (selected.length === 0) return;
    setIsExporting(true);
    try {
      const pages = await exportOrderedPdf({
        imageUrls: selected.map((m) => m.image_url),
        prefix:
          fileName
            .trim()
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '')
            .slice(0, 60) || 'carrusel',
      });
      toast({
        title: `PDF con ${pages} página(s)`,
        description: 'En el orden que elegiste, con la marca que ya traían las imágenes.',
      });
    } catch (err) {
      toast({
        title: 'Error al exportar el PDF',
        description:
          err instanceof Error
            ? err.message
            : 'Revisa que el render server esté corriendo (cd renderer && node scripts/render-server.js)',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(false);
    }
  };

  if (mockups.length < 2) return null;

  return (
    <CollapsibleSection
      title="Armar PDF en orden"
      Icon={FileText}
      defaultOpen={false}
      bodyClassName="space-y-4 p-4"
      badge={
        order.length > 0 ? (
          <Badge variant="secondary" className="text-[10px] font-normal">
            {order.length} página(s)
          </Badge>
        ) : null
      }
    >
          <p className="text-xs text-muted-foreground">
            Para el PDF de LinkedIn. Elige las piezas ya terminadas —con la marca y el
            disclaimer montados— y dales el orden de lectura. Las imágenes se usan tal cual:
            no se les monta nada encima.
          </p>

          {/* ---------- El orden elegido ---------- */}
          {selected.length > 0 && (
            <div className="space-y-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Orden de lectura
              </Label>
              <ol className="flex flex-wrap gap-2">
                {selected.map((mockup, i) => (
                  <li
                    key={mockup.id}
                    className="w-[168px] space-y-1 rounded-md border border-border bg-background p-2"
                  >
                    <div className="relative">
                      <img
                        src={mockup.image_url}
                        alt={`Página ${i + 1}`}
                        className="aspect-square w-full rounded bg-muted/40 object-contain"
                        loading="lazy"
                      />
                      <span className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                        {i + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggle(mockup.id)}
                        aria-label={`Quitar la página ${i + 1} del PDF`}
                        className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-black/60 text-white transition hover:bg-destructive"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                    <div className="flex justify-between">
                      <button
                        type="button"
                        onClick={() => move(i, i - 1)}
                        disabled={i === 0}
                        aria-label={`Mover la página ${i + 1} hacia atrás`}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                      >
                        <MoveLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => move(i, i + 1)}
                        disabled={i === selected.length - 1}
                        aria-label={`Mover la página ${i + 1} hacia adelante`}
                        className="flex h-7 w-7 items-center justify-center rounded text-muted-foreground transition hover:bg-muted disabled:opacity-30"
                      >
                        <MoveRight className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                ))}
              </ol>
              {mixedPlatforms && (
                <p className="text-[11px] text-amber-700">
                  Hay piezas de formatos distintos. Todas las páginas van al tamaño de la
                  primera y las que no coincidan entran completas, con bandas blancas a los
                  lados.
                </p>
              )}
            </div>
          )}

          {/* ---------- La galería para elegir ---------- */}
          <div className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Clic para agregar o quitar
              </Label>
              {/* Las piezas se distinguen por su texto, y a miniatura chica no se
                  lee: elegir la versión correcta es imposible a ciegas. */}
              <div className="flex items-center gap-1">
                <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  Tamaño
                </span>
                {(['md', 'lg'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => setTileSize(size)}
                    aria-pressed={tileSize === size}
                    className={cn(
                      'rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      tileSize === size
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {size === 'md' ? 'Mediano' : 'Grande'}
                  </button>
                ))}
              </div>
            </div>
            <div
              className={cn(
                'grid gap-3 overflow-y-auto pr-1',
                tileSize === 'lg'
                  ? 'max-h-[640px] grid-cols-1 sm:grid-cols-2 xl:grid-cols-3'
                  : 'max-h-[460px] grid-cols-2 sm:grid-cols-3 xl:grid-cols-4',
              )}
            >
              {mockups.map((mockup) => {
                const position = positionOf(mockup.id);
                const isSelected = position >= 0;
                return (
                  <button
                    key={mockup.id}
                    type="button"
                    onClick={() => toggle(mockup.id)}
                    aria-pressed={isSelected}
                    aria-label={
                      isSelected
                        ? `Quitar del PDF, hoy es la página ${position + 1}`
                        : 'Agregar al PDF'
                    }
                    className={cn(
                      'relative overflow-hidden rounded border-2 transition-colors',
                      'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      isSelected
                        ? 'border-primary'
                        : 'border-transparent hover:border-muted-foreground/40',
                    )}
                  >
                    <img
                      src={mockup.image_url}
                      alt=""
                      className="aspect-square w-full bg-muted/40 object-contain"
                      loading="lazy"
                    />
                    {isSelected && (
                      <span className="absolute left-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                        {position + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ---------- Salida ---------- */}
          <div className="flex flex-wrap items-end gap-2 border-t border-border/60 pt-3">
            <div className="space-y-1">
              <Label
                htmlFor="pdf-file-name"
                className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Nombre del archivo
              </Label>
              <Input
                id="pdf-file-name"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                className="h-8 w-56 text-xs"
                placeholder="carrusel"
              />
            </div>
            <Button
              type="button"
              size="sm"
              onClick={handleExport}
              disabled={selected.length === 0 || isExporting}
            >
              {isExporting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              Exportar PDF ({selected.length})
            </Button>
            {order.length > 0 && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setOrder([])}>
                Limpiar
              </Button>
            )}
          </div>
    </CollapsibleSection>
  );
}
