/**
 * Property 9: Rejected suggestions are not re-suggested
 * **Validates: Requirements 7.4**
 *
 * Once a pattern is rejected via `recordRejection`, it must never appear in
 * subsequent `detectPatterns` results. Properties:
 *
 * 1. For any pattern P that has been rejected, `detectPatterns` never includes P in its suggestions
 * 2. This holds regardless of how many times P appears in validation_history
 * 3. `isAlreadyRejected` returns true for any previously rejected pattern
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';

// Mock callOpenAI before importing the module
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { detectPatterns, recordRejection, isAlreadyRejected } from '../patternDetector';
import { callOpenAI } from '../../_shared/callOpenAI';

const mockedCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// In-memory Supabase mock with stateful rejection tracking
// ---------------------------------------------------------------------------

interface ValidationHistoryRow {
  id: string;
  risk_level: string;
  issues: Array<{ text?: string; risk?: string; reason?: string; suggestedFix?: string; source?: string }>;
  piece_content: unknown;
  created_at: string;
}

function createStatefulSupabase(options: {
  historyRows: ValidationHistoryRow[];
  initialRejectedPatterns?: string[];
}) {
  const { historyRows, initialRejectedPatterns = [] } = options;
  const rejectedPatterns = new Set<string>(initialRejectedPatterns);

  const supabase = {
    from: (table: string) => {
      if (table === 'validation_history') {
        return {
          select: () => ({
            eq: () => ({
              order: () => ({
                limit: () => Promise.resolve({ data: historyRows, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'compliance_rejected_suggestions') {
        return {
          select: () => ({
            eq: (_field: string, _value: unknown) => ({
              eq: (_field2: string, patternValue: string) => ({
                maybeSingle: async () => {
                  const isRejected = rejectedPatterns.has(patternValue);
                  return {
                    data: isRejected ? { id: 'rejected-id' } : null,
                    error: null,
                  };
                },
              }),
            }),
          }),
          upsert: (row: { business_id: string; pattern: string }) => {
            rejectedPatterns.add(row.pattern);
            return Promise.resolve({ error: null });
          },
        };
      }

      return {};
    },
    _getRejectedPatterns: () => rejectedPatterns,
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Strings that collide with Object.prototype properties */
const PROTO_KEYS = new Set([
  'valueOf', 'toString', 'hasOwnProperty', 'constructor',
  'isPrototypeOf', 'propertyIsEnumerable', 'toLocaleString',
  '__proto__', '__defineGetter__', '__defineSetter__', '__lookupGetter__', '__lookupSetter__',
]);

/** Generator for pattern strings (simulating issue reasons) */
const arbPatternString = fc.string({ minLength: 1, maxLength: 30 }).filter(
  (s) => s.trim().length > 0 && !s.includes('\x00') && !PROTO_KEYS.has(s),
);

/** Generator for a non-empty set of distinct pattern strings */
const arbPatternSet = fc.uniqueArray(arbPatternString, { minLength: 1, maxLength: 8 });

/**
 * Generator for a rejection sequence: a subset of patterns to reject
 * from a given set of all patterns.
 */
function arbRejectionSubset(allPatterns: string[]) {
  return fc.subarray(allPatterns, { minLength: 1 });
}

/**
 * Build validation_history rows for a given pattern with N occurrences (always >= 3).
 */
function buildHistoryForPattern(pattern: string, occurrences: number): ValidationHistoryRow[] {
  const rows: ValidationHistoryRow[] = [];
  for (let i = 0; i < occurrences; i++) {
    rows.push({
      id: `row-${pattern}-${i}`,
      risk_level: 'high',
      issues: [
        {
          text: `Example text for ${pattern} #${i}`,
          risk: 'high',
          reason: pattern,
          suggestedFix: 'Fix it',
          source: 'base_rules',
        },
      ],
      piece_content: { headline: `Content with ${pattern}` },
      created_at: new Date(Date.now() - i * 60000).toISOString(),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 9: Rejected suggestions are not re-suggested', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('For any pattern P that has been rejected, detectPatterns never includes P in its suggestions', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbPatternSet,
        fc.nat({ max: 7 }).map((n) => n + 3), // occurrences: 3-10
        async (patterns, occurrences) => {
          // Build history rows where ALL patterns appear >= threshold
          const historyRows = patterns.flatMap((p) => buildHistoryForPattern(p, occurrences));

          // Pick a random non-empty subset to reject
          const rejectedSubset = patterns.slice(0, Math.max(1, Math.floor(patterns.length / 2)));

          const supabase = createStatefulSupabase({
            historyRows,
            initialRejectedPatterns: rejectedSubset,
          });

          // Mock OpenAI to return suggestions for all non-rejected patterns
          const nonRejected = patterns.filter((p) => !rejectedSubset.includes(p));
          mockedCallOpenAI.mockResolvedValue({
            success: true,
            content: JSON.stringify({
              suggestions: nonRejected.map((p) => ({
                pattern: p,
                type: 'forbidden_term',
                value: p,
              })),
              explanation: 'Generated suggestions for non-rejected patterns.',
            }),
          });

          const result = await detectPatterns(supabase as any, 'biz-test');

          // PROPERTY: No rejected pattern should appear in suggestions
          const suggestedPatterns = result.suggestions.map((s) => s.pattern);
          for (const rejected of rejectedSubset) {
            expect(suggestedPatterns).not.toContain(rejected);
          }
        },
      ),
      { numRuns: 100 },
    );
  });

  it('This holds regardless of how many times P appears in validation_history', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbPatternString,
        fc.integer({ min: 3, max: 50 }), // occurrences from 3 to 50
        async (pattern, occurrences) => {
          const historyRows = buildHistoryForPattern(pattern, occurrences);

          // The pattern is rejected
          const supabase = createStatefulSupabase({
            historyRows,
            initialRejectedPatterns: [pattern],
          });

          // Even if OpenAI would suggest it, it should be filtered out
          mockedCallOpenAI.mockResolvedValue({
            success: true,
            content: JSON.stringify({
              suggestions: [
                { pattern, type: 'forbidden_term', value: pattern },
              ],
              explanation: 'Suggestion generated.',
            }),
          });

          const result = await detectPatterns(supabase as any, 'biz-test');

          // PROPERTY: Rejected pattern must never appear regardless of occurrence count
          const suggestedPatterns = result.suggestions.map((s) => s.pattern);
          expect(suggestedPatterns).not.toContain(pattern);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('isAlreadyRejected returns true for any previously rejected pattern', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbPatternSet,
        async (patterns) => {
          const businessId = 'biz-test';

          // Start with no rejections
          const supabase = createStatefulSupabase({
            historyRows: [],
            initialRejectedPatterns: [],
          });

          // Record rejections for all patterns
          for (const pattern of patterns) {
            await recordRejection(supabase as any, businessId, pattern);
          }

          // PROPERTY: isAlreadyRejected must return true for every rejected pattern
          for (const pattern of patterns) {
            const rejected = await isAlreadyRejected(supabase as any, businessId, pattern);
            expect(rejected).toBe(true);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
