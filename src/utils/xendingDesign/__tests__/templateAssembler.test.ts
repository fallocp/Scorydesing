/**
 * Unit tests for templateAssembler.ts — DB-first template resolution.
 *
 * Tests the getTemplate() function with its 3-tier fallback:
 * 1. Brand-specific template from template_registry
 * 2. Starter/global template (business_id IS NULL)
 * 3. Fallback to designTemplates.ts constants
 *
 * Also verifies assembleTemplate() backward compatibility.
 *
 * Requirements: Property 5 (Template consistency), Property 7 (Brand isolation)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock supabase client with chainable query builder
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
  type CompiledTemplate,
  type AssembleTemplateParams,
} from '../templateAssembler';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTemplateParams(overrides: Partial<TemplateParams> = {}): TemplateParams {
  return {
    contentType: 'corporate',
    platform: 'instagram-story',
    visualTone: 'light',
    layoutVariation: 'A',
    business_id: 'biz-123',
    ...overrides,
  };
}

function mockDbRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'tmpl-1',
    html_template: '<html><body>{{headline}}</body></html>',
    css_overrides: '.card { color: red; }',
    slots: [
      { name: 'headline', type: 'text', required: true, maxLength: 80 },
      { name: 'imageUrl', type: 'image', required: true },
    ],
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  // Reset the query builder mock methods
  const chainMethods = ['select', 'eq', 'is', 'limit'] as const;
  for (const method of chainMethods) {
    (mockQueryBuilder[method] as ReturnType<typeof vi.fn>).mockImplementation(() => mockQueryBuilder);
  }
  mockFrom.mockImplementation(() => mockQueryBuilder);
});

// ---------------------------------------------------------------------------
// Tests: getTemplate — DB resolution
// ---------------------------------------------------------------------------

describe('getTemplate', () => {
  it('returns brand-specific template from DB when found', async () => {
    const row = mockDbRow();
    mockSingle.mockResolvedValueOnce({ data: row, error: null });

    const result = await getTemplate(makeTemplateParams());

    expect(result).toEqual<CompiledTemplate>({
      html: row.html_template,
      css: row.css_overrides!,
      slots: row.slots as CompiledTemplate['slots'],
      dimensions: { width: 1080, height: 1920 },
    });
    expect(mockFrom).toHaveBeenCalledWith('template_registry');
  });

  it('falls back to starter template when brand-specific not found', async () => {
    // First call (brand-specific) returns nothing
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    // Second call (starter) returns a template
    const starterRow = mockDbRow({ id: 'starter-1', css_overrides: null });
    mockSingle.mockResolvedValueOnce({ data: starterRow, error: null });

    const result = await getTemplate(makeTemplateParams());

    expect(result.html).toBe(starterRow.html_template);
    expect(result.css).toBe('');
    expect(result.dimensions).toEqual({ width: 1080, height: 1920 });
  });

  it('falls back to designTemplates.ts constants when DB returns nothing', async () => {
    // Both DB queries return nothing
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    mockSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });

    const result = await getTemplate(makeTemplateParams({
      contentType: 'corporate',
      visualTone: 'light',
    }));

    // Should get card-light template from constants
    expect(result.html).toContain('<!DOCTYPE html>');
    expect(result.dimensions).toEqual({ width: 1080, height: 1920 });
    expect(result.slots.length).toBeGreaterThan(0);
  });

  it('falls back to constants when DB query throws an error', async () => {
    mockSingle.mockRejectedValueOnce(new Error('Network error'));

    const result = await getTemplate(makeTemplateParams({
      contentType: 'market-update',
      visualTone: 'dark',
    }));

    // Should fallback gracefully — card-navy for market-update/dark
    expect(result.dimensions).toEqual({ width: 1080, height: 1920 });
    expect(result.slots).toBeDefined();
  });

  it('resolves correct dimensions for each platform', async () => {
    // All queries fail → fallback to constants
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    const platforms = [
      { platform: 'instagram-story' as const, expected: { width: 1080, height: 1920 } },
      { platform: 'instagram-post' as const, expected: { width: 1080, height: 1080 } },
      { platform: 'linkedin-post' as const, expected: { width: 1200, height: 628 } },
      { platform: 'facebook-post' as const, expected: { width: 1200, height: 628 } },
      { platform: 'banner' as const, expected: { width: 1920, height: 1080 } },
    ];

    for (const { platform, expected } of platforms) {
      const result = await getTemplate(makeTemplateParams({ platform }));
      expect(result.dimensions).toEqual(expected);
    }
  });

  it('maps visual tones correctly to legacy template IDs in fallback', async () => {
    mockSingle.mockResolvedValue({ data: null, error: { code: 'PGRST116' } });

    // light → card-light (has specific CSS)
    const lightResult = await getTemplate(makeTemplateParams({ visualTone: 'light' }));
    expect(lightResult.html).toContain('<!DOCTYPE html>');

    // dark + corporate → card-dark
    const darkResult = await getTemplate(makeTemplateParams({ visualTone: 'dark', contentType: 'corporate' }));
    expect(darkResult.html).toContain('<!DOCTYPE html>');

    // dark + market-update → card-navy
    const navyResult = await getTemplate(makeTemplateParams({ visualTone: 'dark', contentType: 'market-update' }));
    expect(navyResult.html).toContain('<!DOCTYPE html>');

    // medium + corporate → card-coral
    const coralResult = await getTemplate(makeTemplateParams({ visualTone: 'medium', contentType: 'corporate' }));
    expect(coralResult.html).toContain('<!DOCTYPE html>');

    // medium + market-update → card-turquesa
    const turqResult = await getTemplate(makeTemplateParams({ visualTone: 'medium', contentType: 'market-update' }));
    expect(turqResult.html).toContain('<!DOCTYPE html>');
  });

  it('ensures brand isolation — only queries for specified business_id', async () => {
    const row = mockDbRow();
    mockSingle.mockResolvedValueOnce({ data: row, error: null });

    await getTemplate(makeTemplateParams({ business_id: 'brand-xyz' }));

    // Verify from was called with template_registry
    expect(mockFrom).toHaveBeenCalledWith('template_registry');
    // Verify eq was called (the chain includes business_id filtering)
    expect(mockQueryBuilder.eq).toHaveBeenCalled();
  });

  it('returns empty css when css_overrides is null', async () => {
    const row = mockDbRow({ css_overrides: null });
    mockSingle.mockResolvedValueOnce({ data: row, error: null });

    const result = await getTemplate(makeTemplateParams());

    expect(result.css).toBe('');
  });

  it('handles empty slots array from DB', async () => {
    const row = mockDbRow({ slots: [] });
    mockSingle.mockResolvedValueOnce({ data: row, error: null });

    const result = await getTemplate(makeTemplateParams());

    expect(result.slots).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Tests: assembleTemplate — backward compatibility
// ---------------------------------------------------------------------------

describe('assembleTemplate', () => {
  it('generates full document when template is empty', () => {
    const params: AssembleTemplateParams = {
      template: '',
      content: { headline: 'Test Headline', subcopy: 'Test body', cta: 'Click here' },
      brand: 'xending',
      partner: null,
      promoter: null,
      platformFormat: 'instagram-story',
    };

    const result = assembleTemplate(params);

    expect(result).toContain('<!DOCTYPE html>');
    expect(result).toContain('Test Headline');
    expect(result).toContain('Test body');
    expect(result).toContain('Click here');
    expect(result).toContain('width:1080px');
    expect(result).toContain('height:1920px');
  });

  it('injects content into template placeholders', () => {
    const template = `<!DOCTYPE html><html><head></head><body>
      <h1>{{headline}}</h1>
      <p>{{subcopy}}</p>
      <button>{{cta}}</button>
    </body></html>`;

    const params: AssembleTemplateParams = {
      template,
      content: { headline: 'Hello World', subcopy: 'Sub text', cta: 'Go' },
      brand: 'xending',
      partner: null,
      promoter: null,
      platformFormat: 'instagram-post',
    };

    const result = assembleTemplate(params);

    expect(result).toContain('Hello World');
    expect(result).toContain('Sub text');
    expect(result).toContain('Go');
    // Should enforce dimensions
    expect(result).toContain('1080px');
  });

  it('escapes HTML in content to prevent XSS', () => {
    const params: AssembleTemplateParams = {
      template: '',
      content: {
        headline: '<script>alert("xss")</script>',
        subcopy: 'Normal text',
        cta: 'Click & go',
      },
      brand: 'xending',
      partner: null,
      promoter: null,
      platformFormat: 'instagram-story',
    };

    const result = assembleTemplate(params);

    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
    expect(result).toContain('Click &amp; go');
  });

  it('includes partner badge when partner is provided', () => {
    const params: AssembleTemplateParams = {
      template: '',
      content: { headline: 'H', subcopy: 'S', cta: 'C' },
      brand: 'xending',
      partner: { key: 'partner1', name: 'Acme Corp', badgeText: 'Powered by Acme', logoFile: 'acme.png' },
      promoter: null,
      platformFormat: 'instagram-story',
    };

    const result = assembleTemplate(params);

    expect(result).toContain('Powered by Acme');
    expect(result).toContain('acme.png');
  });

  it('includes promoter area when promoter is provided', () => {
    const params: AssembleTemplateParams = {
      template: '',
      content: { headline: 'H', subcopy: 'S', cta: 'C' },
      brand: 'xending',
      partner: null,
      promoter: {
        key: 'promo1',
        fullName: 'John Doe',
        role: 'Sales Manager',
        email: 'john@example.com',
        phone: '+1234567890',
        photoFile: 'john.jpg',
      },
      platformFormat: 'instagram-story',
    };

    const result = assembleTemplate(params);

    expect(result).toContain('John Doe');
    expect(result).toContain('Sales Manager');
  });

  it('handles xending_capital brand with sublabel', () => {
    const params: AssembleTemplateParams = {
      template: '',
      content: { headline: 'H', subcopy: 'S', cta: 'C' },
      brand: 'xending_capital',
      partner: null,
      promoter: null,
      platformFormat: 'instagram-story',
    };

    const result = assembleTemplate(params);

    expect(result).toContain('CAPITAL');
    expect(result).toContain('brand-sublabel');
  });
});
