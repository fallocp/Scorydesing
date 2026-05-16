/**
 * React Query hooks for loading and updating content calendar slots.
 * Supports filtering by business, quarter, month/year.
 *
 * Requirements: 9.1, 9.2, 9.3
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useContentCalendar(filters?: {
  businessId?: string;
  quarter?: string;
  month?: number;
  year?: number;
}) {
  return useQuery({
    queryKey: ['content-calendar', filters],
    queryFn: async () => {
      let query = supabase
        .from('content_calendar' as any)
        .select('*, content_library(*)')
        .order('scheduled_date', { ascending: true });

      if (filters?.businessId) query = query.eq('business_id', filters.businessId);
      if (filters?.quarter) query = query.eq('quarter', filters.quarter);

      // Filter by month/year if provided
      if (filters?.year && filters?.month) {
        const startDate = `${filters.year}-${String(filters.month).padStart(2, '0')}-01`;
        const endDate = new Date(filters.year, filters.month, 0).toISOString().split('T')[0];
        query = query.gte('scheduled_date', startDate).lte('scheduled_date', endDate);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!filters?.businessId,
  });
}

// Mutation to assign a piece to a calendar slot
export function useAssignPieceToSlot() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ slotId, pieceId }: { slotId: string; pieceId: string }) => {
      const { data, error } = await supabase
        .from('content_calendar' as any)
        .update({ piece_id: pieceId, status: 'assigned' })
        .eq('id', slotId)
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['content-calendar'] });
    },
  });
}
