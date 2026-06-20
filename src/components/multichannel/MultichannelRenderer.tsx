/**
 * MultichannelRenderer — modal/panel that takes an approved idea + image
 * and renders it for multiple platforms in one shot.
 *
 * Flow:
 *   1. User sees PlatformSelector (LinkedIn pre-selected by default).
 *   2. Clicks "Renderizar" → invokes `render-multichannel` edge function.
 *   3. Backend creates pipeline_run, hydrates templates, renders PNGs.
 *   4. UI swaps to <PiecePreviewWithCaption> showing tabs per platform with
 *      PNG + caption + copy button.
 *
 * Reusable from any caller that already has:
 *   - an approved V2 piece (overlays + captions for all 3 variants)
 *   - an approved image URL (the shared image for all platforms)
 *   - a business_id
 *
 * The component handles the entire async lifecycle internally so the caller
 * just renders <MultichannelRenderer ... /> and lets it run.
 */

import { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { PlatformSelector } from './PlatformSelector';
import { PiecePreviewWithCaption } from './PiecePreviewWithCaption';
import {
  useRenderMultichannel,
  type PlatformFormat,
  type PieceV2,
} from '@/hooks/useRenderMultichannel';

const DEFAULT_CHANNELS: PlatformFormat[] = [
  'linkedin-post',
  'instagram-post',
  'instagram-story',
];

const TEMPLATE_OPTIONS = [
  'card-light',
  'card-dark',
  'card-navy',
  'card-turquesa',
  'breaking-news',
  'corporate',
  'market-update',
  'stat-of-the-day',
  'tip-educational',
  'event-special',
];

export interface MultichannelRendererProps {
  businessId: string;
  pieceV2: PieceV2;
  imageUrl: string;
  /** Optional default template type. Defaults to "card-light". */
  defaultTemplateType?: string;
  /** Optional pipeline_run to continue. If not present, a new one is created. */
  existingPipelineRunId?: string;
  /** Called when user closes the panel (after result or cancel). Optional. */
  onClose?: () => void;
}

export function MultichannelRenderer({
  businessId,
  pieceV2,
  imageUrl,
  defaultTemplateType = 'card-light',
  existingPipelineRunId,
  onClose,
}: MultichannelRendererProps) {
  const { toast } = useToast();
  const [channels, setChannels] = useState<PlatformFormat[]>(DEFAULT_CHANNELS);
  const [templateType, setTemplateType] = useState(defaultTemplateType);
  const [resultRunId, setResultRunId] = useState<string | null>(null);

  const renderMutation = useRenderMultichannel();

  const canSubmit = channels.length > 0 && !!imageUrl && !!businessId && !!pieceV2;

  const handleRender = () => {
    if (!canSubmit) {
      toast({
        title: 'Faltan datos',
        description: 'Selecciona al menos una plataforma y verifica que la imagen esté lista.',
        variant: 'destructive',
      });
      return;
    }

    renderMutation.mutate(
      {
        business_id: businessId,
        pieceV2,
        imageUrl,
        channels,
        templateType,
        layoutVariation: 'A',
        existingPipelineRunId,
      },
      {
        onSuccess: (data) => {
          setResultRunId(data.pipelineRunId);
          if (data.warning === 'render_service_unavailable') {
            toast({
              title: 'Render service no disponible',
              description: 'Las piezas se prepararon pero no se renderizaron. Reintenta en unos minutos.',
              variant: 'destructive',
            });
          } else {
            toast({
              title: `${data.rendered} ${data.rendered === 1 ? 'pieza renderizada' : 'piezas renderizadas'}`,
              description: data.failed > 0 ? `${data.failed} fallaron, revisa los detalles.` : undefined,
            });
          }
        },
        onError: (error) => {
          toast({
            title: 'Error al renderizar',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const isLoading = renderMutation.isPending;
  const showResult = !!resultRunId;

  return (
    <Card className="border-2 border-[#2ED4C7]/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-[#2ED4C7]" />
            Renderizar para múltiples plataformas
          </CardTitle>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {!showResult && (
          <>
            <ImagePreview imageUrl={imageUrl} />

            <PlatformSelector
              selected={channels}
              onChange={setChannels}
              disabled={isLoading}
            />

            <div className="space-y-2">
              <Label htmlFor="template-type" className="text-sm font-semibold">
                Template
              </Label>
              <select
                id="template-type"
                value={templateType}
                onChange={(e) => setTemplateType(e.target.value)}
                disabled={isLoading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {TEMPLATE_OPTIONS.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <Button
              onClick={handleRender}
              disabled={!canSubmit || isLoading}
              size="lg"
              className="w-full bg-[#FF7A4A] hover:bg-[#E85A2C] text-white"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Renderizando {channels.length} {channels.length === 1 ? 'pieza' : 'piezas'}…
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Renderizar {channels.length} {channels.length === 1 ? 'pieza' : 'piezas'}
                </>
              )}
            </Button>
          </>
        )}

        {showResult && resultRunId && (
          <>
            <PiecePreviewWithCaption pipelineRunId={resultRunId} />
            <div className="flex justify-end">
              <Button
                variant="outline"
                onClick={() => {
                  setResultRunId(null);
                  renderMutation.reset();
                }}
              >
                Renderizar otra vez con distintas plataformas
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function ImagePreview({ imageUrl }: { imageUrl: string }) {
  if (!imageUrl) return null;
  return (
    <div className="space-y-2">
      <Label className="text-sm font-semibold">Imagen base</Label>
      <div className="rounded-lg border overflow-hidden bg-muted/20 max-w-xs">
        <img src={imageUrl} alt="Imagen base aprobada" className="w-full h-auto" />
      </div>
      <p className="text-xs text-muted-foreground">
        Esta misma imagen se usa para todas las plataformas seleccionadas.
      </p>
    </div>
  );
}
