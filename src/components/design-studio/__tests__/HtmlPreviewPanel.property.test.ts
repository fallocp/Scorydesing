/**
 * Property Test: Dimensiones del preview coinciden con la plataforma
 *
 * Feature: design-studio, Property 6: Dimensiones del preview coinciden con la plataforma
 * **Validates: Requirements 6.3, 10.2**
 *
 * For any PlatformFormat, the dimensions used for the preview iframe must exactly
 * match PLATFORM_DIMENSIONS[platform] (width × height). All platform formats must
 * be covered in the map (no missing entries).
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  PLATFORM_DIMENSIONS,
  type PlatformFormat,
} from '@/types/design-studio';

// ---------------------------------------------------------------------------
// Constants — expected dimensions per platform
// ---------------------------------------------------------------------------

const EXPECTED_DIMENSIONS: Record<PlatformFormat, { width: number; height: number }> = {
  'instagram-story': { width: 1080, height: 1920 },
  'instagram-post': { width: 1080, height: 1080 },
  'facebook-post': { width: 1200, height: 628 },
  'linkedin-post': { width: 1200, height: 628 },
  'banner': { width: 1920, height: 1080 },
};

const ALL_PLATFORMS: PlatformFormat[] = [
  'instagram-story',
  'instagram-post',
  'facebook-post',
  'linkedin-post',
  'banner',
];

// ---------------------------------------------------------------------------
// Generators
// ---------------------------------------------------------------------------

/** Generator for valid PlatformFormat values */
const arbPlatformFormat: fc.Arbitrary<PlatformFormat> = fc.constantFrom(...ALL_PLATFORMS);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Property 6: Dimensiones del preview coinciden con la plataforma', () => {
  it('PLATFORM_DIMENSIONS[platform] is defined for any PlatformFormat', () => {
    fc.assert(
      fc.property(arbPlatformFormat, (platform) => {
        const dims = PLATFORM_DIMENSIONS[platform];

        expect(dims).toBeDefined();
        expect(dims).not.toBeNull();
      }),
      { numRuns: 100 },
    );
  });

  it('PLATFORM_DIMENSIONS[platform].width > 0 for any PlatformFormat', () => {
    fc.assert(
      fc.property(arbPlatformFormat, (platform) => {
        const dims = PLATFORM_DIMENSIONS[platform];

        expect(dims.width).toBeGreaterThan(0);
        expect(typeof dims.width).toBe('number');
        expect(Number.isInteger(dims.width)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('PLATFORM_DIMENSIONS[platform].height > 0 for any PlatformFormat', () => {
    fc.assert(
      fc.property(arbPlatformFormat, (platform) => {
        const dims = PLATFORM_DIMENSIONS[platform];

        expect(dims.height).toBeGreaterThan(0);
        expect(typeof dims.height).toBe('number');
        expect(Number.isInteger(dims.height)).toBe(true);
      }),
      { numRuns: 100 },
    );
  });

  it('dimensions match expected values for any PlatformFormat', () => {
    fc.assert(
      fc.property(arbPlatformFormat, (platform) => {
        const dims = PLATFORM_DIMENSIONS[platform];
        const expected = EXPECTED_DIMENSIONS[platform];

        expect(dims.width).toBe(expected.width);
        expect(dims.height).toBe(expected.height);
      }),
      { numRuns: 100 },
    );
  });

  it('all platform formats are covered in PLATFORM_DIMENSIONS (no missing entries)', () => {
    fc.assert(
      fc.property(arbPlatformFormat, (platform) => {
        // Verify the key exists in the map
        expect(platform in PLATFORM_DIMENSIONS).toBe(true);

        // Verify the dimensions object has both required properties
        const dims = PLATFORM_DIMENSIONS[platform];
        expect(dims).toHaveProperty('width');
        expect(dims).toHaveProperty('height');
      }),
      { numRuns: 100 },
    );
  });

  it('PLATFORM_DIMENSIONS covers exactly the set of ALL_PLATFORMS', () => {
    // This is a deterministic check that complements the property tests
    const dimensionKeys = Object.keys(PLATFORM_DIMENSIONS) as PlatformFormat[];

    expect(dimensionKeys.sort()).toEqual([...ALL_PLATFORMS].sort());
    expect(dimensionKeys).toHaveLength(ALL_PLATFORMS.length);
  });
});
