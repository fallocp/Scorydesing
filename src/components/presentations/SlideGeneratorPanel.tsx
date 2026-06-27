/**
 * SlideGeneratorPanel — Generación de slides con IA estilo Canva.
 *
 * Permite crear un slide nuevo a partir de:
 *  - Texto (intención del slide)
 *  - Una imagen de referencia (la que haces en ChatGPT) que GPT-4o Vision lee
 *    y recrea con el sistema de diseño "Xending Light Editorial".
 *  - Ambos.
 *
 * También permite refinar el slide actual con feedback (chat de iteración).
 *
 * Reutiliza la edge function `generate-design-html` vía `useGenerateSlide`.
 */

import { useCallback, useRef, useState } from 'react';
import { X, ImagePlus, Sparkles, Wand2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';
import { useGenerateSlide } from '@/hooks/useGenerateSlide';
import { validateReferenceFile } from '@/utils/design-studio/fileValidator';

interface SlideGeneratorPanelProps {
  /** HTML del slide actual, para el modo refinar. */
  currentHtml?: string;
  /** Inserta un slide nuevo con el HTML generado. */
  onInsert: (html: string) => void;
  /** Reemplaza el HTML del slide actual (modo refinar). */
  onApplyToCurrent: (html: string) => void;
  onClose: () => void;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'));
    reader.readAsDataURL(file);
  });
}

export function SlideGeneratorPanel({
  currentHtml,
  onInsert,
  onApplyToCurrent,
  onClose,
}: SlideGeneratorPanelProps) {
  const { toast } = useToast();
  const generate = useGenerateSlide();

  const [mode, setMode] = useState<'create' | 'refine'>('create');
  const [style, setStyle] = useState<'light' | 'navy'>('light');
  const [instruction, setInstruction] = useState('');
  const [feedback, setFeedback] = useState('');
  const [imageDataUrl, setImageDataUrl] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      const { isValid, errors } = validateReferenceFile(file);
      if (!isValid) {
        toast({ title: 'Archivo no válido', description: errors.join('. '), variant: 'destructive' });
        return;
      }
      try {
        const dataUrl = await fileToDataUrl(file);
        setImageDataUrl(dataUrl);
      } catch (err) {
        toast({ title: 'Error al leer la imagen', description: err instanceof Error ? err.message : '', variant: 'destructive' });
      }
    },
    [toast],
  );

  const handleGenerate = useCallback(async () => {
    if (!instruction.trim() && !imageDataUrl) {
      toast({ title: 'Agrega texto o una imagen', description: 'Describe el slide o sube una imagen de referencia.', variant: 'destructive' });
      return;
    }
    try {
      const res = await generate.mutateAsync({
        instruction: instruction.trim() || undefined,
        image_base64: imageDataUrl || undefined,
        style,
      });
      onInsert(res.html);
      toast({ title: '✨ Slide generado', description: 'Se insertó después del slide actual. Edítalo en el Editor Visual.' });
      setInstruction('');
      setImageDataUrl(null);
    } catch (err) {
      toast({ title: 'Error al generar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [instruction, imageDataUrl, generate, onInsert, toast]);

  const handleRefine = useCallback(async () => {
    if (!feedback.trim()) {
      toast({ title: 'Escribe el cambio que quieres', variant: 'destructive' });
      return;
    }
    if (!currentHtml) {
      toast({ title: 'No hay slide actual para refinar', variant: 'destructive' });
      return;
    }
    try {
      const res = await generate.mutateAsync({
        current_html: currentHtml,
        iteration_feedback: feedback.trim(),
      });
      onApplyToCurrent(res.html);
      toast({ title: '✨ Slide actualizado', description: 'Se aplicaron los cambios al slide actual.' });
      setFeedback('');
    } catch (err) {
      toast({ title: 'Error al refinar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  }, [feedback, currentHtml, generate, onApplyToCurrent, toast]);

  const loading = generate.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-xl rounded-2xl bg-background shadow-2xl border">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-[#FF7A4A]" />
            <h2 className="text-lg font-semibold">Generar slide con IA</h2>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4">
          <button
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              mode === 'create' ? 'bg-[#FF7A4A]/10 text-[#E85A2C]' : 'text-muted-foreground hover:bg-muted',
            )}
            onClick={() => setMode('create')}
          >
            <Wand2 className="h-4 w-4" /> Crear nuevo
          </button>
          <button
            className={cn(
              'flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
              mode === 'refine' ? 'bg-[#FF7A4A]/10 text-[#E85A2C]' : 'text-muted-foreground hover:bg-muted',
            )}
            onClick={() => setMode('refine')}
            disabled={!currentHtml}
            title={!currentHtml ? 'No hay slide actual' : undefined}
          >
            <Sparkles className="h-4 w-4" /> Refinar actual
          </button>
        </div>

        <div className="space-y-4 p-6">
          {mode === 'create' ? (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Estilo de marca</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setStyle('light')}
                    className={cn(
                      'flex-1 rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                      style === 'light' ? 'border-[#FF7A4A] bg-[#FF7A4A]/10 text-[#E85A2C]' : 'text-muted-foreground hover:bg-muted',
                    )}
                  >
                    Blanco (claro)
                  </button>
                  <button
                    type="button"
                    disabled
                    className="flex-1 cursor-not-allowed rounded-lg border px-3 py-2 text-sm font-medium text-muted-foreground/50"
                    title="Próximamente"
                  >
                    Navy (próximamente)
                  </button>
                </div>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">Describe el slide</label>
                <textarea
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF7A4A]/40"
                  rows={4}
                  placeholder="Ej: Slide 'Por qué Xending' con título y 3 cajas: velocidad, pagos a China el mismo día, atención personalizada."
                  value={instruction}
                  onChange={(e) => setInstruction(e.target.value)}
                />
              </div>

              {/* Image drop */}
              <div>
                <label className="mb-1.5 block text-sm font-medium">Imagen de referencia (opcional)</label>
                <div
                  className={cn(
                    'relative flex min-h-[120px] cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors',
                    isDragOver ? 'border-[#FF7A4A] bg-[#FF7A4A]/5' : 'border-muted-foreground/30 hover:border-[#FF7A4A]/50',
                  )}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={() => setIsDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setIsDragOver(false); handleFile(e.dataTransfer.files?.[0] ?? null); }}
                >
                  {imageDataUrl ? (
                    <div className="relative">
                      <img src={imageDataUrl} alt="referencia" className="max-h-40 rounded-md object-contain" />
                      <button
                        className="absolute -right-2 -top-2 rounded-full bg-background p-1 shadow border"
                        onClick={(e) => { e.stopPropagation(); setImageDataUrl(null); }}
                        aria-label="Quitar imagen"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <ImagePlus className="h-7 w-7 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Arrastra una imagen (la que hiciste en ChatGPT) o haz clic. PNG/JPG/WEBP, máx 10MB.</p>
                    </>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
                  />
                </div>
              </div>

              <Button className="w-full bg-[#FF7A4A] hover:bg-[#E85A2C] text-white" onClick={handleGenerate} disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generando…</> : <><Wand2 className="mr-2 h-4 w-4" /> Generar slide</>}
              </Button>
            </>
          ) : (
            <>
              <div>
                <label className="mb-1.5 block text-sm font-medium">¿Qué quieres cambiar del slide actual?</label>
                <textarea
                  className="w-full resize-none rounded-lg border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#FF7A4A]/40"
                  rows={4}
                  placeholder="Ej: cambia el título a 'Cumplimiento', deja 2 cajas en vez de 3 y haz el subtítulo más corto."
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                />
              </div>
              <Button className="w-full bg-[#FF7A4A] hover:bg-[#E85A2C] text-white" onClick={handleRefine} disabled={loading}>
                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Aplicando…</> : <><Sparkles className="mr-2 h-4 w-4" /> Aplicar cambios</>}
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
