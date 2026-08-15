/**
 * Tests de las cifras ilustrativas del carrusel.
 *
 * Lo que se protege aquí es la coherencia aritmética: la pieza muestra el tipo de
 * cambio y el total juntos, así que quien los multiplique tiene que llegar al
 * mismo número. Dos piezas reales fallaron por esto — una mostraba USD 8,750 con
 * MXN 157,980, que implica una tasa de 18.06 que nadie eligió.
 */
import { describe, it, expect } from 'vitest';

import {
  accumulatedFxImpact,
  buildFigureDocuments,
  computeCarouselFx,
  DEFAULT_CAROUSEL_FX,
  type CarouselFxAssumptions,
} from '../design-studio';

describe('computeCarouselFx', () => {
  it('el primer momento usa el tipo de cambio tal cual', () => {
    const [hoy] = computeCarouselFx({ baseRate: 17.3, amountUsd: 10000, driftPct: [] });
    expect(hoy.rate).toBe(17.3);
    expect(hoy.amountMxn).toBe(173000);
    expect(hoy.deltaMxn).toBe(0);
  });

  it('USD x TC da exactamente el MXN que se muestra, en todos los momentos', () => {
    const moments = computeCarouselFx(DEFAULT_CAROUSEL_FX);

    for (const m of moments) {
      // La prueba que haría un lector con calculadora.
      expect(m.amountMxn).toBeCloseTo(m.rate * m.amountUsd, 2);
      // Y el tipo de cambio mostrado no puede tener más de dos decimales, o la
      // multiplicación a mano no cuadra.
      expect(Math.round(m.rate * 100) / 100).toBe(m.rate);
    }
  });

  it('reproduce el caso estándar del regression test', () => {
    // USD 10,000 · TC hoy 18.20 · TC pago 18.56 · 182,000 → 185,600 · +3,600
    const moments = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    const hoy = moments[0];
    const pago = moments[moments.length - 1];

    expect(hoy.rate).toBe(18.2);
    expect(hoy.amountMxn).toBe(182000);
    expect(pago.rate).toBe(18.56);
    expect(pago.amountMxn).toBe(185600);
    expect(pago.deltaMxn).toBe(3600);
    expect(pago.labels.pct).toBe('+2.0%');
  });

  it('la deriva se mide contra la base, no contra el momento anterior', () => {
    const [, segunda, tercera] = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    // 18.20 +1% = 18.382 → 18.38, no 18.20 → 18.38 → 18.56 compuesto.
    expect(segunda.rate).toBe(18.38);
    expect(segunda.amountMxn).toBe(183800);
    expect(segunda.labels.pct).toBe('+1.0%');
    // Y el tercero es +2% de la base exacto: 18.564 → 18.56. Con compounding
    // habría dado 18.93 mientras la etiqueta seguía diciendo +2%.
    expect(tercera.rate).toBe(18.56);
    expect(tercera.labels.pct).toBe('+2.0%');
  });

  it('el delta se mide contra el primer momento', () => {
    const [hoy, segunda, tercera] = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    expect(hoy.deltaMxn).toBe(0);
    expect(segunda.deltaMxn).toBe(1800);
    expect(tercera.deltaMxn).toBe(3600);
  });

  it('el impacto acumulado suma las diferencias de todos los momentos', () => {
    const moments = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    const acc = accumulatedFxImpact(moments);
    // 0 + 1,800 + 3,600: lo que costó de más hacer las tres compras a tasas
    // distintas en lugar de todas a la tasa base.
    expect(acc.amount).toBe(5400);
    expect(acc.label).toBe('+MXN 5,400.00');
  });

  it('el monto en USD es el mismo en todos los momentos', () => {
    // Es el punto de la pieza de acumulación: lo que cambia es la tasa, no el
    // tamaño de la compra. Montos crecientes contarían otra historia.
    const moments = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    expect(new Set(moments.map((m) => m.amountUsd)).size).toBe(1);
  });

  it('formatea con separador de miles y dos decimales', () => {
    const [hoy] = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    expect(hoy.labels.usd).toBe('USD 10,000.00');
    expect(hoy.labels.mxn).toBe('MXN 182,000.00');
    expect(hoy.labels.rate).toBe('18.20');
    expect(hoy.labels.delta).toBe('');
    expect(hoy.labels.pct).toBe('');
  });

  it('el delta formateado lleva signo', () => {
    const [, segunda] = computeCarouselFx(DEFAULT_CAROUSEL_FX);
    expect(segunda.labels.delta).toBe('+MXN 1,800.00');
  });

  it('sin deriva devuelve un solo momento', () => {
    const only: CarouselFxAssumptions = { baseRate: 18, amountUsd: 5000, driftPct: [] };
    expect(computeCarouselFx(only)).toHaveLength(1);
  });

  it('redondea un tipo de cambio con más de dos decimales antes de multiplicar', () => {
    const [m] = computeCarouselFx({ baseRate: 17.333, amountUsd: 10000, driftPct: [] });
    expect(m.rate).toBe(17.33);
    expect(m.amountMxn).toBe(173300);
  });
});

describe('buildFigureDocuments', () => {
  const moments = computeCarouselFx(DEFAULT_CAROUSEL_FX);

  it('la comparación de dos momentos usa el primero y el último', () => {
    // HOY 18.20 vs PAGO 18.56. Tomar el momento intermedio mostraría +1% en una
    // pieza que afirma lo que cuesta el movimiento completo al día de pago.
    const [hoy, pago] = buildFigureDocuments('two_moment', moments);

    expect(hoy.label).toBe('HOY');
    expect(hoy.fields.find((f) => f.label === 'TIPO DE CAMBIO')?.value).toBe('18.20');
    expect(pago.label).toBe('PAGO');
    expect(pago.fields.find((f) => f.label === 'TIPO DE CAMBIO')?.value).toBe('18.56');
    expect(pago.total.value).toBe('185,600.00');
  });

  it('las compras repetidas recorren los tres momentos en orden', () => {
    const docs = buildFigureDocuments('repeated_purchases', moments);
    expect(docs.map((d) => d.label)).toEqual(['COMPRA 1', 'COMPRA 2', 'COMPRA 3']);
    expect(docs.map((d) => d.fields.find((f) => f.label === 'TIPO DE CAMBIO')?.value))
      .toEqual(['18.20', '18.38', '18.56']);
  });

  it('el monto en USD se repite idéntico en cada documento', () => {
    // Es lo que hace legible la comparación: cambia la tasa, no la compra.
    const docs = buildFigureDocuments('repeated_purchases', moments);
    const usd = docs.map((d) => d.fields.find((f) => f.label === 'TOTAL USD')?.value);
    expect(new Set(usd)).toEqual(new Set(['10,000.00']));
  });

  it('el primer documento no lleva línea de variación', () => {
    const [hoy, pago] = buildFigureDocuments('two_moment', moments);
    expect(hoy.fields.some((f) => f.label === 'VARIACIÓN')).toBe(false);
    expect(pago.fields.find((f) => f.label === 'VARIACIÓN')?.value).toBe('+2.0%');
  });

  it('sin deriva devuelve un solo documento, no el mismo dos veces', () => {
    const single = computeCarouselFx({ baseRate: 18.2, amountUsd: 10000, driftPct: [] });
    expect(buildFigureDocuments('two_moment', single)).toHaveLength(1);
  });
});
