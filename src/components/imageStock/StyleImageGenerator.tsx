/**
 * StyleImageGenerator — one specialized image generator (professional, 3D
 * iconography, slides, ...).
 *
 * Owns the reusable PROCESS/STYLE prompt (image_style:<key>): editable textarea
 * + chat-style refine loop + versioned save. Everything else (concept input,
 * reference photo, editable prompt gate, batch generation, autosave) is
 * delegated to the shared <ImageConceptStudio> engine so the same flow can be
 * reused by the design studio and pipeline later.
 */

import { useEffect, useState } from 'react';
import { Save, Wand2, Loader2, ChevronDown, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useToast } from '@/components/ui/use-toast';
import { useImageStylePrompts, stylePromptVersionLabel } from '@/hooks/useImageStylePrompts';
import { useRefineImagePrompt } from '@/hooks/useRefineImagePrompt';
import { ImageConceptStudio } from '@/components/imageStock/ImageConceptStudio';
import type { ImageStyleDef } from '@/constants/imageStockStudio';

interface StyleImageGeneratorProps {
  style: ImageStyleDef;
}

export function StyleImageGenerator({ style }: StyleImageGeneratorProps) {
  const { toast } = useToast();

  const stylePrompts = useImageStylePrompts();
  const refinePrompt = useRefineImagePrompt();

  // --- Process/style prompt editing ---
  const savedPromptText = stylePrompts.getPromptText(style.promptType);
  const [promptDraft, setPromptDraft] = useState('');
  const [promptOpen, setPromptOpen] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  // Generated image selected to refine the process prompt against (Vision).
  const [feedbackImage, setFeedbackImage] = useState<string | null>(null);

  const history = stylePrompts.getHistory(style.promptType);
  const original = history.find((v) => v.isOriginal);

  const handleRestore = (promptText: string) => {
    setPromptDraft(promptText);
    setPromptOpen(true);
    toast({ title: 'Versión cargada', description: 'Revísala y guárdala como nueva versión si te gusta.' });
  };

  // Sync draft when the saved prompt loads/changes.
  useEffect(() => {
    setPromptDraft(savedPromptText);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedPromptText]);

  const isPromptDirty = promptDraft.trim() !== savedPromptText.trim();

  const handleRefine = async () => {
    if (!feedback.trim()) return;
    try {
      const res = await refinePrompt.mutateAsync({
        current_prompt: promptDraft || savedPromptText,
        feedback: feedback.trim(),
        style_label: style.label,
        result_image_base64: feedbackImage ?? undefined,
      });
      setPromptDraft(res.prompt);
      setFeedback('');
      setPromptOpen(true);
      toast({
        title: 'Prompt ajustado',
        description: feedbackImage
          ? 'Analicé la imagen seleccionada y ajusté el prompt del proceso. Revísalo y guárdalo si te gusta.'
          : 'Revísalo y guárdalo si te gusta.',
      });
    } catch (err) {
      toast({ title: 'Error al pulir', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

  const handleSavePrompt = async () => {
    if (!isPromptDirty || promptDraft.trim().length < 10) return;
    try {
      await stylePrompts.savePromptAsync({ promptType: style.promptType, promptText: promptDraft.trim() });
      toast({ title: 'Prompt guardado', description: `${style.label}: nueva versión.` });
    } catch (err) {
      toast({ title: 'Error al guardar', description: err instanceof Error ? err.message : 'Error desconocido', variant: 'destructive' });
    }
  };

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

          {feedbackImage && (
            <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-2">
              <img src={`data:image/png;base64,${feedbackImage}`} alt="feedback" className="h-10 w-10 rounded object-cover" />
              <span className="flex-1 text-xs text-muted-foreground">
                Puliendo con base en esta imagen (el modelo la analiza).
              </span>
              <Button variant="ghost" size="sm" onClick={() => setFeedbackImage(null)}>Quitar</Button>
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

          <Separator />

          {/* Historial de versiones — original + últimas 4 ediciones */}
          <Collapsible open={historyOpen} onOpenChange={setHistoryOpen}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-2">
                <History className="h-4 w-4" />
                Historial de versiones
                {history.length > 0 && (
                  <Badge variant="outline" className="ml-1">{history.length}</Badge>
                )}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-3 space-y-2">
              {history.length === 0 && (
                <p className="text-sm text-muted-foreground">No hay versiones guardadas todavía.</p>
              )}
              {history.map((v) => (
                <div
                  key={v.id}
                  className="flex items-start justify-between gap-3 rounded-md border p-3 text-sm"
                >
                  <div className="flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <Badge variant={v.isOriginal ? 'default' : 'outline'} className="text-xs">
                        {stylePromptVersionLabel(v, original)}
                      </Badge>
                      {v.isOriginal && (
                        <span className="text-xs text-muted-foreground">Original</span>
                      )}
                      {v.createdAt && (
                        <span className="text-xs text-muted-foreground">
                          {new Date(v.createdAt).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                    <p className="line-clamp-2 font-mono text-xs text-muted-foreground">
                      {v.promptText}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    onClick={() => handleRestore(v.promptText)}
                    title="Cargar esta versión"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                Se conserva el original y las últimas 4 ediciones. Las más antiguas se eliminan automáticamente.
              </p>
            </CollapsibleContent>
          </Collapsible>
        </CollapsibleContent>
      </Collapsible>

      {/* Motor compartido: concepto → escena → prompt editable → generar */}
      <ImageConceptStudio
        style={style}
        stylePromptText={promptDraft || savedPromptText}
        onRefineFromImage={(imageBase64) => { setFeedbackImage(imageBase64); setPromptOpen(true); }}
      />
    </div>
  );
}
