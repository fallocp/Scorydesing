/**
 * Property-based tests for Result Aggregator — Pipeline action determination
 *
 * Feature: claim-validator, Property 14: Pipeline action determination
 *
 * For any set of validation results, `pipelineAction` SHALL be 'halt' if and only if
 * ALL pieces have `riskLevel: 'high'`; otherwise it SHALL be 'continue' with
 * `approvedPieceIndices` containing exactly the indices of pieces with
 * `compliance_status: 'approved'`.
 *
 * **Validates: Requirements 11.3, 11.4**
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

/**
 * Generates a CombinedPieceResult with a specific riskLevel.
 * compliance_status is derived from riskLevel: 'rejected' if high, 'approved' otherwise.
 */
function combinedPieceResultArb(pieceIndex: number, riskLevel: RiskLevel): fc.Arbitrary<CombinedPieceResult> {
  const complianceStatus = riskLevel === 'high' ? 'rejected' : 'approved';
  return fc.record({
    pieceIndex: fc.constant(pieceIndex),
    riskLevel: fc.constant(riskLevel),
    issues: fc.constant([]),
    approvedVersion: approvedVersionArb,
    finalRecommendation: fc.string({ minLength: 1, maxLength: 80 }),
    compliance_status: fc.constant(complianceStatus as 'approved' | 'rejected'),
  });
}

/**
 * Generates an array of CombinedPieceResult with random risk levels.
 * Each piece gets a sequential pieceIndex.
 */
const combinedPieceResultsArb: fc.Arbitrary<CombinedPieceResult[]> = fc
  .array(riskLevelArb, { minLength: 1, maxLength: 20 })
  .chain((riskLevels) =>
    fc.tuple(
      ...riskLevels.map((risk, idx) => combinedPieceResultArb(idx, risk)),
    ),
  )
  .map((tuple) => [...tuple]);

/**
 * Generates an array where ALL pieces have riskLevel 'high'.
 */
const allHighResultsArb: fc.Arbitrary<CombinedPieceResult[]> = fc
  .integer({ min: 1, max: 20 })
  .chain((count) =>
    fc.tuple(
      ...Array.from({ length: count }, (_, idx) => combinedPieceResultArb(idx, 'high')),
    ),
  )
  .map((tuple) => [...tuple]);

/**
 * Generates an array where at least one piece does NOT have riskLevel 'high'.
 */
const notAllHighResultsArb: fc.Arbitrary<CombinedPieceResult[]> = fc
  .integer({ min: 1, max: 20 })
  .chain((count) => {
    // Pick a random index to be non-high
    return fc.integer({ min: 0, max: count - 1 }).chain((nonHighIdx) => {
      const arbs = Array.from({ length: count }, (_, idx) => {
        if (idx === nonHighIdx) {
          return combinedPieceResultArb(idx, fc.sample(fc.constantFrom('low' as const, 'medium' as const), 1)[0]);
        }
        return combinedPieceResultArb(idx, fc.sample(riskLevelArb, 1)[0]);
      });
      return fc.tuple(...arbs);
    });
  })
  .map((tuple) => [...tuple]);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 14: Pipeline action determination', () => {
  it('pipelineAction is halt when ALL pieces have riskLevel high', () => {
    fc.assert(
      fc.property(
        allHighResultsArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          const response = aggregateResults(results, claimValidationEnabled);

          expect(response.pipelineAction).toBe('halt');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pipelineAction is continue when at least one piece is not high risk', () => {
    fc.assert(
      fc.property(
        combinedPieceResultsArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          // Only test when not all are high
          const allHigh = results.every((r) => r.riskLevel === 'high');
          fc.pre(!allHigh);

          const response = aggregateResults(results, claimValidationEnabled);

          expect(response.pipelineAction).toBe('continue');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pipelineAction is halt iff ALL pieces have riskLevel high (biconditional)', () => {
    fc.assert(
      fc.property(
        combinedPieceResultsArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          const response = aggregateResults(results, claimValidationEnabled);

          const allHigh = results.every((r) => r.riskLevel === 'high');

          // Biconditional: halt ↔ allHigh
          expect(response.pipelineAction === 'halt').toBe(allHigh);
          expect(response.pipelineAction === 'continue').toBe(!allHigh);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('approvedPieceIndices contains exactly the indices of approved pieces', () => {
    fc.assert(
      fc.property(
        combinedPieceResultsArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          const response = aggregateResults(results, claimValidationEnabled);

          // Expected: indices of pieces with compliance_status 'approved'
          const expectedIndices = results
            .filter((r) => r.compliance_status === 'approved')
            .map((r) => r.pieceIndex);

          expect(response.approvedPieceIndices).toEqual(expectedIndices);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('approvedPieceIndices is empty when pipelineAction is halt', () => {
    fc.assert(
      fc.property(
        allHighResultsArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          const response = aggregateResults(results, claimValidationEnabled);

          // When all are high → halt, and no pieces are approved
          expect(response.pipelineAction).toBe('halt');
          expect(response.approvedPieceIndices).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('approvedPieceIndices is non-empty when pipelineAction is continue', () => {
    fc.assert(
      fc.property(
        combinedPieceResultsArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          // Only test when not all are high (at least one approved piece exists)
          const hasApproved = results.some((r) => r.compliance_status === 'approved');
          fc.pre(hasApproved);

          const response = aggregateResults(results, claimValidationEnabled);

          expect(response.pipelineAction).toBe('continue');
          expect(response.approvedPieceIndices.length).toBeGreaterThan(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});
