/**
 * StyleImageGenerator — one specialized image generator (professional, 3D
 * iconography, slides, ...). Encapsulates:
 *  - an editable style prompt (manual textarea + chat-style refine loop),
 *  - a business-grounded idea suggester,
 *  - batch variation generation via generate-design-image (styleSystemPrompt),
 *  - auto-save into the style's stock collection.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  Sparkles, Plus, Trash2, Check, Save, Wand2, Lightbulb, Loader2, ChevronDown, Maximize2, MessageSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { useDesignStore } from '@/store/designStore';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useGenerateImage } from '@/hooks/useGenerateImage';
import { useImageStylePrompts } from '@/hooks/useImageStylePrompts';
import { useRefineImagePrompt } from '@/hooks/useRefineImagePrompt';
import { useSuggestImageIdeas } from '@/hooks/useSuggestImageIdeas';
import { saveImageToLibrary } from '@/utils/imageStock/saveImageToLibrary';
import { ImageLightbox } from '@/components/ImageLightbox';
import { cn } from '@/lib/utils';
import type { ImageStyleDef } from '@/constants/imageStockStudio';

interface Variation {
  id: string;
  description: string;
  status: 'pending' | 'generating' | 'saving' | 'saved' | 'done' | 'error';
  imageBase64: string | null;
  error: string | null;
}

interface StyleImageGeneratorProps {
  style: ImageStyleDef;
}

export function StyleImageGenerator({ style }: StyleImageGeneratorProps) {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const { activeBusinessId } = useActiveBusiness();

  const stylePrompts = useImageStylePrompts();
  const generateImage = useGenerateImage();
  const refinePrompt = useRefineImagePrompt();
  const suggestIdeas = useSuggestImageIdeas();

  // --- Prompt editing state ---
  const savedPromptText = stylePrompts.getPromptText(style.promptType);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [feedback, setFeedback] = useState('');

  // Sync draft when the saved prompt loads/changes (only if user hasn't edited).
  useEffect(() => {
    setPromptDraft(savedPromptText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPromptText]);

  const isPromptDirty = promptDraft.trim() !== savedPromptText.trim();

  // --- Ideas + variations ---
  const [ideas, setIdeas] = useState<string[]>([]);
  const [topic, setTopic] = useState('');
  const [newVariation, setNewVariation] = useState('');
  const [variations, setVariations] = useState<Variation[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [quality, setQuality] = useState<'medium' | 'high'>('high');
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  // When set, the refine chat sends this generated image so the model can SEE it.
  const [feedbackImageId, setFeedbackImageId] = useState<string | null>(null);

  const pendingCount = useMemo(
    () => variations.filter((v) => v.status === 'pending').length,
    [variations],
  );

  // -------------------------------------------------------------------------
  // Prompt: refine (chat) + save
  // -------------------------------------------------------------------------
  const handleRefine = async () => {
    if (!feedback.trim()) return;
    try {
      const fbVar = feedbackImageId ? variations.find((v) => v.id === feedbackImageId) : null;
      const res = await refinePrompt.mutateAsync({
        current_prompt: promptDraft || savedPromptText,
        feedback: feedback.trim(),
        style_label: style.label,
        result_image_base64: fbVar?.imageBase64 ?? undefined,
      });
      setPromptDraft(res.prompt);
      setFeedback('');
      setPromptOpen(true);
      toast({
        title: 'Prompt ajustado',
        description: fbVar
          ? 'Analicé la imagen seleccionada y ajusté el prompt. Revísalo y guárdalo si te gusta.'
          : 'Revísalo y guárdalo si te gusta.',
      });
    } catch (err) {
      toast({
        title: 'Error al pulir',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const handleSavePrompt = async () => {
    if (!isPromptDirty || promptDraft.trim().length < 10) return;
    try {
      await stylePrompts.savePromptAsync({ promptType: style.promptType, promptText: promptDraft.trim() });
      toast({ title: 'Prompt guardado', description: `${style.label}: nueva versión.` });
    } catch (err) {
      toast({
        title: 'Error al guardar',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  // -------------------------------------------------------------------------
  // Ideas
  // -------------------------------------------------------------------------
  const handleSuggestIdeas = async () => {
    if (!selectedBrand) {
      toast({ title: 'Selecciona una marca primero', variant: 'destructive' });
      return;
    }
    try {
      const res = await suggestIdeas.mutateAsync({
        brand: selectedBrand,
        business_id: activeBusinessId ?? undefined,
        style_label: style.label,
        topic: topic.trim() || undefined,
        count: 8,
      });
      setIdeas(res.ideas);
    } catch (err) {
      toast({
        title: 'Error generando ideas',
        description: err instanceof Error ? err.message : 'Error desconocido',
        variant: 'destructive',
      });
    }
  };

  const addVariation = (description: string) => {
    const desc = description.trim();
    if (!desc) return;
    setVariations((prev) => [
      ...prev,
      { id: crypto.randomUUID(), description: desc, status: 'pending', imageBase64: null, error: null, promptUsed: null },
    ]);
  };

  const removeVariation = (id: string) => {
    setVariations((prev) => prev.filter((v) => v.id !== id));
  };

  // -------------------------------------------------------------------------
  // Generation
  // -------------------------------------------------------------------------
  const handleGenerate = async () => {
    if (!selectedBrand) {
      toast({ title: 'Selecciona una marca primero', variant: 'destructive' });
      return;
    }
    const promptText = (promptDraft || savedPromptText).trim();
    if (!promptText) {
      toast({ title: 'Falta el prompt de estilo', description: 'Este proceso no tiene prompt configurado.', variant: 'destructive' });
      return;
    }
    const pending = variations.filter((v) => v.status === 'pending');
    if (pending.length === 0) {
      toast({ title: 'Agrega variaciones', description: 'Añade descripciones o usa el sugeridor de ideas.', variant: 'destructive' });
      return;
    }

    setIsGenerating(true);

    for (const variation of pending) {
      setVariations((prev) => prev.map((v) => (v.id === variation.id ? { ...v, status: 'generating' } : v)));

      try {
        const result = await generateImage.mutateAsync({
          userRequest: variation.description,
          brand: selectedBrand,
          styleSystemPrompt: promptText,
          includeText: false,
          imageQuality: quality,
        });

        setVariations((prev) => prev.map((v) => (
          v.id === variation.id
            ? { ...v, status: 'done', imageBase64: result.imageBase64, promptUsed: result.promptUsed?.promptFinal ?? null }
            : v
        )));

        // Auto-save into the style's stock collection.
        try {
          setVariations((prev) => prev.map((v) => (v.id === variation.id ? { ...v, status: 'saving' } : v)));
          await saveImageToLibrary({
            imageBase64: result.imageBase64,
            brand: selectedBrand,
            collection: style.collection,
            description: variation.description,
            promptUsed: result.promptUsed?.promptFinal ?? variation.description,
            businessId: activeBusinessId ?? undefined,
            extraTags: [style.collection],
          });
          setVariations((prev) => prev.map((v) => (v.id === variation.id ? { ...v, status: 'saved' } : v)));
        } catch (saveErr) {
          console.error('Failed to save image:', saveErr);
          setVariations((prev) => prev.map((v) => (v.id === variation.id ? { ...v, status: 'done' } : v)));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Unknown error';
        setVariations((prev) => prev.map((v) => (v.id === variation.id ? { ...v, status: 'error', error: message } : v)));
      }
    }

    setIsGenerating(false);
    toast({ title: 'Generación completa', description: `Guardadas en la colección "${style.collection}".` });
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold text-foreground">{style.label}</h2>
        <p className="text-sm text-muted-foreground">{style.description}</p>
      </div>

      {/* Prompt del proceso (editable manual + chat) */}
      <Collapsible open={promptOpen} onOpenChange={setPromptOpen}>
        <div className="flex items-center justify-between">
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <ChevronDown className={`h-4 w-4 transition-transform ${promptOpen ? 'rotate-180' : ''}`} />
              Prompt del proceso
              {stylePrompts.prompts[style.promptType]?.version != null && (
                <Badge variant="secondary" className="ml-1">v{stylePrompts.prompts[style.promptType]?.version}</Badge>
              )}
            </Button>
          </CollapsibleTrigger>
          {isPromptDirty && (
            <Button size="sm" onClick={handleSavePrompt} disabled={stylePrompts.isSaving || promptDraft.trim().length < 10}>
              <Save className="h-4 w-4 mr-2" />
              {stylePrompts.isSaving ? 'Guardando...' : 'Guardar prompt'}
            </Button>
          )}
        </div>
        <CollapsibleContent className="mt-3 space-y-3">
          {stylePrompts.isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <Textarea
              value={promptDraft}
              onChange={(e) => setPromptDraft(e.target.value)}
              rows={10}
              className="resize-y font-mono text-xs"
              placeholder="Prompt de estilo para este proceso..."
            />
          )}

          {/* Chat de pulido */}
          {feedbackImageId && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
              {(() => {
                const fb = variations.find((v) => v.id === feedbackImageId);
                return fb?.imageBase64 ? (
                  <img
                    src={`data:image/png;base64,${fb.imageBase64}`}
                    alt="feedback"
                    className="h-10 w-10 rounded object-cover"
                  />
                ) : null;
              })()}
              <span className="flex-1 text-xs text-muted-foreground">
                Puliendo con base en esta imagen (el modelo la analiza).
              </span>
              <Button variant="ghost" size="sm" onClick={() => setFeedbackImageId(null)}>
                Quitar
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder='Feedback para pulir (ej. "quedó muy naranja", "más minimalista")...'
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleRefine(); } }}
            />
            <Button variant="outline" onClick={handleRefine} disabled={refinePrompt.isPending || !feedback.trim()}>
              {refinePrompt.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
              <span className="ml-2">Pulir</span>
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Ajusta el prompt con feedback en lenguaje natural. Cuando te guste, guárdalo como nueva versión reutilizable.
          </p>
        </CollapsibleContent>
      </Collapsible>

      {/* Sugeridor de ideas */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Input
            placeholder="Tema opcional para las ideas (ej. contenedores, pagos)..."
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
          />
          <Button variant="outline" onClick={handleSuggestIdeas} disabled={suggestIdeas.isPending}>
            {suggestIdeas.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lightbulb className="h-4 w-4" />}
            <span className="ml-2">Sugerir ideas</span>
          </Button>
        </div>
        {ideas.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {ideas.map((idea, i) => (
              <button
                key={i}
                type="button"
                onClick={() => addVariation(idea)}
                className="rounded-full border px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                title="Agregar como variación"
              >
                <Plus className="inline h-3 w-3 mr-1" />
                {idea}
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Variaciones */}
      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-foreground">Variaciones de Imagen</h3>
        <div className="space-y-2">
          {variations.map((v) => (
            <div key={v.id} className="flex items-center gap-2 rounded-lg border p-3">
              <span className="flex-1 text-sm">{v.description}</span>
              <span className="text-xs text-muted-foreground">
                {v.status === 'saved' ? '✓ guardado'
                  : v.status === 'pending' ? 'pendiente'
                  : v.status === 'generating' ? 'generando'
                  : v.status === 'saving' ? 'guardando'
                  : v.status === 'done' ? 'listo'
                  : v.status === 'error' ? 'error' : v.status}
              </span>
              {v.status === 'pending' && (
                <Button variant="ghost" size="icon" onClick={() => removeVariation(v.id)} aria-label="Eliminar">
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Input
            placeholder="Agregar descripción de variación..."
            value={newVariation}
            onChange={(e) => setNewVariation(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addVariation(newVariation); setNewVariation(''); } }}
          />
          <Button variant="outline" size="icon" onClick={() => { addVariation(newVariation); setNewVariation(''); }} disabled={!newVariation.trim()} aria-label="Agregar">
            <Plus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button onClick={handleGenerate} disabled={isGenerating || !selectedBrand || pendingCount === 0}>
            <Sparkles className="h-4 w-4 mr-2" />
            {isGenerating ? 'Generando...' : 'Generar Todas'}
          </Button>
          <div className="flex items-center gap-1">
            <span className="text-xs text-muted-foreground mr-1">Calidad:</span>
            {(['medium', 'high'] as const).map((q) => (
              <Button
                key={q}
                variant={quality === q ? 'default' : 'outline'}
                size="sm"
                onClick={() => setQuality(q)}
                title={q === 'high' ? 'Máxima calidad (más lento y caro)' : 'Calidad media (más rápido)'}
              >
                {q === 'high' ? 'Alta' : 'Media'}
              </Button>
            ))}
          </div>
        </div>
      </section>

      {/* Resultados */}
      {variations.some((v) => ['done', 'generating', 'saving', 'saved'].includes(v.status)) && (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-foreground">Imágenes Generadas</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {variations.map((v) => {
              if (v.status === 'generating' || v.status === 'saving') {
                return (
                  <div key={v.id} className="space-y-2">
                    <Skeleton className="aspect-square rounded-lg" />
                    <p className="text-xs text-muted-foreground truncate">
                      {v.status === 'saving' ? 'Guardando...' : v.description}
                    </p>
                  </div>
                );
              }
              if ((v.status === 'done' || v.status === 'saved') && v.imageBase64) {
                const dataUrl = `data:image/png;base64,${v.imageBase64}`;
                const isFb = feedbackImageId === v.id;
                return (
                  <Card key={v.id} className={cn('overflow-hidden', isFb && 'ring-2 ring-primary')}>
                    <div className="relative group">
                      <button
                        type="button"
                        className="block w-full cursor-zoom-in"
                        onClick={() => setLightboxSrc(dataUrl)}
                        aria-label="Ampliar imagen"
                      >
                        <img src={dataUrl} alt={v.description} className="aspect-square w-full object-cover" />
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/10 transition-colors">
                          <Maximize2 className="h-6 w-6 text-white opacity-0 group-hover:opacity-90 drop-shadow" />
                        </span>
                      </button>
                      {v.status === 'saved' && (
                        <Badge className="absolute top-2 right-2 bg-green-600 text-white border-0 text-[10px]">
                          <Check className="h-3 w-3 mr-0.5" />Guardado
                        </Badge>
                      )}
                    </div>
                    <CardContent className="p-2 space-y-1.5">
                      <p className="text-xs text-muted-foreground line-clamp-2">{v.description}</p>
                      <Button
                        variant={isFb ? 'default' : 'outline'}
                        size="sm"
                        className="h-7 w-full text-xs"
                        onClick={() => {
                          setFeedbackImageId(isFb ? null : v.id);
                          if (!isFb) setPromptOpen(true);
                        }}
                      >
                        <MessageSquare className="h-3.5 w-3.5 mr-1" />
                        {isFb ? 'Seleccionada para feedback' : 'Dar feedback sobre esta'}
                      </Button>
                      {v.promptUsed && (
                        <details className="mt-1">
                          <summary className="text-[10px] text-muted-foreground/70 cursor-pointer hover:text-foreground">
                            Ver prompt usado
                          </summary>
                          <p className="mt-1 text-[10px] leading-snug text-muted-foreground whitespace-pre-wrap max-h-40 overflow-auto">
                            {v.promptUsed}
                          </p>
                        </details>
                      )}
                    </CardContent>
                  </Card>
                );
              }
              if (v.status === 'error') {
                return (
                  <Card key={v.id} className="overflow-hidden border-destructive/50">
                    <CardContent className="p-3 aspect-square flex items-center justify-center">
                      <p className="text-xs text-destructive text-center">Error: {v.error}</p>
                    </CardContent>
                  </Card>
                );
              }
              return null;
            })}
          </div>
        </section>
      )}

      {lightboxSrc && <ImageLightbox src={lightboxSrc} onClose={() => setLightboxSrc(null)} />}
    </div>
  );
}
