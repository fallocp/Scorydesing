/**
 * Integration tests for validatePipelineReadiness — Brand Onboarding checks.
 *
 * Validates that the pipeline readiness function correctly checks
 * brand onboarding status, confidence levels, and populated fields.
 *
 * Requirements: 5.5, 6.4, 6.5
 */
import { describe, it, expect, vi } from "vitest";
import { validatePipelineReadiness } from "../validatePipelineReadiness";

// ---------------------------------------------------------------------------
// Mock Supabase client builder (extended to support brand_onboarding_sessions)
// ---------------------------------------------------------------------------

interface MockQueryResult {
  data?: unknown;
  error?: { message: string } | null;
  count?: number | null;
}

function createMockSupabase(config: {
  tenant?: MockQueryResult;
  prompts?: MockQueryResult;
  branches?: MockQueryResult;
  onboarding?: MockQueryResult;
}) {
  const from = vi.fn((table: string) => {
    if (table === "business_tenants") {
      return {
        select: (..._args: unknown[]) => ({
          eq: (_col: string, _val: unknown) => ({
            eq: (_col2: string, _val2: unknown) => ({
              single: () =>
                config.tenant ?? {
                  data: null,
                  error: { message: "not found" },
                },
            }),
          }),
        }),
      };
    }

    if (table === "master_prompts") {
      return {
        select: (..._args: unknown[]) => ({
          eq: (_col: string, _val: unknown) =>
            config.prompts ?? { count: 1, error: null },
        }),
      };
    }

    if (table === "commercial_branches") {
      return {
        select: (..._args: unknown[]) => ({
          eq: (_col: string, _val: unknown) => ({
            eq: (_col2: string, _val2: unknown) =>
              config.branches ?? { count: 1, error: null },
          }),
        }),
      };
    }

    if (table === "brand_onboarding_sessions") {
      return {
        select: (..._args: unknown[]) => ({
          eq: (_col: string, _val: unknown) => ({
            eq: (_col2: string, _val2: unknown) => ({
              order: (_col3: string, _opts: unknown) => ({
                limit: (_n: number) => ({
                  maybeSingle: () =>
                    config.onboarding ?? { data: null, error: null },
                }),
              }),
            }),
          }),
        }),
      };
    }

    // Fallback
    return {
      select: () => ({ eq: () => ({ eq: () => ({ single: () => ({ data: null, error: null }) }) }) }),
    };
  });

  return { from } as unknown as Parameters<typeof validatePipelineReadiness>[0];
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const FULL_TENANT = {
  logo_url: "https://storage.example.com/logo.png",
  primary_color: "#FF6B35",
  secondary_color: "#2EC4B6",
  accent_color: "#0F1419",
  fonts: { display: "Inter", body: "Inter", mono: "JetBrains Mono" },
  disclaimer: "Xending® es una marca registrada.",
  compliance_rules: {
    forbidden_terms: ["garantizado"],
    required_qualifiers: ["sujeto a condiciones"],
    max_values: {},
  },
};

const BUSINESS_ID = "550e8400-e29b-41d4-a716-446655440000";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("validatePipelineReadiness — Brand Onboarding Integration", () => {
  describe("business without onboarding", () => {
    it("adds warning when no confirmed onboarding session exists", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: { data: null, error: null }, // No session found
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.ready).toBe(true); // Still ready (onboarding is a warning, not blocking)
      expect(result.warnings).toContain("brand_onboarding_not_completed");
    });

    it("adds warning when onboarding query returns an error", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: { data: null, error: { message: "table not found" } },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.ready).toBe(true);
      expect(result.warnings).toContain("brand_onboarding_not_completed");
    });
  });

  describe("business with confirmed onboarding and good confidence", () => {
    it("does not add onboarding warnings when confidence >= 0.70 and fields populated", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.92 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.ready).toBe(true);
      expect(result.warnings).not.toContain("brand_onboarding_not_completed");
      expect(result.warnings).not.toContain("brand_data_low_confidence");
      expect(result.warnings.filter((w) => w.startsWith("brand_fields_missing"))).toHaveLength(0);
    });

    it("is ready with no brand warnings at confidence boundary (0.70)", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.7 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.ready).toBe(true);
      expect(result.warnings).not.toContain("brand_data_low_confidence");
    });
  });

  describe("business with confirmed onboarding but low confidence", () => {
    it("adds low confidence warning when overall_confidence < 0.70", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.55 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.ready).toBe(true);
      expect(result.warnings).toContain("brand_data_low_confidence");
      expect(result.warnings).not.toContain("brand_onboarding_not_completed");
    });

    it("adds low confidence warning at 0.69", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.69 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.warnings).toContain("brand_data_low_confidence");
    });
  });

  describe("business with confirmed onboarding but empty brand fields", () => {
    it("warns about missing brand fields when logo_url is empty", async () => {
      const supabase = createMockSupabase({
        tenant: {
          data: { ...FULL_TENANT, logo_url: "" },
          error: null,
        },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.85 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      // logo_url is also a required field so ready=false
      expect(result.ready).toBe(false);
      expect(result.missing).toContain("logo_url");
      // Also warns about brand fields missing
      const brandFieldsWarning = result.warnings.find((w) =>
        w.startsWith("brand_fields_missing"),
      );
      expect(brandFieldsWarning).toBeDefined();
      expect(brandFieldsWarning).toContain("logo_url");
    });

    it("warns about multiple missing brand fields", async () => {
      const supabase = createMockSupabase({
        tenant: {
          data: {
            ...FULL_TENANT,
            secondary_color: null,
            accent_color: "",
            fonts: null,
          },
          error: null,
        },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.80 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      const brandFieldsWarning = result.warnings.find((w) =>
        w.startsWith("brand_fields_missing"),
      );
      expect(brandFieldsWarning).toBeDefined();
      expect(brandFieldsWarning).toContain("secondary_color");
      expect(brandFieldsWarning).toContain("accent_color");
      expect(brandFieldsWarning).toContain("fonts");
    });

    it("does not add brand_fields_missing warning when all brand fields are populated", async () => {
      const supabase = createMockSupabase({
        tenant: { data: FULL_TENANT, error: null },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.90 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      const brandFieldsWarning = result.warnings.find((w) =>
        w.startsWith("brand_fields_missing"),
      );
      expect(brandFieldsWarning).toBeUndefined();
    });
  });

  describe("combined scenarios", () => {
    it("can have both low confidence and missing fields warnings", async () => {
      const supabase = createMockSupabase({
        tenant: {
          data: { ...FULL_TENANT, accent_color: null },
          error: null,
        },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: {
          data: { status: "confirmed", overall_confidence: 0.45 },
          error: null,
        },
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.ready).toBe(true);
      expect(result.warnings).toContain("brand_data_low_confidence");
      const brandFieldsWarning = result.warnings.find((w) =>
        w.startsWith("brand_fields_missing"),
      );
      expect(brandFieldsWarning).toBeDefined();
      expect(brandFieldsWarning).toContain("accent_color");
    });

    it("does not check brand fields or confidence when onboarding is not completed", async () => {
      const supabase = createMockSupabase({
        tenant: {
          data: { ...FULL_TENANT, accent_color: null },
          error: null,
        },
        prompts: { count: 1, error: null },
        branches: { count: 1, error: null },
        onboarding: { data: null, error: null }, // No confirmed session
      });

      const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

      expect(result.warnings).toContain("brand_onboarding_not_completed");
      expect(result.warnings).not.toContain("brand_data_low_confidence");
      // brand_fields_missing should NOT appear (only checked when onboarding is confirmed)
      const brandFieldsWarning = result.warnings.find((w) =>
        w.startsWith("brand_fields_missing"),
      );
      expect(brandFieldsWarning).toBeUndefined();
    });
  });
});
