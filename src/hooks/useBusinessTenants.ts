/**
 * React Query hook for fetching businesses the current user belongs to
 * via the user_business_memberships join table.
 *
 * Requirements: 13.5, 16.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { BusinessTenant } from '@/types/xendingDesign';

async function fetchBusinessTenants(): Promise<BusinessTenant[]> {
  // Get current user
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error(authError?.message ?? 'User not authenticated');
  }

  // Step 1: Fetch membership business_ids
  const { data: memberships, error: membershipError } = await supabase
    .from('user_business_memberships')
    .select('business_id')
    .eq('user_id', user.id);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const businessIds = (memberships ?? []).map((m) => m.business_id);

  if (businessIds.length === 0) {
    return [];
  }

  // Step 2: Fetch business tenants by IDs
  const { data: tenants, error: tenantError } = await supabase
    .from('business_tenants')
    .select('*')
    .in('id', businessIds)
    .eq('is_active', true);

  if (tenantError) {
    throw new Error(tenantError.message);
  }

  return (tenants ?? []) as BusinessTenant[];
}

export function useBusinessTenants() {
  return useQuery({
    queryKey: ['business-tenants'],
    queryFn: fetchBusinessTenants,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
