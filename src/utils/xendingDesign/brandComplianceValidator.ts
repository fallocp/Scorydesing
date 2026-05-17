import type { Brand } from '@/types/xendingDesign';
import { getBrandConfig, XENDING_QUALIFIER_RULES } from './brandConfig';

export interface ComplianceResult {
  valid: boolean;
  violations: string[];
}

/**
 * Absolute guarantee words that require "hasta" or "hábil" qualifiers
 * when used in Xending brand copy.
 */
const ABSOLUTE_GUARANTEE_WORDS = [
  'garantizado',
  'garantizamos',
  'siempre',
  '100%',
  'asegurado',
  'seguro',
];

/**
 * Maximum allowed plazo in days for Xending Capital.
 */
const MAX_PLAZO_DAYS = 45;

/**
 * Checks whether a qualifier word ("hasta" or "hábil") appears near
 * the given position in the text. "Nearby" is defined as within
 * a window of characters around the match.
 */
function hasNearbyQualifier(text: string, matchIndex: number, matchLength: number): boolean {
  const windowSize = 40;
  const start = Math.max(0, matchIndex - windowSize);
  const end = Math.min(text.length, matchIndex + matchLength + windowSize);
  const surrounding = text.slice(start, end).toLowerCase();

  return XENDING_QUALIFIER_RULES.requiredQualifiers.some((q) =>
    surrounding.includes(q)
  );
}

/**
 * Checks for forbidden terms in copy for Xending Capital.
 * Returns violation descriptions for each forbidden term found.
 */
function checkForbiddenTerms(copy: string, forbiddenTerms: string[]): string[] {
  const violations: string[] = [];
  const lowerCopy = copy.toLowerCase();

  for (const term of forbiddenTerms) {
    if (lowerCopy.includes(term.toLowerCase())) {
      violations.push(`Término prohibido: '${term}'`);
    }
  }

  return violations;
}

/**
 * Checks for plazo values exceeding the maximum allowed days for Xending Capital.
 * Detects patterns like "plazo de 60 días", "plazos de 90 días", "plazo 50 días", etc.
 */
function checkPlazoExceeded(copy: string): string[] {
  const violations: string[] = [];
  const plazoPattern = /plazos?\s+(?:de\s+)?(\d+)\s*d[ií]as?/gi;

  let match: RegExpExecArray | null;
  while ((match = plazoPattern.exec(copy)) !== null) {
    const days = parseInt(match[1], 10);
    if (days > MAX_PLAZO_DAYS) {
      violations.push(
        `Plazo excede máximo permitido: ${days} días (máximo ${MAX_PLAZO_DAYS} días)`
      );
    }
  }

  return violations;
}

/**
 * Checks for absolute guarantee words without nearby "hasta" or "hábil" qualifiers
 * in Xending brand copy.
 */
function checkAbsoluteGuarantees(copy: string): string[] {
  const violations: string[] = [];
  const lowerCopy = copy.toLowerCase();

  for (const word of ABSOLUTE_GUARANTEE_WORDS) {
    const lowerWord = word.toLowerCase();
    // Escape special regex characters (for "100%")
    const escaped = lowerWord.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escaped, 'gi');

    let match: RegExpExecArray | null;
    while ((match = pattern.exec(lowerCopy)) !== null) {
      if (!hasNearbyQualifier(copy, match.index, match[0].length)) {
        violations.push(
          `Garantía absoluta sin calificador: '${word}' requiere "hasta" o "hábil" cercano`
        );
        // Only report once per word
        break;
      }
    }
  }

  return violations;
}

/**
 * Validates brand compliance for marketing copy.
 *
 * For Xending Capital:
 * - Checks if copy contains any forbidden terms (case-insensitive)
 * - Checks if any mentioned plazo exceeds 45 days
 *
 * For Xending:
 * - Checks if copy contains absolute guarantee words without "hasta" or "hábil" nearby
 *
 * @param copy - The marketing copy text to validate
 * @param brand - The brand to validate against
 * @returns ComplianceResult with valid flag and list of violation descriptions
 */
export function validateBrandCompliance(
  copy: string,
  brand: Brand
): ComplianceResult {
  const config = getBrandConfig(brand);
  const violations: string[] = [];

  if (brand === 'xending_capital') {
    // Check forbidden terms
    violations.push(...checkForbiddenTerms(copy, config.forbiddenTerms));

    // Check plazo exceeding 45 days
    violations.push(...checkPlazoExceeded(copy));
  }

  if (brand === 'xending') {
    // Check absolute guarantees without qualifiers
    violations.push(...checkAbsoluteGuarantees(copy));
  }

  return {
    valid: violations.length === 0,
    violations,
  };
}
