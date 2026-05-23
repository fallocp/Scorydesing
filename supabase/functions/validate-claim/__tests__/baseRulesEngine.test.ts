/**
 * Unit tests for baseRulesEngine.ts
 *
 * Tests the validatePieceBaseRules function for:
 * - Clean pieces return riskLevel 'low' with no issues
 * - Prohibited patterns detected and classified as 'high'
 * - Missing required qualifiers detected and classified as 'medium'
 * - All issues tagged with source: 'base_rules'
 * - Max risk level calculation across multiple issues
 *
 * Requirements: 2.1, 2.3, 2.4, 2.5, 2.6
 */
import { describe, it, expect } from 'vitest';
import { validatePieceBaseRules } from '../lib/baseRulesEngine.ts';
import type { PieceInput } from '../lib/types.ts';

function makePiece(overrides: Partial<PieceInput> = {}): PieceInput {
  return {
    headline: 'Headline seguro',
    body: 'Cuerpo informativo sin claims',
    cta: 'Más información',
    ...overrides,
  };
}

describe('validatePieceBaseRules', () => {
  describe('clean pieces', () => {
    it('should return riskLevel low with no issues for clean text', () => {
      const piece = makePiece();
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('low');
      expect(result.issues).toHaveLength(0);
    });

    it('should return riskLevel low when qualifiers are present and no prohibited patterns match', () => {
      const piece = makePiece({
        body: 'Conoce nuestra tasa preferencial. las tasas pueden cambiar.',
      });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('low');
      expect(result.issues).toHaveLength(0);
    });
  });

  describe('prohibited patterns — guaranteed returns', () => {
    it('should detect "garantiza" as high risk', () => {
      const piece = makePiece({ headline: 'Se garantiza un retorno del 10%' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      expect(result.issues.length).toBeGreaterThanOrEqual(1);
      const highIssue = result.issues.find(i => i.reason.includes('guaranteed_returns'));
      expect(highIssue).toBeDefined();
      expect(highIssue!.risk).toBe('high');
      expect(highIssue!.source).toBe('base_rules');
    });

    it('should detect "retorno seguro" as high risk', () => {
      const piece = makePiece({ body: 'Ofrecemos un retorno seguro para tu inversión. Su capital está en riesgo.' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      const highIssue = result.issues.find(i => i.reason.includes('guaranteed_returns'));
      expect(highIssue).toBeDefined();
    });

    it('should detect "sin riesgo" as high risk', () => {
      const piece = makePiece({ cta: 'Invierte sin riesgo hoy' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
    });
  });

  describe('prohibited patterns — false promises', () => {
    it('should detect "100% seguro" as high risk', () => {
      const piece = makePiece({ headline: 'Tu dinero está 100% seguro' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      const issue = result.issues.find(i => i.reason.includes('false_promises'));
      expect(issue).toBeDefined();
    });

    it('should detect "nunca pierde" as high risk', () => {
      const piece = makePiece({ body: 'Con nosotros nunca pierdes tu dinero' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
    });
  });

  describe('prohibited patterns — misleading comparisons', () => {
    it('should detect "mejor que banco" as high risk', () => {
      const piece = makePiece({ body: 'Rendimientos mejor que banco tradicional' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      const issue = result.issues.find(i => i.reason.includes('misleading_comparisons'));
      expect(issue).toBeDefined();
    });

    it('should detect "supera mercado" as high risk', () => {
      const piece = makePiece({ headline: 'Nuestro fondo supera el mercado' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
    });
  });

  describe('prohibited patterns — risk minimization', () => {
    it('should detect "riesgo cero" as high risk', () => {
      const piece = makePiece({ body: 'Inversión con riesgo cero' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      const issue = result.issues.find(i => i.reason.includes('risk_minimization'));
      expect(issue).toBeDefined();
    });
  });

  describe('prohibited patterns — false urgency', () => {
    it('should detect "última oportunidad" as high risk', () => {
      const piece = makePiece({ cta: '¡Última oportunidad para invertir!' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      const issue = result.issues.find(i => i.reason.includes('false_urgency'));
      expect(issue).toBeDefined();
    });

    it('should detect "solo hoy" as high risk', () => {
      const piece = makePiece({ headline: 'Solo hoy: tasas preferenciales' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
    });
  });

  describe('prohibited patterns — discrimination', () => {
    it('should detect "solo para hombres" as high risk', () => {
      const piece = makePiece({ body: 'Producto solo para hombres mayores' });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      const issue = result.issues.find(i => i.reason.includes('discrimination'));
      expect(issue).toBeDefined();
    });
  });

  describe('required qualifiers — missing', () => {
    it('should detect missing past_performance qualifier as medium risk', () => {
      const piece = makePiece({
        body: 'Nuestro rendimiento anual fue del 15%',
      });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('medium');
      const issue = result.issues.find(i => i.reason.includes('past_performance'));
      expect(issue).toBeDefined();
      expect(issue!.risk).toBe('medium');
      expect(issue!.source).toBe('base_rules');
    });

    it('should detect missing rate_change qualifier as medium risk', () => {
      const piece = makePiece({
        body: 'Nuestra tasa preferencial es del 5%',
      });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('medium');
      const issue = result.issues.find(i => i.reason.includes('rate_change'));
      expect(issue).toBeDefined();
    });

    it('should detect missing capital_risk qualifier as medium risk', () => {
      const piece = makePiece({
        body: 'Comienza a invertir con solo $100',
      });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('medium');
      const issue = result.issues.find(i => i.reason.includes('capital_risk'));
      expect(issue).toBeDefined();
    });

    it('should not flag qualifier when qualifier text is present', () => {
      const piece = makePiece({
        body: 'Comienza a invertir con solo $100. Su capital está en riesgo.',
      });
      const result = validatePieceBaseRules(piece);

      const capitalIssue = result.issues.find(i => i.reason.includes('capital_risk'));
      expect(capitalIssue).toBeUndefined();
    });
  });

  describe('combined scenarios', () => {
    it('should return high when both prohibited and qualifier issues exist', () => {
      const piece = makePiece({
        headline: 'Garantizamos rendimiento del 20%',
        body: 'Invierte hoy con nosotros',
      });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
      expect(result.issues.length).toBeGreaterThanOrEqual(2);
    });

    it('should detect issues in footer field', () => {
      const piece = makePiece({
        footer: 'Retorno seguro garantizado',
      });
      const result = validatePieceBaseRules(piece);

      expect(result.riskLevel).toBe('high');
    });

    it('should tag all issues with source base_rules', () => {
      const piece = makePiece({
        headline: 'Garantizamos ganancias',
        body: 'Rendimiento del 20% sin calificador',
      });
      const result = validatePieceBaseRules(piece);

      for (const issue of result.issues) {
        expect(issue.source).toBe('base_rules');
      }
    });
  });
});
