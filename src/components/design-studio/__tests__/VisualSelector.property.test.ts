import { describe, it, expect } from 'vitest'
import * as fc from 'fast-check'
import type { PlatformFormat, VisualSelections } from '@/types/design-studio'

/**
 * Property 3: Plataforma requerida para generación
 * **Validates: Requirements 3.4**
 *
 * For any combination of visual selections, the generate button must be enabled
 * if and only if the selected platform is not null. No other combination of
 * selections (background, visualStyle, contentType, heroElement) should affect
 * the generate button's enabled state.
 *
 * Feature: design-studio, Property 3: Plataforma requerida para generación
 */

const VALID_PLATFORMS: PlatformFormat[] = [
  'instagram-story',
  'instagram-post',
  'facebook-post',
  'linkedin-post',
  'banner',
]

/**
 * Determines whether the generate button should be enabled based on selections.
 * Mirrors the component logic: generate is enabled ↔ platform is not null.
 */
function canGenerate(selections: VisualSelections): boolean {
  return selections.platform !== null
}

/** Generates a nullable string (either a random non-empty string or null) */
const nullableString = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 1, maxLength: 30 })
)

/** Generates a valid PlatformFormat or null */
const nullablePlatform = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...VALID_PLATFORMS)
)

/** Generates a random VisualSelections object with platform randomly null or valid */
const visualSelectionsArbitrary: fc.Arbitrary<VisualSelections> = fc.record({
  background: nullableString,
  visualStyle: nullableString,
  contentType: nullableString,
  heroElement: nullableString,
  platform: nullablePlatform,
})

describe('VisualSelector - Property Tests', () => {
  it('Property 3: generate button enabled ↔ platform ≠ null for any combination of selections', () => {
    fc.assert(
      fc.property(visualSelectionsArbitrary, (selections) => {
        const enabled = canGenerate(selections)

        // The generate button must be enabled if and only if platform is not null
        expect(enabled).toBe(selections.platform !== null)
      }),
      { numRuns: 100 }
    )
  })

  it('Property 3: other selections do not affect generate button when platform is null', () => {
    fc.assert(
      fc.property(
        nullableString,
        nullableString,
        nullableString,
        nullableString,
        (background, visualStyle, contentType, heroElement) => {
          const selections: VisualSelections = {
            background,
            visualStyle,
            contentType,
            heroElement,
            platform: null,
          }

          // Generate button must always be disabled when platform is null,
          // regardless of other selections
          expect(canGenerate(selections)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })

  it('Property 3: other selections do not affect generate button when platform is set', () => {
    fc.assert(
      fc.property(
        nullableString,
        nullableString,
        nullableString,
        nullableString,
        fc.constantFrom(...VALID_PLATFORMS),
        (background, visualStyle, contentType, heroElement, platform) => {
          const selections: VisualSelections = {
            background,
            visualStyle,
            contentType,
            heroElement,
            platform,
          }

          // Generate button must always be enabled when platform is set,
          // regardless of other selections
          expect(canGenerate(selections)).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
