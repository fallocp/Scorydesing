/**
 * Property-based tests for templateAssembler.ts — Template Engine
 *
 * Property 5: Template consistency — For any valid (content_type, platform,
 * visual_tone, layout_variation), output HTML has correct dimensions matching
 * PLATFORM_DIMENSIONS[platform] and all required placeholders are replaced.
 *
 * Property 7: Brand isolation — Hydrated template only contains assets from
 * the specified business. assembleTemplate with brand X data never contains
 * brand Y assets. Also verifies XSS prevention via HTML escaping.
 *
 * **Validates: Requirements 5.1, 5.3, 5.5, 7.1, 7.2, 7.3, 7.4**
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import type { Brand, PlatformFormat, ContentData, Partner, Promoter } from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS } from '@/types/xendingDesign';
import { PLATFORM_DIMENSIONS as STUDIO_PLATFORM_DIMENSIONS } from '@/types/design-studio';
import type { PlatformFormat as StudioPlatformFormat } from '@/types/design-studio';

// ---------------------------------------------------------------------------
// Mock supabase client (same pattern as unit tests)
// ---------------------------------------------------------------------------

const mockSingle = vi.fn();

function createQueryBuilder() {
  const builder: Record<string, unknown> = {};
  const chainMethods = ['select', 'eq', 'is', 'limit'] as const;
  for (const method of chainMethods) {
    builder[method] = vi.fn(() => builder);
  }
  builder.single = mockSingle;
  return builder;
}

const mockQueryBuilder = createQueryBuilder();
const mockFrom = vi.fn(() => mockQueryBuilder);

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

import {
  getTemplate,
  assembleTemplate,
  type TemplateParams,
  type AssembleTemplateParams,
  type ContentType,
  type VisualTone,
} from '../templateAssembler';
import type { LayoutVariation } from '@/constants/layoutVariations';

// ---------------------------------------------------------------------------
// Arbitraries (generators)
// ---------------------------------------------------------------------------

const contentTypeArb: fc.Arbitrary<ContentType> = fc.constantFrom(
  'breaking-news',
  'corporate',
  'market-update',
  'stat-of-the-day',
  'event-special',
);

const platformArb: fc.Arbitrary<PlatformFormat | StudioPlatformFormat> = fc.constantFrom(
  'instagram-story',
  'instagram-post',
  'linkedin-post',
  'facebook-post',
  'banner',
);

const visualToneArb: fc.Arbitrary<VisualTone> = fc.constantFrom('light', 'medium', 'dark');

const layoutVariationArb: fc.Arbitrary<LayoutVariation> = fc.constantFrom('A', 'B', 'C');

const brandArb: fc.Arbitrary<Brand> = fc.constantFrom('xending', 'xending_capital');

/** Non-empty printable string for content fields */
const contentStringArb = fc.string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0);

/** Arbitrary for valid ContentData */
const contentDataArb: fc.Arbitrary<ContentData> = fc.record({
  headline: contentStringArb,
  subcopy: contentStringArb,
  cta: contentStringArb,
  imageUrl: fc.option(fc.webUrl(), { nil: undefined }),
});

/** Arbitrary for Partner (or null) */
const partnerArb: fc.Arbitrary<Partner | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    key: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    name: contentStringArb,
    badgeText: contentStringArb,
    logoFile: fc.constantFrom('partner-a.png', 'partner-b.png', 'acme.png'),
  }),
);

/** Arbitrary for Promoter (or null) */
const promoterArb: fc.Arbitrary<Promoter | null> = fc.oneof(
  fc.constant(null),
  fc.record({
    key: fc.string({ minLength: 1, maxLength: 20 }).filter((s) => s.trim().length > 0),
    fullName: contentStringArb,
    role: contentStringArb,
    email: fc.emailAddress(),
    phone: fc.stringMatching(/^\+\d{10,12}$/),
    photoFile: fc.constantFrom('photo1.jpg', 'photo2.jpg'),
  }),
);

/** Arbitrary for TemplateParams */
const templateParamsArb: fc.Arbitrary<TemplateParams> = fc.record({
  contentType: contentTypeArb,
  platform: platformArb,
  visualTone: visualToneArb,
  layoutVariation: layoutVariationArb,
  business_id: fc.uuid(),
});

// ---------------------------------------------------------------------------
// Expected dimensions lookup (combines both dimension maps)
// ---------------------------------------------------------------------------

function getExpectedDimensions(platform: string): { width: number; height: number } {
  if (platform in STUDIO_PLATFORM_DIMENSIONS) {
    return STUDIO_PLATFORM_DIMENSIONS[platform as StudioPlatformFormat];
  }
  if (platform in PLATFORM_DIMENSIONS) {
    return PLATFORM_DIMENSIONS[platform as PlatformFormat];
  }
  return { width: 1080, height: 1920 };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
  const chainMethods = ['select', 'eq', 'is', 'limit'] as const;
  for (const method of chainMethods) {
    (mockQueryBuilder[method] as ReturnType<typeof vi.fn>).mockImplementation(() => mockQueryBuilder);
  }
  mockFrom.mockImplementation(() => mockQueryBuilder);
});

// ---------------------------------------------------------------------------
// Property 5: Template consistency
// ---------------------------------------------------------------------------

describe('Feature: creative-os-pipeline, Property 5: Template consistency', () => {
  it('getTemplate returns correct dimensions for any valid (content_type, platform, visual_tone, layout_variation) combination', async () => {
    // Force fallback to constants (DB returns nothing) so we test the pure logic
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    await fc.assert(
      fc.asyncProperty(
        templateParamsArb,
        async (params) => {
          const result = await getTemplate(params);
          const expected = getExpectedDimensions(params.platform);

          // Dimensions must match PLATFORM_DIMENSIONS[platform] exactly
          expect(result.dimensions).toEqual(expected);
          expect(result.dimensions.width).toBeGreaterThan(0);
          expect(result.dimensions.height).toBeGreaterThan(0);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('getTemplate always returns a valid CompiledTemplate structure for any valid combination', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    await fc.assert(
      fc.asyncProperty(
        templateParamsArb,
        async (params) => {
          const result = await getTemplate(params);

          // Must have all required fields
          expect(result).toHaveProperty('html');
          expect(result).toHaveProperty('css');
          expect(result).toHaveProperty('slots');
          expect(result).toHaveProperty('dimensions');

          // html must be a string
          expect(typeof result.html).toBe('string');
          // css must be a string
          expect(typeof result.css).toBe('string');
          // slots must be an array
          expect(Array.isArray(result.slots)).toBe(true);
          // dimensions must have width and height
          expect(typeof result.dimensions.width).toBe('number');
          expect(typeof result.dimensions.height).toBe('number');
        },
      ),
      { numRuns: 50 },
    );
  });

  it('assembleTemplate produces HTML with correct dimensions embedded for any valid platform', () => {
    fc.assert(
      fc.property(
        contentDataArb,
        brandArb,
        fc.constantFrom<PlatformFormat>('instagram-story', 'instagram-post', 'linkedin-post', 'banner'),
        (content, brand, platform) => {
          const params: AssembleTemplateParams = {
            template: '',
            content,
            brand,
            partner: null,
            promoter: null,
            platformFormat: platform,
          };

          const result = assembleTemplate(params);
          const expected = PLATFORM_DIMENSIONS[platform];

          // Output HTML must contain the correct dimensions
          expect(result).toContain(`${expected.width}px`);
          expect(result).toContain(`${expected.height}px`);
        },
      ),
      { numRuns: 50 },
    );
  });

  it('assembleTemplate replaces all required placeholders — no {{placeholder}} remains in output', () => {
    const templateWithPlaceholders = `<!DOCTYPE html><html><head></head><body>
      <h1>{{headline}}</h1>
      <p>{{subcopy}}</p>
      <button>{{cta}}</button>
      <img src="{{imageUrl}}" />
      {{brandLockup}}
      {{disclaimer}}
      {{partnerBadge}}
      {{promoterArea}}
    </body></html>`;

    fc.assert(
      fc.property(
        contentDataArb,
        brandArb,
        partnerArb,
        promoterArb,
        fc.constantFrom<PlatformFormat>('instagram-story', 'instagram-post', 'linkedin-post', 'banner'),
        (content, brand, partner, promoter, platform) => {
          const params: AssembleTemplateParams = {
            template: templateWithPlaceholders,
            content: { ...content, imageUrl: 'https://example.com/img.png' },
            brand,
            partner,
            promoter,
            platformFormat: platform,
          };

          const result = assembleTemplate(params);

          // No unresolved placeholders should remain
          const unresolvedPlaceholders = result.match(/\{\{[a-zA-Z]+\}\}/g);
          expect(unresolvedPlaceholders).toBeNull();
        },
      ),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Property 7: Brand isolation
// ---------------------------------------------------------------------------

describe('Feature: creative-os-pipeline, Property 7: Brand isolation in templates', () => {
  it('assembleTemplate with brand X never contains brand Y lockup or sublabel', () => {
    fc.assert(
      fc.property(
        contentDataArb,
        fc.constantFrom<PlatformFormat>('instagram-story', 'instagram-post', 'linkedin-post', 'banner'),
        (content, platform) => {
          // Generate for xending brand
          const xendingResult = assembleTemplate({
            template: '',
            content,
            brand: 'xending',
            partner: null,
            promoter: null,
            platformFormat: platform,
          });

          // Generate for xending_capital brand
          const capitalResult = assembleTemplate({
            template: '',
            content,
            brand: 'xending_capital',
            partner: null,
            promoter: null,
            platformFormat: platform,
          });

          // xending output must NOT contain the CAPITAL sublabel HTML element
          // (the CSS class definition .brand-sublabel is always in the stylesheet, but
          // the actual <span class="brand-sublabel">CAPITAL</span> element must only
          // appear for xending_capital)
          expect(xendingResult).not.toContain('>CAPITAL<');
          expect(xendingResult).not.toMatch(/<span[^>]*class="brand-sublabel"[^>]*>CAPITAL<\/span>/);

          // xending_capital output MUST contain the CAPITAL sublabel element
          expect(capitalResult).toMatch(/<span[^>]*class="brand-sublabel"[^>]*>CAPITAL<\/span>/);
        },
      ),
      { numRuns: 30 },
    );
  });

  it('assembleTemplate only includes partner assets when partner is specified for this business', () => {
    const partnerA: Partner = { key: 'partner-a', name: 'Partner A Corp', badgeText: 'Powered by A', logoFile: 'partner-a.png' };
    const partnerB: Partner = { key: 'partner-b', name: 'Partner B Inc', badgeText: 'Sponsored by B', logoFile: 'partner-b.png' };

    fc.assert(
      fc.property(
        contentDataArb,
        brandArb,
        fc.constantFrom<PlatformFormat>('instagram-story', 'instagram-post', 'linkedin-post', 'banner'),
        (content, brand, platform) => {
          // Template with partner A
          const resultA = assembleTemplate({
            template: '',
            content,
            brand,
            partner: partnerA,
            promoter: null,
            platformFormat: platform,
          });

          // Template with partner B
          const resultB = assembleTemplate({
            template: '',
            content,
            brand,
            partner: partnerB,
            promoter: null,
            platformFormat: platform,
          });

          // Template with no partner
          const resultNone = assembleTemplate({
            template: '',
            content,
            brand,
            partner: null,
            promoter: null,
            platformFormat: platform,
          });

          // Result A must contain partner A assets, not partner B
          expect(resultA).toContain('partner-a.png');
          expect(resultA).toContain('Partner A Corp');
          expect(resultA).not.toContain('partner-b.png');
          expect(resultA).not.toContain('Partner B Inc');

          // Result B must contain partner B assets, not partner A
          expect(resultB).toContain('partner-b.png');
          expect(resultB).toContain('Partner B Inc');
          expect(resultB).not.toContain('partner-a.png');
          expect(resultB).not.toContain('Partner A Corp');

          // Result with no partner must not contain any partner assets
          expect(resultNone).not.toContain('partner-a.png');
          expect(resultNone).not.toContain('partner-b.png');
          expect(resultNone).not.toContain('Partner A Corp');
          expect(resultNone).not.toContain('Partner B Inc');
        },
      ),
      { numRuns: 30 },
    );
  });

  it('assembleTemplate escapes HTML in all content fields — XSS prevention', () => {
    /** Arbitrary that always contains HTML special characters */
    const xssStringArb = fc.tuple(
      contentStringArb,
      fc.constantFrom('<script>', '<img onerror=', '"><svg onload=', "' onclick="),
    ).map(([base, xss]) => `${base}${xss}`);

    fc.assert(
      fc.property(
        xssStringArb,
        xssStringArb,
        xssStringArb,
        brandArb,
        fc.constantFrom<PlatformFormat>('instagram-story', 'instagram-post', 'linkedin-post', 'banner'),
        (headline, subcopy, cta, brand, platform) => {
          const content: ContentData = { headline, subcopy, cta };

          const result = assembleTemplate({
            template: '',
            content,
            brand,
            partner: null,
            promoter: null,
            platformFormat: platform,
          });

          // The raw XSS payloads must NOT appear unescaped in the output
          expect(result).not.toContain('<script>');
          expect(result).not.toContain('<img onerror=');
          expect(result).not.toContain('<svg onload=');

          // The escaped versions should be present
          if (headline.includes('<script>')) {
            expect(result).toContain('&lt;script&gt;');
          }
        },
      ),
      { numRuns: 50 },
    );
  });

  it('getTemplate only queries for the specified business_id — never leaks other business templates', async () => {
    // Return a brand-specific template on first call
    const brandRow = {
      id: 'tmpl-brand-specific',
      html_template: '<html><body>Brand Template</body></html>',
      css_overrides: null,
      slots: [{ name: 'headline', type: 'text', required: true }],
    };
    mockSingle.mockResolvedValueOnce({ data: brandRow, error: null });

    const businessId = 'biz-isolated-123';
    await getTemplate({
      contentType: 'corporate',
      platform: 'instagram-story',
      visualTone: 'light',
      layoutVariation: 'A',
      business_id: businessId,
    });

    // Verify the query was scoped to the correct business_id
    expect(mockQueryBuilder.eq).toHaveBeenCalledWith('business_id', businessId);
    // Verify it queried template_registry (not another table)
    expect(mockFrom).toHaveBeenCalledWith('template_registry');
  });

  it('assembleTemplate with brand-specific disclaimer only includes that brand disclaimer', () => {
    fc.assert(
      fc.property(
        contentDataArb,
        fc.constantFrom<PlatformFormat>('instagram-story', 'instagram-post', 'linkedin-post', 'banner'),
        (content, platform) => {
          const xendingResult = assembleTemplate({
            template: '',
            content,
            brand: 'xending',
            partner: null,
            promoter: null,
            platformFormat: platform,
          });

          const capitalResult = assembleTemplate({
            template: '',
            content,
            brand: 'xending_capital',
            partner: null,
            promoter: null,
            platformFormat: platform,
          });

          // Xending disclaimer mentions "produce" and "Estados Unidos"
          expect(xendingResult).toContain('Estados Unidos');
          // Xending Capital disclaimer mentions "SOFOM" and "$500,000"
          expect(capitalResult).toContain('SOFOM');

          // Cross-check: xending should NOT have capital's disclaimer
          expect(xendingResult).not.toContain('SOFOM');
          // Capital should NOT have xending's specific disclaimer
          expect(capitalResult).not.toContain('industria del produce');
        },
      ),
      { numRuns: 30 },
    );
  });
});
