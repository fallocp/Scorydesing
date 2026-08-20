import { describe, expect, it } from 'vitest';

import { validateCarouselEconomicScenario } from '../validateCarouselEconomicScenario';
import type {
  CarouselEconomicFactKey,
  CarouselEconomicState,
  CarouselEconomicUnit,
} from '../carousel-plan-types';

const VALUES: Record<CarouselEconomicFactKey, number> = {
  operation_usd: 19_000,
  base_rate: 0,
  exposed_rate: 0,
  base_cost_mxn: 0,
  exposed_cost_mxn: 0,
  cost_delta_mxn: 0,
  cost_delta_pct: 0,
  quote_a_rate: 17.2,
  quote_b_rate: 17.54,
  quote_a_cost_mxn: 326_800,
  quote_b_cost_mxn: 333_260,
  quote_difference_mxn: 6_460,
  quote_difference_pct: 2,
  sale_price_mxn: 0,
  base_gross_profit_mxn: 0,
  exposed_gross_profit_mxn: 0,
  base_gross_margin_pct: 0,
  exposed_gross_margin_pct: 0,
  accumulated_impact_mxn: 0,
  defined_cost_mxn: 0,
};

const QUOTE_KEYS = [
  'operation_usd',
  'quote_a_rate',
  'quote_b_rate',
  'quote_a_cost_mxn',
  'quote_b_cost_mxn',
  'quote_difference_mxn',
  'quote_difference_pct',
] as const;

function fact(key: (typeof QUOTE_KEYS)[number]) {
  const unit: CarouselEconomicUnit = key === 'operation_usd'
    ? 'USD'
    : key.endsWith('_rate')
      ? 'rate'
      : key.endsWith('_pct')
        ? 'percent'
        : 'MXN';
  const state: CarouselEconomicState = key === 'operation_usd' || key === 'quote_a_rate' || key === 'quote_a_cost_mxn'
    ? 'base'
    : key.startsWith('quote_difference')
      ? 'delta'
      : 'derived';
  return {
    key,
    label: key.toUpperCase(),
    value: VALUES[key],
    formattedValue: String(VALUES[key]),
    unit,
    state,
  };
}

function validQuoteScenario() {
  return {
    version: 1,
    scenarioId: 'quote_comparison',
    qualifier: 'ESCENARIO ILUSTRATIVO',
    assumptions: {
      baseRate: 17.2,
      comparisonRate: 17.54,
      amountUsd: 19_000,
      driftPct: [1, 2],
      markupPct: 35,
    },
    derived: {
      comparisonRate: 17.54,
      comparisonCostMxn: 333_260,
      quoteDifferenceMxn: 6_460,
      quoteDifferencePct: 2,
    },
    facts: QUOTE_KEYS.map(fact),
    createdAt: '2026-08-19T00:00:00.000Z',
  };
}

describe('validateCarouselEconomicScenario', () => {
  it('acepta una comparación simultánea consistente', () => {
    expect(validateCarouselEconomicScenario(validQuoteScenario(), 'quote_comparison')).toBeNull();
  });

  it('rechaza tasas y montos no positivos o no finitos', () => {
    const negativeRate = validQuoteScenario();
    negativeRate.assumptions.comparisonRate = -17.54;
    expect(validateCarouselEconomicScenario(negativeRate, 'quote_comparison')).toContain(
      'segunda tasa',
    );

    const infiniteAmount = validQuoteScenario();
    infiniteAmount.assumptions.amountUsd = Number.POSITIVE_INFINITY;
    expect(validateCarouselEconomicScenario(infiniteAmount, 'quote_comparison')).toContain(
      'monto USD',
    );

    const outOfRangeRate = validQuoteScenario();
    outOfRangeRate.assumptions.comparisonRate = 1_001;
    expect(validateCarouselEconomicScenario(outOfRangeRate, 'quote_comparison')).toContain(
      'segunda tasa',
    );
  });

  it('rechaza facts faltantes, extra o duplicados', () => {
    const missing = validQuoteScenario();
    missing.facts.pop();
    expect(validateCarouselEconomicScenario(missing, 'quote_comparison')).toContain('Falta');

    const duplicate = validQuoteScenario();
    duplicate.facts.push({ ...duplicate.facts[0] });
    expect(validateCarouselEconomicScenario(duplicate, 'quote_comparison')).toContain('duplicado');

    const extra = validQuoteScenario();
    (extra.facts as Array<Record<string, unknown>>).push({
      ...extra.facts[0],
      key: 'base_rate',
    });
    expect(validateCarouselEconomicScenario(extra, 'quote_comparison')).toContain('no permitido');

    const wrongShape = validQuoteScenario();
    const quoteRate = wrongShape.facts.find((item) => item.key === 'quote_a_rate');
    if (quoteRate) quoteRate.unit = 'USD';
    expect(validateCarouselEconomicScenario(wrongShape, 'quote_comparison')).toContain(
      'unidad rate',
    );
  });

  it('rechaza equivalentes que no corresponden a monto por tasa', () => {
    const scenario = validQuoteScenario();
    const conversion = scenario.facts.find((item) => item.key === 'quote_b_cost_mxn');
    if (conversion) conversion.value += 1;

    expect(validateCarouselEconomicScenario(scenario, 'quote_comparison')).toContain(
      'no coincide con las asunciones',
    );
  });
});
