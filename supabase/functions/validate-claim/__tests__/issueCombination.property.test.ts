/**
 * Property-based tests for combineResults — Issue combination with source tagging
 *
 * Feature: claim-validator, Property 8: Issue combination with source tagging
 *
 * For any validation where both levels execute, the final `issues` array SHALL contain
 * all issues from Nivel 1 tagged with `source: 'base_rules'` and all issues from Nivel 2
 * tagged with `source: 'tenant_rules'`, with no issues lost or duplicated.
 *
 * **Validates: Requirements 5.1**
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

const nonEmptyStringArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

const validPieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: nonEmptyStringArb,
  body: nonEmptyStringArb,
  cta: nonEmptyStringArb,
  footer: fc.option(nonEmptyStringArb, { nil: undefined }),
  proofPoints: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  avoidClaims: fc.option(fc.array(nonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

const riskLevelArb = fc.constantFrom('low' as const, 'medium' as const, 'high' as const);

const baseRuleIssueArb: fc.Arbitrary<BaseRuleIssue> = fc.record({
  text: nonEmptyStringArb,
  risk: fc.constantFrom('medium' as const, 'high' as const),
  reason: nonEmptyStringArb,
  suggestedFix: nonEmptyStringArb,
  source: fc.constant('base_rules' as const),
});

const baseRulesResultArb: fc.Arbitrary<BaseRulesResult> = fc
  .record({
    riskLevel: riskLevelArb,
    issues: fc.array(baseRuleIssueArb, { minLength: 0, maxLength: 5 }),
  });

const tenantRuleIssueArb: fc.Arbitrary<TenantRuleIssue> = fc.record({
  text: nonEmptyStringArb,
  risk: nonEmptyStringArb,
  reason: nonEmptyStringArb,
  suggestedFix: nonEmptyStringArb,
  source: fc.constant('tenant_rules' as const),
});

const openAIValidationResultArb: fc.Arbitrary<OpenAIValidationResult> = fc.record({
  pieceIndex: fc.nat({ max: 49 }),
  riskLevel: riskLevelArb,
  issues: fc.array(tenantRuleIssueArb, { minLength: 0, maxLength: 5 }),
  approvedVersion: fc.record({
    headline: nonEmptyStringArb,
    body: nonEmptyStringArb,
    cta: nonEmptyStringArb,
    footer: nonEmptyStringArb,
  }),
  finalRecommendation: nonEmptyStringArb,
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 8: Issue combination with source tagging', () => {
  it('combined issues array contains all issues from both levels with correct source tags, no losses or duplicates', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 49 }),
        validPieceArb,
        baseRulesResultArb,
        openAIValidationResultArb,
        (pieceIndex, piece, level1Result, level2Result) => {
          const combined = combineResults(pieceIndex, piece, level1Result, level2Result);

          // Total issues = level1 issues + level2 issues (no losses)
          expect(combined.issues.length).toBe(
            level1Result.issues.length + level2Result.issues.length,
          );

          // All level1 issues appear with source 'base_rules'
          const baseRulesIssues = combined.issues.filter((i) => i.source === 'base_rules');
          expect(baseRulesIssues.length).toBe(level1Result.issues.length);

          for (let idx = 0; idx < level1Result.issues.length; idx++) {
            const original = level1Result.issues[idx];
            const found = baseRulesIssues[idx];
            expect(found.text).toBe(original.text);
            expect(found.risk).toBe(original.risk);
            expect(found.reason).toBe(original.reason);
            expect(found.suggestedFix).toBe(original.suggestedFix);
            expect(found.source).toBe('base_rules');
          }

          // All level2 issues appear with source 'tenant_rules'
          const tenantRulesIssues = combined.issues.filter((i) => i.source === 'tenant_rules');
          expect(tenantRulesIssues.length).toBe(level2Result.issues.length);

          for (let idx = 0; idx < level2Result.issues.length; idx++) {
            const original = level2Result.issues[idx];
            const found = tenantRulesIssues[idx];
            expect(found.text).toBe(original.text);
            expect(found.risk).toBe(original.risk);
            expect(found.reason).toBe(original.reason);
            expect(found.suggestedFix).toBe(original.suggestedFix);
            expect(found.source).toBe('tenant_rules');
          }

          // No duplicates: each issue should be unique by position
          // (since we already verified exact count matches, duplicates would
          // mean some original issue was lost and another repeated)
          const issueStrings = combined.issues.map(
            (i) => `${i.source}|${i.text}|${i.risk}|${i.reason}|${i.suggestedFix}`,
          );
          const uniqueIssues = new Set(issueStrings);
          // Note: if two generated issues happen to be identical (same text/risk/reason/suggestedFix),
          // they are still valid separate issues. The no-duplicate guarantee means the combiner
          // doesn't introduce duplicates beyond what was in the input. We verify this by checking
          // that the count matches exactly.
          expect(combined.issues.length).toBe(
            level1Result.issues.length + level2Result.issues.length,
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('preserves ordering: level1 issues come first, then level2 issues', () => {
    fc.assert(
      fc.property(
        fc.nat({ max: 49 }),
        validPieceArb,
        baseRulesResultArb,
        openAIValidationResultArb,
        (pieceIndex, piece, level1Result, level2Result) => {
          const combined = combineResults(pieceIndex, piece, level1Result, level2Result);

          // First N issues should be from level1
          const level1Count = level1Result.issues.length;
          for (let i = 0; i < level1Count; i++) {
            expect(combined.issues[i].source).toBe('base_rules');
          }

          // Remaining issues should be from level2
          for (let i = level1Count; i < combined.issues.length; i++) {
            expect(combined.issues[i].source).toBe('tenant_rules');
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
