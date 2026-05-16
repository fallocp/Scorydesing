/**
 * VerticalSelector — Card/chip selector for IndustryVerticals.
 *
 * Shown when category is "Produce / Agro" or "Industrias" or when the user
 * opts to combine. Displays vertical name, description, and keywords.
 *
 * Requirements: 4.3, 10.3
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useIndustryVerticals } from '@/hooks/useIndustryVerticals';
import type { IndustryVertical } from '@/types/xendingDesign';

interface VerticalSelectorProps {
  /** The category_id to load verticals for */
  categoryId: string | null;
  /** Currently selected vertical id */
  selectedVerticalId?: string | null;
  /** Called when a vertical is selected or deselected */
  onVerticalChange: (vertical: IndustryVertical | null) => void;
}

export function VerticalSelector({
  categoryId,
  selectedVerticalId,
  onVerticalChange,
}: VerticalSelectorProps) {
  const { data: verticals, isLoading, isError } = useIndustryVerticals(categoryId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 w-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !verticals || verticals.length === 0) {
    return null; // Verticals are optional — hide when none exist
  }

  const handleSelect = (vertical: IndustryVertical) => {
    if (selectedVerticalId === vertical.id) {
      onVerticalChange(null); // Deselect
    } else {
      onVerticalChange(vertical);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Vertical de Industria
        </h3>
        <p className="text-xs text-muted-foreground">
          Selecciona un producto o industria para combinar con la rama comercial (opcional)
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {verticals.map((vertical) => (
          <VerticalCard
            key={vertical.id}
            vertical={vertical}
            isSelected={selectedVerticalId === vertical.id}
            onSelect={() => handleSelect(vertical)}
          />
        ))}
      </div>
    </div>
  );
}

function VerticalCard({
  vertical,
  isSelected,
  onSelect,
}: {
  vertical: IndustryVertical;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <Card
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cn(
        'cursor-pointer transition-all hover:shadow-sm',
        isSelected
          ? 'border-2 border-[#2ED4C7] ring-1 ring-[#2ED4C7]/20 bg-[#2ED4C7]/5'
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
      <CardContent className="p-3 space-y-2">
        <p className="text-sm font-medium text-foreground leading-tight">
          {vertical.name}
        </p>

        {vertical.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {vertical.description}
          </p>
        )}

        {vertical.keywords && vertical.keywords.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {vertical.keywords.slice(0, 3).map((kw) => (
              <Badge
                key={kw}
                variant="outline"
                className="text-[10px] px-1 py-0 font-normal"
              >
                {kw}
              </Badge>
            ))}
            {vertical.keywords.length > 3 && (
              <span className="text-[10px] text-muted-foreground">
                +{vertical.keywords.length - 3}
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
