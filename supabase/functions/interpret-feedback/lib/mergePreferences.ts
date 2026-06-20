/**
 * Merges new preference items into an existing array.
 *
 * - Deduplicates by case-insensitive comparison
 * - Caps total at maxItems (keeps most recent)
 *
 * Requirements: Property 1 (Tenant isolation) — part of feedback interpretation pipeline
 */

/**
 * Merge new preference items into existing array.
 * Deduplicates (case-insensitive) and caps at maxItems.
 */
export function mergePreferenceArrays(
  existing: string[],
  newItems: string[],
  maxItems = 20,
): string[] {
  const merged = [...existing];
  for (const item of newItems) {
    const alreadyExists = merged.some(
      (m) => m.toLowerCase().trim() === item.toLowerCase().trim(),
    );
    if (!alreadyExists) {
      merged.push(item);
    }
  }
  // Cap at maxItems (most recent additions are at the end)
  return merged.slice(-maxItems);
}
