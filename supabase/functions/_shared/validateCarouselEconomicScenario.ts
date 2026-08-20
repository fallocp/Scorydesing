import {
  CAROUSEL_MAX_FX_RATE,
  CAROUSEL_MAX_OPERATION_USD,
  CAROUSEL_MIN_FX_RATE,
  CAROUSEL_MIN_OPERATION_USD,
  CAROUSEL_ECONOMIC_FACT_SHAPES,
  CAROUSEL_SCENARIO_FACT_KEYS,
  type CarouselEconomicFactKey,
  type CarouselEconomicScenario,
  type CarouselFigureScenarioId,
} from './carousel-plan-types.ts';

type ExpectedScenarioId = Exclude<CarouselFigureScenarioId, 'none'>;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveFinite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function approximatelyEqual(actual: number, expected: number, tolerance: number): boolean {
  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Valida el escenario antes de interpolarlo en el prompt del guionista.
 *
 * El caller calcula las cifras, pero la Edge Function sigue siendo la frontera de
 * confianza: un payload malformado no puede convertirse en contexto autorizado para el
 * modelo. Las keys deben coincidir exactamente con el escenario y quote_comparison debe
 * conservar la aritmética de una sola operación bajo dos tasas simultáneas.
 */
export function validateCarouselEconomicScenario(
  value: unknown,
  expectedScenarioId: ExpectedScenarioId,
): string | null {
  if (!isRecord(value)) return 'El escenario económico debe ser un objeto.';
  if (value.version !== 1) return 'La versión del escenario económico no es compatible.';
  if (value.scenarioId !== expectedScenarioId) {
    return 'El escenario económico no coincide con el escenario único del plan.';
  }
  if (value.qualifier !== 'ESCENARIO ILUSTRATIVO') {
    return 'El escenario económico debe conservar el qualifier ilustrativo.';
  }
  if (typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))) {
    return 'El escenario económico no tiene una fecha válida.';
  }

  if (!isRecord(value.assumptions)) return 'Las asunciones económicas no son válidas.';
  const assumptions = value.assumptions;
  if (
    !isPositiveFinite(assumptions.baseRate) ||
    assumptions.baseRate < CAROUSEL_MIN_FX_RATE ||
    assumptions.baseRate > CAROUSEL_MAX_FX_RATE
  ) {
    return `El tipo de cambio base debe estar entre ${CAROUSEL_MIN_FX_RATE} y ${CAROUSEL_MAX_FX_RATE}.`;
  }
  if (
    !isPositiveFinite(assumptions.amountUsd) ||
    assumptions.amountUsd < CAROUSEL_MIN_OPERATION_USD ||
    assumptions.amountUsd > CAROUSEL_MAX_OPERATION_USD
  ) {
    return `El monto USD debe estar entre ${CAROUSEL_MIN_OPERATION_USD} y ${CAROUSEL_MAX_OPERATION_USD}.`;
  }
  if (!isPositiveFinite(assumptions.markupPct)) {
    return 'El markup debe ser finito y mayor que cero.';
  }
  if (
    !Array.isArray(assumptions.driftPct) ||
    assumptions.driftPct.some((item) => typeof item !== 'number' || !Number.isFinite(item))
  ) {
    return 'La deriva del escenario debe contener únicamente números finitos.';
  }
  if (
    expectedScenarioId === 'quote_comparison' &&
    (!isPositiveFinite(assumptions.comparisonRate) ||
      assumptions.comparisonRate < CAROUSEL_MIN_FX_RATE ||
      assumptions.comparisonRate > CAROUSEL_MAX_FX_RATE)
  ) {
    return `La segunda tasa debe estar entre ${CAROUSEL_MIN_FX_RATE} y ${CAROUSEL_MAX_FX_RATE}.`;
  }

  if (!isRecord(value.derived)) return 'Los valores derivados no son válidos.';
  for (const derivedValue of Object.values(value.derived)) {
    if (derivedValue !== undefined && (typeof derivedValue !== 'number' || !Number.isFinite(derivedValue))) {
      return 'Los valores derivados deben ser números finitos.';
    }
  }

  if (!Array.isArray(value.facts)) return 'Los hechos económicos deben ser una lista.';
  const expectedKeys = CAROUSEL_SCENARIO_FACT_KEYS[expectedScenarioId];
  const expectedKeySet = new Set<CarouselEconomicFactKey>(expectedKeys);
  const factsByKey = new Map<CarouselEconomicFactKey, UnknownRecord>();

  for (const fact of value.facts) {
    if (!isRecord(fact) || typeof fact.key !== 'string' || !expectedKeySet.has(fact.key as CarouselEconomicFactKey)) {
      return 'El escenario contiene un hecho económico no permitido.';
    }
    const key = fact.key as CarouselEconomicFactKey;
    if (factsByKey.has(key)) return `El hecho económico ${key} está duplicado.`;
    if (typeof fact.label !== 'string' || !fact.label.trim()) {
      return `El hecho económico ${key} no tiene label.`;
    }
    if (typeof fact.formattedValue !== 'string' || !fact.formattedValue.trim()) {
      return `El hecho económico ${key} no tiene valor formateado.`;
    }
    if (typeof fact.value !== 'number' || !Number.isFinite(fact.value)) {
      return `El hecho económico ${key} debe ser finito.`;
    }
    const shape = CAROUSEL_ECONOMIC_FACT_SHAPES[key];
    if (fact.unit !== shape.unit) {
      return `El hecho económico ${key} debe usar la unidad ${shape.unit}.`;
    }
    if (fact.state !== shape.state) {
      return `El hecho económico ${key} debe usar el estado ${shape.state}.`;
    }
    factsByKey.set(key, fact);
  }

  const missingKey = expectedKeys.find((key) => !factsByKey.has(key));
  if (missingKey) return `Falta el hecho económico ${missingKey}.`;
  if (factsByKey.size !== expectedKeys.length) {
    return 'El escenario económico no contiene exactamente los hechos permitidos.';
  }

  if (expectedScenarioId === 'quote_comparison') {
    const amountUsd = assumptions.amountUsd as number;
    const quoteARate = roundTo(assumptions.baseRate as number, 2);
    const quoteBRate = roundTo(assumptions.comparisonRate as number, 2);
    const quoteAConversion = roundTo(quoteARate * amountUsd, 2);
    const quoteBConversion = roundTo(quoteBRate * amountUsd, 2);
    const differenceMxn = roundTo(quoteBConversion - quoteAConversion, 2);
    const differencePct = quoteAConversion === 0
      ? 0
      : roundTo((differenceMxn / quoteAConversion) * 100, 1);
    const expectedValues: Partial<Record<CarouselEconomicFactKey, number>> = {
      operation_usd: amountUsd,
      quote_a_rate: quoteARate,
      quote_b_rate: quoteBRate,
      quote_a_cost_mxn: quoteAConversion,
      quote_b_cost_mxn: quoteBConversion,
      quote_difference_mxn: differenceMxn,
      quote_difference_pct: differencePct,
    };

    for (const [key, expected] of Object.entries(expectedValues)) {
      const actual = factsByKey.get(key as CarouselEconomicFactKey)?.value as number;
      const tolerance = key === 'quote_difference_pct' ? 0.05 : 0.005;
      if (!approximatelyEqual(actual, expected as number, tolerance)) {
        return `El hecho económico ${key} no coincide con las asunciones del escenario.`;
      }
    }
  }

  return null;
}

export function isCarouselEconomicScenario(
  value: unknown,
  expectedScenarioId: ExpectedScenarioId,
): value is CarouselEconomicScenario {
  return validateCarouselEconomicScenario(value, expectedScenarioId) === null;
}
