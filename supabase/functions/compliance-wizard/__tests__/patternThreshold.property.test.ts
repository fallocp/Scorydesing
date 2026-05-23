/**
 * Property 8: Pattern detection threshold
 * **Validates: Requirements 7.1**
 *
 * The `detectPatterns` function must only suggest rules for patterns that appear
 * 3 or more times. Properties:
 *
 * 1. For any set of validation history rows where a pattern appears fewer than
 *    3 times, no suggestion is generated for that pattern
 * 2. For any set where a pattern appears 3+ times, a suggestion MAY be generated
 *    (depends on rejection status)
 * 3. The threshold is exactly 3 (not 2, not 4)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock callOpenAI before importing the module
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { detectPatterns } from '../patternDetector';
import { callOpenAI } from '../../_shared/callOpenAI';

const mockedCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ValidationHistoryRow {
  id: string;
  risk_level: string;
  issues: Array<{
    text?: string;
    risk?: string;
    reason?: string;
    suggestedFix?: string;
    source?: string;
  }>;
  piece_content: unknown;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for a pattern reason string (lowercase + underscore) */
const arbReason = fc
  .array(
    fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz_'.split('')),
    { minLength: 3, maxLength: 20 },
  )
  .map((chars) => chars.join(''));

/** Generator for issue text */
const arbIssueText = fc.string({ minLength: 1, maxLength: 50 });

/** Generator for a single high-risk validation history row with a given reason */
function arbHighRiskRow(reason: string): fc.Arbitrary<ValidationHistoryRow> {
  return arbIssueText.map((text) => ({
    id: crypto.randomUUID(),
    risk_level: 'high',
    issues: [{ text, risk: 'high', reason, suggestedFix: 'Fix it', source: 'base_rules' }],
    piece_content: { headline: text },
    created_at: new Date().toISOString(),
  }));
}

/** Generator for a set of rows where each pattern appears a specific number of times */
function arbRowsWithPatternCounts(
  patternCounts: Array<{ reason: string; count: number }>,
): fc.Arbitrary<ValidationHistoryRow[]> {
  const rowArbitraries = patternCounts.flatMap(({ reason, count }) =>
    Array.from({ length: count }, () => arbHighRiskRow(reason)),
  );

  if (rowArbitraries.length === 0) {
    return fc.constant([]);
  }

  return fc.tuple(...(rowArbitraries as [fc.Arbitrary<ValidationHistoryRow>, ...fc.Arbitrary<ValidationHistoryRow>[]])).map(
    (rows) => rows,
  );
}

// ---------------------------------------------------------------------------
// Mock Supabase factory
// ---------------------------------------------------------------------------

function createMockSupabase(historyRows: ValidationHistoryRow[]) {
  return {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'validation_history') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: historyRows, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'compliance_rejected_suggestions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              }),
            }),
          }),
        };
      }

      return {};
    }),
  };
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 8: Pattern detection threshold', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Patterns appearing fewer than 3 times never generate suggestions', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate 1-5 distinct patterns, each appearing 1 or 2 times
        fc.integer({ min: 1, max: 5 }).chain((numPatterns) =>
          fc.tuple(
            fc.array(arbReason, { minLength: numPatterns, maxLength: numPatterns })
              .map((reasons) => [...new Set(reasons)].slice(0, numPatterns)),
            fc.array(
              fc.integer({ min: 1, max: 2 }),
              { minLength: numPatterns, maxLength: numPatterns },
            ),
          ),
        ),
        async ([reasons, counts]) => {
          // Ensure we have valid data
          const uniqueReasons = [...new Set(reasons)];
          if (uniqueReasons.length === 0) return;

          const patternCounts = uniqueReasons.map((reason, i) => ({
            reason,
            count: counts[i % counts.length],
          }));

          // Build rows
          const rows: ValidationHistoryRow[] = patternCounts.flatMap(({ reason, count }) =>
            Array.from({ length: count }, () => ({
              id: crypto.randomUUID(),
              risk_level: 'high',
              issues: [{ text: `text for ${reason}`, risk: 'high', reason, suggestedFix: 'Fix', source: 'base_rules' }],
              piece_content: { headline: `text for ${reason}` },
              created_at: new Date().toISOString(),
            })),
          );

          const supabase = createMockSupabase(rows);

          const result = await detectPatterns(supabase as any, 'biz-test');

          // No suggestions should be generated since all patterns < 3 occurrences
          expect(result.suggestions).toEqual([]);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Patterns appearing 3+ times MAY generate suggestions (OpenAI is called)', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate a pattern that appears 3-10 times
        fc.tuple(
          arbReason,
          fc.integer({ min: 3, max: 10 }),
        ),
        async ([reason, count]) => {
          mockedCallOpenAI.mockReset();

          const rows: ValidationHistoryRow[] = Array.from({ length: count }, (_, i) => ({
            id: crypto.randomUUID(),
            risk_level: 'high',
            issues: [{ text: `example text ${i}`, risk: 'high', reason, suggestedFix: 'Fix', source: 'base_rules' }],
            piece_content: { headline: `example text ${i}` },
            created_at: new Date().toISOString(),
          }));

          const supabase = createMockSupabase(rows);

          // Mock OpenAI to return a valid suggestion
          mockedCallOpenAI.mockResolvedValueOnce({
            success: true,
            content: JSON.stringify({
              suggestions: [
                {
                  pattern: reason,
                  type: 'forbidden_term',
                  value: reason,
                },
              ],
              explanation: 'Pattern detected.',
            }),
          });

          const result = await detectPatterns(supabase as any, 'biz-test');

          // OpenAI was called (pattern met threshold)
          expect(mockedCallOpenAI).toHaveBeenCalled();

          // A suggestion MAY be generated (depends on OpenAI response parsing)
          // Since we mocked a valid response, we expect a suggestion
          expect(result.suggestions.length).toBeGreaterThanOrEqual(1);
          expect(result.suggestions[0].occurrences).toBe(count);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('Threshold is exactly 3: 2 occurrences produce no suggestion, 3 occurrences do', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbReason,
        async (reason) => {
          // Reset mocks at the start of each property iteration
          mockedCallOpenAI.mockReset();

          // --- Case 1: exactly 2 occurrences → no suggestion ---
          const twoRows: ValidationHistoryRow[] = Array.from({ length: 2 }, (_, i) => ({
            id: crypto.randomUUID(),
            risk_level: 'high',
            issues: [{ text: `text ${i}`, risk: 'high', reason, suggestedFix: 'Fix', source: 'base_rules' }],
            piece_content: { headline: `text ${i}` },
            created_at: new Date().toISOString(),
          }));

          const supabaseTwo = createMockSupabase(twoRows);
          const resultTwo = await detectPatterns(supabaseTwo as any, 'biz-test');

          expect(resultTwo.suggestions).toEqual([]);
          expect(mockedCallOpenAI).not.toHaveBeenCalled();

          // Reset mock call history before the 3-occurrence case
          mockedCallOpenAI.mockReset();

          // --- Case 2: exactly 3 occurrences → suggestion generated ---
          const threeRows: ValidationHistoryRow[] = Array.from({ length: 3 }, (_, i) => ({
            id: crypto.randomUUID(),
            risk_level: 'high',
            issues: [{ text: `text ${i}`, risk: 'high', reason, suggestedFix: 'Fix', source: 'base_rules' }],
            piece_content: { headline: `text ${i}` },
            created_at: new Date().toISOString(),
          }));

          const supabaseThree = createMockSupabase(threeRows);

          mockedCallOpenAI.mockResolvedValueOnce({
            success: true,
            content: JSON.stringify({
              suggestions: [
                {
                  pattern: reason,
                  type: 'forbidden_term',
                  value: reason,
                },
              ],
              explanation: 'Pattern detected.',
            }),
          });

          const resultThree = await detectPatterns(supabaseThree as any, 'biz-test');

          // OpenAI was called for the 3-occurrence case
          expect(mockedCallOpenAI).toHaveBeenCalled();
          expect(resultThree.suggestions.length).toBeGreaterThanOrEqual(1);
        },
      ),
      { numRuns: 100 },
    );
  });
});
