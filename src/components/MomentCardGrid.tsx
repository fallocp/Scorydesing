/**
 * MomentCardGrid — Grid of MarketMoment cards for the Market Updates category.
 *
 * Each card shows the moment name, trigger type, and description.
 * Clicking a card opens the combinable generator panel with the moment pre-selected.
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMarketMoments } from '@/hooks/useMarketMoments';
import type { MarketMoment } from '@/types/xendingDesign';

interface MomentCardGridProps {
  categoryId: string | null;
  selectedMomentId?: string | null;
  onMomentSelect: (moment: MarketMoment) => void;
}

export function MomentCardGrid({
  categoryId,
  selectedMomentId,
  onMomentSelect,
}: MomentCardGridProps) {
  const { data: moments, isLoading, isError } = useMarketMoments(categoryId);

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-3 p-4 border rounded-lg">
            <Skeleton className="h-5 w-3/4" />
            <Skeleton className="h-4 w-full" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive">
        Error al cargar momentos de mercado. Intenta recargar la página.
      </p>
    );
  }

  if (!moments || moments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay momentos de mercado configurados en esta categoría.
      </p>
    );
  }

  const TRIGGER_COLORS: Record<string, string> = {
    fed: 'bg-blue-100 text-blue-800',
    banxico: 'bg-green-100 text-green-800',
    usdmxn: 'bg-amber-100 text-amber-800',
    inflacion: 'bg-red-100 text-red-800',
    tasas: 'bg-purple-100 text-purple-800',
    volatilidad: 'bg-orange-100 text-orange-800',
    temporada_critica: 'bg-pink-100 text-pink-800',
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {moments.map((moment) => {
        const isSelected = selectedMomentId === moment.id;
        const triggerColor = TRIGGER_COLORS[moment.trigger_type] ?? 'bg-gray-100 text-gray-800';
        return (
          <Card
            key={moment.id}
            role="button"
            tabIndex={0}
            className={cn(
              'cursor-pointer transition-all hover:shadow-md',
              isSelected
                ? 'border-2 border-[#2ED4C7] ring-2 ring-[#2ED4C7]/20'
                : 'border border-border hover:border-muted-foreground/30',
            )}
            onClick={() => onMomentSelect(moment)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onMomentSelect(moment);
              }
            }}
          >
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-foreground">{moment.name}</h4>
                <Badge className={cn('text-xs', triggerColor)}>
                  {moment.trigger_type}
                </Badge>
              </div>
              {moment.description && (
                <p className="text-sm text-muted-foreground line-clamp-3">
                  {moment.description}
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
