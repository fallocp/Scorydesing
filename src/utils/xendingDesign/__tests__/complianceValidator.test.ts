import { describe, it, expect } from 'vitest';
import { validateCompliance, type ComplianceViolation } from '../complianceValidator';
import type { ComplianceRules } from '@/schemas/campaign/complianceRules.schema';

function makeRules(overrides: Partial<ComplianceRules> = {}): ComplianceRules {
  return {
    forbidden_terms: [],
    required_qualifiers: [],
    max_values: {},
    ...overrides,
  };
}

describe('validateCompliance', () => {
  it('returns empty array when there are no forbidden terms', () => {
    const rules = makeRules();
    expect(validateCompliance('any copy text', rules)).toEqual([]);
  });

  it('returns empty array when copy contains no forbidden terms', () => {
    const rules = makeRules({ forbidden_terms: ['tipo de cambio', 'FX'] });
    expect(validateCompliance('Envía dinero hoy mismo', rules)).toEqual([]);
  });

  it('detects a single forbidden term', () => {
    const rules = makeRules({ forbidden_terms: ['FX'] });
    const violations = validateCompliance('Operaciones FX rápidas', rules);

    expect(violations).toHaveLength(1);
    expect(violations[0]).toEqual({
      type: 'forbidden_term',
      term: 'FX',
      position: 12,
    });
  });

  it('performs case-insensitive matching', () => {
    const rules = makeRules({ forbidden_terms: ['tipo de cambio'] });
    const violations = validateCompliance('El TIPO DE CAMBIO subió hoy', rules);

    expect(violations).toHaveLength(1);
    expect(violations[0].term).toBe('tipo de cambio');
    expect(violations[0].position).toBe(3);
  });

  it('detects multiple different forbidden terms', () => {
    const rules = makeRules({
      forbidden_terms: ['tipo de cambio', 'FX', 'conversión de divisas'],
    });
    const copy = 'Operaciones FX y tipo de cambio favorable';
    const violations = validateCompliance(copy, rules);

    expect(violations).toHaveLength(2);
    const terms = violations.map((v) => v.term);
    expect(terms).toContain('tipo de cambio');
    expect(terms).toContain('FX');
  });

  it('detects multiple occurrences of the same forbidden term', () => {
    const rules = makeRules({ forbidden_terms: ['FX'] });
    const copy = 'FX rápido, mejor FX del mercado';
    const violations = validateCompliance(copy, rules);

    expect(violations).toHaveLength(2);
    expect(violations[0].position).toBe(0);
    expect(violations[1].position).toBe(17);
  });

  it('returns correct positions for terms in the copy', () => {
    const rules = makeRules({ forbidden_terms: ['garantizado'] });
    const copy = 'Servicio garantizado siempre';
    const violations = validateCompliance(copy, rules);

    expect(violations).toHaveLength(1);
    expect(violations[0].position).toBe(9);
  });

  it('handles empty copy string', () => {
    const rules = makeRules({ forbidden_terms: ['FX'] });
    expect(validateCompliance('', rules)).toEqual([]);
  });

  it('skips empty strings in forbidden_terms', () => {
    const rules = makeRules({ forbidden_terms: ['', 'FX'] });
    const copy = 'Operaciones FX';
    const violations = validateCompliance(copy, rules);

    expect(violations).toHaveLength(1);
    expect(violations[0].term).toBe('FX');
  });

  it('handles forbidden term at the very start of copy', () => {
    const rules = makeRules({ forbidden_terms: ['hola'] });
    const violations = validateCompliance('hola mundo', rules);

    expect(violations).toHaveLength(1);
    expect(violations[0].position).toBe(0);
  });

  it('handles forbidden term at the very end of copy', () => {
    const rules = makeRules({ forbidden_terms: ['mundo'] });
    const violations = validateCompliance('hola mundo', rules);

    expect(violations).toHaveLength(1);
    expect(violations[0].position).toBe(5);
  });
});
