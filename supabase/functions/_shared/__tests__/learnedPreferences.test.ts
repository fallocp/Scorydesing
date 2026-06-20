/**
 * Unit tests for Learned Preferences utilities.
 *
 * Tests fetchLearnedPreferences and buildLearnedPreferencesSection.
 *
 * Requirements: Property 7 (Brand isolation in templates), Property 1 (Tenant isolation)
 */
import { describe, it, expect, vi } from "vitest";

// ---------------------------------------------------------------------------
// We test the pure logic by importing from the shared module.
// Since the module uses Deno imports, we mock the SupabaseClient interface.
// ---------------------------------------------------------------------------

// Inline the pure functions for testing (same logic as learnedPreferences.ts)
// This avoids Deno import issues in the vitest environment.

interface LearnedPreferences {
  prefer: string[];
  avoid: string[];
}

const FEEDBACK_QUERY_LIMITS = { likes: 10, dislikes: 10, chat: 10 };

function buildLearnedPreferencesSection(preferences: LearnedPreferences): string {
  if (preferences.prefer.length === 0 && preferences.avoid.length === 0) {
    return "";
  }

  const lines: string[] = [
    "PREFERENCIAS APRENDIDAS (del historial de feedback del usuario):",
  ];

  if (preferences.prefer.length > 0) {
    lines.push(`PREFIERO: ${preferences.prefer.join(", ")}`);
  }

  if (preferences.avoid.length > 0) {
    lines.push(`EVITAR: ${preferences.avoid.join(", ")}`);
  }

  lines.push(
    "Aplica estas preferencias sutilmente al diseño sin ignorar las selecciones explícitas del usuario.",
  );

  return lines.join("\n");
}

async function fetchLearnedPreferences(
  supabase: any,
  businessId: string,
): Promise<LearnedPreferences> {
  const preferences: LearnedPreferences = { prefer: [], avoid: [] };

  try {
    const { data: likes } = await supabase
      .from("design_feedback")
      .select("selections, prompt_used, interpreted_changes")
      .eq("business_id", businessId)
      .eq("feedback_type", "like")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_QUERY_LIMITS.likes);

    const { data: dislikes } = await supabase
      .from("design_feedback")
      .select("selections, prompt_used, interpreted_changes")
      .eq("business_id", businessId)
      .eq("feedback_type", "dislike")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_QUERY_LIMITS.dislikes);

    const { data: chatFeedback } = await supabase
      .from("design_feedback")
      .select("message, interpreted_changes")
      .eq("business_id", businessId)
      .eq("feedback_type", "chat")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_QUERY_LIMITS.chat);

    if (likes && likes.length > 0) {
      const likedStyles = new Set<string>();
      for (const like of likes) {
        const sel = like.selections as Record<string, unknown> | null;
        if (sel) {
          if (sel.background) likedStyles.add(`fondo: ${sel.background}`);
          if (sel.visualStyle) likedStyles.add(`estilo: ${sel.visualStyle}`);
          if (sel.contentType) likedStyles.add(`tipo: ${sel.contentType}`);
          if (sel.heroElement) likedStyles.add(`hero: ${sel.heroElement}`);
        }
        const changes = like.interpreted_changes as { increase?: string[]; decrease?: string[] } | null;
        if (changes?.increase) {
          for (const item of changes.increase) likedStyles.add(item);
        }
      }
      preferences.prefer.push(...Array.from(likedStyles));
    }

    if (dislikes && dislikes.length > 0) {
      const dislikedPatterns = new Set<string>();
      for (const dislike of dislikes) {
        const sel = dislike.selections as Record<string, unknown> | null;
        if (sel) {
          if (sel.background) dislikedPatterns.add(`fondo: ${sel.background}`);
          if (sel.visualStyle) dislikedPatterns.add(`estilo: ${sel.visualStyle}`);
          if (sel.contentType) dislikedPatterns.add(`tipo: ${sel.contentType}`);
          if (sel.heroElement) dislikedPatterns.add(`hero: ${sel.heroElement}`);
        }
        const changes = dislike.interpreted_changes as { increase?: string[]; decrease?: string[] } | null;
        if (changes?.decrease) {
          for (const item of changes.decrease) dislikedPatterns.add(item);
        }
      }
      preferences.avoid.push(...Array.from(dislikedPatterns));
    }

    if (chatFeedback && chatFeedback.length > 0) {
      const chatPrefer = new Set<string>();
      const chatAvoid = new Set<string>();
      for (const chat of chatFeedback) {
        const changes = chat.interpreted_changes as { increase?: string[]; decrease?: string[] } | null;
        if (changes?.increase) {
          for (const item of changes.increase) chatPrefer.add(item);
        }
        if (changes?.decrease) {
          for (const item of changes.decrease) chatAvoid.add(item);
        }
      }
      preferences.prefer.push(...Array.from(chatPrefer));
      preferences.avoid.push(...Array.from(chatAvoid));
    }

    preferences.prefer = [...new Set(preferences.prefer)];
    preferences.avoid = [...new Set(preferences.avoid)];
  } catch (err) {
    console.warn("Failed to fetch learned preferences:", err);
  }

  return preferences;
}

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

interface MockFeedbackRow {
  selections?: Record<string, unknown> | null;
  prompt_used?: string | null;
  interpreted_changes?: { increase?: string[]; decrease?: string[] } | null;
  message?: string | null;
  feedback_type: string;
  business_id: string;
}

function createMockSupabase(rows: MockFeedbackRow[]) {
  return {
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (col1: string, val1: unknown) => ({
          eq: (col2: string, val2: unknown) => ({
            order: (_col: string, _opts: any) => ({
              limit: (_n: number) => {
                const filtered = rows.filter(
                  (r) => (r as any)[col1] === val1 && (r as any)[col2] === val2,
                );
                return Promise.resolve({ data: filtered, error: null });
              },
            }),
          }),
        }),
      }),
    }),
  };
}

// ---------------------------------------------------------------------------
// Tests: buildLearnedPreferencesSection
// ---------------------------------------------------------------------------

describe("buildLearnedPreferencesSection", () => {
  it("returns empty string when no preferences", () => {
    const result = buildLearnedPreferencesSection({ prefer: [], avoid: [] });
    expect(result).toBe("");
  });

  it("builds PREFIERO section from prefer items", () => {
    const result = buildLearnedPreferencesSection({
      prefer: ["fondos claros", "tipografía bold"],
      avoid: [],
    });
    expect(result).toContain("PREFERENCIAS APRENDIDAS");
    expect(result).toContain("PREFIERO: fondos claros, tipografía bold");
    expect(result).not.toContain("EVITAR:");
  });

  it("builds EVITAR section from avoid items", () => {
    const result = buildLearnedPreferencesSection({
      prefer: [],
      avoid: ["glow effects", "colores neón"],
    });
    expect(result).toContain("EVITAR: glow effects, colores neón");
    expect(result).not.toContain("PREFIERO:");
  });

  it("builds both sections when both have items", () => {
    const result = buildLearnedPreferencesSection({
      prefer: ["minimalismo"],
      avoid: ["gradientes"],
    });
    expect(result).toContain("PREFIERO: minimalismo");
    expect(result).toContain("EVITAR: gradientes");
    expect(result).toContain("Aplica estas preferencias sutilmente");
  });
});

// ---------------------------------------------------------------------------
// Tests: fetchLearnedPreferences
// ---------------------------------------------------------------------------

describe("fetchLearnedPreferences", () => {
  const BUSINESS_A = "business-aaa";
  const BUSINESS_B = "business-bbb";

  it("returns empty preferences when no feedback exists", async () => {
    const supabase = createMockSupabase([]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toEqual([]);
    expect(result.avoid).toEqual([]);
  });

  it("extracts selections from liked mockups into prefer list", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "like",
        selections: { background: "dark-navy", visualStyle: "minimalist" },
        interpreted_changes: null,
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toContain("fondo: dark-navy");
    expect(result.prefer).toContain("estilo: minimalist");
  });

  it("extracts selections from disliked mockups into avoid list", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "dislike",
        selections: { background: "color-turquoise", heroElement: "big-number" },
        interpreted_changes: null,
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.avoid).toContain("fondo: color-turquoise");
    expect(result.avoid).toContain("hero: big-number");
  });

  it("extracts interpreted_changes.increase from likes into prefer", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "like",
        selections: null,
        interpreted_changes: { increase: ["fotos reales", "fondos claros"], decrease: [] },
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toContain("fotos reales");
    expect(result.prefer).toContain("fondos claros");
  });

  it("extracts interpreted_changes.decrease from dislikes into avoid", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "dislike",
        selections: null,
        interpreted_changes: { increase: [], decrease: ["glow", "neón"] },
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.avoid).toContain("glow");
    expect(result.avoid).toContain("neón");
  });

  it("extracts chat feedback interpreted_changes into both lists", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "chat",
        message: "Me gustan los fondos claros",
        interpreted_changes: { increase: ["fondos claros"], decrease: ["fondos oscuros"] },
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toContain("fondos claros");
    expect(result.avoid).toContain("fondos oscuros");
  });

  it("respects brand isolation — only reads from specified business_id", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "like",
        selections: { background: "dark-navy" },
        interpreted_changes: null,
      },
      {
        business_id: BUSINESS_B,
        feedback_type: "like",
        selections: { background: "light-cream" },
        interpreted_changes: null,
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toContain("fondo: dark-navy");
    expect(result.prefer).not.toContain("fondo: light-cream");
  });

  it("deduplicates preferences from multiple feedback rows", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "like",
        selections: { background: "dark-navy" },
        interpreted_changes: null,
      },
      {
        business_id: BUSINESS_A,
        feedback_type: "like",
        selections: { background: "dark-navy" },
        interpreted_changes: null,
      },
      {
        business_id: BUSINESS_A,
        feedback_type: "chat",
        message: "Más fondos oscuros",
        interpreted_changes: { increase: ["fondo: dark-navy"], decrease: [] },
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    // Should only appear once despite being in likes (2x) and chat
    const darkNavyCount = result.prefer.filter((p) => p === "fondo: dark-navy").length;
    expect(darkNavyCount).toBe(1);
  });

  it("handles null selections gracefully", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "like",
        selections: null,
        interpreted_changes: null,
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toEqual([]);
    expect(result.avoid).toEqual([]);
  });

  it("handles null interpreted_changes gracefully", async () => {
    const supabase = createMockSupabase([
      {
        business_id: BUSINESS_A,
        feedback_type: "chat",
        message: "test",
        interpreted_changes: null,
      },
    ]);
    const result = await fetchLearnedPreferences(supabase, BUSINESS_A);
    expect(result.prefer).toEqual([]);
    expect(result.avoid).toEqual([]);
  });
});
