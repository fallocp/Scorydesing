/**
 * IndustrySelector — Chips for industry/vertical selection in Design Studio.
 *
 * Loads all active `industry_verticals` for the business and lets the user pick
 * one industry (per-industry relevance) or "Auto (variar)" to cycle industries
 * per generation for maximum variety. Optional (can be left unselected).
 */

import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useAllIndustryVerticals } from '@/hooks/useIndustryVerticals';
import type { IndustrySelection } from '@/types/design-studio';

interface IndustrySelectorProps {
  /** Selected vertical id, the sentinel 'auto', or null (none). */
  value: string | null;
  onChange: (industry: IndustrySelection) => void;
}

export function IndustrySelector({ value, onChange }: IndustrySelectorProps) {
  const { data: verticals, isLoading } = useAllIndustryVerticals();

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-4 w-24" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-28 rounded-full" />
          ))}
        </div>
      </div>
    );
  }

  if (!verticals || verticals.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay industrias configuradas.
      </p>
    );
  }

  const autoSelected = value === 'auto';

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground">
        Industria <span className="text-xs text-muted-foreground font-normal">(opcional)</span>
      </label>
      <div className="flex flex-wrap gap-2" role="listbox" aria-label="Industrias">
        {/* Auto: cycle industries for maximum variety */}
        <Badge
          role="option"
          aria-selected={autoSelected}
          tabIndex={0}
          title="Varía la industria en cada generación para máxima variedad"
          variant={autoSelected ? 'default' : 'outline'}
          className={cn(
            'cursor-pointer px-3 py-1.5 text-xs transition-all select-none',
            autoSelected
              ? 'bg-[#2ED4C7] text-[#0F1419] border-[#2ED4C7] hover:bg-[#2ED4C7]/90'
              : 'hover:bg-muted',
          )}
          onClick={() => onChange(autoSelected ? null : 'auto')}
        >
          ✨ Auto (variar)
        </Badge>

        {verticals.map((v) => {
          const isSelected = value === v.id;
          return (
            <Badge
              key={v.id}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              title={v.description ?? v.name}
              variant={isSelected ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer px-3 py-1.5 text-xs transition-all select-none',
                isSelected
                  ? 'bg-[#FF7A4A] text-white border-[#FF7A4A] hover:bg-[#FF7A4A]/90'
                  : 'hover:bg-muted',
              )}
              onClick={() => onChange(isSelected ? null : { id: v.id, name: v.name })}
            >
              {v.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
