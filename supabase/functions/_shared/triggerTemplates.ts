/**
 * Trigger Templates — Pre-configured Quick Fire Shortcuts
 *
 * Provides utilities for the quick-fire Edge Function to resolve
 * trigger templates as pre-configured shortcuts for reactive content.
 *
 * Each trigger template defines:
 * - What content type to use (breaking-news, market-update, etc.)
 * - What angle/approach to take (cobertura, velocidad, etc.)
 * - A copy template with {{placeholders}} for dynamic data
 * - Which platforms to auto-generate for
 * - What image strategy to apply
 *
 * Requirements: Property 1 (Tenant isolation) — all queries scoped by business_id
 */

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.53.0";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TriggerTemplate {
  id: string;
  name: string;
  content_type: string;
  default_angle: string;
  copy_template: CopyTemplate;
  auto_platforms: string[];
  image_strategy: ImageStrategy;
  is_active: boolean;
}

export interface CopyTemplate {
  headline_pattern: string;
  subcopy_pattern: string;
  cta: string;
}

export type ImageStrategy = "use_provided" | "generate_new" | "use_stock";

export interface TriggerMatch {
  /** The matched trigger template */
  trigger: TriggerTemplate;
  /** Confidence score (0-1) of the match */
  confidence: number;
  /** Reason for the match */
  reason: string;
}

// ---------------------------------------------------------------------------
// Main functions
// ---------------------------------------------------------------------------

/**
 * List all active trigger templates for a business.
 * Used by the Quick Fire UI to show available shortcuts.
 */
export async function listTriggerTemplates(
  supabase: SupabaseClient,
  businessId: string,
): Promise<TriggerTemplate[]> {
  const { data, error } = await supabase
    .from("trigger_templates")
    .select("id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy, is_active")
    .eq("business_id", businessId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  if (error) {
    console.error("[triggerTemplates] Error fetching templates:", error.message);
    return [];
  }

  return (data ?? []) as TriggerTemplate[];
}

/**
 * Find the best matching trigger template for a given text input.
 * Uses keyword matching against trigger names to find pre-configured shortcuts.
 *
 * Returns null if no trigger matches with sufficient confidence.
 */
export async function matchTriggerTemplate(
  supabase: SupabaseClient,
  businessId: string,
  inputText: string,
): Promise<TriggerMatch | null> {
  const templates = await listTriggerTemplates(supabase, businessId);

  if (templates.length === 0) return null;

  const normalizedInput = inputText.toLowerCase().trim();
  let bestMatch: TriggerMatch | null = null;

  for (const trigger of templates) {
    const confidence = computeMatchConfidence(normalizedInput, trigger.name);

    if (confidence > 0.3 && (!bestMatch || confidence > bestMatch.confidence)) {
      bestMatch = {
        trigger,
        confidence,
        reason: `Input "${inputText}" matches trigger "${trigger.name}" (confidence: ${(confidence * 100).toFixed(0)}%)`,
      };
    }
  }

  return bestMatch;
}

/**
 * Get a specific trigger template by ID.
 * Returns null if not found or not accessible.
 */
export async function getTriggerTemplate(
  supabase: SupabaseClient,
  businessId: string,
  triggerId: string,
): Promise<TriggerTemplate | null> {
  const { data, error } = await supabase
    .from("trigger_templates")
    .select("id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy, is_active")
    .eq("business_id", businessId)
    .eq("id", triggerId)
    .maybeSingle();

  if (error || !data) return null;
  return data as TriggerTemplate;
}

/**
 * Interpolate a copy template with provided variables.
 * Replaces {{placeholder}} patterns with actual values.
 *
 * Example:
 *   pattern: "USD/MXN {{valor}} — {{direccion}}"
 *   vars: { valor: "18.50", direccion: "al alza" }
 *   result: "USD/MXN 18.50 — al alza"
 */
export function interpolateCopyTemplate(
  template: CopyTemplate,
  vars: Record<string, string>,
): { headline: string; subcopy: string; cta: string } {
  return {
    headline: interpolate(template.headline_pattern, vars),
    subcopy: interpolate(template.subcopy_pattern, vars),
    cta: template.cta, // CTA is typically static
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Compute match confidence between user input and a trigger name.
 * Uses token overlap and substring matching.
 *
 * Returns a value between 0 and 1.
 */
function computeMatchConfidence(normalizedInput: string, triggerName: string): number {
  const normalizedTrigger = triggerName.toLowerCase().trim();

  // Exact match
  if (normalizedInput === normalizedTrigger) return 1.0;

  // Input contains the full trigger name
  if (normalizedInput.includes(normalizedTrigger)) return 0.9;

  // Trigger name contains the full input
  if (normalizedTrigger.includes(normalizedInput) && normalizedInput.length > 3) return 0.8;

  // Token overlap scoring
  const inputTokens = tokenize(normalizedInput);
  const triggerTokens = tokenize(normalizedTrigger);

  if (triggerTokens.length === 0) return 0;

  let matchedTokens = 0;
  for (const triggerToken of triggerTokens) {
    if (inputTokens.some((inputToken) => inputToken.includes(triggerToken) || triggerToken.includes(inputToken))) {
      matchedTokens++;
    }
  }

  const tokenOverlap = matchedTokens / triggerTokens.length;

  // Require at least 50% token overlap for a meaningful match
  if (tokenOverlap < 0.5) return 0;

  return tokenOverlap * 0.7; // Scale to max 0.7 for token-based matches
}

/**
 * Tokenize a string into meaningful words (removes stopwords).
 */
function tokenize(text: string): string[] {
  const stopwords = new Set(["de", "se", "el", "la", "los", "las", "un", "una", "del", "al", "en", "con", "por", "para", "que", "es"]);
  return text
    .split(/\s+/)
    .filter((token) => token.length > 1 && !stopwords.has(token));
}

/**
 * Replace {{placeholder}} patterns in a string with values from vars.
 * Unmatched placeholders are left as-is.
 */
function interpolate(pattern: string, vars: Record<string, string>): string {
  return pattern.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return vars[key] ?? match;
  });
}
