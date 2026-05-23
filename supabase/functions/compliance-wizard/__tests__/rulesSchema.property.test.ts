/**
 * Property 1: Generated rules always conform to ComplianceRules schema
 * **Validates: Requirements 2.1, 2.4, 3.1**
 *
 * For any valid output from `generateInitialRules`, the resulting `rules` object
 * must always conform to the ComplianceRules schema:
 * - `forbidden_terms` is a string[]
 * - `required_qualifiers` is a string[]
 * - `max_values` is a Record<string, string>
 *
 * Also tests the inverse: for any object that does NOT conform to the schema,
 * `validateComplianceRules` returns false.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock callOpenAI before importing the module
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { validateComplianceRules, generateInitialRules } from '../ruleGenerator.ts';
import { callOpenAI } from '../../_shared/callOpenAI.ts';
import type { RuleGenerationContext } from '../ruleGenerator.ts';
import type { ConversationMessage } from '../sessionManager.ts';

const mockedCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid ComplianceRules objects */
const arbComplianceRules = fc.record({
  forbidden_terms: fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 0, maxLength: 20 }),
  required_qualifiers: fc.array(fc.string({ minLength: 0, maxLength: 100 }), { minLength: 0, maxLength: 20 }),
  max_values: fc.dictionary(
    fc.string({ minLength: 1, maxLength: 50 }).filter((s) => !s.includes('__proto__') && !s.includes('constructor')),
    fc.string({ minLength: 0, maxLength: 50 }),
    { minKeys: 0, maxKeys: 10 },
  ),
});

/** Generator for objects that do NOT conform to ComplianceRules schema */
const arbInvalidComplianceRules = fc.oneof(
  // Missing forbidden_terms
  fc.record({
    required_qualifiers: fc.array(fc.string()),
    max_values: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
  }),
  // Missing required_qualifiers
  fc.record({
    forbidden_terms: fc.array(fc.string()),
    max_values: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
  }),
  // Missing max_values
  fc.record({
    forbidden_terms: fc.array(fc.string()),
    required_qualifiers: fc.array(fc.string()),
  }),
  // forbidden_terms contains non-strings
  fc.record({
    forbidden_terms: fc.constant([123, null, true]),
    required_qualifiers: fc.array(fc.string()),
    max_values: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
  }),
  // required_qualifiers contains non-strings
  fc.record({
    forbidden_terms: fc.array(fc.string()),
    required_qualifiers: fc.constant([42, undefined, {}]),
    max_values: fc.dictionary(fc.string({ minLength: 1 }), fc.string()),
  }),
  // max_values has non-string values
  fc.record({
    forbidden_terms: fc.array(fc.string()),
    required_qualifiers: fc.array(fc.string()),
    max_values: fc.constant({ key: 123 }),
  }),
  // max_values is an array instead of object
  fc.record({
    forbidden_terms: fc.array(fc.string()),
    required_qualifiers: fc.array(fc.string()),
    max_values: fc.constant([]),
  }),
  // Primitives
  fc.oneof(fc.constant(null), fc.constant(undefined), fc.integer(), fc.string(), fc.boolean()),
);

/** Generator for valid RuleGenerationContext */
const arbRuleGenerationContext: fc.Arbitrary<RuleGenerationContext> = fc.record({
  industry: fc.string({ minLength: 1, maxLength: 50 }),
  regulator: fc.string({ minLength: 1, maxLength: 50 }),
  knownRestrictions: fc.string({ minLength: 0, maxLength: 200 }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 1: Generated rules always conform to ComplianceRules schema', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('validateComplianceRules returns true for any valid ComplianceRules object', () => {
    fc.assert(
      fc.property(arbComplianceRules, (rules) => {
        expect(validateComplianceRules(rules)).toBe(true);
      }),
      { numRuns: 200 },
    );
  });

  it('validateComplianceRules returns false for any object that does NOT conform to the schema', () => {
    fc.assert(
      fc.property(arbInvalidComplianceRules, (invalidObj) => {
        expect(validateComplianceRules(invalidObj)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });

  it('generateInitialRules always returns rules conforming to ComplianceRules schema for any valid OpenAI response', async () => {
    await fc.assert(
      fc.asyncProperty(arbRuleGenerationContext, arbComplianceRules, async (context, rules) => {
        // Mock callOpenAI to return a valid JSON response wrapping the generated rules
        const mockResponse = JSON.stringify({
          rules,
          explanation: 'Reglas generadas.',
        });

        mockedCallOpenAI.mockResolvedValueOnce({
          success: true,
          content: mockResponse,
        });

        const result = await generateInitialRules(context, []);

        // The returned rules must always conform to the schema
        expect(validateComplianceRules(result.rules)).toBe(true);

        // Verify structural properties
        expect(Array.isArray(result.rules.forbidden_terms)).toBe(true);
        expect(result.rules.forbidden_terms.every((t: unknown) => typeof t === 'string')).toBe(true);

        expect(Array.isArray(result.rules.required_qualifiers)).toBe(true);
        expect(result.rules.required_qualifiers.every((q: unknown) => typeof q === 'string')).toBe(true);

        expect(typeof result.rules.max_values).toBe('object');
        expect(result.rules.max_values).not.toBeNull();
        expect(Array.isArray(result.rules.max_values)).toBe(false);
        for (const val of Object.values(result.rules.max_values)) {
          expect(typeof val).toBe('string');
        }
      }),
      { numRuns: 100 },
    );
  });

  it('generateInitialRules conforms to schema even when OpenAI returns rules directly (no wrapper)', async () => {
    await fc.assert(
      fc.asyncProperty(arbRuleGenerationContext, arbComplianceRules, async (context, rules) => {
        // Mock callOpenAI to return the rules object directly (no { rules, explanation } wrapper)
        mockedCallOpenAI.mockResolvedValueOnce({
          success: true,
          content: JSON.stringify(rules),
        });

        const result = await generateInitialRules(context, []);

        expect(validateComplianceRules(result.rules)).toBe(true);
        expect(result.explanation).toBeTruthy();
      }),
      { numRuns: 100 },
    );
  });

  it('generateInitialRules conforms to schema when response is wrapped in markdown fences', async () => {
    await fc.assert(
      fc.asyncProperty(arbRuleGenerationContext, arbComplianceRules, async (context, rules) => {
        const wrappedContent = '```json\n' + JSON.stringify({ rules, explanation: 'Explicación.' }) + '\n```';

        mockedCallOpenAI.mockResolvedValueOnce({
          success: true,
          content: wrappedContent,
        });

        const result = await generateInitialRules(context, []);

        expect(validateComplianceRules(result.rules)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('generateInitialRules never returns invalid rules — it either returns valid rules or throws for arbitrary response strings', async () => {
    // Generate arbitrary strings (both valid and invalid JSON) to simulate unpredictable OpenAI responses
    const arbArbitraryResponse = fc.oneof(
      fc.string(), // random garbage
      fc.constant(''), // empty string
      fc.constant('null'),
      fc.constant('undefined'),
      fc.constant('{ invalid json'),
      fc.constant('```json\nnot json\n```'),
      fc.json(), // random valid JSON that may not match schema
    );

    await fc.assert(
      fc.asyncProperty(arbRuleGenerationContext, arbArbitraryResponse, async (context, responseContent) => {
        // Both first attempt and retry return the same arbitrary content
        mockedCallOpenAI.mockResolvedValue({
          success: true,
          content: responseContent,
        });

        try {
          const result = await generateInitialRules(context, []);
          // If it didn't throw, the result MUST conform to the schema
          expect(validateComplianceRules(result.rules)).toBe(true);
          expect(typeof result.explanation).toBe('string');
        } catch (error) {
          // If it threw, that's acceptable — the function refuses to return invalid data
          expect(error).toBeInstanceOf(Error);
        }
      }),
      { numRuns: 200 },
    );
  });
});
