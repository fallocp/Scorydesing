/**
 * React Query hook for fetching market moments by category_id,
 * scoped by the active business_id.
 *
 * Requirements: 5.1, 16.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { MarketMoment } from '@/types/xendingDesign';

async function fetchMoments(
  businessId: string,
  categoryId: string,
): Promise<MarketMoment[]> {
  const { data, error } = await supabase
    .from('market_moments')
    .select('*')
    .eq('business_id', businessId)
    .eq('category_id', categoryId)
    .order('name', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as MarketMoment[];
}

export function useMarketMoments(categoryId: string | null) {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['market-moments', activeBusinessId, categoryId],
    queryFn: () => fetchMoments(activeBusinessId!, categoryId!),
    enabled: !!activeBusinessId && !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}
