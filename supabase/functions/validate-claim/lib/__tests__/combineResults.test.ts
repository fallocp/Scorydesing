/**
 * Unit tests for combineResults module.
 * Tests merging of Nivel 1 and Nivel 2 results, risk level calculation,
 * compliance_status mapping, and approvedVersion selection.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 11.1, 11.2
 */
import { describe, it, expect } from 'vitest';
import { combineResults } from '../combineResults';
import type {
  PieceInput,
  BaseRulesResult,
  OpenAIValidationResult,
} from '../types';

const basePiece: PieceInput = {
  headline: 'Invest today',
  body: 'Great returns await you',
  cta: 'Start now',
  footer: 'Terms apply',
};

const cleanLevel1: BaseRulesResult = {
  riskLevel: 'low',
  issues: [],
};

const mediumLevel1: BaseRulesResult = {
  riskLevel: 'medium',
  issues: [
    {
      text: 'returns',
      risk: 'medium',
      reason: 'Missing qualifier: past_performance',
      suggestedFix: 'Add disclaimer about past performance',
      source: 'base_rules',
    },
  ],
};

const highLevel1: BaseRulesResult = {
  riskLevel: 'high',
  issues: [
    {
      text: 'retorno garantizado',
      risk: 'high',
      reason: 'guaranteed_returns: Prohibited claim',
      suggestedFix: 'Remove guarantee language',
      source: 'base_rules',
    },
  ],
};

const successfulLevel2: OpenAIValidationResult = {
  pieceIndex: 0,
  riskLevel: 'low',
  issues: [],
  approvedVersion: {
    headline: 'Invest wisely today',
    body: 'Potential returns await you',
    cta: 'Learn more',
    footer: 'Terms and conditions apply. Past performance does not guarantee future results.',
  },
  finalRecommendation: 'Content is compliant after minor adjustments.',
};

const level2WithIssues: OpenAIValidationResult = {
  pieceIndex: 0,
  riskLevel: 'medium',
  issues: [
    {
      text: 'Great returns',
      risk: 'medium',
      reason: 'Potentially misleading without context',
      suggestedFix: 'Add qualifier about past performance',
      source: 'tenant_rules',
    },
  ],
  approvedVersion: {
    headline: 'Invest wisely today',
    body: 'Potential returns await you',
    cta: 'Learn more',
    footer: 'Terms apply. Past performance is not indicative of future results.',
  },
  finalRecommendation: 'Minor adjustments recommended.',
};

const highLevel2: OpenAIValidationResult = {
  pieceIndex: 0,
  riskLevel: 'high',
  issues: [
    {
      text: 'guaranteed returns',
      risk: 'high',
      reason: 'Forbidden term detected',
      suggestedFix: 'Remove forbidden term',
      source: 'tenant_rules',
    },
  ],
  approvedVersion: {
    headline: 'Consider investing',
    body: 'Explore opportunities',
    cta: 'Learn more',
    footer: 'Capital at risk.',
  },
  finalRecommendation: 'Critical issues found. Content rejected.',
};

const level2Error = { error: 'Rate limit exhausted', pieceIndex: 0 };

describe('combineResults', () => {
  describe('Only Nivel 1 ran (no level2Result)', () => {
    it('returns riskLevel low with no issues when Nivel 1 is clean', () => {
      const result = combineResults(0, basePiece, cleanLevel1);
      expect(result.riskLevel).toBe('low');
      expect(result.issues).toHaveLength(0);
      expect(result.compliance_status).toBe('approved');
    });

    it('uses original piece as approvedVersion when only Nivel 1 ran', () => {
      const result = combineResults(0, basePiece, cleanLevel1);
      expect(result.approvedVersion).toEqual({
        headline: basePiece.headline,
        body: basePiece.body,
        cta: basePiece.cta,
        footer: basePiece.footer,
      });
    });

    it('uses empty string for footer when piece has no footer', () => {
      const pieceNoFooter: PieceInput = { headline: 'H', body: 'B', cta: 'C' };
      const result = combineResults(0, pieceNoFooter, cleanLevel1);
      expect(result.approvedVersion.footer).toBe('');
    });

    it('preserves Nivel 1 issues and riskLevel when medium', () => {
      const result = combineResults(0, basePiece, mediumLevel1);
      expect(result.riskLevel).toBe('medium');
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].source).toBe('base_rules');
      expect(result.compliance_status).toBe('approved');
    });

    it('marks as rejected when Nivel 1 is high', () => {
      const result = combineResults(0, basePiece, highLevel1);
      expect(result.riskLevel).toBe('high');
      expect(result.compliance_status).toBe('rejected');
    });
  });

  describe('Nivel 2 ran successfully', () => {
    it('uses approvedVersion from Nivel 2', () => {
      const result = combineResults(0, basePiece, cleanLevel1, successfulLevel2);
      expect(result.approvedVersion).toEqual(successfulLevel2.approvedVersion);
    });

    it('uses finalRecommendation from Nivel 2', () => {
      const result = combineResults(0, basePiece, cleanLevel1, successfulLevel2);
      expect(result.finalRecommendation).toBe(successfulLevel2.finalRecommendation);
    });

    it('merges issues from both levels', () => {
      const result = combineResults(0, basePiece, mediumLevel1, level2WithIssues);
      expect(result.issues).toHaveLength(2);
      expect(result.issues[0].source).toBe('base_rules');
      expect(result.issues[1].source).toBe('tenant_rules');
    });

    it('calculates max riskLevel (medium from L1, low from L2 → medium)', () => {
      const result = combineResults(0, basePiece, mediumLevel1, successfulLevel2);
      expect(result.riskLevel).toBe('medium');
    });

    it('calculates max riskLevel (low from L1, medium from L2 → medium)', () => {
      const result = combineResults(0, basePiece, cleanLevel1, level2WithIssues);
      expect(result.riskLevel).toBe('medium');
    });

    it('calculates max riskLevel (medium from L1, high from L2 → high)', () => {
      const result = combineResults(0, basePiece, mediumLevel1, highLevel2);
      expect(result.riskLevel).toBe('high');
      expect(result.compliance_status).toBe('rejected');
    });

    it('calculates max riskLevel (high from L1, low from L2 → high)', () => {
      const result = combineResults(0, basePiece, highLevel1, successfulLevel2);
      expect(result.riskLevel).toBe('high');
      expect(result.compliance_status).toBe('rejected');
    });
  });

  describe('Nivel 2 had error', () => {
    it('treats error as riskLevel high', () => {
      const result = combineResults(0, basePiece, cleanLevel1, level2Error);
      expect(result.riskLevel).toBe('high');
      expect(result.compliance_status).toBe('rejected');
    });

    it('uses original piece as approvedVersion on error', () => {
      const result = combineResults(0, basePiece, cleanLevel1, level2Error);
      expect(result.approvedVersion).toEqual({
        headline: basePiece.headline,
        body: basePiece.body,
        cta: basePiece.cta,
        footer: basePiece.footer,
      });
    });

    it('provides error-specific finalRecommendation', () => {
      const result = combineResults(0, basePiece, cleanLevel1, level2Error);
      expect(result.finalRecommendation).toContain('Error');
    });

    it('preserves Nivel 1 issues even when Nivel 2 errors', () => {
      const result = combineResults(0, basePiece, mediumLevel1, level2Error);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0].source).toBe('base_rules');
      expect(result.riskLevel).toBe('high');
    });
  });

  describe('pieceIndex preservation', () => {
    it('preserves the provided pieceIndex', () => {
      const result = combineResults(3, basePiece, cleanLevel1);
      expect(result.pieceIndex).toBe(3);
    });

    it('preserves pieceIndex with Nivel 2 result', () => {
      const result = combineResults(5, basePiece, cleanLevel1, successfulLevel2);
      expect(result.pieceIndex).toBe(5);
    });
  });

  describe('compliance_status mapping', () => {
    it('approved when riskLevel is low', () => {
      const result = combineResults(0, basePiece, cleanLevel1, successfulLevel2);
      expect(result.riskLevel).toBe('low');
      expect(result.compliance_status).toBe('approved');
    });

    it('approved when riskLevel is medium', () => {
      const result = combineResults(0, basePiece, mediumLevel1);
      expect(result.riskLevel).toBe('medium');
      expect(result.compliance_status).toBe('approved');
    });

    it('rejected when riskLevel is high', () => {
      const result = combineResults(0, basePiece, highLevel1);
      expect(result.riskLevel).toBe('high');
      expect(result.compliance_status).toBe('rejected');
    });
  });
});
