import type { Brand, BrandConfig } from '@/types/xendingDesign';

const BRAND_CONFIGS: Record<Brand, BrandConfig> = {
  xending: {
    brand: 'xending',
    displayName: 'Xending',
    disclaimer:
      'Disponible solo para clientes en Estados Unidos. Enfocado en la industria del produce en Texas y California.',
    shortDisclaimer:
      'Solo clientes en EE.UU. Industria del produce en TX y CA.',
    approvedClaims: [
      'Pagos internacionales en minutos',
      'Cobertura en más de 30 países',
      'Tipo de cambio competitivo',
      'Plataforma 100% digital',
      'Enfocado en la industria del produce',
    ],
    forbiddenTerms: [],
    approvedNumbers: {
      countries: '30+',
      speed: 'minutos',
      availability: '24/7',
    },
  },
  xending_capital: {
    brand: 'xending_capital',
    displayName: 'Xending Capital',
    disclaimer:
      'Xending Capital es marca comercial de Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación crediticia. Líneas hasta $500,000 USD. Plazos hasta 45 días. Disponible solo en México.',
    shortDisclaimer:
      'Xending Capital — Lemad Capital SAPI de CV SOFOM ENR. Sujeto a aprobación. Líneas hasta $500K USD. Plazos hasta 45 días. Solo México.',
    approvedClaims: [
      'Líneas de crédito hasta $500,000 USD',
      'Plazos hasta 45 días',
      'Pre-aprobación en minutos. Aprobación desde 48 horas hábiles',
      'Factoraje para empresas mexicanas',
      'Sin garantía hipotecaria',
    ],
    forbiddenTerms: [
      'tipo de cambio',
      'FX',
      'conversión de divisas',
      'casa de cambio',
      'cambio de moneda',
    ],
    approvedNumbers: {
      maxLine: '$500,000 USD',
      maxPlazo: '45 días',
      preApproval: 'minutos',
      approval: 'desde 48 horas hábiles',
    },
  },
};

/**
 * Qualifier rules for Xending brand copy validation.
 * Absolute guarantees must include "hasta" or "hábil" qualifiers.
 */
export const XENDING_QUALIFIER_RULES = {
  requiredQualifiers: ['hasta', 'hábil'],
  description:
    'Absolute guarantees require "hasta" or "hábil" qualifiers to avoid misleading claims.',
} as const;

/**
 * Returns the brand configuration for the given brand.
 * Includes disclaimers, forbidden terms, approved claims, and approved numbers.
 */
export function getBrandConfig(brand: Brand): BrandConfig {
  return BRAND_CONFIGS[brand];
}
