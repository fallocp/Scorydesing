/**
 * CalendarWeekFiller — View for filling a specific week with suggestions.
 *
 * Shows each day with: date, funnel stage, suggested branch × angle.
 * Buttons: "Aceptar sugerencia", "Cambiar combinación", "Asignar de biblioteca".
 * "Generar todo de una vez" button at the bottom.
 *
 * Requirements: 9.5, 9.6
 */

import { Check, Shuffle, Library, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import type { FunnelStage } from '@/types/pipeline';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface SlotSuggestion {
  date: string;
  funnelStage: FunnelStage;
  suggestedBranch: { id: string; name: string } | null;
  suggestedAngle: { id: string; name: string } | null;
  availablePiecesCount: number;
}

interface CalendarWeekFillerProps {
  weekSlots: SlotSuggestion[];
  onAcceptSuggestion?: (date: string) => void;
  onChangeCombination?: (date: string) => void;
  onAssignFromLibrary?: (date: string) => void;
  onGenerateAll?: () => void;
  isGenerating?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

const FUNNEL_CONFIG: Record<string, { label: string; className: string }> = {
  atraccion: { label: 'Atracción', className: 'bg-green-100 text-green-800' },
  conexion: { label: 'Conexión', className: 'bg-blue-100 text-blue-800' },
  conversion: { label: 'Conversión', className: 'bg-red-100 text-red-800' },
};

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

function formatSlotDate(dateStr: string): string {
  try {
    const date = new Date(dateStr + 'T12:00:00');
    const dayName = DAY_NAMES[date.getDay()];
    return `${dayName} ${date.getDate()}`;
  } catch {
    return dateStr;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export function CalendarWeekFiller({
  weekSlots,
  onAcceptSuggestion,
  onChangeCombination,
  onAssignFromLibrary,
  onGenerateAll,
  isGenerating,
}: CalendarWeekFillerProps) {
  if (weekSlots.length === 0) {
    return (
      <div className="py-8 text-center text-muted-foreground text-sm">
        No hay slots vacíos en esta semana
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-semibold text-foreground">
        Llenar semana ({weekSlots.length} slots)
      </h3>

      <div className="space-y-3">
        {weekSlots.map((slot) => {
          const funnelCfg = FUNNEL_CONFIG[slot.funnelStage];

          return (
            <Card key={slot.date}>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                  {/* Date + funnel */}
                  <div className="flex items-center gap-2 min-w-[120px]">
                    <span className="text-sm font-medium">
                      {formatSlotDate(slot.date)}
                    </span>
                    {funnelCfg && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] px-1.5 py-0 ${funnelCfg.className}`}
                      >
                        {funnelCfg.label}
                      </Badge>
                    )}
                  </div>

                  {/* Suggestion */}
                  <div className="flex-1 text-sm text-muted-foreground">
                    {slot.suggestedBranch && slot.suggestedAngle ? (
                      <span>
                        <span className="font-medium text-foreground">
                          {slot.suggestedBranch.name}
                        </span>
                        {' × '}
                        <span className="font-medium text-foreground">
                          {slot.suggestedAngle.name}
                        </span>
                      </span>
                    ) : (
                      <span className="italic">Sin sugerencia disponible</span>
                    )}
                    {slot.availablePiecesCount > 0 && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({slot.availablePiecesCount} piezas disponibles)
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => onAcceptSuggestion?.(slot.date)}
                      disabled={!slot.suggestedBranch}
                    >
                      <Check className="h-3 w-3 mr-1" />
                      Aceptar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => onChangeCombination?.(slot.date)}
                    >
                      <Shuffle className="h-3 w-3 mr-1" />
                      Cambiar
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => onAssignFromLibrary?.(slot.date)}
                      disabled={slot.availablePiecesCount === 0}
                    >
                      <Library className="h-3 w-3 mr-1" />
                      Biblioteca
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Generate all button */}
      <Button
        className="w-full bg-[#FF7A4A] hover:bg-[#E85A2C] text-white"
        onClick={onGenerateAll}
        disabled={isGenerating}
      >
        <Sparkles className="h-4 w-4 mr-2" />
        {isGenerating ? 'Generando…' : 'Generar todo de una vez'}
      </Button>
    </div>
  );
}
