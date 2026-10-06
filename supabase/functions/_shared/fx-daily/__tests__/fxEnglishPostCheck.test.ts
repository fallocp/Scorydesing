/**
 * Post-check determinístico del modo inglés (sin LLM): paridad de cifras,
 * calcos (auto-fix y violaciones), dirección del headline y longitudes.
 */
import { describe, it, expect } from 'vitest';
import {
  applyCalqueFixes,
  buildSourceNumberSet,
  checkHeadlineAlternative,
  checkHeadlineDirection,
  checkVariacionSign,
  extractNumbers,
  sameHeadline,
  validateEnReport,
} from '../fxEnglishPostCheck';
import {
  FX_EN_CALQUE_RULES,
  FX_EN_GLOSSARY,
  FX_EN_STYLE_GUIDE,
  renderGlossaryForPrompt,
} from '../fxEnglishStyleGuide';
import { buildExtractMessagesEn } from '../fxDailyExtractorEn';
import { FX_DEFAULT_NOTA_EN, type FxDailyReport } from '../fx-daily-types';

const SOURCE = `# Análisis USD/MXN 25 de agosto de 2026
## Apertura y contexto
El tipo de cambio abre en 18.42, con variación de 0.6% y rango 18.30 - 18.45.
Banxico recortó 25 pb. Retail Sales MoM -0.3% vs 0.2%. NFP 150k.
## Escenarios
Lateral 52% (18.35 - 18.48), Alcista 28% (18.50 - 18.60), Bajista 20% (18.20 - 18.30).`;

function baseReport(over: Partial<FxDailyReport> = {}): FxDailyReport {
  return {
    date: 'Aug 25, 2026',
    pair: 'USD/MXN',
    headline: 'Peso weakens toward 18.45 as Banxico cuts 25 bp',
    commentary: ['USD/MXN rose 0.6% to 18.42 at the open. The Mexican peso weakened after Banxico cut 25 bp.'],
    pulso: {
      apertura: '18.42',
      variacion: '+0.6%',
      variacion_dir: 'up',
      rango_dia: '18.30 - 18.45',
      tendencia: 'Range-bound',
      tendencia_dir: 'lateral',
    },
    drivers: [
      { title: 'MEXICO', bullets: ['Banxico cut 25 bp', 'Support at 18.30'] },
      { title: 'U.S.', bullets: ['Retail Sales MoM -0.3% vs 0.2%'] },
    ],
    lectura_clave: 'Treasury teams with USD payables may watch 18.45 resistance.',
    escenario_central: '18.35 - 18.48',
    escenarios: [
      { pct: 52, label: 'Range-bound', direction: 'lateral', rango: '18.35 - 18.48' },
      { pct: 28, label: 'USD/MXN higher', direction: 'up', rango: '18.50 - 18.60' },
    ],
    en_la_mira: [{ label: 'NFP', category: 'data' }],
    nota: FX_DEFAULT_NOTA_EN,
    locale: 'en',
    ...over,
  };
}

const src = buildSourceNumberSet(SOURCE);

describe('extractNumbers', () => {
  it('extrae cifras en valor absoluto y salta tokens pegados a letras', () => {
    expect(extractNumbers('USD/MXN rose 0.6% to 18.42')).toEqual([0.6, 18.42]);
    expect(extractNumbers('Q2 GDP and G7 meeting')).toEqual([]);
    expect(extractNumbers('1,250.5')).toEqual([1250.5]);
    expect(extractNumbers('18,42')).toEqual([18.42]);
    expect(extractNumbers('-0.12%')).toEqual([0.12]);
  });
});

describe('number parity', () => {
  it('un reporte fiel no tiene violaciones', () => {
    expect(validateEnReport(baseReport(), src)).toEqual([]);
  });

  it('marca una cifra ausente en la fuente con la ruta del campo', () => {
    const r = baseReport({ drivers: [{ title: 'MEXICO', bullets: ['Inflation at 4.1%'] }] });
    const v = validateEnReport(r, src);
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ field: 'drivers[0].bullets[0]', rule: 'number_mismatch' });
    expect(v[0].detail).toContain('4.1');
  });

  it('0.60% equivale a 0.6% de la fuente', () => {
    const r = baseReport({ pulso: { ...baseReport().pulso, variacion: '+0.60%' } });
    expect(validateEnReport(r, src)).toEqual([]);
  });

  it('valida también campos estructurados y headline_alternative', () => {
    const r = baseReport({ escenario_central: '18.99 - 19.10' });
    const fields = validateEnReport(r, src, 'USD/MXN nears 18.77').map((v) => v.field);
    expect(fields).toEqual(['headline_alternative', 'escenario_central', 'escenario_central']);
  });

  it('excluye date y nota', () => {
    const r = baseReport({ date: 'Sep 30, 2031', nota: 'Note 999' });
    expect(validateEnReport(r, src)).toEqual([]);
  });

  it('acepta miles con punto del MD español', () => {
    const set = buildSourceNumberSet('Reservas por 1.250 mdd');
    expect(set.has('1250')).toBe(true);
  });
});

describe('applyCalqueFixes', () => {
  const cases: [string, string][] = [
    ['The dollar-peso pair rose', 'The USD/MXN pair rose'],
    ['the Bank of Mexico held rates', 'Banxico held rates'],
    ['risk hunger improved', 'risk appetite improved'],
    ['the change type rose', 'the exchange rate rose'],
    ['EE.UU. data', 'U.S. data'],
    ['T-MEC review', 'USMCA review'],
    ['a 25 pb cut', 'a 25 bp cut'],
    ['USD/MXN at 18,42', 'USD/MXN at 18.42'],
  ];
  it.each(cases)('corrige "%s"', (input, expected) => {
    const { report } = applyCalqueFixes(baseReport({ lectura_clave: input }));
    expect(report.lectura_clave).toBe(expected);
  });

  it('corrige headline_alternative y no muta la entrada', () => {
    const original = baseReport({ headline: 'Dollar-peso climbs', commentary: ['EE.UU. data'] });
    const snapshot = structuredClone(original);
    const out = applyCalqueFixes(original, 'Bank of Mexico in focus');
    expect(out.report.headline).toBe('USD/MXN climbs');
    expect(out.report.commentary[0]).toBe('U.S. data');
    expect(out.headlineAlternative).toBe('Banxico in focus');
    expect(original).toEqual(snapshot);
  });

  it('no toca miles con coma', () => {
    const { report } = applyCalqueFixes(baseReport({ lectura_clave: 'Flows of 1,250 contracts' }));
    expect(report.lectura_clave).toBe('Flows of 1,250 contracts');
  });
});

describe('calque violations', () => {
  const bad = [
    'USD/MXN found a floor at 18.30',
    'the roof at 18.45',
    'a ceiling near 18.45',
    'after the closure',
    'at the opening',
    'the exchange rate improved',
    'bullish pressure on the peso',
    'the peso rose to 18.42',
    'remittances supported the peso',
    'a rollercoaster session',
    'el tipo de cambio subió',
  ];
  it.each(bad)('marca "%s"', (text) => {
    const v = validateEnReport(baseReport({ lectura_clave: text }), src);
    expect(v.some((x) => x.rule === 'calque' && x.field === 'lectura_clave')).toBe(true);
  });

  const ok = [
    'USD/MXN held steady at the open',
    'the close',
    'support at 18.30',
    'risk appetite firmed',
    'the reopening of trade talks',
    'the U.S. debt ceiling debate',
  ];
  it.each(ok)('no marca "%s"', (text) => {
    const v = validateEnReport(baseReport({ lectura_clave: text }), src);
    expect(v.filter((x) => x.rule === 'calque')).toEqual([]);
  });
});

describe('checkHeadlineDirection', () => {
  it('up + peso más fuerte = contradicción', () => {
    expect(checkHeadlineDirection('Peso firms as risk appetite returns', 'up')).not.toBeNull();
  });
  it('up + peso más débil = ok', () => {
    expect(checkHeadlineDirection('Peso weakens past 18.40', 'up')).toBeNull();
  });
  it('down + USD/MXN sube = contradicción', () => {
    expect(checkHeadlineDirection('USD/MXN climbs on Fed bets', 'down')).not.toBeNull();
  });
  it('flat = sin chequeo', () => {
    expect(checkHeadlineDirection('USD/MXN climbs on Fed bets', 'flat')).toBeNull();
  });
  it('validateEnReport incluye la violación de dirección', () => {
    const v = validateEnReport(baseReport({ headline: 'Peso strengthens on Banxico' }), src);
    expect(v.map((x) => x.rule)).toContain('direction');
  });

  it.each([
    'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus',
    'Mexican Peso Firms, with Fed Minutes in Focus',
  ])('Title Case: "%s" ok con down, contradicción con up', (h) => {
    expect(checkHeadlineDirection(h, 'down')).toBeNull();
    expect(checkHeadlineDirection(h, 'up')).toMatchObject({ field: 'headline', rule: 'direction' });
  });
  it('Title Case: USD/MXN Eases con up y Mexican Peso Weakens con down = contradicción', () => {
    expect(checkHeadlineDirection('USD/MXN Eases as Risk Appetite Returns', 'up')).not.toBeNull();
    expect(checkHeadlineDirection('Mexican Peso Weakens, with NFP in Focus', 'down')).not.toBeNull();
    expect(checkHeadlineDirection('Mexican Peso Weakens, with NFP in Focus', 'up')).toBeNull();
  });
  it('usa el campo indicado', () => {
    expect(checkHeadlineDirection('Mexican Peso Gains', 'up', 'headline_alternative')).toMatchObject({
      field: 'headline_alternative',
    });
  });
  it('validateEnReport revisa la dirección de headline_alternative', () => {
    const v = validateEnReport(baseReport(), src, 'Mexican Peso Gains on Risk Appetite');
    expect(v).toContainEqual(expect.objectContaining({ field: 'headline_alternative', rule: 'direction' }));
  });
});

describe('checkHeadlineAlternative', () => {
  it('vacía → headline_options', () => {
    expect(checkHeadlineAlternative('Peso Firms', '')).toEqual([
      expect.objectContaining({ field: 'headline_alternative', rule: 'headline_options' }),
    ]);
  });
  it('repetida (mayúsculas/puntuación) → headline_options', () => {
    const v = checkHeadlineAlternative('peso firms', 'Peso Firms.');
    expect(v).toHaveLength(1);
    expect(v[0]).toMatchObject({ rule: 'headline_options' });
    expect(v[0].detail).toContain('repeats headline');
  });
  it('distinta → sin violaciones', () => {
    expect(checkHeadlineAlternative('Mexican Peso Firms', 'Mexican Peso Gains on Latin American Risk Appetite')).toEqual([]);
  });
  it('más de 14 palabras → length', () => {
    const long = Array.from({ length: 15 }, () => 'word').join(' ');
    expect(checkHeadlineAlternative('Peso Firms', long)).toEqual([
      expect.objectContaining({ field: 'headline_alternative', rule: 'length' }),
    ]);
  });
  it('sameHeadline ignora mayúsculas y puntuación', () => {
    expect(sameHeadline('Peso Firms.', 'peso firms')).toBe(true);
    expect(sameHeadline('Peso Firms', 'Peso Gains')).toBe(false);
  });
});

describe('checkVariacionSign', () => {
  it.each([
    ['-0.6%', 'up'],
    ['−0.6%', 'up'],
    ['+0.6%', 'down'],
  ] as const)('"%s" con dir %s = contradicción', (v, d) => {
    expect(checkVariacionSign(v, d)).toMatchObject({ field: 'pulso.variacion', rule: 'direction' });
  });
  it.each([
    ['+0.6%', 'up'],
    ['-0.6%', 'down'],
    ['0.6%', 'up'],
    ['0.6%', 'down'],
    ['-0.1%', 'flat'],
    ['', 'up'],
  ] as const)('"%s" con dir %s = ok', (v, d) => {
    expect(checkVariacionSign(v, d)).toBeNull();
  });
  it('validateEnReport detecta signo invertido aunque la cifra exista en la fuente', () => {
    const r = baseReport({ pulso: { ...baseReport().pulso, variacion: '-0.6%' } });
    expect(validateEnReport(r, src)).toEqual([expect.objectContaining({ field: 'pulso.variacion', rule: 'direction' })]);
  });
});

describe('length bounds', () => {
  const words = (n: number) => Array.from({ length: n }, () => 'word').join(' ');
  it('marca cada campo sobre su límite', () => {
    const r = baseReport({
      headline: words(15),
      commentary: [words(50), words(41)],
      drivers: [{ title: 'MEXICO', bullets: [words(19)] }],
      lectura_clave: words(51),
      pulso: { ...baseReport().pulso, tendencia: words(5) },
      en_la_mira: [{ label: words(6), category: 'generic' }],
    });
    const fields = validateEnReport(r, src)
      .filter((v) => v.rule === 'length')
      .map((v) => v.field);
    expect(fields).toEqual([
      'headline',
      'commentary',
      'drivers[0].bullets[0]',
      'lectura_clave',
      'pulso.tendencia',
      'en_la_mira[0].label',
    ]);
  });
  it('headline vacío es violación', () => {
    const v = validateEnReport(baseReport({ headline: '' }), src);
    expect(v).toContainEqual(expect.objectContaining({ field: 'headline', rule: 'length' }));
  });
});

describe('style guide', () => {
  it('no menciona remittances/remesas en guía, glosario, hints ni prompts', () => {
    const banned = /remittance|remesas/i;
    expect(FX_EN_STYLE_GUIDE).not.toMatch(banned);
    expect(renderGlossaryForPrompt()).not.toMatch(banned);
    expect(JSON.stringify(FX_EN_GLOSSARY)).not.toMatch(banned);
    for (const rule of FX_EN_CALQUE_RULES) expect(rule.hint).not.toMatch(banned);
    const extract = buildExtractMessagesEn('# Análisis USD/MXN\nabre en 18.42').map((m) => m.content as string).join('\n');
    expect(extract).not.toMatch(banned);
  });
  it('fija reglas de dirección y del par', () => {
    expect(FX_EN_STYLE_GUIDE).toContain('USD/MXN up = peso weaker');
    expect(FX_EN_STYLE_GUIDE).toContain('never "dollar-peso"');
  });
});

describe('performance', () => {
  it('50 KB de MD + reporte completo < 50 ms', () => {
    const big = (SOURCE + '\n').repeat(Math.ceil(50_000 / SOURCE.length));
    const t0 = performance.now();
    const set = buildSourceNumberSet(big);
    validateEnReport(baseReport(), set, 'USD/MXN rises 0.6%');
    expect(performance.now() - t0).toBeLessThan(50);
  });
});
