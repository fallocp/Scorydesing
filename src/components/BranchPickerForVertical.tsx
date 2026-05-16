/**
 * BranchPickerForVertical — Shows a compact branch selector when a vertical
 * is selected in Produce/Agro or Industrias categories.
 *
 * Loads commercial branches from the primary FX category (first category with
 * content type 'branches') so the user can combine a vertical with a branch
 * before generating content.
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useCampaignCategories } from '@/hooks/useCampaignCategories';
import { useCommercialBranches } from '@/hooks/useCommercialBranches';
import type { CommercialBranch, CampaignCategory, StrategicConfig } from '@/types/xendingDesign';

interface BranchPickerForVerticalProps {
  /** Currently selected branch id */
  selectedBranchId?: string | null;
  /** Called when a branch is selected */
  onBranchSelect: (branch: CommercialBranch) => void;
}

/**
 * Determine if a category shows branches (not verticals or moments).
 */
function isBranchCategory(category: CampaignCategory): boolean {
  const slug = category.slug?.toLowerCase() ?? '';
  if (slug.includes('market') || slug.includes('updates')) return false;
  if (slug.includes('agro') || slug.includes('produce') || slug.includes('industria')) return false;
  return true;
}

export function BranchPickerForVertical({
  selectedBranchId,
  onBranchSelect,
}: BranchPickerForVerticalProps) {
  const { data: categories } = useCampaignCategories();

  // Find the primary branch category (first one that shows branches)
  const primaryBranchCategory = useMemo(() => {
    if (!categories) return null;
    return categories.find(isBranchCategory) ?? null;
  }, [categories]);

  const { data: branches, isLoading } = useCommercialBranches(
    primaryBranchCategory?.id ?? null,
  );

  if (isLoading) {
    return (
      <div className="space-y-3">
        <p className="text-sm font-medium text-foreground">
          Selecciona un ángulo comercial para combinar:
        </p>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (!branches || branches.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay ramas comerciales disponibles para combinar.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          ¿Con qué ángulo comercial quieres combinar?
        </p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Selecciona una rama de {primaryBranchCategory?.name ?? 'la categoría principal'} para generar contenido combinado.
        </p>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
        {branches.map((branch) => {
          const isSelected = selectedBranchId === branch.id;
          const config = branch.strategic_config as StrategicConfig;
          return (
            <Card
              key={branch.id}
              role="button"
              tabIndex={0}
              className={cn(
                'cursor-pointer transition-all hover:shadow-sm',
                isSelected
                  ? 'border-2 border-[#2ED4C7] bg-[#2ED4C7]/5'
                  : 'border border-border hover:border-muted-foreground/30',
              )}
              onClick={() => onBranchSelect(branch)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onBranchSelect(branch);
                }
              }}
            >
              <CardContent className="p-3 space-y-1">
                <div className="flex items-center justify-between gap-1">
                  <h4 className="text-sm font-medium text-foreground leading-tight line-clamp-1">
                    {branch.name}
                  </h4>
                  {isSelected && (
                    <Badge className="bg-[#2ED4C7]/10 text-[#2ED4C7] border-[#2ED4C7]/30 text-[10px] shrink-0 px-1">
                      ✓
                    </Badge>
                  )}
                </div>
                {config?.objetivo && (
                  <p className="text-[11px] text-muted-foreground line-clamp-2">
                    {config.objetivo}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
