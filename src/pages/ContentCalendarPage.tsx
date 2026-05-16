/**
 * ContentCalendarPage — Page that combines dashboard + grid + week filler.
 *
 * Uses useContentCalendar, useCalendarGeneration, useContentLibrary.
 * Uses useDesignStore for activeBusiness.
 * Header with back button, month navigation (◀ ▶).
 * "Crear calendario trimestral" button (calls useCalendarGeneration).
 *
 * Requirements: 9.1, 9.4, 9.5, 9.6, 9.7
 */

import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, CalendarDays, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useDesignStore } from '@/store/designStore';
import { useContentCalendar } from '@/hooks/useContentCalendar';
import { useCalendarGeneration } from '@/hooks/useCalendarGeneration';
import { useContentLibrary } from '@/hooks/useContentLibrary';
import { CalendarGrid } from '@/components/calendar/CalendarGrid';
import { CalendarWeekFiller } from '@/components/calendar/CalendarWeekFiller';
import { CalendarDashboard } from '@/components/calendar/CalendarDashboard';
import type { FunnelStage } from '@/types/pipeline';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  '', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function getQuarterMonths(year: number, quarter: number): Array<{ month: number; year: number }> {
  const startMonth = (quarter - 1) * 3 + 1;
  return [
    { month: startMonth, year },
    { month: startMonth + 1, year },
    { month: startMonth + 2, year },
  ];
}

function getCurrentQuarter(): { year: number; quarter: number } {
  const now = new Date();
  return {
    year: now.getFullYear(),
    quarter: Math.ceil((now.getMonth() + 1) / 3),
  };
}

/** Get the week (Mon-Sun) that contains the given date */
function getWeekDates(dateStr: string): string[] {
  const date = new Date(dateStr + 'T12:00:00');
  const dow = date.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(date);
  monday.setDate(date.getDate() + mondayOffset);

  const dates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    dates.push(d.toISOString().split('T')[0]);
  }
  return dates;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

function ContentCalendarPage() {
  const navigate = useNavigate();
  const activeBusiness = useDesignStore((s) => s.activeBusiness);

  const { year: currentYear, quarter: currentQuarter } = getCurrentQuarter();
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedWeekDate, setSelectedWeekDate] = useState<string | null>(null);

  const quarterLabel = `${selectedYear}-Q${Math.ceil(selectedMonth / 3)}`;

  // Fetch calendar slots for the selected month
  const { data: slots, isLoading: slotsLoading } = useContentCalendar({
    businessId: activeBusiness?.id,
    month: selectedMonth,
    year: selectedYear,
  });

  // Fetch all quarter slots for dashboard
  const quarterNum = Math.ceil(selectedMonth / 3);
  const quarterMonths = getQuarterMonths(selectedYear, quarterNum);
  const { data: quarterSlots } = useContentCalendar({
    businessId: activeBusiness?.id,
    quarter: quarterLabel,
  });

  // Fetch content library for available pieces count
  const { data: libraryPieces } = useContentLibrary({
    businessId: activeBusiness?.id,
  });

  // Calendar generation mutation
  const calendarGeneration = useCalendarGeneration();

  // Month navigation
  const handlePrevMonth = () => {
    if (selectedMonth === 1) {
      setSelectedMonth(12);
      setSelectedYear((y) => y - 1);
    } else {
      setSelectedMonth((m) => m - 1);
    }
    setSelectedWeekDate(null);
  };

  const handleNextMonth = () => {
    if (selectedMonth === 12) {
      setSelectedMonth(1);
      setSelectedYear((y) => y + 1);
    } else {
      setSelectedMonth((m) => m + 1);
    }
    setSelectedWeekDate(null);
  };

  // Generate quarterly calendar
  const handleGenerateCalendar = () => {
    if (!activeBusiness?.id) return;
    const startMonth = (quarterNum - 1) * 3; // 0-indexed
    const startDate = new Date(selectedYear, startMonth, 1);
    calendarGeneration.mutate({
      businessId: activeBusiness.id,
      startDate,
      months: 3,
    });
  };

  // Dashboard progress data
  const monthsProgress = useMemo(() => {
    if (!quarterSlots) return quarterMonths.map((m) => ({ ...m, totalSlots: 0, filledSlots: 0 }));

    return quarterMonths.map((m) => {
      const monthSlots = (quarterSlots as any[]).filter((s: any) => {
        const d = new Date(s.scheduled_date + 'T12:00:00');
        return d.getMonth() + 1 === m.month && d.getFullYear() === m.year;
      });
      // Group by date to count unique days (each day has 3 channel slots)
      const byDate = new Map<string, any[]>();
      for (const s of monthSlots) {
        const existing = byDate.get(s.scheduled_date) ?? [];
        existing.push(s);
        byDate.set(s.scheduled_date, existing);
      }
      const totalSlots = byDate.size;
      const filledSlots = Array.from(byDate.values()).filter(
        (daySlots) => daySlots.some((s: any) => s.status !== 'empty')
      ).length;

      return { ...m, totalSlots, filledSlots };
    });
  }, [quarterSlots, quarterMonths]);

  // Available pieces count
  const availablePiecesCount = (libraryPieces as any[] | undefined)?.filter(
    (p: any) => p.status === 'rendered' || p.status === 'approved' || p.status === 'channels_adapted'
  ).length ?? 0;

  // Week filler data
  const weekSlots = useMemo(() => {
    if (!selectedWeekDate || !slots) return [];
    const weekDates = getWeekDates(selectedWeekDate);
    const slotsArr = slots as any[];

    return weekDates
      .map((date) => {
        const daySlots = slotsArr.filter(
          (s: any) => s.scheduled_date === date && s.status === 'empty'
        );
        if (daySlots.length === 0) return null;
        const first = daySlots[0];
        return {
          date,
          funnelStage: first.funnel_stage as FunnelStage,
          suggestedBranch: null,
          suggestedAngle: null,
          availablePiecesCount: 0,
        };
      })
      .filter(Boolean) as any[];
  }, [selectedWeekDate, slots]);

  const handleSlotClick = (date: string) => {
    setSelectedWeekDate(date);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate('/')}
          aria-label="Volver a Xending Design"
        >
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">Calendario de Contenido</h1>
          <p className="text-sm text-muted-foreground">
            Planifica y organiza la publicación de contenido
          </p>
        </div>

        {/* Generate calendar button */}
        {activeBusiness && (
          <Button
            variant="outline"
            onClick={handleGenerateCalendar}
            disabled={calendarGeneration.isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            {calendarGeneration.isPending
              ? 'Creando…'
              : 'Crear calendario trimestral'}
          </Button>
        )}
      </div>

      {!activeBusiness ? (
        <div className="text-center py-12 text-muted-foreground">
          <CalendarDays className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>Selecciona un negocio activo para ver el calendario</p>
        </div>
      ) : (
        <>
          {/* Dashboard */}
          <CalendarDashboard
            monthsProgress={monthsProgress}
            availablePiecesCount={availablePiecesCount}
            quarter={quarterLabel}
          />

          {/* Month navigation */}
          <div className="flex items-center justify-center gap-4">
            <Button variant="ghost" size="icon" onClick={handlePrevMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <h2 className="text-lg font-semibold text-foreground min-w-[160px] text-center">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </h2>
            <Button variant="ghost" size="icon" onClick={handleNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar grid */}
          {slotsLoading ? (
            <div className="py-12 text-center text-muted-foreground text-sm">
              Cargando calendario…
            </div>
          ) : (
            <CalendarGrid
              slots={(slots as any[]) ?? []}
              month={selectedMonth}
              year={selectedYear}
              onSlotClick={handleSlotClick}
            />
          )}

          {/* Week filler (shown when a date is selected) */}
          {selectedWeekDate && weekSlots.length > 0 && (
            <CalendarWeekFiller
              weekSlots={weekSlots}
              onAcceptSuggestion={(date) => {
                // Placeholder — will be connected in Phase 4
                console.log('Accept suggestion for', date);
              }}
              onChangeCombination={(date) => {
                console.log('Change combination for', date);
              }}
              onAssignFromLibrary={(date) => {
                navigate('/content-library');
              }}
              onGenerateAll={() => {
                console.log('Generate all for week');
              }}
            />
          )}
        </>
      )}
    </div>
  );
}

export default ContentCalendarPage;
