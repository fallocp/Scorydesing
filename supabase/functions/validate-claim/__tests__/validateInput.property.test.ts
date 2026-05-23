/**
 * Property-based tests for validateInput.ts
 *
 * Feature: claim-validator, Property 2: Input validation detects missing required fields
 *
 * For any piece missing one or more required fields (headline, body, cta),
 * the validator SHALL return an HTTP 400 error that correctly identifies
 * all missing field names and the piece's position in the array.
 *
 * **Validates: Requirements 1.3, 1.4**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validateRequest } from '../lib/validateInput.ts';
import type { ValidationError } from '../lib/types.ts';

function isValidationError(result: unknown): result is ValidationError {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as ValidationError).error === 'validation_error'
  );
}

/** Arbitrary for a non-empty string (at least 1 visible character) */
const nonEmptyStringArb = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0);

/** The three required fields for a piece */
const REQUIRED_FIELDS = ['headline', 'body', 'cta'] as const;

/**
 * Arbitrary that generates a non-empty subset of required fields to remove.
 * Returns an array of 1-3 field names.
 */
const missingFieldsSubsetArb = fc
  .subarray([...REQUIRED_FIELDS], { minLength: 1, maxLength: 3 });

/**
 * Arbitrary for a valid piece (all required fields present).
 */
const validPieceArb = fc.record({
  headline: nonEmptyStringArb,
  body: nonEmptyStringArb,
  cta: nonEmptyStringArb,
});

/**
 * Arbitrary for a piece with specific fields removed.
 * Takes a subset of fields to remove and generates a piece missing those fields.
 */
function pieceWithMissingFieldsArb(fieldsToRemove: readonly string[]) {
  return validPieceArb.map((piece) => {
    const modified: Record<string, unknown> = { ...piece };
    for (const field of fieldsToRemove) {
      delete modified[field];
    }
    return modified;
  });
}

/**
 * Arbitrary for a piece with specific fields set to empty/whitespace strings.
 * This tests the "non-empty string" validation path.
 */
function pieceWithEmptyFieldsArb(fieldsToEmpty: readonly string[]) {
  return fc.tuple(validPieceArb, fc.constantFrom('', ' ', '  ', '\t', '\n')).map(([piece, emptyVal]) => {
    const modified: Record<string, unknown> = { ...piece };
    for (const field of fieldsToEmpty) {
      modified[field] = emptyVal;
    }
    return modified;
  });
}

describe('Feature: claim-validator, Property 2: Input validation detects missing required fields', () => {
  it('detects missing required fields (deleted) and reports correct piece position and field names', () => {
    fc.assert(
      fc.property(
        // Generate 0..4 valid pieces before the invalid one
        fc.array(validPieceArb, { minLength: 0, maxLength: 4 }),
        // Generate a non-empty subset of fields to remove
        missingFieldsSubsetArb,
        // Generate the invalid piece based on the fields to remove
        missingFieldsSubsetArb.chain((fields) => pieceWithMissingFieldsArb(fields).map((piece) => ({ piece, fields }))),
        (validPiecesBefore, _unusedFields, { piece: invalidPiece, fields: removedFields }) => {
          const pieces = [...validPiecesBefore, invalidPiece];
          const expectedIndex = validPiecesBefore.length;

          const body = {
            business_id: 'test-business-id',
            pieces,
          };

          const result = validateRequest(body);

          // Must be a validation error
          expect(isValidationError(result)).toBe(true);
          const err = result as ValidationError;

          // Must report the correct piece index
          expect(err.details?.pieceIndex).toBe(expectedIndex);

          // Must identify all missing fields
          expect(err.details?.missingFields).toBeDefined();
          expect(err.details!.missingFields!.sort()).toEqual([...removedFields].sort());
        },
      ),
      { numRuns: 100 },
    );
  });

  it('detects empty/whitespace required fields and reports correct piece position and field names', () => {
    fc.assert(
      fc.property(
        // Generate 0..4 valid pieces before the invalid one
        fc.array(validPieceArb, { minLength: 0, maxLength: 4 }),
        // Generate a non-empty subset of fields to set as empty
        missingFieldsSubsetArb.chain((fields) => pieceWithEmptyFieldsArb(fields).map((piece) => ({ piece, fields }))),
        (validPiecesBefore, { piece: invalidPiece, fields: emptiedFields }) => {
          const pieces = [...validPiecesBefore, invalidPiece];
          const expectedIndex = validPiecesBefore.length;

          const body = {
            business_id: 'test-business-id',
            pieces,
          };

          const result = validateRequest(body);

          // Must be a validation error
          expect(isValidationError(result)).toBe(true);
          const err = result as ValidationError;

          // Must report the correct piece index
          expect(err.details?.pieceIndex).toBe(expectedIndex);

          // Must identify all empty fields as missing
          expect(err.details?.missingFields).toBeDefined();
          expect(err.details!.missingFields!.sort()).toEqual([...emptiedFields].sort());
        },
      ),
      { numRuns: 100 },
    );
  });
});
