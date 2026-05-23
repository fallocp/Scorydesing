/**
 * Property-based tests for Result Aggregator — validationLevel correctness
 *
 * Feature: claim-validator, Property 5: validationLevel reflects executed levels
 *
 * For any response, `validationLevel` SHALL be 'base' if and only if
 * `claim_validation_enabled` is false, and 'full' if and only if
 * `claim_validation_enabled` is true.
 *
 * **Validates: Requirements 3.4, 3.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { aggregateResults } from '../lib/aggregateResults.ts';
import type { CombinedPieceResult, ApprovedVersion } from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high';

const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('low', 'medium', 'high');

const approvedVersionArb: fc.Arbitrary<ApprovedVersion> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 30 }),
  body: fc.string({ minLength: 1, maxLength: 50 }),
  cta: fc.string({ minLength: 1, maxLength: 20 }),
  footer: fc.string({ minLength: 0, maxLength: 30 }),
});

/** Generates a valid CombinedPieceResult */
function combinedPieceResultArb(pieceIndex: number): fc.Arbitrary<CombinedPieceResult> {
  return riskLevelArb.chain((riskLevel) =>
    fc.record({
      pieceIndex: fc.constant(pieceIndex),
      riskLevel: fc.constant(riskLevel),
      issues: fc.constant([]),
      approvedVersion: approvedVersionArb,
      finalRecommendation: fc.string({ minLength: 1, maxLength: 80 }),
      compliance_status: fc.constant(
        riskLevel === 'high' ? 'rejected' as const : 'approved' as const,
      ),
    }),
  );
}

/** Generates an array of CombinedPieceResult with sequential pieceIndex values */
const combinedResultsArrayArb: fc.Arbitrary<CombinedPieceResult[]> = fc
  .integer({ min: 0, max: 20 })
  .chain((length) =>
    fc.tuple(
      ...Array.from({ length }, (_, i) => combinedPieceResultArb(i)),
    ),
  );

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 5: validationLevel reflects executed levels', () => {
  it('validationLevel is "full" when claimValidationEnabled is true', () => {
    fc.assert(
      fc.property(
        combinedResultsArrayArb,
        (results) => {
          const response = aggregateResults(results, true);

          expect(response.validationLevel).toBe('full');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validationLevel is "base" when claimValidationEnabled is false', () => {
    fc.assert(
      fc.property(
        combinedResultsArrayArb,
        (results) => {
          const response = aggregateResults(results, false);

          expect(response.validationLevel).toBe('base');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validationLevel biconditional: "base" ↔ disabled, "full" ↔ enabled (random flag)', () => {
    fc.assert(
      fc.property(
        combinedResultsArrayArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          const response = aggregateResults(results, claimValidationEnabled);

          if (claimValidationEnabled) {
            expect(response.validationLevel).toBe('full');
          } else {
            expect(response.validationLevel).toBe('base');
          }

          // Biconditional assertions
          expect(response.validationLevel === 'full').toBe(claimValidationEnabled === true);
          expect(response.validationLevel === 'base').toBe(claimValidationEnabled === false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('validationLevel is independent of results content', () => {
    fc.assert(
      fc.property(
        combinedResultsArrayArb,
        combinedResultsArrayArb,
        fc.boolean(),
        (results1, results2, claimValidationEnabled) => {
          const response1 = aggregateResults(results1, claimValidationEnabled);
          const response2 = aggregateResults(results2, claimValidationEnabled);

          // Same flag → same validationLevel regardless of results content
          expect(response1.validationLevel).toBe(response2.validationLevel);
        },
      ),
      { numRuns: 100 },
    );
  });
});
