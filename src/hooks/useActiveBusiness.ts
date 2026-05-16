/**
 * Hook for managing the active business tenant context.
 *
 * Returns the active business_id from Zustand and provides setActiveBusiness()
 * which also updates Supabase session metadata via RPC so that RLS policies
 * can scope queries to the selected tenant.
 */

import { useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useDesignStore } from '@/store/designStore';
import type { BusinessTenant } from '@/types/xendingDesign';

export function useActiveBusiness() {
  const activeBusiness = useDesignStore((s) => s.activeBusiness);
  const storeSetActiveBusiness = useDesignStore((s) => s.setActiveBusiness);

  /**
   * Sets the active business in both Zustand store and Supabase session metadata.
   * The RPC call writes the business_id to auth.users.raw_app_meta_data,
   * making it available in RLS policies without per-query filtering.
   *
   * When called with null, clears the active business context.
   */
  const setActiveBusiness = useCallback(
    async (business: BusinessTenant | null) => {
      // Update Zustand store immediately for responsive UI
      storeSetActiveBusiness(business);

      // Update Supabase session metadata via RPC
      const businessId = business?.id ?? null;
      const { error } = await supabase.rpc('set_active_business', {
        business_id: businessId,
      });

      if (error) {
        console.error('Failed to set active business in session:', error.message);
        // Revert store on failure to keep UI and session in sync
        storeSetActiveBusiness(null);
        throw error;
      }
    },
    [storeSetActiveBusiness]
  );

  return {
    /** The currently active BusinessTenant, or null if none selected */
    activeBusiness,
    /** The active business_id shorthand, or null */
    activeBusinessId: activeBusiness?.id ?? null,
    /** Sets the active business in store + Supabase session */
    setActiveBusiness,
  };
}
