/**
 * Property Test: Completitud del prompt de generación
 *
 * Feature: design-studio, Property 4: Completitud del prompt de generación
 * **Validates: Requirements 3.5, 5.6**
 *
 * For any valid VisualSelections (with at least platform selected) and any complete BrandPalette,
 * the built prompt must contain:
 * 1. All non-null selection values from VisualSelections
 * 2. The primary_color, secondary_color, accent_color values
 * 3. The logo_url
 * 4. Any non-undefined font values (display, body)
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { buildGenerationPrompt } from '../promptBuilder';
import type { VisualSelections, BrandPalette, PlatformFormat, ContentMode } from '@/types/design-studio';

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

const arbPlatform: fc.Arbitrary<PlatformFormat> = fc.constantFrom(
  'instagram-story' as const,
  'instagram-post' as const,
  'facebook-post' as const,
  'linkedin-post' as const,
  'banner' as const,
);

/** Generate a non-empty string suitable for selection values (no whitespace-only). */
const arbNonEmptyString = fc.string({ minLength: 1, maxLength: 50 }).filter((s) => s.trim().length > 0);

/** Generate a nullable selection value: either a non-empty string or null. */
const arbNullableSelection = fc.oneof(arbNonEmptyString, fc.constant(null));

/**
 * Generate valid VisualSelections with platform always present (required for generation).
 * Other fields are randomly null or non-empty strings.
 */
const arbVisualSelections: fc.Arbitrary<VisualSelections> = fc.record({
  background: arbNullableSelection,
  visualStyle: arbNullableSelection,
  contentType: arbNullableSelection,
  heroElement: arbNullableSelection,
  platform: arbPlatform,
  contentMode: fc.constantFrom('free' as const, 'branch' as const, 'custom' as const),
  commercialBranchSlug: arbNullableSelection,
  customIdea: arbNullableSelection,
  pieceCopy: fc.constant(null),
  pieceImagePrompt: fc.constant(null),
});

/** Generate a hex color string. */
const arbHexColor = fc
  .array(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'A', 'B', 'C', 'D', 'E', 'F'), { minLength: 6, maxLength: 6 })
  .map((chars) => `#${chars.join('')}`);

/** Generate a non-empty font name or undefined. */
const arbOptionalFont = fc.oneof(
  arbNonEmptyString,
  fc.constant(undefined),
);

/** Generate a complete BrandPalette with all required fields present. */
const arbBrandPalette: fc.Arbitrary<BrandPalette> = fc.record({
  primary_color: arbHexColor,
  secondary_color: arbHexColor,
  accent_color: arbHexColor,
  fonts: fc.record({
    display: arbOptionalFont,
    body: arbOptionalFont,
    mono: arbOptionalFont,
  }),
  logo_url: fc.webUrl(),
  disclaimer: fc.option(fc.string({ minLength: 1, maxLength: 100 }), { nil: undefined }),
});

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 4: Completitud del prompt de generación', () => {
  it('prompt contains all non-null selection values from VisualSelections', () => {
    fc.assert(
      fc.property(
        arbVisualSelections,
        arbBrandPalette,
        (selections, brandPalette) => {
          const prompt = buildGenerationPrompt(selections, brandPalette);

          // Every non-null selection value must appear in the prompt
          if (selections.background !== null) {
            expect(prompt).toContain(selections.background);
          }
          if (selections.visualStyle !== null) {
            expect(prompt).toContain(selections.visualStyle);
          }
          if (selections.contentType !== null) {
            expect(prompt).toContain(selections.contentType);
          }
          if (selections.heroElement !== null) {
            expect(prompt).toContain(selections.heroElement);
          }
          // Platform is always non-null in our generator; verify it's referenced
          // The prompt uses PLATFORM_LABELS which contain the platform name
          expect(prompt.toLowerCase()).toContain(
            selections.platform!.replace('-', ' ').split(' ')[0],
          );
        },
      ),
      { numRuns: 100 },
    );
  });

  it('prompt contains primary_color, secondary_color, and accent_color', () => {
    fc.assert(
      fc.property(
        arbVisualSelections,
        arbBrandPalette,
        (selections, brandPalette) => {
          const prompt = buildGenerationPrompt(selections, brandPalette);

          expect(prompt).toContain(brandPalette.primary_color);
          expect(prompt).toContain(brandPalette.secondary_color);
          expect(prompt).toContain(brandPalette.accent_color);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('prompt contains the logo_url', () => {
    fc.assert(
      fc.property(
        arbVisualSelections,
        arbBrandPalette,
        (selections, brandPalette) => {
          const prompt = buildGenerationPrompt(selections, brandPalette);

          expect(prompt).toContain(brandPalette.logo_url);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('prompt contains all non-undefined font values (display, body)', () => {
    fc.assert(
      fc.property(
        arbVisualSelections,
        arbBrandPalette,
        (selections, brandPalette) => {
          const prompt = buildGenerationPrompt(selections, brandPalette);

          if (brandPalette.fonts.display !== undefined) {
            expect(prompt).toContain(brandPalette.fonts.display);
          }
          if (brandPalette.fonts.body !== undefined) {
            expect(prompt).toContain(brandPalette.fonts.body);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});
