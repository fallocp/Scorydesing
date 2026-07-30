/**
 * React Query hook for fetching industry verticals by category_id,
 * scoped by the active business_id. Verticals are ordered by display_order ASC.
 *
 * Requirements: 4.1, 5.1, 16.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { IndustryVertical } from '@/types/xendingDesign';

async function fetchVerticals(
  businessId: string,
  categoryId: string,
): Promise<IndustryVertical[]> {
  const { data, error } = await supabase
    .from('industry_verticals')
    .select('*')
    .eq('business_id', businessId)
    .eq('category_id', categoryId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as IndustryVertical[];
}

export function useIndustryVerticals(categoryId: string | null) {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['industry-verticals', activeBusinessId, categoryId],
    queryFn: () => fetchVerticals(activeBusinessId!, categoryId!),
    enabled: !!activeBusinessId && !!categoryId,
    staleTime: 5 * 60 * 1000,
  });
}

/** Fetch ALL active verticals for the business (across categories). */
async function fetchAllVerticals(businessId: string): Promise<IndustryVertical[]> {
  const { data, error } = await supabase
    .from('industry_verticals')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as IndustryVertical[];
}

/** All active industry verticals for the active business (any category). */
export function useAllIndustryVerticals() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['industry-verticals-all', activeBusinessId],
    queryFn: () => fetchAllVerticals(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}
