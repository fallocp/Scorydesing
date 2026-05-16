/**
 * CalendarDashboard — Summary panel with progress bars per month.
 *
 * Shows: month name, progress bar (filled/total slots), percentage.
 * Total quarter progress and available pieces in library count.
 *
 * Requirements: 9.7
 */

import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MonthProgress {
  month: number; // 1-12
  year: number;
  totalSlots: number;
  filledSlots: number;
}

interface CalendarDashboardProps {
  monthsProgress: MonthProgress[];
  availablePiecesCount?: number;
  quarter?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CalendarDashboard({
  monthsProgress,
  availablePiecesCount = 0,
  quarter,
}: CalendarDashboardProps) {
  // Total quarter progress
  const totalSlots = monthsProgress.reduce((sum, m) => sum + m.totalSlots, 0);
  const totalFilled = monthsProgress.reduce((sum, m) => sum + m.filledSlots, 0);
  const totalPercent = totalSlots > 0 ? Math.round((totalFilled / totalSlots) * 100) : 0;

  return (
    <Card>
      <CardContent className="p-4 space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              Progreso trimestral
              {quarter && (
                <Badge variant="outline" className="ml-2 text-xs">
                  {quarter}
                </Badge>
              )}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {totalFilled} de {totalSlots} slots llenos ({totalPercent}%)
            </p>
          </div>
          {availablePiecesCount > 0 && (
            <Badge variant="secondary" className="text-xs bg-yellow-50 text-yellow-700">
              {availablePiecesCount} piezas disponibles
            </Badge>
          )}
        </div>

        {/* Total progress */}
        <Progress value={totalPercent} className="h-2" />

        {/* Per-month breakdown */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {monthsProgress.map((mp) => {
            const percent = mp.totalSlots > 0
              ? Math.round((mp.filledSlots / mp.totalSlots) * 100)
              : 0;

            return (
              <div key={`${mp.year}-${mp.month}`} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-foreground">
                    {MONTH_NAMES[mp.month]}
                  </span>
                  <span className="text-muted-foreground">
                    {mp.filledSlots}/{mp.totalSlots} ({percent}%)
                  </span>
                </div>
                <Progress value={percent} className="h-1.5" />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
