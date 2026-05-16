/**
 * VerticalCardGrid — Grid of IndustryVertical cards for Produce/Agro and Industrias categories.
 *
 * Each card shows the vertical name, description, and keywords.
 * Clicking a card opens the combinable generator panel with the vertical pre-selected.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useIndustryVerticals } from '@/hooks/useIndustryVerticals';
import type { IndustryVertical } from '@/types/xendingDesign';

interface VerticalCardGridProps {
  categoryId: string | null;
  selectedVerticalId?: string | null;
  onVerticalSelect: (vertical: IndustryVertical) => void;
}

export function VerticalCardGrid({
  categoryId,
  selectedVerticalId,
  onVerticalSelect,
}: VerticalCardGridProps) {
  const { data: verticals, isLoading, isError } = useIndustryVerticals(categoryId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
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
      <p className="text-sm text-destructive">
        Error al cargar verticales. Intenta recargar la página.
      </p>
    );
  }

  if (!verticals || verticals.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay verticales configuradas en esta categoría.
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {verticals.map((vertical) => {
        const isSelected = selectedVerticalId === vertical.id;
        return (
          <Card
            key={vertical.id}
            role="button"
            tabIndex={0}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              isSelected
                ? 'border-2 border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                : 'border border-border hover:border-muted-foreground/30',
            )}
            onClick={() => onVerticalSelect(vertical)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onVerticalSelect(vertical);
              }
            }}
          >
            <CardContent className="p-5 space-y-3">
              <h4 className="font-semibold text-foreground">{vertical.name}</h4>
              {vertical.description && (
                <p className="text-sm text-muted-foreground line-clamp-2">
                  {vertical.description}
                </p>
              )}
              {vertical.keywords && vertical.keywords.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {vertical.keywords.slice(0, 4).map((kw) => (
                    <Badge key={kw} variant="secondary" className="text-xs">
                      {kw}
                    </Badge>
                  ))}
                  {vertical.keywords.length > 4 && (
                    <Badge variant="outline" className="text-xs">
                      +{vertical.keywords.length - 4}
                    </Badge>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
