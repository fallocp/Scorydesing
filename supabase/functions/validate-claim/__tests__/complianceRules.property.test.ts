/**
 * Property-based tests for buildPrompt.ts
 *
 * Feature: claim-validator, Property 6: Compliance rules injection completeness
 *
 * For any set of tenant compliance rules with non-empty `forbidden_terms`,
 * `required_qualifiers`, and `max_values`, the constructed Nivel 2 validation
 * prompt SHALL contain every term from `forbidden_terms`, every qualifier from
 * `required_qualifiers`, and every key-value pair from `max_values`.
 *
 * **Validates: Requirements 4.2, 4.3, 4.4, 6.3**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { PieceInput, TenantResolution } from '../lib/types.ts';

// Mock fetchMasterPromptByType to return null (use fallback prompt)
vi.mock('../../_shared/fetchBusinessContext.ts', () => ({
  fetchMasterPromptByType: vi.fn().mockResolvedValue(null),
}));

// Mock interpolateTemplate to do simple {{key}} replacement
vi.mock('../../_shared/interpolateTemplate.ts', () => ({
  interpolateTemplate: vi.fn((template: string, variables: Record<string, string | string[] | undefined>) => {
    return template.replace(/\{\{(\w+)\}\}/g, (match: string, key: string) => {
      if (!(key in variables)) return match;
      const value = variables[key];
      if (value === undefined) return '';
      if (Array.isArray(value)) return value.join(', ');
      return value;
    });
  }),
}));

import { buildValidationPrompt } from '../lib/buildPrompt.ts';

/** Arbitrary for alphanumeric non-empty strings (avoids regex special chars) */
const safeNonEmptyStringArb = fc.string({ minLength: 2, maxLength: 30 })
  .filter((s) => /^[a-zA-Z0-9 ]+$/.test(s) && s.trim().length >= 2);

/** Arbitrary for non-empty arrays of safe strings (forbidden_terms / required_qualifiers) */
const nonEmptyStringArrayArb = fc.array(safeNonEmptyStringArb, { minLength: 1, maxLength: 10 });

/** Arbitrary for non-empty Record<string, string> (max_values) */
const nonEmptyMaxValuesArb = fc.dictionary(
  safeNonEmptyStringArb.filter((s) => s.trim().length >= 2),
  safeNonEmptyStringArb,
  { minKeys: 1, maxKeys: 5 },
);

/** Arbitrary for compliance rules with all non-empty fields */
const complianceRulesArb: fc.Arbitrary<TenantResolution['complianceRules']> = fc.record({
  forbidden_terms: nonEmptyStringArrayArb,
  required_qualifiers: nonEmptyStringArrayArb,
  max_values: nonEmptyMaxValuesArb,
});

/** Arbitrary for a valid PieceInput */
const validPieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: safeNonEmptyStringArb,
  body: safeNonEmptyStringArb,
  cta: safeNonEmptyStringArb,
  footer: fc.option(safeNonEmptyStringArb, { nil: undefined }),
  proofPoints: fc.option(fc.array(safeNonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
  avoidClaims: fc.option(fc.array(safeNonEmptyStringArb, { minLength: 0, maxLength: 3 }), { nil: undefined }),
});

/** Fake Supabase client (not used since fetchMasterPromptByType is mocked) */
const fakeSupabase = {} as any;

const fakeBrandName = 'TestBrand';
const fakeBusinessId = '00000000-0000-0000-0000-000000000001';

describe('Feature: claim-validator, Property 6: Compliance rules injection completeness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('every forbidden_term appears in the constructed systemPrompt', () => {
    fc.assert(
      fc.asyncProperty(
        validPieceArb,
        complianceRulesArb,
        async (piece, complianceRules) => {
          const result = await buildValidationPrompt(
            fakeSupabase,
            fakeBusinessId,
            piece,
            complianceRules,
            fakeBrandName,
          );

          for (const term of complianceRules.forbidden_terms) {
            expect(result.systemPrompt).toContain(term);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every required_qualifier appears in the constructed systemPrompt', () => {
    fc.assert(
      fc.asyncProperty(
        validPieceArb,
        complianceRulesArb,
        async (piece, complianceRules) => {
          const result = await buildValidationPrompt(
            fakeSupabase,
            fakeBusinessId,
            piece,
            complianceRules,
            fakeBrandName,
          );

          for (const qualifier of complianceRules.required_qualifiers) {
            expect(result.systemPrompt).toContain(qualifier);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('every max_values key and value appears in the constructed systemPrompt', () => {
    fc.assert(
      fc.asyncProperty(
        validPieceArb,
        complianceRulesArb,
        async (piece, complianceRules) => {
          const result = await buildValidationPrompt(
            fakeSupabase,
            fakeBusinessId,
            piece,
            complianceRules,
            fakeBrandName,
          );

          for (const [key, value] of Object.entries(complianceRules.max_values)) {
            expect(result.systemPrompt).toContain(key);
            expect(result.systemPrompt).toContain(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('all compliance rules (forbidden_terms, required_qualifiers, max_values) appear together in the systemPrompt', () => {
    fc.assert(
      fc.asyncProperty(
        validPieceArb,
        complianceRulesArb,
        async (piece, complianceRules) => {
          const result = await buildValidationPrompt(
            fakeSupabase,
            fakeBusinessId,
            piece,
            complianceRules,
            fakeBrandName,
          );

          // All forbidden terms present
          for (const term of complianceRules.forbidden_terms) {
            expect(result.systemPrompt).toContain(term);
          }

          // All required qualifiers present
          for (const qualifier of complianceRules.required_qualifiers) {
            expect(result.systemPrompt).toContain(qualifier);
          }

          // All max_values keys and values present
          for (const [key, value] of Object.entries(complianceRules.max_values)) {
            expect(result.systemPrompt).toContain(key);
            expect(result.systemPrompt).toContain(value);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
