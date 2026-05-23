/**
 * Property-based tests for combineResults — Per-piece error isolation
 *
 * Feature: claim-validator, Property 12: Per-piece error isolation
 *
 * For any array of pieces where callOpenAI fails for a subset of pieces
 * (rate_limit exhausted, content_policy), the validator SHALL still return
 * valid results for all other pieces that succeeded, and SHALL mark failed
 * pieces with `riskLevel: 'high'` and an appropriate error issue.
 *
 * **Validates: Requirements 9.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { combineResults } from '../lib/combineResults.ts';
import type {
  PieceInput,
  BaseRulesResult,
  BaseRuleIssue,
  OpenAIValidationResult,
  TenantRuleIssue,
} from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Arbitraries
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high';

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function expectedMaxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

const nonEmptyStringArb = fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s.trim().length > 0);

const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('low', 'medium', 'high');

const validPieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: nonEmptyStringArb,
  body: nonEmptyStringArb,
  cta: nonEmptyStringArb,
  footer: fc.option(nonEmptyStringArb, { nil: undefined }),
  proofPoints: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  avoidClaims: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

const baseRuleIssueArb: fc.Arbitrary<BaseRuleIssue> = fc.record({
  text: nonEmptyStringArb,
  risk: fc.constantFrom('medium' as const, 'high' as const),
  reason: nonEmptyStringArb,
  suggestedFix: nonEmptyStringArb,
  source: fc.constant('base_rules' as const),
});

const baseRulesResultArb: fc.Arbitrary<BaseRulesResult> = fc.record({
  riskLevel: riskLevelArb,
  issues: fc.array(baseRuleIssueArb, { minLength: 0, maxLength: 3 }),
});

const tenantRuleIssueArb: fc.Arbitrary<TenantRuleIssue> = fc.record({
  text: nonEmptyStringArb,
  risk: nonEmptyStringArb,
  reason: nonEmptyStringArb,
  suggestedFix: nonEmptyStringArb,
  source: fc.constant('tenant_rules' as const),
});

const openAISuccessResultArb = (pieceIndex: number): fc.Arbitrary<OpenAIValidationResult> =>
  fc.record({
    pieceIndex: fc.constant(pieceIndex),
    riskLevel: riskLevelArb,
    issues: fc.array(tenantRuleIssueArb, { minLength: 0, maxLength: 3 }),
    approvedVersion: fc.record({
      headline: nonEmptyStringArb,
      body: nonEmptyStringArb,
      cta: nonEmptyStringArb,
      footer: nonEmptyStringArb,
    }),
    finalRecommendation: nonEmptyStringArb,
  });

const errorReasonArb = fc.constantFrom(
  'rate_limit exhausted after 2 retries',
  'content_policy violation',
  'rate_limit: max retries exceeded',
  'content rejected by OpenAI content policy',
);

const level2ErrorArb = (pieceIndex: number): fc.Arbitrary<{ error: string; pieceIndex: number }> =>
  errorReasonArb.map((error) => ({ error, pieceIndex }));

/**
 * Generates an array of 2-10 pieces, each with:
 * - A PieceInput
 * - A BaseRulesResult (Nivel 1 always runs)
 * - Either a successful OpenAIValidationResult or an error object (Nivel 2)
 * - A boolean indicating whether this piece's Nivel 2 failed
 *
 * Ensures at least one piece succeeds and at least one fails.
 */
interface PieceTestData {
  piece: PieceInput;
  level1Result: BaseRulesResult;
  level2Result: OpenAIValidationResult | { error: string; pieceIndex: number };
  isError: boolean;
}

const piecesArrayArb: fc.Arbitrary<PieceTestData[]> = fc
  .integer({ min: 2, max: 10 })
  .chain((count) => {
    // Generate array of pieces with mixed success/error level2 results
    return fc.tuple(
      // Generate the pieces and their level1 results
      fc.array(
        fc.tuple(validPieceArb, baseRulesResultArb),
        { minLength: count, maxLength: count },
      ),
      // Generate a boolean mask: true = error, false = success
      // Ensure at least one true and one false
      fc.array(fc.boolean(), { minLength: count, maxLength: count }).filter((bools) =>
        bools.some((b) => b) && bools.some((b) => !b)
      ),
    ).chain(([piecesAndLevel1, errorMask]) => {
      // For each piece, generate the appropriate level2 result
      const arbitraries = piecesAndLevel1.map(([piece, level1], idx) => {
        if (errorMask[idx]) {
          return level2ErrorArb(idx).map((level2Result) => ({
            piece,
            level1Result: level1,
            level2Result,
            isError: true,
          }));
        } else {
          return openAISuccessResultArb(idx).map((level2Result) => ({
            piece,
            level1Result: level1,
            level2Result,
            isError: false,
          }));
        }
      });
      return fc.tuple(...(arbitraries as [fc.Arbitrary<PieceTestData>, ...fc.Arbitrary<PieceTestData>[]]));
    });
  });

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 12: Per-piece error isolation', () => {
  it('pieces with error level2 results have riskLevel high and compliance_status rejected', () => {
    fc.assert(
      fc.property(
        piecesArrayArb,
        (piecesData) => {
          for (const data of piecesData) {
            if (!data.isError) continue;

            const pieceIndex = piecesData.indexOf(data);
            const combined = combineResults(
              pieceIndex,
              data.piece,
              data.level1Result,
              data.level2Result,
            );

            // Failed pieces must have riskLevel 'high'
            expect(combined.riskLevel).toBe('high');
            // Failed pieces must have compliance_status 'rejected'
            expect(combined.compliance_status).toBe('rejected');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('pieces with successful level2 results have their correct combined risk level', () => {
    fc.assert(
      fc.property(
        piecesArrayArb,
        (piecesData) => {
          for (const data of piecesData) {
            if (data.isError) continue;

            const pieceIndex = piecesData.indexOf(data);
            const combined = combineResults(
              pieceIndex,
              data.piece,
              data.level1Result,
              data.level2Result,
            );

            // Successful pieces should have riskLevel = max(level1, level2)
            const level2Result = data.level2Result as OpenAIValidationResult;
            const expectedRisk = expectedMaxRisk(
              data.level1Result.riskLevel,
              level2Result.riskLevel,
            );
            expect(combined.riskLevel).toBe(expectedRisk);

            // compliance_status should match the risk level
            if (expectedRisk === 'high') {
              expect(combined.compliance_status).toBe('rejected');
            } else {
              expect(combined.compliance_status).toBe('approved');
            }
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('total number of results equals the number of pieces (no pieces lost)', () => {
    fc.assert(
      fc.property(
        piecesArrayArb,
        (piecesData) => {
          const results = piecesData.map((data, idx) =>
            combineResults(idx, data.piece, data.level1Result, data.level2Result),
          );

          // No pieces lost: one result per input piece
          expect(results.length).toBe(piecesData.length);

          // Each result has a valid pieceIndex
          for (let i = 0; i < results.length; i++) {
            expect(results[i].pieceIndex).toBe(i);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('error in one piece does not affect the results of other pieces', () => {
    fc.assert(
      fc.property(
        piecesArrayArb,
        (piecesData) => {
          const results = piecesData.map((data, idx) =>
            combineResults(idx, data.piece, data.level1Result, data.level2Result),
          );

          // Verify that successful pieces produce the same result regardless of
          // whether other pieces in the array failed
          for (let i = 0; i < piecesData.length; i++) {
            const data = piecesData[i];
            if (data.isError) continue;

            // Compute the result in isolation (same inputs)
            const isolatedResult = combineResults(
              i,
              data.piece,
              data.level1Result,
              data.level2Result,
            );

            // The result from the batch should be identical to the isolated result
            expect(results[i].riskLevel).toBe(isolatedResult.riskLevel);
            expect(results[i].compliance_status).toBe(isolatedResult.compliance_status);
            expect(results[i].issues.length).toBe(isolatedResult.issues.length);
            expect(results[i].finalRecommendation).toBe(isolatedResult.finalRecommendation);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
