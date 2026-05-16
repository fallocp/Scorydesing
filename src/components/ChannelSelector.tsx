/**
 * ChannelSelector — Dropdown/chips for channel selection.
 *
 * Loads channels from the DB per business. Supports both dropdown and
 * chip-toggle modes.
 *
 * Requirements: 7.6, 7.7
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';

interface ChannelItem {
  id: string;
  name: string;
  slug: string;
  is_active: boolean;
}

function useBusinessChannels() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['business-channels', activeBusinessId],
    queryFn: async (): Promise<ChannelItem[]> => {
      const { data, error } = await supabase
        .from('business_channels')
        .select('id, name, slug, is_active')
        .eq('business_id', activeBusinessId!)
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw new Error(error.message);
      return (data ?? []) as ChannelItem[];
    },
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}

interface ChannelSelectorProps {
  /** Currently selected channel slug */
  value: string | null;
  /** Called when a channel is selected */
  onChange: (channel: string | null) => void;
}

export function ChannelSelector({ value, onChange }: ChannelSelectorProps) {
  const { data: channels, isLoading } = useBusinessChannels();

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

  if (!channels || channels.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay canales configurados.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-semibold text-foreground">
        Canal <span className="text-destructive">*</span>
      </label>
      <div className="flex flex-wrap gap-2" role="listbox" aria-label="Seleccionar canal">
        {channels.map((ch) => {
          const isSelected = value === ch.slug;
          return (
            <Badge
              key={ch.id}
              role="option"
              aria-selected={isSelected}
              tabIndex={0}
              variant={isSelected ? 'default' : 'outline'}
              className={cn(
                'cursor-pointer px-3 py-1.5 text-xs transition-all select-none',
                isSelected
                  ? 'bg-[#2ED4C7] text-white border-[#2ED4C7] hover:bg-[#2ED4C7]/90'
                  : 'hover:bg-muted',
              )}
              onClick={() => onChange(isSelected ? null : ch.slug)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onChange(isSelected ? null : ch.slug);
                }
              }}
            >
              {ch.name}
            </Badge>
          );
        })}
      </div>
    </div>
  );
}
