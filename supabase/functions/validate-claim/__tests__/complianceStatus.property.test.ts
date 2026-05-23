/**
 * Property-based tests for Result Combiner — Risk-to-compliance-status mapping
 *
 * Feature: claim-validator, Property 13: Risk-to-compliance-status mapping
 *
 * For any validation result, `compliance_status` SHALL be 'rejected' if and only if
 * `riskLevel` is 'high', and 'approved' if and only if `riskLevel` is 'low' or 'medium'.
 *
 * **Validates: Requirements 11.1, 11.2**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { combineResults } from '../lib/combineResults.ts';
import type {
  BaseRulesResult,
  BaseRuleIssue,
  OpenAIValidationResult,
  TenantRuleIssue,
  PieceInput,
} from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
// ---------------------------------------------------------------------------

type RiskLevel = 'low' | 'medium' | 'high';

const riskLevelArb: fc.Arbitrary<RiskLevel> = fc.constantFrom('low', 'medium', 'high');

/** Generates a valid PieceInput */
const pieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 50 }),
  body: fc.string({ minLength: 1, maxLength: 100 }),
  cta: fc.string({ minLength: 1, maxLength: 30 }),
  footer: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined }),
});

/** Generates a BaseRuleIssue */
const baseRuleIssueArb: fc.Arbitrary<BaseRuleIssue> = fc.record({
  text: fc.string({ minLength: 1, maxLength: 30 }),
  risk: fc.constantFrom('medium' as const, 'high' as const),
  reason: fc.string({ minLength: 1, maxLength: 50 }),
  suggestedFix: fc.string({ minLength: 1, maxLength: 50 }),
  source: fc.constant('base_rules' as const),
});

/** Generates a BaseRulesResult with a specific riskLevel */
function baseRulesResultArb(riskLevel: RiskLevel): fc.Arbitrary<BaseRulesResult> {
  // Generate issues consistent with the risk level
  if (riskLevel === 'low') {
    return fc.constant({ riskLevel: 'low', issues: [] });
  }
  return fc.record({
    riskLevel: fc.constant(riskLevel),
    issues: fc.array(baseRuleIssueArb, { minLength: 1, maxLength: 3 }),
  });
}

/** Generates a TenantRuleIssue */
const tenantRuleIssueArb: fc.Arbitrary<TenantRuleIssue> = fc.record({
  text: fc.string({ minLength: 1, maxLength: 30 }),
  risk: fc.constantFrom('low', 'medium', 'high'),
  reason: fc.string({ minLength: 1, maxLength: 50 }),
  suggestedFix: fc.string({ minLength: 1, maxLength: 50 }),
  source: fc.constant('tenant_rules' as const),
});

/** Generates an OpenAIValidationResult with a specific riskLevel */
function openAIResultArb(riskLevel: RiskLevel): fc.Arbitrary<OpenAIValidationResult> {
  return fc.record({
    pieceIndex: fc.nat({ max: 20 }),
    riskLevel: fc.constant(riskLevel),
    issues: fc.array(tenantRuleIssueArb, { minLength: 0, maxLength: 3 }),
    approvedVersion: fc.record({
      headline: fc.string({ minLength: 1, maxLength: 30 }),
      body: fc.string({ minLength: 1, maxLength: 50 }),
      cta: fc.string({ minLength: 1, maxLength: 20 }),
      footer: fc.string({ minLength: 0, maxLength: 30 }),
    }),
    finalRecommendation: fc.string({ minLength: 1, maxLength: 80 }),
  });
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 13: Risk-to-compliance-status mapping', () => {
  it('compliance_status is rejected when final riskLevel is high (Nivel 1 only)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        pieceArb,
        baseRulesResultArb('high'),
        (pieceIndex, piece, level1Result) => {
          const result = combineResults(pieceIndex, piece, level1Result, undefined);

          expect(result.riskLevel).toBe('high');
          expect(result.compliance_status).toBe('rejected');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('compliance_status is approved when final riskLevel is low (Nivel 1 only)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        pieceArb,
        baseRulesResultArb('low'),
        (pieceIndex, piece, level1Result) => {
          const result = combineResults(pieceIndex, piece, level1Result, undefined);

          expect(result.riskLevel).toBe('low');
          expect(result.compliance_status).toBe('approved');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('compliance_status is approved when final riskLevel is medium (Nivel 1 only)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        pieceArb,
        baseRulesResultArb('medium'),
        (pieceIndex, piece, level1Result) => {
          const result = combineResults(pieceIndex, piece, level1Result, undefined);

          expect(result.riskLevel).toBe('medium');
          expect(result.compliance_status).toBe('approved');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('compliance_status is rejected iff riskLevel is high when both levels execute', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        pieceArb,
        riskLevelArb,
        riskLevelArb,
        (pieceIndex, piece, level1Risk, level2Risk) => {
          const level1Result: BaseRulesResult = level1Risk === 'low'
            ? { riskLevel: 'low', issues: [] }
            : { riskLevel: level1Risk, issues: [{ text: 'test', risk: level1Risk === 'high' ? 'high' : 'medium', reason: 'test_rule', suggestedFix: 'fix', source: 'base_rules' }] };

          // Build a valid OpenAIValidationResult
          const level2Result: OpenAIValidationResult = {
            pieceIndex,
            riskLevel: level2Risk,
            issues: level2Risk !== 'low' ? [{ text: 'test', risk: level2Risk, reason: 'tenant_rule', suggestedFix: 'fix', source: 'tenant_rules' }] : [],
            approvedVersion: { headline: 'h', body: 'b', cta: 'c', footer: 'f' },
            finalRecommendation: 'recommendation',
          };

          const result = combineResults(pieceIndex, piece, level1Result, level2Result);

          // The final riskLevel should be the max of both
          const RISK_ORDER = { low: 0, medium: 1, high: 2 };
          const expectedRisk = RISK_ORDER[level1Risk] >= RISK_ORDER[level2Risk] ? level1Risk : level2Risk;
          expect(result.riskLevel).toBe(expectedRisk);

          // Property 13: compliance_status mapping
          if (result.riskLevel === 'high') {
            expect(result.compliance_status).toBe('rejected');
          } else {
            expect(result.compliance_status).toBe('approved');
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('compliance_status is rejected when Nivel 2 has an error (treated as high risk)', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        pieceArb,
        riskLevelArb,
        fc.string({ minLength: 1, maxLength: 50 }),
        (pieceIndex, piece, level1Risk, errorMsg) => {
          const level1Result: BaseRulesResult = level1Risk === 'low'
            ? { riskLevel: 'low', issues: [] }
            : { riskLevel: level1Risk, issues: [{ text: 'test', risk: level1Risk === 'high' ? 'high' : 'medium', reason: 'test_rule', suggestedFix: 'fix', source: 'base_rules' }] };

          // Nivel 2 error object → always treated as high risk
          const level2Error = { error: errorMsg, pieceIndex };

          const result = combineResults(pieceIndex, piece, level1Result, level2Error);

          // When Nivel 2 errors, riskLevel is always 'high' (max with 'high')
          expect(result.riskLevel).toBe('high');
          expect(result.compliance_status).toBe('rejected');
        },
      ),
      { numRuns: 100 },
    );
  });

  it('compliance_status biconditional: approved ↔ (low or medium), rejected ↔ high', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 20 }),
        pieceArb,
        riskLevelArb,
        fc.option(riskLevelArb, { nil: undefined }),
        (pieceIndex, piece, level1Risk, level2Risk) => {
          const level1Result: BaseRulesResult = level1Risk === 'low'
            ? { riskLevel: 'low', issues: [] }
            : { riskLevel: level1Risk, issues: [{ text: 'test', risk: level1Risk === 'high' ? 'high' : 'medium', reason: 'test_rule', suggestedFix: 'fix', source: 'base_rules' }] };

          let level2Result: OpenAIValidationResult | undefined;
          if (level2Risk !== undefined) {
            level2Result = {
              pieceIndex,
              riskLevel: level2Risk,
              issues: [],
              approvedVersion: { headline: 'h', body: 'b', cta: 'c', footer: 'f' },
              finalRecommendation: 'ok',
            };
          }

          const result = combineResults(pieceIndex, piece, level1Result, level2Result);

          // Biconditional check
          expect(result.compliance_status === 'rejected').toBe(result.riskLevel === 'high');
          expect(result.compliance_status === 'approved').toBe(
            result.riskLevel === 'low' || result.riskLevel === 'medium',
          );
        },
      ),
      { numRuns: 100 },
    );
  });
});
