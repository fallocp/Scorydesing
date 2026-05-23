/**
 * Property-based tests for Result Aggregator — Pipeline ID pass-through
 *
 * Feature: claim-validator, Property 10: Pipeline ID pass-through
 *
 * For any request containing a `pipelineRunId`, the response SHALL include
 * that same `pipelineRunId` value unchanged. When pipelineRunId is undefined,
 * it should NOT be present in the response.
 *
 * **Validates: Requirements 8.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { aggregateResults } from '../lib/aggregateResults.ts';
import type { CombinedPieceResult } from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high';

const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('low', 'medium', 'high');

/** Generates a valid CombinedPieceResult */
function combinedPieceResultArb(pieceIndex: number): fc.Arbitrary<CombinedPieceResult> {
  return riskLevelArb.chain((riskLevel) =>
    fc.record({
      pieceIndex: fc.constant(pieceIndex),
      riskLevel: fc.constant(riskLevel),
      issues: fc.constant([]),
      approvedVersion: fc.record({
        headline: fc.string({ minLength: 1, maxLength: 30 }),
        body: fc.string({ minLength: 1, maxLength: 50 }),
        cta: fc.string({ minLength: 1, maxLength: 20 }),
        footer: fc.string({ minLength: 0, maxLength: 30 }),
      }),
      finalRecommendation: fc.string({ minLength: 1, maxLength: 80 }),
      compliance_status: fc.constant(
        riskLevel === 'high' ? 'rejected' as const : 'approved' as const,
      ),
    }),
  );
}

/** Generates an array of 1-10 CombinedPieceResults */
const resultsArrayArb: fc.Arbitrary<CombinedPieceResult[]> = fc
  .integer({ min: 1, max: 10 })
  .chain((length) =>
    fc.tuple(
      ...Array.from({ length }, (_, i) => combinedPieceResultArb(i)),
    ),
  );

/** Generates a non-empty pipelineRunId string */
const pipelineRunIdArb: fc.Arbitrary<string> = fc.string({ minLength: 1, maxLength: 100 });

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 10: Pipeline ID pass-through', () => {
  it('response includes the same pipelineRunId value unchanged when provided', () => {
    fc.assert(
      fc.property(
        resultsArrayArb,
        fc.boolean(),
        pipelineRunIdArb,
        (results, claimValidationEnabled, pipelineRunId) => {
          const response = aggregateResults(results, claimValidationEnabled, pipelineRunId);

          expect(response.pipelineRunId).toBe(pipelineRunId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pipelineRunId is NOT present in response when undefined', () => {
    fc.assert(
      fc.property(
        resultsArrayArb,
        fc.boolean(),
        (results, claimValidationEnabled) => {
          const response = aggregateResults(results, claimValidationEnabled, undefined);

          expect(response.pipelineRunId).toBeUndefined();
          expect('pipelineRunId' in response).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pipelineRunId is preserved exactly (no trimming, no mutation) for arbitrary strings', () => {
    fc.assert(
      fc.property(
        resultsArrayArb,
        fc.boolean(),
        fc.string({ minLength: 1, maxLength: 200 }),
        (results, claimValidationEnabled, pipelineRunId) => {
          const response = aggregateResults(results, claimValidationEnabled, pipelineRunId);

          // Exact equality — no trimming, encoding, or mutation
          expect(response.pipelineRunId).toStrictEqual(pipelineRunId);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pipelineRunId pass-through is independent of results content and claimValidationEnabled', () => {
    fc.assert(
      fc.property(
        resultsArrayArb,
        fc.boolean(),
        pipelineRunIdArb,
        (results, claimValidationEnabled, pipelineRunId) => {
          // Call with same pipelineRunId but different params
          const response1 = aggregateResults(results, true, pipelineRunId);
          const response2 = aggregateResults(results, false, pipelineRunId);
          const response3 = aggregateResults([], true, pipelineRunId);

          // pipelineRunId is always the same regardless of other params
          expect(response1.pipelineRunId).toBe(pipelineRunId);
          expect(response2.pipelineRunId).toBe(pipelineRunId);
          expect(response3.pipelineRunId).toBe(pipelineRunId);
        },
      ),
      { numRuns: 100 },
    );
  });
});
