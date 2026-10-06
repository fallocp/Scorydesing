/**
 * "Global Market English" — guía de estilo + glosario del Daily Report FX en inglés.
 *
 * Vive en CÓDIGO (no en .agent/) porque la Edge Function no puede leer archivos del
 * repo en runtime. Se inyecta en el prompt del modo locale 'en' y alimenta el
 * post-check determinístico (fxEnglishPostCheck.ts).
 *
 * Audiencia: corporativa (tesorería, CFOs, importadores/exportadores, coberturas,
 * forwards, pagos transfronterizos), lectores internacionales de inglés como
 * segunda lengua. NO retail. Las transferencias familiares se omiten siempre.
 */

import type { FxScenarioDirection } from './fx-daily-types.ts';

/** Bloque listo para el prompt (en inglés, porque el modelo escribe en inglés). */
export const FX_EN_STYLE_GUIDE = `GLOBAL MARKET ENGLISH — Xending Daily FX (USD/MXN)

AUDIENCE
- Corporate readers with USD/MXN exposure: treasurers, CFOs, finance teams, importers and exporters, companies managing USD payables and receivables, hedging programs, forwards and cross-border payments.
- International professionals who use English as a working language (U.S., Japan, China, Korea, Europe, Latin America).
- Not retail investors. Leave out any point about household money transfers; it is not relevant to this audience.

REGISTER
- Concise FX desk note: Reuters/Bloomberg tone, but simpler. US English, about CEFR B2.
- Short sentences (about 20 words or fewer), active voice, one idea per sentence.
- Market jargon is fine: hawkish/dovish, risk-on/risk-off, carry trade, bp, support/resistance, range-bound, rate differential, positioning, flows.
- No idioms or colloquialisms (e.g. "took a beating", "rollercoaster", "on the ropes", "skyrocketed", "tanked").
- No hype, no certainty about the future, no investment advice.

WRITING METHOD
- Do NOT translate the Spanish text sentence by sentence. Read it only for facts, then write a fresh English note the way an FX desk analyst writes for corporate clients.
- Write each field to its own length target. Do not mirror the Spanish length or word order.

NAMING
- "Mexican peso" on first mention in the commentary, then "the peso" or "MXN".
- The pair is always "USD/MXN" (never "dollar-peso").
- Banxico (not "Bank of Mexico"), the Fed, U.S., USMCA, Treasuries.
- Use "the open" / "the close" for session levels.

DIRECTION (critical)
- USD/MXN up = peso weaker. USD/MXN down = peso stronger.
- Phrase it without ambiguity: "USD/MXN rose 0.6% to 18.42", "the peso weakened past 18.40", "the peso strengthened", "the peso firmed".
- Price levels belong to USD/MXN, never to the peso (write "USD/MXN rose to 18.42", not "the peso rose to 18.42").
- Never write "the exchange rate improved/worsened". Use "upward/downward pressure on USD/MXN".
- Peso verbs: default to "strengthened/weakened"; "gained/slipped" and "firmed/softened" are fine variants, especially in headlines.
- "Appreciated/depreciated" is also correct. Use it for longer periods (week, month, year to date) and in the daily note when the day's move is 1% or more (e.g. "the peso appreciated 1.2%").

HEADLINES (wire-service style, Title Case)
- Lead with the peso: "Mexican Peso <verb> on <driver>, with <catalyst> in Focus" or "Mexican Peso <verb> as <driver>".
- Verbs: Gains, Firms, Strengthens, Holds Steady, Slips, Weakens. Prefer "Gains" over "Rises" for the peso. Do not default to "USD/MXN eases ..."; lead with USD/MXN only when a price level is the story.
- Name the driver specifically ("Latin American Risk Appetite", not just "Risk Appetite").
- Good: "Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus"; "Mexican Peso Firms, with Fed Minutes in Focus".
- Bad: "USD/MXN eases as risk appetite supports the peso" (pair-led, vague driver); "Peso firm, focus on Fed minutes" (word-for-word, no verb).

CALENDAR EVENTS
- Keep event names exactly as written in the source (NFP, CPI, PCE, FOMC, ISM, JOLTS, etc.). Do not translate, expand or rename them.

FORMATS AND FIGURES
- Decimal point (18.42), signed percent for changes (+0.6%, -0.12%), "25 bp", ranges "18.30 - 18.45", dates "Oct 2, 2026".
- Copy every figure exactly as it appears in the source. No rounding, no unit conversion, no computed numbers (no differences, averages or new percentages).`;

export interface FxGlossaryEntry {
  /** Término en español tal como aparece en el MD. */
  es: string;
  /** Formas correctas en inglés (vacío = omitir el tema). */
  en: string[];
  /** Calcos prohibidos. */
  banned?: string[];
}

export const FX_EN_GLOSSARY: readonly FxGlossaryEntry[] = [
  { es: 'tipo de cambio', en: ['USD/MXN', 'the exchange rate'], banned: ['change type', 'type of change'] },
  { es: 'peso mexicano', en: ['Mexican peso', 'the peso', 'MXN'] },
  { es: 'se apreció el peso / apreciación', en: ['the peso strengthened', 'the peso firmed', 'the peso gained', 'the peso appreciated (moves of 1% or more, or longer periods)'] },
  { es: 'se depreció el peso / depreciación', en: ['the peso weakened', 'the peso softened', 'the peso depreciated (moves of 1% or more, or longer periods)'] },
  { es: 'presión alcista', en: ['upward pressure on USD/MXN'], banned: ['bullish pressure on the peso'] },
  { es: 'presión bajista', en: ['downward pressure on USD/MXN'], banned: ['bearish pressure on the peso'] },
  { es: 'piso / techo', en: ['support', 'resistance'], banned: ['floor', 'roof', 'ceiling'] },
  { es: 'nivel psicológico', en: ['round-number level', 'key level'] },
  { es: 'apetito por riesgo', en: ['risk appetite', 'risk sentiment'], banned: ['risk hunger'] },
  { es: 'aversión al riesgo', en: ['risk aversion', 'risk-off'] },
  { es: 'Banco de México', en: ['Banxico'], banned: ['Bank of Mexico'] },
  { es: 'Reserva Federal', en: ['the Fed'] },
  { es: 'cierre / apertura', en: ['the close', 'the open'], banned: ['closure', 'opening'] },
  { es: 'cobertura', en: ['hedging', 'hedge'] },
  { es: 'importadores / exportadores', en: ['importers', 'exporters'] },
  { es: 'tesorería', en: ['treasury'] },
  { es: 'tasa de referencia / tasa objetivo', en: ['policy rate'] },
  { es: 'recorte / alza de tasas', en: ['rate cut', 'rate hike'] },
  { es: 'puntos base (pb)', en: ['bp'] },
  { es: 'postura restrictiva / acomodaticia', en: ['hawkish', 'dovish'] },
  { es: 'diferencial de tasas', en: ['rate differential'] },
  { es: 'bonos del Tesoro', en: ['Treasuries'] },
  { es: 'rendimientos', en: ['yields'] },
  { es: 'rango lateral / consolidación', en: ['range-bound', 'consolidation'] },
  { es: 'toma de utilidades', en: ['profit-taking'] },
  { es: 'flujos', en: ['flows'] },
  { es: 'aranceles', en: ['tariffs'] },
  { es: 'T-MEC', en: ['USMCA'] },
  { es: 'calificadoras', en: ['rating agencies'] },
  { es: 'Hacienda / SHCP', en: ["Mexico's Finance Ministry (SHCP)"] },
  { es: 'EE.UU.', en: ['U.S.'] },
];

/** Glosario en líneas "es → en1 / en2 (never: b1, b2)" para el prompt. */
export function renderGlossaryForPrompt(): string {
  const lines = FX_EN_GLOSSARY.map((g) => {
    const target = g.en.length > 0 ? g.en.join(' / ') : '(omit this topic; not relevant to corporate readers)';
    const banned = g.banned?.length ? ` (never: ${g.banned.join(', ')})` : '';
    return `- ${g.es} → ${target}${banned}`;
  });
  return `GLOSSARY (Spanish source term → English market usage)\n${lines.join('\n')}`;
}

export interface FxCalqueRule {
  id: string;
  /** Sin flag g (evita bugs de lastIndex); quien reemplace crea new RegExp(src, flags + 'g'). */
  pattern: RegExp;
  /** Presente ⇒ auto-fix determinístico; ausente ⇒ violación que requiere reescritura. */
  replacement?: string;
  /** Instrucción en inglés para el prompt de reparación. */
  hint: string;
}

export const FX_EN_CALQUE_RULES: readonly FxCalqueRule[] = [
  // --- auto-fix ---
  { id: 'dollar_peso', pattern: /\bdollar[-\s]peso\b|\bpeso[-\s]dollar\b/i, replacement: 'USD/MXN', hint: 'Write the pair as USD/MXN.' },
  { id: 'bank_of_mexico', pattern: /\b(?:the\s+)?Bank of Mexico\b|\bBanco de M[eé]xico\b/i, replacement: 'Banxico', hint: 'Use Banxico.' },
  { id: 'risk_hunger', pattern: /\brisk hunger\b|\bhunger for risk\b/i, replacement: 'risk appetite', hint: 'Use risk appetite.' },
  { id: 'change_type', pattern: /\b(?:the\s+)?(?:change type|type of change)\b/i, replacement: 'the exchange rate', hint: 'Use USD/MXN or the exchange rate.' },
  { id: 'ee_uu', pattern: /\bEE\.\s?UU\.?/, replacement: 'U.S.', hint: 'Use U.S.' },
  { id: 'tmec', pattern: /\bT-MEC\b/, replacement: 'USMCA', hint: 'Use USMCA.' },
  { id: 'pb', pattern: /(\d)\s?pb\b/i, replacement: '$1 bp', hint: 'Use bp for basis points.' },
  { id: 'decimal_comma', pattern: /(\d),(\d{1,2})(?!\d)/, replacement: '$1.$2', hint: 'Use a decimal point.' },
  // --- violaciones (requieren reescritura) ---
  {
    id: 'floor_roof',
    // "debt ceiling" es término legítimo de EE.UU.; no se marca.
    pattern: /\b(?:floor|roof)s?\b|(?<!\bdebt\s)\bceilings?\b/i,
    hint: 'Use support/resistance for USD/MXN levels (not floor/roof/ceiling).',
  },
  { id: 'closure_opening', pattern: /\bclosure\b|\bopening\b/i, hint: "Use 'the close' / 'the open' (not closure/opening)." },
  {
    id: 'rate_judgement',
    pattern: /\bexchange rate (?:improved|worsened|improves|worsens|got better|got worse)\b/i,
    hint: "Never say the exchange rate improved/worsened; state the USD/MXN move and whether the peso strengthened or weakened.",
  },
  {
    id: 'pressure_on_peso',
    pattern: /\b(?:bullish|bearish) pressure on the peso\b/i,
    hint: 'Use upward/downward pressure on USD/MXN.',
  },
  {
    id: 'peso_level',
    pattern:
      /\bpeso\s+(?:rose|rises|fell|falls|climbed|climbs|dropped|drops|jumped|jumps|slid|slides|increased|decreased)\s+(?:to|past|above|below|toward|towards|near)\s+\d/i,
    hint: 'Levels belong to USD/MXN: write "USD/MXN rose to 18.42" or "the peso weakened past 18.42".',
  },
  {
    id: 'remittances',
    pattern: /\bremittances?\b/i,
    hint: 'Corporate audience: drop the household money-transfer point entirely.',
  },
  {
    id: 'idiom',
    // Solo "tanked" (no "tanks": "oil tanks"/"think tanks" son legítimos).
    pattern: /\btook a beating\b|\brollercoaster\b|\bon the ropes\b|\bskyrocket\w*|\btanked\b/i,
    hint: 'Replace the idiom with plain market language (rose, fell, weakened, strengthened).',
  },
  {
    id: 'spanish_residue',
    pattern: /\b(?:tipo de cambio|peso mexicano|Reserva Federal|apertura|cierre|soporte|resistencia|alcista|bajista|remesas)\b/i,
    hint: 'Spanish words left in the text: rewrite in English (calendar event names may stay as in the source).',
  },
];

/** Títulos fijos de columnas de drivers en inglés (enrutan bien en driverKitId del HTML). */
export const FX_EN_DRIVER_TITLES = { mexico: 'MEXICO', us: 'U.S.', global: 'GLOBAL BACKDROP' } as const;

/** Etiquetas de escenario por sesgo (inequívocas para lectores de segunda lengua). */
export const FX_EN_SCENARIO_LABELS: Record<FxScenarioDirection, string> = {
  lateral: 'Range-bound',
  up: 'USD/MXN higher',
  down: 'USD/MXN lower',
};

/** Etiqueta fija de "Tendencia" según la dirección de USD/MXN (no la escribe el LLM). */
export const FX_EN_TREND_LABELS: Record<FxScenarioDirection, string> = {
  lateral: 'Range-bound',
  up: 'Uptrend',
  down: 'Downtrend',
};
