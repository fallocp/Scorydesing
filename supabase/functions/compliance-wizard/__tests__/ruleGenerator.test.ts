/**
 * Unit tests for ruleGenerator.ts
 *
 * Tests the validateComplianceRules schema validation, JSON parsing logic,
 * and the generateInitialRules function with mocked callOpenAI.
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock callOpenAI before importing the module
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { validateComplianceRules, generateInitialRules } from '../ruleGenerator.ts';
import { callOpenAI } from '../../_shared/callOpenAI.ts';
import type { RuleGenerationContext } from '../ruleGenerator.ts';
import type { ConversationMessage } from '../sessionManager.ts';

const mockedCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// validateComplianceRules
// ---------------------------------------------------------------------------

describe('validateComplianceRules', () => {
  it('returns true for a valid ComplianceRules object', () => {
    const valid = {
      forbidden_terms: ['rendimiento garantizado', 'sin riesgo'],
      required_qualifiers: ['Producto regulado por CNBV'],
      max_values: { rendimiento_anual: '15%' },
    };
    expect(validateComplianceRules(valid)).toBe(true);
  });

  it('returns true for empty arrays and empty max_values', () => {
    const valid = {
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: {},
    };
    expect(validateComplianceRules(valid)).toBe(true);
  });

  it('returns false for null', () => {
    expect(validateComplianceRules(null)).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(validateComplianceRules(undefined)).toBe(false);
  });

  it('returns false when forbidden_terms is missing', () => {
    expect(validateComplianceRules({
      required_qualifiers: [],
      max_values: {},
    })).toBe(false);
  });

  it('returns false when required_qualifiers is missing', () => {
    expect(validateComplianceRules({
      forbidden_terms: [],
      max_values: {},
    })).toBe(false);
  });

  it('returns false when max_values is missing', () => {
    expect(validateComplianceRules({
      forbidden_terms: [],
      required_qualifiers: [],
    })).toBe(false);
  });

  it('returns false when forbidden_terms contains non-strings', () => {
    expect(validateComplianceRules({
      forbidden_terms: ['valid', 123],
      required_qualifiers: [],
      max_values: {},
    })).toBe(false);
  });

  it('returns false when required_qualifiers contains non-strings', () => {
    expect(validateComplianceRules({
      forbidden_terms: [],
      required_qualifiers: [null],
      max_values: {},
    })).toBe(false);
  });

  it('returns false when max_values has non-string values', () => {
    expect(validateComplianceRules({
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: { key: 123 },
    })).toBe(false);
  });

  it('returns false when max_values is an array', () => {
    expect(validateComplianceRules({
      forbidden_terms: [],
      required_qualifiers: [],
      max_values: [],
    })).toBe(false);
  });

  it('returns false for a primitive value', () => {
    expect(validateComplianceRules('string')).toBe(false);
    expect(validateComplianceRules(42)).toBe(false);
    expect(validateComplianceRules(true)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// generateInitialRules
// ---------------------------------------------------------------------------

describe('generateInitialRules', () => {
  const baseContext: RuleGenerationContext = {
    industry: 'Fintech',
    regulator: 'CNBV',
    knownRestrictions: 'No prometer rendimientos garantizados',
  };

  const emptyHistory: ConversationMessage[] = [];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns parsed rules on successful first attempt with { rules, explanation } format', async () => {
    const mockResponse = {
      rules: {
        forbidden_terms: ['rendimiento garantizado', 'sin riesgo'],
        required_qualifiers: ['Producto regulado por CNBV'],
        max_values: { rendimiento_anual: '15%' },
      },
      explanation: 'Reglas generadas para fintech regulada por CNBV.',
    };

    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(mockResponse),
    });

    const result = await generateInitialRules(baseContext, emptyHistory);

    expect(result.rules).toEqual(mockResponse.rules);
    expect(result.explanation).toBe(mockResponse.explanation);
    expect(mockedCallOpenAI).toHaveBeenCalledTimes(1);
    expect(mockedCallOpenAI).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.4-mini',
      temperature: 0.4,
      max_completion_tokens: 2048,
    }));
  });

  it('retries with temperature 0.1 when first attempt returns invalid JSON', async () => {
    const validResponse = {
      rules: {
        forbidden_terms: ['sin riesgo'],
        required_qualifiers: ['Consulta condiciones'],
        max_values: {},
      },
      explanation: 'Reglas básicas.',
    };

    // First call returns invalid JSON
    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: 'This is not valid JSON at all',
    });

    // Retry returns valid JSON
    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(validResponse),
    });

    const result = await generateInitialRules(baseContext, emptyHistory);

    expect(result.rules).toEqual(validResponse.rules);
    expect(mockedCallOpenAI).toHaveBeenCalledTimes(2);
    expect(mockedCallOpenAI).toHaveBeenNthCalledWith(2, expect.objectContaining({
      temperature: 0.1,
    }));
  });

  it('retries with temperature 0.1 when first attempt API call fails', async () => {
    const validResponse = {
      rules: {
        forbidden_terms: ['garantizado'],
        required_qualifiers: ['Sujeto a condiciones'],
        max_values: { tasa: '10%' },
      },
      explanation: 'Reglas generadas.',
    };

    // First call fails
    mockedCallOpenAI.mockResolvedValueOnce({
      success: false,
      error: 'api_error',
      message: 'API error: 500',
      status: 500,
    });

    // Retry succeeds
    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(validResponse),
    });

    const result = await generateInitialRules(baseContext, emptyHistory);

    expect(result.rules).toEqual(validResponse.rules);
    expect(mockedCallOpenAI).toHaveBeenCalledTimes(2);
  });

  it('throws when both attempts fail', async () => {
    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: 'invalid json',
    });

    mockedCallOpenAI.mockResolvedValueOnce({
      success: false,
      error: 'network_error',
      message: 'Error de conexión.',
      status: 500,
    });

    await expect(generateInitialRules(baseContext, emptyHistory))
      .rejects.toThrow('Failed to generate compliance rules');
  });

  it('throws when retry returns valid API response but invalid schema', async () => {
    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: 'not json',
    });

    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify({ invalid: 'schema' }),
    });

    await expect(generateInitialRules(baseContext, emptyHistory))
      .rejects.toThrow('Failed to parse compliance rules');
  });

  it('handles response wrapped in markdown code fences', async () => {
    const rules = {
      forbidden_terms: ['mejor que el banco'],
      required_qualifiers: ['Aplican restricciones'],
      max_values: { rendimiento: '12%' },
    };

    const wrappedContent = '```json\n' + JSON.stringify({ rules, explanation: 'Explicación.' }) + '\n```';

    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: wrappedContent,
    });

    const result = await generateInitialRules(baseContext, emptyHistory);
    expect(result.rules).toEqual(rules);
  });

  it('handles response that is just the rules object (no explanation wrapper)', async () => {
    const rules = {
      forbidden_terms: ['inversión segura'],
      required_qualifiers: ['Producto de riesgo'],
      max_values: {},
    };

    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(rules),
    });

    const result = await generateInitialRules(baseContext, emptyHistory);
    expect(result.rules).toEqual(rules);
    expect(result.explanation).toBeTruthy(); // Should have a default explanation
  });

  it('includes conversation history in the OpenAI messages', async () => {
    const history: ConversationMessage[] = [
      {
        id: '1',
        session_id: 's1',
        role: 'assistant',
        content: '¿En qué industria opera tu negocio?',
        created_at: '2024-01-01T00:00:00Z',
      },
      {
        id: '2',
        session_id: 's1',
        role: 'user',
        content: 'Fintech, pagos internacionales',
        created_at: '2024-01-01T00:01:00Z',
      },
    ];

    const validResponse = {
      rules: {
        forbidden_terms: ['sin comisiones'],
        required_qualifiers: ['Aplican comisiones'],
        max_values: {},
      },
      explanation: 'Reglas para pagos.',
    };

    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(validResponse),
    });

    await generateInitialRules(baseContext, history);

    const callArgs = mockedCallOpenAI.mock.calls[0][0];
    // Should have: system + 2 history messages + 1 user message = 4 messages
    expect(callArgs.messages).toHaveLength(4);
    expect(callArgs.messages[0].role).toBe('system');
    expect(callArgs.messages[1].role).toBe('assistant');
    expect(callArgs.messages[2].role).toBe('user');
    expect(callArgs.messages[3].role).toBe('user'); // The generation request
  });

  it('includes existing rules in the user message when provided', async () => {
    const contextWithExisting: RuleGenerationContext = {
      ...baseContext,
      existingRules: {
        forbidden_terms: ['old term'],
        required_qualifiers: ['old qualifier'],
        max_values: { old_key: 'old_value' },
      },
    };

    const validResponse = {
      rules: {
        forbidden_terms: ['new term'],
        required_qualifiers: ['new qualifier'],
        max_values: { new_key: 'new_value' },
      },
      explanation: 'Reglas mejoradas.',
    };

    mockedCallOpenAI.mockResolvedValueOnce({
      success: true,
      content: JSON.stringify(validResponse),
    });

    await generateInitialRules(contextWithExisting, emptyHistory);

    const callArgs = mockedCallOpenAI.mock.calls[0][0];
    const userMsg = callArgs.messages[callArgs.messages.length - 1];
    expect(userMsg.content).toContain('old term');
    expect(userMsg.content).toContain('Reglas existentes');
  });
});
