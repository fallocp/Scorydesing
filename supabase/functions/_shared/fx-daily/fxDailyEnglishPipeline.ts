/**
 * Orquestador del modo inglés del Daily Report FX.
 *
 *   1. UNA llamada facts-first (facts + report EN en la misma respuesta).
 *   2. Ensamble determinístico (applyEnFacts) + auto-fix de calcos + Title Case en titulares.
 *   3. Post-check sin LLM (cifras vs MD, calcos, dirección, longitud, alternativa de headline).
 *   4. Si hay violaciones solo en prosa: UNA reparación chica (sin MD). Si persisten → 422.
 *      Si alguna violación cae en un campo que fija `facts` (applyEnFacts), 422 directo.
 *      Alternativa vacía/repetida = violación de prosa reparable; si al final SOLO falla la
 *      alternativa, se usa una alternativa determinística (no se rechaza el reporte).
 *   5. Siempre 2 opciones de headline distintas.
 *
 * Nunca más de 2 llamadas. El caller del LLM se inyecta (tests sin red).
 *
 * Presupuesto de tiempo: callOpenAI reintenta 1 vez tras timeout (+2 s), así que el
 * peor caso es (90+2+90) + (45+2+45) ≈ 274 s; mismo patrón que el modo ES (120+2+120).
 * El caso normal (1 llamada que responde a tiempo) queda en decenas de segundos.
 */

import type { CallOpenAIOptions, CallOpenAIResult } from '../callOpenAI.ts';
import { parseModelJson } from '../parseModelJson.ts';
import type { FxDailyReport, FxHeadlineOption } from './fx-daily-types.ts';
import { coerceFxDaily, str } from './fxDailyExtractor.ts';
import {
  applyEnFacts,
  buildExtractMessagesEn,
  buildFallbackHeadlineEn,
  buildRepairMessagesEn,
  coerceFxEnFacts,
  isFactsOwnedField,
  titleCaseEn,
  type FxEnFacts,
} from './fxDailyExtractorEn.ts';
import {
  applyCalqueFixes,
  buildSourceNumberSet,
  checkHeadlineAlternative,
  validateEnReport,
  type FxEnViolation,
} from './fxEnglishPostCheck.ts';

export type FxLlmCaller = (opts: CallOpenAIOptions) => Promise<CallOpenAIResult>;

export type FxEnPipelineResult =
  | { ok: true; report: FxDailyReport; headline_options: FxHeadlineOption[]; repaired: boolean }
  | { ok: false; status: number; body: { error: string; message: string; violations?: FxEnViolation[] } };

interface Assembled {
  report: FxDailyReport;
  headlineAlternative: string;
  violations: FxEnViolation[];
}

function validate(report: FxDailyReport, alt: string, sourceNumbers: Set<string>): FxEnViolation[] {
  return [...validateEnReport(report, sourceNumbers, alt), ...checkHeadlineAlternative(report.headline, alt)];
}

function assemble(
  reportData: unknown,
  facts: FxEnFacts,
  sourceNumbers: Set<string>,
): Assembled | null {
  const coerced = coerceFxDaily(reportData);
  if (!coerced) return null;
  const rawAlt = str((reportData as Record<string, unknown> | null)?.headline_alternative);
  const fixed = applyCalqueFixes(applyEnFacts(coerced, facts), rawAlt);
  // Title Case determinístico en ambos titulares (el prompt también lo pide).
  const report: FxDailyReport = { ...fixed.report, headline: titleCaseEn(fixed.report.headline) };
  const alt = titleCaseEn(fixed.headlineAlternative);
  return { report, headlineAlternative: alt, violations: validate(report, alt, sourceNumbers) };
}

/** true si todas las violaciones son de la alternativa (recuperables sin LLM). */
function altOnly(violations: FxEnViolation[]): boolean {
  return violations.length > 0 && violations.every((v) => v.field === 'headline_alternative');
}

/** Sustituye la alternativa por una determinística y revalida. */
function withFallback(a: Assembled, sourceNumbers: Set<string>): Assembled {
  const alt = buildFallbackHeadlineEn(a.report);
  return { report: a.report, headlineAlternative: alt, violations: validate(a.report, alt, sourceNumbers) };
}

function validationFailed(violations: FxEnViolation[]): FxEnPipelineResult {
  const summary = violations.slice(0, 3).map((v) => `${v.field}: ${v.detail}`).join('; ');
  return {
    ok: false,
    status: 422,
    body: {
      error: 'en_validation_failed',
      message: `La versión en inglés no pasó la validación: ${summary}`,
      violations,
    },
  };
}

/** Siempre 2 opciones; checkHeadlineAlternative garantiza que la alternativa existe y es distinta. */
function headlineOptions(headline: string, alternative: string, approved: boolean): FxHeadlineOption[] {
  return [
    { value: headline, source: approved ? 'approved' : 'alternative' },
    { value: alternative, source: 'alternative' },
  ];
}

export async function runFxEnglishPipeline(
  rawInput: string,
  approvedHeadline: string,
  call: FxLlmCaller,
): Promise<FxEnPipelineResult> {
  const sourceNumbers = buildSourceNumberSet(rawInput);

  // --- Llamada #1: facts-first ---
  const first = await call({
    messages: buildExtractMessagesEn(rawInput, approvedHeadline),
    max_completion_tokens: 4000,
    temperature: 0.3,
    timeoutMs: 90_000,
  });
  if (!first.success) {
    return {
      ok: false,
      status: 502,
      body: { error: first.error, message: `No se pudo procesar el análisis: ${first.message}` },
    };
  }
  const parsed = parseModelJson<Record<string, unknown>>(first.content);
  if (!parsed.ok || !parsed.data || typeof parsed.data !== 'object') {
    return {
      ok: false,
      status: 502,
      body: { error: 'model_output', message: `Respuesta no parseable: ${parsed.detail ?? 'sin datos'}` },
    };
  }

  const facts = coerceFxEnFacts(parsed.data.facts);
  let current = assemble(parsed.data.report, facts, sourceNumbers);
  if (!current || !current.report.headline) {
    return {
      ok: false,
      status: 422,
      body: { error: 'empty_report', message: 'No se pudieron extraer los campos del análisis.' },
    };
  }

  let repaired = false;
  if (current.violations.length > 0) {
    const firstPass = current.violations;
    // Si algún campo con violación lo reescribe applyEnFacts desde facts, la
    // reparación no puede dejar el reporte limpio: 422 sin gastar la llamada #2.
    if (firstPass.some((v) => isFactsOwnedField(v.field, facts))) return validationFailed(firstPass);

    // --- Llamada #2 (solo si falla el post-check en prosa): reparación dirigida ---
    const repair = await call({
      messages: buildRepairMessagesEn(facts, current.report, current.headlineAlternative, firstPass),
      max_completion_tokens: 2000,
      temperature: 0.2,
      timeoutMs: 45_000,
    });
    const repairedParsed = repair.success ? parseModelJson<Record<string, unknown>>(repair.content) : null;
    const data =
      repairedParsed?.ok && repairedParsed.data && typeof repairedParsed.data === 'object' ? repairedParsed.data : null;
    // Acepta tanto el report suelto como { report: {...} }.
    const reportData = data && (data.report && typeof data.report === 'object' ? data.report : data);
    let next = reportData ? assemble(reportData, facts, sourceNumbers) : null;

    if (!next) {
      // La reparación no sirvió: si solo fallaba la alternativa, alternativa determinística.
      if (!altOnly(firstPass)) return validationFailed(firstPass);
      const fb = withFallback(current, sourceNumbers);
      if (fb.violations.length > 0) return validationFailed(firstPass);
      current = fb;
    } else {
      if (altOnly(next.violations)) next = withFallback(next, sourceNumbers);
      if (next.violations.length === 0) {
        current = next;
        repaired = true;
      } else {
        // La reparación solo hacía falta por la alternativa pero metió otras violaciones:
        // el reporte del primer pase sigue limpio → ese reporte + alternativa determinística.
        if (!altOnly(firstPass)) return validationFailed(next.violations);
        const fb = withFallback(current, sourceNumbers);
        if (fb.violations.length > 0) return validationFailed(next.violations);
        current = fb;
      }
    }
  }

  return {
    ok: true,
    report: current.report,
    headline_options: headlineOptions(current.report.headline, current.headlineAlternative, Boolean(approvedHeadline)),
    repaired,
  };
}
