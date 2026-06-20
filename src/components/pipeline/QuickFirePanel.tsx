/**
 * QuickFirePanel — Reactive content generation UI
 *
 * Allows users to quickly generate content by providing a text trigger and/or
 * an image. Calls the `quick-fire` Edge Function which auto-detects content type,
 * selects templates, and runs the pipeline with autoApprove.
 *
 * Features:
 * - Text input for trigger/event description
 * - Drag-and-drop image upload (converts to base64)
 * - Platform selection checkboxes
 * - Trigger template quick-select buttons
 * - Pipeline progress tracking via PipelineProgressPanel
 * - Rendered PNG previews on completion
 *
 * Requirements: Property 7 (Brand isolation)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Zap,
  Upload,
  X,
  ImageIcon,
  Loader2,
  Sparkles,
  Monitor,
  Smartphone,
  LayoutGrid,
  ExternalLink,
  Pencil,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useToast } from '@/components/ui/use-toast';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { invokeWithRetry } from '@/lib/supabase-retry';
import { supabase } from '@/integrations/supabase/client';
import { PipelineProgressPanel } from './PipelineProgressPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface QuickFireResponse {
  pipeline_run_id: string;
  status: string;
  detected_content_type: string;
  template_selection: {
    content_type: string;
    visual_tone: string;
    layout_variation: string;
  };
  template_score?: number;
  template_reasoning?: string;
  platforms: string[];
  trigger_template_used: string | null;
  creative_profile_version: number | null;
}

interface TriggerTemplate {
  id: string;
  name: string;
  content_type: string;
  default_angle: string | null;
  auto_platforms: string[] | null;
}

interface RenderedPiece {
  id: string;
  headline: string;
  platform: string;
  png_storage_path: string | null;
  piece_status: string;
  template_type: string | null;
  visual_tone: string | null;
}

type PlatformOption = {
  value: string;
  label: string;
  icon: React.ReactNode;
};

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLATFORMS: PlatformOption[] = [
  { value: 'instagram-story', label: 'IG Story', icon: <Smartphone className="h-3.5 w-3.5" /> },
  { value: 'instagram-post', label: 'IG Post', icon: <LayoutGrid className="h-3.5 w-3.5" /> },
  { value: 'linkedin-post', label: 'LinkedIn', icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: 'facebook-post', label: 'Facebook', icon: <Monitor className="h-3.5 w-3.5" /> },
  { value: 'banner', label: 'Banner', icon: <Monitor className="h-3.5 w-3.5" /> },
];

const ACCEPTED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_IMAGE_SIZE_MB = 5;
const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Remove the data:image/...;base64, prefix
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function getStoragePublicUrl(path: string): string {
  const { data } = supabase.storage.from('design-images').getPublicUrl(path);
  return data.publicUrl;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QuickFirePanel() {
  const { toast } = useToast();
  const { activeBusinessId } = useActiveBusiness();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form state
  const [text, setText] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([
    'instagram-story',
    'instagram-post',
    'linkedin-post',
  ]);
  const [isDragOver, setIsDragOver] = useState(false);

  // Pipeline state
  const [pipelineRunId, setPipelineRunId] = useState<string | null>(null);
  const [quickFireResult, setQuickFireResult] = useState<QuickFireResponse | null>(null);
  const [renderedPieces, setRenderedPieces] = useState<RenderedPiece[]>([]);
  const [showResults, setShowResults] = useState(false);

  // ---------------------------------------------------------------------------
  // Trigger Templates Query
  // ---------------------------------------------------------------------------

  const { data: triggerTemplates = [] } = useQuery<TriggerTemplate[]>({
    queryKey: ['trigger-templates', activeBusinessId],
    queryFn: async () => {
      if (!activeBusinessId) return [];
      const { data, error } = await supabase
        .from('trigger_templates')
        .select('id, name, content_type, default_angle, auto_platforms')
        .eq('business_id', activeBusinessId)
        .eq('is_active', true)
        .order('name');

      if (error) throw error;
      return (data ?? []) as TriggerTemplate[];
    },
    enabled: !!activeBusinessId,
  });

  // ---------------------------------------------------------------------------
  // Quick Fire Mutation
  // ---------------------------------------------------------------------------

  const quickFireMutation = useMutation({
    mutationFn: async () => {
      if (!activeBusinessId) throw new Error('No hay negocio activo');

      let image_base64: string | undefined;
      if (imageFile) {
        image_base64 = await fileToBase64(imageFile);
      }

      const body: Record<string, unknown> = {
        business_id: activeBusinessId,
        text: text.trim() || undefined,
        image_base64,
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
      };

      return invokeWithRetry<QuickFireResponse>('quick-fire', { body });
    },
    onSuccess: (data) => {
      setQuickFireResult(data);
      setPipelineRunId(data.pipeline_run_id);
      toast({
        title: 'Quick Fire iniciado',
        description: `Tipo detectado: ${data.detected_content_type}. Generando para ${data.platforms.length} plataformas.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error al iniciar Quick Fire',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // ---------------------------------------------------------------------------
  // Fetch rendered pieces when pipeline completes
  // ---------------------------------------------------------------------------

  const handlePipelineComplete = useCallback(async () => {
    if (!pipelineRunId) return;

    const { data, error } = await supabase
      .from('pipeline_pieces')
      .select('id, headline, platform, png_storage_path, piece_status, template_type, visual_tone')
      .eq('pipeline_run_id', pipelineRunId)
      .in('piece_status', ['rendered', 'approved']);

    if (!error && data) {
      setRenderedPieces(data as RenderedPiece[]);
      setShowResults(true);
    }
  }, [pipelineRunId]);

  // ---------------------------------------------------------------------------
  // Image Handling
  // ---------------------------------------------------------------------------

  const validateImage = (file: File): string | null => {
    if (!ACCEPTED_IMAGE_TYPES.includes(file.type)) {
      return 'Tipo de archivo inválido. Solo PNG, JPG o WebP.';
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return `Archivo demasiado grande. Máximo ${MAX_IMAGE_SIZE_MB}MB.`;
    }
    return null;
  };

  const handleImageFile = useCallback(
    (file: File) => {
      const error = validateImage(file);
      if (error) {
        toast({ title: 'Error', description: error, variant: 'destructive' });
        return;
      }
      setImageFile(file);
      setImagePreview(URL.createObjectURL(file));
    },
    [toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleImageFile(file);
    },
    [handleImageFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleImageFile(file);
    },
    [handleImageFile]
  );

  const removeImage = () => {
    if (imagePreview) URL.revokeObjectURL(imagePreview);
    setImageFile(null);
    setImagePreview(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Cleanup preview URL on unmount
  useEffect(() => {
    return () => {
      if (imagePreview) URL.revokeObjectURL(imagePreview);
    };
  }, [imagePreview]);

  // ---------------------------------------------------------------------------
  // Platform Toggle
  // ---------------------------------------------------------------------------

  const togglePlatform = (platform: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(platform)
        ? prev.filter((p) => p !== platform)
        : [...prev, platform]
    );
  };

  // ---------------------------------------------------------------------------
  // Trigger Template Quick Select
  // ---------------------------------------------------------------------------

  const handleTriggerSelect = (template: TriggerTemplate) => {
    setText(template.name);
    if (template.auto_platforms) {
      setSelectedPlatforms(template.auto_platforms);
    }
  };

  // ---------------------------------------------------------------------------
  // Reset
  // ---------------------------------------------------------------------------

  const handleReset = () => {
    setText('');
    removeImage();
    setPipelineRunId(null);
    setQuickFireResult(null);
    setRenderedPieces([]);
    setShowResults(false);
    setSelectedPlatforms(['instagram-story', 'instagram-post', 'linkedin-post']);
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  const canSubmit = (text.trim() || imageFile) && selectedPlatforms.length > 0 && !quickFireMutation.isPending;
  const isInProgress = !!pipelineRunId && !showResults;

  // If pipeline is running, show progress
  if (isInProgress) {
    return (
      <div className="space-y-4">
        {/* Quick Fire result summary */}
        {quickFireResult && (
          <Card>
            <CardContent className="pt-4 space-y-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-amber-500" />
                <span className="text-sm font-medium">Quick Fire en progreso</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">
                  {quickFireResult.detected_content_type}
                </Badge>
                {quickFireResult.trigger_template_used && (
                  <Badge variant="outline">
                    Trigger: {quickFireResult.trigger_template_used}
                  </Badge>
                )}
                <Badge variant="outline">
                  {quickFireResult.platforms.length} plataformas
                </Badge>
              </div>
              {quickFireResult.template_selection && (
                <p className="text-xs text-muted-foreground">
                  Template: {quickFireResult.template_selection.content_type} ·{' '}
                  {quickFireResult.template_selection.visual_tone} ·{' '}
                  Layout {quickFireResult.template_selection.layout_variation}
                </p>
              )}
            </CardContent>
          </Card>
        )}

        {/* Pipeline progress */}
        <PipelineProgressPanel
          runId={pipelineRunId}
          onComplete={handlePipelineComplete}
        />

        <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
          Nuevo Quick Fire
        </Button>
      </div>
    );
  }

  // If results are ready, show rendered pieces
  if (showResults && renderedPieces.length > 0) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Resultados Quick Fire
              </CardTitle>
              <Badge variant="default">{renderedPieces.length} piezas</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {renderedPieces.map((piece) => (
                <div
                  key={piece.id}
                  className="group relative rounded-lg border overflow-hidden bg-muted/30"
                >
                  {piece.png_storage_path ? (
                    <img
                      src={getStoragePublicUrl(piece.png_storage_path)}
                      alt={piece.headline}
                      className="w-full h-auto object-contain"
                    />
                  ) : (
                    <div className="flex items-center justify-center h-40 text-muted-foreground">
                      <ImageIcon className="h-8 w-8" />
                    </div>
                  )}
                  {/* Overlay with info */}
                  <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                    <p className="text-white text-xs font-medium text-center px-2 line-clamp-2">
                      {piece.headline}
                    </p>
                    <div className="flex gap-1">
                      <Badge variant="secondary" className="text-[10px]">
                        {piece.platform}
                      </Badge>
                      {piece.visual_tone && (
                        <Badge variant="outline" className="text-[10px] text-white border-white/50">
                          {piece.visual_tone}
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-2 mt-1">
                      {piece.png_storage_path && (
                        <Button
                          variant="secondary"
                          size="sm"
                          className="h-7 text-xs"
                          asChild
                        >
                          <a
                            href={getStoragePublicUrl(piece.png_storage_path)}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-3 w-3 mr-1" />
                            Abrir
                          </a>
                        </Button>
                      )}
                      <Button variant="secondary" size="sm" className="h-7 text-xs">
                        <Pencil className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
          <Zap className="h-3.5 w-3.5 mr-1" />
          Nuevo Quick Fire
        </Button>
      </div>
    );
  }

  // Default: input form
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-4 w-4 text-amber-500" />
          Quick Fire
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Genera contenido reactivo en segundos. Escribe un evento o sube una imagen.
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Trigger template suggestions */}
        {triggerTemplates.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Atajos rápidos</Label>
            <div className="flex flex-wrap gap-1.5">
              {triggerTemplates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => handleTriggerSelect(t)}
                  className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted hover:border-primary/50"
                >
                  {t.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Text input */}
        <div className="space-y-1.5">
          <Label htmlFor="quick-fire-text">Evento o trigger</Label>
          <Textarea
            id="quick-fire-text"
            placeholder='Ej: "Fed sube tasas 25bp", "Dólar se dispara a 18.50"...'
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={2}
            className="resize-none"
          />
        </div>

        {/* Image drop zone */}
        <div className="space-y-1.5">
          <Label>Imagen (opcional)</Label>
          {!imageFile ? (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className={cn(
                'flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors',
                isDragOver
                  ? 'border-amber-400 bg-amber-50/50 dark:bg-amber-950/20'
                  : 'border-muted-foreground/25 hover:border-muted-foreground/50'
              )}
            >
              <Upload className="h-6 w-6 text-muted-foreground" />
              <p className="text-xs text-muted-foreground text-center">
                Arrastra una imagen o haz clic para subir
              </p>
              <p className="text-[10px] text-muted-foreground">
                PNG, JPG, WebP — máx {MAX_IMAGE_SIZE_MB}MB
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.jpg,.jpeg,.webp"
                onChange={handleFileInput}
                className="hidden"
                aria-label="Subir imagen para Quick Fire"
              />
            </div>
          ) : (
            <div className="relative rounded-lg border overflow-hidden">
              <img
                src={imagePreview!}
                alt="Imagen para Quick Fire"
                className="w-full max-h-40 object-contain bg-muted/30"
              />
              <Button
                variant="destructive"
                size="icon"
                className="absolute top-2 right-2 h-6 w-6"
                onClick={removeImage}
                aria-label="Eliminar imagen"
              >
                <X className="h-3 w-3" />
              </Button>
              <div className="absolute bottom-2 left-2 flex items-center gap-1 text-[10px] text-white bg-black/60 rounded px-1.5 py-0.5">
                <ImageIcon className="h-3 w-3" />
                {imageFile.name}
              </div>
            </div>
          )}
        </div>

        {/* Platform selection */}
        <div className="space-y-1.5">
          <Label>Plataformas</Label>
          <div className="flex flex-wrap gap-2">
            {PLATFORMS.map((platform) => (
              <label
                key={platform.value}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 cursor-pointer transition-colors text-xs',
                  selectedPlatforms.includes(platform.value)
                    ? 'border-primary bg-primary/5 text-primary'
                    : 'border-muted-foreground/25 text-muted-foreground hover:border-muted-foreground/50'
                )}
              >
                <Checkbox
                  checked={selectedPlatforms.includes(platform.value)}
                  onCheckedChange={() => togglePlatform(platform.value)}
                  className="h-3.5 w-3.5"
                />
                {platform.icon}
                {platform.label}
              </label>
            ))}
          </div>
        </div>

        {/* Submit button */}
        <Button
          onClick={() => quickFireMutation.mutate()}
          disabled={!canSubmit || !activeBusinessId}
          className="w-full"
        >
          {quickFireMutation.isPending ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Iniciando...
            </>
          ) : (
            <>
              <Zap className="h-4 w-4 mr-2" />
              Generar
            </>
          )}
        </Button>

        {!activeBusinessId && (
          <p className="text-xs text-destructive text-center">
            Selecciona un negocio activo para usar Quick Fire.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
