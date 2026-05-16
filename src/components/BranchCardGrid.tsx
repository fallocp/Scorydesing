/**
 * BranchCardGrid — Grid of CommercialBranch cards for the selected category.
 *
 * Each card shows the branch name, objetivo summary, and audiencia.
 * Clicking a card opens the combinable generator panel.
 *
 * Requirements: 2.4, 3.2
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCommercialBranches } from '@/hooks/useCommercialBranches';
import type { CommercialBranch, StrategicConfig } from '@/types/xendingDesign';

interface BranchCardGridProps {
  /** The category_id to load branches for */
  categoryId: string | null;
  /** Currently selected branch id */
  selectedBranchId?: string | null;
  /** Called when a branch card is clicked */
  onBranchSelect: (branch: CommercialBranch) => void;
}

export function BranchCardGrid({
  categoryId,
  selectedBranchId,
  onBranchSelect,
}: BranchCardGridProps) {
  const { data: branches, isLoading, isError } = useCommercialBranches(categoryId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 p-4 border rounded-lg">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-muted-foreground">
        Error al cargar las ramas comerciales.
      </p>
    );
  }

  if (!branches || branches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay ramas comerciales en esta categoría.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {branches.map((branch) => (
        <BranchCard
          key={branch.id}
          branch={branch}
          isSelected={selectedBranchId === branch.id}
          onSelect={() => onBranchSelect(branch)}
        />
      ))}
    </div>
  );
}

function BranchCard({
  branch,
  isSelected,
  onSelect,
}: {
  branch: CommercialBranch;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const config = branch.strategic_config as StrategicConfig;

  return (
    <Card
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      className={cn(
        'cursor-pointer transition-all hover:shadow-md',
        isSelected
          ? 'border-2 border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
          : 'border border-border hover:border-muted-foreground/30',
      )}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect();
        }
      }}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-semibold text-foreground leading-tight">
            {branch.name}
          </h3>
          {isSelected && (
            <Badge className="bg-[#2ED4C7]/10 text-[#2ED4C7] border-[#2ED4C7]/30 text-xs shrink-0">
              Seleccionada
            </Badge>
          )}
        </div>

        {config?.objetivo && (
          <p className="text-sm text-muted-foreground line-clamp-2">
            💡 {config.objetivo}
          </p>
        )}

        {config?.audiencia && (
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-muted-foreground/70">🎯</span>
            <p className="text-xs text-muted-foreground line-clamp-1">
              {config.audiencia}
            </p>
          </div>
        )}

        {config?.angulos && config.angulos.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {config.angulos.slice(0, 3).map((angle) => (
              <Badge
                key={angle}
                variant="outline"
                className="text-[10px] px-1.5 py-0"
              >
                {angle}
              </Badge>
            ))}
            {config.angulos.length > 3 && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                +{config.angulos.length - 3}
              </Badge>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
