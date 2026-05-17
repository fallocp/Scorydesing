import type { ComplianceRules } from '@/schemas/campaign/complianceRules.schema';

/**
 * Represents a single compliance violation found in copy text.
 */
export interface ComplianceViolation {
  type: 'forbidden_term';
  /** The forbidden term that was matched. */
  term: string;
  /** Character index where the term was found in the copy. */
  position: number;
}

/**
 * Validates marketing copy against a Business_Tenant's compliance rules.
 *
 * Performs case-insensitive matching of each forbidden term against the copy
 * text and returns all violations with their positions. This is the
 * tenant-agnostic replacement for the hardcoded `validateBrandCompliance`
 * function — rules come from the database, not from code.
 *
 * @param copy - The marketing copy text to validate
 * @param rules - The ComplianceRules loaded from the business tenant config
 * @returns Array of ComplianceViolation objects (empty if copy is compliant)
 */
export function validateCompliance(
  copy: string,
  rules: ComplianceRules
): ComplianceViolation[] {
  const violations: ComplianceViolation[] = [];
  const lowerCopy = copy.toLowerCase();

  for (const term of rules.forbidden_terms) {
    if (term.length === 0) continue;

    const lowerTerm = term.toLowerCase();
    let searchFrom = 0;

    while (searchFrom < lowerCopy.length) {
      const index = lowerCopy.indexOf(lowerTerm, searchFrom);
      if (index === -1) break;

      violations.push({
        type: 'forbidden_term',
        term,
        position: index,
      });

      // Advance past this match to find subsequent occurrences
      searchFrom = index + lowerTerm.length;
    }
  }

  return violations;
}
