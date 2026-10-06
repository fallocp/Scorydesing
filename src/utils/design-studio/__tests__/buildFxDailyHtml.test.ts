/**
 * Etiquetas fijas del HTML del Daily Report FX según `report.locale`.
 */
import { describe, it, expect } from 'vitest';
import { buildFxDailyHtml } from '../buildFxDailyHtml';
import type { FxDailyReport } from '../../../../supabase/functions/_shared/fx-daily/fx-daily-types';

const ES_LABELS = [
  'PULSO DE MERCADO',
  'APERTURA',
  'RANGO DEL DÍA',
  'TENDENCIA',
  'LO QUE MUEVE AL MERCADO',
  'LECTURA CLAVE',
  'alt="Lectura clave"',
  'ESCENARIOS',
  'EN LA MIRA',
  'Nota: ',
];
const EN_LABELS = [
  'MARKET PULSE',
  '>OPEN<',
  'DAY RANGE',
  '>TREND<',
  'MARKET DRIVERS',
  'KEY TAKEAWAY',
  'alt="Key takeaway"',
  'SCENARIOS',
  'WATCHLIST',
  'Note: ',
];

function report(over: Partial<FxDailyReport> = {}): FxDailyReport {
  return {
    date: '25 AGO 2026',
    pair: 'USD/MXN',
    headline: 'Titular',
    commentary: ['Comentario'],
    pulso: { apertura: '18.42', variacion: '+0.6%', variacion_dir: 'up', rango_dia: '18.30 - 18.45', tendencia: 'Lateral', tendencia_dir: 'lateral' },
    drivers: [{ title: 'MÉXICO', bullets: ['x'] }],
    lectura_clave: 'Lectura',
    escenario_central: '18.35 - 18.48',
    escenarios: [{ pct: 52, label: 'Lateral', direction: 'lateral', rango: '18.35 - 18.48' }],
    en_la_mira: [{ label: 'NFP', category: 'data' }],
    nota: 'Disclaimer',
    ...over,
  };
}

const kit = {
  magnifier: 'https://kit.test/magnifier.png',
  flag_mx: 'https://kit.test/flag_mx.png',
  flag_us: 'https://kit.test/flag_us.png',
  entorno_globe: 'https://kit.test/globe.png',
};

describe('buildFxDailyHtml locale labels', () => {
  it('sin locale usa las etiquetas en español', () => {
    const html = buildFxDailyHtml({ report: report(), heroImageUrl: 'https://hero.test/h.png', kit });
    expect(html).toContain('<html lang="es">');
    for (const l of ES_LABELS) expect(html).toContain(l);
  });

  it("locale 'en' usa etiquetas en inglés y ninguna sección en español", () => {
    const html = buildFxDailyHtml({ report: report({ locale: 'en', nota: 'Disclaimer EN' }), heroImageUrl: 'https://hero.test/h.png', kit });
    expect(html).toContain('<html lang="en">');
    for (const l of EN_LABELS) expect(html).toContain(l);
    for (const l of ['PULSO DE MERCADO', 'APERTURA', 'RANGO DEL DÍA', 'LO QUE MUEVE AL MERCADO', 'LECTURA CLAVE', 'EN LA MIRA', 'Nota: ']) {
      expect(html).not.toContain(l);
    }
  });

  it('los títulos EN de drivers enrutan a bandera MX / US / globo', () => {
    const html = buildFxDailyHtml({
      report: report({
        locale: 'en',
        drivers: [
          { title: 'MEXICO', bullets: ['a'] },
          { title: 'U.S.', bullets: ['b'] },
          { title: 'GLOBAL BACKDROP', bullets: ['c'] },
        ],
      }),
      heroImageUrl: 'https://hero.test/h.png',
      kit,
    });
    const mx = html.indexOf(kit.flag_mx);
    const us = html.indexOf(kit.flag_us);
    const globe = html.indexOf(kit.entorno_globe);
    expect(mx).toBeGreaterThan(-1);
    expect(us).toBeGreaterThan(mx);
    expect(globe).toBeGreaterThan(us);
  });
});
