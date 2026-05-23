/**
 * Unit tests for buildPrompt module.
 * Tests prompt construction, fallback behavior, variable interpolation,
 * and compliance rules injection.
 *
 * Requirements: 6.1, 6.2, 6.3, 4.2, 4.3, 4.4
 */
import { describe, it, expect, vi } from 'vitest';
import { buildValidationPrompt } from '../buildPrompt';
import { FALLBACK_CLAIM_VALIDATION_PROMPT } from '../constants';

// ---------------------------------------------------------------------------
// Mock shared utilities
// ---------------------------------------------------------------------------

vi.mock('../../../_shared/fetchBusinessContext.ts', () => ({
  fetchMasterPromptByType: vi.fn(),
}));

vi.mock('../../../_shared/interpolateTemplate.ts', () => ({
  interpolateTemplate: vi.fn((template: string, variables: Record<string, string | string[] | undefined>) => {
    // Simulate real interpolation for testing
    return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
      if (!(key in variables)) return match;
      const value = variables[key];
      if (value === undefined) return '';
      if (Array.isArray(value)) return value.join(', ');
      return value;
    });
  }),
}));

import { fetchMasterPromptByType } from '../../../_shared/fetchBusinessContext.ts';

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const MOCK_BUSINESS_ID = '123e4567-e89b-12d3-a456-426614174000';
const MOCK_BRAND_NAME = 'TestBrand';

const MOCK_PIECE = {
  headline: 'Invierte hoy con retornos increíbles',
  body: 'Nuestro producto ofrece las mejores tasas del mercado.',
  cta: 'Empieza ahora',
  footer: 'Aplican restricciones.',
  proofPoints: ['Regulado por CNBV'],
  avoidClaims: ['retorno garantizado'],
};

const MOCK_COMPLIANCE_RULES = {
  forbidden_terms: ['garantizado', 'sin riesgo', 'retorno seguro'],
  required_qualifiers: ['rendimientos pasados no garantizan resultados futuros', 'su capital está en riesgo'],
  max_values: { apr: '25%', monthly_return: '5%' },
};

const MOCK_EMPTY_COMPLIANCE_RULES = {
  forbidden_terms: [] as string[],
  required_qualifiers: [] as string[],
  max_values: {} as Record<string, string>,
};

const MOCK_DB_PROMPT = `Eres un revisor de compliance para {{brand}}.
Headline: {{headline}}
Body: {{body}}
CTA: {{cta}}
Footer: {{footer}}`;

function createMockSupabase() {
  return {} as Parameters<typeof buildValidationPrompt>[0];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildValidationPrompt', () => {
  describe('prompt source selection', () => {
    it('uses database prompt when fetchMasterPromptByType returns a value', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(mockedFetch).toHaveBeenCalledWith(
        expect.anything(),
        MOCK_BUSINESS_ID,
        'claim_validation',
      );
      // The DB prompt should be interpolated (brand replaced)
      expect(result.systemPrompt).toContain('TestBrand');
      expect(result.systemPrompt).not.toContain('{{brand}}');
    });

    it('uses fallback prompt when fetchMasterPromptByType returns null', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(null);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      // Should contain content from the fallback prompt (interpolated)
      expect(result.systemPrompt).toContain(MOCK_PIECE.headline);
      expect(result.systemPrompt).toContain(MOCK_PIECE.body);
    });
  });

  describe('variable interpolation', () => {
    it('interpolates piece variables into the template', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.systemPrompt).toContain(MOCK_PIECE.headline);
      expect(result.systemPrompt).toContain(MOCK_PIECE.body);
      expect(result.systemPrompt).toContain(MOCK_PIECE.cta);
      expect(result.systemPrompt).toContain(MOCK_PIECE.footer);
    });

    it('handles piece without optional fields', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const minimalPiece = {
        headline: 'Test headline',
        body: 'Test body',
        cta: 'Test CTA',
      };

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        minimalPiece,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.systemPrompt).toContain('Test headline');
      expect(result.systemPrompt).toContain('Test body');
      expect(result.systemPrompt).toContain('Test CTA');
    });
  });

  describe('compliance rules injection', () => {
    it('injects forbidden_terms into the prompt', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.systemPrompt).toContain('TÉRMINOS PROHIBIDOS');
      expect(result.systemPrompt).toContain('garantizado');
      expect(result.systemPrompt).toContain('sin riesgo');
      expect(result.systemPrompt).toContain('retorno seguro');
    });

    it('injects required_qualifiers into the prompt', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.systemPrompt).toContain('CALIFICADORES OBLIGATORIOS');
      expect(result.systemPrompt).toContain('rendimientos pasados no garantizan resultados futuros');
      expect(result.systemPrompt).toContain('su capital está en riesgo');
    });

    it('injects max_values into the prompt', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.systemPrompt).toContain('LÍMITES NUMÉRICOS');
      expect(result.systemPrompt).toContain('apr: 25%');
      expect(result.systemPrompt).toContain('monthly_return: 5%');
    });

    it('omits sections when compliance rules are empty', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.systemPrompt).not.toContain('TÉRMINOS PROHIBIDOS');
      expect(result.systemPrompt).not.toContain('CALIFICADORES OBLIGATORIOS');
      expect(result.systemPrompt).not.toContain('LÍMITES NUMÉRICOS');
    });
  });

  describe('user prompt construction', () => {
    it('includes piece content in user prompt', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.userPrompt).toContain(MOCK_PIECE.headline);
      expect(result.userPrompt).toContain(MOCK_PIECE.body);
      expect(result.userPrompt).toContain(MOCK_PIECE.cta);
      expect(result.userPrompt).toContain(MOCK_PIECE.footer);
    });

    it('includes proofPoints and avoidClaims in user prompt', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.userPrompt).toContain('Regulado por CNBV');
      expect(result.userPrompt).toContain('retorno garantizado');
    });

    it('omits optional fields from user prompt when not present', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(MOCK_DB_PROMPT);

      const minimalPiece = {
        headline: 'Test headline',
        body: 'Test body',
        cta: 'Test CTA',
      };

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        minimalPiece,
        MOCK_EMPTY_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result.userPrompt).not.toContain('Footer:');
      expect(result.userPrompt).not.toContain('Claims permitidos:');
      expect(result.userPrompt).not.toContain('Claims a evitar:');
    });
  });

  describe('return structure', () => {
    it('returns an object with systemPrompt and userPrompt strings', async () => {
      const mockedFetch = vi.mocked(fetchMasterPromptByType);
      mockedFetch.mockResolvedValueOnce(null);

      const result = await buildValidationPrompt(
        createMockSupabase(),
        MOCK_BUSINESS_ID,
        MOCK_PIECE,
        MOCK_COMPLIANCE_RULES,
        MOCK_BRAND_NAME,
      );

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('userPrompt');
      expect(typeof result.systemPrompt).toBe('string');
      expect(typeof result.userPrompt).toBe('string');
      expect(result.systemPrompt.length).toBeGreaterThan(0);
      expect(result.userPrompt.length).toBeGreaterThan(0);
    });
  });
});
