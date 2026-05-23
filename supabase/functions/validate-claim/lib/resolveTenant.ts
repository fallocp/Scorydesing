/**
 * Tenant Resolver — resolves business context and verifies user access.
 *
 * Logic:
 * 1. If `businessId` present → use directly to query `business_tenants`
 * 2. If only `brandSlug` → search `business_tenants` by `slug`
 * 3. Verify user has active membership via `user_business_memberships`
 * 4. Read `claim_validation_enabled` (default: false)
 * 5. Return 403 if no active membership
 *
 * Requirements: 3.1, 7.1, 7.2, 7.4, 10.1, 10.2, 10.3
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";
import type { TenantResolution } from "./types.ts";

// ---------------------------------------------------------------------------
// Default compliance rules when tenant has none configured
// ---------------------------------------------------------------------------

const DEFAULT_COMPLIANCE_RULES: TenantResolution["complianceRules"] = {
  forbidden_terms: [],
  required_qualifiers: [],
  max_values: {},
};

// ---------------------------------------------------------------------------
// Main resolver
// ---------------------------------------------------------------------------

export async function resolveTenant(
  supabase: SupabaseClient,
  businessId?: string,
  brandSlug?: string,
  userId?: string,
): Promise<TenantResolution | { error: number; message: string }> {
  // --- 1. Resolve tenant row ------------------------------------------------

  let tenantRow: {
    id: string;
    name: string;
    slug: string;
    compliance_rules: unknown;
    claim_validation_enabled: boolean | null;
  } | null = null;

  if (businessId) {
    // Priority: resolve by business_id directly
    const { data, error } = await supabase
      .from("business_tenants")
      .select("id, name, slug, compliance_rules, claim_validation_enabled")
      .eq("id", businessId)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return { error: 404, message: "Tenant not found or inactive" };
    }
    tenantRow = data;
  } else if (brandSlug) {
    // Fallback: resolve by slug (legacy)
    const { data, error } = await supabase
      .from("business_tenants")
      .select("id, name, slug, compliance_rules, claim_validation_enabled")
      .eq("slug", brandSlug)
      .eq("is_active", true)
      .single();

    if (error || !data) {
      return { error: 404, message: "Tenant not found or inactive" };
    }
    tenantRow = data;
  } else {
    return { error: 400, message: "Either business_id or brand is required" };
  }

  // --- 2. Verify user membership --------------------------------------------

  if (!userId) {
    return { error: 403, message: "Acceso denegado" };
  }

  const { data: membership, error: membershipError } = await supabase
    .from("user_business_memberships")
    .select("user_id")
    .eq("user_id", userId)
    .eq("business_id", tenantRow.id)
    .maybeSingle();

  if (membershipError || !membership) {
    return { error: 403, message: "Acceso denegado" };
  }

  // --- 3. Build resolution ---------------------------------------------------

  const complianceRules = isValidComplianceRules(tenantRow.compliance_rules)
    ? (tenantRow.compliance_rules as TenantResolution["complianceRules"])
    : DEFAULT_COMPLIANCE_RULES;

  const claimValidationEnabled = tenantRow.claim_validation_enabled === true;

  return {
    businessId: tenantRow.id,
    claimValidationEnabled,
    complianceRules,
    brandName: tenantRow.name,
  };
}

// ---------------------------------------------------------------------------
// Type guard
// ---------------------------------------------------------------------------

function isValidComplianceRules(
  value: unknown,
): value is TenantResolution["complianceRules"] {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.forbidden_terms) &&
    Array.isArray(v.required_qualifiers) &&
    typeof v.max_values === "object" &&
    v.max_values !== null
  );
}
