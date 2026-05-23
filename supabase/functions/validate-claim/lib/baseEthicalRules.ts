/**
 * Base Ethical Rules for Nivel 1 validation.
 * These rules are hardcoded constants that apply universally to all tenants.
 * They detect prohibited advertising patterns in financial markets
 * and verify the presence of required qualifiers.
 *
 * Requirements: 2.2, 2.3, 2.4
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type RiskLevel = 'low' | 'medium' | 'high';

export interface ProhibitedPattern {
  /** Unique identifier for the pattern category */
  id: string;
  /** Array of regex patterns to match against piece text */
  patterns: readonly RegExp[];
  /** Risk level assigned when this pattern is detected */
  riskLevel: 'high';
}

export interface RequiredQualifier {
  /** Unique identifier for the qualifier */
  id: string;
  /** Regex that triggers the qualifier requirement */
  trigger: RegExp;
  /** Text that must be present when the trigger matches */
  qualifier: string;
}

export interface BaseEthicalRules {
  prohibitedPatterns: readonly ProhibitedPattern[];
  requiredQualifiers: readonly RequiredQualifier[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const BASE_ETHICAL_RULES: BaseEthicalRules = {
  prohibitedPatterns: [
    {
      id: 'guaranteed_returns',
      patterns: [/garant[ií]z/i, /retorno seguro/i, /sin riesgo/i],
      riskLevel: 'high',
    },
    {
      id: 'false_promises',
      patterns: [/100%\s*(seguro|garantizado)/i, /nunca pierd/i],
      riskLevel: 'high',
    },
    {
      id: 'misleading_comparisons',
      patterns: [/mejor que.*banco/i, /supera.*mercado/i],
      riskLevel: 'high',
    },
    {
      id: 'risk_minimization',
      patterns: [/sin ning[uú]n riesgo/i, /riesgo cero/i],
      riskLevel: 'high',
    },
    {
      id: 'false_urgency',
      patterns: [/[uú]ltima oportunidad/i, /solo hoy/i, /oferta.*expira/i],
      riskLevel: 'high',
    },
    {
      id: 'discrimination',
      patterns: [/solo para (hombres|mujeres)/i, /exclu(ir|ye)/i],
      riskLevel: 'high',
    },
  ],
  requiredQualifiers: [
    {
      id: 'past_performance',
      trigger: /rendimiento|retorno|ganancia/i,
      qualifier: 'rendimientos pasados no garantizan resultados futuros',
    },
    {
      id: 'rate_change',
      trigger: /tasa|interés|APR/i,
      qualifier: 'las tasas pueden cambiar',
    },
    {
      id: 'capital_risk',
      trigger: /inver(tir|sión)|capital/i,
      qualifier: 'su capital está en riesgo',
    },
  ],
} as const;
