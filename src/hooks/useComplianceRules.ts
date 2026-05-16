/**
 * React Query hook for fetching the active business's compliance_rules
 * from the business_tenants table.
 *
 * Requirements: 3.4, 6.5, 16.2
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { ComplianceRules } from '@/types/xendingDesign';

/** Default empty compliance rules when none are configured */
const EMPTY_COMPLIANCE: ComplianceRules = {
  forbidden_terms: [],
  required_qualifiers: [],
  max_values: {},
};

async function fetchComplianceRules(
  businessId: string,
): Promise<ComplianceRules> {
  const { data, error } = await supabase
    .from('business_tenants')
    .select('compliance_rules')
    .eq('id', businessId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const raw = data?.compliance_rules as ComplianceRules | null;
  if (!raw) return EMPTY_COMPLIANCE;

  return {
    forbidden_terms: raw.forbidden_terms ?? [],
    required_qualifiers: raw.required_qualifiers ?? [],
    max_values: raw.max_values ?? {},
  };
}

export function useComplianceRules() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['compliance-rules', activeBusinessId],
    queryFn: () => fetchComplianceRules(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}
