/**
 * Orquestador EN con un caller LLM falso: cuenta de llamadas, reparación,
 * 422 tras reparación fallida y errores de llamada/parseo.
 */
import { describe, it, expect, vi } from 'vitest';
import { runFxEnglishPipeline, type FxLlmCaller } from '../fxDailyEnglishPipeline';
import { extractApprovedHeadline } from '../fxDailyExtractor';

const MD = `# Análisis USD/MXN 25 de agosto de 2026 (El peso cede ante datos de EE.UU.)
## Apertura y contexto
El tipo de cambio abre en 18.42, sube 0.6%, rango 18.30 - 18.45. NFP 150k vs 120k. Banxico recortó 25 pb.
## Escenarios
Lateral 52% (18.35 - 18.48), Alcista 28% (18.50 - 18.60), Bajista 20% (18.20 - 18.30).`;

const FACTS = {
  date_iso: '2026-08-25',
  pulso: { apertura: '18.42', variacion: '+0.6%', variacion_dir: 'up', rango_dia: '18.30 - 18.45', tendencia_dir: 'down' },
  escenario_central: '18.35 - 18.48',
  escenarios: [
    { pct: 52, direction: 'lateral', rango: '18.35 - 18.48' },
    { pct: 28, direction: 'up', rango: '18.50 - 18.60' },
    { pct: 20, direction: 'down', rango: '18.20 - 18.30' },
  ],
  en_la_mira: [{ label: 'NFP', category: 'data' }],
};

function report(over: Record<string, unknown> = {}) {
  return {
    date: 'Aug 25, 2026',
    pair: 'USD/MXN',
    headline: 'Peso weakens as strong NFP lifts USD/MXN',
    headline_alternative: 'USD/MXN rises 0.6% after U.S. jobs data',
    commentary: ['USD/MXN rose 0.6% to 18.42 at the open. The Mexican peso weakened after NFP printed 150k vs 120k.'],
    pulso: { apertura: '18.42', variacion: '+0.6%', variacion_dir: 'up', rango_dia: '18.30 - 18.45', tendencia: 'Peso-negative', tendencia_dir: 'down' },
    drivers: [
      { title: 'U.S.', bullets: ['NFP 150k vs 120k'] },
      { title: 'MEXICO', bullets: ['Banxico cut 25 bp'] },
    ],
    lectura_clave: 'Importers with USD payables may watch resistance at 18.45.',
    escenario_central: '18.35 - 18.48',
    escenarios: [],
    en_la_mira: [{ label: 'NFP', category: 'data' }],
    ...over,
  };
}

const ok = (payload: unknown) => ({ success: true as const, content: JSON.stringify(payload) });

function fake(...responses: ReturnType<FxLlmCaller> extends Promise<infer R> ? R[] : never) {
  const call = vi.fn<FxLlmCaller>();
  for (const r of responses) call.mockResolvedValueOnce(r);
  return call;
}

describe('runFxEnglishPipeline', () => {
  it('respuesta limpia: 1 llamada, locale en, opciones aprobado + alternativa', async () => {
    const call = fake(ok({ facts: FACTS, report: report() }));
    const r = await runFxEnglishPipeline(MD, 'El peso cede ante datos de EE.UU.', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.repaired).toBe(false);
    expect(r.report.locale).toBe('en');
    expect(r.report.date).toBe('Aug 25, 2026');
    expect(r.report.escenarios.map((e) => e.label)).toEqual(['Range-bound', 'USD/MXN higher', 'USD/MXN lower']);
    expect(r.report.headline).toBe('Peso Weakens as Strong NFP Lifts USD/MXN');
    expect(r.headline_options).toEqual([
      { value: 'Peso Weakens as Strong NFP Lifts USD/MXN', source: 'approved' },
      { value: 'USD/MXN Rises 0.6% After U.S. Jobs Data', source: 'alternative' },
    ]);
    const opts = call.mock.calls[0][0];
    expect(opts).toMatchObject({ max_completion_tokens: 4000, temperature: 0.3, timeoutMs: 90_000 });
  });

  it('solo calcos auto-corregibles: 1 llamada', async () => {
    const call = fake(ok({ facts: FACTS, report: report({ lectura_clave: 'The Bank of Mexico cut 25 pb; dollar-peso eyes 18,45.' }) }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.ok && r.report.lectura_clave).toBe('Banxico cut 25 bp; USD/MXN eyes 18.45.');
  });

  it('calco no corregible: repara con hint, sin MD, y queda repaired', async () => {
    const call = fake(
      ok({ facts: FACTS, report: report({ lectura_clave: 'USD/MXN found a floor at 18.30.' }) }),
      ok({ report: report({ lectura_clave: 'USD/MXN found support at 18.30.' }) }),
    );
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    const repairMsgs = call.mock.calls[1][0];
    const text = repairMsgs.messages.map((m) => m.content as string).join('\n');
    expect(text).toContain('support/resistance');
    expect(text).not.toContain('El tipo de cambio abre en 18.42');
    expect(repairMsgs).toMatchObject({ max_completion_tokens: 2000, temperature: 0.2, timeoutMs: 45_000 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.repaired).toBe(true);
      expect(r.report.lectura_clave).toBe('USD/MXN found support at 18.30.');
      expect(r.report.locale).toBe('en');
    }
  });

  it('ambas respuestas malas: 422 en_validation_failed tras exactamente 2 llamadas', async () => {
    const bad = report({ lectura_clave: 'Remittances may find a floor.' });
    const call = fake(ok({ facts: FACTS, report: bad }), ok(bad));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('en_validation_failed');
    expect(r.body.message).toMatch(/^La versión en inglés no pasó la validación: /);
    expect(r.body.violations?.length).toBeGreaterThan(0);
  });

  it('violación solo en campo fijado por facts: 422 tras 1 llamada (sin reparación inútil)', async () => {
    const call = fake(ok({ facts: { ...FACTS, escenario_central: '18.99 - 19.10' }, report: report() }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.status).toBe(422);
    expect(r.body.error).toBe('en_validation_failed');
    expect(r.body.violations?.every((v) => v.field === 'escenario_central')).toBe(true);
  });

  it('signo de variación contradice la dirección en facts: 422 tras 1 llamada', async () => {
    const call = fake(ok({ facts: { ...FACTS, pulso: { ...FACTS.pulso, variacion: '-0.6%' } }, report: report() }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(!r.ok && r.body.violations).toEqual([expect.objectContaining({ field: 'pulso.variacion', rule: 'direction' })]);
  });

  it('prosa + campo fijado por facts: 422 tras 1 llamada', async () => {
    const call = fake(
      ok({ facts: { ...FACTS, escenario_central: '18.99 - 19.10' }, report: report({ lectura_clave: 'A rollercoaster session.' }) }),
    );
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(!r.ok && r.status).toBe(422);
  });

  it('campo estructurado sin valor en facts sí se repara (lo redacta el LLM)', async () => {
    const call = fake(
      ok({ facts: { ...FACTS, escenario_central: '' }, report: report({ escenario_central: '18.99 - 19.10' }) }),
      ok({ report: report() }),
    );
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(r.ok && r.report.escenario_central).toBe('18.35 - 18.48');
  });

  it('cifra inventada dispara la reparación', async () => {
    const call = fake(
      ok({ facts: FACTS, report: report({ commentary: ['Inflation hit 4.1%, pushing USD/MXN to 18.42.'] }) }),
      ok(report()),
    );
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(call.mock.calls[1][0].messages)).toContain('4.1');
    expect(r.ok).toBe(true);
  });

  it('fallo de la llamada de reparación → 422 con las violaciones del primer pase', async () => {
    const call = fake(
      ok({ facts: FACTS, report: report({ lectura_clave: 'A rollercoaster session.' }) }),
      { success: false, error: 'network_error', message: 'x' },
    );
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(422);
      expect(r.body.violations?.[0].field).toBe('lectura_clave');
    }
  });

  it('fallo de la primera llamada → 502', async () => {
    const call = fake({ success: false, error: 'rate_limit', message: 'Demasiadas solicitudes.' });
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(r).toEqual({
      ok: false,
      status: 502,
      body: { error: 'rate_limit', message: 'No se pudo procesar el análisis: Demasiadas solicitudes.' },
    });
  });

  it('respuesta no parseable → 502 model_output', async () => {
    const call = fake({ success: true, content: 'not json at all' });
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(502);
      expect(r.body.error).toBe('model_output');
    }
  });

  it('headline vacío → 422 empty_report', async () => {
    const call = fake(ok({ facts: FACTS, report: report({ headline: '' }) }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(!r.ok && r.body.error).toBe('empty_report');
  });

  it('sin titular aprobado: 2 opciones alternative distintas, 1 llamada', async () => {
    const call = fake(ok({ facts: FACTS, report: report() }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.ok && r.headline_options).toEqual([
      { value: 'Peso Weakens as Strong NFP Lifts USD/MXN', source: 'alternative' },
      { value: 'USD/MXN Rises 0.6% After U.S. Jobs Data', source: 'alternative' },
    ]);
  });
});

describe('runFxEnglishPipeline — siempre 2 headlines distintos', () => {
  const distinct = (r: Awaited<ReturnType<typeof runFxEnglishPipeline>>) => {
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.headline_options).toHaveLength(2);
    expect(r.headline_options[0].value.toLowerCase()).not.toBe(r.headline_options[1].value.toLowerCase());
    expect(r.headline_options[1].value).not.toBe('');
  };

  it('alternativa idéntica al headline → repara (2 llamadas) con hint "repeats headline"', async () => {
    const same = report({ headline_alternative: 'Peso weakens as strong NFP lifts USD/MXN' });
    const call = fake(ok({ facts: FACTS, report: same }), ok({ report: report() }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(call.mock.calls[1][0].messages)).toContain('repeats headline');
    distinct(r);
    expect(r.ok && r.repaired).toBe(true);
  });

  it('alternativa vacía dos veces → alternativa determinística (no 422)', async () => {
    const empty = report({ headline_alternative: '' });
    const call = fake(ok({ facts: FACTS, report: empty }), ok({ report: empty }));
    const r = await runFxEnglishPipeline(MD, 'El peso cede ante datos de EE.UU.', call);
    expect(call).toHaveBeenCalledTimes(2);
    distinct(r);
    expect(r.ok && r.headline_options[1]).toEqual({ value: 'Mexican Peso Weakens, with NFP in Focus', source: 'alternative' });
  });

  it('alternativa vacía y falla la reparación → alternativa determinística', async () => {
    const call = fake(ok({ facts: FACTS, report: report({ headline_alternative: '' }) }), {
      success: false,
      error: 'network_error',
      message: 'x',
    });
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    distinct(r);
    expect(r.ok && r.repaired).toBe(false);
    expect(r.ok && r.headline_options[1].value).toBe('Mexican Peso Weakens, with NFP in Focus');
  });

  it('alternativa contradice la dirección dos veces → alternativa determinística', async () => {
    const bad = report({ headline_alternative: 'Mexican Peso Gains on Risk Appetite' });
    const call = fake(ok({ facts: FACTS, report: bad }), ok({ report: bad }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    distinct(r);
    expect(r.ok && r.headline_options[1].value).toBe('Mexican Peso Weakens, with NFP in Focus');
  });

  it('otra violación de prosa + alternativa mala tras la reparación → 422', async () => {
    const bad = report({ headline_alternative: '', lectura_clave: 'A rollercoaster session.' });
    const call = fake(ok({ facts: FACTS, report: bad }), ok({ report: bad }));
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    expect(!r.ok && r.status).toBe(422);
  });

  it('solo falla la alternativa y la reparación mete un calco en otro campo → primer pase + alternativa determinística', async () => {
    const call = fake(
      ok({ facts: FACTS, report: report({ headline_alternative: '' }) }),
      ok({ report: report({ headline_alternative: 'Mexican Peso Slips After Strong U.S. Jobs Data', lectura_clave: 'A rollercoaster session.' }) }),
    );
    const r = await runFxEnglishPipeline(MD, '', call);
    expect(call).toHaveBeenCalledTimes(2);
    distinct(r);
    expect(r.ok && r.repaired).toBe(false);
    expect(r.ok && r.report.lectura_clave).not.toContain('rollercoaster');
    expect(r.ok && r.headline_options[1]).toEqual({ value: 'Mexican Peso Weakens, with NFP in Focus', source: 'alternative' });
  });

  it('titular aprobado con doble paréntesis llega al prompt y queda como opción approved', async () => {
    const md = '# ANALISIS SEMANAL USD/MXN 5 OCT 26 ((Peso firme, foco en minutas Fed))\nEl peso gana; USD/MXN en 18.12.';
    const approved = extractApprovedHeadline(md);
    const facts = { ...FACTS, pulso: { ...FACTS.pulso, apertura: '18.12', variacion: '', variacion_dir: 'down', rango_dia: '' }, escenario_central: '', escenarios: [], en_la_mira: [{ label: 'Fed minutes', category: 'central_bank' }] };
    const rep = report({
      headline: 'Mexican Peso Firms, with Fed Minutes in Focus',
      headline_alternative: 'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus',
      commentary: ['The Mexican peso firmed, with USD/MXN at 18.12.'],
      pulso: { apertura: '18.12', variacion: '', variacion_dir: 'down', rango_dia: '', tendencia: '', tendencia_dir: 'down' },
      drivers: [{ title: 'GLOBAL', bullets: ['Brazilian real rally lifted Latin American risk appetite'] }],
      lectura_clave: 'Importers may watch Fed minutes.',
      escenario_central: '',
      en_la_mira: [{ label: 'Fed minutes', category: 'central_bank' }],
    });
    const call = fake(ok({ facts, report: rep }));
    const r = await runFxEnglishPipeline(md, approved, call);
    const system = call.mock.calls[0][0].messages[0].content as string;
    expect(system).toContain('Peso firme, foco en minutas Fed');
    expect(system).toContain('Keep every element');
    expect(call).toHaveBeenCalledTimes(1);
    expect(r.ok && r.headline_options).toEqual([
      { value: 'Mexican Peso Firms, with Fed Minutes in Focus', source: 'approved' },
      { value: 'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus', source: 'alternative' },
    ]);
  });
});
