/**
 * NewsPanel — pestaña Xending News dentro de Design Studio.
 *
 * Flujo editorial (secciones 9, 62 del spec):
 *   input (MD/JSON/paste) → plan de slides → dirección visual + prompts →
 *   imagen por slide → export PNG/PDF.
 *
 * 100% independiente del carrusel comercial: usa solo los cables propios de News
 * (useNewsEdition) y los genéricos reutilizados (generación de imagen y export).
 * No compone texto/logo dentro de la imagen; eso es un paso posterior de marca.
 */

import { useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Copy,
  Download,
  FilePlus2,
  FileText,
  Images,
  Loader2,
  Newspaper,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Wand2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import { ImageLightbox } from '@/components/ImageLightbox';
import { useNewsEdition } from '@/hooks/useNewsEdition';
import { useNewsEditions, useDiscardNewsEdition } from '@/hooks/useNewsEditions';
import { exportCarouselPdf, exportCarouselPngs } from '@/utils/design-studio/exportCarousel';
import type { NewsSlidePlan } from '../../supabase/functions/_shared/news/news-types';

/** Vía A: generar en la app. Vía B: solo entregar el prompt para GPT-Image. */
type ImageMode = 'app' | 'prompt';

export function NewsPanel() {
  const { toast } = useToast();
  const news = useNewsEdition();
  const editions = useNewsEditions();
  const discardEdition = useDiscardNewsEdition();
  const [imageMode, setImageMode] = useState<ImageMode>('app');
  const [isExporting, setIsExporting] = useState(false);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

  const commentaryOptions = news.normalized?.commentary_options ?? [];
  const caption = news.normalized?.caption ?? '';
  const wrapSlide = news.slidePlan.find((p) => p.is_executive_wrap) ?? null;

  // Elegir el cierre (Comentario final): pasa a ser el subcopy del Xending View.
  // Si ese slide ya tiene imagen, se re-hornea el texto nuevo al vuelo.
  const handlePickCommentary = async (option: string) => {
    if (!wrapSlide) return;
    news.updateSlideText(wrapSlide.slide_number, { subcopy: option });
    const rt = news.slides.find((s) => s.slide_number === wrapSlide.slide_number);
    if (rt && (rt.imageUrl || rt.imageBase64)) {
      await news.recomposeSlide(wrapSlide.slide_number);
    }
  };

  // Re-hornea solo el texto de un slide (sin re-llamar a la IA de imagen).
  const handleUpdateText = async (slideNumber: number) => {
    const ok = await news.recomposeSlide(slideNumber);
    if (!ok) {
      toast({
        title: 'No se pudo actualizar el texto',
        description: 'Regenera la imagen primero (la escena no está en memoria).',
        variant: 'destructive',
      });
    } else {
      toast({ title: 'Texto actualizado' });
    }
  };

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(caption);
      toast({ title: 'Caption copiado' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  const handleSaveEdition = async () => {
    const ok = await news.saveEdition();
    toast(
      ok
        ? { title: 'Edición guardada' }
        : { title: 'No se pudo guardar', variant: 'destructive' },
    );
  };

  const handleLoadEdition = async (id: string) => {
    const ok = await news.loadEdition(id);
    if (!ok) toast({ title: 'No se pudo cargar la edición', variant: 'destructive' });
  };

  const handleDiscardEdition = (id: string) => {
    discardEdition.mutate(id, {
      onSuccess: () => toast({ title: 'Edición eliminada' }),
      onError: () => toast({ title: 'No se pudo eliminar', variant: 'destructive' }),
    });
  };

  const doneSlides = useMemo(
    () => news.slides.filter((s) => s.status === 'done' && s.imageUrl),
    [news.slides],
  );

  /** La idea (headline) y el dato de cada slide, para mostrarlos en su tarjeta. */
  const planBySlide = useMemo(
    () => new Map<number, NewsSlidePlan>(news.slidePlan.map((p) => [p.slide_number, p])),
    [news.slidePlan],
  );

  const handleCopyPrompt = async (prompt: string) => {
    try {
      await navigator.clipboard.writeText(prompt);
      toast({ title: 'Prompt copiado', description: 'Pégalo en GPT-Image.' });
    } catch {
      toast({ title: 'No se pudo copiar', variant: 'destructive' });
    }
  };

  // Las imágenes guardadas YA traen el texto horneado (se compone al generar),
  // así que el export solo baja esas imágenes — mismo cable que el carrusel.
  const handleExportPngs = async () => {
    setIsExporting(true);
    try {
      await exportCarouselPngs({
        slides: doneSlides.map((s, i) => ({ index: i, imageUrl: s.imageUrl! })),
        prefix: 'xending-news',
      });
      toast({ title: 'PNGs descargados' });
    } catch (err) {
      toast({ title: 'Error al exportar PNGs', description: String(err), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  const handleExportPdf = async () => {
    setIsExporting(true);
    try {
      await exportCarouselPdf({
        slides: doneSlides.map((s, i) => ({ index: i, imageUrl: s.imageUrl! })),
        prefix: 'xending-news',
      });
      toast({ title: 'PDF generado' });
    } catch (err) {
      toast({ title: 'Error al exportar PDF', description: String(err), variant: 'destructive' });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Newspaper className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-foreground">Xending News</h2>
          <p className="text-sm text-muted-foreground">
            Convierte noticias en un set editorial visual de 5 a 8 piezas. Pega Markdown, JSON o
            texto (o la salida de Morning Brief).
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button size="sm" variant="ghost" onClick={() => news.reset()}>
            <FilePlus2 className="mr-2 h-4 w-4" />
            Nueva
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleSaveEdition}
            disabled={news.isSaving || !news.rawInput.trim()}
          >
            {news.isSaving ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Guardar
          </Button>
        </div>
      </div>

      {/* Ediciones guardadas */}
      {editions.data && editions.data.length > 0 && (
        <Card>
          <CardContent className="space-y-2 pt-4">
            <Label className="text-xs text-muted-foreground">Ediciones guardadas</Label>
            <div className="flex flex-wrap gap-2">
              {editions.data.map((e) => (
                <div
                  key={e.id}
                  className={cn(
                    'flex items-center gap-1 rounded-md border px-2 py-1 text-xs',
                    news.editionId === e.id ? 'border-primary bg-primary/5' : 'border-border/60',
                  )}
                >
                  <button
                    type="button"
                    className="max-w-48 truncate"
                    onClick={() => handleLoadEdition(e.id)}
                    disabled={news.isLoadingEdition}
                    title={e.title ?? 'Edición'}
                  >
                    {e.title ?? 'Edición'}
                    {e.status === 'completed' && ' ✓'}
                  </button>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => handleDiscardEdition(e.id)}
                    aria-label="Eliminar edición"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 1 — Input */}
      <Card>
        <CardContent className="space-y-4 pt-6">
          <div className="space-y-2">
            <Label htmlFor="news-input">Contenido de las noticias</Label>
            <Textarea
              id="news-input"
              value={news.rawInput}
              onChange={(e) => news.setRawInput(e.target.value)}
              placeholder="Pega aquí el Markdown, JSON o texto de las noticias…"
              className="min-h-40 font-mono text-xs"
              disabled={news.isPlanning}
            />
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label className="text-xs">Edición</Label>
              <div className="flex gap-1">
                {(['daily', 'special'] as const).map((t) => (
                  <Button
                    key={t}
                    type="button"
                    size="sm"
                    variant={news.editionType === t ? 'default' : 'outline'}
                    onClick={() => news.setEditionType(t)}
                  >
                    {t === 'daily' ? 'Diaria' : 'Especial'}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-1">
              <Label className="text-xs">Slides objetivo</Label>
              <div className="flex gap-1">
                {[5, 6, 7, 8].map((n) => (
                  <Button
                    key={n}
                    type="button"
                    size="sm"
                    variant={news.targetSlides === n ? 'default' : 'outline'}
                    onClick={() => news.setTargetSlides(n)}
                  >
                    {n}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              onClick={() => news.generatePlan()}
              disabled={news.isPlanning || !news.rawInput.trim()}
              className="ml-auto"
            >
              {news.isPlanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="mr-2 h-4 w-4" />
              )}
              Generar plan
            </Button>
          </div>

          {news.detectedFormat && (
            <p className="text-xs text-muted-foreground">
              Formato detectado: <span className="font-medium">{news.detectedFormat}</span>
            </p>
          )}
        </CardContent>
      </Card>

      {news.error && (
        <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4" />
          {news.error}
        </div>
      )}

      {/* Paso 2 — Plan de slides */}
      {news.slidePlan.length > 0 && (
        <Card>
          <CardContent className="space-y-3 pt-6">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Plan editorial ({news.slidePlan.length} slides)</h3>
              <Button
                size="sm"
                onClick={() => news.resolveVisuals()}
                disabled={news.isResolving}
              >
                {news.isResolving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Wand2 className="mr-2 h-4 w-4" />
                )}
                Resolver dirección visual
              </Button>
            </div>

            <ol className="space-y-2">
              {news.slidePlan.map((s) => (
                <li
                  key={s.slide_number}
                  className="rounded-md border border-border/60 px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">
                      {s.slide_number}
                    </Badge>
                    <span className="font-medium">{s.headline}</span>
                    {s.is_executive_wrap && (
                      <Badge variant="secondary" className="ml-auto shrink-0">
                        Xending View
                      </Badge>
                    )}
                  </div>
                  {(s.key_data || s.source.length > 0) && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.key_data && <span className="font-mono">{s.key_data}</span>}
                      {s.key_data && s.source.length > 0 && ' · '}
                      {s.source.join(', ')}
                    </p>
                  )}
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      {/* Comentario final: elegir el cierre (Xending View) + Caption */}
      {(commentaryOptions.length > 0 || caption) && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            {commentaryOptions.length > 0 && wrapSlide && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Cierre · elige uno (Xending View)</h3>
                <div className="space-y-2">
                  {commentaryOptions.map((opt, i) => {
                    const selected = wrapSlide.subcopy?.trim() === opt.trim();
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handlePickCommentary(opt)}
                        className={cn(
                          'flex w-full items-start gap-2 rounded-md border px-3 py-2 text-left text-xs',
                          selected ? 'border-primary bg-primary/5' : 'border-border/60',
                        )}
                      >
                        <span
                          className={cn(
                            'mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border',
                            selected ? 'border-primary bg-primary' : 'border-muted-foreground',
                          )}
                        >
                          {selected && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                        <span>{opt}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {caption && (
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <Label className="text-xs text-muted-foreground">Caption (pie del post)</Label>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-[10px]" onClick={handleCopyCaption}>
                    <Copy className="mr-1 h-3 w-3" />
                    Copiar
                  </Button>
                </div>
                <p className="whitespace-pre-wrap rounded-md border border-border/50 bg-muted/40 px-3 py-2 text-xs text-foreground/80">
                  {caption}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Paso 3 — Visuales */}
      {news.slides.length > 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold">Dirección visual y prompts</h3>

              <div className="flex items-center gap-2">
                {/* Toggle Vía A / Vía B */}
                <div className="flex overflow-hidden rounded-md border">
                  <button
                    type="button"
                    onClick={() => setImageMode('app')}
                    className={cn(
                      'px-2 py-1 text-xs',
                      imageMode === 'app' ? 'bg-primary text-primary-foreground' : 'bg-transparent',
                    )}
                  >
                    Generar aquí
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageMode('prompt')}
                    className={cn(
                      'px-2 py-1 text-xs',
                      imageMode === 'prompt' ? 'bg-primary text-primary-foreground' : 'bg-transparent',
                    )}
                  >
                    Solo prompt
                  </button>
                </div>

                {imageMode === 'app' && (
                  <Button size="sm" onClick={() => news.generateAll()} disabled={news.isGeneratingAll}>
                    {news.isGeneratingAll ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Images className="mr-2 h-4 w-4" />
                    )}
                    Generar todo
                  </Button>
                )}
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              {news.slides.map((s) => (
                <div key={s.slide_number} className="space-y-2 rounded-lg border border-border/60 p-3">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">{s.slide_number}</Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {s.archetype}
                    </Badge>
                    <span className="text-[10px] text-muted-foreground">
                      {s.visual_engine} · {s.layout_family} · conf {s.visual_confidence.toFixed(2)}
                    </span>
                  </div>

                  {/* Idea del slide: headline + dato que este visual representa */}
                  <div>
                    <p className="text-xs font-medium leading-tight">
                      {planBySlide.get(s.slide_number)?.headline ?? s.visual_subject}
                    </p>
                    {planBySlide.get(s.slide_number)?.key_data && (
                      <p className="font-mono text-[10px] text-muted-foreground">
                        {planBySlide.get(s.slide_number)?.key_data}
                      </p>
                    )}
                  </div>

                  {/* Preview: la imagen guardada YA lleva el texto horneado. */}
                  <div className="relative aspect-square overflow-hidden rounded-md bg-muted">
                    {s.imageBase64 || s.imageUrl ? (
                      <img
                        src={s.imageUrl ?? `data:image/png;base64,${s.imageBase64}`}
                        alt={`Slide ${s.slide_number}`}
                        className="h-full w-full cursor-zoom-in object-cover"
                        onClick={() =>
                          setLightboxSrc(s.imageUrl ?? `data:image/png;base64,${s.imageBase64}`)
                        }
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
                        {s.status === 'generating' ? (
                          <Loader2 className="h-5 w-5 animate-spin" />
                        ) : s.status === 'error' ? (
                          <span className="px-2 text-center text-destructive">{s.error}</span>
                        ) : (
                          'Sin imagen'
                        )}
                      </div>
                    )}
                    {s.status === 'done' && (
                      <span className="absolute right-1 top-1 z-10 rounded-full bg-green-600 p-1">
                        <Check className="h-3 w-3 text-white" />
                      </span>
                    )}
                  </div>

                  {/* Prompt de este slide, editable (visible en ambas vías) */}
                  <details className="rounded-md border border-border/50 bg-muted/40 px-2 py-1">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground">
                      <Pencil className="mr-1 inline h-3 w-3" />
                      Editar prompt
                    </summary>
                    <div className="mt-1 space-y-1">
                      <Textarea
                        value={s.image_prompt}
                        onChange={(e) => news.updateSlidePrompt(s.slide_number, e.target.value)}
                        className="max-h-60 min-h-40 overflow-auto whitespace-pre-wrap break-words font-mono text-[10px] leading-snug"
                        spellCheck={false}
                      />
                      <p className="text-[9px] text-muted-foreground">
                        Edita el sujeto de la escena (ej. el edificio de la institución en vez de una persona) y
                        pulsa {imageMode === 'app' ? 'Regenerar' : 'Copiar prompt'}.
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px]"
                        onClick={() => handleCopyPrompt(s.image_prompt)}
                      >
                        <Copy className="mr-1 h-3 w-3" />
                        Copiar
                      </Button>
                    </div>
                  </details>

                  {/* Editar texto y re-hornear (sin re-generar la imagen) */}
                  <details className="rounded-md border border-border/50 bg-muted/40 px-2 py-1">
                    <summary className="cursor-pointer text-[10px] text-muted-foreground">
                      <Pencil className="mr-1 inline h-3 w-3" />
                      Editar texto
                    </summary>
                    <div className="mt-2 space-y-2">
                      <div>
                        <Label className="text-[10px]">Headline</Label>
                        <Textarea
                          value={planBySlide.get(s.slide_number)?.headline ?? ''}
                          onChange={(e) => news.updateSlideText(s.slide_number, { headline: e.target.value })}
                          className="min-h-14 text-xs"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]">Dato</Label>
                          <Input
                            value={planBySlide.get(s.slide_number)?.key_data ?? ''}
                            onChange={(e) => news.updateSlideText(s.slide_number, { key_data: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                        <div>
                          <Label className="text-[10px]">Delta</Label>
                          <Input
                            value={planBySlide.get(s.slide_number)?.secondary_data ?? ''}
                            onChange={(e) => news.updateSlideText(s.slide_number, { secondary_data: e.target.value })}
                            className="h-8 text-xs"
                          />
                        </div>
                      </div>
                      <div>
                        <Label className="text-[10px]">Subcopy</Label>
                        <Textarea
                          value={planBySlide.get(s.slide_number)?.subcopy ?? ''}
                          onChange={(e) => news.updateSlideText(s.slide_number, { subcopy: e.target.value })}
                          className="min-h-14 text-xs"
                        />
                      </div>
                      <div>
                        <Label className="text-[10px]">Fuente</Label>
                        <Input
                          value={(planBySlide.get(s.slide_number)?.source ?? []).join(', ')}
                          onChange={(e) =>
                            news.updateSlideText(s.slide_number, {
                              source: e.target.value.split(',').map((x) => x.trim()).filter(Boolean),
                            })
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full"
                        onClick={() => handleUpdateText(s.slide_number)}
                        disabled={s.status === 'generating' || !(s.imageUrl || s.imageBase64)}
                      >
                        {s.status === 'generating' ? (
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                          <RefreshCw className="mr-2 h-4 w-4" />
                        )}
                        Actualizar texto
                      </Button>
                    </div>
                  </details>

                  {/* Acciones por vía */}
                  {imageMode === 'app' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => news.generateSlide(s.slide_number)}
                      disabled={s.status === 'generating' || news.isGeneratingAll}
                    >
                      {s.status === 'generating' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Sparkles className="mr-2 h-4 w-4" />
                      )}
                      {s.status === 'done' ? 'Regenerar' : 'Generar'}
                    </Button>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full"
                      onClick={() => handleCopyPrompt(s.image_prompt)}
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copiar prompt
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Paso 4 — Export */}
      {doneSlides.length > 0 && (
        <Card>
          <CardContent className="flex flex-wrap items-center gap-3 pt-6">
            <span className="text-sm text-muted-foreground">
              {doneSlides.length} slide(s) listo(s)
            </span>
            <Button size="sm" variant="outline" onClick={handleExportPngs} disabled={isExporting} className="ml-auto">
              <Download className="mr-2 h-4 w-4" />
              PNGs
            </Button>
            <Button size="sm" variant="outline" onClick={handleExportPdf} disabled={isExporting}>
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Lightbox: ver la pieza en grande */}
      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
