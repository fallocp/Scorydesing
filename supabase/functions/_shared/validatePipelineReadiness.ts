/**
 * Validates that a business has the minimum configuration required
 * to run the Creative OS Pipeline.
 *
 * Called by the pipeline-orchestrator before starting a pipeline run.
 *
 * Requirements: ReadinessCheck interface from design.md
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ReadinessCheck {
  ready: boolean;
  missing: string[]; // Required fields that are null/empty
  warnings: string[]; // Optional but recommended fields not configured
}

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

/**
 * Check if a business has the minimum configuration to run the pipeline.
 *
 * Required (pipeline cannot run without these):
 * - logo_url
 * - primary_color
 * - At least 1 master_prompt
 * - At least 1 active commercial_branch
 *
 * Recommended (warnings if missing):
 * - secondary_color
 * - accent_color
 * - disclaimer
 * - compliance_rules (non-empty)
 * - fonts (properly configured)
 *
 * Brand onboarding checks:
 * - Business should have a confirmed brand_onboarding_session
 * - overall_confidence should be >= 0.70
 * - Key brand fields (logo_url, primary_color, secondary_color, accent_color, fonts) should not be empty
 */
export async function validatePipelineReadiness(
  supabase: SupabaseClient,
  businessId: string,
): Promise<ReadinessCheck> {
  const missing: string[] = [];
  const warnings: string[] = [];

  // --- 1. Fetch business tenant data --------------------------------------
  const { data: tenant, error: tenantError } = await supabase
    .from("business_tenants")
    .select(
      "logo_url, primary_color, secondary_color, accent_color, fonts, disclaimer, compliance_rules",
    )
    .eq("id", businessId)
    .eq("is_active", true)
    .single();

  if (tenantError || !tenant) {
    return {
      ready: false,
      missing: ["business_tenant (not found or inactive)"],
      warnings: [],
    };
  }

  // --- 2. Check required tenant fields ------------------------------------
  if (!tenant.logo_url || tenant.logo_url.trim() === "") {
    missing.push("logo_url");
  }

  if (!tenant.primary_color || tenant.primary_color.trim() === "") {
    missing.push("primary_color");
  }

  // --- 3. Check at least 1 master prompt exists ---------------------------
  const { count: promptCount, error: promptError } = await supabase
    .from("master_prompts")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId);

  if (promptError || !promptCount || promptCount < 1) {
    missing.push("master_prompt");
  }

  // --- 4. Check at least 1 active commercial branch -----------------------
  const { count: branchCount, error: branchError } = await supabase
    .from("commercial_branches")
    .select("id", { count: "exact", head: true })
    .eq("business_id", businessId)
    .eq("is_active", true);

  if (branchError || !branchCount || branchCount < 1) {
    missing.push("commercial_branch");
  }

  // --- 5. Check optional/recommended fields (warnings) --------------------
  if (!tenant.secondary_color || tenant.secondary_color.trim() === "") {
    warnings.push("secondary_color");
  }

  if (!tenant.accent_color || tenant.accent_color.trim() === "") {
    warnings.push("accent_color");
  }

  if (!tenant.disclaimer || tenant.disclaimer.trim() === "") {
    warnings.push("disclaimer");
  }

  if (!isNonEmptyComplianceRules(tenant.compliance_rules)) {
    warnings.push("compliance_rules");
  }

  if (!isValidFonts(tenant.fonts)) {
    warnings.push("fonts");
  }

  // --- 6. Brand onboarding checks -----------------------------------------
  const { data: onboardingSession, error: onboardingError } = await supabase
    .from("brand_onboarding_sessions")
    .select("status, overall_confidence")
    .eq("business_id", businessId)
    .eq("status", "confirmed")
    .order("approved_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (onboardingError || !onboardingSession) {
    // No confirmed onboarding session found
    warnings.push("brand_onboarding_not_completed");
  } else {
    // 6a. Check overall_confidence >= 0.70
    if (
      onboardingSession.overall_confidence != null &&
      onboardingSession.overall_confidence < 0.7
    ) {
      warnings.push("brand_data_low_confidence");
    }

    // 6b. Verify key brand fields populated in business_tenants
    const emptyBrandFields: string[] = [];
    if (!tenant.logo_url || tenant.logo_url.trim() === "") {
      emptyBrandFields.push("logo_url");
    }
    if (!tenant.primary_color || tenant.primary_color.trim() === "") {
      emptyBrandFields.push("primary_color");
    }
    if (!tenant.secondary_color || tenant.secondary_color.trim() === "") {
      emptyBrandFields.push("secondary_color");
    }
    if (!tenant.accent_color || tenant.accent_color.trim() === "") {
      emptyBrandFields.push("accent_color");
    }
    if (!isValidFonts(tenant.fonts)) {
      emptyBrandFields.push("fonts");
    }

    if (emptyBrandFields.length > 0) {
      warnings.push(
        `brand_fields_missing: ${emptyBrandFields.join(", ")}`,
      );
    }
  }

  // --- 7. Return readiness result -----------------------------------------
  return {
    ready: missing.length === 0,
    missing,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidFonts(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.display === "string" &&
    v.display.trim() !== "" &&
    typeof v.body === "string" &&
    v.body.trim() !== "" &&
    typeof v.mono === "string" &&
    v.mono.trim() !== ""
  );
}

function isNonEmptyComplianceRules(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  // At least one of the compliance arrays/objects should have content
  const hasForbiddenTerms =
    Array.isArray(v.forbidden_terms) && v.forbidden_terms.length > 0;
  const hasRequiredQualifiers =
    Array.isArray(v.required_qualifiers) && v.required_qualifiers.length > 0;
  const hasMaxValues =
    typeof v.max_values === "object" &&
    v.max_values !== null &&
    Object.keys(v.max_values).length > 0;
  return hasForbiddenTerms || hasRequiredQualifiers || hasMaxValues;
}
