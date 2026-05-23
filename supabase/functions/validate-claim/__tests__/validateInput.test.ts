/**
 * Unit tests for validateInput.ts
 *
 * Tests the validateRequest function for:
 * - Valid requests pass through correctly
 * - Empty/missing pieces array returns validation error
 * - Missing required fields (headline, body, cta) detected with piece index
 * - At least one of business_id or brand must be present
 *
 * Requirements: 1.1, 1.2, 1.3, 1.4, 7.3
 */
import { describe, it, expect } from 'vitest';
import { validateRequest } from '../lib/validateInput.ts';
import type { ValidateClaimRequest, ValidationError } from '../lib/types.ts';

function isValidationError(result: unknown): result is ValidationError {
  return (
    typeof result === 'object' &&
    result !== null &&
    (result as ValidationError).error === 'validation_error'
  );
}

describe('validateRequest', () => {
  describe('valid requests', () => {
    it('should accept a valid request with business_id and pieces', () => {
      const body = {
        business_id: '123e4567-e89b-12d3-a456-426614174000',
        pieces: [
          { headline: 'Test headline', body: 'Test body', cta: 'Click here' },
        ],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(false);
      const req = result as ValidateClaimRequest;
      expect(req.business_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(req.pieces).toHaveLength(1);
    });

    it('should accept a valid request with brand slug', () => {
      const body = {
        brand: 'my-brand',
        pieces: [
          { headline: 'H', body: 'B', cta: 'C' },
        ],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(false);
      const req = result as ValidateClaimRequest;
      expect(req.brand).toBe('my-brand');
    });

    it('should accept a request with both business_id and brand', () => {
      const body = {
        business_id: '123e4567-e89b-12d3-a456-426614174000',
        brand: 'my-brand',
        pieces: [
          { headline: 'H', body: 'B', cta: 'C' },
        ],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(false);
      const req = result as ValidateClaimRequest;
      expect(req.business_id).toBe('123e4567-e89b-12d3-a456-426614174000');
      expect(req.brand).toBe('my-brand');
    });

    it('should include pipelineRunId when provided', () => {
      const body = {
        business_id: 'abc',
        pieces: [{ headline: 'H', body: 'B', cta: 'C' }],
        pipelineRunId: 'run-123',
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(false);
      const req = result as ValidateClaimRequest;
      expect(req.pipelineRunId).toBe('run-123');
    });

    it('should accept pieces with optional fields', () => {
      const body = {
        business_id: 'abc',
        pieces: [
          {
            headline: 'H',
            body: 'B',
            cta: 'C',
            footer: 'Some footer',
            proofPoints: ['point1'],
            avoidClaims: ['claim1'],
          },
        ],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(false);
    });
  });

  describe('missing business_id and brand', () => {
    it('should reject when neither business_id nor brand is present', () => {
      const body = {
        pieces: [{ headline: 'H', body: 'B', cta: 'C' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.message).toContain('business_id');
      expect(err.message).toContain('brand');
    });

    it('should reject when business_id is empty string', () => {
      const body = {
        business_id: '   ',
        pieces: [{ headline: 'H', body: 'B', cta: 'C' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
    });

    it('should reject when brand is empty string', () => {
      const body = {
        brand: '',
        pieces: [{ headline: 'H', body: 'B', cta: 'C' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
    });
  });

  describe('pieces validation', () => {
    it('should reject when pieces is not an array', () => {
      const body = {
        business_id: 'abc',
        pieces: 'not-an-array',
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.message).toContain('pieces');
      expect(err.message).toContain('non-empty array');
    });

    it('should reject when pieces is an empty array', () => {
      const body = {
        business_id: 'abc',
        pieces: [],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.message).toContain('non-empty array');
    });

    it('should reject when pieces is null', () => {
      const body = {
        business_id: 'abc',
        pieces: null,
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
    });
  });

  describe('piece field validation', () => {
    it('should reject piece missing headline', () => {
      const body = {
        business_id: 'abc',
        pieces: [{ body: 'B', cta: 'C' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(0);
      expect(err.details?.missingFields).toContain('headline');
    });

    it('should reject piece missing body', () => {
      const body = {
        business_id: 'abc',
        pieces: [{ headline: 'H', cta: 'C' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(0);
      expect(err.details?.missingFields).toContain('body');
    });

    it('should reject piece missing cta', () => {
      const body = {
        business_id: 'abc',
        pieces: [{ headline: 'H', body: 'B' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(0);
      expect(err.details?.missingFields).toContain('cta');
    });

    it('should report all missing fields at once', () => {
      const body = {
        business_id: 'abc',
        pieces: [{}],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(0);
      expect(err.details?.missingFields).toEqual(
        expect.arrayContaining(['headline', 'body', 'cta']),
      );
      expect(err.details?.missingFields).toHaveLength(3);
    });

    it('should reject piece with empty string fields', () => {
      const body = {
        business_id: 'abc',
        pieces: [{ headline: '', body: '  ', cta: 'C' }],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(0);
      expect(err.details?.missingFields).toContain('headline');
      expect(err.details?.missingFields).toContain('body');
    });

    it('should report correct piece index for second piece', () => {
      const body = {
        business_id: 'abc',
        pieces: [
          { headline: 'H', body: 'B', cta: 'C' },
          { headline: 'H2', body: '' },
        ],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(1);
      expect(err.details?.missingFields).toContain('body');
      expect(err.details?.missingFields).toContain('cta');
    });

    it('should reject when piece is not an object', () => {
      const body = {
        business_id: 'abc',
        pieces: ['not-an-object'],
      };

      const result = validateRequest(body);
      expect(isValidationError(result)).toBe(true);
      const err = result as ValidationError;
      expect(err.details?.pieceIndex).toBe(0);
    });
  });

  describe('edge cases', () => {
    it('should reject null body', () => {
      const result = validateRequest(null);
      expect(isValidationError(result)).toBe(true);
    });

    it('should reject non-object body', () => {
      const result = validateRequest('string');
      expect(isValidationError(result)).toBe(true);
    });

    it('should reject undefined body', () => {
      const result = validateRequest(undefined);
      expect(isValidationError(result)).toBe(true);
    });
  });
});
