/**
 * Agente extractor del Daily Report FX — modo inglés (locale 'en').
 *
 * NO traduce el MD línea a línea: en UNA sola respuesta el modelo primero fija
 * los hechos neutrales (`facts`, mismas claves estructuradas que el esquema ES) y
 * luego redacta el `report` en inglés nativo de mercado SOLO a partir de esos
 * hechos, guiado por la guía "Global Market English" + glosario.
 *
 * `applyEnFacts` sobrescribe de forma determinística los campos estructurados con
 * los hechos (el LLM solo es dueño de la prosa). El prompt de reparación no lleva
 * el MD (llamada chica y barata).
 */

import type { OpenAIMessage } from '../callOpenAI.ts';
import {
  FX_DEFAULT_NOTA_EN,
  type FxDailyReport,
  type FxDriver,
  type FxMiraItem,
  type FxPulso,
  type FxScenario,
  type FxScenarioDirection,
} from './fx-daily-types.ts';
import { dir, miraCat, str, toNum, toStrArray, vdir } from './fxDailyExtractor.ts';
import {
  FX_EN_DRIVER_TITLES,
  FX_EN_SCENARIO_LABELS,
  FX_EN_TREND_LABELS,
  FX_EN_STYLE_GUIDE,
  renderGlossaryForPrompt,
} from './fxEnglishStyleGuide.ts';
import { sameHeadline, type FxEnViolation } from './fxEnglishPostCheck.ts';

export type FxEnRegion = 'mexico' | 'us' | 'global';

/** Hechos neutrales extraídos del MD español (fuente de verdad de lo estructurado). */
export interface FxEnFacts {
  /** 'YYYY-MM-DD' o ''. */
  date_iso: string;
  pulso: Pick<FxPulso, 'apertura' | 'variacion' | 'variacion_dir' | 'rango_dia' | 'tendencia_dir'>;
  /** Cierre previo si viene, si no ''. */
  close: string;
  support: string[];
  resistance: string[];
  /** Cadena causal de "Apertura y contexto" como fragmentos breves en inglés. */
  context_points: string[];
  /** Entidad + cifra, cifras copiadas tal cual. */
  drivers: { region: FxEnRegion; points: string[] }[];
  /** Sesgo / outlook breve. */
  bias: string;
  escenario_central: string;
  escenarios: { pct: number; direction: FxScenarioDirection; rango?: string }[];
  /** label en inglés; nombres de eventos del calendario EXACTOS como en la fuente. */
  en_la_mira: FxMiraItem[];
}

const JSON_SHAPE = `{
  "facts": {
    "date_iso": "YYYY-MM-DD",
    "pulso": { "apertura": "", "variacion": "", "variacion_dir": "flat", "rango_dia": "", "tendencia_dir": "lateral" },
    "close": "",
    "support": [""],
    "resistance": [""],
    "context_points": [""],
    "drivers": [ { "region": "mexico", "points": [""] } ],
    "bias": "",
    "escenario_central": "",
    "escenarios": [ { "pct": 52, "direction": "lateral", "rango": "" } ],
    "en_la_mira": [ { "label": "", "category": "generic" } ]
  },
  "report": {
    "date": "",
    "pair": "USD/MXN",
    "headline": "",
    "headline_alternative": "",
    "commentary": ["", ""],
    "pulso": { "apertura": "", "variacion": "", "variacion_dir": "flat", "rango_dia": "", "tendencia": "", "tendencia_dir": "lateral" },
    "drivers": [ { "title": "MEXICO", "bullets": [""] } ],
    "lectura_clave": "",
    "escenario_central": "",
    "escenarios": [ { "pct": 52, "label": "", "direction": "lateral", "rango": "" } ],
    "en_la_mira": [ { "label": "", "category": "generic" } ]
  }
}`;

export function buildExtractMessagesEn(rawInput: string, approvedHeadline = ''): OpenAIMessage[] {
  const headlineRule = approvedHeadline
    ? `- headline: the source has an APPROVED Spanish headline: "${approvedHeadline}". Write its natural English rendering in wire-service style (same direction; not word-for-word). Keep every element of the approved headline (e.g., Fed focus); do not drop or add drivers. Example: "Peso firme, foco en minutas Fed" → "Mexican Peso Firms, with Fed Minutes in Focus". headline_alternative: a second, clearly different option that leads with the main driver named in the body, named specifically (not a generic "risk appetite").`
    : '- headline and headline_alternative: two fresh English headline options with clearly different framings (different lead driver or structure), both faithful to the facts; at least one names the main body driver specifically.';

  const system = `You are the FX desk editor of Xending's "Daily FX" for corporate clients. You receive a daily USD/MXN analysis written in Spanish (Markdown) and produce an English editorial JSON. You summarize and select; you NEVER invent figures, sources or data that are not in the text.

${FX_EN_STYLE_GUIDE}

${renderGlossaryForPrompt()}

STEP 1 — FACTS. Read the Spanish analysis only for facts and fill "facts":
- Figures copied exactly as in the source, with a decimal point. Calendar event names exactly as written in the source.
- pulso.apertura: open/current level (e.g. "16.94"). pulso.variacion: daily % change if stated (e.g. "-0.12%"), else "". variacion_dir: "up" if USD/MXN rises, "down" if it falls, "flat" if unchanged. rango_dia: "min - max". tendencia_dir: direction of the USD/MXN trend — "up" if USD/MXN is trending higher (peso weaker), "down" if trending lower (peso stronger), "lateral" if range-bound.
- date_iso: report date as YYYY-MM-DD ("" if not stated). close: previous close if stated.
- context_points: the causal chain of "Apertura y contexto" as terse English fact fragments.
- drivers: one entry per region with data ("mexico", "us", "global"); points = entity + figure.
- escenarios: pct (number), direction ("lateral"/"up"/"down", where "up" = USD/MXN higher), rango if stated. escenario_central: base-case range.
- en_la_mira: 3–5 items to watch, label in English (1–4 words); calendar event names stay exactly as in the source. category = ONE of "central_bank" (Banxico, Fed, monetary policy), "fiscal" (Treasury, debt, bonds, buybacks), "geopolitics" (Middle East, sanctions, war, region), "trade" (USMCA, tariffs, trade, customs), "energy" (oil, gas, energy, commodities), "data" (PCE, PMI, jobs, inflation, GDP, macro data), "generic" (anything else). Pick the most specific.

STEP 2 — WRITE. Write "report" in English using ONLY "facts". Do not translate Spanish sentences.
${headlineRule}
- headline and headline_alternative: 6–13 words each, Title Case, present tense, active voice (see HEADLINES). headline_alternative is never empty and never repeats headline.
- commentary: 1–2 paragraphs, 55–75 words in total (aim for about 70), built from context_points; first mention "Mexican peso".
- pulso: same values as facts.pulso; pulso.tendencia: "Uptrend", "Downtrend" or "Range-bound", matching tendencia_dir.
- drivers: 1–3 columns titled exactly "MEXICO", "U.S." or "GLOBAL BACKDROP", only regions with data. 2–4 bullets per column, 12 words or fewer each, figures included. Keep "vs" comparisons as in the source; do not add "expected"/"prior" unless stated.
- lectura_clave: 1–2 sentences, 40 words or fewer: the operational read for treasury teams with USD/MXN exposure. No personalized advice.
- escenario_central, escenarios: same as facts. en_la_mira: same as facts.
- date: "Mon D, YYYY" (e.g. "Aug 25, 2026"). pair: "USD/MXN".

Reply ONLY with valid JSON, no markdown, with "facts" FIRST and then "report", in exactly this shape:
${JSON_SHAPE}`;

  return [
    { role: 'system', content: system },
    {
      role: 'user',
      content: `Spanish source analysis (read for facts only; do not translate it line by line):\n\n${rawInput.trim()}`,
    },
  ];
}

/** Reparación dirigida: hechos + report EN + issues. Sin el MD (llamada chica). */
export function buildRepairMessagesEn(
  facts: FxEnFacts,
  report: FxDailyReport,
  headlineAlternative: string,
  violations: FxEnViolation[],
): OpenAIMessage[] {
  const system = `Fix an English FX note. Keep the facts identical. Fix ONLY the listed issues and keep everything else unchanged. Every figure must come from "facts", copied exactly. Return ONLY JSON: the full "report" object (same shape, including "headline_alternative"), no markdown.

${FX_EN_STYLE_GUIDE}`;
  const { nota: _nota, locale: _locale, ...editable } = report;
  const payload = {
    facts,
    report: { ...editable, headline_alternative: headlineAlternative },
    issues: violations.map((v) => `${v.field}: ${v.detail}`),
  };
  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(payload) },
  ];
}

function region(v: unknown): FxEnRegion {
  const s = str(v).toLowerCase();
  return s === 'mexico' || s === 'us' ? s : 'global';
}

/** Sanea `facts` con defaults seguros (tolera null/strings/basura). */
export function coerceFxEnFacts(data: unknown): FxEnFacts {
  const o = (data && typeof data === 'object' ? data : {}) as Record<string, unknown>;
  const p = (o.pulso && typeof o.pulso === 'object' ? o.pulso : {}) as Record<string, unknown>;
  const drivers = Array.isArray(o.drivers)
    ? (o.drivers as unknown[])
        .map((d) => {
          const dr = (d && typeof d === 'object' ? d : {}) as Record<string, unknown>;
          return { region: region(dr.region), points: toStrArray(dr.points) };
        })
        .filter((d) => d.points.length > 0)
    : [];
  const escenarios = Array.isArray(o.escenarios)
    ? (o.escenarios as unknown[]).map((e) => {
        const es = (e && typeof e === 'object' ? e : {}) as Record<string, unknown>;
        return { pct: toNum(es.pct) ?? 0, direction: dir(es.direction), rango: str(es.rango) || undefined };
      })
    : [];
  const enLaMira: FxMiraItem[] = Array.isArray(o.en_la_mira)
    ? (o.en_la_mira as unknown[])
        .map((it) => {
          if (typeof it === 'string') return { label: it.trim(), category: miraCat('generic') };
          const m = (it && typeof it === 'object' ? it : {}) as Record<string, unknown>;
          return { label: str(m.label), category: miraCat(m.category) };
        })
        .filter((m) => m.label)
        .slice(0, 5)
    : [];
  return {
    date_iso: str(o.date_iso),
    pulso: {
      apertura: str(p.apertura),
      variacion: str(p.variacion),
      variacion_dir: vdir(p.variacion_dir),
      rango_dia: str(p.rango_dia),
      tendencia_dir: dir(p.tendencia_dir),
    },
    close: str(o.close),
    support: toStrArray(o.support),
    resistance: toStrArray(o.resistance),
    context_points: toStrArray(o.context_points),
    drivers,
    bias: str(o.bias),
    escenario_central: str(o.escenario_central),
    escenarios,
    en_la_mira: enLaMira,
  };
}

// Tabla fija (sin Intl) para que el formato sea determinístico.
const EN_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-08-25' → 'Aug 25, 2026'; inválido → ''. */
export function formatEnDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return '';
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return '';
  return `${EN_MONTHS[month - 1]} ${day}, ${m[1]}`;
}

/** Título de columna normalizado a MEXICO / U.S. / GLOBAL BACKDROP. */
export function normalizeEnDriverTitle(title: string): string {
  const t = title.toUpperCase();
  if (/M[EÉ]X/.test(t)) return FX_EN_DRIVER_TITLES.mexico;
  if (/(^|[^A-Z])U\.?S\.?(A\.?)?($|[^A-Z])|UNITED STATES|ESTADOS UNIDOS|EE\.?\s?UU/.test(t)) {
    return FX_EN_DRIVER_TITLES.us;
  }
  return FX_EN_DRIVER_TITLES.global;
}

// Palabras que van en minúscula en Title Case (salvo la primera).
const EN_TITLE_SMALL_WORDS = new Set([
  'a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'as', 'at', 'by', 'in', 'of', 'on', 'to', 'via', 'vs',
  'with', 'from', 'amid', 'into',
  // Unidades: siempre en minúscula ("25 bp", forma del auto-fix de "pb").
  'bp', 'bps',
]);

/** Title Case de titulares EN; conserva siglas/mayúsculas internas (USD/MXN, U.S., PCE). */
export function titleCaseEn(text: string): string {
  let first = true;
  return text
    .split(/(\s+)/)
    .map((tok) => {
      if (!tok || /^\s+$/.test(tok)) return tok;
      const isFirst = first;
      first = false;
      if (!isFirst && EN_TITLE_SMALL_WORDS.has(tok.toLowerCase().replace(/[,;:.!?]+$/, ''))) {
        return tok.toLowerCase();
      }
      // Solo la primera letra; el resto queda igual (siglas intactas).
      return tok.replace(/\p{L}/u, (c) => c.toUpperCase());
    })
    .join('');
}

/** Alternativa determinística (solo si el LLM no dio una válida). Usa campos ya validados. */
export function buildFallbackHeadlineEn(report: FxDailyReport): string {
  const dirVerb = report.pulso.variacion_dir;
  const verb = dirVerb === 'down' ? 'Gains' : dirVerb === 'up' ? 'Weakens' : 'Holds Steady';
  const subject = `Mexican Peso ${verb}`;
  const focus = report.en_la_mira.map((m) => m.label.trim()).find(Boolean) ?? '';
  const candidates = [
    ...(focus ? [titleCaseEn(`${subject}, with ${focus} in Focus`)] : []),
    `${subject} Against the U.S. Dollar`,
    subject,
  ];
  return candidates.find((c) => !sameHeadline(c, report.headline)) ?? subject;
}

/**
 * true si `applyEnFacts` sobrescribe ese campo con `facts` (una reparación por LLM
 * no lo puede cambiar). Debe reflejar exactamente los fallbacks de applyEnFacts.
 */
export function isFactsOwnedField(field: string, facts: FxEnFacts): boolean {
  switch (field) {
    case 'pulso.apertura':
      return facts.pulso.apertura !== '';
    case 'pulso.variacion':
      return facts.pulso.variacion !== '';
    case 'pulso.rango_dia':
      return facts.pulso.rango_dia !== '';
    case 'escenario_central':
      return facts.escenario_central !== '';
    default:
      return field.startsWith('escenarios[') && facts.escenarios.length > 0;
  }
}

/**
 * Sobrescribe lo estructurado con `facts` (fuente de verdad); el LLM solo es dueño
 * de la prosa. Puro: no muta la entrada.
 */
export function applyEnFacts(report: FxDailyReport, facts: FxEnFacts): FxDailyReport {
  const fp = facts.pulso;
  const sourceEscenarios = facts.escenarios.length > 0 ? facts.escenarios : report.escenarios;
  const escenarios: FxScenario[] = sourceEscenarios
    .map((e) => ({
      pct: e.pct,
      label: FX_EN_SCENARIO_LABELS[e.direction],
      direction: e.direction,
      rango: e.rango,
    }))
    .sort((a, b) => b.pct - a.pct);

  const seen = new Set<string>();
  const drivers: FxDriver[] = [];
  for (const d of report.drivers) {
    const title = normalizeEnDriverTitle(d.title);
    if (seen.has(title)) continue;
    seen.add(title);
    drivers.push({ title, bullets: [...d.bullets] });
  }

  return {
    ...report,
    date: formatEnDate(facts.date_iso) || report.date,
    pair: 'USD/MXN',
    commentary: [...report.commentary],
    pulso: {
      ...report.pulso,
      apertura: fp.apertura || report.pulso.apertura,
      variacion: fp.variacion || report.pulso.variacion,
      variacion_dir: fp.variacion_dir,
      rango_dia: fp.rango_dia || report.pulso.rango_dia,
      // Texto fijo derivado de la dirección: siempre coincide con el compás.
      tendencia: FX_EN_TREND_LABELS[fp.tendencia_dir],
      tendencia_dir: fp.tendencia_dir,
    },
    drivers,
    escenario_central: facts.escenario_central || report.escenario_central,
    escenarios,
    en_la_mira: (report.en_la_mira.length > 0 ? report.en_la_mira : facts.en_la_mira).map((m) => ({ ...m })),
    nota: FX_DEFAULT_NOTA_EN,
    locale: 'en',
  };
}
