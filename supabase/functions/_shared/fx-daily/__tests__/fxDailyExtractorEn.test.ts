/**
 * Extractor EN: prompt facts-first, prompt de reparación, coerción de facts y
 * ensamble determinístico (applyEnFacts). Sin LLM.
 */
import { describe, it, expect } from 'vitest';
import {
  applyEnFacts,
  buildExtractMessagesEn,
  buildFallbackHeadlineEn,
  buildRepairMessagesEn,
  coerceFxEnFacts,
  formatEnDate,
  isFactsOwnedField,
  normalizeEnDriverTitle,
  titleCaseEn,
  type FxEnFacts,
} from '../fxDailyExtractorEn';
import { FX_EN_STYLE_GUIDE } from '../fxEnglishStyleGuide';
import { FX_DEFAULT_NOTA, FX_DEFAULT_NOTA_EN, type FxDailyReport } from '../fx-daily-types';

const MD = '# Análisis USD/MXN (El peso cede ante datos de EE.UU.)\nEl tipo de cambio abre en 18.42.';

function facts(over: Partial<FxEnFacts> = {}): FxEnFacts {
  return {
    date_iso: '2026-08-25',
    pulso: { apertura: '18.42', variacion: '+0.6%', variacion_dir: 'up', rango_dia: '18.30 - 18.45', tendencia_dir: 'down' },
    close: '18.31',
    support: ['18.30'],
    resistance: ['18.45'],
    context_points: ['USD/MXN up 0.6% after U.S. data'],
    drivers: [{ region: 'us', points: ['NFP 150k vs 120k'] }],
    bias: 'Upside bias',
    escenario_central: '18.35 - 18.48',
    escenarios: [
      { pct: 20, direction: 'down', rango: '18.20 - 18.30' },
      { pct: 52, direction: 'lateral', rango: '18.35 - 18.48' },
      { pct: 28, direction: 'up', rango: '18.50 - 18.60' },
    ],
    en_la_mira: [{ label: 'NFP', category: 'data' }],
    ...over,
  };
}

function llmReport(): FxDailyReport {
  return {
    date: '25 AGO 2026',
    pair: 'dollar-peso',
    headline: 'Peso weakens after U.S. data',
    commentary: ['The Mexican peso weakened.'],
    pulso: { apertura: '9.99', variacion: '', variacion_dir: 'flat', rango_dia: '', tendencia: 'Peso-negative', tendencia_dir: 'lateral' },
    drivers: [
      { title: 'MÉXICO', bullets: ['a'] },
      { title: 'Mexico', bullets: ['dup'] },
      { title: 'EE.UU.', bullets: ['b'] },
      { title: 'Global', bullets: ['c'] },
    ],
    lectura_clave: 'Watch 18.45.',
    escenario_central: '',
    escenarios: [{ pct: 99, label: 'Alcista', direction: 'up' }],
    en_la_mira: [{ label: 'NFP', category: 'data' }],
    nota: FX_DEFAULT_NOTA,
  };
}

describe('buildExtractMessagesEn', () => {
  it('incluye guía, glosario con formas prohibidas y la instrucción de no traducir', () => {
    const [system, user] = buildExtractMessagesEn(MD, 'El peso cede ante datos de EE.UU.');
    const s = system.content as string;
    expect(s).toContain(FX_EN_STYLE_GUIDE);
    expect(s).toContain('never: change type, type of change');
    expect(s).toContain('never: Bank of Mexico');
    expect(s).toContain('Do not translate Spanish sentences');
    expect(s.indexOf('"facts"')).toBeGreaterThan(-1);
    expect(s.lastIndexOf('"facts": {')).toBeLessThan(s.lastIndexOf('"report": {'));
    expect(s).toContain('El peso cede ante datos de EE.UU.');
    expect(user.content).toContain('El tipo de cambio abre en 18.42.');
    expect(user.content).toContain('do not translate it line by line');
  });

  it('sin titular aprobado no lo menciona', () => {
    const s = buildExtractMessagesEn(MD).at(0)!.content as string;
    expect(s).not.toContain('APPROVED Spanish headline');
    expect(s).toContain('two fresh English headline options');
    expect(s).toContain('clearly different framings');
    expect(s).not.toContain('Keep every element');
  });

  it('incluye ejemplos buenos/malos de headline y Title Case', () => {
    const s = buildExtractMessagesEn(MD).at(0)!.content as string;
    for (const t of [
      'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus',
      'Mexican Peso Firms, with Fed Minutes in Focus',
      'USD/MXN eases as risk appetite supports the peso',
      'Peso firm, focus on Fed minutes',
      'Title Case',
      'headline_alternative is never empty and never repeats headline',
    ]) {
      expect(s).toContain(t);
    }
  });

  it('con titular aprobado pide conservar todos sus elementos', () => {
    const s = buildExtractMessagesEn(MD, 'Peso firme, foco en minutas Fed').at(0)!.content as string;
    expect(s).toContain('"Peso firme, foco en minutas Fed"');
    expect(s).toContain('Keep every element of the approved headline (e.g., Fed focus)');
    expect(s).toContain('clearly different option that leads with the main driver named in the body');
  });
});

describe('titleCaseEn', () => {
  it.each([
    [
      'Mexican peso gains on Latin American risk appetite, with the Fed in focus',
      'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus',
    ],
    ['the peso firms as U.S. data eases', 'The Peso Firms as U.S. Data Eases'],
    ['banxico cuts 25 bp, peso holds steady', 'Banxico Cuts 25 bp, Peso Holds Steady'],
    ['USD/MXN Eases On PCE', 'USD/MXN Eases on PCE'],
    ['', ''],
  ])('"%s" → "%s"', (input, expected) => {
    expect(titleCaseEn(input)).toBe(expected);
  });
});

describe('buildFallbackHeadlineEn', () => {
  const base = (over: Partial<FxDailyReport>): FxDailyReport => ({ ...llmReport(), headline: 'Something Else', ...over });
  it('down + foco → Gains, with <foco> in Focus', () => {
    const r = base({
      pulso: { ...llmReport().pulso, variacion_dir: 'down' },
      en_la_mira: [{ label: 'Fed minutes', category: 'central_bank' }],
    });
    expect(buildFallbackHeadlineEn(r)).toBe('Mexican Peso Gains, with Fed Minutes in Focus');
  });
  it('up sin en_la_mira → Weakens Against the U.S. Dollar', () => {
    const r = base({ pulso: { ...llmReport().pulso, variacion_dir: 'up' }, en_la_mira: [] });
    expect(buildFallbackHeadlineEn(r)).toBe('Mexican Peso Weakens Against the U.S. Dollar');
  });
  it('flat → Holds Steady', () => {
    const r = base({ pulso: { ...llmReport().pulso, variacion_dir: 'flat' } });
    expect(buildFallbackHeadlineEn(r).startsWith('Mexican Peso Holds Steady')).toBe(true);
  });
  it('si el headline es el primer candidato, devuelve el segundo', () => {
    const r = base({
      headline: 'Mexican Peso Weakens, with NFP in Focus',
      pulso: { ...llmReport().pulso, variacion_dir: 'up' },
      en_la_mira: [{ label: 'NFP', category: 'data' }],
    });
    expect(buildFallbackHeadlineEn(r)).toBe('Mexican Peso Weakens Against the U.S. Dollar');
  });
});

describe('buildRepairMessagesEn', () => {
  it('lleva facts e issues pero NO el MD', () => {
    const msgs = buildRepairMessagesEn(facts(), llmReport(), 'Alt', [
      { field: 'lectura_clave', rule: 'calque', detail: '"floor": Use support/resistance' },
    ]);
    const all = msgs.map((m) => m.content as string).join('\n');
    expect(all).toContain('lectura_clave: \\"floor\\": Use support/resistance');
    expect(all).toContain('"date_iso":"2026-08-25"');
    expect(all).toContain('"headline_alternative":"Alt"');
    expect(all).not.toContain('El tipo de cambio abre en 18.42.');
    expect(all).toContain('HEADLINES');
  });
});

describe('coerceFxEnFacts', () => {
  it.each([null, undefined, 'texto', 42, []])('tolera basura (%s)', (input) => {
    const f = coerceFxEnFacts(input);
    expect(f.date_iso).toBe('');
    expect(f.pulso.variacion_dir).toBe('flat');
    expect(f.pulso.tendencia_dir).toBe('lateral');
    expect(f.drivers).toEqual([]);
    expect(f.escenarios).toEqual([]);
    expect(f.en_la_mira).toEqual([]);
  });

  it('normaliza tipos y enums', () => {
    const f = coerceFxEnFacts({
      pulso: { apertura: 18.42, variacion_dir: 'UP' },
      drivers: [{ region: 'MEXICO', points: 'Banxico 25 bp' }, { region: 'mars', points: [] }],
      escenarios: [{ pct: '52%', direction: 'sideways' }],
      en_la_mira: ['NFP', { label: 'Banxico', category: 'central_bank' }],
    });
    expect(f.pulso.apertura).toBe('18.42');
    expect(f.pulso.variacion_dir).toBe('up');
    expect(f.drivers).toEqual([{ region: 'mexico', points: ['Banxico 25 bp'] }]);
    expect(f.escenarios).toEqual([{ pct: 52, direction: 'lateral', rango: undefined }]);
    expect(f.en_la_mira).toEqual([
      { label: 'NFP', category: 'generic' },
      { label: 'Banxico', category: 'central_bank' },
    ]);
  });
});

describe('formatEnDate', () => {
  it('formatea Mon D, YYYY', () => {
    expect(formatEnDate('2026-08-25')).toBe('Aug 25, 2026');
    expect(formatEnDate('2026-10-02')).toBe('Oct 2, 2026');
  });
  it.each(['', '25/08/2026', '2026-13-01', '2026-00-10', 'x'])('inválido "%s" → vacío', (s) => {
    expect(formatEnDate(s)).toBe('');
  });
});

describe('isFactsOwnedField', () => {
  it('campos que applyEnFacts fija desde facts', () => {
    const f = facts();
    for (const field of ['pulso.apertura', 'pulso.variacion', 'pulso.rango_dia', 'escenario_central', 'escenarios[0].pct', 'escenarios[1].rango']) {
      expect(isFactsOwnedField(field, f)).toBe(true);
    }
  });
  it('prosa y campos estructurados sin valor en facts son reparables', () => {
    const f = facts({
      pulso: { apertura: '', variacion: '', variacion_dir: 'up', rango_dia: '', tendencia_dir: 'down' },
      escenario_central: '',
      escenarios: [],
    });
    for (const field of ['pulso.apertura', 'pulso.variacion', 'pulso.rango_dia', 'escenario_central', 'escenarios[0].pct']) {
      expect(isFactsOwnedField(field, f)).toBe(false);
    }
    for (const field of ['headline', 'commentary[0]', 'drivers[0].bullets[1]', 'lectura_clave', 'pulso.tendencia']) {
      expect(isFactsOwnedField(field, facts())).toBe(false);
    }
  });
});

describe('normalizeEnDriverTitle', () => {
  it.each([
    ['MÉXICO', 'MEXICO'],
    ['Mexico', 'MEXICO'],
    ['EE.UU.', 'U.S.'],
    ['US', 'U.S.'],
    ['U.S.', 'U.S.'],
    ['United States', 'U.S.'],
    ['Global', 'GLOBAL BACKDROP'],
    ['ENTORNO GLOBAL', 'GLOBAL BACKDROP'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeEnDriverTitle(input)).toBe(expected);
  });
});

describe('applyEnFacts', () => {
  it('sobrescribe lo estructurado con facts y no muta la entrada', () => {
    const input = llmReport();
    const snapshot = structuredClone(input);
    const r = applyEnFacts(input, facts());
    expect(input).toEqual(snapshot);

    expect(r.date).toBe('Aug 25, 2026');
    expect(r.pair).toBe('USD/MXN');
    expect(r.pulso).toEqual({
      apertura: '18.42',
      variacion: '+0.6%',
      variacion_dir: 'up',
      rango_dia: '18.30 - 18.45',
      tendencia: 'Downtrend',
      tendencia_dir: 'down',
    });
    expect(r.escenario_central).toBe('18.35 - 18.48');
    expect(r.escenarios.map((e) => [e.pct, e.label])).toEqual([
      [52, 'Range-bound'],
      [28, 'USD/MXN higher'],
      [20, 'USD/MXN lower'],
    ]);
    expect(r.drivers.map((d) => d.title)).toEqual(['MEXICO', 'U.S.', 'GLOBAL BACKDROP']);
    expect(r.drivers[0].bullets).toEqual(['a']);
    expect(r.nota).toBe(FX_DEFAULT_NOTA_EN);
    expect(r.locale).toBe('en');
    expect(r.headline).toBe(input.headline);
  });

  it('no pide calendar_events en el esquema del prompt', () => {
    const s = buildExtractMessagesEn(MD).at(0)!.content as string;
    expect(s).not.toContain('calendar_events');
  });

  it('sin fecha en facts conserva la del report; sin escenarios en facts reetiqueta los del report', () => {
    const r = applyEnFacts(llmReport(), facts({ date_iso: '', escenarios: [] }));
    expect(r.date).toBe('25 AGO 2026');
    expect(r.escenarios).toEqual([{ pct: 99, label: 'USD/MXN higher', direction: 'up', rango: undefined }]);
  });
});
