/**
 * React Query hook for fetching campaign categories scoped by the active
 * business_id. Categories are ordered by display_order ASC.
 *
 * Requirements: 1.2, 2.4, 13.5, 16.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { CampaignCategory } from '@/types/xendingDesign';

async function fetchCategories(businessId: string): Promise<CampaignCategory[]> {
  const { data, error } = await supabase
    .from('campaign_categories')
    .select('*')
    .eq('business_id', businessId)
    .eq('is_active', true)
    .order('display_order', { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  return (data ?? []) as CampaignCategory[];
}

export function useCampaignCategories() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['campaign-categories', activeBusinessId],
    queryFn: () => fetchCategories(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}
