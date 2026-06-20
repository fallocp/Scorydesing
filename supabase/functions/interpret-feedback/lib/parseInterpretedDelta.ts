/**
 * Parses OpenAI response content into a structured {increase, decrease} delta.
 *
 * Handles:
 * - Clean JSON responses
 * - JSON wrapped in markdown code blocks
 * - Malformed responses (returns empty arrays)
 *
 * Requirements: Property 1 (Tenant isolation) — part of feedback interpretation pipeline
 */

export interface InterpretedDelta {
  increase: string[];
  decrease: string[];
}

/**
 * Parse AI response into structured delta.
 * Extracts JSON from potentially wrapped content, validates structure,
 * and caps arrays at maxItems.
 */
export function parseInterpretedDelta(
  content: string,
  maxItems = 5,
): InterpretedDelta {
  // Try to extract JSON from the response (handle potential markdown wrapping)
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { increase: [], decrease: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]);
    const increase = Array.isArray(parsed.increase)
      ? parsed.increase.filter((i: unknown) => typeof i === "string").slice(0, maxItems)
      : [];
    const decrease = Array.isArray(parsed.decrease)
      ? parsed.decrease.filter((i: unknown) => typeof i === "string").slice(0, maxItems)
      : [];
    return { increase, decrease };
  } catch {
    return { increase: [], decrease: [] };
  }
}
