/**
 * WeeklySummaryWidget — Shows the current week's calendar status in the Hub.
 *
 * Displays: week date range, slots filled vs empty (Mon-Sun with icons),
 * and a "Llenar semana" button that navigates to the calendar.
 *
 * Requirements: 9.7
 */

import { useNavigate } from 'react-router-dom';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useDesignStore } from '@/store/designStore';
import { useContentCalendar } from '@/hooks/useContentCalendar';

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function getWeekRange(): { start: Date; end: Date; month: number; year: number } {
  const now = new Date();
  const dow = now.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(now);
  monday.setDate(now.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return {
    start: monday,
    end: sunday,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
  };
}

function formatDateShort(date: Date): string {
  return `${date.getDate()} ${date.toLocaleDateString('es-MX', { month: 'short' })}`;
}

export function WeeklySummaryWidget() {
  const navigate = useNavigate();
  const activeBusiness = useDesignStore((s) => s.activeBusiness);
  const week = getWeekRange();

  const { data: slots } = useContentCalendar({
    businessId: activeBusiness?.id,
    month: week.month,
    year: week.year,
  });

  // Build week days status
  const weekDays = DAY_LABELS.map((label, idx) => {
    const date = new Date(week.start);
    date.setDate(week.start.getDate() + idx);
    const dateStr = date.toISOString().split('T')[0];

    const daySlots = (slots as any[] | undefined)?.filter(
      (s: any) => s.scheduled_date === dateStr
    ) ?? [];

    const hasContent = daySlots.some((s: any) => s.status !== 'empty');

    return { label, dateStr, hasContent };
  });

  const filledCount = weekDays.filter((d) => d.hasContent).length;

  if (!activeBusiness) return null;

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              Semana {formatDateShort(week.start)} – {formatDateShort(week.end)}
            </span>
          </div>
          <Badge variant="outline" className="text-xs">
            {filledCount}/7 slots
          </Badge>
        </div>

        <div className="flex items-center gap-1 mb-3">
          {weekDays.map((day) => (
            <div
              key={day.dateStr}
              className="flex-1 flex flex-col items-center gap-1"
            >
              <span className="text-[10px] text-muted-foreground">{day.label}</span>
              <span className="text-sm">{day.hasContent ? '✅' : '⬜'}</span>
            </div>
          ))}
        </div>

        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => navigate('/content-calendar')}
        >
          Llenar semana
          <ChevronRight className="h-3.5 w-3.5 ml-1" />
        </Button>
      </CardContent>
    </Card>
  );
}
