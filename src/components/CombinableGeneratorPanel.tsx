/**
 * CombinableGeneratorPanel — Main generation interface.
 *
 * Accepts Branch (required) + Vertical (optional) + Moment (optional) +
 * Channel (required) + Angle (optional). Shows a breadcrumb/tag bar of
 * selected dimensions and triggers `generate-ideas` with composed parameters.
 * Stores selected dimensions in the Zustand store.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 */

import { useCallback } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useDesignStore } from '@/store/designStore';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { useGenerateIdeas } from '@/hooks/useGenerateIdeas';
import { useToast } from '@/components/ui/use-toast';
import { VerticalSelector } from './VerticalSelector';
import { MomentSelector } from './MomentSelector';
import { ChannelSelector } from './ChannelSelector';
import { AngleSelector } from './AngleSelector';
import type { SelectedAngle } from './AngleSelector';
import type {
  CommercialBranch,
  IndustryVertical,
  MarketMoment,
  StrategicConfig,
} from '@/types/xendingDesign';

interface CombinableGeneratorPanelProps {
  /** The selected branch (required to generate) */
  branch: CommercialBranch | null;
  /** The active category id for loading verticals/moments */
  categoryId: string | null;
  /** Called when the user clears the branch selection */
  onClearBranch?: () => void;
  /** Called when ideas are generated successfully */
  onIdeasGenerated?: (ideas: unknown) => void;
  /** Existing headlines to avoid repeating */
  previousHeadlines?: string[];
}

export function CombinableGeneratorPanel({
  branch,
  categoryId,
  onClearBranch,
  onIdeasGenerated,
  previousHeadlines = [],
}: CombinableGeneratorPanelProps) {
  const { toast } = useToast();
  const { activeBusinessId } = useActiveBusiness();
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const selectedDimensions = useDesignStore((s) => s.selectedDimensions);
  const setSelectedDimensions = useDesignStore((s) => s.setSelectedDimensions);
  const resetDimensions = useDesignStore((s) => s.resetDimensions);

  const generateIdeas = useGenerateIdeas();

  // Sync branch to store when it changes
  const branchId = branch?.id ?? null;
  if (branchId !== selectedDimensions.branchId) {
    setSelectedDimensions({ branchId });
  }

  const handleVerticalChange = useCallback(
    (vertical: IndustryVertical | null) => {
      setSelectedDimensions({ verticalId: vertical?.id ?? null });
    },
    [setSelectedDimensions],
  );

  const handleMomentChange = useCallback(
    (moment: MarketMoment | null) => {
      setSelectedDimensions({ momentId: moment?.id ?? null });
    },
    [setSelectedDimensions],
  );

  const handleChannelChange = useCallback(
    (channel: string | null) => {
      setSelectedDimensions({ channel });
    },
    [setSelectedDimensions],
  );

  const handleAngleChange = useCallback(
    (angle: SelectedAngle | null) => {
      setSelectedDimensions({
        angle: angle?.slug ?? null,
        narrativeAngleId: angle?.id ?? null,
        narrativeAngle: angle?.name ?? null,
        funnelStage: angle?.funnelStage ?? null,
        promptInstruction: angle?.promptInstruction ?? null,
      });
    },
    [setSelectedDimensions],
  );

  const canGenerate = !!branch && !!selectedDimensions.channel;

  const handleGenerate = () => {
    if (!branch || !selectedDimensions.channel) {
      toast({
        title: 'Selecciona rama y canal',
        description: 'La rama comercial y el canal son obligatorios.',
        variant: 'destructive',
      });
      return;
    }

    generateIdeas.mutate(
      {
        type: 'copy',
        brand: selectedBrand ?? 'xending',
        business_id: activeBusinessId ?? undefined,
        branch_id: branch.id,
        vertical_id: selectedDimensions.verticalId ?? undefined,
        moment_id: selectedDimensions.momentId ?? undefined,
        channel: selectedDimensions.channel,
        angle: selectedDimensions.angle ?? undefined,
        narrativeAngle: selectedDimensions.narrativeAngle ?? undefined,
        narrativeAngleId: selectedDimensions.narrativeAngleId ?? undefined,
        funnelStage: selectedDimensions.funnelStage ?? undefined,
        promptInstruction: selectedDimensions.promptInstruction ?? undefined,
        previousIdeas: previousHeadlines.length > 0 ? previousHeadlines : undefined,
      },
      {
        onSuccess: (data) => {
          toast({ title: `${data.ideas.length} ideas generadas` });
          onIdeasGenerated?.(data);
        },
        onError: (error) => {
          toast({
            title: 'Error al generar ideas',
            description: error.message,
            variant: 'destructive',
          });
        },
      },
    );
  };

  const handleReset = () => {
    resetDimensions();
    onClearBranch?.();
  };

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Generador Combinable</CardTitle>
          {branch && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <X className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        {/* Breadcrumb / tag bar of selected dimensions */}
        <DimensionBreadcrumb
          branch={branch}
          dimensions={selectedDimensions}
        />

        <Separator />

        {/* Vertical selector (optional) */}
        <VerticalSelector
          categoryId={categoryId}
          selectedVerticalId={selectedDimensions.verticalId}
          onVerticalChange={handleVerticalChange}
        />

        {/* Moment selector (optional) */}
        <MomentSelector
          categoryId={categoryId}
          selectedMomentId={selectedDimensions.momentId}
          onMomentChange={handleMomentChange}
        />

        {/* Channel selector (required) */}
        <ChannelSelector
          value={selectedDimensions.channel}
          onChange={handleChannelChange}
        />

        {/* Angle selector (optional) */}
        <AngleSelector
          value={selectedDimensions.angle}
          onChange={handleAngleChange}
        />

        <Separator />

        {/* Generate button */}
        <Button
          onClick={handleGenerate}
          disabled={!canGenerate || generateIdeas.isPending}
          className="w-full"
        >
          <Sparkles className="h-4 w-4 mr-2" />
          {generateIdeas.isPending ? 'Generando...' : 'Generar Ideas'}
        </Button>

        {!branch && (
          <p className="text-xs text-muted-foreground text-center">
            Selecciona una rama comercial para comenzar
          </p>
        )}
      </CardContent>
    </Card>
  );
}

/** Breadcrumb showing the currently selected dimensions */
function DimensionBreadcrumb({
  branch,
  dimensions,
}: {
  branch: CommercialBranch | null;
  dimensions: { verticalId: string | null; momentId: string | null; channel: string | null; angle: string | null };
}) {
  const parts: string[] = [];

  if (branch) {
    parts.push(branch.name);
  }

  // We show IDs as placeholders — in a full implementation these would
  // resolve to names via cached query data. For now, show the slug/id.
  if (dimensions.verticalId) parts.push('🌿 Vertical');
  if (dimensions.momentId) parts.push('📊 Momento');
  if (dimensions.channel) parts.push(dimensions.channel);
  if (dimensions.angle) parts.push(dimensions.angle);

  if (parts.length === 0) {
    return (
      <p className="text-xs text-muted-foreground italic">
        Ninguna dimensión seleccionada
      </p>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {parts.map((part, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {i > 0 && <span className="text-muted-foreground text-xs">+</span>}
          <Badge variant="secondary" className="text-xs px-2 py-0.5">
            {part}
          </Badge>
        </span>
      ))}
    </div>
  );
}
