/**
 * MomentSelector — Card selector for MarketMoments.
 *
 * Shown in the "Market Updates" tab. Displays trigger_type badge and
 * active/inactive status. Visually distinguishes market moment content
 * from evergreen content.
 *
 * Requirements: 5.2, 5.6, 10.3
 */

import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useMarketMoments } from '@/hooks/useMarketMoments';
import type { MarketMoment } from '@/types/xendingDesign';

/** Friendly labels for trigger types */
const TRIGGER_LABELS: Record<string, string> = {
  fed: '🏛️ Fed',
  banxico: '🇲🇽 Banxico',
  usdmxn: '💱 USD/MXN',
  inflacion: '📈 Inflación',
  tasas: '📊 Tasas',
  volatilidad: '⚡ Volatilidad',
  temporada_critica: '📅 Temporada',
};

interface MomentSelectorProps {
  /** The category_id to load moments for */
  categoryId: string | null;
  /** Currently selected moment id */
  selectedMomentId?: string | null;
  /** Called when a moment is selected or deselected */
  onMomentChange: (moment: MarketMoment | null) => void;
}

export function MomentSelector({
  categoryId,
  selectedMomentId,
  onMomentChange,
}: MomentSelectorProps) {
  const { data: moments, isLoading, isError } = useMarketMoments(categoryId);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !moments || moments.length === 0) {
    return null; // Moments are optional — hide when none exist
  }

  const handleSelect = (moment: MarketMoment) => {
    if (selectedMomentId === moment.id) {
      onMomentChange(null); // Deselect
    } else {
      onMomentChange(moment);
    }
  };

  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-sm font-semibold text-foreground">
          Momento de Mercado
        </h3>
        <p className="text-xs text-muted-foreground">
          Selecciona un evento o coyuntura para contextualizar el contenido (opcional)
        </p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
        {moments.map((moment) => (
          <MomentCard
            key={moment.id}
            moment={moment}
            isSelected={selectedMomentId === moment.id}
            onSelect={() => handleSelect(moment)}
          />
        ))}
      </div>
    </div>
  );
}

function MomentCard({
  moment,
  isSelected,
  onSelect,
}: {
  moment: MarketMoment;
  isSelected: boolean;
  onSelect: () => void;
}) {
  const triggerLabel =
    TRIGGER_LABELS[moment.trigger_type] ?? moment.trigger_type;

  return (
    <Card
      role="option"
      aria-selected={isSelected}
      tabIndex={0}
      className={cn(
        'cursor-pointer transition-all hover:shadow-sm',
        isSelected
          ? 'border-2 border-amber-500 ring-1 ring-amber-500/20 bg-amber-50/50 dark:bg-amber-950/10'
          : 'border border-border hover:border-muted-foreground/30',
        !moment.is_active && 'opacity-50',
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
        <div className="flex items-center justify-between gap-1">
          <p className="text-sm font-medium text-foreground leading-tight">
            {moment.name}
          </p>
          {!moment.is_active && (
            <Badge
              variant="outline"
              className="text-[10px] px-1 py-0 text-muted-foreground"
            >
              Inactivo
            </Badge>
          )}
        </div>

        <Badge
          variant="secondary"
          className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-800"
        >
          {triggerLabel}
        </Badge>

        {moment.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">
            {moment.description}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
