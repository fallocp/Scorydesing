/**
 * MemoryTimeline — Displays the version evolution of an asset with rollback support.
 *
 * Shows a vertical timeline combining:
 * - Asset snapshots (image/html/copy versions) with visual diff indicators
 * - Learning deltas (increase/decrease preference changes)
 *
 * Each snapshot entry includes a "Restaurar versión X" button for rollback.
 * Rollback is append-only — it creates a new version with the target's content.
 *
 * Requirements: Property 4 (Result preservation)
 */

import { useMemo } from 'react';
import {
  History,
  Image,
  Code,
  FileText,
  RotateCcw,
  TrendingUp,
  TrendingDown,
  GitBranch,
  Loader2,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import {
  useSnapshotHistory,
  useLearningDeltas,
  useRollbackSnapshot,
  buildTimeline,
  type AssetType,
  type AssetSnapshot,
  type LearningDelta,
  type TimelineEvent,
} from '@/hooks/useMemoryTimeline';

// ─── Props ───────────────────────────────────────────────────────────────────

interface MemoryTimelineProps {
  /** Type of asset to show history for */
  assetType: AssetType;
  /** ID of the specific asset */
  assetId: string;
  /** Optional business ID to also show learning deltas */
  businessId?: string;
  /** Max number of learning deltas to show (default: 20) */
  maxDeltas?: number;
  /** Whether to show the rollback button on snapshots (default: true) */
  showRollback?: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return 'Ahora';
  if (diffMins < 60) return `Hace ${diffMins} min`;
  if (diffHours < 24) return `Hace ${diffHours}h`;
  if (diffDays < 7) return `Hace ${diffDays}d`;

  return date.toLocaleDateString('es-MX', {
    day: 'numeric',
    month: 'short',
    year: date.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
  });
}

function getAssetIcon(assetType: AssetType) {
  switch (assetType) {
    case 'image':
      return Image;
    case 'html':
      return Code;
    case 'copy':
      return FileText;
  }
}

function isRollbackSnapshot(snapshot: AssetSnapshot): boolean {
  return !!(snapshot.metadata as Record<string, unknown>)?.rollback_from_version;
}

function getTriggerLabel(triggerType: LearningDelta['trigger_type']): string {
  switch (triggerType) {
    case 'approval':
      return 'Aprobación';
    case 'rejection':
      return 'Rechazo';
    case 'explicit_feedback':
      return 'Feedback';
    case 'pattern':
      return 'Patrón detectado';
  }
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function SnapshotEntry({
  snapshot,
  isLatest,
  showRollback,
  onRollback,
  isRollingBack,
}: {
  snapshot: AssetSnapshot;
  isLatest: boolean;
  showRollback: boolean;
  onRollback: (snapshotId: string) => void;
  isRollingBack: boolean;
}) {
  const AssetIcon = getAssetIcon(snapshot.asset_type);
  const isRollback = isRollbackSnapshot(snapshot);
  const rollbackFromVersion = (snapshot.metadata as Record<string, unknown>)?.rollback_from_version;

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div
          className={`flex h-8 w-8 items-center justify-center rounded-full border-2 ${
            isLatest
              ? 'border-primary bg-primary/10'
              : isRollback
                ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/20'
                : 'border-muted-foreground/30 bg-background'
          }`}
        >
          {isRollback ? (
            <RotateCcw className="h-3.5 w-3.5 text-amber-600" />
          ) : (
            <AssetIcon className="h-3.5 w-3.5 text-muted-foreground" />
          )}
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">
                Versión {snapshot.version}
              </span>
              {isLatest && (
                <Badge variant="default" className="text-[10px] px-1.5 py-0">
                  Actual
                </Badge>
              )}
              {isRollback && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-amber-500 text-amber-600">
                  Rollback v{String(rollbackFromVersion)}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(snapshot.created_at)}
            </p>
          </div>

          {/* Rollback button — not shown on the latest version */}
          {showRollback && !isLatest && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => onRollback(snapshot.id)}
              disabled={isRollingBack}
            >
              {isRollingBack ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <RotateCcw className="h-3 w-3 mr-1" />
              )}
              Restaurar versión {snapshot.version}
            </Button>
          )}
        </div>

        {/* Feedback text */}
        {snapshot.feedback && (
          <p className="mt-1 text-xs text-muted-foreground italic">
            "{snapshot.feedback}"
          </p>
        )}

        {/* Metadata badges */}
        {snapshot.metadata && Object.keys(snapshot.metadata).length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {(snapshot.metadata as Record<string, unknown>).template_type && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {String((snapshot.metadata as Record<string, unknown>).template_type)}
              </Badge>
            )}
            {(snapshot.metadata as Record<string, unknown>).platform && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {String((snapshot.metadata as Record<string, unknown>).platform)}
              </Badge>
            )}
            {(snapshot.metadata as Record<string, unknown>).visual_tone && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                {String((snapshot.metadata as Record<string, unknown>).visual_tone)}
              </Badge>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function LearningDeltaEntry({ delta }: { delta: LearningDelta }) {
  const hasIncrease = delta.increase.length > 0;
  const hasDecrease = delta.decrease.length > 0;

  return (
    <div className="flex gap-3">
      {/* Timeline dot */}
      <div className="flex flex-col items-center">
        <div className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-violet-400 bg-violet-50 dark:bg-violet-950/20">
          <GitBranch className="h-3.5 w-3.5 text-violet-600" />
        </div>
        <div className="w-px flex-1 bg-border" />
      </div>

      {/* Content */}
      <div className="flex-1 pb-4">
        <div className="space-y-0.5">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">Aprendizaje</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-400 text-violet-600">
              {getTriggerLabel(delta.trigger_type)}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {formatTimestamp(delta.created_at)}
          </p>
        </div>

        {/* Increase/Decrease badges */}
        <div className="mt-1.5 space-y-1">
          {hasIncrease && (
            <div className="flex items-center gap-1 flex-wrap">
              <TrendingUp className="h-3 w-3 text-green-600 shrink-0" />
              {delta.increase.map((item, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-green-300 text-green-700 dark:text-green-400"
                >
                  +{item}
                </Badge>
              ))}
            </div>
          )}
          {hasDecrease && (
            <div className="flex items-center gap-1 flex-wrap">
              <TrendingDown className="h-3 w-3 text-red-500 shrink-0" />
              {delta.decrease.map((item, i) => (
                <Badge
                  key={i}
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 border-red-300 text-red-600 dark:text-red-400"
                >
                  −{item}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────

export function MemoryTimeline({
  assetType,
  assetId,
  businessId,
  maxDeltas = 20,
  showRollback = true,
}: MemoryTimelineProps) {
  const { toast } = useToast();

  // Fetch snapshot history
  const {
    data: snapshots = [],
    isLoading: snapshotsLoading,
  } = useSnapshotHistory(assetType, assetId);

  // Fetch learning deltas (only if businessId provided)
  const {
    data: deltas = [],
    isLoading: deltasLoading,
  } = useLearningDeltas(businessId, maxDeltas);

  // Rollback mutation
  const rollbackMutation = useRollbackSnapshot(assetType, assetId);

  // Build unified timeline
  const timeline = useMemo(
    () => buildTimeline(snapshots, businessId ? deltas : []),
    [snapshots, deltas, businessId],
  );

  const isLoading = snapshotsLoading || (!!businessId && deltasLoading);

  // Handle rollback
  const handleRollback = (snapshotId: string) => {
    rollbackMutation.mutate(snapshotId, {
      onSuccess: (newSnapshot) => {
        toast({
          title: 'Versión restaurada',
          description: `Se creó la versión ${(newSnapshot as AssetSnapshot).version} con el contenido restaurado.`,
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

  // Determine the latest snapshot version
  const latestSnapshotId = snapshots.length > 0 ? snapshots[0].id : null;

  // ─── Render ──────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Cargando historial...</span>
        </CardContent>
      </Card>
    );
  }

  if (timeline.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-8 text-center">
          <History className="h-8 w-8 text-muted-foreground/50 mb-2" />
          <p className="text-sm text-muted-foreground">
            Sin historial de versiones
          </p>
          <p className="text-xs text-muted-foreground/70 mt-1">
            Las versiones aparecerán aquí conforme se generen cambios.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-base">Historial de versiones</CardTitle>
          <Badge variant="secondary" className="ml-auto text-xs">
            {snapshots.length} {snapshots.length === 1 ? 'versión' : 'versiones'}
          </Badge>
        </div>
      </CardHeader>

      <Separator />

      <CardContent className="pt-4">
        <div className="space-y-0">
          {timeline.map((event) => {
            if (event.type === 'snapshot') {
              return (
                <SnapshotEntry
                  key={`snapshot-${event.data.id}`}
                  snapshot={event.data}
                  isLatest={event.data.id === latestSnapshotId}
                  showRollback={showRollback}
                  onRollback={handleRollback}
                  isRollingBack={rollbackMutation.isPending}
                />
              );
            }

            return (
              <LearningDeltaEntry
                key={`delta-${event.data.id}`}
                delta={event.data}
              />
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
