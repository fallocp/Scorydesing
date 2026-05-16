/**
 * AngleSelector — Chips for narrative angle selection.
 *
 * Loads angles from the universal `narrative_angles` table (not per-business).
 * Groups them by funnel stage: Atracción | Conexión | Conversión.
 * Returns the full angle data (slug, funnelStage, promptInstruction) on selection.
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

interface NarrativeAngleItem {
  id: string;
  name: string;
  slug: string;
  funnel_stage: 'atraccion' | 'conexion' | 'conversion';
  description: string | null;
  prompt_instruction: string;
  display_order: number;
}

export interface SelectedAngle {
  id: string;
  slug: string;
  name: string;
  funnelStage: string;
  promptInstruction: string;
}

function useNarrativeAngles() {
  return useQuery({
    queryKey: ['narrative-angles'],
    queryFn: async (): Promise<NarrativeAngleItem[]> => {
      const { data, error } = await supabase
        .from('narrative_angles')
        .select('id, name, slug, funnel_stage, description, prompt_instruction, display_order')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as NarrativeAngleItem[];
    },
    staleTime: 10 * 60 * 1000,
  });
}

const FUNNEL_LABELS: Record<string, { label: string; color: string }> = {
  atraccion: { label: 'Atracción', color: 'text-blue-600' },
  conexion: { label: 'Conexión', color: 'text-amber-600' },
  conversion: { label: 'Conversión', color: 'text-green-600' },
};

interface AngleSelectorProps {
  /** Currently selected angle slug */
  value: string | null;
  /** Called when an angle is selected or deselected — returns full angle data */
  onChange: (angle: SelectedAngle | null) => void;
}

export function AngleSelector({ value, onChange }: AngleSelectorProps) {
  const { data: angles, isLoading } = useNarrativeAngles();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-32 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!angles || angles.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay ángulos narrativos configurados.
      </p>
    );
  }

  // Group by funnel stage
  const grouped = angles.reduce<Record<string, NarrativeAngleItem[]>>((acc, a) => {
    const stage = a.funnel_stage;
    if (!acc[stage]) acc[stage] = [];
    acc[stage].push(a);
    return acc;
  }, {});

  const stages = ['atraccion', 'conexion', 'conversion'] as const;

  return (
    <div className="space-y-3">
      <label className="text-sm font-semibold text-foreground">
        Ángulo narrativo <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
      </label>
      {stages.map((stage) => {
        const stageAngles = grouped[stage];
        if (!stageAngles || stageAngles.length === 0) return null;
        const { label, color } = FUNNEL_LABELS[stage];

        return (
          <div key={stage} className="space-y-1.5">
            <span className={cn('text-[11px] font-medium uppercase tracking-wide', color)}>
              {label}
            </span>
            <div className="flex flex-wrap gap-2" role="listbox" aria-label={`Ángulos de ${label}`}>
              {stageAngles.map((a) => {
                const isSelected = value === a.slug;
                return (
                  <Badge
                    key={a.id}
                    role="option"
                    aria-selected={isSelected}
                    tabIndex={0}
                    title={a.description ?? a.name}
                    variant={isSelected ? 'default' : 'outline'}
                    className={cn(
                      'cursor-pointer px-3 py-1.5 text-xs transition-all select-none',
                      isSelected
                        ? 'bg-[#FF7A4A] text-white border-[#FF7A4A] hover:bg-[#FF7A4A]/90'
                        : 'hover:bg-muted',
                    )}
                    onClick={() =>
                      onChange(
                        isSelected
                          ? null
                          : {
                              id: a.id,
                              slug: a.slug,
                              name: a.name,
                              funnelStage: a.funnel_stage,
                              promptInstruction: a.prompt_instruction,
                            },
                      )
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onChange(
                          isSelected
                            ? null
                            : {
                                id: a.id,
                                slug: a.slug,
                                name: a.name,
                                funnelStage: a.funnel_stage,
                                promptInstruction: a.prompt_instruction,
                              },
                        );
                      }
                    }}
                  >
                    {a.name}
                  </Badge>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
