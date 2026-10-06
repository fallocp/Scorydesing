/**
 * Post-check determinístico (SIN LLM) del Daily Report FX en inglés.
 *
 * Asume que el report ya fue coercionado (coerceFxDaily + applyEnFacts).
 *  - applyCalqueFixes: corrige calcos seguros con regex (no muta la entrada).
 *  - validateEnReport: paridad de cifras contra el MD fuente, calcos prohibidos,
 *    dirección del headline y límites duros de longitud.
 *
 * Costo: escaneos regex lineales + lookups en Set; crece lineal con el MD.
 */

import type { FxDailyReport, FxVariacionDir } from './fx-daily-types.ts';
import { FX_EN_CALQUE_RULES } from './fxEnglishStyleGuide.ts';

export type FxEnViolationRule = 'number_mismatch' | 'calque' | 'direction' | 'length' | 'headline_options';

export interface FxEnViolation {
  /** Ruta del campo, ej 'commentary[0]', 'drivers[1].bullets[2]'. */
  field: string;
  rule: FxEnViolationRule;
  detail: string;
}

// Un token numérico que no esté pegado a letras/dígitos (salta Q2, G7, T10).
const NUMBER_TOKEN = /(?<![A-Za-z\d.,])[-+]?\d+(?:[.,]\d+)*/g;
const THOUSANDS_COMMA = /^\d{1,3}(,\d{3})+(\.\d+)?$/;
const THOUSANDS_DOT = /^\d{1,3}(\.\d{3})+(,\d+)?$/;

function keyOf(n: number): string {
  return String(Number(Math.abs(n).toFixed(6)));
}

/** Normaliza un token a número (miles con coma, decimal con coma española). */
function parseToken(raw: string): number | null {
  const t = raw.replace(/^[-+]/, '');
  let s = t;
  if (THOUSANDS_COMMA.test(t)) s = t.replace(/,/g, '');
  else if (t.includes(',') && !t.includes('.') && t.split(',').length === 2) s = t.replace(',', '.');
  const n = parseFloat(s);
  return Number.isFinite(n) ? Math.abs(n) : null;
}

/** Cifras de un texto, en valor absoluto ('-0.12%' → 0.12). */
export function extractNumbers(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(NUMBER_TOKEN)) {
    const n = parseToken(m[0]);
    if (n !== null) out.push(Number(n.toFixed(6)));
  }
  return out;
}

/** Set de claves numéricas presentes en el MD fuente (una sola pasada). */
export function buildSourceNumberSet(rawInput: string): Set<string> {
  const set = new Set<string>();
  for (const m of rawInput.matchAll(NUMBER_TOKEN)) {
    const n = parseToken(m[0]);
    if (n !== null) set.add(keyOf(n));
    // El MD es español: "1.250" puede ser mil doscientos cincuenta.
    const t = m[0].replace(/^[-+]/, '');
    if (THOUSANDS_DOT.test(t)) {
      const alt = parseFloat(t.replace(/\./g, '').replace(',', '.'));
      if (Number.isFinite(alt)) set.add(keyOf(alt));
    }
  }
  return set;
}

// --- recorrido de campos -----------------------------------------------------

interface FieldText {
  field: string;
  text: string;
}

/** Campos de prosa (los que redacta el LLM). */
function proseFields(report: FxDailyReport, headlineAlternative: string): FieldText[] {
  const out: FieldText[] = [{ field: 'headline', text: report.headline }];
  if (headlineAlternative) out.push({ field: 'headline_alternative', text: headlineAlternative });
  report.commentary.forEach((p, i) => out.push({ field: `commentary[${i}]`, text: p }));
  out.push({ field: 'pulso.tendencia', text: report.pulso.tendencia });
  report.drivers.forEach((d, i) => {
    out.push({ field: `drivers[${i}].title`, text: d.title });
    d.bullets.forEach((b, j) => out.push({ field: `drivers[${i}].bullets[${j}]`, text: b }));
  });
  out.push({ field: 'lectura_clave', text: report.lectura_clave });
  report.en_la_mira.forEach((m, i) => out.push({ field: `en_la_mira[${i}].label`, text: m.label }));
  return out;
}

/** Campos estructurados con cifras (vienen de facts). date/nota/pair excluidos. */
function structuredFields(report: FxDailyReport): FieldText[] {
  const out: FieldText[] = [
    { field: 'pulso.apertura', text: report.pulso.apertura },
    { field: 'pulso.variacion', text: report.pulso.variacion },
    { field: 'pulso.rango_dia', text: report.pulso.rango_dia },
    { field: 'escenario_central', text: report.escenario_central },
  ];
  report.escenarios.forEach((e, i) => {
    out.push({ field: `escenarios[${i}].pct`, text: String(e.pct) });
    if (e.rango) out.push({ field: `escenarios[${i}].rango`, text: e.rango });
  });
  return out;
}

// --- auto-fix -----------------------------------------------------------------

const AUTO_FIX_RULES = FX_EN_CALQUE_RULES.filter((r) => r.replacement !== undefined).map((r) => ({
  re: new RegExp(r.pattern.source, r.pattern.flags + 'g'),
  replacement: r.replacement as string,
}));

function fixText(text: string): string {
  let out = text;
  for (const r of AUTO_FIX_RULES) out = out.replace(r.re, r.replacement);
  return out;
}

/** Corrige calcos seguros en prosa y strings estructurados. Devuelve copia nueva. */
export function applyCalqueFixes(
  report: FxDailyReport,
  headlineAlternative = '',
): { report: FxDailyReport; headlineAlternative: string } {
  const next: FxDailyReport = {
    ...report,
    headline: fixText(report.headline),
    commentary: report.commentary.map(fixText),
    pulso: {
      ...report.pulso,
      apertura: fixText(report.pulso.apertura),
      variacion: fixText(report.pulso.variacion),
      rango_dia: fixText(report.pulso.rango_dia),
      tendencia: fixText(report.pulso.tendencia),
    },
    drivers: report.drivers.map((d) => ({ title: fixText(d.title), bullets: d.bullets.map(fixText) })),
    lectura_clave: fixText(report.lectura_clave),
    escenario_central: fixText(report.escenario_central),
    escenarios: report.escenarios.map((e) => ({ ...e, rango: e.rango === undefined ? undefined : fixText(e.rango) })),
    en_la_mira: report.en_la_mira.map((m) => ({ ...m, label: fixText(m.label) })),
  };
  return { report: next, headlineAlternative: fixText(headlineAlternative) };
}

// --- dirección ----------------------------------------------------------------

const PESO_STRONGER_OR_USD_DOWN =
  /\bUSD\/MXN\s+(?:fell|falls|declined|declines|dropped|drops|eased|eases|slipped|slips)\b|\bpeso\s+(?:strengthen\w*|firm\w*|appreciat\w*|gain\w*|rall\w*|recover\w*)/i;
const PESO_WEAKER_OR_USD_UP =
  /\bUSD\/MXN\s+(?:rose|rises|climbed|climbs|jumped|jumps|advanced|advances)\b|\bpeso\s+(?:weaken\w*|soften\w*|depreciat\w*|slid|slides|slips|loses|lost)/i;

/** El headline no puede contradecir variacion_dir (USD/MXN up = peso más débil). */
export function checkHeadlineDirection(
  headline: string,
  dir: FxVariacionDir,
  field = 'headline',
): FxEnViolation | null {
  if (dir === 'up' && PESO_STRONGER_OR_USD_DOWN.test(headline)) {
    return {
      field,
      rule: 'direction',
      detail: 'USD/MXN rose (peso weaker) but the headline says the peso strengthened or USD/MXN fell',
    };
  }
  if (dir === 'down' && PESO_WEAKER_OR_USD_UP.test(headline)) {
    return {
      field,
      rule: 'direction',
      detail: 'USD/MXN fell (peso stronger) but the headline says the peso weakened or USD/MXN rose',
    };
  }
  return null;
}

/** Mismo titular salvo mayúsculas/puntuación ('Peso Firms.' == 'peso firms'). */
export function sameHeadline(a: string, b: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
  return norm(a) === norm(b);
}

/**
 * La alternativa debe existir, ser distinta del headline y respetar el límite de
 * longitud. Separado de validateEnReport: el pipeline lo combina y, si solo falla
 * esto, usa una alternativa determinística.
 */
export function checkHeadlineAlternative(headline: string, alternative: string): FxEnViolation[] {
  if (!alternative.trim()) {
    return [
      {
        field: 'headline_alternative',
        rule: 'headline_options',
        detail:
          'headline_alternative is empty: write a second headline with a clearly different framing (e.g., lead with the main driver from the body)',
      },
    ];
  }
  if (sameHeadline(headline, alternative)) {
    return [
      {
        field: 'headline_alternative',
        rule: 'headline_options',
        detail: 'headline_alternative repeats headline: write a clearly different framing (different lead driver or structure)',
      },
    ];
  }
  const n = wordCount(alternative);
  if (n > FX_EN_LENGTH_LIMITS.headline) {
    return [
      {
        field: 'headline_alternative',
        rule: 'length',
        detail: `${n} words, max ${FX_EN_LENGTH_LIMITS.headline}; shorten`,
      },
    ];
  }
  return [];
}

/**
 * El signo explícito de pulso.variacion no puede contradecir variacion_dir
 * (la paridad de cifras usa valor absoluto y no detecta un signo invertido).
 * Sin signo o dir 'flat' → no se marca.
 */
export function checkVariacionSign(variacion: string, dir: FxVariacionDir): FxEnViolation | null {
  const sign = /^\s*([-+−])\s*\d/.exec(variacion)?.[1];
  if (!sign) return null;
  const negative = sign !== '+';
  if ((dir === 'up' && negative) || (dir === 'down' && !negative)) {
    return {
      field: 'pulso.variacion',
      rule: 'direction',
      detail: `sign of "${variacion}" contradicts USD/MXN direction "${dir}"`,
    };
  }
  return null;
}

// --- longitud -------------------------------------------------------------------

/** Límites duros de layout (los targets del prompt son menores). */
export const FX_EN_LENGTH_LIMITS = {
  headline: 14,
  commentaryTotal: 90,
  bullet: 18,
  lecturaClave: 50,
  tendencia: 4,
  miraLabel: 5,
} as const;

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function checkLengths(report: FxDailyReport): FxEnViolation[] {
  const L = FX_EN_LENGTH_LIMITS;
  const out: FxEnViolation[] = [];
  const over = (field: string, n: number, max: number) =>
    out.push({ field, rule: 'length', detail: `${n} words, max ${max}; shorten` });

  if (!report.headline.trim()) out.push({ field: 'headline', rule: 'length', detail: 'headline is empty' });
  const hw = wordCount(report.headline);
  if (hw > L.headline) over('headline', hw, L.headline);
  const cw = report.commentary.reduce((acc, p) => acc + wordCount(p), 0);
  if (cw > L.commentaryTotal) over('commentary', cw, L.commentaryTotal);
  report.drivers.forEach((d, i) =>
    d.bullets.forEach((b, j) => {
      const n = wordCount(b);
      if (n > L.bullet) over(`drivers[${i}].bullets[${j}]`, n, L.bullet);
    }),
  );
  const lw = wordCount(report.lectura_clave);
  if (lw > L.lecturaClave) over('lectura_clave', lw, L.lecturaClave);
  const tw = wordCount(report.pulso.tendencia);
  if (tw > L.tendencia) over('pulso.tendencia', tw, L.tendencia);
  report.en_la_mira.forEach((m, i) => {
    const n = wordCount(m.label);
    if (n > L.miraLabel) over(`en_la_mira[${i}].label`, n, L.miraLabel);
  });
  return out;
}

// --- validación completa ----------------------------------------------------------

const VIOLATION_RULES = FX_EN_CALQUE_RULES.filter((r) => r.replacement === undefined);

/** Lista de violaciones; vacía = el reporte EN se puede entregar. */
export function validateEnReport(
  report: FxDailyReport,
  sourceNumbers: Set<string>,
  headlineAlternative = '',
): FxEnViolation[] {
  const violations: FxEnViolation[] = [];
  const prose = proseFields(report, headlineAlternative);

  // 1) Paridad de cifras: toda cifra del EN debe existir en el MD fuente.
  for (const { field, text } of [...prose, ...structuredFields(report)]) {
    if (!text) continue;
    for (const m of text.matchAll(NUMBER_TOKEN)) {
      const n = parseToken(m[0]);
      if (n === null || sourceNumbers.has(keyOf(n))) continue;
      violations.push({
        field,
        rule: 'number_mismatch',
        detail: `figure "${m[0]}" is not in the source; copy figures exactly from facts`,
      });
    }
  }

  // 2) Calcos / idioms / residuos en español (solo prosa).
  for (const { field, text } of prose) {
    if (!text) continue;
    for (const rule of VIOLATION_RULES) {
      const hit = text.match(rule.pattern);
      if (hit) violations.push({ field, rule: 'calque', detail: `"${hit[0]}": ${rule.hint}` });
    }
  }

  // 3) Dirección del headline y su alternativa (no el cuerpo, para evitar falsos positivos intradía).
  const d = checkHeadlineDirection(report.headline, report.pulso.variacion_dir);
  if (d) violations.push(d);
  if (headlineAlternative) {
    const da = checkHeadlineDirection(headlineAlternative, report.pulso.variacion_dir, 'headline_alternative');
    if (da) violations.push(da);
  }
  const s = checkVariacionSign(report.pulso.variacion, report.pulso.variacion_dir);
  if (s) violations.push(s);

  // 4) Longitud.
  violations.push(...checkLengths(report));

  return violations;
}
