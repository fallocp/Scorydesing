/**
 * Property-based tests for combineResults.ts
 *
 * Feature: claim-validator, Property 9: Risk level is maximum of both levels
 *
 * For any piece validated by both levels, the final `riskLevel` SHALL equal
 * the maximum of `level1.riskLevel` and `level2.riskLevel`, using the ordering
 * low < medium < high.
 *
 * **Validates: Requirements 5.2**
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

type RiskLevel = 'low' | 'medium' | 'high';

const RISK_ORDER: Record<RiskLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** Reference implementation of max risk level for assertions */
function expectedMaxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

/** Arbitrary for risk levels */
const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('low', 'medium', 'high');

/** Arbitrary for a valid PieceInput */
const validPieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 50 }),
  body: fc.string({ minLength: 1, maxLength: 100 }),
  cta: fc.string({ minLength: 1, maxLength: 30 }),
  footer: fc.option(fc.string({ minLength: 1, maxLength: 30 }), { nil: undefined }),
  proofPoints: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }), { nil: undefined }),
  avoidClaims: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 20 }), { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

/** Generate BaseRuleIssue array matching a given risk level */
function baseIssuesForRisk(riskLevel: RiskLevel): fc.Arbitrary<BaseRuleIssue[]> {
  if (riskLevel === 'low') {
    return fc.constant([]);
  }
  const issueRisk = riskLevel === 'high' ? 'high' : 'medium';
  const issueArb: fc.Arbitrary<BaseRuleIssue> = fc.record({
    text: fc.string({ minLength: 1, maxLength: 30 }),
    risk: fc.constant(issueRisk as 'medium' | 'high'),
    reason: fc.string({ minLength: 1, maxLength: 30 }),
    suggestedFix: fc.string({ minLength: 1, maxLength: 30 }),
    source: fc.constant('base_rules' as const),
  });
  return fc.array(issueArb, { minLength: 1, maxLength: 3 });
}

/** Generate TenantRuleIssue array matching a given risk level */
function tenantIssuesForRisk(riskLevel: RiskLevel): fc.Arbitrary<TenantRuleIssue[]> {
  if (riskLevel === 'low') {
    return fc.constant([]);
  }
  const issueArb: fc.Arbitrary<TenantRuleIssue> = fc.record({
    text: fc.string({ minLength: 1, maxLength: 30 }),
    risk: fc.constant(riskLevel),
    reason: fc.string({ minLength: 1, maxLength: 30 }),
    suggestedFix: fc.string({ minLength: 1, maxLength: 30 }),
    source: fc.constant('tenant_rules' as const),
  });
  return fc.array(issueArb, { minLength: 1, maxLength: 3 });
}

/** Generate a BaseRulesResult with a specific risk level */
function baseRulesResultArb(riskLevel: RiskLevel): fc.Arbitrary<BaseRulesResult> {
  return baseIssuesForRisk(riskLevel).map((issues) => ({
    riskLevel,
    issues,
  }));
}

/** Generate an OpenAIValidationResult with a specific risk level */
function openAIResultArb(riskLevel: RiskLevel, pieceIndex: number): fc.Arbitrary<OpenAIValidationResult> {
  return tenantIssuesForRisk(riskLevel).map((issues) => ({
    pieceIndex,
    riskLevel,
    issues,
    approvedVersion: {
      headline: 'approved headline',
      body: 'approved body',
      cta: 'approved cta',
      footer: 'approved footer',
    },
    finalRecommendation: 'Recommendation from Nivel 2',
  }));
}

describe('Feature: claim-validator, Property 9: Risk level is maximum of both levels', () => {
  it('final riskLevel equals max(level1.riskLevel, level2.riskLevel) for all combinations', () => {
    fc.assert(
      fc.property(
        validPieceArb,
        riskLevelArb,
        riskLevelArb,
        fc.nat({ max: 49 }),
        (piece, level1Risk, level2Risk, pieceIndex) => {
          // Build level1 result with the generated risk level
          const level1Result: BaseRulesResult = {
            riskLevel: level1Risk,
            issues: level1Risk === 'low' ? [] : [{
              text: 'test issue',
              risk: level1Risk === 'high' ? 'high' : 'medium',
              reason: 'test reason',
              suggestedFix: 'test fix',
              source: 'base_rules',
            }],
          };

          // Build level2 result with the generated risk level
          const level2Result: OpenAIValidationResult = {
            pieceIndex,
            riskLevel: level2Risk,
            issues: level2Risk === 'low' ? [] : [{
              text: 'tenant issue',
              risk: level2Risk,
              reason: 'tenant reason',
              suggestedFix: 'tenant fix',
              source: 'tenant_rules',
            }],
            approvedVersion: {
              headline: piece.headline,
              body: piece.body,
              cta: piece.cta,
              footer: piece.footer ?? '',
            },
            finalRecommendation: 'Nivel 2 recommendation',
          };

          const combined = combineResults(pieceIndex, piece, level1Result, level2Result);

          // The final riskLevel must equal the maximum of both levels
          const expected = expectedMaxRisk(level1Risk, level2Risk);
          expect(combined.riskLevel).toBe(expected);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('covers all 9 combinations of risk levels (low/medium/high × low/medium/high)', () => {
    const levels: RiskLevel[] = ['low', 'medium', 'high'];

    for (const level1Risk of levels) {
      for (const level2Risk of levels) {
        fc.assert(
          fc.property(
            validPieceArb,
            fc.nat({ max: 49 }),
            (piece, pieceIndex) => {
              const level1Result: BaseRulesResult = {
                riskLevel: level1Risk,
                issues: level1Risk === 'low' ? [] : [{
                  text: 'test issue',
                  risk: level1Risk === 'high' ? 'high' : 'medium',
                  reason: 'test reason',
                  suggestedFix: 'test fix',
                  source: 'base_rules',
                }],
              };

              const level2Result: OpenAIValidationResult = {
                pieceIndex,
                riskLevel: level2Risk,
                issues: level2Risk === 'low' ? [] : [{
                  text: 'tenant issue',
                  risk: level2Risk,
                  reason: 'tenant reason',
                  suggestedFix: 'tenant fix',
                  source: 'tenant_rules',
                }],
                approvedVersion: {
                  headline: piece.headline,
                  body: piece.body,
                  cta: piece.cta,
                  footer: piece.footer ?? '',
                },
                finalRecommendation: 'Nivel 2 recommendation',
              };

              const combined = combineResults(pieceIndex, piece, level1Result, level2Result);
              const expected = expectedMaxRisk(level1Risk, level2Risk);
              expect(combined.riskLevel).toBe(expected);
            },
          ),
          { numRuns: 15 },
        );
      }
    }
  });

  it('max risk is commutative: max(a, b) === max(b, a)', () => {
    fc.assert(
      fc.property(
        validPieceArb,
        riskLevelArb,
        riskLevelArb,
        fc.nat({ max: 49 }),
        (piece, riskA, riskB, pieceIndex) => {
          const level1A: BaseRulesResult = {
            riskLevel: riskA,
            issues: riskA === 'low' ? [] : [{
              text: 'issue', risk: riskA === 'high' ? 'high' : 'medium',
              reason: 'r', suggestedFix: 'f', source: 'base_rules',
            }],
          };

          const level2B: OpenAIValidationResult = {
            pieceIndex, riskLevel: riskB,
            issues: riskB === 'low' ? [] : [{
              text: 'issue', risk: riskB, reason: 'r', suggestedFix: 'f', source: 'tenant_rules',
            }],
            approvedVersion: { headline: 'h', body: 'b', cta: 'c', footer: 'f' },
            finalRecommendation: 'rec',
          };

          const resultAB = combineResults(pieceIndex, piece, level1A, level2B);

          // Now swap: level1 gets riskB, level2 gets riskA
          const level1B: BaseRulesResult = {
            riskLevel: riskB,
            issues: riskB === 'low' ? [] : [{
              text: 'issue', risk: riskB === 'high' ? 'high' : 'medium',
              reason: 'r', suggestedFix: 'f', source: 'base_rules',
            }],
          };

          const level2A: OpenAIValidationResult = {
            pieceIndex, riskLevel: riskA,
            issues: riskA === 'low' ? [] : [{
              text: 'issue', risk: riskA, reason: 'r', suggestedFix: 'f', source: 'tenant_rules',
            }],
            approvedVersion: { headline: 'h', body: 'b', cta: 'c', footer: 'f' },
            finalRecommendation: 'rec',
          };

          const resultBA = combineResults(pieceIndex, piece, level1B, level2A);

          // max(a, b) should equal max(b, a)
          expect(resultAB.riskLevel).toBe(resultBA.riskLevel);
        },
      ),
      { numRuns: 100 },
    );
  });
});
