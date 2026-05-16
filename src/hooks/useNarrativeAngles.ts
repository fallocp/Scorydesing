/**
 * React Query hook for fetching active narrative angles from Supabase.
 * Narrative angles are universal (no business_id) and ordered by display_order.
 *
 * Requirements: 1.1, 1.2, 16.4
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useNarrativeAngles() {
  return useQuery({
    queryKey: ['narrative-angles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('narrative_angles' as any)
        .select('*')
        .eq('is_active', true)
        .order('display_order', { ascending: true });

      if (error) throw error;

      // Map snake_case DB fields to camelCase for the NarrativeAngle interface
      return (data ?? []).map((row: any) => ({
        id: row.id,
        name: row.name,
        slug: row.slug,
        description: row.description,
        funnelStage: row.funnel_stage,
        promptInstruction: row.prompt_instruction,
        displayOrder: row.display_order,
        isActive: row.is_active,
      }));
    },
  });
}
