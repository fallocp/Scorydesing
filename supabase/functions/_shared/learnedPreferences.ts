/**
 * Learned Preferences — Query & Build Prompt Section
 *
 * Queries recent design_feedback for a business and builds a structured
 * "PREFERENCIAS APRENDIDAS" section to inject into mockup generation prompts.
 *
 * Respects brand isolation: only reads feedback from the given business_id.
 *
 * Requirements: Property 7 (Brand isolation in templates), Property 1 (Tenant isolation)
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LearnedPreferences {
  prefer: string[];
  avoid: string[];
}

/** Configuration for how many feedback items to query */
export const FEEDBACK_QUERY_LIMITS = {
  likes: 10,
  dislikes: 10,
  chat: 10,
};

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Query recent design_feedback for a business and build structured preferences.
 * Respects brand isolation: only reads feedback from the given business_id.
 */
export async function fetchLearnedPreferences(
  supabase: SupabaseClient,
  businessId: string,
): Promise<LearnedPreferences> {
  const preferences: LearnedPreferences = { prefer: [], avoid: [] };

  try {
    // Query recent likes — extract selections and prompt patterns
    const { data: likes } = await supabase
      .from("design_feedback")
      .select("selections, prompt_used, interpreted_changes")
      .eq("business_id", businessId)
      .eq("feedback_type", "like")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_QUERY_LIMITS.likes);

    // Query recent dislikes — extract what to avoid
    const { data: dislikes } = await supabase
      .from("design_feedback")
      .select("selections, prompt_used, interpreted_changes")
      .eq("business_id", businessId)
      .eq("feedback_type", "dislike")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_QUERY_LIMITS.dislikes);

    // Query recent chat feedback — extract interpreted_changes
    const { data: chatFeedback } = await supabase
      .from("design_feedback")
      .select("message, interpreted_changes")
      .eq("business_id", businessId)
      .eq("feedback_type", "chat")
      .order("created_at", { ascending: false })
      .limit(FEEDBACK_QUERY_LIMITS.chat);

    // --- Build PREFER list from likes ---
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
        const changes = like.interpreted_changes as {
          increase?: string[];
          decrease?: string[];
        } | null;
        if (changes?.increase) {
          for (const item of changes.increase) likedStyles.add(item);
        }
      }
      preferences.prefer.push(...Array.from(likedStyles));
    }

    // --- Build AVOID list from dislikes ---
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
        const changes = dislike.interpreted_changes as {
          increase?: string[];
          decrease?: string[];
        } | null;
        if (changes?.decrease) {
          for (const item of changes.decrease) dislikedPatterns.add(item);
        }
      }
      preferences.avoid.push(...Array.from(dislikedPatterns));
    }

    // --- Merge chat feedback interpreted_changes ---
    if (chatFeedback && chatFeedback.length > 0) {
      const chatPrefer = new Set<string>();
      const chatAvoid = new Set<string>();
      for (const chat of chatFeedback) {
        const changes = chat.interpreted_changes as {
          increase?: string[];
          decrease?: string[];
        } | null;
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

    // Deduplicate
    preferences.prefer = [...new Set(preferences.prefer)];
    preferences.avoid = [...new Set(preferences.avoid)];
  } catch (err) {
    // Non-fatal: if preferences can't be loaded, continue without them
    console.warn("Failed to fetch learned preferences:", err);
  }

  return preferences;
}

// ---------------------------------------------------------------------------
// Prompt Section Builder
// ---------------------------------------------------------------------------

/**
 * Build the "PREFERENCIAS APRENDIDAS" prompt section from learned preferences.
 * Returns empty string if no preferences are available.
 */
export function buildLearnedPreferencesSection(
  preferences: LearnedPreferences,
): string {
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
