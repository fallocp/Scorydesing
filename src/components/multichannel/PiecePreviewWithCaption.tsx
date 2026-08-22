/**
 * PiecePreviewWithCaption — final preview with tabs per platform.
 *
 * For each rendered pipeline_piece, shows:
 *   - LEFT: rendered PNG (the overlay-on-image rendered by the template engine)
 *   - RIGHT: caption_body + caption_bullets + caption_hashtags, with a copy button
 *
 * Platforms without a caption (banner / instagram-story) show only the PNG centered.
 *
 * The user can:
 *   - Switch between platforms via tabs
 *   - Edit the caption locally before copying (no DB persistence)
 *   - Copy the caption to clipboard
 *   - Download the PNG
 */

import { useState, useEffect, useMemo } from 'react';
import { Loader2, Copy, Download, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { downloadImage } from '@/utils/downloadFile';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import {
  useMultichannelPieces,
  formatCaptionForCopy,
  getStoragePublicUrl,
  type MultichannelPiece,
} from '@/hooks/useMultichannelPieces';

const PLATFORM_LABELS: Record<string, string> = {
  'linkedin-post': '💼 LinkedIn',
  'facebook-post': '👥 Facebook',
  'instagram-post': '📷 IG Post',
  'instagram-story': '📱 IG Story',
  'banner': '🖼️ Banner',
};

const PLATFORMS_WITHOUT_CAPTION = new Set(['banner', 'instagram-story']);

const PLATFORM_DIMS: Record<string, string> = {
  'linkedin-post': '1200 × 628',
  'facebook-post': '1200 × 628',
  'instagram-post': '1080 × 1080',
  'instagram-story': '1080 × 1920',
  'banner': '1920 × 1080',
};

export interface PiecePreviewWithCaptionProps {
  pipelineRunId: string;
}

export function PiecePreviewWithCaption({ pipelineRunId }: PiecePreviewWithCaptionProps) {
  const { data: pieces, isLoading } = useMultichannelPieces(pipelineRunId);
  const { toast } = useToast();

  // Local editable captions per piece (string keyed by piece.id)
  const [localCaptions, setLocalCaptions] = useState<Record<string, string>>({});

  // Initialize local captions when pieces arrive
  useEffect(() => {
    if (!pieces || pieces.length === 0) return;
    setLocalCaptions((prev) => {
      const next = { ...prev };
      for (const p of pieces) {
        if (next[p.id] === undefined) {
          next[p.id] = formatCaptionForCopy(p);
        }
      }
      return next;
    });
  }, [pieces]);

  // First non-empty platform as default tab
  const platforms = useMemo(() => {
    if (!pieces) return [];
    return Array.from(new Set(pieces.map((p) => p.platform)));
  }, [pieces]);

  const [activeTab, setActiveTab] = useState<string | null>(null);
  useEffect(() => {
    if (platforms.length > 0 && !activeTab) {
      setActiveTab(platforms[0]);
    }
  }, [platforms, activeTab]);

  if (isLoading) {
    return (
      <div className="flex items-center gap-3 p-8 justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span className="text-sm">Cargando piezas…</span>
      </div>
    );
  }

  if (!pieces || pieces.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
        Aún no hay piezas renderizadas.
      </div>
    );
  }

  const activePiece = pieces.find((p) => p.platform === activeTab) ?? pieces[0];
  const isRendering =
    activePiece.piece_status !== 'rendered' && activePiece.piece_status !== 'approved';

  return (
    <div className="space-y-4">
      <Tabs value={activeTab ?? platforms[0]} onValueChange={setActiveTab}>
        <TabsList className="flex flex-wrap gap-2 h-auto p-1 bg-muted/30">
          {platforms.map((platform) => {
            const piece = pieces.find((p) => p.platform === platform);
            const ready = piece && (piece.piece_status === 'rendered' || piece.piece_status === 'approved');
            return (
              <TabsTrigger
                key={platform}
                value={platform}
                className="data-[state=active]:bg-white data-[state=active]:shadow-sm"
              >
                <span className="mr-1.5">{PLATFORM_LABELS[platform] ?? platform}</span>
                {ready ? (
                  <Check className="h-3 w-3 text-green-600" />
                ) : (
                  <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>

        {platforms.map((platform) => {
          const piece = pieces.find((p) => p.platform === platform);
          if (!piece) return null;
          return (
            <TabsContent key={platform} value={platform} className="mt-4">
              <PieceTab
                piece={piece}
                isRendering={isRendering && piece.platform === activeTab}
                localCaption={localCaptions[piece.id] ?? formatCaptionForCopy(piece)}
                onLocalCaptionChange={(value) =>
                  setLocalCaptions((prev) => ({ ...prev, [piece.id]: value }))
                }
                toast={toast}
              />
            </TabsContent>
          );
        })}
      </Tabs>
    </div>
  );
}

// ─── Per-tab content ────────────────────────────────────────────────────────

interface PieceTabProps {
  piece: MultichannelPiece;
  isRendering: boolean;
  localCaption: string;
  onLocalCaptionChange: (value: string) => void;
  toast: (input: { title: string; description?: string; variant?: 'destructive' | 'default' }) => void;
}

function PieceTab({ piece, localCaption, onLocalCaptionChange, toast }: PieceTabProps) {
  const pngUrl = getStoragePublicUrl(piece.png_storage_path);
  const hasCaption = !PLATFORMS_WITHOUT_CAPTION.has(piece.platform);
  const dims = PLATFORM_DIMS[piece.platform] ?? '';
  const isReady = piece.piece_status === 'rendered' || piece.piece_status === 'approved';

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(localCaption);
      toast({ title: 'Caption copiado', description: 'Pégalo en la plataforma al publicar.' });
    } catch {
      toast({
        title: 'No se pudo copiar',
        description: 'Selecciona el texto manualmente.',
        variant: 'destructive',
      });
    }
  };

  const handleDownload = async () => {
    if (!pngUrl) return;
    try {
      await downloadImage(pngUrl, `pieza-${Date.now()}.png`);
    } catch {
      // Si falla la descarga (p. ej. CORS), abrir en pestaña como respaldo.
      window.open(pngUrl, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <div className={`grid gap-4 ${hasCaption ? 'md:grid-cols-2' : 'md:grid-cols-1 md:place-items-center'}`}>
      {/* Left: rendered PNG */}
      <div className="space-y-2">
        <div className="rounded-lg border bg-muted/20 overflow-hidden flex items-center justify-center min-h-[300px]">
          {pngUrl ? (
            <img
              src={pngUrl}
              alt={`Pieza renderizada para ${piece.platform}`}
              className="w-full h-auto max-h-[600px] object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 p-8 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{isReady ? 'PNG no disponible' : 'Renderizando...'}</span>
            </div>
          )}
        </div>
        <div className="flex items-center justify-between text-xs">
          <Badge variant="outline" className="font-mono">📐 {dims}</Badge>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={!pngUrl}
            className="h-7"
          >
            <Download className="h-3 w-3 mr-1.5" />
            Descargar PNG
          </Button>
        </div>
      </div>

      {/* Right: caption (if applicable) */}
      {hasCaption && (
        <div className="space-y-2">
          <div className="text-sm font-semibold">📝 Caption para {PLATFORM_LABELS[piece.platform] ?? piece.platform}</div>
          <Textarea
            value={localCaption}
            onChange={(e) => onLocalCaptionChange(e.target.value)}
            rows={12}
            className="font-mono text-xs resize-y"
            placeholder="El caption se cargará cuando la pieza termine de renderizar..."
          />
          <Button
            onClick={handleCopyCaption}
            disabled={!localCaption}
            className="w-full bg-[#FF7A4A] hover:bg-[#E85A2C] text-white"
          >
            <Copy className="h-4 w-4 mr-2" />
            Copiar caption
          </Button>
          {piece.caption_hashtags && piece.caption_hashtags.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Incluye {piece.caption_hashtags.length} hashtags al final.
            </p>
          )}
        </div>
      )}

      {!hasCaption && (
        <p className="text-xs text-center text-muted-foreground italic md:col-span-1 mt-2">
          {piece.platform === 'instagram-story'
            ? 'Las stories no requieren caption — la pieza es standalone para subir directo.'
            : 'Banner standalone — sin caption asociado.'}
        </p>
      )}
    </div>
  );
}
