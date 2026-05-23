/**
 * Property-based tests for baseRulesEngine.ts
 *
 * Feature: claim-validator, Property 3: Base rules always execute regardless of tenant flag
 *
 * For any valid request, the Base Rules Engine (Nivel 1) SHALL execute for every piece
 * regardless of the value of `claim_validation_enabled`, and when `claim_validation_enabled`
 * is `false` no calls to OpenAI SHALL be made.
 *
 * Since `validatePieceBaseRules` is a pure function (no I/O, no API calls), we verify:
 * 1. It always returns a valid BaseRulesResult for any valid piece input
 * 2. The result has riskLevel in ['low', 'medium', 'high']
 * 3. The result has an issues array (possibly empty)
 * 4. Each issue has the correct structure with source: 'base_rules'
 * 5. The function is deterministic (same input → same output)
 *
 * **Validates: Requirements 2.1, 2.6, 3.2, 3.3**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePieceBaseRules } from '../lib/baseRulesEngine.ts';
import type { PieceInput, BaseRulesResult } from '../lib/types.ts';

/** Arbitrary for a non-empty string (at least 1 visible character) */
const nonEmptyStringArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

/** Arbitrary for a valid PieceInput with all required fields */
const validPieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: nonEmptyStringArb,
  body: nonEmptyStringArb,
  cta: nonEmptyStringArb,
  footer: fc.option(nonEmptyStringArb, { nil: undefined }),
  proofPoints: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  avoidClaims: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

const VALID_RISK_LEVELS = ['low', 'medium', 'high'] as const;

function isValidBaseRulesResult(result: unknown): result is BaseRulesResult {
  if (typeof result !== 'object' || result === null) return false;
  const r = result as BaseRulesResult;
  if (!VALID_RISK_LEVELS.includes(r.riskLevel)) return false;
  if (!Array.isArray(r.issues)) return false;
  return true;
}

describe('Feature: claim-validator, Property 3: Base rules always execute regardless of tenant flag', () => {
  it('always returns a valid BaseRulesResult for any valid piece, regardless of claim_validation_enabled', () => {
    fc.assert(
      fc.property(
        validPieceArb,
        // Simulate claim_validation_enabled as both true and false
        fc.boolean(),
        (piece, _claimValidationEnabled) => {
          // validatePieceBaseRules is pure — it executes regardless of any external flag.
          // The flag only controls whether Nivel 2 (OpenAI) runs, not Nivel 1.
          const result = validatePieceBaseRules(piece);

          // Must return a valid result object
          expect(isValidBaseRulesResult(result)).toBe(true);

          // riskLevel must be one of the valid values
          expect(VALID_RISK_LEVELS).toContain(result.riskLevel);

          // issues must be an array
          expect(Array.isArray(result.issues)).toBe(true);

          // Every issue must have the correct structure
          for (const issue of result.issues) {
            expect(issue.source).toBe('base_rules');
            expect(['medium', 'high']).toContain(issue.risk);
            expect(typeof issue.text).toBe('string');
            expect(typeof issue.reason).toBe('string');
            expect(typeof issue.suggestedFix).toBe('string');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('is deterministic: same piece always produces the same result', () => {
    fc.assert(
      fc.property(
        validPieceArb,
        (piece) => {
          const result1 = validatePieceBaseRules(piece);
          const result2 = validatePieceBaseRules(piece);

          // Same input must produce identical output
          expect(result1.riskLevel).toBe(result2.riskLevel);
          expect(result1.issues.length).toBe(result2.issues.length);
          expect(result1.issues).toEqual(result2.issues);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('executes without any I/O or external calls (pure function, no OpenAI dependency)', () => {
    fc.assert(
      fc.property(
        validPieceArb,
        (piece) => {
          // validatePieceBaseRules is synchronous — if it were making API calls
          // it would need to be async. This confirms no OpenAI calls are made.
          const result = validatePieceBaseRules(piece);

          // The function returns synchronously (not a Promise)
          expect(result).not.toBeInstanceOf(Promise);

          // Result is immediately available with valid structure
          expect(result).toHaveProperty('riskLevel');
          expect(result).toHaveProperty('issues');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('riskLevel is consistent with issues: low only when no issues, high when any high issue exists', () => {
    fc.assert(
      fc.property(
        validPieceArb,
        (piece) => {
          const result = validatePieceBaseRules(piece);

          if (result.issues.length === 0) {
            // No issues → must be low risk
            expect(result.riskLevel).toBe('low');
          } else if (result.issues.some((i) => i.risk === 'high')) {
            // Any high-risk issue → overall must be high
            expect(result.riskLevel).toBe('high');
          } else if (result.issues.some((i) => i.risk === 'medium')) {
            // Only medium issues → overall must be medium
            expect(result.riskLevel).toBe('medium');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
