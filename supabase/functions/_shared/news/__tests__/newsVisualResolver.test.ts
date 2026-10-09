import { describe, expect, it } from 'vitest';
import { buildResolverMessages, coerceResolutions } from '../newsVisualResolver.ts';
import { buildSlideVisual, extractAllowedFigures } from '../newsPromptBuilder.ts';
import type { NewsSlidePlan } from '../news-types.ts';

const plan = (headline: string, subcopy = '', key_data = ''): NewsSlidePlan => ({
  slide_number: 1,
  headline,
  subcopy,
  key_data,
  data_label: '',
  secondary_data: '',
  source: [],
  editorial_type: 'market_update',
});

const llm = (o: Record<string, unknown>) => ({
  slides: [
    {
      slide_number: 1,
      visual_confidence: 0.8,
      story_type: 'single',
      mechanism: 'rises',
      visual_engine: 'editorial_photography_plus_data',
      layout_family: 'L1',
      text_safe_area: 'left',
      ...o,
    },
  ],
});

const resolve = (p: NewsSlidePlan, o: Record<string, unknown>) => coerceResolutions(llm(o), [p])[0];

const primarySubjectLine = (prompt: string) =>
  prompt.split('\n').find((l) => l.startsWith('Primary subject:')) ?? '';

const PESO = plan(
  'El peso rompe 18 ante optimismo',
  'El tipo de cambio se ubicó en 17.99, tras un mínimo de 17.91, por debajo de 18.00, por el retroceso del dólar y el apetito por riesgo ante optimismo económico, petrolero y geopolítico.',
);

describe('newsVisualResolver — FX es FX', () => {
  it('(a1) peso + LLM fx → fx/fx, sujeto del LLM intacto, sin guiño de energía', () => {
    const r = resolve(PESO, {
      domain: 'fx',
      archetype: 'fx',
      visual_subject: 'currency trading screen with a downward USD/MXN chart',
    });
    expect(r.archetype).toBe('fx');
    expect(r.domain).toBe('fx');
    expect(r.story_type).toBe('single');
    expect(r.visual_subject).toBe('currency trading screen with a downward USD/MXN chart');
    expect(r.supporting_elements.join(' ')).not.toMatch(/oil/);
  });

  it('(a2) peso + LLM energy (petróleo solo en subcopy) → sigue fx con sujeto coherente', () => {
    const r = resolve(PESO, {
      domain: 'energy',
      archetype: 'energy',
      visual_subject: 'oil refinery at dusk',
      supporting_elements: ['oil tanker'],
    });
    expect(r.archetype).toBe('fx');
    expect(r.domain).toBe('fx');
    expect(r.visual_subject).not.toMatch(/oil|refinery/i);
    expect(r.visual_subject).toContain('exchange-rate');
    expect(r.supporting_elements.join(' ')).not.toMatch(/oil tanker/);
  });

  it('(a3) prompt del peso: STYLE FX, whitelist de cifras, sin Brent/WTI, sujeto coherente', () => {
    const r = resolve(PESO, {
      domain: 'energy',
      archetype: 'energy',
      visual_subject: 'oil refinery at dusk',
    });
    const prompt = buildSlideVisual(PESO, r).image_prompt;
    expect(prompt).toContain('about foreign exchange and currency markets');
    expect(prompt).not.toContain('energy scene');
    expect(prompt).not.toContain('This is an ENERGY story');
    expect(prompt).toContain('17.99');
    expect(prompt).toContain('17.91');
    expect(prompt).toContain('18.00');
    expect(prompt).toContain('No Brent, no WTI, no stock indices');
    expect(primarySubjectLine(prompt)).not.toMatch(/oil|refinery/i);
  });

  it('(a4) whitelist de cifras tal cual del texto', () => {
    expect(extractAllowedFigures(PESO)).toEqual(['18', '17.99', '17.91', '18.00']);
  });

  it('(b1) "El peso gana por alza del petróleo" → fx con guiño de energía subordinado', () => {
    const r = resolve(plan('El peso gana por alza del petróleo'), { domain: 'fx', archetype: 'fx' });
    expect(r.archetype).toBe('fx');
    expect(r.story_type).toBe('single');
    expect(r.supporting_elements.some((s) => /oil/.test(s))).toBe(true);
  });

  it('(b3) titular sin artículo "Peso gana por alza del petróleo" + LLM fx → fx con guiño, sin energy', () => {
    const p = plan('Peso gana por alza del petróleo');
    const r = resolve(p, { domain: 'fx', archetype: 'fx' });
    expect(r.archetype).toBe('fx');
    expect(r.domain).toBe('fx');
    expect(r.story_type).toBe('single');
    expect(r.supporting_elements.some((s) => /oil/.test(s))).toBe(true);
    expect(buildSlideVisual(p, r).image_prompt).not.toContain('This is an ENERGY story');
    expect(
      resolve(plan('Peso se deprecia por caída del crudo'), { domain: 'fx', archetype: 'fx' }).archetype,
    ).toBe('fx');
  });

  it('(b5) titular que empieza con "Peso …" + LLM energy → fx con guiño, sin STYLE de energía', () => {
    const p = plan('Peso gana por alza del petróleo');
    const r = resolve(p, { domain: 'energy', archetype: 'energy', visual_subject: 'oil refinery at dusk' });
    expect(r.archetype).toBe('fx');
    expect(r.domain).toBe('fx');
    expect(r.story_type).toBe('single');
    expect(r.visual_subject).not.toMatch(/refinery/i);
    expect(r.supporting_elements.some((s) => /oil/.test(s))).toBe(true);
    const prompt = buildSlideVisual(p, r).image_prompt;
    expect(prompt).not.toContain('This is an ENERGY story');
    expect(prompt).not.toContain('energy scene');
    expect(
      resolve(plan('Peso se deprecia por caída del crudo'), { domain: 'energy', archetype: 'energy' }).archetype,
    ).toBe('fx');
  });

  it('(b6) "peso" a mitad del titular ("Gana peso la propuesta petrolera") no es FX', () => {
    const r = resolve(plan('Gana peso la propuesta petrolera'), { domain: 'energy', archetype: 'energy' });
    expect(r.archetype).not.toBe('fx');
    expect(r.archetype).toBe('energy');
  });

  it('(b4) "Petróleo cae y fortalece al peso" → fx aunque el LLM diga energy', () => {
    const r = resolve(plan('Petróleo cae y fortalece al peso'), { domain: 'energy', archetype: 'energy' });
    expect(r.archetype).toBe('fx');
    expect(r.story_type).toBe('single');
    expect(r.supporting_elements.some((s) => /oil/.test(s))).toBe(true);
  });

  it('" yen" no dispara FX con "yendo"; " yen " sí', () => {
    const notFx = resolve(plan('Mercados van yendo a la baja'), { domain: 'macro', archetype: 'fallback_institutional' });
    expect(notFx.archetype).not.toBe('fx');
    expect(resolve(plan('El yen se aprecia'), { domain: 'macro', archetype: 'fallback_institutional' }).archetype).toBe(
      'fx',
    );
  });

  it('(b2) LLM mixta con energía secundaria → sigue fx single, sin STYLE de energía ni mixed_macro', () => {
    const p = plan('El peso gana por alza del petróleo');
    const r = resolve(p, {
      domain: 'fx',
      archetype: 'mixed_macro',
      story_type: 'mixed',
      secondary_domain: 'energy',
      secondary_visual_subject: 'oil refinery',
    });
    expect(r.archetype).toBe('fx');
    expect(r.story_type).toBe('single');
    expect(r.secondary_visual_subject).toBeUndefined();
    const prompt = buildSlideVisual(p, r).image_prompt;
    expect(prompt).not.toContain('This is an ENERGY story');
    expect(prompt).not.toContain('Secondary subject:');
    expect(prompt).not.toContain('mixed macro');
  });
});

describe('newsVisualResolver — energía estricta', () => {
  it('(c) "Brent arriba de 90" con LLM bonds/commodities → energy', () => {
    const p = plan('Brent arriba de 90');
    const r = resolve(p, { domain: 'bonds', archetype: 'bonds', visual_subject: 'U.S. Treasury building' });
    expect(r.archetype).toBe('energy');
    expect(r.domain).toBe('energy');
    expect(r.visual_engine).toBe('industrial_macro');
    expect(resolve(p, { domain: 'commodities', archetype: 'bonds' }).archetype).toBe('energy');
    const prompt = buildSlideVisual(p, r).image_prompt;
    expect(prompt).toContain('Allowed asset labels: Brent only');
    expect(prompt).toContain('90');
  });

  it('(d) "Gasolina sube en México" → energy, sin etiqueta Brent/WTI', () => {
    const p = plan('Gasolina sube en México');
    const r = resolve(p, { domain: 'commodities', archetype: 'fallback_industrial_macro' });
    expect(r.archetype).toBe('energy');
    expect(buildSlideVisual(p, r).image_prompt).toContain('do not label Brent or WTI');
  });

  it('(e) "Wall Street sube por petroleras" → no es energy', () => {
    const p = plan('Wall Street sube por petroleras');
    expect(resolve(p, { domain: 'equities', archetype: 'equities' }).archetype).toBe('equities');
    const r = resolve(p, { domain: 'energy', archetype: 'energy' });
    expect(r.archetype).not.toBe('energy');
    expect(r.archetype).toBe('equities');
  });

  it('(f) "La Fed sube el tono y el petróleo presiona" → mixed_macro', () => {
    const p = plan('La Fed sube el tono y el petróleo presiona');
    const r = resolve(p, { domain: 'central_bank', archetype: 'central_bank' });
    expect(r.archetype).toBe('mixed_macro');
    expect(r.story_type).toBe('mixed');
    expect(r.secondary_domain).toBe('energy');
    const r2 = resolve(p, {
      domain: 'central_bank',
      archetype: 'mixed_macro',
      story_type: 'mixed',
      secondary_domain: 'energy',
      secondary_visual_subject: 'oil tanker',
    });
    expect(r2.archetype).toBe('mixed_macro');
    expect(r2.secondary_visual_subject).toBe('oil tanker');
  });

  it('petróleo solo en subcopy de una nota no-FX no fuerza energy', () => {
    const r = resolve(plan('Exportaciones crecen en agosto', 'Impulso por optimismo petrolero.'), {
      domain: 'trade',
      archetype: 'trade_map',
    });
    expect(r.archetype).toBe('trade_map');
  });

  it('dominio energy del LLM con baja confianza ya no fuerza energy', () => {
    const r = resolve(plan('Mercados atentos', 'Sesión mixta.'), {
      domain: 'energy',
      archetype: 'energy',
      visual_confidence: 0.3,
    });
    expect(r.archetype).toBe('fallback_institutional');
  });
});

describe('newsPromptBuilder — sin datos inventados', () => {
  it('(g) nota sin cifras → el gráfico no lleva números', () => {
    const p = plan('Banxico mantiene su postura', 'La junta reiteró un tono prudente.');
    const r = resolve(p, { domain: 'central_bank', archetype: 'central_bank' });
    expect(extractAllowedFigures(p)).toEqual([]);
    const prompt = buildSlideVisual(p, r).image_prompt;
    expect(prompt).toContain('the chart has NO numbers');
    expect(prompt).toContain('Allowed asset labels: only assets named verbatim in the story.');
  });

  it('las fechas no entran a la whitelist (día de "15 de agosto" ni años sueltos)', () => {
    const p = plan('El peso cierra en 17.95', 'Al 15 de agosto de 2025 acumula 3.2% en el año.');
    expect(extractAllowedFigures(p)).toEqual(['17.95', '3.2%']);
  });

  it('un nivel 19xx/20xx con unidad se conserva; un año en contexto de fecha se omite', () => {
    expect(extractAllowedFigures(plan('Oro toca 2045 dólares'))).toEqual(['2045']);
    expect(extractAllowedFigures(plan('S&P 500 en 2045 puntos'))).toEqual(['500', '2045']);
    expect(extractAllowedFigures(plan('El peso cierra en 17.95', 'Así cerró en octubre de 2026.'))).toEqual(['17.95']);
    expect(extractAllowedFigures(plan('Banxico recortará en 2026'))).toEqual([]);
  });

  it('IMPORTANT ya no prohíbe cifras; titular/fuente/fecha/slide/branding siguen fuera', () => {
    const r = resolve(PESO, { domain: 'fx', archetype: 'fx' });
    const prompt = buildSlideVisual(PESO, r).image_prompt;
    expect(prompt).not.toContain('numerical data, source');
    expect(prompt).toContain('The exact headline, source, date, slide number and branding');
  });
});

describe('coherencia y prompt del resolver', () => {
  it('(h) guardia cambia fx → energy: el sujeto ya no habla de divisas', () => {
    const p = plan('Brent arriba de 90');
    const r = resolve(p, {
      domain: 'fx',
      archetype: 'fx',
      visual_subject: 'currency trading screen with downward FX chart',
      supporting_elements: ['ticker tape glow'],
    });
    expect(r.archetype).toBe('energy');
    expect(r.visual_subject).not.toMatch(/currency|fx/i);
    expect(r.supporting_elements).not.toContain('ticker tape glow');
    const prompt = buildSlideVisual(p, r).image_prompt;
    expect(primarySubjectLine(prompt)).not.toMatch(/currency/i);
    expect(prompt).toContain('energy scene');
  });

  it('energy y central_bank ya no prohíben toda cifra: solo micro-label permitido', () => {
    const p = plan('Brent arriba de 90');
    const prompt = buildSlideVisual(p, resolve(p, { domain: 'energy', archetype: 'energy' })).image_prompt;
    expect(prompt).not.toContain('Do not generate text or logos.');
    expect(prompt).toContain('other than an allowed chart micro-label');
    const cb = plan('Banxico mantiene su postura');
    const cbPrompt = buildSlideVisual(cb, resolve(cb, { domain: 'central_bank', archetype: 'central_bank' }))
      .image_prompt;
    expect(cbPrompt).not.toContain('Do not generate text or the Xending logo.');
  });

  it('el prompt del resolver incluye la REGLA DE FX y el mecanismo appreciates', () => {
    const content = String(buildResolverMessages([PESO])[0].content);
    expect(content).toContain('REGLA DE FX');
    expect(content).toContain('appreciates');
  });
});
