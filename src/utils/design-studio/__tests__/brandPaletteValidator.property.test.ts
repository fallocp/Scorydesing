import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import { validateBrandPalette } from '../brandPaletteValidator'

/**
 * Property 1: Validación de Brand Palette detecta campos faltantes
 * **Validates: Requirements 2.3**
 *
 * For any object with arbitrary fields present/absent, the validator must return
 * exactly the list of required fields that are missing. If all required fields
 * are present and non-empty, isValid must be true.
 *
 * Feature: design-studio, Property 1: Validación de Brand Palette detecta campos faltantes
 */

const REQUIRED_FIELDS_MAP: Record<string, string> = {
  primary_color: 'Color primario es requerido',
  logo_url: 'URL del logo es requerida',
}

/** Generates a non-empty, non-whitespace string */
const nonEmptyString = fc.string({ minLength: 1 }).filter((s) => s.trim().length > 0)

/** Generates a value that counts as "missing": undefined, null, empty string, or whitespace-only */
const missingValue = fc.oneof(
  fc.constant(undefined),
  fc.constant(null),
  fc.constant(''),
  fc.string().map((s) => ' '.repeat(s.length + 1)) // whitespace-only
)

/** Generates an arbitrary BrandPalette-like object with each required field either present (valid) or absent/empty */
const brandPaletteArbitrary = fc.record({
  primary_color: fc.oneof(nonEmptyString, missingValue),
  logo_url: fc.oneof(nonEmptyString, missingValue),
  // Optional extra fields that should not affect validation
  secondary_color: fc.option(fc.string(), { nil: undefined }),
  accent_color: fc.option(fc.string(), { nil: undefined }),
  disclaimer: fc.option(fc.string(), { nil: undefined }),
  fonts: fc.option(fc.string(), { nil: undefined }),
})

describe('brandPaletteValidator - Property Tests', () => {
  it('Property 1: returns exactly the missing required fields for any palette object', () => {
    fc.assert(
      fc.property(brandPaletteArbitrary, (palette) => {
        const result = validateBrandPalette(palette as Record<string, unknown>)

        // Compute expected missing fields
        const expectedMissing: string[] = []
        for (const [field, message] of Object.entries(REQUIRED_FIELDS_MAP)) {
          const value = palette[field as keyof typeof palette]
          if (
            value === undefined ||
            value === null ||
            (typeof value === 'string' && value.trim() === '')
          ) {
            expectedMissing.push(message)
          }
        }

        // The validator must return exactly the expected missing fields
        expect(result.missingFields).toEqual(expectedMissing)

        // isValid must be true iff no fields are missing
        expect(result.isValid).toBe(expectedMissing.length === 0)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 1: always returns isValid=true when all required fields are present and non-empty', () => {
    fc.assert(
      fc.property(nonEmptyString, nonEmptyString, (primaryColor, logoUrl) => {
        const palette = {
          primary_color: primaryColor,
          logo_url: logoUrl,
        }

        const result = validateBrandPalette(palette)

        expect(result.isValid).toBe(true)
        expect(result.missingFields).toHaveLength(0)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 1: returns all required field messages for null/undefined input', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.constant(null), fc.constant(undefined)),
        (palette) => {
          const result = validateBrandPalette(palette)

          expect(result.isValid).toBe(false)
          expect(result.missingFields).toHaveLength(Object.keys(REQUIRED_FIELDS_MAP).length)

          // All required field messages must be present
          for (const message of Object.values(REQUIRED_FIELDS_MAP)) {
            expect(result.missingFields).toContain(message)
          }
        }
      ),
      { numRuns: 100 }
    )
  })
})
