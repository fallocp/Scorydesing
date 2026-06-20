/**
 * Intelligent Template Selector
 *
 * Chooses the best template (content_type, visual_tone, layout_variation)
 * based on creative_profile preferences and recent design feedback.
 *
 * Scoring is simple and deterministic (no AI needed):
 * 1. Query available templates for the business (brand-specific + global)
 * 2. Query recent feedback (likes/dislikes) to understand preferences
 * 3. Score each template based on:
 *    - Liked visual_tone patterns (background selections → visual_tone mapping)
 *    - Liked content_type patterns
 *    - Creative profile preferences (increase/decrease arrays)
 * 4. Return the best-scoring template params with score and reasoning
 *
 * Requirements: Property 5 (Template consistency)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TemplateSelectorInput {
  /** Business ID — all data is scoped to this tenant */
  businessId: string;
  /** Target platform (instagram-story, linkedin-post, etc.) */
  platform: string;
  /** Optional content_type override — if provided, skips content_type scoring */
  contentType?: string;
  /** Optional explicit override — if provided, returns it directly without scoring */
  override?: TemplateSelection;
  /** Supabase client (service_role for Edge Functions) */
  supabase: SupabaseClient;
}

export interface TemplateSelection {
  content_type: string;
  visual_tone: string;
  layout_variation: string;
}

export interface TemplateSelectorResult {
  /** The selected template parameters */
  selection: TemplateSelection;
  /** Score (0-100) indicating confidence in the selection */
  score: number;
  /** Human-readable reasoning for the selection */
  reasoning: string[];
  /** Whether this was an explicit user override */
  isOverride: boolean;
}

/** Internal type for scoring candidates */
interface TemplateCandidate {
  content_type: string;
  visual_tone: string;
  layout_variation: string;
  score: number;
  reasons: string[];
}

/** Row from template_registry query */
interface TemplateRow {
  content_type: string;
  visual_tone: string;
  layout_variation: string;
}

/** Row from design_feedback query */
interface FeedbackRow {
  feedback_type: string;
  selections: Record<string, unknown> | null;
  interpreted_changes: { increase?: string[]; decrease?: string[] } | null;
}

/** Row from creative_profiles query */
interface ProfileRow {
  preferences: { increase?: string[]; decrease?: string[] };
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Maps background selection values from design_feedback.selections.background
 * to visual_tone values in template_registry.
 */
export const BACKGROUND_TO_TONE_MAP: Record<string, string> = {
  // Dark backgrounds → dark tone
  "dark-navy": "dark",
  "dark": "dark",
  "navy": "dark",
  "black": "dark",
  "midnight": "dark",
  // Light backgrounds → light tone
  "light-cream": "light",
  "light": "light",
  "cream": "light",
  "white": "light",
  "beige": "light",
  // Medium/vibrant backgrounds → medium tone
  "color-coral": "medium",
  "coral": "medium",
  "color-turquoise": "medium",
  "turquoise": "medium",
  "gradient": "medium",
  "mesh": "medium",
  "vibrant": "medium",
};

/** Scoring weights for different signal types */
export const SCORING_WEIGHTS = {
  /** Points for matching a liked visual_tone */
  LIKED_TONE: 15,
  /** Points for matching a liked content_type */
  LIKED_CONTENT_TYPE: 10,
  /** Points for matching a creative_profile increase preference */
  PROFILE_INCREASE: 12,
  /** Penalty for matching a disliked visual_tone */
  DISLIKED_TONE: -15,
  /** Penalty for matching a disliked content_type */
  DISLIKED_CONTENT_TYPE: -10,
  /** Penalty for matching a creative_profile decrease preference */
  PROFILE_DECREASE: -12,
  /** Base score for all candidates (ensures non-negative results) */
  BASE_SCORE: 50,
};

/** Max feedback rows to query */
const FEEDBACK_LIMIT = 20;

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Select the best-matching template for a business based on learned preferences.
 *
 * If an explicit override is provided, returns it directly.
 * Otherwise, scores all available templates and returns the highest-scoring one.
 */
export async function selectTemplate(
  input: TemplateSelectorInput,
): Promise<TemplateSelectorResult> {
  const { businessId, platform, contentType, override, supabase } = input;

  // --- Handle explicit override ---
  if (override) {
    return {
      selection: override,
      score: 100,
      reasoning: ["User explicitly selected this template (override)"],
      isOverride: true,
    };
  }

  // --- 1. Query available templates for this business + global ---
  const templates = await fetchAvailableTemplates(supabase, businessId, platform, contentType);

  if (templates.length === 0) {
    // Fallback: return sensible defaults
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

  // --- 2. Query recent feedback (likes/dislikes) ---
  const feedback = await fetchRecentFeedback(supabase, businessId);

  // --- 3. Query creative_profile preferences ---
  const profile = await fetchLatestProfilePreferences(supabase, businessId);

  // --- 4. Score each template ---
  const candidates = scoreTemplates(templates, feedback, profile);

  // --- 5. Select the best candidate ---
  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];

  // Normalize score to 0-100 range
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
// Data fetching (brand-isolated)
// ---------------------------------------------------------------------------

/**
 * Fetch available templates for a business (brand-specific + global/starter).
 * Filters by platform and optionally by content_type.
 */
async function fetchAvailableTemplates(
  supabase: SupabaseClient,
  businessId: string,
  platform: string,
  contentType?: string,
): Promise<TemplateRow[]> {
  // Query brand-specific templates
  let brandQuery = supabase
    .from("template_registry")
    .select("content_type, visual_tone, layout_variation")
    .eq("business_id", businessId)
    .eq("platform", platform)
    .eq("is_active", true);

  if (contentType) {
    brandQuery = brandQuery.eq("content_type", contentType);
  }

  const { data: brandTemplates } = await brandQuery;

  // Query global/starter templates (business_id IS NULL)
  let globalQuery = supabase
    .from("template_registry")
    .select("content_type, visual_tone, layout_variation")
    .is("business_id", null)
    .eq("platform", platform)
    .eq("is_active", true);

  if (contentType) {
    globalQuery = globalQuery.eq("content_type", contentType);
  }

  const { data: globalTemplates } = await globalQuery;

  // Combine: brand-specific first, then global (brand takes priority)
  const all: TemplateRow[] = [];
  const seen = new Set<string>();

  for (const t of (brandTemplates ?? [])) {
    const key = `${t.content_type}|${t.visual_tone}|${t.layout_variation}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(t);
    }
  }

  for (const t of (globalTemplates ?? [])) {
    const key = `${t.content_type}|${t.visual_tone}|${t.layout_variation}`;
    if (!seen.has(key)) {
      seen.add(key);
      all.push(t);
    }
  }

  return all;
}

/**
 * Fetch recent design feedback (likes and dislikes) for the business.
 */
async function fetchRecentFeedback(
  supabase: SupabaseClient,
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

/**
 * Fetch the latest creative_profile preferences for the business.
 */
async function fetchLatestProfilePreferences(
  supabase: SupabaseClient,
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
// Scoring logic
// ---------------------------------------------------------------------------

/**
 * Score all template candidates against feedback and profile preferences.
 * Returns candidates sorted by score (highest first).
 */
export function scoreTemplates(
  templates: TemplateRow[],
  feedback: FeedbackRow[],
  profile: ProfileRow | null,
): TemplateCandidate[] {
  // --- Extract preference signals from feedback ---
  const toneSignals = extractToneSignals(feedback);
  const contentTypeSignals = extractContentTypeSignals(feedback);

  // --- Extract profile preferences ---
  const profileIncrease = profile?.preferences?.increase ?? [];
  const profileDecrease = profile?.preferences?.decrease ?? [];

  // --- Score each template ---
  return templates.map((template) => {
    let score = SCORING_WEIGHTS.BASE_SCORE;
    const reasons: string[] = [];

    // Score visual_tone based on feedback
    const toneScore = scoreTone(template.visual_tone, toneSignals);
    if (toneScore !== 0) {
      score += toneScore;
      if (toneScore > 0) {
        reasons.push(`Visual tone "${template.visual_tone}" matches liked patterns (+${toneScore})`);
      } else {
        reasons.push(`Visual tone "${template.visual_tone}" matches disliked patterns (${toneScore})`);
      }
    }

    // Score content_type based on feedback
    const contentScore = scoreContentType(template.content_type, contentTypeSignals);
    if (contentScore !== 0) {
      score += contentScore;
      if (contentScore > 0) {
        reasons.push(`Content type "${template.content_type}" matches liked patterns (+${contentScore})`);
      } else {
        reasons.push(`Content type "${template.content_type}" matches disliked patterns (${contentScore})`);
      }
    }

    // Score against creative_profile preferences
    const profileScore = scoreAgainstProfile(
      template,
      profileIncrease,
      profileDecrease,
    );
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
// Signal extraction
// ---------------------------------------------------------------------------

interface ToneSignals {
  liked: Record<string, number>;   // tone → count of likes
  disliked: Record<string, number>; // tone → count of dislikes
}

interface ContentTypeSignals {
  liked: Record<string, number>;
  disliked: Record<string, number>;
}

/**
 * Extract visual_tone preference signals from feedback.
 * Maps background selections to tone values using BACKGROUND_TO_TONE_MAP.
 */
export function extractToneSignals(feedback: FeedbackRow[]): ToneSignals {
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

/**
 * Extract content_type preference signals from feedback.
 * Maps contentType selections to template content_type values.
 */
export function extractContentTypeSignals(feedback: FeedbackRow[]): ContentTypeSignals {
  const signals: ContentTypeSignals = { liked: {}, disliked: {} };

  for (const row of feedback) {
    const contentType = row.selections?.contentType as string | undefined;
    if (!contentType) continue;

    // Normalize content type (feedback may use slightly different naming)
    const normalized = normalizeContentType(contentType);

    if (row.feedback_type === "like") {
      signals.liked[normalized] = (signals.liked[normalized] ?? 0) + 1;
    } else if (row.feedback_type === "dislike") {
      signals.disliked[normalized] = (signals.disliked[normalized] ?? 0) + 1;
    }
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Scoring helpers
// ---------------------------------------------------------------------------

/**
 * Score a visual_tone against extracted tone signals.
 * More likes = higher score, more dislikes = lower score.
 */
function scoreTone(tone: string, signals: ToneSignals): number {
  const likeCount = signals.liked[tone] ?? 0;
  const dislikeCount = signals.disliked[tone] ?? 0;

  return (likeCount * SCORING_WEIGHTS.LIKED_TONE) +
    (dislikeCount * SCORING_WEIGHTS.DISLIKED_TONE);
}

/**
 * Score a content_type against extracted content type signals.
 */
function scoreContentType(contentType: string, signals: ContentTypeSignals): number {
  const likeCount = signals.liked[contentType] ?? 0;
  const dislikeCount = signals.disliked[contentType] ?? 0;

  return (likeCount * SCORING_WEIGHTS.LIKED_CONTENT_TYPE) +
    (dislikeCount * SCORING_WEIGHTS.DISLIKED_CONTENT_TYPE);
}

/**
 * Score a template against creative_profile increase/decrease arrays.
 * Checks if the template's tone, content_type, or layout matches any preference keywords.
 */
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

  // Check increase preferences
  for (const pref of increase) {
    const prefLower = pref.toLowerCase();
    for (const term of templateTerms) {
      if (prefLower.includes(term) || term.includes(prefLower)) {
        score += SCORING_WEIGHTS.PROFILE_INCREASE;
        break; // Only count once per preference
      }
    }
    // Also check tone-related keywords
    if (matchesToneKeyword(prefLower, template.visual_tone)) {
      score += SCORING_WEIGHTS.PROFILE_INCREASE;
    }
  }

  // Check decrease preferences
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

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

/**
 * Map a background selection value to a visual_tone.
 * Returns null if no mapping is found.
 */
export function mapBackgroundToTone(background: string): string | null {
  // Direct lookup
  const direct = BACKGROUND_TO_TONE_MAP[background.toLowerCase()];
  if (direct) return direct;

  // Fuzzy match: check if background contains a known key
  const bgLower = background.toLowerCase();
  for (const [key, tone] of Object.entries(BACKGROUND_TO_TONE_MAP)) {
    if (bgLower.includes(key) || key.includes(bgLower)) {
      return tone;
    }
  }

  return null;
}

/**
 * Normalize content type from feedback selections to template_registry values.
 */
function normalizeContentType(raw: string): string {
  // Already in correct format
  const valid = [
    "breaking-news", "corporate", "market-update",
    "stat-of-the-day", "event-special",
  ];
  const lower = raw.toLowerCase().replace(/\s+/g, "-");
  if (valid.includes(lower)) return lower;

  // Common aliases
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

/**
 * Check if a preference keyword relates to a specific visual_tone.
 * E.g., "fondos oscuros" → matches "dark", "colores claros" → matches "light"
 */
function matchesToneKeyword(keyword: string, tone: string): boolean {
  const toneKeywords: Record<string, string[]> = {
    dark: ["oscuro", "dark", "navy", "negro", "nocturno", "premium"],
    light: ["claro", "light", "cream", "blanco", "limpio", "profesional"],
    medium: ["vibrante", "coral", "turquesa", "gradiente", "mesh", "colorido"],
  };

  const keywords = toneKeywords[tone] ?? [];
  return keywords.some((k) => keyword.includes(k));
}
