/**
 * React Query hook for querying content_library with filters.
 * Supports filtering by business, branch, narrative angle, funnel stage, and status.
 *
 * Requirements: 8.7
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useContentLibrary(filters?: {
  businessId?: string;
  branchId?: string;
  narrativeAngleId?: string;
  funnelStage?: string;
  status?: string;
}) {
  return useQuery({
    queryKey: ['content-library', filters],
    queryFn: async () => {
      let query = supabase
        .from('content_library' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.businessId) query = query.eq('business_id', filters.businessId);
      if (filters?.branchId) query = query.eq('commercial_branch_id', filters.branchId);
      if (filters?.narrativeAngleId) query = query.eq('narrative_angle_id', filters.narrativeAngleId);
      if (filters?.funnelStage) query = query.eq('funnel_stage', filters.funnelStage);
      if (filters?.status) query = query.eq('status', filters.status);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!filters?.businessId,
  });
}
