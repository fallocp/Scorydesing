/**
 * Branch name normalization utility.
 *
 * Used by the deduplication migration and UI validation to identify
 * duplicate branches by comparing normalized names.
 *
 * Normalization steps:
 * 1. Trim leading/trailing whitespace
 * 2. Lowercase
 * 3. Remove accents (NFD decomposition + strip combining marks)
 * 4. Collapse multiple whitespace characters into a single space
 */
export function normalizeBranchName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}
