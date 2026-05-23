/**
 * Property-based tests for Base Rules Engine — Ethical violation detection
 *
 * Feature: claim-validator, Property 4: Ethical violation detection and risk classification
 *
 * For any piece containing text that matches a prohibited pattern from
 * BASE_ETHICAL_RULES.prohibitedPatterns, the Base Rules Engine SHALL detect
 * the violation and classify it as riskLevel: 'high'.
 * For any piece making financial claims without required qualifiers,
 * it SHALL classify as riskLevel: 'medium'.
 *
 * **Validates: Requirements 2.3, 2.4, 2.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePieceBaseRules } from '../lib/baseRulesEngine.ts';
import { BASE_ETHICAL_RULES } from '../lib/baseEthicalRules.ts';
import type { PieceInput } from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generates a safe string that won't accidentally match any prohibited pattern or qualifier trigger */
const safeStringArb = fc.constantFrom(
  'Conoce nuestros servicios',
  'Descubre nuevas opciones',
  'Haz crecer tu negocio',
  'Contacta a un asesor',
  'Más información aquí',
  'Solicita una demo',
  'Agenda tu cita',
  'Visita nuestra web',
);

/** Generates a valid piece with safe text that won't trigger any rules */
const safePieceArb: fc.Arbitrary<PieceInput> = fc.record({
  headline: safeStringArb,
  body: safeStringArb,
  cta: safeStringArb,
  footer: fc.option(safeStringArb, { nil: undefined }),
});

/** All concrete prohibited text samples that match the regex patterns */
const PROHIBITED_SAMPLES: { id: string; text: string }[] = [
  // guaranteed_returns
  { id: 'guaranteed_returns', text: 'Te garantizamos el mejor retorno' },
  { id: 'guaranteed_returns', text: 'Retorno seguro para tu inversión' },
  { id: 'guaranteed_returns', text: 'Operación sin riesgo alguno' },
  // false_promises
  { id: 'false_promises', text: '100% seguro y confiable' },
  { id: 'false_promises', text: '100% garantizado por nosotros' },
  { id: 'false_promises', text: 'Aquí nunca pierdes tu dinero' },
  // misleading_comparisons
  { id: 'misleading_comparisons', text: 'Somos mejor que cualquier banco' },
  { id: 'misleading_comparisons', text: 'Nuestro fondo supera al mercado' },
  // risk_minimization
  { id: 'risk_minimization', text: 'Inversión sin ningún riesgo' },
  { id: 'risk_minimization', text: 'Inversión sin ningun riesgo' },
  { id: 'risk_minimization', text: 'Ofrecemos riesgo cero' },
  // false_urgency
  { id: 'false_urgency', text: 'Esta es tu última oportunidad' },
  { id: 'false_urgency', text: 'Esta es tu ultima oportunidad' },
  { id: 'false_urgency', text: 'Disponible solo hoy' },
  { id: 'false_urgency', text: 'La oferta expira pronto' },
  // discrimination
  { id: 'discrimination', text: 'Producto solo para hombres' },
  { id: 'discrimination', text: 'Producto solo para mujeres' },
  { id: 'discrimination', text: 'Vamos a excluir a ciertos grupos' },
  { id: 'discrimination', text: 'Se excluye a menores' },
];

/** Arbitrary that picks a random prohibited text sample */
const prohibitedSampleArb = fc.constantFrom(...PROHIBITED_SAMPLES);

/** The four text fields where prohibited text can be injected */
const PIECE_FIELDS = ['headline', 'body', 'cta', 'footer'] as const;

/** Arbitrary that picks a random field to inject the prohibited text into */
const fieldToInjectArb = fc.constantFrom(...PIECE_FIELDS);

/** Qualifier trigger samples — text that triggers a qualifier requirement */
const QUALIFIER_TRIGGER_SAMPLES: { id: string; triggerText: string; qualifier: string }[] = [
  // past_performance
  { id: 'past_performance', triggerText: 'Nuestro rendimiento ha sido excelente', qualifier: 'rendimientos pasados no garantizan resultados futuros' },
  { id: 'past_performance', triggerText: 'El retorno de este año fue positivo', qualifier: 'rendimientos pasados no garantizan resultados futuros' },
  { id: 'past_performance', triggerText: 'La ganancia obtenida fue notable', qualifier: 'rendimientos pasados no garantizan resultados futuros' },
  // rate_change
  { id: 'rate_change', triggerText: 'Nuestra tasa preferencial es competitiva', qualifier: 'las tasas pueden cambiar' },
  { id: 'rate_change', triggerText: 'El interés que ofrecemos es bajo', qualifier: 'las tasas pueden cambiar' },
  { id: 'rate_change', triggerText: 'Consulta nuestro APR actual', qualifier: 'las tasas pueden cambiar' },
  // capital_risk
  { id: 'capital_risk', triggerText: 'Empieza a invertir hoy mismo', qualifier: 'su capital está en riesgo' },
  { id: 'capital_risk', triggerText: 'Tu inversión crece cada día', qualifier: 'su capital está en riesgo' },
  { id: 'capital_risk', triggerText: 'Protege tu capital con nosotros', qualifier: 'su capital está en riesgo' },
];

/** Arbitrary that picks a random qualifier trigger sample */
const qualifierTriggerArb = fc.constantFrom(...QUALIFIER_TRIGGER_SAMPLES);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 4: Ethical violation detection and risk classification', () => {
  it('detects prohibited patterns and classifies as riskLevel high', () => {
    fc.assert(
      fc.property(
        safePieceArb,
        prohibitedSampleArb,
        fieldToInjectArb,
        (basePiece, sample, field) => {
          // Inject the prohibited text into the chosen field
          const piece: PieceInput = { ...basePiece };
          if (field === 'footer') {
            piece.footer = sample.text;
          } else {
            piece[field] = sample.text;
          }

          const result = validatePieceBaseRules(piece);

          // riskLevel must be 'high'
          expect(result.riskLevel).toBe('high');

          // At least one issue must have risk: 'high'
          const highIssues = result.issues.filter((i) => i.risk === 'high');
          expect(highIssues.length).toBeGreaterThanOrEqual(1);

          // The high issue must reference the correct prohibited pattern category
          const matchingIssue = highIssues.find((i) =>
            i.reason.includes(sample.id),
          );
          expect(matchingIssue).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });

  it('detects missing qualifiers for financial claims and classifies as riskLevel medium', () => {
    fc.assert(
      fc.property(
        safePieceArb,
        qualifierTriggerArb,
        fieldToInjectArb,
        (basePiece, triggerSample, field) => {
          // Inject the trigger text into the chosen field WITHOUT the qualifier
          const piece: PieceInput = { ...basePiece };
          if (field === 'footer') {
            piece.footer = triggerSample.triggerText;
          } else {
            piece[field] = triggerSample.triggerText;
          }

          // Ensure the qualifier text is NOT present anywhere in the piece
          // (safe strings should not contain qualifier text, but verify)
          const allText = [piece.headline, piece.body, piece.cta, piece.footer ?? ''].join(' ');
          if (allText.toLowerCase().includes(triggerSample.qualifier.toLowerCase())) {
            // Skip this case — the safe text accidentally contains the qualifier
            return;
          }

          const result = validatePieceBaseRules(piece);

          // riskLevel must be at least 'medium'
          expect(['medium', 'high']).toContain(result.riskLevel);

          // At least one issue must have risk: 'medium' referencing the qualifier
          const mediumIssues = result.issues.filter((i) => i.risk === 'medium');
          expect(mediumIssues.length).toBeGreaterThanOrEqual(1);

          // The medium issue must reference the correct qualifier id
          const matchingIssue = mediumIssues.find((i) =>
            i.reason.includes(triggerSample.id),
          );
          expect(matchingIssue).toBeDefined();
        },
      ),
      { numRuns: 100 },
    );
  });
});
