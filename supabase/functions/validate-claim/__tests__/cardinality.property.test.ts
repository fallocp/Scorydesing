/**
 * Property-based tests for Input-output cardinality preservation
 *
 * Feature: claim-validator, Property 1: Input-output cardinality preservation
 *
 * For any valid array of N pieces submitted to the validator, the response
 * `results` array SHALL contain exactly N elements, one per input piece,
 * regardless of individual piece validation outcomes or which validation
 * levels were executed.
 *
 * **Validates: Requirements 1.1**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePieceBaseRules } from '../lib/baseRulesEngine.ts';
import { combineResults } from '../lib/combineResults.ts';
import { aggregateResults } from '../lib/aggregateResults.ts';
import type { PieceInput } from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
// ---------------------------------------------------------------------------

/**
 * Generates a valid PieceInput with non-empty required fields.
 * Uses alphanumeric strings to produce a mix of clean and potentially
 * rule-triggering content.
 */
const pieceInputArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: fc.string({ minLength: 1, maxLength: 60 }),
  body: fc.string({ minLength: 1, maxLength: 200 }),
  cta: fc.string({ minLength: 1, maxLength: 40 }),
  footer: fc.option(fc.string({ minLength: 0, maxLength: 50 }), { nil: undefined }),
  proofPoints: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
  avoidClaims: fc.option(fc.array(fc.string({ minLength: 1, maxLength: 30 }), { minLength: 0, maxLength: 5 }), { nil: undefined }),
});

/**
 * Generates an array of 1-50 valid pieces.
 */
const piecesArrayArb: fc.Arbitrary<PieceInput[]> = fc.array(pieceInputArb, {
  minLength: 1,
  maxLength: 50,
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 1: Input-output cardinality preservation', () => {
  it('results.length === pieces.length for any valid array of pieces (Nivel 1 only)', () => {
    fc.assert(
      fc.property(
        piecesArrayArb,
        fc.boolean(),
        (pieces, claimValidationEnabled) => {
          // Run Nivel 1 for each piece
          const combinedResults = pieces.map((piece, index) => {
            const level1Result = validatePieceBaseRules(piece);
            // Combine without Nivel 2 for simplicity
            return combineResults(index, piece, level1Result);
          });

          // Aggregate results
          const response = aggregateResults(combinedResults, claimValidationEnabled);

          // Assert cardinality preservation
          expect(response.results.length).toBe(pieces.length);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('each result has the correct pieceIndex matching its position', () => {
    fc.assert(
      fc.property(
        piecesArrayArb,
        fc.boolean(),
        (pieces, claimValidationEnabled) => {
          // Run Nivel 1 for each piece
          const combinedResults = pieces.map((piece, index) => {
            const level1Result = validatePieceBaseRules(piece);
            return combineResults(index, piece, level1Result);
          });

          // Aggregate results
          const response = aggregateResults(combinedResults, claimValidationEnabled);

          // Assert each result has correct pieceIndex
          for (let i = 0; i < response.results.length; i++) {
            expect(response.results[i].pieceIndex).toBe(i);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
