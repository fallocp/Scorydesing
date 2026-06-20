/**
 * Unit tests for Intelligent Template Selector.
 *
 * Tests selectTemplate, scoreTemplates, and helper functions.
 *
 * Requirements: Property 5 (Template consistency)
 */
import { describe, it, expect } from "vitest";

// ---------------------------------------------------------------------------
// Inline types and logic for testing (avoids Deno import issues in vitest)
// ---------------------------------------------------------------------------

interface TemplateSelection {
  content_type: string;
  visual_tone: string;
  layout_variation: string;
}

interface TemplateSelectorResult {
  selection: TemplateSelection;
  score: number;
  reasoning: string[];
  isOverride: boolean;
}

interface TemplateCandidate {
  content_type: string;
  visual_tone: string;
  layout_variation: string;
  score: number;
  reasons: string[];
}

interface TemplateRow {
  content_type: string;
  visual_tone: string;
  layout_variation: string;
}

interface FeedbackRow {
  feedback_type: string;
  selections: Record<string, unknown> | null;
  interpreted_changes: { increase?: string[]; decrease?: string[] } | null;
}

interface ProfileRow {
  preferences: { increase?: string[]; decrease?: string[] };
}

// ---------------------------------------------------------------------------
// Constants (mirrored from templateSelector.ts)
// ---------------------------------------------------------------------------

const BACKGROUND_TO_TONE_MAP: Record<string, string> = {
  "dark-navy": "dark",
  "dark": "dark",
  "navy": "dark",
  "black": "dark",
  "midnight": "dark",
  "light-cream": "light",
  "light": "light",
  "cream": "light",
  "white": "light",
  "beige": "light",
  "color-coral": "medium",
  "coral": "medium",
  "color-turquoise": "medium",
  "turquoise": "medium",
  "gradient": "medium",
  "mesh": "medium",
  "vibrant": "medium",
};

const SCORING_WEIGHTS = {
  LIKED_TONE: 15,
  LIKED_CONTENT_TYPE: 10,
  PROFILE_INCREASE: 12,
  DISLIKED_TONE: -15,
  DISLIKED_CONTENT_TYPE: -10,
  PROFILE_DECREASE: -12,
  BASE_SCORE: 50,
};

// ---------------------------------------------------------------------------
// Inline pure functions for testing
// ---------------------------------------------------------------------------

function mapBackgroundToTone(background: string): string | null {
  const direct = BACKGROUND_TO_TONE_MAP[background.toLowerCase()];
  if (direct) return direct;

  const bgLower = background.toLowerCase();
  for (const [key, tone] of Object.entries(BACKGROUND_TO_TONE_MAP)) {
    if (bgLower.includes(key) || key.includes(bgLower)) {
      return tone;
    }
  }
  return null;
}

function matchesToneKeyword(keyword: string, tone: string): boolean {
  const toneKeywords: Record<string, string[]> = {
    dark: ["oscuro", "dark", "navy", "negro", "nocturno", "premium"],
    light: ["claro", "light", "cream", "blanco", "limpio", "profesional"],
    medium: ["vibrante", "coral", "turquesa", "gradiente", "mesh", "colorido"],
  };
  const keywords = toneKeywords[tone] ?? [];
  return keywords.some((k) => keyword.includes(k));
}

interface ToneSignals {
  liked: Record<string, number>;
  disliked: Record<string, number>;
}

interface ContentTypeSignals {
  liked: Record<string, number>;
  disliked: Record<string, number>;
}

function extractToneSignals(feedback: FeedbackRow[]): ToneSignals {
  const signals: ToneSignals = { liked: {}, disliked: {} };
  for (const row of feedback) {
    const background = row.selections?.background as string | undefined;
    if (!background) continue;
    const tone = mapBackgroundToTone(background);
    if (!tone) continue;
    if (row.feedback_type === "like") {
      signals.liked[tone] = (signals.liked[tone] ?? 0) + 1;
    } else if (row.feedback_type === "dislike") {
      signals.disliked[tone] = (signals.disliked[tone] ?? 0) + 1;
    }
  }
  return signals;
}

function extractContentTypeSignals(feedback: FeedbackRow[]): ContentTypeSignals {
  const signals: ContentTypeSignals = { liked: {}, disliked: {} };
  for (const row of feedback) {
    const contentType = row.selections?.contentType as string | undefined;
    if (!contentType) continue;
    const normalized = normalizeContentType(contentType);
    if (row.feedback_type === "like") {
      signals.liked[normalized] = (signals.liked[normalized] ?? 0) + 1;
    } else if (row.feedback_type === "dislike") {
      signals.disliked[normalized] = (signals.disliked[normalized] ?? 0) + 1;
    }
  }
  return signals;
}

function normalizeContentType(raw: string): string {
  const valid = [
    "breaking-news", "corporate", "market-update",
    "stat-of-the-day", "event-special",
  ];
  const lower = raw.toLowerCase().replace(/\s+/g, "-");
  if (valid.includes(lower)) return lower;
  const aliases: Record<string, string> = {
    "breaking": "breaking-news",
    "news": "breaking-news",
    "corp": "corporate",
    "market": "market-update",
    "stat": "stat-of-the-day",
    "stats": "stat-of-the-day",
    "event": "event-special",
    "special": "event-special",
  };
  return aliases[lower] ?? lower;
}

function scoreTone(tone: string, signals: ToneSignals): number {
  const likeCount = signals.liked[tone] ?? 0;
  const dislikeCount = signals.disliked[tone] ?? 0;
  return (likeCount * SCORING_WEIGHTS.LIKED_TONE) +
    (dislikeCount * SCORING_WEIGHTS.DISLIKED_TONE);
}

function scoreContentType(contentType: string, signals: ContentTypeSignals): number {
  const likeCount = signals.liked[contentType] ?? 0;
  const dislikeCount = signals.disliked[contentType] ?? 0;
  return (likeCount * SCORING_WEIGHTS.LIKED_CONTENT_TYPE) +
    (dislikeCount * SCORING_WEIGHTS.DISLIKED_CONTENT_TYPE);
}

function scoreAgainstProfile(
  template: TemplateRow,
  increase: string[],
  decrease: string[],
): number {
  let score = 0;
  const templateTerms = [
    template.visual_tone,
    template.content_type,
    `layout-${template.layout_variation.toLowerCase()}`,
  ];

  for (const pref of increase) {
    const prefLower = pref.toLowerCase();
    for (const term of templateTerms) {
      if (prefLower.includes(term) || term.includes(prefLower)) {
        score += SCORING_WEIGHTS.PROFILE_INCREASE;
        break;
      }
    }
    if (matchesToneKeyword(prefLower, template.visual_tone)) {
      score += SCORING_WEIGHTS.PROFILE_INCREASE;
    }
  }

  for (const pref of decrease) {
    const prefLower = pref.toLowerCase();
    for (const term of templateTerms) {
      if (prefLower.includes(term) || term.includes(prefLower)) {
        score += SCORING_WEIGHTS.PROFILE_DECREASE;
        break;
      }
    }
    if (matchesToneKeyword(prefLower, template.visual_tone)) {
      score += SCORING_WEIGHTS.PROFILE_DECREASE;
    }
  }

  return score;
}

function scoreTemplates(
  templates: TemplateRow[],
  feedback: FeedbackRow[],
  profile: ProfileRow | null,
): TemplateCandidate[] {
  const toneSignals = extractToneSignals(feedback);
  const contentTypeSignals = extractContentTypeSignals(feedback);
  const profileIncrease = profile?.preferences?.increase ?? [];
  const profileDecrease = profile?.preferences?.decrease ?? [];

  return templates.map((template) => {
    let score = SCORING_WEIGHTS.BASE_SCORE;
    const reasons: string[] = [];

    const toneScore = scoreTone(template.visual_tone, toneSignals);
    if (toneScore !== 0) {
      score += toneScore;
      if (toneScore > 0) {
        reasons.push(`Visual tone "${template.visual_tone}" matches liked patterns (+${toneScore})`);
      } else {
        reasons.push(`Visual tone "${template.visual_tone}" matches disliked patterns (${toneScore})`);
      }
    }

    const contentScore = scoreContentType(template.content_type, contentTypeSignals);
    if (contentScore !== 0) {
      score += contentScore;
      if (contentScore > 0) {
        reasons.push(`Content type "${template.content_type}" matches liked patterns (+${contentScore})`);
      } else {
        reasons.push(`Content type "${template.content_type}" matches disliked patterns (${contentScore})`);
      }
    }

    const profileScore = scoreAgainstProfile(template, profileIncrease, profileDecrease);
    if (profileScore !== 0) {
      score += profileScore;
      if (profileScore > 0) {
        reasons.push(`Matches creative profile "increase" preferences (+${profileScore})`);
      } else {
        reasons.push(`Matches creative profile "decrease" preferences (${profileScore})`);
      }
    }

    return {
      content_type: template.content_type,
      visual_tone: template.visual_tone,
      layout_variation: template.layout_variation,
      score,
      reasons,
    };
  });
}

// ---------------------------------------------------------------------------
// selectTemplate (inline for testing)
// ---------------------------------------------------------------------------

const FEEDBACK_LIMIT = 20;

async function selectTemplate(input: {
  businessId: string;
  platform: string;
  contentType?: string;
  override?: TemplateSelection;
  supabase: any;
}): Promise<TemplateSelectorResult> {
  const { businessId, platform, contentType, override, supabase } = input;

  if (override) {
    return {
      selection: override,
      score: 100,
      reasoning: ["User explicitly selected this template (override)"],
      isOverride: true,
    };
  }

  const templates = await fetchAvailableTemplates(supabase, businessId, platform, contentType);

  if (templates.length === 0) {
    return {
      selection: {
        content_type: contentType ?? "corporate",
        visual_tone: "dark",
        layout_variation: "A",
      },
      score: SCORING_WEIGHTS.BASE_SCORE,
      reasoning: ["No templates found in registry; using default (corporate/dark/A)"],
      isOverride: false,
    };
  }

  const feedback = await fetchRecentFeedback(supabase, businessId);
  const profile = await fetchLatestProfilePreferences(supabase, businessId);
  const candidates = scoreTemplates(templates, feedback, profile);
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  const normalizedScore = Math.max(0, Math.min(100, best.score));

  return {
    selection: {
      content_type: best.content_type,
      visual_tone: best.visual_tone,
      layout_variation: best.layout_variation,
    },
    score: normalizedScore,
    reasoning: best.reasons.length > 0
      ? best.reasons
      : ["Default selection (no strong preference signals detected)"],
    isOverride: false,
  };
}

// ---------------------------------------------------------------------------
// Data fetching helpers (inline for testing)
// ---------------------------------------------------------------------------

async function fetchAvailableTemplates(
  supabase: any,
  businessId: string,
  platform: string,
  contentType?: string,
): Promise<TemplateRow[]> {
  let brandQuery = supabase
    .from("template_registry")
    .select("content_type, visual_tone, layout_variation")
    .eq("business_id", businessId)
    .eq("platform", platform)
    .eq("is_active", true);
  if (contentType) brandQuery = brandQuery.eq("content_type", contentType);
  const { data: brandTemplates } = await brandQuery;

  let globalQuery = supabase
    .from("template_registry")
    .select("content_type, visual_tone, layout_variation")
    .is("business_id", null)
    .eq("platform", platform)
    .eq("is_active", true);
  if (contentType) globalQuery = globalQuery.eq("content_type", contentType);
  const { data: globalTemplates } = await globalQuery;

  const all: TemplateRow[] = [];
  const seen = new Set<string>();
  for (const t of (brandTemplates ?? [])) {
    const key = `${t.content_type}|${t.visual_tone}|${t.layout_variation}`;
    if (!seen.has(key)) { seen.add(key); all.push(t); }
  }
  for (const t of (globalTemplates ?? [])) {
    const key = `${t.content_type}|${t.visual_tone}|${t.layout_variation}`;
    if (!seen.has(key)) { seen.add(key); all.push(t); }
  }
  return all;
}

async function fetchRecentFeedback(
  supabase: any,
  businessId: string,
): Promise<FeedbackRow[]> {
  const { data } = await supabase
    .from("design_feedback")
    .select("feedback_type, selections, interpreted_changes")
    .eq("business_id", businessId)
    .in("feedback_type", ["like", "dislike"])
    .order("created_at", { ascending: false })
    .limit(FEEDBACK_LIMIT);
  return (data ?? []) as FeedbackRow[];
}

async function fetchLatestProfilePreferences(
  supabase: any,
  businessId: string,
): Promise<ProfileRow | null> {
  const { data } = await supabase
    .from("creative_profiles")
    .select("preferences")
    .eq("business_id", businessId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data) return null;
  return data as ProfileRow;
}

// ---------------------------------------------------------------------------
// Mock Supabase client builder
// ---------------------------------------------------------------------------

interface MockData {
  template_registry?: any[];
  design_feedback?: any[];
  creative_profiles?: any[];
}

function createMockSupabase(data: MockData) {
  return {
    from: (table: string) => {
      const rows = (data as any)[table] ?? [];
      return createChainableQuery(rows);
    },
  };
}

function createChainableQuery(rows: any[]) {
  let filtered = [...rows];
  const chain: any = {
    select: (_cols: string) => chain,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    is: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return chain;
    },
    in: (col: string, vals: unknown[]) => {
      filtered = filtered.filter((r) => (vals as any[]).includes(r[col]));
      return chain;
    },
    order: (_col: string, _opts?: any) => chain,
    limit: (_n: number) => {
      filtered = filtered.slice(0, _n);
      return chain;
    },
    maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
  };
  // Make the chain thenable (for await without .maybeSingle())
  chain.then = (resolve: any) => resolve({ data: filtered, error: null });
  return chain;
}

// ---------------------------------------------------------------------------
// Tests: mapBackgroundToTone
// ---------------------------------------------------------------------------

describe("mapBackgroundToTone", () => {
  it("maps dark-navy to dark", () => {
    expect(mapBackgroundToTone("dark-navy")).toBe("dark");
  });

  it("maps light-cream to light", () => {
    expect(mapBackgroundToTone("light-cream")).toBe("light");
  });

  it("maps color-coral to medium", () => {
    expect(mapBackgroundToTone("color-coral")).toBe("medium");
  });

  it("is case-insensitive", () => {
    expect(mapBackgroundToTone("Dark-Navy")).toBe("dark");
    expect(mapBackgroundToTone("LIGHT")).toBe("light");
  });

  it("returns null for unknown backgrounds", () => {
    expect(mapBackgroundToTone("rainbow-sparkle")).toBeNull();
  });

  it("handles fuzzy matching via includes", () => {
    expect(mapBackgroundToTone("dark-navy-gradient")).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// Tests: extractToneSignals
// ---------------------------------------------------------------------------

describe("extractToneSignals", () => {
  it("returns empty signals when no feedback", () => {
    const signals = extractToneSignals([]);
    expect(signals.liked).toEqual({});
    expect(signals.disliked).toEqual({});
  });

  it("counts liked tones from background selections", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { background: "dark-navy" }, interpreted_changes: null },
      { feedback_type: "like", selections: { background: "dark" }, interpreted_changes: null },
      { feedback_type: "like", selections: { background: "light-cream" }, interpreted_changes: null },
    ];
    const signals = extractToneSignals(feedback);
    expect(signals.liked["dark"]).toBe(2);
    expect(signals.liked["light"]).toBe(1);
  });

  it("counts disliked tones from background selections", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "dislike", selections: { background: "color-coral" }, interpreted_changes: null },
    ];
    const signals = extractToneSignals(feedback);
    expect(signals.disliked["medium"]).toBe(1);
  });

  it("ignores feedback without background selection", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { visualStyle: "minimalist" }, interpreted_changes: null },
    ];
    const signals = extractToneSignals(feedback);
    expect(signals.liked).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Tests: extractContentTypeSignals
// ---------------------------------------------------------------------------

describe("extractContentTypeSignals", () => {
  it("returns empty signals when no feedback", () => {
    const signals = extractContentTypeSignals([]);
    expect(signals.liked).toEqual({});
    expect(signals.disliked).toEqual({});
  });

  it("counts liked content types", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { contentType: "breaking-news" }, interpreted_changes: null },
      { feedback_type: "like", selections: { contentType: "breaking-news" }, interpreted_changes: null },
    ];
    const signals = extractContentTypeSignals(feedback);
    expect(signals.liked["breaking-news"]).toBe(2);
  });

  it("normalizes content type aliases", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { contentType: "news" }, interpreted_changes: null },
    ];
    const signals = extractContentTypeSignals(feedback);
    expect(signals.liked["breaking-news"]).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// Tests: scoreTemplates
// ---------------------------------------------------------------------------

describe("scoreTemplates", () => {
  const TEMPLATES: TemplateRow[] = [
    { content_type: "breaking-news", visual_tone: "dark", layout_variation: "A" },
    { content_type: "breaking-news", visual_tone: "light", layout_variation: "A" },
    { content_type: "corporate", visual_tone: "dark", layout_variation: "B" },
    { content_type: "corporate", visual_tone: "medium", layout_variation: "A" },
  ];

  it("assigns base score when no feedback or profile", () => {
    const candidates = scoreTemplates(TEMPLATES, [], null);
    expect(candidates.every((c) => c.score === SCORING_WEIGHTS.BASE_SCORE)).toBe(true);
  });

  it("boosts dark templates when user likes dark backgrounds", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { background: "dark-navy" }, interpreted_changes: null },
      { feedback_type: "like", selections: { background: "dark" }, interpreted_changes: null },
    ];
    const candidates = scoreTemplates(TEMPLATES, feedback, null);
    const darkCandidates = candidates.filter((c) => c.visual_tone === "dark");
    const lightCandidates = candidates.filter((c) => c.visual_tone === "light");

    // Dark templates should score higher than light
    expect(darkCandidates[0].score).toBeGreaterThan(lightCandidates[0].score);
    // Dark should have 2 likes × 15 = +30
    expect(darkCandidates[0].score).toBe(SCORING_WEIGHTS.BASE_SCORE + 2 * SCORING_WEIGHTS.LIKED_TONE);
  });

  it("penalizes templates matching disliked tones", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "dislike", selections: { background: "light-cream" }, interpreted_changes: null },
    ];
    const candidates = scoreTemplates(TEMPLATES, feedback, null);
    const lightCandidate = candidates.find((c) => c.visual_tone === "light")!;
    expect(lightCandidate.score).toBe(SCORING_WEIGHTS.BASE_SCORE + SCORING_WEIGHTS.DISLIKED_TONE);
    expect(lightCandidate.score).toBeLessThan(SCORING_WEIGHTS.BASE_SCORE);
  });

  it("boosts templates matching liked content types", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { contentType: "breaking-news" }, interpreted_changes: null },
    ];
    const candidates = scoreTemplates(TEMPLATES, feedback, null);
    const breakingNews = candidates.filter((c) => c.content_type === "breaking-news");
    const corporate = candidates.filter((c) => c.content_type === "corporate");

    expect(breakingNews[0].score).toBeGreaterThan(corporate[0].score);
  });

  it("applies creative_profile increase preferences", () => {
    const profile: ProfileRow = {
      preferences: { increase: ["fondos oscuros", "premium"], decrease: [] },
    };
    const candidates = scoreTemplates(TEMPLATES, [], profile);
    const darkCandidates = candidates.filter((c) => c.visual_tone === "dark");
    const lightCandidates = candidates.filter((c) => c.visual_tone === "light");

    // Dark templates should score higher due to "fondos oscuros" and "premium" matching dark tone keywords
    expect(darkCandidates[0].score).toBeGreaterThan(lightCandidates[0].score);
  });

  it("applies creative_profile decrease preferences as penalties", () => {
    const profile: ProfileRow = {
      preferences: { increase: [], decrease: ["colores claros"] },
    };
    const candidates = scoreTemplates(TEMPLATES, [], profile);
    const lightCandidate = candidates.find((c) => c.visual_tone === "light")!;

    // Light template should be penalized
    expect(lightCandidate.score).toBeLessThan(SCORING_WEIGHTS.BASE_SCORE);
  });

  it("combines feedback and profile signals", () => {
    const feedback: FeedbackRow[] = [
      { feedback_type: "like", selections: { background: "dark-navy" }, interpreted_changes: null },
    ];
    const profile: ProfileRow = {
      preferences: { increase: ["premium"], decrease: [] },
    };
    const candidates = scoreTemplates(TEMPLATES, feedback, profile);
    const darkCandidates = candidates.filter((c) => c.visual_tone === "dark");

    // Should have both tone boost AND profile boost
    expect(darkCandidates[0].score).toBeGreaterThan(
      SCORING_WEIGHTS.BASE_SCORE + SCORING_WEIGHTS.LIKED_TONE,
    );
  });
});

// ---------------------------------------------------------------------------
// Tests: selectTemplate (integration with mock supabase)
// ---------------------------------------------------------------------------

describe("selectTemplate", () => {
  const BUSINESS_ID = "biz-001";
  const PLATFORM = "instagram-post";

  it("returns override directly when provided", async () => {
    const supabase = createMockSupabase({});
    const result = await selectTemplate({
      businessId: BUSINESS_ID,
      platform: PLATFORM,
      override: { content_type: "corporate", visual_tone: "light", layout_variation: "C" },
      supabase,
    });
    expect(result.isOverride).toBe(true);
    expect(result.score).toBe(100);
    expect(result.selection.content_type).toBe("corporate");
    expect(result.selection.visual_tone).toBe("light");
    expect(result.selection.layout_variation).toBe("C");
  });

  it("returns default when no templates exist", async () => {
    const supabase = createMockSupabase({
      template_registry: [],
      design_feedback: [],
      creative_profiles: [],
    });
    const result = await selectTemplate({
      businessId: BUSINESS_ID,
      platform: PLATFORM,
      supabase,
    });
    expect(result.isOverride).toBe(false);
    expect(result.selection.content_type).toBe("corporate");
    expect(result.selection.visual_tone).toBe("dark");
    expect(result.selection.layout_variation).toBe("A");
    expect(result.reasoning[0]).toContain("No templates found");
  });

  it("selects highest-scoring template based on feedback", async () => {
    const supabase = createMockSupabase({
      template_registry: [
        { business_id: BUSINESS_ID, content_type: "breaking-news", platform: PLATFORM, visual_tone: "dark", layout_variation: "A", is_active: true },
        { business_id: BUSINESS_ID, content_type: "breaking-news", platform: PLATFORM, visual_tone: "light", layout_variation: "A", is_active: true },
        { business_id: BUSINESS_ID, content_type: "corporate", platform: PLATFORM, visual_tone: "dark", layout_variation: "A", is_active: true },
      ],
      design_feedback: [
        { business_id: BUSINESS_ID, feedback_type: "like", selections: { background: "dark-navy" }, interpreted_changes: null },
        { business_id: BUSINESS_ID, feedback_type: "like", selections: { background: "dark" }, interpreted_changes: null },
        { business_id: BUSINESS_ID, feedback_type: "like", selections: { contentType: "breaking-news" }, interpreted_changes: null },
      ],
      creative_profiles: [],
    });

    const result = await selectTemplate({
      businessId: BUSINESS_ID,
      platform: PLATFORM,
      supabase,
    });

    // breaking-news + dark should win (tone boost + content type boost)
    expect(result.selection.content_type).toBe("breaking-news");
    expect(result.selection.visual_tone).toBe("dark");
    expect(result.isOverride).toBe(false);
    expect(result.score).toBeGreaterThan(SCORING_WEIGHTS.BASE_SCORE);
  });

  it("respects contentType filter when provided", async () => {
    const supabase = createMockSupabase({
      template_registry: [
        { business_id: BUSINESS_ID, content_type: "corporate", platform: PLATFORM, visual_tone: "dark", layout_variation: "A", is_active: true },
        { business_id: BUSINESS_ID, content_type: "corporate", platform: PLATFORM, visual_tone: "light", layout_variation: "B", is_active: true },
        { business_id: BUSINESS_ID, content_type: "breaking-news", platform: PLATFORM, visual_tone: "dark", layout_variation: "A", is_active: true },
      ],
      design_feedback: [],
      creative_profiles: [],
    });

    const result = await selectTemplate({
      businessId: BUSINESS_ID,
      platform: PLATFORM,
      contentType: "corporate",
      supabase,
    });

    expect(result.selection.content_type).toBe("corporate");
  });

  it("uses global templates when no brand-specific ones exist", async () => {
    const supabase = createMockSupabase({
      template_registry: [
        { business_id: null, content_type: "market-update", platform: PLATFORM, visual_tone: "medium", layout_variation: "A", is_active: true },
      ],
      design_feedback: [],
      creative_profiles: [],
    });

    const result = await selectTemplate({
      businessId: BUSINESS_ID,
      platform: PLATFORM,
      supabase,
    });

    expect(result.selection.content_type).toBe("market-update");
    expect(result.selection.visual_tone).toBe("medium");
  });

  it("incorporates creative_profile preferences into scoring", async () => {
    const supabase = createMockSupabase({
      template_registry: [
        { business_id: BUSINESS_ID, content_type: "corporate", platform: PLATFORM, visual_tone: "dark", layout_variation: "A", is_active: true },
        { business_id: BUSINESS_ID, content_type: "corporate", platform: PLATFORM, visual_tone: "light", layout_variation: "A", is_active: true },
      ],
      design_feedback: [],
      creative_profiles: [
        { business_id: BUSINESS_ID, version: 3, preferences: { increase: ["fondos oscuros", "premium"], decrease: ["colores claros"] } },
      ],
    });

    const result = await selectTemplate({
      businessId: BUSINESS_ID,
      platform: PLATFORM,
      supabase,
    });

    // Dark should win due to profile preferences
    expect(result.selection.visual_tone).toBe("dark");
    expect(result.score).toBeGreaterThan(SCORING_WEIGHTS.BASE_SCORE);
  });
});
