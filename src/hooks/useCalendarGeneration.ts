/**
 * Hook that generates a quarterly calendar with empty slots.
 * Implements the 3-2-2 weekly distribution (3 atraccion, 2 conexion, 2 conversion)
 * and creates one slot per channel (linkedin, instagram, facebook) per day.
 *
 * Requirements: 9.1, 9.2, 9.3, 9.4
 */

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { FunnelStage, Channel } from '@/types/pipeline';

// Weekly distribution: 3 atraccion, 2 conexion, 2 conversion
const WEEKLY_PATTERN: FunnelStage[] = [
  'atraccion',   // Monday
  'conexion',    // Tuesday
  'atraccion',   // Wednesday
  'conexion',    // Thursday
  'conversion',  // Friday
  'atraccion',   // Saturday
  'conversion',  // Sunday
];

const CHANNELS: Channel[] = ['linkedin', 'instagram', 'facebook'];

function getQuarterLabel(startDate: Date): string {
  const year = startDate.getFullYear();
  const quarter = Math.ceil((startDate.getMonth() + 1) / 3);
  return `${year}-Q${quarter}`;
}

function generateSlots(startDate: Date, months: number, businessId: string) {
  const slots: Array<{
    business_id: string;
    quarter: string;
    scheduled_date: string;
    channel: Channel;
    funnel_stage: FunnelStage;
    status: 'empty';
  }> = [];

  const quarter = getQuarterLabel(startDate);
  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + months);

  const current = new Date(startDate);
  while (current < endDate) {
    const dayOfWeek = current.getDay(); // 0=Sun, 1=Mon, ...
    // Map to our pattern index (Mon=0, Tue=1, ..., Sun=6)
    const patternIndex = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const funnelStage = WEEKLY_PATTERN[patternIndex];
    const dateStr = current.toISOString().split('T')[0];

    // Create one slot per channel
    for (const channel of CHANNELS) {
      slots.push({
        business_id: businessId,
        quarter,
        scheduled_date: dateStr,
        channel,
        funnel_stage: funnelStage,
        status: 'empty',
      });
    }

    current.setDate(current.getDate() + 1);
  }

  return slots;
}

export function useCalendarGeneration() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ businessId, startDate, months }: {
      businessId: string;
      startDate: Date;
      months: number;
    }) => {
      const slots = generateSlots(startDate, months, businessId);

      // Insert in batches of 100
      const batchSize = 100;
      for (let i = 0; i < slots.length; i += batchSize) {
        const batch = slots.slice(i, i + batchSize);
        const { error } = await supabase
          .from('content_calendar' as any)
          .insert(batch);
        if (error) throw error;
      }

      return { totalSlots: slots.length, quarter: getQuarterLabel(startDate) };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-calendar'] });
    },
  });
}
