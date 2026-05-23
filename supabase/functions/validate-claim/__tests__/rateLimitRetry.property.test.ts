/**
 * Property-based tests for validatePieceOpenAI.ts
 *
 * Feature: claim-validator, Property 11: Rate limit retry with bounded attempts
 *
 * For any rate_limit error from callOpenAI with a `retryAfter` value,
 * the validator SHALL wait at least `retryAfter` seconds before retrying,
 * and SHALL NOT exceed 2 total retry attempts per piece.
 *
 * **Validates: Requirements 9.1**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { PieceInput } from '../lib/types.ts';
import type { PromptBuildResult } from '../lib/buildPrompt.ts';
import type { CallOpenAIResult } from '../../_shared/callOpenAI.ts';

// Mock callOpenAI
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { callOpenAI } from '../../_shared/callOpenAI.ts';
import { validatePieceOpenAI } from '../lib/validatePieceOpenAI.ts';
import { MAX_RETRIES } from '../lib/constants.ts';

const mockedCallOpenAI = vi.mocked(callOpenAI);

/**
 * Arbitrary for retryAfter values — very small for test speed (0.01-0.05 seconds).
 * The property being tested is the bounded retry count, not actual wait time precision.
 */
const retryAfterArb = fc.double({ min: 0.01, max: 0.05, noNaN: true });

/** A valid PieceInput for testing */
const testPiece: PieceInput = {
  headline: 'Test headline',
  body: 'Test body content',
  cta: 'Click here',
};

/** A valid PromptBuildResult for testing */
const testPrompt: PromptBuildResult = {
  systemPrompt: 'You are a compliance reviewer.',
  userPrompt: 'Review this piece.',
};

describe('Feature: claim-validator, Property 11: Rate limit retry with bounded attempts', () => {
  beforeEach(() => {
    mockedCallOpenAI.mockReset();
  });

  it('never exceeds MAX_RETRIES (2) retry attempts for rate_limit errors', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryAfterArb,
        async (retryAfter) => {
          let callCount = 0;

          // Always return rate_limit error, track calls via implementation
          mockedCallOpenAI.mockImplementation(async () => {
            callCount++;
            return {
              success: false,
              error: 'rate_limit',
              retryAfter,
              message: 'Rate limited',
            } as CallOpenAIResult;
          });

          const result = await validatePieceOpenAI(testPiece, 0, testPrompt);

          // Total calls should be initial + MAX_RETRIES = 3 (never more)
          expect(callCount).toBe(MAX_RETRIES + 1);
          expect(callCount).toBeLessThanOrEqual(3);

          // Result should be an error (retries exhausted)
          expect(result).toHaveProperty('error');
          expect(result).toHaveProperty('pieceIndex', 0);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('waits at least retryAfter seconds between retry attempts', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryAfterArb,
        async (retryAfter) => {
          const callTimestamps: number[] = [];

          mockedCallOpenAI.mockImplementation(async () => {
            callTimestamps.push(performance.now());
            return {
              success: false,
              error: 'rate_limit',
              retryAfter,
              message: 'Rate limited',
            } as CallOpenAIResult;
          });

          await validatePieceOpenAI(testPiece, 0, testPrompt);

          // Should have MAX_RETRIES + 1 calls (initial + 2 retries)
          expect(callTimestamps.length).toBe(MAX_RETRIES + 1);

          // Verify time between calls is at least retryAfter * 1000 ms
          for (let i = 1; i < callTimestamps.length; i++) {
            const elapsedMs = callTimestamps[i] - callTimestamps[i - 1];
            // Allow small tolerance for timer imprecision
            expect(elapsedMs).toBeGreaterThanOrEqual(retryAfter * 1000 - 5);
          }
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);

  it('returns error result with correct pieceIndex after exhausting all retries', async () => {
    await fc.assert(
      fc.asyncProperty(
        retryAfterArb,
        fc.integer({ min: 0, max: 10 }),
        async (retryAfter, pieceIndex) => {
          let callCount = 0;

          mockedCallOpenAI.mockImplementation(async () => {
            callCount++;
            return {
              success: false,
              error: 'rate_limit',
              retryAfter,
              message: 'Rate limited',
            } as CallOpenAIResult;
          });

          const result = await validatePieceOpenAI(testPiece, pieceIndex, testPrompt);

          // Should return error with correct pieceIndex
          expect(result).toHaveProperty('error');
          expect(result).toHaveProperty('pieceIndex', pieceIndex);

          // Should not exceed MAX_RETRIES + 1 total calls
          expect(callCount).toBeLessThanOrEqual(MAX_RETRIES + 1);
        },
      ),
      { numRuns: 100 },
    );
  }, 30000);
});
