/**
 * Hook that returns brand configuration (rules, disclaimers, forbidden terms, approved claims)
 * for the currently selected brand in the design store.
 *
 * Updated to fetch from DB via useBusinessConfig when a business_id is active.
 * Falls back to the hardcoded getBrandConfig() when no business_id is set
 * (migration period).
 *
 * Requirements: 16.6
 */

import { useMemo } from 'react';
import { getBrandConfig } from '@/utils/xendingDesign/brandConfig';
import { useDesignStore } from '@/store/designStore';
import { useBusinessConfig } from './useBusinessConfig';
import { useActiveBusiness } from './useActiveBusiness';
import type { BrandConfig, Brand } from '@/types/xendingDesign';

/**
 * Returns the BrandConfig for the currently selected brand.
 *
 * When an active business is set, derives the config from the DB-driven
 * useBusinessConfig hook. Otherwise falls back to the hardcoded
 * getBrandConfig() utility for backward compatibility during migration.
 *
 * Optionally accepts a brand override to force the hardcoded config path.
 */
export function useBrandConfig(brandOverride?: Brand): BrandConfig | null {
  const selectedBrand = useDesignStore((s) => s.selectedBrand);
  const brand = brandOverride ?? selectedBrand;
  const { activeBusinessId } = useActiveBusiness();
  const { data: businessConfig } = useBusinessConfig();

  return useMemo(() => {
    // DB-driven path: active business with loaded config
    if (activeBusinessId && businessConfig && !brandOverride) {
      const rules = businessConfig.compliance_rules;
      return {
        brand: (businessConfig.slug as Brand) ?? brand ?? 'xending',
        displayName: businessConfig.name,
        disclaimer: businessConfig.disclaimer ?? '',
        shortDisclaimer: businessConfig.short_disclaimer ?? '',
        approvedClaims: [], // Claims live in strategic_config per branch
        forbiddenTerms: rules?.forbidden_terms ?? [],
        approvedNumbers: rules?.max_values ?? {},
      };
    }

    // Hardcoded fallback: no active business or explicit brand override
    if (!brand) return null;
    return getBrandConfig(brand);
  }, [brand, activeBusinessId, businessConfig, brandOverride]);
}
