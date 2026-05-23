/**
 * Property Test: Validación de archivo de referencia
 *
 * Feature: design-studio, Property 5: Validación de archivo de referencia
 * **Validates: Requirements 4.1, 4.5**
 *
 * For any file with an arbitrary MIME type and size, the validator must accept it
 * if and only if its MIME type ∈ {image/png, image/jpeg, image/webp, application/pdf}
 * AND its size ≤ 10MB. Any file that does not satisfy both conditions must be rejected
 * with descriptive error messages.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  validateReferenceFile,
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE_BYTES,
} from '../fileValidator';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid MIME types (the 4 allowed formats) */
const arbValidMimeType = fc.constantFrom(
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
);

/** Generator for invalid MIME types (common formats that are NOT allowed) */
const arbInvalidMimeType = fc.oneof(
  fc.constantFrom(
    'image/gif',
    'image/bmp',
    'image/tiff',
    'image/svg+xml',
    'video/mp4',
    'audio/mpeg',
    'text/plain',
    'text/html',
    'application/json',
    'application/zip',
    '',
  ),
  // Also generate completely random MIME-like strings that are not in the allowed list
  fc.string({ minLength: 1, maxLength: 50 }).filter(
    (s) => !(ALLOWED_MIME_TYPES as readonly string[]).includes(s),
  ),
);

/** Generator for valid file sizes (0 to 10MB inclusive) */
const arbValidSize = fc.integer({ min: 0, max: MAX_FILE_SIZE_BYTES });

/** Generator for invalid file sizes (exceeding 10MB, up to ~50MB) */
const arbInvalidSize = fc.integer({ min: MAX_FILE_SIZE_BYTES + 1, max: 50 * 1024 * 1024 });

/** Generator for any file size in the full range (0 to ~50MB) */
const arbAnySize = fc.integer({ min: 0, max: 50 * 1024 * 1024 });

/** Generator for any MIME type (mix of valid and invalid) */
const arbAnyMimeType = fc.oneof(arbValidMimeType, arbInvalidMimeType);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 5: Validación de archivo de referencia', () => {
  it('a file is valid iff MIME type ∈ ALLOWED_MIME_TYPES AND size ≤ MAX_FILE_SIZE_BYTES', () => {
    fc.assert(
      fc.property(arbAnyMimeType, arbAnySize, (mimeType, size) => {
        const result = validateReferenceFile({ type: mimeType, size });

        const isAllowedType = (ALLOWED_MIME_TYPES as readonly string[]).includes(mimeType);
        const isAllowedSize = size <= MAX_FILE_SIZE_BYTES;
        const expectedValid = isAllowedType && isAllowedSize;

        expect(result.isValid).toBe(expectedValid);
      }),
      { numRuns: 200 },
    );
  });

  it('valid MIME type + valid size always produces isValid = true with no errors', () => {
    fc.assert(
      fc.property(arbValidMimeType, arbValidSize, (mimeType, size) => {
        const result = validateReferenceFile({ type: mimeType, size });

        expect(result.isValid).toBe(true);
        expect(result.errors).toEqual([]);
      }),
      { numRuns: 100 },
    );
  });

  it('invalid MIME type always produces a format error regardless of size', () => {
    fc.assert(
      fc.property(arbInvalidMimeType, arbAnySize, (mimeType, size) => {
        const result = validateReferenceFile({ type: mimeType, size });

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
      }),
      { numRuns: 100 },
    );
  });

  it('size exceeding 10MB always produces a size error regardless of MIME type', () => {
    fc.assert(
      fc.property(arbAnyMimeType, arbInvalidSize, (mimeType, size) => {
        const result = validateReferenceFile({ type: mimeType, size });

        expect(result.isValid).toBe(false);
        expect(result.errors).toContain('El archivo excede el límite de 10MB');
      }),
      { numRuns: 100 },
    );
  });

  it('invalid MIME type + invalid size produces exactly 2 errors', () => {
    fc.assert(
      fc.property(arbInvalidMimeType, arbInvalidSize, (mimeType, size) => {
        const result = validateReferenceFile({ type: mimeType, size });

        expect(result.isValid).toBe(false);
        expect(result.errors).toHaveLength(2);
        expect(result.errors).toContain('Formato no soportado. Usa PNG, JPG, WEBP o PDF');
        expect(result.errors).toContain('El archivo excede el límite de 10MB');
      }),
      { numRuns: 100 },
    );
  });
});
