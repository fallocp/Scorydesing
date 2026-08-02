/**
 * Shared helper for edge functions: fetches all business context needed
 * for dynamic prompt building, brand identity, and compliance enforcement.
 *
 * Replaces hardcoded brand configs, CTA banks, disclaimers, and prompt
 * templates with database-driven lookups scoped by business_id.
 *
 * Requirements: 16.5, 16.6, 16.9
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface BusinessContext {
  masterPrompt: string | null;
  complianceRules: {
    forbidden_terms: string[];
    required_qualifiers: string[];
    max_values: Record<string, string>;
  };
  brandIdentity: {
    name: string;
    slug: string;
    logo_url: string | null;
    primary_color: string;
    secondary_color: string;
    accent_color: string;
    fonts: { display: string; body: string; mono: string };
    disclaimer: string;
    short_disclaimer: string;
  };
  channels: Array<{
    name: string;
    slug: string;
    platform_format: string | null;
  }>;
  angles: Array<{
    name: string;
    slug: string;
    description: string | null;
  }>;
}

const DEFAULT_COMPLIANCE_RULES: BusinessContext["complianceRules"] = {
  forbidden_terms: [],
  required_qualifiers: [],
  max_values: {},
};

const DEFAULT_FONTS: BusinessContext["brandIdentity"]["fonts"] = {
  display: "Inter",
  body: "Inter",
  mono: "monospace",
};

// ---------------------------------------------------------------------------
// Main helper
// ---------------------------------------------------------------------------

/**
 * Fetch the full business context for an edge function.
 *
 * Accepts a Supabase client (created with the service_role key so RLS is
 * bypassed inside edge functions) and a business_id UUID.
 *
 * Returns a structured `BusinessContext` object containing:
 * - masterPrompt  – latest version prompt_text (or null)
 * - complianceRules – forbidden terms, required qualifiers, max values
 * - brandIdentity – name, slug, logo, colors, fonts, disclaimers
 * - channels – active business_channels (CTA bank / distribution targets)
 * - angles – active business_angles
 *
 * Throws if the business_id does not match any tenant.
 */
export async function fetchBusinessContext(
  supabase: SupabaseClient,
  businessId: string,
): Promise<BusinessContext> {
  // --- 1. Fetch business tenant -------------------------------------------
  const { data: tenant, error: tenantError } = await supabase
    .from("business_tenants")
    .select(
      "name, slug, logo_url, primary_color, secondary_color, accent_color, fonts, disclaimer, short_disclaimer, compliance_rules",
    )
    .eq("id", businessId)
    .eq("is_active", true)
    .single();

  if (tenantError || !tenant) {
    throw new Error(
      `Business tenant not found or inactive: ${businessId}. ${tenantError?.message ?? ""}`,
    );
  }

  // --- 2. Fetch latest master prompt (highest version) --------------------
  const { data: promptRow } = await supabase
    .from("master_prompts")
    .select("prompt_text")
    .eq("business_id", businessId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  // --- 3. Fetch active channels (ordered) ---------------------------------
  const { data: channels } = await supabase
    .from("business_channels")
    .select("name, slug, platform_format")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  // --- 4. Fetch active angles (ordered) -----------------------------------
  const { data: angles } = await supabase
    .from("business_angles")
    .select("name, slug, description")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("display_order", { ascending: true });

  // --- 5. Assemble structured response ------------------------------------
  const fonts = isValidFonts(tenant.fonts) ? tenant.fonts : DEFAULT_FONTS;

  const complianceRules = isValidComplianceRules(tenant.compliance_rules)
    ? tenant.compliance_rules
    : DEFAULT_COMPLIANCE_RULES;

  return {
    masterPrompt: promptRow?.prompt_text ?? null,
    complianceRules,
    brandIdentity: {
      name: tenant.name,
      slug: tenant.slug,
      logo_url: tenant.logo_url ?? null,
      primary_color: tenant.primary_color ?? "#000000",
      secondary_color: tenant.secondary_color ?? "#666666",
      accent_color: tenant.accent_color ?? "#333333",
      fonts,
      disclaimer: tenant.disclaimer ?? "",
      short_disclaimer: tenant.short_disclaimer ?? "",
    },
    channels: channels ?? [],
    angles: angles ?? [],
  };
}

// ---------------------------------------------------------------------------
// Type guards
// ---------------------------------------------------------------------------

function isValidFonts(
  value: unknown,
): value is BusinessContext["brandIdentity"]["fonts"] {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.display === "string" &&
    typeof v.body === "string" &&
    typeof v.mono === "string"
  );
}

function isValidComplianceRules(
  value: unknown,
): value is BusinessContext["complianceRules"] {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Array.isArray(v.forbidden_terms) &&
    Array.isArray(v.required_qualifiers) &&
    typeof v.max_values === "object" &&
    v.max_values !== null
  );
}

// ---------------------------------------------------------------------------
// Prompt type lookup helper
// ---------------------------------------------------------------------------

/**
 * Fetch the latest master prompt template for a specific type.
 *
 * Queries `master_prompts` filtered by `business_id` and `prompt_type`,
 * ordered by `version DESC`, limit 1. Returns `prompt_text` or `null`
 * if no matching row is found.
 *
 * Requirements: 6.2, 6.4, 6.5
 */
export async function fetchMasterPromptByType(
  supabase: SupabaseClient,
  businessId: string,
  promptType: "content" | "image" | "variant" | "claim_validation" | "channel_adapter",
): Promise<string | null> {
  const { data } = await supabase
    .from("master_prompts")
    .select("prompt_text")
    .eq("business_id", businessId)
    .eq("prompt_type", promptType)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.prompt_text ?? null;
}
