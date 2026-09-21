import { useState, useRef, useEffect } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useGenerateImage } from '@/hooks/useGenerateImage';
import { useDesignStore } from '@/store/designStore';
import { useToast } from '@/components/ui/use-toast';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useAuth } from '@/hooks/useAuth';
import { ImageGenerationControls } from '@/components/image-generation/ImageGenerationControls';
import { saveImageToLibrary } from '@/utils/imageStock/saveImageToLibrary';
import { acknowledgeSharedDesignImage, recoverSharedDesignImage, type SharedDesignImageResult } from '@/lib/desaing/sharedImageGeneration';

export function ImageGeneratorPanel() {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const { activeBusinessId } = useActiveBusiness();
  const { user } = useAuth();
  const scope = JSON.stringify([user?.id, activeBusinessId, selectedBrand]);
  const [draft, setDraft] = useState({ scope, prompt: '' });
  const prompt = draft.scope === scope ? draft.prompt : '';
  const setPrompt = (value: string) => setDraft({ scope, prompt: value });
  const [storedImage, setGeneratedImage] = useState<string | null>(null);
  const [storedGeneration, setGeneration] = useState<SharedDesignImageResult | null>(null);
  // Hide another session's bytes during render, before the cleanup effect runs.
  const generation = storedGeneration?.actor_id === user?.id
    && storedGeneration?.business_id === activeBusinessId
    && storedGeneration?.scope.library?.brand === selectedBrand ? storedGeneration : null;
  const generatedImage = generation ? storedImage : null;
  const [imageApproved, setImageApproved] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const generateImage = useGenerateImage('standalone-image');
  const isLoading = generateImage.isPending;
  const isBusy = isLoading || isSaving || isClosing;
  const busyRef = useRef(false);
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  useEffect(() => {
    setDraft({ scope, prompt: '' });
    setGeneration(null); setGeneratedImage(null); setImageApproved(null); setIsSaved(false);
  }, [scope]);

  const handleGenerate = async () => {
    if (busyRef.current || (generation && !isSaved)) return;
    if (!user?.id || !selectedBrand || !activeBusinessId || !prompt.trim()) {
      toast({
        title: 'Información faltante',
        description: 'Por favor ingresa una descripción de imagen y selecciona una marca.',
        variant: 'destructive',
      });
      return;
    }

    busyRef.current = true;
    try {
      const data = await generateImage.mutateAsync({
        userRequest: prompt.trim(),
        brand: selectedBrand,
        generationKey: 'current',
        libraryContext: { brand: selectedBrand, collection: 'generated', description: prompt.trim() },
      });
      if (scopeRef.current !== scope) return;
      const result = data.results[0];
      if (!result || result.actor_id !== user.id || result.business_id !== activeBusinessId
        || result.scope.library?.brand !== selectedBrand) throw new Error('La sesión cambió. Recupera la imagen desde su sesión original.');
      setGeneration(result);
      setGeneratedImage(`data:image/png;base64,${data.imageBase64}`);
      setImageApproved(null); setIsSaved(false);
    } catch (error) {
      if (scopeRef.current === scope) toast({ title: 'Error al generar imagen', description: error instanceof Error ? error.message : 'No se pudo generar la imagen.', variant: 'destructive' });
    } finally { busyRef.current = false; }
  };

  const handleApprove = async () => {
    if (generation && selectedBrand && !busyRef.current && scopeRef.current === scope) {
      busyRef.current = true;
      setIsSaving(true);
      try {
        const library = generation.scope.library;
        if (!library || generation.actor_id !== user?.id || generation.business_id !== activeBusinessId || library.brand !== selectedBrand) throw new Error('Vuelve a la sesión y marca originales para guardar esta imagen.');
        await saveImageToLibrary({
          generation, imageBase64: generation.imageBase64,
          brand: library.brand, collection: library.collection, description: library.description,
          promptUsed: generation.promptUsed.promptFinal, businessId: generation.business_id,
        });
        if (scopeRef.current !== scope) return;
        await acknowledgeSharedDesignImage(generation);
        if (scopeRef.current !== scope) return;
        setImageApproved(true);
        setIsSaved(true);
        toast({ title: 'Imagen guardada', description: 'Disponible en tu biblioteca de assets.' });
      } catch (err) {
        console.error('Error guardando imagen:', err);
        if (scopeRef.current === scope) toast({ title: 'Guardado pendiente', description: 'Tu imagen se conserva. Vuelve a pulsar Aprobar y Guardar para completar el guardado.', variant: 'destructive' });
      } finally {
        busyRef.current = false;
        setIsSaving(false);
      }
    }
  };

  const handleReject = async () => {
    if (!generation || busyRef.current || scopeRef.current !== scope) return;
    busyRef.current = true;
    setIsClosing(true);
    try {
      await acknowledgeSharedDesignImage(generation);
      if (scopeRef.current !== scope) return;
      setImageApproved(false); setGeneratedImage(null); setGeneration(null); setIsSaved(false);
      toast({ title: 'Imagen rechazada', description: 'Puedes modificar el prompt y generar de nuevo.' });
    } catch (error) {
      if (scopeRef.current === scope) toast({ title: 'No se pudo cerrar esta versión', description: error instanceof Error ? error.message : 'Vuelve a intentarlo.', variant: 'destructive' });
    } finally { busyRef.current = false; setIsClosing(false); }
  };

  const handleRecover = async () => {
    if (!user?.id || !activeBusinessId || !selectedBrand || busyRef.current) return;
    busyRef.current = true; setIsSaving(true);
    try {
      const result = await recoverSharedDesignImage({ actorId: user.id, businessId: activeBusinessId, process: 'stock', slotKey: 'standalone-image:current:v0' });
      if (!result) throw new Error('No hay una imagen pendiente para recuperar.');
      if (scopeRef.current !== scope) return;
      if (result.actor_id !== user.id || result.business_id !== activeBusinessId || result.scope.library?.brand !== selectedBrand) throw new Error('Selecciona la sesión y marca originales para recuperar esta imagen.');
      setGeneration(result); setGeneratedImage(`data:image/png;base64,${result.imageBase64}`);
      setPrompt(result.scope.library.description); setImageApproved(null); setIsSaved(false);
    } catch (error) {
      if (scopeRef.current === scope) toast({ title: 'Recuperación de imagen', description: error instanceof Error ? error.message : 'No se pudo recuperar la imagen.', variant: 'destructive' });
    } finally { busyRef.current = false; setIsSaving(false); }
  };

  return (
    <div className="space-y-4">
      <ImageGenerationControls value={generateImage.imageSettings} onChange={generateImage.setImageSettings} disabled={isBusy || !user?.id || !activeBusinessId} />
      <div className="space-y-2">
        <Label htmlFor="image-prompt">Descripción de Imagen</Label>
        <Textarea
          id="image-prompt"
          placeholder="ej., Cajas de aguacate en un centro de distribución en McAllen, Texas..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={isBusy || !user?.id}
        />
      </div>

      <Button
        onClick={handleGenerate}
        disabled={isBusy || !prompt.trim() || !user?.id || !selectedBrand || !activeBusinessId || (!!generation && !isSaved)}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        {isLoading ? 'Generando...' : 'Generar Imagen'}
      </Button>
      <Button variant="outline" onClick={handleRecover} disabled={isBusy || !user?.id || !activeBusinessId || !selectedBrand}>Recuperar imagen pendiente</Button>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="aspect-square max-w-md rounded-lg" />
          <p className="text-sm text-muted-foreground">
            Generando con el modelo y la calidad seleccionados. Esto puede tomar un momento.
          </p>
        </div>
      )}

      {generatedImage && !isLoading && (
        <div className="space-y-3">
          <div className="relative max-w-md">
            <img
              src={generatedImage}
              alt="Vista previa de imagen generada"
              className="w-full rounded-lg border"
            />
            {isSaved && (
              <Badge className="absolute top-2 right-2 bg-green-600 text-white border-0">
                <Check className="h-3 w-3 mr-0.5" />
                Guardada
              </Badge>
            )}
            {isSaving && (
              <Badge className="absolute top-2 right-2 bg-blue-600 text-white border-0">
                <Loader2 className="h-3 w-3 mr-0.5 animate-spin" />
                Guardando...
              </Badge>
            )}
          </div>

          {imageApproved === null && (
            <div className="flex items-center gap-3">
              <Button
                onClick={handleApprove}
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={isSaving || isClosing}
              >
                <Check className="h-4 w-4 mr-2" />
                Aprobar y Guardar
              </Button>
              <Button variant="outline" onClick={handleReject} disabled={isSaving || isClosing}>
                <X className="h-4 w-4 mr-2" />
                Rechazar y Reintentar
              </Button>
            </div>
          )}

          {imageApproved === true && isSaved && (
            <p className="text-sm text-green-600 font-medium">
              ✓ Imagen aprobada y guardada en tu biblioteca.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
