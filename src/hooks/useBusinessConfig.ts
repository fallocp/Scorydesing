/**
 * React Query hook for fetching the active business's full configuration:
 * brand identity (name, logo, colors, fonts), disclaimer, and compliance rules.
 *
 * Replaces the hardcoded `getBrandConfig()` utility for DB-driven businesses.
 *
 * Requirements: 16.2, 16.6
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useActiveBusiness } from './useActiveBusiness';
import type { BusinessTenant } from '@/types/xendingDesign';

/**
 * Subset of BusinessTenant fields relevant to brand identity and config.
 */
export interface BusinessConfig {
  id: string;
  name: string;
  slug: string;
  industry: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  fonts: { display: string; body: string; mono: string } | null;
  disclaimer: string | null;
  short_disclaimer: string | null;
  compliance_rules: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  } | null;
}

async function fetchBusinessConfig(
  businessId: string,
): Promise<BusinessConfig> {
  const { data, error } = await supabase
    .from('business_tenants')
    .select(
      'id, name, slug, industry, logo_url, primary_color, secondary_color, accent_color, fonts, disclaimer, short_disclaimer, compliance_rules',
    )
    .eq('id', businessId)
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const tenant = data as BusinessTenant;

  return {
    id: tenant.id!,
    name: tenant.name,
    slug: tenant.slug,
    industry: (tenant as any).industry ?? null,
    logo_url: (tenant as any).logo_url ?? null,
    primary_color: (tenant as any).primary_color ?? null,
    secondary_color: (tenant as any).secondary_color ?? null,
    accent_color: (tenant as any).accent_color ?? null,
    fonts: (tenant as any).fonts ?? null,
    disclaimer: (tenant as any).disclaimer ?? null,
    short_disclaimer: (tenant as any).short_disclaimer ?? null,
    compliance_rules: (tenant as any).compliance_rules ?? null,
  };
}

export function useBusinessConfig() {
  const { activeBusinessId } = useActiveBusiness();

  return useQuery({
    queryKey: ['business-config', activeBusinessId],
    queryFn: () => fetchBusinessConfig(activeBusinessId!),
    enabled: !!activeBusinessId,
    staleTime: 5 * 60 * 1000,
  });
}
