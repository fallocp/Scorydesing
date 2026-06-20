/**
 * Unit tests for the Dynamic Prompt Composer.
 *
 * Tests:
 * - Composes prompt with all layers when profile and deltas exist
 * - Returns minimal prompt when no profile exists (graceful degradation)
 * - Brand isolation: only includes data for the specified business_id
 * - Correctly aggregates learning deltas (deduplication)
 * - Respects maxDeltas limit
 * - Includes compliance section when forbidden_terms exist
 * - Builds negatives from both preferences.decrease and deltas.decrease
 * - Campaign context is always included in user message
 *
 * **Validates: Property 7 (Brand isolation in templates)**
 */
import { describe, it, expect, vi } from "vitest";
import { compose } from "../promptComposer";

// ---------------------------------------------------------------------------
// Mock Supabase client factory
// ---------------------------------------------------------------------------

interface MockConfig {
  profile?: {
    version: number;
    base_brand: Record<string, unknown>;
    strategic_layer: Record<string, unknown>;
    preferences: { increase: string[]; decrease: string[] };
  } | null;
  deltas?: Array<{
    increase: string[];
    decrease: string[];
    trigger_type: string;
    created_at: string;
  }>;
  compliance?: {
    forbidden_terms?: string[];
    required_qualifiers?: string[];
    max_values?: Record<string, string>;
  } | null;
  /** The business_id that the mock data belongs to */
  dataBusinessId?: string;
}

function createMockSupabase(config: MockConfig) {
  const {
    profile = null,
    deltas = [],
    compliance = null,
    dataBusinessId = "biz-001",
  } = config;

  const from = vi.fn((table: string) => {
    if (table === "creative_profiles") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => ({
            order: () => ({
              limit: () => ({
                maybeSingle: () => {
                  // Brand isolation: only return data if business_id matches
                  if (col === "business_id" && val !== dataBusinessId) {
                    return { data: null, error: null };
                  }
                  return { data: profile, error: null };
                },
              }),
            }),
          }),
        }),
      };
    }

    if (table === "learning_deltas") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => ({
            order: () => ({
              limit: (n: number) => {
                // Brand isolation: only return data if business_id matches
                if (col === "business_id" && val !== dataBusinessId) {
                  return { data: [], error: null };
                }
                return { data: deltas.slice(0, n), error: null };
              },
            }),
          }),
        }),
      };
    }

    if (table === "business_tenants") {
      return {
        select: () => ({
          eq: (col: string, val: unknown) => ({
            single: () => {
              if (col === "id" && val !== dataBusinessId) {
                return { data: null, error: { message: "not found" } };
              }
              return {
                data: { compliance_rules: compliance },
                error: null,
              };
            },
          }),
        }),
      };
    }

    throw new Error(`Unexpected table: ${table}`);
  });

  return { from } as unknown as import("https://esm.sh/@supabase/supabase-js@2.53.0").SupabaseClient;
}

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const BUSINESS_ID = "biz-001";

const SAMPLE_CAMPAIGN = {
  brand: "Xending",
  topic: "Inversiones en dólares",
  audience: "Millennials mexicanos",
  objective: "Generar leads para cuenta de inversión",
  platforms: ["instagram-story", "linkedin-post"],
  channel: "instagram",
  angle: "educativo",
  narrativeAngle: "Datos duros",
  funnelStage: "atraccion",
};

const SAMPLE_PROFILE = {
  version: 3,
  base_brand: {
    name: "Xending",
    colors: { primary: "#00C9A7", secondary: "#FF6B6B", accent: "#1A1A2E" },
    fonts: { display: "Montserrat", body: "Inter", mono: "JetBrains Mono" },
    logo_url: "https://storage.example.com/xending-logo.png",
    aesthetic: "Fintech premium, moderno y accesible",
  },
  strategic_layer: {
    tone: "Profesional pero cercano",
    audience: "Millennials y Gen Z mexicanos interesados en finanzas",
    positioning: "La app de inversión más accesible de México",
    topics: ["inversiones", "ahorro", "dólar", "finanzas personales"],
  },
  preferences: {
    increase: ["fondos claros", "tipografía bold", "datos duros"],
    decrease: ["glow effects", "colores pastel", "ilustraciones cartoon"],
  },
};

const SAMPLE_DELTAS = [
  {
    increase: ["más fotos reales mexicanas"],
    decrease: ["menos stock genérico"],
    trigger_type: "explicit_feedback",
    created_at: "2025-06-01T10:00:00Z",
  },
  {
    increase: ["fondos claros", "contraste alto"],
    decrease: ["textos largos"],
    trigger_type: "pattern",
    created_at: "2025-05-30T10:00:00Z",
  },
];

const SAMPLE_COMPLIANCE = {
  forbidden_terms: ["garantizado", "sin riesgo", "rendimiento asegurado"],
  required_qualifiers: ["Inversiones conllevan riesgo", "Rendimientos pasados no garantizan futuros"],
  max_values: { rendimiento_anual: "12%" },
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("promptComposer — compose()", () => {
  it("composes full prompt with all layers when profile and deltas exist", async () => {
    const supabase = createMockSupabase({
      profile: SAMPLE_PROFILE,
      deltas: SAMPLE_DELTAS,
      compliance: SAMPLE_COMPLIANCE,
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    // System message should contain all sections
    expect(result.systemMessage).toContain("## SYSTEM");
    expect(result.systemMessage).toContain("## BASE BRAND");
    expect(result.systemMessage).toContain("## STRATEGIC");
    expect(result.systemMessage).toContain("## PREFERENCES");
    expect(result.systemMessage).toContain("## RECENT LEARNINGS");
    expect(result.systemMessage).toContain("## COMPLIANCE");
    expect(result.systemMessage).toContain("## NEGATIVES");

    // User message should contain campaign context
    expect(result.userMessage).toContain("## CAMPAIGN");
    expect(result.userMessage).toContain("Xending");
    expect(result.userMessage).toContain("Inversiones en dólares");

    // Metadata
    expect(result.metadata.profileVersion).toBe(3);
    expect(result.metadata.deltasIncluded).toBe(2);
    expect(result.metadata.hasCompliance).toBe(true);
    expect(result.metadata.hasNegatives).toBe(true);
  });

  it("returns minimal prompt when no profile exists (graceful degradation)", async () => {
    const supabase = createMockSupabase({
      profile: null,
      deltas: [],
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    // Should still have system section
    expect(result.systemMessage).toContain("## SYSTEM");

    // Should NOT have brand/strategic/preferences sections
    expect(result.systemMessage).not.toContain("## BASE BRAND");
    expect(result.systemMessage).not.toContain("## STRATEGIC");
    expect(result.systemMessage).not.toContain("## PREFERENCES");
    expect(result.systemMessage).not.toContain("## RECENT LEARNINGS");

    // Campaign is always present in user message
    expect(result.userMessage).toContain("## CAMPAIGN");
    expect(result.userMessage).toContain("Xending");

    // Metadata reflects absence
    expect(result.metadata.profileVersion).toBeNull();
    expect(result.metadata.deltasIncluded).toBe(0);
    expect(result.metadata.hasCompliance).toBe(false);
    expect(result.metadata.hasNegatives).toBe(false);
  });

  it("enforces brand isolation — returns empty for wrong business_id", async () => {
    const supabase = createMockSupabase({
      profile: SAMPLE_PROFILE,
      deltas: SAMPLE_DELTAS,
      compliance: SAMPLE_COMPLIANCE,
      dataBusinessId: BUSINESS_ID,
    });

    // Query with a DIFFERENT business_id
    const result = await compose({
      businessId: "biz-OTHER",
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    // Should NOT contain brand data from biz-001
    expect(result.systemMessage).not.toContain("Xending");
    expect(result.systemMessage).not.toContain("#00C9A7");
    expect(result.systemMessage).not.toContain("fondos claros");
    expect(result.systemMessage).not.toContain("garantizado");

    // Metadata reflects no data found
    expect(result.metadata.profileVersion).toBeNull();
    expect(result.metadata.deltasIncluded).toBe(0);
    expect(result.metadata.hasCompliance).toBe(false);
  });

  it("deduplicates items across deltas", async () => {
    const supabase = createMockSupabase({
      profile: null,
      deltas: [
        { increase: ["fondos claros"], decrease: ["glow"], trigger_type: "pattern", created_at: "2025-06-01T10:00:00Z" },
        { increase: ["fondos claros", "contraste"], decrease: ["glow", "pastel"], trigger_type: "explicit_feedback", created_at: "2025-05-30T10:00:00Z" },
      ],
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    // "fondos claros" should appear only once in RECENT LEARNINGS
    const learningsSection = result.systemMessage.split("## RECENT LEARNINGS")[1]?.split("##")[0] ?? "";
    const fondosClarosCount = (learningsSection.match(/fondos claros/g) || []).length;
    expect(fondosClarosCount).toBe(1);

    // "glow" should appear only once in NEGATIVES
    const negativesSection = result.systemMessage.split("## NEGATIVES")[1] ?? "";
    const glowCount = (negativesSection.match(/glow/g) || []).length;
    expect(glowCount).toBe(1);
  });

  it("respects maxDeltas limit", async () => {
    // Create 15 deltas
    const manyDeltas = Array.from({ length: 15 }, (_, i) => ({
      increase: [`item-${i}`],
      decrease: [],
      trigger_type: "pattern" as const,
      created_at: `2025-06-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    }));

    const supabase = createMockSupabase({
      profile: null,
      deltas: manyDeltas,
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
      maxDeltas: 5,
    });

    // Only 5 deltas should be included
    expect(result.metadata.deltasIncluded).toBe(5);
  });

  it("includes compliance section when forbidden_terms exist", async () => {
    const supabase = createMockSupabase({
      profile: null,
      deltas: [],
      compliance: {
        forbidden_terms: ["garantizado", "sin riesgo"],
        required_qualifiers: ["Inversiones conllevan riesgo"],
        max_values: {},
      },
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    expect(result.systemMessage).toContain("## COMPLIANCE");
    expect(result.systemMessage).toContain("garantizado");
    expect(result.systemMessage).toContain("sin riesgo");
    expect(result.systemMessage).toContain("Inversiones conllevan riesgo");
    expect(result.metadata.hasCompliance).toBe(true);
  });

  it("builds negatives from both preferences.decrease and deltas.decrease", async () => {
    const supabase = createMockSupabase({
      profile: {
        version: 1,
        base_brand: {},
        strategic_layer: {},
        preferences: { increase: [], decrease: ["glow effects", "colores pastel"] },
      },
      deltas: [
        { increase: [], decrease: ["textos largos", "glow effects"], trigger_type: "pattern", created_at: "2025-06-01T10:00:00Z" },
      ],
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    expect(result.systemMessage).toContain("## NEGATIVES");
    // Should contain all unique negatives
    expect(result.systemMessage).toContain("glow effects");
    expect(result.systemMessage).toContain("colores pastel");
    expect(result.systemMessage).toContain("textos largos");
    // "glow effects" should not be duplicated in the negatives line
    const negativesLine = result.systemMessage.split("## NEGATIVES")[1]?.trim() ?? "";
    const glowCount = (negativesLine.match(/glow effects/g) || []).length;
    expect(glowCount).toBe(1);
  });

  it("campaign context is always included in user message", async () => {
    const supabase = createMockSupabase({
      profile: null,
      deltas: [],
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const minimalCampaign = {
      brand: "TestBrand",
      topic: "Ahorro",
      audience: "Jóvenes",
      objective: "Awareness",
      platforms: ["instagram-post"],
    };

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: minimalCampaign,
      supabase,
    });

    expect(result.userMessage).toContain("TestBrand");
    expect(result.userMessage).toContain("Ahorro");
    expect(result.userMessage).toContain("Jóvenes");
    expect(result.userMessage).toContain("Awareness");
    expect(result.userMessage).toContain("instagram-post");
  });

  it("allows custom system role override", async () => {
    const supabase = createMockSupabase({
      profile: null,
      deltas: [],
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const customRole = "Eres un experto en generación de imágenes publicitarias.";

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
      systemRole: customRole,
    });

    expect(result.systemMessage).toContain(customRole);
    // Should NOT contain the default role
    expect(result.systemMessage).not.toContain("marketing digital y diseño de contenido");
  });

  it("handles profile with empty base_brand gracefully", async () => {
    const supabase = createMockSupabase({
      profile: {
        version: 1,
        base_brand: {},
        strategic_layer: {},
        preferences: { increase: [], decrease: [] },
      },
      deltas: [],
      compliance: null,
      dataBusinessId: BUSINESS_ID,
    });

    const result = await compose({
      businessId: BUSINESS_ID,
      campaign: SAMPLE_CAMPAIGN,
      supabase,
    });

    // Should not crash, and should not include empty sections
    expect(result.systemMessage).toContain("## SYSTEM");
    expect(result.systemMessage).not.toContain("## BASE BRAND");
    expect(result.systemMessage).not.toContain("## STRATEGIC");
    expect(result.systemMessage).not.toContain("## PREFERENCES");
    expect(result.metadata.profileVersion).toBe(1);
  });
});
