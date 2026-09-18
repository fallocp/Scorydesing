import { useQuery } from '@tanstack/react-query';
import type { BusinessTenant } from '@/types/xendingDesign';

/** Uses the same isolated SQL tenant that the onboarding transaction updates. */
export function useBusinessTenants() {
  return useQuery<BusinessTenant[]>({ queryKey: ['business-tenants'], retry: false, queryFn: async () => {
    const response = await fetch('/__desaing-onboarding-tenant', { headers: { authorization: 'Bearer local-design-session' } });
    if (!response.ok) throw new Error('local_tenant_unavailable');
    return response.json();
  } });
}
