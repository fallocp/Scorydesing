import { useState, useRef } from 'react';
import { Sparkles, Check, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { useGenerateImage } from '@/hooks/useGenerateImage';
import { useDesignStore } from '@/store/designStore';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

export function ImageGeneratorPanel() {
  const { toast } = useToast();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const [prompt, setPrompt] = useState('');
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [imageBase64Raw, setImageBase64Raw] = useState<string | null>(null);
  const [imageApproved, setImageApproved] = useState<boolean | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const generateImage = useGenerateImage();
  const isLoading = generateImage.isPending;

  const handleGenerate = () => {
    if (!selectedBrand || !prompt.trim()) {
      toast({
        title: 'Información faltante',
        description: 'Por favor ingresa una descripción de imagen y selecciona una marca.',
        variant: 'destructive',
      });
      return;
    }

    setGeneratedImage(null);
    setImageBase64Raw(null);
    setImageApproved(null);
    setIsSaved(false);

    generateImage.mutate(
      {
        userRequest: prompt.trim(),
        brand: selectedBrand,
      },
      {
        onSuccess: (data) => {
          setImageBase64Raw(data.imageBase64);
          setGeneratedImage(`data:image/png;base64,${data.imageBase64}`);
        },
        onError: (error) => {
          toast({
            title: 'Error al generar imagen',
            description: error.message,
            variant: 'destructive',
          });
        },
      }
    );
  };

  const handleApprove = async () => {
    setImageApproved(true);

    // Auto-save to Supabase Storage
    if (imageBase64Raw && selectedBrand) {
      setIsSaving(true);
      try {
        const byteString = atob(imageBase64Raw);
        const ab = new ArrayBuffer(byteString.length);
        const ia = new Uint8Array(ab);
        for (let i = 0; i < byteString.length; i++) {
          ia[i] = byteString.charCodeAt(i);
        }
        const blob = new Blob([ab], { type: 'image/png' });

        const stripAccents = (str: string) =>
          str.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const slug = stripAccents(prompt)
          .toLowerCase()
          .replace(/[^a-z0-9\s-]/g, '')
          .replace(/\s+/g, '-')
          .slice(0, 60);
        const filename = `${selectedBrand}/generated/${slug}-${Date.now()}.png`;

        const { error: uploadError } = await supabase.storage
          .from('design-images')
          .upload(filename, blob, { contentType: 'image/png', upsert: false });

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('design-images')
          .getPublicUrl(filename);

        await supabase.from('design_images').insert({
          brand: selectedBrand,
          source: 'generated',
          storage_path: urlData.publicUrl,
          description: prompt,
          tags: prompt.toLowerCase().split(/\s+/).filter((w) => w.length > 3).slice(0, 8),
          theme: 'generated',
          prompt_used: prompt,
          usage_count: 0,
        });

        setIsSaved(true);
        toast({ title: 'Imagen guardada', description: 'Disponible en tu biblioteca de assets.' });
      } catch (err) {
        console.error('Error guardando imagen:', err);
        toast({ title: 'Imagen aprobada pero no se pudo guardar', description: 'Guárdala manualmente con clic derecho.', variant: 'destructive' });
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleReject = () => {
    setImageApproved(false);
    setGeneratedImage(null);
    setImageBase64Raw(null);
    setIsSaved(false);
    toast({ title: 'Imagen rechazada', description: 'Puedes modificar el prompt y generar de nuevo.' });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="image-prompt">Descripción de Imagen</Label>
        <Textarea
          id="image-prompt"
          placeholder="ej., Cajas de aguacate en un centro de distribución en McAllen, Texas..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          disabled={isLoading}
        />
      </div>

      <Button
        onClick={handleGenerate}
        disabled={isLoading || !prompt.trim() || !selectedBrand}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        {isLoading ? 'Generando...' : 'Generar Imagen'}
      </Button>

      {isLoading && (
        <div className="space-y-2">
          <Skeleton className="aspect-square max-w-md rounded-lg" />
          <p className="text-sm text-muted-foreground">
            Generando imagen con GPT Image 2... Esto puede tomar un momento.
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
                disabled={isSaving}
              >
                <Check className="h-4 w-4 mr-2" />
                Aprobar y Guardar
              </Button>
              <Button variant="outline" onClick={handleReject}>
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
