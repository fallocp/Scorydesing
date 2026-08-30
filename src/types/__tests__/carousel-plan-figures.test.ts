/**
 * Guardas del motor de cifras que consume el Creative Plan.
 *
 * Lo que se protege es que el render cuente la historia que el plan decidió. El fallo que
 * motivó este archivo: en una ruta de margen —que prohíbe explícitamente apilar
 * documentos— el rol `risk` recibía tres compras sucesivas desde una tabla de la rama, así
 * que el slide salía impecable contando la historia de acumulación, que es otra ruta.
 *
 * Y la aritmética, que aquí ES el mensaje: la pieza muestra el tipo de cambio y el total
 * juntos, así que quien los multiplique tiene que llegar al mismo número. Una corrida real
 * publicó USD 8,750 junto a MXN 157,980, cotizando una tasa de 18.06 que nadie eligió.
 */

import { describe, it, expect } from 'vitest';

import {
  buildPlanFigureDocuments,
  DEFAULT_CAROUSEL_FX,
  DEFAULT_MARGIN_PCT,
  illustrativeAmountUsd,
  MAX_ILLUSTRATIVE_USD,
  MAX_MEGA_PROJECT_USD,
  MIN_ILLUSTRATIVE_USD,
  MIN_MARGIN_PCT,
  type CarouselFigureDocument,
} from '../design-studio';

/** El número que un lector leería en el documento. */
const num = (value: string): number => Number(value.replace(/,/g, ''));

const fieldValue = (doc: CarouselFigureDocument, label: string): number => {
  const field = doc.fields.find((f) => f.label === label);
  if (!field) throw new Error(`El documento "${doc.label}" no trae el campo ${label}`);
  return num(field.value);
};

// ---------------------------------------------------------------------------
// El monto de la operación
// ---------------------------------------------------------------------------

describe('illustrativeAmountUsd', () => {
  it('la misma historia da siempre la misma cifra', () => {
    /*
     * Determinismo, y no es un detalle: si el monto fuera aleatorio, regenerar los prompts
     * de un set ya renderizado cambiaría las cifras y dos slides del mismo carrusel
     * cotizarían operaciones distintas.
     */
    const args = { industryName: 'importadores de mobiliario', seed: 'El mobiliario tiene precio' };
    expect(illustrativeAmountUsd(args)).toBe(illustrativeAmountUsd(args));
  });

  it('dos copys de la misma industria no cotizan lo mismo', () => {
    // Si no, la industria sola decidiría y volveríamos a una cifra por rama.
    const a = illustrativeAmountUsd({ industryName: 'mobiliario', seed: 'Asegura tus costos' });
    const b = illustrativeAmountUsd({ industryName: 'mobiliario', seed: 'Primero cierra el costo' });
    expect(a).not.toBe(b);
  });

  it('respeta el orden de magnitud de la industria', () => {
    // Diez mil dólares es una compra creíble de mobiliario y una cifra absurda para una
    // línea de producción. Es el fallo que el 10,000 fijo producía en la mitad de los sets.
    const mobiliario = illustrativeAmountUsd({ industryName: 'mobiliario', seed: 'x' });
    const maquinaria = illustrativeAmountUsd({
      industryName: 'importadores de maquinaria industrial',
      seed: 'x',
    });

    expect(mobiliario).toBeLessThanOrEqual(45_000);
    expect(maquinaria).toBeGreaterThanOrEqual(55_000);
  });

  it('nunca sale del rango, y solo la obra pasa del techo general', () => {
    const seeds = ['a', 'bb', 'ccc', 'El dólar también', 'Define tu costo cambiario'];
    const industries = [
      null,
      'mobiliario',
      'textil',
      'electrónica',
      'alimentos',
      'autopartes',
      'maquinaria industrial',
      'una industria que no está en la tabla',
    ];

    for (const industryName of industries) {
      for (const seed of seeds) {
        const amount = illustrativeAmountUsd({ industryName, seed });
        expect(amount, `${industryName} / ${seed}`).toBeGreaterThanOrEqual(MIN_ILLUSTRATIVE_USD);
        expect(amount, `${industryName} / ${seed}`).toBeLessThanOrEqual(MAX_ILLUSTRATIVE_USD);
        // Una cotización real no termina en 37,412: esa precisión invita a buscarle una
        // fuente que no existe.
        expect(amount % 500, `${industryName} / ${seed}`).toBe(0);
      }
    }

    const megaProject = illustrativeAmountUsd({
      industryName: 'proyectos de infraestructura solar',
      seed: 'planta',
    });
    expect(megaProject).toBeGreaterThan(MAX_ILLUSTRATIVE_USD);
    expect(megaProject).toBeLessThanOrEqual(MAX_MEGA_PROJECT_USD);
  });

  it('sin industria cae en una banda general en vez de reventar', () => {
    const amount = illustrativeAmountUsd({});
    expect(amount).toBeGreaterThanOrEqual(MIN_ILLUSTRATIVE_USD);
    expect(amount).toBeLessThanOrEqual(MAX_ILLUSTRATIVE_USD);
  });
});

// ---------------------------------------------------------------------------
// La hoja de margen: el escenario que no existía
// ---------------------------------------------------------------------------

describe('margin_sensitivity', () => {
  const { documents } = buildPlanFigureDocuments('margin_sensitivity', DEFAULT_CAROUSEL_FX);

  it('son dos momentos de una hoja de margen', () => {
    expect(documents).toHaveLength(2);
    expect(documents.map((d) => d.label)).toEqual(['HOY', 'PAGO']);
    // El `kind` es lo que la ruta autoriza como evidencia: "hoja de margen por producto".
    expect(documents.every((d) => d.kind === 'HOJA DE MARGEN')).toBe(true);
  });

  it('el precio de venta es IDÉNTICO en los dos documentos', () => {
    /*
     * Es el argumento entero, no una simplificación. La historia existe porque el precio ya
     * se publicó y lo único que se mueve después es el costo. Un precio que también se
     * moviera contaría que el importador puede repreciar, que es la historia contraria.
     */
    const [hoy, pago] = documents;
    expect(fieldValue(hoy, 'PRECIO DE VENTA')).toBe(fieldValue(pago, 'PRECIO DE VENTA'));
  });

  it('el margen es exactamente precio menos costo', () => {
    // La cuenta que haría un lector con calculadora.
    for (const doc of documents) {
      const precio = fieldValue(doc, 'PRECIO DE VENTA');
      const costo = fieldValue(doc, 'COSTO IMPORTADO');
      expect(num(doc.total.value), doc.label).toBeCloseTo(precio - costo, 2);
    }
  });

  it('el margen cede cuando el costo se mueve, y por exactamente lo que se movió', () => {
    const [hoy, pago] = documents;
    const margenHoy = num(hoy.total.value);
    const margenPago = num(pago.total.value);

    expect(margenPago).toBeLessThan(margenHoy);
    // Como el precio no se mueve, lo que el margen pierde es lo que el costo ganó.
    const costoExtra = fieldValue(pago, 'COSTO IMPORTADO') - fieldValue(hoy, 'COSTO IMPORTADO');
    expect(margenHoy - margenPago).toBeCloseTo(costoExtra, 2);
  });

  it('reproduce el caso estándar', () => {
    // USD 10,000 · TC 17.20 → costo 172,000 · markup 35% → precio 232,200
    // TC expuesto 17.54 → costo 175,400; la utilidad bruta pasa de 60,200 a 56,800
    const [hoy, pago] = documents;
    expect(fieldValue(hoy, 'PRECIO DE VENTA')).toBe(232_200);
    expect(fieldValue(hoy, 'COSTO IMPORTADO')).toBe(172_000);
    expect(num(hoy.total.value)).toBe(60_200);
    expect(fieldValue(pago, 'COSTO IMPORTADO')).toBe(175_400);
    expect(num(pago.total.value)).toBe(56_800);
  });

  it('el color dice qué está bajo control y qué está expuesto', () => {
    const [hoy, pago] = documents;
    // El precio comprometido no es el beneficio ni el riesgo: navy, sin rol.
    expect(hoy.fields.find((f) => f.label === 'PRECIO DE VENTA')?.colorRole).toBeUndefined();
    expect(hoy.total.colorRole).toBe('control');
    expect(pago.total.colorRole).toBe('risk');
  });

  it('un margen absurdo no produce una hoja con margen negativo', () => {
    /*
     * Una hoja que muestra un margen negativo es una afirmación de pérdida, y las tres
     * ramas exigen el riesgo en condicional. El tope inferior no es cosmético.
     */
    for (const marginPct of [0, 1, -50, MIN_MARGIN_PCT - 1]) {
      const { documents: docs } = buildPlanFigureDocuments('margin_sensitivity', {
        ...DEFAULT_CAROUSEL_FX,
        marginPct,
      });
      for (const doc of docs) {
        expect(num(doc.total.value), `margen ${marginPct} en ${doc.label}`).toBeGreaterThan(0);
      }
    }
  });

  it('sin margen declarado usa el default en vez de romperse', () => {
    const { documents: docs } = buildPlanFigureDocuments('margin_sensitivity', {
      baseRate: 18.2,
      amountUsd: 10_000,
      driftPct: [2],
    });

    /*
     * El valor literal, y el redondeo a centavos es el motivo.
     *
     * `182000 * 1.35` da 245700.00000000003 en punto flotante. El motor redondea a
     * centavos antes de imprimir, así que la hoja dice 245,700.00 — que es lo correcto y
     * lo que hay que fijar aquí. Escribir la multiplicación en la expectativa hacía que
     * la prueba exigiera el error de punto flotante.
     */
    expect(DEFAULT_MARGIN_PCT).toBe(35);
    expect(fieldValue(docs[0], 'PRECIO DE VENTA')).toBe(245_700);
  });
});

// ---------------------------------------------------------------------------
// Comparación simultánea de cotizaciones
// ---------------------------------------------------------------------------

describe('quote_comparison', () => {
  const assumptions = {
    ...DEFAULT_CAROUSEL_FX,
    amountUsd: 19_000,
    baseRate: 17.2,
    comparisonRate: 17.54,
  };
  const { documents } = buildPlanFigureDocuments('quote_comparison', assumptions);

  it('usa dos tasas editadas sobre la misma operación', () => {
    expect(documents.map((doc) => doc.label)).toEqual(['XENDING', 'OTRA COTIZACIÓN']);
    expect(fieldValue(documents[0], 'TOTAL USD')).toBe(19_000);
    expect(fieldValue(documents[1], 'TOTAL USD')).toBe(19_000);
    expect(fieldValue(documents[0], 'TIPO DE CAMBIO')).toBe(17.2);
    expect(fieldValue(documents[1], 'TIPO DE CAMBIO')).toBe(17.54);
    expect(num(documents[0].total.value)).toBe(326_800);
    expect(num(documents[1].total.value)).toBe(333_260);
    expect(documents.every((doc) => doc.total.label === 'CONVERSIÓN MXN')).toBe(true);
    expect(documents[1].fields.find((field) => field.label === 'DIFERENCIA')?.value)
      .toBe('+MXN 6,460.00');
  });

  it('no introduce tiempo ni semántica de forward', () => {
    expect(documents.every((doc) => doc.date === undefined)).toBe(true);
    expect(documents.map((doc) => doc.label)).not.toContain('HOY');
    expect(documents.map((doc) => doc.label)).not.toContain('PAGO');
    expect(documents.every((doc) => doc.kind === 'COTIZACIÓN')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// El escenario hipotético
// ---------------------------------------------------------------------------

describe('rate_range', () => {
  const { documents } = buildPlanFigureDocuments('rate_range', DEFAULT_CAROUSEL_FX);

  it('NO lleva fechas, porque una fecha convierte la hipótesis en pronóstico', () => {
    /*
     * La guarda que más importa de este escenario. "Si el tipo de cambio pasara de A a B"
     * es la única forma en que una rama puede explicar su mecanismo con un nivel que
     * todavía no existe; poner "27 OCT 2026" junto a ese nivel lo afirma, y afirmar hacia
     * dónde va el tipo de cambio está prohibido en las tres ramas.
     */
    for (const doc of documents) {
      expect(doc.date, doc.label).toBeUndefined();
    }
  });

  it('se anuncia como escenario y no como cotización', () => {
    // Una cotización se lee como un hecho. El sello y el tipo de documento son lo que
    // marcan que esto es una hipótesis.
    expect(documents.map((d) => d.label)).toEqual(['ACTUAL', 'SI PASARA A']);
    expect(documents.every((d) => d.kind === 'ESCENARIO')).toBe(true);
  });

  it('el monto en USD es el mismo: lo que se mueve es la tasa', () => {
    const [actual, hipotetico] = documents;
    expect(fieldValue(actual, 'TOTAL USD')).toBe(fieldValue(hipotetico, 'TOTAL USD'));
    expect(fieldValue(hipotetico, 'TIPO DE CAMBIO')).toBeGreaterThan(
      fieldValue(actual, 'TIPO DE CAMBIO'),
    );
  });
});

// ---------------------------------------------------------------------------
// La certidumbre: un solo valor
// ---------------------------------------------------------------------------

describe('cashflow_certainty', () => {
  const { documents } = buildPlanFigureDocuments('cashflow_certainty', DEFAULT_CAROUSEL_FX);

  it('es UN documento, y ahí está su significado', () => {
    /*
     * Los otros escenarios enfrentan dos estados porque su historia es el movimiento. Esta
     * historia es que no hay movimiento, así que una segunda tarjeta la contradiría: habría
     * dos valores que comparar donde el argumento es que solo hay uno.
     */
    expect(documents).toHaveLength(1);
    expect(documents[0].label).toBe('COSTO DEFINIDO');
  });

  it('no lleva un solo acento de riesgo', () => {
    // No hay exposición que señalar, así que ningún coral.
    const [doc] = documents;
    expect(doc.fields.every((f) => f.colorRole !== 'risk')).toBe(true);
    expect(doc.total.colorRole).not.toBe('risk');
  });

  it('USD x TC da el total que muestra', () => {
    const [doc] = documents;
    const usd = fieldValue(doc, 'TOTAL USD');
    const rate = fieldValue(doc, 'TIPO DE CAMBIO');
    expect(num(doc.total.value)).toBeCloseTo(usd * rate, 2);
  });
});

// ---------------------------------------------------------------------------
// Los tres que ya existían, ahora bajo el nombre del plan
// ---------------------------------------------------------------------------

describe('los escenarios que reusan la mecánica existente', () => {
  it('rate_comparison son los dos momentos, HOY contra PAGO', () => {
    const { documents, accumulatedLabel } = buildPlanFigureDocuments(
      'rate_comparison',
      DEFAULT_CAROUSEL_FX,
    );
    expect(documents.map((d) => d.label)).toEqual(['HOY', 'PAGO']);
    // El acumulado es de la historia que trata de sumar diferencias, no de esta.
    expect(accumulatedLabel).toBeUndefined();
  });

  it('repeated_operations son tres compras SIN sumarlas', () => {
    const { documents, accumulatedLabel } = buildPlanFigureDocuments(
      'repeated_operations',
      DEFAULT_CAROUSEL_FX,
    );
    expect(documents.map((d) => d.label)).toEqual(['COMPRA 1', 'COMPRA 2', 'COMPRA 3']);
    expect(accumulatedLabel).toBeUndefined();
  });

  it('accumulated_difference son las mismas tres, y su suma', () => {
    const { documents, accumulatedLabel } = buildPlanFigureDocuments(
      'accumulated_difference',
      DEFAULT_CAROUSEL_FX,
    );
    expect(documents).toHaveLength(3);
    // 1,700 + 3,400 de diferencia contra el momento base.
    expect(accumulatedLabel).toBe('+MXN 5,100.00');
  });

  it('el monto en USD es idéntico en todos los documentos de un escenario', () => {
    /*
     * Lo que se mueve es el tipo de cambio, no el tamaño de la compra. Una corrida devolvió
     * tres compras de 4,850 / 7,230 / 12,940 USD, que dicen "compraste motores más grandes"
     * y no "el impacto cambiario se acumula".
     */
    for (const scenario of ['rate_comparison', 'repeated_operations', 'accumulated_difference'] as const) {
      const { documents } = buildPlanFigureDocuments(scenario, DEFAULT_CAROUSEL_FX);
      const amounts = new Set(documents.map((d) => fieldValue(d, 'TOTAL USD')));
      expect(amounts.size, scenario).toBe(1);
    }
  });
});

// ---------------------------------------------------------------------------
// Cuándo NO hay documentos
// ---------------------------------------------------------------------------

describe('sin documentos', () => {
  it('"none" no produce ninguno', () => {
    // No es la ausencia de una decisión: la mayoría de las historias se cuentan mejor con
    // objetos, fechas y estados.
    expect(buildPlanFigureDocuments('none', DEFAULT_CAROUSEL_FX).documents).toEqual([]);
  });

  it('un escenario sin constructor no inventa uno parecido', () => {
    /*
     * Es la regla que evita repetir el fallo de origen. Un slide con los documentos de otra
     * historia se ve perfectamente bien y cuenta algo que nadie decidió; uno sin cifras se
     * nota y se corrige.
     */
    const unknown = 'escenario_que_no_existe' as Parameters<typeof buildPlanFigureDocuments>[0];
    expect(buildPlanFigureDocuments(unknown, DEFAULT_CAROUSEL_FX).documents).toEqual([]);
  });

  it('sin momentos calculables no revienta', () => {
    const { documents } = buildPlanFigureDocuments('margin_sensitivity', {
      baseRate: 0,
      amountUsd: 0,
      driftPct: [],
    });
    // Un solo momento, todo en cero: no hay comparación que mostrar pero tampoco un crash.
    expect(Array.isArray(documents)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// La aritmética, en todos los escenarios a la vez
// ---------------------------------------------------------------------------

describe('coherencia aritmética', () => {
  it('en todo documento con tasa y total, USD x TC da el total', () => {
    const scenarios = [
      'quote_comparison',
      'rate_comparison',
      'rate_range',
      'repeated_operations',
      'accumulated_difference',
      'cashflow_certainty',
    ] as const;

    for (const scenario of scenarios) {
      const { documents } = buildPlanFigureDocuments(scenario, {
        ...DEFAULT_CAROUSEL_FX,
        amountUsd: 37_500,
        baseRate: 17.93,
      });

      for (const doc of documents) {
        const usd = doc.fields.find((f) => f.label === 'TOTAL USD');
        const rate = doc.fields.find((f) => f.label === 'TIPO DE CAMBIO');
        if (!usd || !rate) continue;

        const cost =
          doc.fields.find((f) => f.label === 'COSTO MXN') ??
          (['COSTO MXN', 'CONVERSIÓN MXN'].includes(doc.total.label) ? doc.total : null);
        if (!cost) continue;

        expect(num(cost.value), `${scenario} / ${doc.label}`).toBeCloseTo(
          num(usd.value) * num(rate.value),
          2,
        );
      }
    }
  });

  it('el tipo de cambio mostrado nunca tiene más de dos decimales', () => {
    // Con más decimales, la multiplicación a mano no cuadra con el total impreso.
    for (const scenario of ['quote_comparison', 'rate_comparison', 'rate_range', 'cashflow_certainty'] as const) {
      const { documents } = buildPlanFigureDocuments(scenario, DEFAULT_CAROUSEL_FX);
      for (const doc of documents) {
        const rate = doc.fields.find((f) => f.label === 'TIPO DE CAMBIO');
        if (!rate) continue;
        expect(rate.value, `${scenario} / ${doc.label}`).toMatch(/^\d+\.\d{2}$/);
      }
    }
  });
});
