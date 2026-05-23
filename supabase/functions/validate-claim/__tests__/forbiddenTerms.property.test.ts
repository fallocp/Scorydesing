/**
 * Property-based tests for Forbidden Terms Force High Risk
 *
 * Feature: claim-validator, Property 7: Forbidden terms force high risk
 *
 * For any piece where any field (headline, body, cta, footer) contains a substring
 * matching a prohibited pattern (Nivel 1) or a term in the tenant's `forbidden_terms`
 * (Nivel 2), the final combined validation result SHALL have `riskLevel` of 'high'
 * as minimum.
 *
 * **Validates: Requirements 2.3, 4.5**
 */
import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { validatePieceBaseRules } from '../lib/baseRulesEngine.ts';
import { combineResults } from '../lib/combineResults.ts';
import { BASE_ETHICAL_RULES } from '../lib/baseEthicalRules.ts';
import type {
  PieceInput,
  BaseRulesResult,
  OpenAIValidationResult,
  TenantRuleIssue,
} from '../lib/types.ts';

// ---------------------------------------------------------------------------
// Helpers / Arbitraries
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
const PROHIBITED_SAMPLES: string[] = [
  // guaranteed_returns
  'Te garantizamos el mejor retorno',
  'Retorno seguro para tu inversión',
  'Operación sin riesgo alguno',
  // false_promises
  '100% seguro y confiable',
  '100% garantizado por nosotros',
  'Aquí nunca pierdes tu dinero',
  // misleading_comparisons
  'Somos mejor que cualquier banco',
  'Nuestro fondo supera al mercado',
  // risk_minimization
  'Inversión sin ningún riesgo',
  'Ofrecemos riesgo cero',
  // false_urgency
  'Esta es tu última oportunidad',
  'Disponible solo hoy',
  'La oferta expira pronto',
  // discrimination
  'Producto solo para hombres',
  'Producto solo para mujeres',
  'Vamos a excluir a ciertos grupos',
];

/** Arbitrary that picks a random prohibited text sample */
const prohibitedSampleArb = fc.constantFrom(...PROHIBITED_SAMPLES);

/** The four text fields where prohibited text can be injected */
const PIECE_FIELDS = ['headline', 'body', 'cta', 'footer'] as const;

/** Arbitrary that picks a random field to inject text into */
const fieldToInjectArb = fc.constantFrom(...PIECE_FIELDS);

/** Generates random forbidden_terms for Nivel 2 simulation */
const forbiddenTermArb = fc.constantFrom(
  'bitcoin',
  'cripto garantizado',
  'rendimiento fijo',
  'sin pérdidas',
  'dinero fácil',
  'ganancias aseguradas',
  'duplica tu dinero',
  'retiro inmediato',
  'bono exclusivo',
  'premio seguro',
);

// ---------------------------------------------------------------------------
// Property Tests
// ---------------------------------------------------------------------------

describe('Feature: claim-validator, Property 7: Forbidden terms force high risk', () => {
  describe('Scenario 1: Nivel 1 prohibited patterns force high risk', () => {
    it('pieces containing prohibited patterns always result in riskLevel high and compliance_status rejected', () => {
      fc.assert(
        fc.property(
          safePieceArb,
          prohibitedSampleArb,
          fieldToInjectArb,
          fc.nat({ max: 20 }),
          (basePiece, prohibitedText, field, pieceIndex) => {
            // Inject the prohibited text into the chosen field
            const piece: PieceInput = { ...basePiece };
            if (field === 'footer') {
              piece.footer = prohibitedText;
            } else {
              piece[field] = prohibitedText;
            }

            // Step 1: Run Nivel 1 validation
            const level1Result = validatePieceBaseRules(piece);

            // Step 2: Combine results with only Nivel 1 (no Nivel 2)
            const combined = combineResults(pieceIndex, piece, level1Result, undefined);

            // Assert: final riskLevel is 'high'
            expect(combined.riskLevel).toBe('high');

            // Assert: compliance_status is 'rejected'
            expect(combined.compliance_status).toBe('rejected');
          },
        ),
        { numRuns: 100 },
      );
    });
  });

  describe('Scenario 2: Nivel 2 forbidden_terms force high risk', () => {
    it('pieces with detected forbidden_terms in Nivel 2 always result in riskLevel high and compliance_status rejected', () => {
      fc.assert(
        fc.property(
          safePieceArb,
          forbiddenTermArb,
          fieldToInjectArb,
          fc.nat({ max: 20 }),
          (basePiece, forbiddenTerm, field, pieceIndex) => {
            // Inject the forbidden term into the chosen field
            const piece: PieceInput = { ...basePiece };
            if (field === 'footer') {
              piece.footer = `Aprovecha ${forbiddenTerm} ahora`;
            } else {
              piece[field] = `Aprovecha ${forbiddenTerm} ahora`;
            }

            // Step 1: Run Nivel 1 validation (piece is clean for Nivel 1 patterns)
            const level1Result: BaseRulesResult = { riskLevel: 'low', issues: [] };

            // Step 2: Simulate a Nivel 2 result where the forbidden term was detected
            const level2Result: OpenAIValidationResult = {
              pieceIndex,
              riskLevel: 'high',
              issues: [
                {
                  text: forbiddenTerm,
                  risk: 'high',
                  reason: `Forbidden term detected: "${forbiddenTerm}" is in tenant's forbidden_terms list`,
                  suggestedFix: `Remove or replace the term "${forbiddenTerm}"`,
                  source: 'tenant_rules',
                },
              ],
              approvedVersion: {
                headline: piece.headline,
                body: piece.body,
                cta: piece.cta,
                footer: piece.footer ?? '',
              },
              finalRecommendation: 'Pieza rechazada por contener términos prohibidos del tenant.',
            };

            // Step 3: Combine results from both levels
            const combined = combineResults(pieceIndex, piece, level1Result, level2Result);

            // Assert: final riskLevel is 'high'
            expect(combined.riskLevel).toBe('high');

            // Assert: compliance_status is 'rejected'
            expect(combined.compliance_status).toBe('rejected');
          },
        ),
        { numRuns: 100 },
      );
    });

    it('forbidden_terms force high risk even when Nivel 1 detected medium risk', () => {
      fc.assert(
        fc.property(
          safePieceArb,
          forbiddenTermArb,
          fc.nat({ max: 20 }),
          (basePiece, forbiddenTerm, pieceIndex) => {
            const piece: PieceInput = { ...basePiece };

            // Step 1: Simulate Nivel 1 result with medium risk (missing qualifier)
            const level1Result: BaseRulesResult = {
              riskLevel: 'medium',
              issues: [
                {
                  text: 'rendimiento',
                  risk: 'medium',
                  reason: 'Missing required qualifier: past_performance',
                  suggestedFix: 'Add the qualifier: "rendimientos pasados no garantizan resultados futuros"',
                  source: 'base_rules',
                },
              ],
            };

            // Step 2: Simulate Nivel 2 result with forbidden term detected (high)
            const level2Result: OpenAIValidationResult = {
              pieceIndex,
              riskLevel: 'high',
              issues: [
                {
                  text: forbiddenTerm,
                  risk: 'high',
                  reason: `Forbidden term detected: "${forbiddenTerm}"`,
                  suggestedFix: `Remove "${forbiddenTerm}"`,
                  source: 'tenant_rules',
                },
              ],
              approvedVersion: {
                headline: piece.headline,
                body: piece.body,
                cta: piece.cta,
                footer: piece.footer ?? '',
              },
              finalRecommendation: 'Pieza rechazada.',
            };

            // Step 3: Combine results
            const combined = combineResults(pieceIndex, piece, level1Result, level2Result);

            // Assert: final riskLevel is 'high' (max of medium, high)
            expect(combined.riskLevel).toBe('high');

            // Assert: compliance_status is 'rejected'
            expect(combined.compliance_status).toBe('rejected');
          },
        ),
        { numRuns: 100 },
      );
    });
  });
});
