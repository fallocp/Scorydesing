/**
 * React Query hook for fetching commercial branches by category_id,
 * scoped by the active business_id. Branches are ordered by display_order ASC.
 *
 * Requirements: 2.4, 4.1, 16.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { CommercialBranch } from '@/types/xendingDesign';

async function fetchBranches(
  businessId: string,
  categoryId: string,
): Promise<CommercialBranch[]> {
  const { data, error } = await supabase
    .from('commercial_branches')
    .select('*')
    .eq('business_id', businessId)
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CommercialBranch[];
}

export function useCommercialBranches(categoryId: string | null) {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['commercial-branches', activeBusinessId, categoryId],
    queryFn: () => fetchBranches(activeBusinessId!, categoryId!),
    enabled: !!activeBusinessId && !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}
