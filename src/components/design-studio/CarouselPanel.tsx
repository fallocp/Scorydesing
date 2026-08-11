/**
 * CarouselPanel — Stage C of the Design Studio flow.
 *
 * Turns the approved bank copy into a carousel. The order of the steps
 * is not cosmetic: the text is baked into each image, so the copy has to be
 * final before the prompts are built, and the prompts have to exist before
 * anything is rendered. Each step unlocks the next.
 *
 * Slides render one at a time. A slide that comes out wrong is regenerated on
 * its own, without touching the rest of the set.
 */

import { useState } from 'react';
import {
  AlertCircle,
  Check,
  Download,
  FileText,
  Images,
  Loader2,
  RefreshCw,
  Save,
  Sparkles,
  Square,
  Wand2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import {
  useCarouselQueue,
  type CarouselSlotRuntime,
  type UseCarouselQueueParams,
} from '@/hooks/useCarouselQueue';
import type { CopyBankItem } from '@/hooks/useDesignCopyBank';
import {
  CAROUSEL_DIMENSIONS,
  CAROUSEL_PRESETS,
  CAROUSEL_ROLE_LABELS,
  DEFAULT_CAROUSEL_PRESET_SLUG,
  getCarouselPreset,
  type CarouselBrandElement,
  type DesignImageType,
} from '@/types/design-studio';
import {
  exportCarouselPdf,
  exportCarouselPngs,
  type CarouselBranding,
} from '@/utils/design-studio/exportCarousel';

interface CarouselPanelProps {
  /** The approved bank copy this carousel derives from. */
  bankItem: CopyBankItem | null;
  branchId: string | null;
  /** Visible "Fondo" choice — same mapping the single-image flow uses. */
  background: string | null;
  /** Medium for the whole set. */
  imageType: DesignImageType;
  brandSlug: string | undefined;
  /** Logo and legal text composited on the slides that carry them. */
  branding: CarouselBranding;
  /** Overrides where the carousel state is written. See UseCarouselQueueParams. */
  persistMeta?: UseCarouselQueueParams['persistMeta'];
  disabled?: boolean;
}

const BRAND_ELEMENT_LABELS: Record<CarouselBrandElement, string> = {
  logo: 'logo',
  disclaimer: 'disclaimer',
};

export function CarouselPanel({
  bankItem,
  branchId,
  background,
  imageType,
  brandSlug,
  branding,
  persistMeta,
  disabled = false,
}: CarouselPanelProps) {
  const { toast } = useToast();
  const [presetSlug, setPresetSlug] = useState(DEFAULT_CAROUSEL_PRESET_SLUG);
  const [guidance, setGuidance] = useState('');
  const [isExporting, setIsExporting] = useState<'png' | 'pdf' | null>(null);

  const queue = useCarouselQueue({
    bankItem,
    branchId,
    background,
    imageType,
    brandSlug,
    persistMeta,
  });

  const {
    slots,
    isScripting,
    isBuildingPrompts,
    renderingIndex,
    isBusy,
    hasPrompts,
    doneCount,
    error,
  } = queue;

  const busy = disabled || isBusy;
  /**
   * Shape of the carousel on screen. Read from the persisted slug, not from the
   * selector, so a carousel loaded from the bank keeps the shape it was written
   * with instead of the one currently picked.
   */
  const activePreset = getCarouselPreset(queue.presetSlug ?? presetSlug);
  const isSingleLine = activePreset.singleLine === true;
  const allCopyReady = slots.length > 0 && slots.every((s) => s.slideCopy.headline.trim());
  const allDone = slots.length > 0 && doneCount === slots.length;
  const exportableSlides = slots.filter((s) => s.imageUrl);

  const handleCreateScript = async () => {
    const ok = await queue.createScript({ presetSlug, guidance });
    if (ok) {
      toast({
        title: 'Guion listo',
        description: 'Revisa y ajusta el copy de cada slide antes de generar los prompts.',
      });
    }
  };

  const handleSaveCopy = async () => {
    await queue.saveSlideCopy();
    toast({ title: 'Copys guardados' });
  };

  const handleBuildPrompts = async () => {
    const ok = await queue.buildPrompts();
    if (ok) {
      toast({
        title: 'Prompts listos',
        description: `Cada slide tiene su prompt completo. Genera de uno en uno o los ${slots.length} seguidos.`,
      });
    }
  };

  const handleExport = async (format: 'png' | 'pdf') => {
    if (exportableSlides.length === 0) return;

    const prefix = `carrusel-${(bankItem?.row.headline ?? 'xending')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40)}`;

    const payload = exportableSlides.map((s) => ({
      index: s.index,
      imageUrl: s.imageUrl!,
      brandElements: s.brandElements,
    }));

    setIsExporting(format);
    try {
      if (format === 'png') {
        const count = await exportCarouselPngs({ slides: payload, branding: branding, prefix });
        toast({ title: `${count} PNG exportados`, description: 'Numerados en orden de lectura.' });
      } else {
        await exportCarouselPdf({ slides: payload, branding, prefix });
        toast({
          title: 'PDF exportado',
          description: `${payload.length} páginas. Es el formato que LinkedIn muestra como carrusel.`,
        });
      }
    } catch (err) {
      toast({
        title: 'Error al exportar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    } finally {
      setIsExporting(null);
    }
  };

  if (!bankItem) return null;

  return (
    <section className="space-y-5 rounded-lg border border-border/60 bg-muted/20 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Images className="h-4 w-4" />
            Carrusel
          </h3>
          <p className="text-xs text-muted-foreground">
            {CAROUSEL_DIMENSIONS.width}×{CAROUSEL_DIMENSIONS.height} — mismo formato que un post,
            un solo set para Instagram y LinkedIn
          </p>
        </div>
        {slots.length > 0 && (
          <Badge variant="outline" className="text-[10px] font-normal">
            {doneCount}/{slots.length} generados
          </Badge>
        )}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-xs text-destructive">{error}</p>
        </div>
      )}

      {/* ---------- Step 1: script ---------- */}
      {slots.length === 0 && (
        <div className="space-y-3">
          {CAROUSEL_PRESETS.length > 1 ? (
            <div className="space-y-1.5">
              <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Estructura narrativa
              </Label>
              <div className="flex flex-wrap gap-2">
                {CAROUSEL_PRESETS.map((preset) => (
                  <button
                    key={preset.slug}
                    type="button"
                    disabled={busy}
                    onClick={() => setPresetSlug(preset.slug)}
                    className={cn(
                      'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                      presetSlug === preset.slug
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-background hover:bg-accent',
                    )}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {getCarouselPreset(presetSlug).description}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Estructura: {CAROUSEL_PRESETS[0].name}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Guía del carrusel (opcional)
            </Label>
            <Textarea
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              disabled={busy}
              placeholder='Ej: "Aterrízalo en un caso de importación desde China." · "Usa cifras de spread, no de velocidad."'
              className="resize-none text-sm"
            />
          </div>

          <Button type="button" onClick={handleCreateScript} disabled={busy} className="w-full">
            {isScripting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Armando el guion...
              </>
            ) : (
              <>
                <Sparkles className="mr-2 h-4 w-4" />
                Generar idea carrusel
              </>
            )}
          </Button>
        </div>
      )}

      {/* ---------- Step 2: copy per slide ---------- */}
      {slots.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Copy de cada slide
            </Label>
            <span className="text-[11px] text-muted-foreground">
              El texto se hornea en la imagen: déjalo final antes de los prompts
            </span>
          </div>

          {slots.map((slot) => (
            <SlotCopyEditor
              key={slot.id}
              slot={slot}
              total={slots.length}
              disabled={busy}
              singleLine={isSingleLine}
              onChange={(field, value) => queue.updateSlideCopy(slot.index, field, value)}
            />
          ))}

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleSaveCopy}
              disabled={busy || !allCopyReady}
            >
              <Save className="mr-2 h-4 w-4" />
              Guardar copys
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleBuildPrompts}
              disabled={busy || !allCopyReady}
            >
              {isBuildingPrompts ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Generando los {slots.length} prompts...
                </>
              ) : (
                <>
                  <Wand2 className="mr-2 h-4 w-4" />
                  {hasPrompts ? 'Regenerar prompts' : `Generar los ${slots.length} prompts`}
                </>
              )}
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={queue.reset}
              disabled={busy}
              className="text-muted-foreground"
            >
              Descartar carrusel
            </Button>
          </div>
        </div>
      )}

      {/* ---------- Step 3: prompts and render ---------- */}
      {hasPrompts && (
        <div className="space-y-3 border-t border-border pt-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Prompts e imágenes
            </Label>
            <div className="flex gap-2">
              {renderingIndex !== null ? (
                <Button type="button" variant="outline" size="sm" onClick={queue.cancelQueue}>
                  <Square className="mr-2 h-3.5 w-3.5" />
                  Detener
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  onClick={queue.generateAll}
                  disabled={busy || allDone}
                >
                  <Sparkles className="mr-2 h-3.5 w-3.5" />
                  Generar los {slots.length}
                </Button>
              )}
            </div>
          </div>

          {slots.map((slot) => (
            <SlotRenderCard
              key={slot.id}
              slot={slot}
              total={slots.length}
              disabled={busy}
              isRendering={renderingIndex === slot.index}
              onPromptChange={(text) => queue.updateSlotPrompt(slot.index, text)}
              onGenerate={() => queue.generateSlot(slot.index)}
            />
          ))}
        </div>
      )}

      {/* ---------- Step 4: export ---------- */}
      {exportableSlides.length > 0 && (
        <div className="space-y-2 border-t border-border pt-4">
          <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Exportar
          </Label>
          {!allDone && (
            <p className="text-[11px] text-amber-700">
              Faltan {slots.length - doneCount} slide(s). Puedes exportar lo que hay, pero el set
              queda incompleto.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('png')}
              disabled={busy || isExporting !== null}
            >
              {isExporting === 'png' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Download className="mr-2 h-4 w-4" />
              )}
              {exportableSlides.length} PNG — Instagram
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleExport('pdf')}
              disabled={busy || isExporting !== null}
            >
              {isExporting === 'pdf' ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              PDF — LinkedIn
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            El logo y el disclaimer se montan en su posición por defecto. Para moverlos, usa
            &ldquo;Montar marca&rdquo; en ese slide.
          </p>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// Subcomponents
// ---------------------------------------------------------------------------

function SlotHeader({ slot, total }: { slot: CarouselSlotRuntime; total: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-foreground/10 text-[11px] font-bold">
        {slot.index + 1}
      </span>
      <Badge variant="outline" className="text-[10px] font-normal">
        {CAROUSEL_ROLE_LABELS[slot.role]}
      </Badge>
      <span className="text-[10px] text-muted-foreground">de {total}</span>
      {slot.brandElements.map((element) => (
        <Badge key={element} className="bg-[#2ED4C7]/15 text-[10px] font-normal text-foreground">
          {BRAND_ELEMENT_LABELS[element]}
        </Badge>
      ))}
    </div>
  );
}

function SlotCopyEditor({
  slot,
  total,
  disabled,
  singleLine,
  onChange,
}: {
  slot: CarouselSlotRuntime;
  total: number;
  disabled: boolean;
  /** One line per slide: the body field is not part of this shape. */
  singleLine: boolean;
  onChange: (field: 'headline' | 'body' | 'cta', value: string) => void;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="space-y-2 p-3">
        <SlotHeader slot={slot} total={total} />
        <Input
          value={slot.slideCopy.headline}
          onChange={(e) => onChange('headline', e.target.value)}
          disabled={disabled}
          placeholder={singleLine ? 'La línea de este slide' : 'Headline del slide'}
          className="text-sm font-semibold"
        />
        {/* Hidden on one-line presets: the slide is laid out for a single line, so
            offering a second field invites text the image has no room for. */}
        {!singleLine && (
          <Textarea
            rows={2}
            value={slot.slideCopy.body ?? ''}
            onChange={(e) => onChange('body', e.target.value)}
            disabled={disabled}
            placeholder="Body (una frase)"
            className="resize-none text-sm"
          />
        )}
        {/* CTA only where the script placed one — usually the closing slide. */}
        {(slot.slideCopy.cta ?? '') !== '' && (
          <Input
            value={slot.slideCopy.cta ?? ''}
            onChange={(e) => onChange('cta', e.target.value)}
            disabled={disabled}
            placeholder="CTA"
            className="text-sm"
          />
        )}
        {slot.imageIntent && (
          <p className="text-[11px] italic text-muted-foreground">
            Imagen: {slot.imageIntent}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function SlotRenderCard({
  slot,
  total,
  disabled,
  isRendering,
  onPromptChange,
  onGenerate,
}: {
  slot: CarouselSlotRuntime;
  total: number;
  disabled: boolean;
  isRendering: boolean;
  onPromptChange: (text: string) => void;
  onGenerate: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const preview = slot.imageBase64
    ? `data:image/png;base64,${slot.imageBase64}`
    : slot.imageUrl ?? null;

  return (
    <Card
      className={cn(
        'border-border/70',
        slot.status === 'done' && 'border-emerald-300 bg-emerald-50/30',
        slot.status === 'error' && 'border-destructive/40 bg-destructive/5',
      )}
    >
      <CardContent className="space-y-2 p-3">
        <div className="flex items-start justify-between gap-2">
          <SlotHeader slot={slot} total={total} />
          <StatusPill slot={slot} isRendering={isRendering} />
        </div>

        <div className="flex gap-3">
          {preview ? (
            <img
              src={preview}
              alt={`Slide ${slot.index + 1}: ${slot.slideCopy.headline}`}
              className="h-20 w-20 shrink-0 rounded border border-border object-cover"
            />
          ) : (
            <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded border border-dashed border-border bg-muted/30">
              {isRendering ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : (
                <span className="text-[10px] text-muted-foreground">1:1</span>
              )}
            </div>
          )}

          <div className="min-w-0 flex-1 space-y-2">
            <p className="truncate text-sm font-semibold text-foreground">
              {slot.slideCopy.headline}
            </p>
            {slot.error && <p className="text-[11px] text-destructive">{slot.error}</p>}

            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={slot.status === 'done' ? 'outline' : 'default'}
                onClick={onGenerate}
                disabled={disabled}
              >
                {isRendering ? (
                  <>
                    <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                    Generando
                  </>
                ) : slot.status === 'done' ? (
                  <>
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
                    Regenerar
                  </>
                ) : (
                  <>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                    Generar
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => setExpanded((v) => !v)}
                className="text-muted-foreground"
              >
                {expanded ? 'Ocultar prompt' : 'Ver prompt'}
              </Button>
            </div>
          </div>
        </div>

        {expanded && (
          <Textarea
            rows={10}
            value={slot.prompt}
            onChange={(e) => onPromptChange(e.target.value)}
            disabled={disabled}
            className="font-mono text-[11px] leading-relaxed"
          />
        )}
      </CardContent>
    </Card>
  );
}

function StatusPill({
  slot,
  isRendering,
}: {
  slot: CarouselSlotRuntime;
  isRendering: boolean;
}) {
  if (isRendering || slot.status === 'generating') {
    return (
      <Badge className="bg-blue-100 text-[10px] font-normal text-blue-700">Generando</Badge>
    );
  }
  if (slot.status === 'queued') {
    return <Badge className="bg-muted text-[10px] font-normal text-foreground">En cola</Badge>;
  }
  if (slot.status === 'done') {
    return (
      <Badge className="bg-emerald-100 text-[10px] font-normal text-emerald-700">
        <Check className="mr-1 h-3 w-3" />
        Listo
      </Badge>
    );
  }
  if (slot.status === 'error') {
    return <Badge variant="destructive" className="text-[10px] font-normal">Error</Badge>;
  }
  return <Badge variant="outline" className="text-[10px] font-normal">Pendiente</Badge>;
}
