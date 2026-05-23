/**
 * Unit tests for patternDetector.ts
 *
 * Tests detectPatterns, recordRejection, and isAlreadyRejected
 * using mocked Supabase client and mocked callOpenAI.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock callOpenAI before importing the module
vi.mock('../../_shared/callOpenAI.ts', () => ({
  callOpenAI: vi.fn(),
}));

import { detectPatterns, recordRejection, isAlreadyRejected } from '../patternDetector';
import { callOpenAI } from '../../_shared/callOpenAI';

const mockedCallOpenAI = vi.mocked(callOpenAI);

// ---------------------------------------------------------------------------
// Test data
// ---------------------------------------------------------------------------

const businessId = 'biz-123';

function createHighRiskRow(reason: string, text: string) {
  return {
    id: crypto.randomUUID(),
    risk_level: 'high',
    issues: [{ text, risk: 'high', reason, suggestedFix: 'Fix it', source: 'base_rules' }],
    piece_content: { headline: text },
    created_at: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Mock Supabase helpers
// ---------------------------------------------------------------------------

function createMockSupabase(options: {
  historyRows?: unknown[];
  rejectedPatterns?: string[];
  upsertError?: { message: string } | null;
} = {}) {
  const { historyRows = [], rejectedPatterns = [], upsertError = null } = options;

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'validation_history') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: historyRows, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'compliance_rejected_suggestions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockImplementation(() => {
                  // This is a simplified mock - in real usage the pattern is checked
                  // We'll check if any rejected pattern matches
                  return Promise.resolve({ data: null, error: null });
                }),
              }),
            }),
          }),
          upsert: vi.fn().mockResolvedValue({ error: upsertError }),
        };
      }

      return {};
    }),
  };

  return supabase;
}

/**
 * Creates a mock supabase that tracks which patterns are rejected
 * and properly responds to isAlreadyRejected queries.
 */
function createStatefulMockSupabase(options: {
  historyRows?: unknown[];
  rejectedPatterns?: string[];
} = {}) {
  const { historyRows = [], rejectedPatterns = [] } = options;
  const rejected = new Set(rejectedPatterns);

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      if (table === 'validation_history') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: historyRows, error: null }),
              }),
            }),
          }),
        };
      }

      if (table === 'compliance_rejected_suggestions') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockImplementation((field: string, value: string) => {
                const isRejected = rejected.has(value);
                return {
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: isRejected ? { id: 'some-id' } : null,
                    error: null,
                  }),
                };
              }),
            }),
          }),
          upsert: vi.fn().mockImplementation((row: { pattern: string }) => {
            rejected.add(row.pattern);
            return Promise.resolve({ error: null });
          }),
        };
      }

      return {};
    }),
  };

  return supabase;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('patternDetector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectPatterns', () => {
    it('returns empty suggestions when no validation history exists', async () => {
      const supabase = createMockSupabase({ historyRows: [] });

      const result = await detectPatterns(supabase as any, businessId);

      expect(result.suggestions).toEqual([]);
      expect(result.explanation).toContain('No hay historial');
    });

    it('returns empty suggestions when no high-risk validations exist', async () => {
      const rows = [
        { id: '1', risk_level: 'low', issues: [], piece_content: {}, created_at: new Date().toISOString() },
        { id: '2', risk_level: 'medium', issues: [], piece_content: {}, created_at: new Date().toISOString() },
      ];
      const supabase = createMockSupabase({ historyRows: rows });

      const result = await detectPatterns(supabase as any, businessId);

      expect(result.suggestions).toEqual([]);
      expect(result.explanation).toContain('alto riesgo');
    });

    it('returns empty suggestions when patterns have fewer than 3 occurrences', async () => {
      const rows = [
        createHighRiskRow('guaranteed_returns', 'rendimiento garantizado del 50%'),
        createHighRiskRow('guaranteed_returns', 'retorno garantizado'),
        // Only 2 occurrences — below threshold
      ];
      const supabase = createMockSupabase({ historyRows: rows });

      const result = await detectPatterns(supabase as any, businessId);

      expect(result.suggestions).toEqual([]);
      expect(result.explanation).toContain('mínimo 3');
    });

    it('generates suggestions when patterns have 3+ occurrences', async () => {
      const rows = [
        createHighRiskRow('guaranteed_returns', 'rendimiento garantizado del 50%'),
        createHighRiskRow('guaranteed_returns', 'retorno garantizado del 20%'),
        createHighRiskRow('guaranteed_returns', 'ganancias garantizadas'),
      ];
      const supabase = createStatefulMockSupabase({ historyRows: rows });

      mockedCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          suggestions: [
            {
              pattern: 'guaranteed_returns',
              type: 'forbidden_term',
              value: 'rendimiento garantizado',
            },
          ],
          explanation: 'Se detectó un patrón recurrente de retornos garantizados.',
        }),
      });

      const result = await detectPatterns(supabase as any, businessId);

      expect(result.suggestions.length).toBe(1);
      expect(result.suggestions[0].pattern).toBe('guaranteed_returns');
      expect(result.suggestions[0].occurrences).toBe(3);
      expect(result.suggestions[0].suggestedRule.type).toBe('forbidden_term');
      expect(result.suggestions[0].suggestedRule.value).toBe('rendimiento garantizado');
    });

    it('excludes patterns already rejected by the client', async () => {
      const rows = [
        createHighRiskRow('guaranteed_returns', 'rendimiento garantizado del 50%'),
        createHighRiskRow('guaranteed_returns', 'retorno garantizado del 20%'),
        createHighRiskRow('guaranteed_returns', 'ganancias garantizadas'),
      ];
      const supabase = createStatefulMockSupabase({
        historyRows: rows,
        rejectedPatterns: ['guaranteed_returns'],
      });

      const result = await detectPatterns(supabase as any, businessId);

      expect(result.suggestions).toEqual([]);
      expect(result.explanation).toContain('rechazados');
    });

    it('collects up to 3 examples per pattern', async () => {
      const rows = [
        createHighRiskRow('false_urgency', 'última oportunidad para invertir'),
        createHighRiskRow('false_urgency', 'solo hoy disponible'),
        createHighRiskRow('false_urgency', 'oferta expira mañana'),
        createHighRiskRow('false_urgency', 'no te lo pierdas, solo hoy'),
      ];
      const supabase = createStatefulMockSupabase({ historyRows: rows });

      mockedCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          suggestions: [
            {
              pattern: 'false_urgency',
              type: 'forbidden_term',
              value: 'última oportunidad',
            },
          ],
          explanation: 'Patrón de falsa urgencia detectado.',
        }),
      });

      const result = await detectPatterns(supabase as any, businessId);

      expect(result.suggestions[0].occurrences).toBe(4);
      expect(result.suggestions[0].examples.length).toBe(3);
    });

    it('handles OpenAI failure gracefully with retry', async () => {
      const rows = [
        createHighRiskRow('misleading_comparison', 'mejor que el banco'),
        createHighRiskRow('misleading_comparison', 'mejor que cualquier banco'),
        createHighRiskRow('misleading_comparison', 'supera a los bancos'),
      ];
      const supabase = createStatefulMockSupabase({ historyRows: rows });

      // First call fails
      mockedCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: 'invalid json response',
      });

      // Retry succeeds
      mockedCallOpenAI.mockResolvedValueOnce({
        success: true,
        content: JSON.stringify({
          suggestions: [
            {
              pattern: 'misleading_comparison',
              type: 'forbidden_term',
              value: 'mejor que.*banco',
            },
          ],
          explanation: 'Comparaciones engañosas detectadas.',
        }),
      });

      const result = await detectPatterns(supabase as any, businessId);

      expect(mockedCallOpenAI).toHaveBeenCalledTimes(2);
      expect(result.suggestions.length).toBe(1);
    });
  });

  describe('recordRejection', () => {
    it('upserts a rejection record', async () => {
      const supabase = createMockSupabase();

      await expect(
        recordRejection(supabase as any, businessId, 'guaranteed_returns'),
      ).resolves.not.toThrow();

      expect(supabase.from).toHaveBeenCalledWith('compliance_rejected_suggestions');
    });

    it('throws on upsert error', async () => {
      const supabase = createMockSupabase({
        upsertError: { message: 'DB error' },
      });

      await expect(
        recordRejection(supabase as any, businessId, 'some_pattern'),
      ).rejects.toThrow('Error recording rejection');
    });
  });

  describe('isAlreadyRejected', () => {
    it('returns true when pattern is already rejected', async () => {
      const supabase = createStatefulMockSupabase({
        rejectedPatterns: ['guaranteed_returns'],
      });

      const result = await isAlreadyRejected(supabase as any, businessId, 'guaranteed_returns');

      expect(result).toBe(true);
    });

    it('returns false when pattern is not rejected', async () => {
      const supabase = createStatefulMockSupabase({
        rejectedPatterns: [],
      });

      const result = await isAlreadyRejected(supabase as any, businessId, 'some_pattern');

      expect(result).toBe(false);
    });
  });
});
