/**
 * Unit tests for validatePipelineReadiness utility.
 *
 * Tests that the function correctly identifies missing required fields
 * and optional recommended fields for pipeline execution.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validatePipelineReadiness } from "../validatePipelineReadiness";

// ---------------------------------------------------------------------------
// Mock Supabase client builder
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
  const mockSelect = vi.fn();
  const mockEq = vi.fn();

  const from = vi.fn((table: string) => {
    if (table === "business_tenants") {
      return {
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return {
            eq: (_col: string, _val: unknown) => ({
              eq: (_col2: string, _val2: unknown) => ({
                single: () =>
                  config.tenant ?? {
                    data: null,
                    error: { message: "not found" },
                  },
              }),
            }),
          };
        },
      };
    }

    if (table === "master_prompts") {
      return {
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return {
            eq: (_col: string, _val: unknown) =>
              config.prompts ?? { count: 0, error: null },
          };
        },
      };
    }

    if (table === "commercial_branches") {
      return {
        select: (...args: unknown[]) => {
          mockSelect(...args);
          return {
            eq: (_col: string, _val: unknown) => ({
              eq: (_col2: string, _val2: unknown) =>
                config.branches ?? { count: 0, error: null },
            }),
          };
        },
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

describe("validatePipelineReadiness", () => {
  it("returns ready=true when all required fields are present", async () => {
    const supabase = createMockSupabase({
      tenant: { data: FULL_TENANT, error: null },
      prompts: { count: 3, error: null },
      branches: { count: 2, error: null },
      onboarding: {
        data: { status: "confirmed", overall_confidence: 0.92 },
        error: null,
      },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.missing).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  it("returns ready=false when business tenant is not found", async () => {
    const supabase = createMockSupabase({
      tenant: { data: null, error: { message: "not found" } },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("business_tenant (not found or inactive)");
  });

  it("reports missing logo_url when null", async () => {
    const supabase = createMockSupabase({
      tenant: { data: { ...FULL_TENANT, logo_url: null }, error: null },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("logo_url");
  });

  it("reports missing logo_url when empty string", async () => {
    const supabase = createMockSupabase({
      tenant: { data: { ...FULL_TENANT, logo_url: "  " }, error: null },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("logo_url");
  });

  it("reports missing primary_color when null", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, primary_color: null },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("primary_color");
  });

  it("reports missing master_prompt when count is 0", async () => {
    const supabase = createMockSupabase({
      tenant: { data: FULL_TENANT, error: null },
      prompts: { count: 0, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("master_prompt");
  });

  it("reports missing commercial_branch when count is 0", async () => {
    const supabase = createMockSupabase({
      tenant: { data: FULL_TENANT, error: null },
      prompts: { count: 1, error: null },
      branches: { count: 0, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("commercial_branch");
  });

  it("reports all missing fields when multiple are absent", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, logo_url: null, primary_color: "" },
        error: null,
      },
      prompts: { count: 0, error: null },
      branches: { count: 0, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(false);
    expect(result.missing).toContain("logo_url");
    expect(result.missing).toContain("primary_color");
    expect(result.missing).toContain("master_prompt");
    expect(result.missing).toContain("commercial_branch");
    expect(result.missing).toHaveLength(4);
  });

  it("warns about missing secondary_color", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, secondary_color: null },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("secondary_color");
  });

  it("warns about missing accent_color", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, accent_color: "" },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("accent_color");
  });

  it("warns about missing disclaimer", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, disclaimer: "" },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("disclaimer");
  });

  it("warns about empty compliance_rules", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, compliance_rules: {} },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("compliance_rules");
  });

  it("warns about invalid fonts (missing fields)", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, fonts: { display: "Inter" } },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("fonts");
  });

  it("warns about null fonts", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: { ...FULL_TENANT, fonts: null },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.ready).toBe(true);
    expect(result.warnings).toContain("fonts");
  });

  it("does not warn when compliance_rules has forbidden_terms", async () => {
    const supabase = createMockSupabase({
      tenant: {
        data: {
          ...FULL_TENANT,
          compliance_rules: {
            forbidden_terms: ["guaranteed"],
            required_qualifiers: [],
            max_values: {},
          },
        },
        error: null,
      },
      prompts: { count: 1, error: null },
      branches: { count: 1, error: null },
    });

    const result = await validatePipelineReadiness(supabase, BUSINESS_ID);

    expect(result.warnings).not.toContain("compliance_rules");
  });
});
