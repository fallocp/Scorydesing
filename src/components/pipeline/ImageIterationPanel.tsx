/**
 * ImageIterationPanel — Panel for iterating on generated images with feedback.
 *
 * Features:
 * - Shows the current generated image (latest iteration)
 * - Displays thumbnails of previous iterations from asset_snapshots
 * - Text input for user feedback ("Hazla más oscura", "Más personas", etc.)
 * - Iteration counter (e.g., "Iteración 2/3")
 * - "Restaurar" button on each thumbnail for rollback
 * - Disables iteration input when max_iterations reached
 * - Wires submit to resumePipeline(runId, { type: 'iterate_image', ideaId, feedback })
 *
 * Requirements: Property 8 (Iteration limit)
 */

import { useState } from 'react';
import {
  Image,
  Loader2,
  RotateCcw,
  Send,
  AlertCircle,
  History,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  useSnapshotHistory,
  useRollbackSnapshot,
  type AssetSnapshot,
} from '@/hooks/useMemoryTimeline';
import { usePipelineStore } from '@/store/pipelineStore';

// ─── Types ───────────────────────────────────────────────────────────────────

interface ImageIterationPanelProps {
  /** Pipeline run ID */
  runId: string;
  /** Idea ID for the image being iterated */
  ideaId: string;
  /** Current image (base64 or storage URL) */
  currentImageSrc: string;
  /** Maximum iterations allowed (from PipelineOptions, default: 3) */
  maxIterations?: number;
  /** Business ID for snapshot queries */
  businessId?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAX_ITERATIONS = 3;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;

  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Resolves the image source from a snapshot.
 * The content field may be a base64 string or a storage URL.
 */
function getSnapshotImageSrc(snapshot: AssetSnapshot): string {
  const content = snapshot.content;
  if (content.startsWith('http')) return content;
  if (content.startsWith('data:')) return content;
  return `data:image/png;base64,${content}`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function IterationThumbnail({
  snapshot,
  isLatest,
  onRollback,
  isRollingBack,
}: {
  snapshot: AssetSnapshot;
  isLatest: boolean;
  onRollback: (snapshotId: string) => void;
  isRollingBack: boolean;
}) {
  return (
    <div className="relative group flex-shrink-0">
      <div
        className={`relative w-20 h-20 rounded-lg overflow-hidden border-2 transition-colors ${
          isLatest
            ? 'border-primary ring-2 ring-primary/20'
            : 'border-border hover:border-primary/50'
        }`}
      >
        <img
          src={getSnapshotImageSrc(snapshot)}
          alt={`Iteración ${snapshot.version}`}
          className="w-full h-full object-cover"
        />
        {isLatest && (
          <div className="absolute top-0.5 right-0.5">
            <Badge variant="default" className="text-[9px] px-1 py-0 leading-tight">
              Actual
            </Badge>
          </div>
        )}
      </div>

      {/* Version label */}
      <p className="text-[10px] text-center text-muted-foreground mt-1">
        v{snapshot.version}
      </p>

      {/* Rollback button — only on non-latest */}
      {!isLatest && (
        <Button
          variant="secondary"
          size="sm"
          className="absolute -bottom-1 left-1/2 -translate-x-1/2 h-5 px-1.5 text-[9px] opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={() => onRollback(snapshot.id)}
          disabled={isRollingBack}
        >
          {isRollingBack ? (
            <Loader2 className="h-2.5 w-2.5 animate-spin" />
          ) : (
            <>
              <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
              Restaurar
            </>
          )}
        </Button>
      )}

      {/* Feedback tooltip */}
      {snapshot.feedback && (
        <p className="text-[9px] text-muted-foreground text-center truncate max-w-[80px] mt-0.5" title={snapshot.feedback}>
          "{snapshot.feedback}"
        </p>
      )}
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function ImageIterationPanel({
  runId,
  ideaId,
  currentImageSrc,
  maxIterations = DEFAULT_MAX_ITERATIONS,
  businessId,
}: ImageIterationPanelProps) {
  const { toast } = useToast();
  const { resumePipeline, isLoading } = usePipelineStore();
  const [feedback, setFeedback] = useState('');

  // Fetch snapshot history for this image (asset_id = ideaId, asset_type = 'image')
  const { data: snapshots = [], isLoading: snapshotsLoading } = useSnapshotHistory(
    'image',
    ideaId,
  );

  // Rollback mutation
  const rollbackMutation = useRollbackSnapshot('image', ideaId);

  // Derive iteration count from snapshots
  const currentIteration = snapshots.length > 0 ? snapshots[0].version : 1;
  const isMaxReached = currentIteration >= maxIterations;

  // Handle feedback submission
  const handleSubmitFeedback = () => {
    if (!feedback.trim() || isMaxReached) return;
    resumePipeline(runId, {
      type: 'iterate_image',
      ideaId,
      feedback: feedback.trim(),
    });
    setFeedback('');
  };

  // Handle keyboard submit
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmitFeedback();
    }
  };

  // Handle rollback
  const handleRollback = (snapshotId: string) => {
    rollbackMutation.mutate(snapshotId, {
      onSuccess: (newSnapshot) => {
        toast({
          title: 'Imagen restaurada',
          description: `Se restauró la versión ${(newSnapshot as AssetSnapshot).version}. Se creó una nueva versión con el contenido anterior.`,
        });
      },
      onError: (error) => {
        toast({
          title: 'Error al restaurar',
          description: error instanceof Error ? error.message : 'Error desconocido',
          variant: 'destructive',
        });
      },
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Image className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">Iteración de imagen</CardTitle>
          </div>
          <Badge
            variant={isMaxReached ? 'destructive' : 'secondary'}
            className="text-xs"
          >
            Iteración {currentIteration}/{maxIterations}
          </Badge>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4 space-y-4">
        {/* Current image preview */}
        <div className="relative rounded-lg overflow-hidden border bg-muted/30">
          <img
            src={currentImageSrc}
            alt="Imagen actual"
            className="w-full max-h-64 object-contain"
          />
        </div>

        {/* Version history thumbnails */}
        {snapshots.length > 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <History className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium text-muted-foreground">
                Historial de versiones
              </span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {snapshotsLoading ? (
                <div className="flex items-center gap-2 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Cargando historial...</span>
                </div>
              ) : (
                snapshots.map((snapshot) => (
                  <IterationThumbnail
                    key={snapshot.id}
                    snapshot={snapshot}
                    isLatest={snapshot.id === snapshots[0]?.id}
                    onRollback={handleRollback}
                    isRollingBack={rollbackMutation.isPending}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* Feedback input */}
        <div className="space-y-2">
          {isMaxReached ? (
            <div className="flex items-center gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3">
              <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
              <p className="text-sm text-destructive">
                Se alcanzó el límite de {maxIterations} iteraciones. No es posible iterar más sobre esta imagen.
              </p>
            </div>
          ) : (
            <>
              <label className="text-sm font-medium">
                Describe los cambios que necesitas:
              </label>
              <div className="flex gap-2">
                <Textarea
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ej: Hazla más oscura, agrega más personas, cambia el fondo..."
                  className="resize-none h-16 text-sm"
                  disabled={isLoading}
                />
                <Button
                  onClick={handleSubmitFeedback}
                  disabled={isLoading || !feedback.trim()}
                  size="sm"
                  className="self-end h-9 px-3"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" />
                  )}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Enter para enviar · Shift+Enter para nueva línea
              </p>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
