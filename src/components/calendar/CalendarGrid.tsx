/**
 * CalendarGrid — Monthly grid with 7 columns (Lun-Dom).
 *
 * Each cell shows date number, funnel stage badge, and slot status icon.
 *
 * Requirements: 9.1, 9.4
 */

import { useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface CalendarSlot {
  id: string;
  scheduled_date: string;
  funnel_stage: string;
  status: string;
  channel: string;
  piece_id?: string | null;
}

interface CalendarGridProps {
  slots: CalendarSlot[];
  month: number; // 1-12
  year: number;
  onSlotClick?: (date: string) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const FUNNEL_BADGE_CONFIG: Record<string, { label: string; className: string }> = {
  atraccion: { label: 'ATR', className: 'bg-green-100 text-green-800' },
  conexion: { label: 'CON', className: 'bg-blue-100 text-blue-800' },
  conversion: { label: 'CVR', className: 'bg-red-100 text-red-800' },
};

function getStatusIcon(status: string): string {
  switch (status) {
    case 'rendered':
    case 'published':
    case 'ready':
      return '✅';
    case 'assigned':
      return '📝';
    case 'empty':
    default:
      return '⬜';
  }
}

/** Group slots by date, picking the primary funnel_stage and worst status */
function groupSlotsByDate(slots: CalendarSlot[]) {
  const map = new Map<string, { funnelStage: string; status: string; count: number }>();
  for (const slot of slots) {
    const existing = map.get(slot.scheduled_date);
    if (!existing) {
      map.set(slot.scheduled_date, {
        funnelStage: slot.funnel_stage,
        status: slot.status,
        count: 1,
      });
    } else {
      existing.count += 1;
      // Use worst status (empty < assigned < ready < rendered < published)
      if (slot.status === 'empty') existing.status = 'empty';
    }
  }
  return map;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CalendarGrid({ slots, month, year, onSlotClick }: CalendarGridProps) {
  const { weeks, slotMap } = useMemo(() => {
    const slotMap = groupSlotsByDate(slots);

    // Build weeks array for the month
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const daysInMonth = lastDay.getDate();

    // Monday = 0, Sunday = 6 (ISO week)
    let startDow = firstDay.getDay() - 1;
    if (startDow < 0) startDow = 6;

    const weeks: (number | null)[][] = [];
    let currentWeek: (number | null)[] = [];

    // Pad start of first week
    for (let i = 0; i < startDow; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= daysInMonth; day++) {
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    // Pad end of last week
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      weeks.push(currentWeek);
    }

    return { weeks, slotMap };
  }, [slots, month, year]);

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 bg-muted/50">
        {DAY_LABELS.map((label) => (
          <div
            key={label}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground border-b"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Weeks */}
      {weeks.map((week, weekIdx) => (
        <div key={weekIdx} className="grid grid-cols-7">
          {week.map((day, dayIdx) => {
            if (day === null) {
              return (
                <div
                  key={`empty-${dayIdx}`}
                  className="min-h-[80px] border-b border-r last:border-r-0 bg-muted/20"
                />
              );
            }

            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const slotInfo = slotMap.get(dateStr);
            const funnelCfg = slotInfo
              ? FUNNEL_BADGE_CONFIG[slotInfo.funnelStage]
              : null;
            const statusIcon = slotInfo ? getStatusIcon(slotInfo.status) : '';
            const isToday =
              new Date().toISOString().split('T')[0] === dateStr;

            return (
              <div
                key={day}
                className={cn(
                  'min-h-[80px] border-b border-r last:border-r-0 p-1.5 cursor-pointer hover:bg-muted/30 transition-colors',
                  isToday && 'bg-accent/10',
                )}
                onClick={() => onSlotClick?.(dateStr)}
                role="button"
                tabIndex={0}
                aria-label={`${day} de ${month}/${year}`}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onSlotClick?.(dateStr);
                }}
              >
                <div className="flex items-start justify-between">
                  <span
                    className={cn(
                      'text-xs font-medium',
                      isToday && 'text-[#FF7A4A] font-bold',
                    )}
                  >
                    {day}
                  </span>
                  {statusIcon && <span className="text-xs">{statusIcon}</span>}
                </div>
                {funnelCfg && (
                  <Badge
                    variant="secondary"
                    className={`text-[9px] px-1 py-0 mt-1 ${funnelCfg.className}`}
                  >
                    {funnelCfg.label}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
