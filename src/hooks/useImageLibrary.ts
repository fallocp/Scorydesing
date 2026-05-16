/**
 * React Query hook for querying image_library filtered by angle_tag (commercial branch).
 * Supports filtering by business, angle tag, and image type.
 *
 * Requirements: 7.3
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useImageLibrary(filters?: {
  businessId?: string;
  commercialBranchId?: string;
  angleTag?: string;
  imageType?: string;
}) {
  return useQuery({
    queryKey: ['image-library', filters],
    queryFn: async () => {
      let query = supabase
        .from('image_library' as any)
        .select('*')
        .order('created_at', { ascending: false });

      if (filters?.businessId) query = query.eq('business_id', filters.businessId);
      if (filters?.commercialBranchId) query = query.eq('commercial_branch_id', filters.commercialBranchId);
      if (filters?.angleTag) query = query.eq('angle_tag', filters.angleTag);
      if (filters?.imageType) query = query.eq('image_type', filters.imageType);

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: !!filters?.businessId,
  });
}
