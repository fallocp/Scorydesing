/**
 * Unit tests for validateClaimResponse module.
 * Tests validation of OpenAI response structure including riskLevel,
 * issues array, approvedVersion, and finalRecommendation.
 *
 * Requirements: 4.7
 */
import { describe, it, expect } from 'vitest';
import { validateOpenAIResponse } from '../validateClaimResponse';

describe('validateOpenAIResponse', () => {
  const validResponse = {
    riskLevel: 'low',
    issues: [],
    approvedVersion: {
      headline: 'Safe headline',
      body: 'Safe body text',
      cta: 'Learn more',
      footer: 'Terms apply',
    },
    finalRecommendation: 'Content is compliant.',
  };

  it('returns validated object for a valid response with no issues', () => {
    const result = validateOpenAIResponse(validResponse);
    expect(result).toEqual(validResponse);
  });

  it('returns validated object for a valid response with issues', () => {
    const withIssues = {
      ...validResponse,
      riskLevel: 'high',
      issues: [
        {
          text: 'guaranteed returns',
          risk: 'high',
          reason: 'Prohibited claim',
          suggestedFix: 'Remove guarantee language',
        },
      ],
    };
    const result = validateOpenAIResponse(withIssues);
    expect(result).toEqual(withIssues);
  });

  it('accepts all valid riskLevel values', () => {
    for (const level of ['low', 'medium', 'high'] as const) {
      const response = { ...validResponse, riskLevel: level };
      const result = validateOpenAIResponse(response);
      expect(result).not.toBeNull();
      expect(result!.riskLevel).toBe(level);
    }
  });

  // --- Null/invalid top-level types ---

  it('returns null for null input', () => {
    expect(validateOpenAIResponse(null)).toBeNull();
  });

  it('returns null for undefined input', () => {
    expect(validateOpenAIResponse(undefined)).toBeNull();
  });

  it('returns null for a string input', () => {
    expect(validateOpenAIResponse('not an object')).toBeNull();
  });

  it('returns null for a number input', () => {
    expect(validateOpenAIResponse(42)).toBeNull();
  });

  it('returns null for an array input', () => {
    expect(validateOpenAIResponse([validResponse])).toBeNull();
  });

  // --- Missing required fields ---

  it('returns null when riskLevel is missing', () => {
    const { riskLevel, ...rest } = validResponse;
    expect(validateOpenAIResponse(rest)).toBeNull();
  });

  it('returns null when issues is missing', () => {
    const { issues, ...rest } = validResponse;
    expect(validateOpenAIResponse(rest)).toBeNull();
  });

  it('returns null when approvedVersion is missing', () => {
    const { approvedVersion, ...rest } = validResponse;
    expect(validateOpenAIResponse(rest)).toBeNull();
  });

  it('returns null when finalRecommendation is missing', () => {
    const { finalRecommendation, ...rest } = validResponse;
    expect(validateOpenAIResponse(rest)).toBeNull();
  });

  // --- Invalid riskLevel ---

  it('returns null for invalid riskLevel value', () => {
    expect(validateOpenAIResponse({ ...validResponse, riskLevel: 'critical' })).toBeNull();
  });

  it('returns null when riskLevel is a number', () => {
    expect(validateOpenAIResponse({ ...validResponse, riskLevel: 1 })).toBeNull();
  });

  // --- Invalid issues ---

  it('returns null when issues is not an array', () => {
    expect(validateOpenAIResponse({ ...validResponse, issues: 'none' })).toBeNull();
  });

  it('returns null when an issue is missing text field', () => {
    const response = {
      ...validResponse,
      issues: [{ risk: 'high', reason: 'bad', suggestedFix: 'fix it' }],
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when an issue is missing risk field', () => {
    const response = {
      ...validResponse,
      issues: [{ text: 'bad text', reason: 'bad', suggestedFix: 'fix it' }],
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when an issue is missing reason field', () => {
    const response = {
      ...validResponse,
      issues: [{ text: 'bad text', risk: 'high', suggestedFix: 'fix it' }],
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when an issue is missing suggestedFix field', () => {
    const response = {
      ...validResponse,
      issues: [{ text: 'bad text', risk: 'high', reason: 'bad' }],
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when an issue is null', () => {
    const response = { ...validResponse, issues: [null] };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when an issue is a primitive', () => {
    const response = { ...validResponse, issues: ['not an object'] };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  // --- Invalid approvedVersion ---

  it('returns null when approvedVersion is null', () => {
    expect(validateOpenAIResponse({ ...validResponse, approvedVersion: null })).toBeNull();
  });

  it('returns null when approvedVersion is a string', () => {
    expect(validateOpenAIResponse({ ...validResponse, approvedVersion: 'text' })).toBeNull();
  });

  it('returns null when approvedVersion is missing headline', () => {
    const response = {
      ...validResponse,
      approvedVersion: { body: 'b', cta: 'c', footer: 'f' },
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when approvedVersion is missing body', () => {
    const response = {
      ...validResponse,
      approvedVersion: { headline: 'h', cta: 'c', footer: 'f' },
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when approvedVersion is missing cta', () => {
    const response = {
      ...validResponse,
      approvedVersion: { headline: 'h', body: 'b', footer: 'f' },
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when approvedVersion is missing footer', () => {
    const response = {
      ...validResponse,
      approvedVersion: { headline: 'h', body: 'b', cta: 'c' },
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  it('returns null when approvedVersion has non-string field', () => {
    const response = {
      ...validResponse,
      approvedVersion: { headline: 123, body: 'b', cta: 'c', footer: 'f' },
    };
    expect(validateOpenAIResponse(response)).toBeNull();
  });

  // --- Invalid finalRecommendation ---

  it('returns null when finalRecommendation is a number', () => {
    expect(validateOpenAIResponse({ ...validResponse, finalRecommendation: 42 })).toBeNull();
  });

  // --- Extra fields are tolerated ---

  it('ignores extra fields and returns valid structure', () => {
    const response = { ...validResponse, extraField: 'ignored', anotherOne: 123 };
    const result = validateOpenAIResponse(response);
    expect(result).not.toBeNull();
    expect(result!.riskLevel).toBe('low');
    // Extra fields should not be in the returned object
    expect((result as Record<string, unknown>)['extraField']).toBeUndefined();
  });

  it('validates multiple issues correctly', () => {
    const response = {
      ...validResponse,
      riskLevel: 'medium',
      issues: [
        { text: 'issue 1', risk: 'medium', reason: 'reason 1', suggestedFix: 'fix 1' },
        { text: 'issue 2', risk: 'high', reason: 'reason 2', suggestedFix: 'fix 2' },
      ],
    };
    const result = validateOpenAIResponse(response);
    expect(result).not.toBeNull();
    expect(result!.issues).toHaveLength(2);
  });
});
