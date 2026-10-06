/**
 * Extractor ES: titular aprobado (paréntesis simples y dobles), prompt de tendencia
 * por dirección del par y etiqueta fija de tendencia en la coerción. Sin LLM.
 */
import { describe, it, expect } from 'vitest';
import {
  FX_ES_TREND_LABELS,
  buildExtractMessages,
  coerceFxDaily,
  extractApprovedHeadline,
} from '../fxDailyExtractor';

describe('extractApprovedHeadline', () => {
  it('lee ((Titular)) con doble paréntesis', () => {
    expect(
      extractApprovedHeadline('# ANALISIS SEMANAL USD/MXN 5 OCT 26 ((Peso firme, foco en minutas Fed))\nbody'),
    ).toBe('Peso firme, foco en minutas Fed');
    expect(extractApprovedHeadline('# X (( A ))   ')).toBe('A');
  });

  it('paréntesis simples: mismo resultado que antes', () => {
    expect(extractApprovedHeadline('# Análisis USD/MXN (El peso cede ante datos de EE.UU.)')).toBe(
      'El peso cede ante datos de EE.UU.',
    );
  });

  it('sin paréntesis o solo en subtítulo → vacío', () => {
    expect(extractApprovedHeadline('# Análisis USD/MXN 5 OCT 26\nbody')).toBe('');
    expect(extractApprovedHeadline('Texto\n## Sub (x)\nbody')).toBe('');
  });
});

describe('buildExtractMessages (tendencia)', () => {
  it('define tendencia_dir como dirección del par, sin sentimiento', () => {
    const s = buildExtractMessages('# Análisis USD/MXN\nbody').at(0)!.content as string;
    expect(s).not.toContain('positiva para el peso');
    expect(s).not.toContain('SENTIMIENTO');
    expect(s).toContain('"up" si USD/MXN tiende al alza (peso más débil)');
    expect(s).toContain('"down" si tiende a la baja (peso más fuerte)');
  });
});

describe('coerceFxDaily (tendencia)', () => {
  it.each([
    ['up', 'Al alza'],
    ['down', 'A la baja'],
    ['lateral', 'Lateral'],
  ] as const)('tendencia_dir %s → "%s" (ignora el texto del LLM)', (d, label) => {
    const r = coerceFxDaily({ headline: 'H', pulso: { tendencia: 'positiva para el peso', tendencia_dir: d } })!;
    expect(r.pulso.tendencia).toBe(label);
    expect(r.pulso.tendencia_dir).toBe(d);
    expect(FX_ES_TREND_LABELS[d]).toBe(label);
  });

  it.each([['foo'], [undefined]])('dirección inválida (%s) → Lateral', (d) => {
    const r = coerceFxDaily({ headline: 'H', pulso: { tendencia: 'positiva para el peso', tendencia_dir: d } })!;
    expect(r.pulso.tendencia).toBe('Lateral');
    expect(r.pulso.tendencia_dir).toBe('lateral');
  });
});
