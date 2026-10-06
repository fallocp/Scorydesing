# Implementation Plan — Daily Report FX: English mode (native, not literal)

## Global constraints (every item)
- Do NOT git push, do NOT commit, do NOT deploy Supabase functions, do NOT install dependencies.
- The working tree already has UNCOMMITTED work in these same files (headline options feature in
  `fx-daily-types.ts`, `fxDailyExtractor.ts`, `generate-fx-daily/index.ts`, `useFxDaily.ts`, `FxDailyPanel.tsx`).
  Edit on top of it; never revert/checkout those files.
- Temp logs only with prefix `🔍 DEBUG-TEMP:`; remove them all before finishing.
- Code comments may be Spanish; UI labels stay Spanish. DB untouched (no schema change).
- Spanish mode (`locale` absent or `'es'`) must behave exactly as today: `buildExtractMessages` and
  `coerceFxDaily` logic are NOT modified (only `export` keywords added to helpers), the ES branch in
  `index.ts` keeps the same single LLM call, same params, same headline logic.
- Image prompt / AI-baked scene: unchanged. `buildFxDailyImagePrompt` is not touched; EN report keeps `pair = 'USD/MXN'`.

## Findings from exploration (grounding)
- `supabase/functions/generate-fx-daily/index.ts`: auth → membership → ONE `callOpenAI` (`buildExtractMessages`,
  `max_completion_tokens: 3000`, `temperature: 0.3`) → `parseModelJson` → `coerceFxDaily` → approved headline
  (from MD `# ... (Titular)`) overrides `report.headline`; returns `{ report, headline_options, image_prompt }`.
- Structured extraction already exists in the ES schema (`pulso.{apertura,variacion,variacion_dir,rango_dia,tendencia_dir}`,
  `escenario_central`, `escenarios[{pct,direction,rango}]`, `en_la_mira[{label,category}]`). The EN facts block REUSES these keys.
- Shared modules live in `supabase/functions/_shared/fx-daily/` (`fx-daily-types.ts`, `fxDailyExtractor.ts`, `fxDailyImagePrompt.ts`).
  New EN modules go there too (same pattern; Edge Functions import `../_shared/...` with `.ts` extensions).
- Frontend: `src/hooks/useFxDaily.ts` (`processMd` invokes with `{ business_id, raw_input }`), `src/components/design-studio/FxDailyPanel.tsx`
  (Paso 1 card = textarea + "Procesar con el agente"; Modelo/Calidad come from `ImageGenerationControls`), composition in
  `src/utils/design-studio/buildFxDailyHtml.ts`.
- Baked Spanish labels in `buildFxDailyHtml.ts`: `<html lang="es">`, `PULSO DE MERCADO`, `APERTURA`, `RANGO DEL DÍA`, `TENDENCIA`,
  `LO QUE MUEVE AL MERCADO`, `LECTURA CLAVE` (+ img alt `'Lectura clave'`), `ESCENARIOS`, `EN LA MIRA`, footer prefix `Nota: `.
  `Daily FX` and `XENDING` are already language-neutral. `report.nota` = `FX_DEFAULT_NOTA` (Spanish) set by `coerceFxDaily`.
  Driver card icon chosen by `driverKitId(title)` regex (`/MÉX|MEX/` → flag_mx, `/EE|US|U\.S|ESTADOS/` → flag_us, else globe).
  `report.date` (e.g. `25 AGO 2026`) and `escenarios[].label` (`Lateral/Alcista/Bajista`) are also visible Spanish text.
  `escenario_central` is NOT rendered in the HTML (editor only).
- Tests: vitest (`npm test` = `vitest --run`, node env, `@` alias) already runs `supabase/functions/_shared/**/__tests__/*.test.ts`
  (e.g. `_shared/__tests__/parseModelJson.test.ts` imports with `from 'vitest'`). Hook tests mock react/supabase like
  `src/hooks/__tests__/newsFxSharedGeneration.test.ts`. ESLint only covers `src/`. Deno 2.6.5 is installed; no deno.json for this function.
- `supabase.functions.invoke` on non-2xx returns `data = null` and a `FunctionsHttpError` whose `context` is the `Response`; the hook
  currently cannot show the server `message` for 4xx/5xx (no code in `src/` reads `error.context`).

## Design decisions (made here, with rationale)
1. **Locale contract.** `export type FxLocale = 'es' | 'en'`. Request gets optional `locale` (default `'es'`); invalid value → 400
   `parse_error`. `FxDailyReport` gets optional `locale?: FxLocale` (absent ⇒ `'es'`, so old/edited reports keep working). The HTML
   builder reads `report.locale`, so labels always follow the report's language, not the current selector.
2. **One LLM call for EN (facts-first in a single response), +1 cheap repair call only on validation failure.** The EN prompt
   asks for JSON `{ "facts": {...}, "report": {...} }` with `facts` FIRST, so the model commits to language-neutral facts before
   writing; `report` must be written only from `facts`. Normal cost = same call count as ES (≈+30% output tokens). A separate
   extract call would double latency for little gain.
3. **Facts are the single source of truth for structured fields.** After coercion, `applyEnFacts` deterministically overwrites
   `date`, `pair`, `pulso.{apertura,variacion,variacion_dir,rango_dia,tendencia_dir}`, `escenario_central`, `escenarios`
   (pct/direction/rango + deterministic EN label), normalizes driver titles, sets `nota` EN and `locale: 'en'`. The LLM only owns prose.
4. **Deterministic post-check (no LLM):** (a) auto-fix safe calques by regex replacement; (b) violations = number not present in
   source MD, banned calque/idiom/Spanish residue, headline direction contradicting `variacion_dir`, hard length bounds.
5. **Failure policy: ONE targeted repair retry, then 422.** Repair sends only `facts` + current EN `report` + violation hints (no MD),
   so it is small and cheap; a plain error would force the user to re-run the full (bigger) call anyway. If the repaired output still
   has violations → HTTP 422 `{ error: 'en_validation_failed', message, violations }` (financial-accuracy rule: never ship a number that
   isn't in the source). Timeouts: main EN call `timeoutMs: 90_000`, repair `45_000`. (Corrected in iteration 2: `callOpenAI` retries once after a
   timeout/network error with a 2 s backoff, so the worst case is (90+2+90)+(45+2+45) ≈ 274 s, the same pattern as the ES path
   at 120+2+120 ≈ 242 s. The normal path is one call that answers in time.) The repair is skipped (422 directly) when any violation
   is on a field `applyEnFacts` sets from `facts`, since a repair cannot change it.
6. **Style guide lives in code** at `supabase/functions/_shared/fx-daily/fxEnglishStyleGuide.ts` (Edge Functions can't read `.agent/`).
   No markdown mirror (single source of truth; avoids drift; markdown not explicitly requested).
7. **EN fixed vocab:** driver titles `MEXICO` / `U.S.` / `GLOBAL BACKDROP` (all route correctly through existing `driverKitId`);
   scenario labels by direction `lateral → 'Range-bound'`, `up → 'USD/MXN higher'`, `down → 'USD/MXN lower'` (unambiguous for
   second-language readers); date `Mon D, YYYY` (e.g. `Aug 25, 2026`) built deterministically from `facts.date_iso`.
8. **Approved headline in EN:** the Spanish approved headline can't be used verbatim. The LLM writes `report.headline` = natural English
   rendering of the approved headline (same drivers/direction, not word-for-word) and `report.headline_alternative`. Options returned:
   `[{headline,'approved'}, {headline_alternative,'alternative'}]` (dedup), or `[{headline,'alternative'}]` if there's no approved headline.
9. **Clear errors in UI:** `useFxDaily` reads `fnError.context` JSON `message` when `data` is null, so the 422 message is visible
   (also makes ES server errors more specific; no other behavior changes).
10. **Performance (rendimiento-y-escalabilidad):** input is one MD (~5–50 KB) per request; post-check is linear regex scans + `Set`
    lookups (no nested scans), sub-millisecond; 10× MD ⇒ linear CPU and LLM tokens. No DB writes; if cut mid-request nothing is
    persisted and the user re-runs (same as today). Cost: ES 1 call (unchanged); EN 1 call, worst case 2.

---

- [ ] 1. Baseline + shared types/helpers for locale.
      Run baseline first and record results in the PR notes/findings: `npm run type-check`, `npm test`,
      `deno check supabase/functions/generate-fx-daily/index.ts` (so pre-existing failures aren't attributed to this work).
      In `fx-daily-types.ts`: add `export type FxLocale = 'es' | 'en';`; add `locale?: FxLocale` to `FxDailyReport` (doc: absent = 'es')
      and to `GenerateFxDailyRequest`; add
      `export const FX_DEFAULT_NOTA_EN = 'Past performance is not indicative of future results. This material is for informational purposes only and does not constitute investment advice.';`
      In `fxDailyExtractor.ts`: only add `export` to the existing helpers `str`, `toNum`, `toStrArray`, `vdir`, `dir`, `miraCat`
      (no logic change) so the EN module reuses them.
      Files: supabase/functions/_shared/fx-daily/fx-daily-types.ts, supabase/functions/_shared/fx-daily/fxDailyExtractor.ts
      Verify: `npm run type-check` passes (same as baseline); `deno check supabase/functions/generate-fx-daily/index.ts` same as baseline.

- [ ] 2. Style guide module + deterministic post-check module, with tests.
      a) Create `supabase/functions/_shared/fx-daily/fxEnglishStyleGuide.ts` exporting:
      ```ts
      export const FX_EN_STYLE_GUIDE: string;            // prompt-ready block, text below
      export interface FxGlossaryEntry { es: string; en: string[]; banned?: string[] }
      export const FX_EN_GLOSSARY: readonly FxGlossaryEntry[];
      export function renderGlossaryForPrompt(): string; // lines: "es → en1 / en2 (never: b1, b2)"
      export interface FxCalqueRule {
        id: string;
        pattern: RegExp;      // stored WITHOUT the g flag (avoid lastIndex bugs); callers build new RegExp(src, flags+'g') to replace
        replacement?: string; // present ⇒ deterministic auto-fix; absent ⇒ violation that needs rewrite
        hint: string;         // English instruction used in the repair prompt
      }
      export const FX_EN_CALQUE_RULES: readonly FxCalqueRule[];
      export const FX_EN_DRIVER_TITLES = { mexico: 'MEXICO', us: 'U.S.', global: 'GLOBAL BACKDROP' } as const;
      export const FX_EN_SCENARIO_LABELS: Record<FxScenarioDirection, string>; // lateral 'Range-bound', up 'USD/MXN higher', down 'USD/MXN lower'
      ```
      FX_EN_STYLE_GUIDE content (English, "Global Market English — Xending Daily FX (USD/MXN)"):
      - AUDIENCE: corporate readers with USD/MXN exposure — treasurers, CFOs, finance teams, importers/exporters, companies managing
        payables/receivables, hedging programs, forwards, cross-border payments. International professionals who use English as a working
        language (U.S., Japan, China, Korea, Europe, LatAm). Not retail. Never mention remittances.
      - REGISTER: concise FX desk note, Reuters/Bloomberg tone but simpler; US English, ~CEFR B2; short sentences (≤ ~20 words), active
        voice, one idea per sentence. Jargon OK: hawkish/dovish, risk-on/risk-off, carry trade, bp, support/resistance, range-bound, rate
        differential, positioning, flows. No idioms/colloquialisms ("took a beating", "rollercoaster", "on the ropes", "skyrocketed",
        "tanked"). No hype, no certainty about the future, no investment advice.
      - WRITING METHOD: do not translate the Spanish sentence by sentence; read it for facts, then write a fresh English note as an FX desk
        analyst would for corporate clients. Write each field to its length target, do not mirror Spanish length or word order.
      - NAMING: "Mexican peso" on first mention in the commentary, then "the peso" or "MXN"; pair always "USD/MXN" (never "dollar-peso");
        Banxico (not "Bank of Mexico"); the Fed; U.S.; USMCA.
      - DIRECTION (critical): USD/MXN up = peso weaker; USD/MXN down = peso stronger. Phrase unambiguously ("USD/MXN rose 0.6% to 18.42",
        "the peso weakened past 18.40", "the peso strengthened/firmed"). Levels belong to USD/MXN, never "the peso rose to 18.42". Never
        "the exchange rate improved/worsened"; use "upward/downward pressure on USD/MXN".
      - CALENDAR EVENTS: keep event names exactly as written in the source (NFP, CPI, PCE, FOMC, ISM, JOLTS…); do not translate/expand.
      - FORMATS: decimal point (18.42), signed % for changes (+0.6%, -0.12%), "25 bp", ranges "18.30 - 18.45", dates "Oct 2, 2026".
        Copy every figure exactly as in the source: no rounding, no unit conversion, no computed numbers (differences, averages).
      FX_EN_GLOSSARY (ES → EN; banned): tipo de cambio → USD/MXN, the exchange rate (never: change type, type of change); peso mexicano →
      Mexican peso, the peso, MXN; se apreció el peso/apreciación → the peso strengthened, firmed, gained; se depreció/depreciación → the
      peso weakened, softened; presión alcista → upward pressure on USD/MXN (never: bullish pressure on the peso); presión bajista →
      downward pressure on USD/MXN; piso/techo → support/resistance (never: floor, roof, ceiling); nivel psicológico → round-number level,
      key level; apetito por riesgo → risk appetite, risk sentiment (never: risk hunger); aversión al riesgo → risk aversion, risk-off;
      Banco de México → Banxico (never: Bank of Mexico); Reserva Federal → the Fed; cierre/apertura → close/open (never: closure, opening);
      cobertura → hedging, hedge; importadores/exportadores → importers/exporters; tesorería → treasury; tasa de referencia/objetivo →
      policy rate; recorte/alza de tasas → rate cut/rate hike; puntos base (pb) → bp; postura restrictiva/acomodaticia → hawkish/dovish;
      diferencial de tasas → rate differential; bonos del Tesoro → Treasuries; rendimientos → yields; rango lateral/consolidación →
      range-bound, consolidation; toma de utilidades → profit-taking; flujos → flows; aranceles → tariffs; T-MEC → USMCA; calificadoras →
      rating agencies; Hacienda/SHCP → Mexico's Finance Ministry (SHCP); EE.UU. → U.S.; remesas → (do not mention).
      FX_EN_CALQUE_RULES (all case-insensitive unless noted):
      - auto-fix: `dollar_peso` /\bdollar[-\s]peso\b|\bpeso[-\s]dollar\b/ → `USD/MXN`; `bank_of_mexico` /\b(?:the\s+)?Bank of Mexico\b|\bBanco de M[eé]xico\b/ → `Banxico`;
        `risk_hunger` /\brisk hunger\b|\bhunger for risk\b/ → `risk appetite`; `change_type` /\b(?:the\s+)?(?:change type|type of change)\b/ → `the exchange rate`;
        `ee_uu` /\bEE\.\s?UU\.?/ (case-sensitive) → `U.S.`; `tmec` /\bT-MEC\b/ → `USMCA`; `pb` /(\d)\s?pb\b/ → `$1 bp`;
        `decimal_comma` /(\d),(\d{1,2})(?!\d)/ → `$1.$2`.
      - violations: `floor_roof` /\b(?:floor|roof|ceiling)s?\b/ ("Use support/resistance for USD/MXN levels"); `closure_opening`
        /\bclosure\b|\bopening\b/ ("Use 'the close' / 'the open'"); `rate_judgement` /\bexchange rate (?:improved|worsened|improves|worsens|got better|got worse)\b/;
        `pressure_on_peso` /\b(?:bullish|bearish) pressure on the peso\b/ ("Use upward/downward pressure on USD/MXN"); `peso_level`
        /\bpeso\s+(?:rose|rises|fell|falls|climbed|climbs|dropped|drops|jumped|jumps|slid|slides|increased|decreased)\s+(?:to|past|above|below|toward|towards|near)\s+\d/
        ("Levels belong to USD/MXN"); `remittances` /\bremittances?\b/ ("Corporate audience: do not mention remittances"); `idiom`
        /\btook a beating\b|\brollercoaster\b|\bon the ropes\b|\bskyrocket\w*|\btank(?:ed|s)\b/; `spanish_residue`
        /\b(?:tipo de cambio|peso mexicano|Reserva Federal|apertura|cierre|soporte|resistencia|alcista|bajista|remesas)\b/.
      b) Create `supabase/functions/_shared/fx-daily/fxEnglishPostCheck.ts` (pure, no Deno/LLM; doc-comment: "asume report ya coercionado"):
      ```ts
      export type FxEnViolationRule = 'number_mismatch' | 'calque' | 'direction' | 'length';
      export interface FxEnViolation { field: string; rule: FxEnViolationRule; detail: string } // field e.g. 'commentary[0]', 'drivers[1].bullets[2]'
      export function extractNumbers(text: string): number[];
      export function buildSourceNumberSet(rawInput: string): Set<string>;
      export function applyCalqueFixes(report: FxDailyReport, headlineAlternative?: string): { report: FxDailyReport; headlineAlternative: string };
      export function checkHeadlineDirection(headline: string, dir: FxVariacionDir): FxEnViolation | null;
      export function validateEnReport(report: FxDailyReport, sourceNumbers: Set<string>, headlineAlternative?: string): FxEnViolation[];
      ```
      Exact rules:
      - Number tokens: regex `/(?<![A-Za-z\d.,])[-+]?\d+(?:[.,]\d+)*/g` (skips `Q2`, `G7`, `T10`). Normalize: if `/^\d{1,3}(,\d{3})+(\.\d+)?$/`
        strip commas (thousands); else if it has a single comma and no dot, comma → dot (Spanish decimal); `parseFloat`, `Math.abs`,
        key = `String(Number(n.toFixed(6)))` (so `0.60` ≡ `0.6`, `-0.12%` ≡ `0.12`). Source set = keys of all tokens in the raw MD.
      - Number parity applies to every prose field (headline, headline_alternative, commentary[], pulso.tendencia, drivers[].title,
        drivers[].bullets[], lectura_clave, en_la_mira[].label) AND structured fields (pulso.apertura, pulso.variacion, pulso.rango_dia,
        escenario_central, escenarios[].pct, escenarios[].rango). Excluded: `date`, `nota`, `pair`. Each key not in the source set →
        `number_mismatch` with the offending token.
      - Calques: run every non-auto-fix rule over the prose fields → `calque` violation with the rule hint. Auto-fix rules run first in
        `applyCalqueFixes` over the same prose fields + structured string fields (returns a new object; does not mutate input).
      - Direction (headline only, to avoid false positives on intraday narrative): `dir === 'up'` → violation if headline matches
        `/\bUSD\/MXN\s+(?:fell|falls|declined|declines|dropped|drops|eased|eases|slipped|slips)\b|\bpeso\s+(?:strengthen\w*|firm\w*|appreciat\w*|gain\w*|rall\w*|recover\w*)/i`;
        `dir === 'down'` → violation if headline matches
        `/\bUSD\/MXN\s+(?:rose|rises|climbed|climbs|jumped|jumps|advanced|advances)\b|\bpeso\s+(?:weaken\w*|soften\w*|depreciat\w*|slid|slides|slips|loses|lost)/i`;
        `'flat'` → no check.
      - Length (hard layout bounds; prompt targets are lower): headline ≤ 14 words; commentary total ≤ 90 words; each bullet ≤ 18 words;
        lectura_clave ≤ 50 words; pulso.tendencia ≤ 4 words; each en_la_mira label ≤ 5 words; headline non-empty.
      c) Tests `supabase/functions/_shared/fx-daily/__tests__/fxEnglishPostCheck.test.ts` (vitest, pattern of `_shared/__tests__/parseModelJson.test.ts`):
      extractNumbers (`'USD/MXN rose 0.6% to 18.42'` → [0.6, 18.42]; `Q2`/`G7` ignored; `1,250.5` → 1250.5; `18,42` → 18.42; `-0.12%` → 0.12);
      number parity (number absent in source → violation with field path; `0.60%` vs source `0.6%` → none; date/nota excluded);
      each auto-fix (`dollar-peso`, `Bank of Mexico`, `risk hunger`, `change type`, `EE.UU.`, `T-MEC`, `25 pb`, `18,42`) and input not mutated;
      each violation rule (floor/roof/ceiling, closure/opening, `exchange rate improved`, `bullish pressure on the peso`, `the peso rose to 18.42`,
      remittances, rollercoaster, `tipo de cambio`); no false positives on `at the open`, `the close`, `support at 18.30`, `risk appetite`,
      `reopening`; checkHeadlineDirection (up + "Peso firms…" → violation; up + "Peso weakens past 18.40" → null; down + "USD/MXN climbs…" →
      violation; flat → null); length bounds; perf: 50 KB synthetic MD + full report → `buildSourceNumberSet` + `validateEnReport` < 50 ms
      (`performance.now()`).
      Files: supabase/functions/_shared/fx-daily/fxEnglishStyleGuide.ts, supabase/functions/_shared/fx-daily/fxEnglishPostCheck.ts,
      supabase/functions/_shared/fx-daily/__tests__/fxEnglishPostCheck.test.ts
      Verify: `npm test -- supabase/functions/_shared/fx-daily` passes; `deno check supabase/functions/_shared/fx-daily/fxEnglishPostCheck.ts` passes.

- [ ] 3. EN extractor: facts-first prompt, repair prompt, facts coercion and deterministic assembly, with tests. (Depends on 1–2.)
      Create `supabase/functions/_shared/fx-daily/fxDailyExtractorEn.ts`:
      ```ts
      export interface FxEnFacts {
        date_iso: string;                        // 'YYYY-MM-DD' or ''
        pulso: Pick<FxPulso, 'apertura' | 'variacion' | 'variacion_dir' | 'rango_dia' | 'tendencia_dir'>;
        close: string;                           // previous close if stated, else ''
        support: string[]; resistance: string[];
        context_points: string[];                // causal chain of "Apertura y contexto" as terse English fact fragments
        drivers: { region: 'mexico' | 'us' | 'global'; points: string[] }[]; // entity + figure, figures copied exactly
        bias: string;                            // short outlook/bias statement
        escenario_central: string;
        escenarios: { pct: number; direction: FxScenarioDirection; rango?: string }[];
        en_la_mira: FxMiraItem[];                // label in English; calendar event names EXACTLY as in the source
        calendar_events: string[];               // exact names from the source
      }
      export function buildExtractMessagesEn(rawInput: string, approvedHeadline?: string): OpenAIMessage[];
      export function buildRepairMessagesEn(facts: FxEnFacts, report: FxDailyReport, headlineAlternative: string, violations: FxEnViolation[]): OpenAIMessage[];
      export function coerceFxEnFacts(data: unknown): FxEnFacts;   // uses exported helpers from fxDailyExtractor.ts
      export function formatEnDate(iso: string): string;           // '2026-08-25' → 'Aug 25, 2026'; invalid → ''
      export function normalizeEnDriverTitle(title: string): string; // /MEX/ → MEXICO; /U\.?S\.?|UNITED STATES|EE/ → U.S.; else GLOBAL BACKDROP
      export function applyEnFacts(report: FxDailyReport, facts: FxEnFacts): FxDailyReport;
      ```
      `buildExtractMessagesEn` system prompt (English): role = FX desk editor of Xending's Daily FX for corporate clients; then
      `FX_EN_STYLE_GUIDE` + `renderGlossaryForPrompt()`; then "STEP 1 — FACTS: read the Spanish analysis only for facts and fill `facts`
      (figures copied exactly, decimal point, event names exactly as written; `variacion_dir` 'up' if USD/MXN rises, 'down' if it falls,
      'flat'; `tendencia_dir` same semantics as today: 'up' positive, 'down' negative, 'lateral' neutral/range). STEP 2 — WRITE: write
      `report` in English using ONLY `facts`; do not translate Spanish sentences." Field targets: headline 6–12 words, one sentence, present
      tense, active voice; commentary 1–2 paragraphs, 55–75 words total (aim ~70), based on `context_points`, first mention "Mexican peso";
      pulso.tendencia 1–3 words (e.g. "Range-bound", "Peso-supportive"); drivers 1–3 columns, titles exactly "MEXICO" / "U.S." /
      "GLOBAL BACKDROP", only regions with data, 2–4 bullets ≤ 12 words each, keep "vs" comparisons as in source (don't add
      "expected"/"prior" unless stated); lectura_clave 1–2 sentences ≤ 40 words, operational read for treasury teams with USD/MXN exposure,
      no personalized advice; en_la_mira 3–5 items, 1–4 words, category same enum/definitions as the ES prompt. Approved headline rule (when
      provided): `headline` = natural English rendering of the approved Spanish headline (same drivers and direction, not word-for-word);
      `headline_alternative` = a second faithful option. Without it: `headline` + `headline_alternative` both fresh. JSON shape with `facts`
      key FIRST, then `report` (same keys as the ES schema + `headline_alternative`). User message:
      `Spanish source analysis (read for facts only; do not translate it line by line):\n\n${rawInput.trim()}`.
      `buildRepairMessagesEn`: system = "Fix an English FX note. Keep facts identical. Fix ONLY the listed issues; keep everything else
      unchanged. Return ONLY JSON: the full `report` object (same shape, incl. headline_alternative)." + style guide; user = JSON of
      `{ facts, report, issues: violations.map(v => \`${v.field}: ${v.detail}\`) }`. No raw MD (keeps the call small).
      `applyEnFacts` (pure): overwrites `date` (= `formatEnDate(facts.date_iso)` or keep report.date if ''), `pair = 'USD/MXN'`, pulso
      structured fields from facts (keeps prose `tendencia`), `escenario_central`, `escenarios` from facts sorted by pct desc with label
      `FX_EN_SCENARIO_LABELS[direction]`, driver titles via `normalizeEnDriverTitle` (drop duplicates by title keeping first),
      `nota = FX_DEFAULT_NOTA_EN`, `locale = 'en'`. Month table hardcoded (no Intl) for deterministic tests.
      Tests `supabase/functions/_shared/fx-daily/__tests__/fxDailyExtractorEn.test.ts`: system prompt contains style guide + glossary
      banned forms + "do not translate"; `"facts"` appears before `"report"` in the JSON shape; approved headline included only when given;
      user message contains the raw MD; repair messages contain issues and facts but NOT the raw MD; `coerceFxEnFacts` tolerates garbage
      (null/strings) with safe defaults; `formatEnDate` ('2026-08-25' → 'Aug 25, 2026', '2026-10-02' → 'Oct 2, 2026', invalid → '');
      `applyEnFacts` overwrites structured fields, EN scenario labels + ordering, driver titles (`MÉXICO`/`Mexico` → MEXICO, `EE.UU.`/`US` →
      U.S., `Global` → GLOBAL BACKDROP), EN nota, locale 'en', does not mutate input.
      Files: supabase/functions/_shared/fx-daily/fxDailyExtractorEn.ts, supabase/functions/_shared/fx-daily/__tests__/fxDailyExtractorEn.test.ts
      Verify: `npm test -- supabase/functions/_shared/fx-daily` passes; `deno check supabase/functions/_shared/fx-daily/fxDailyExtractorEn.ts` passes.

- [ ] 4. EN pipeline orchestrator with injectable LLM caller, with tests. (Depends on 2–3.)
      Create `supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts`:
      ```ts
      export type FxLlmCaller = (opts: CallOpenAIOptions) => Promise<CallOpenAIResult>; // type-only import from ../callOpenAI.ts
      export type FxEnPipelineResult =
        | { ok: true; report: FxDailyReport; headline_options: FxHeadlineOption[]; repaired: boolean }
        | { ok: false; status: number; body: { error: string; message: string; violations?: FxEnViolation[] } };
      export async function runFxEnglishPipeline(rawInput: string, approvedHeadline: string, call: FxLlmCaller): Promise<FxEnPipelineResult>;
      ```
      Flow: `sourceNumbers = buildSourceNumberSet(rawInput)` once → call #1 (`buildExtractMessagesEn`, `max_completion_tokens: 4000`,
      `temperature: 0.3`, `timeoutMs: 90_000`) → `parseModelJson` → `facts = coerceFxEnFacts(data.facts)`,
      `report = coerceFxDaily(data.report)` (reuse ES sanitizer), `headlineAlternative = str(data.report?.headline_alternative)` →
      `applyEnFacts` → `applyCalqueFixes` → `validateEnReport`. If violations: call #2 (`buildRepairMessagesEn`, `max_completion_tokens: 2000`,
      `temperature: 0.2`, `timeoutMs: 45_000`) → parse → coerce report → `applyEnFacts` (same facts) → fixes → validate. Still violations →
      `{ ok:false, status:422, body:{ error:'en_validation_failed', message:'La versión en inglés no pasó la validación: ' + first 3 details joined by '; ', violations } }`.
      Never more than 2 calls. Errors: call failure → 502 `{ error: result.error, message: 'No se pudo procesar el análisis: …' }`;
      unparseable → 502 `model_output`; empty headline → 422 `empty_report` (same messages as ES). If the repair call itself fails/unparseable
      → 422 `en_validation_failed` with the first-pass violations. Headline options per design decision 8.
      Tests `supabase/functions/_shared/fx-daily/__tests__/fxDailyEnglishPipeline.test.ts` with a fake `call` (vi.fn returning canned JSON):
      clean first response → ok, 1 call, `report.locale === 'en'`, options approved+alternative; only auto-fixable issues → 1 call;
      first response with `floor` → 2nd call whose messages include the hint and not the raw MD → ok, `repaired: true`; both responses bad →
      422 `en_validation_failed`, exactly 2 calls; hallucinated number not in MD → repair triggered; call failure → 502; unparseable → 502;
      no approved headline → single 'alternative' option.
      Files: supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts, supabase/functions/_shared/fx-daily/__tests__/fxDailyEnglishPipeline.test.ts
      Verify: `npm test -- supabase/functions/_shared/fx-daily` passes; `deno check supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts` passes.

- [ ] 5. Wire locale into the edge function. (Depends on 4.)
      In `generate-fx-daily/index.ts`: after the `raw_input` check, `const locale = body.locale ?? 'es'; if (locale !== 'es' && locale !== 'en')
      return 400 { error:'parse_error', message:'Invalid locale' }`. After membership + `extractApprovedHeadline`: if `locale === 'en'` →
      `const en = await runFxEnglishPipeline(body.raw_input, approvedHeadline, callOpenAI); if (!en.ok) return jsonResponse(en.body, en.status);`
      respond `{ report: en.report, headline_options: en.headline_options, image_prompt: buildFxDailyImagePrompt(en.report) }`.
      Else: existing ES code path verbatim, only adding `report.locale = 'es'` before building the response. Update header comment (Spanish).
      Files: supabase/functions/generate-fx-daily/index.ts
      Verify: `deno check supabase/functions/generate-fx-daily/index.ts` passes (needs network for remote std/esm imports; if it fails only
      on remote fetch, record it and compare with the baseline from item 1); `npm test -- supabase/functions/_shared/fx-daily` still passes.

- [ ] 6. Locale-aware labels in the HTML composer, with tests. (Depends on 1.)
      In `buildFxDailyHtml.ts` add `const FX_HTML_LABELS: Record<FxLocale, {...}>`:
      es = { lang:'es', pulso:'PULSO DE MERCADO', apertura:'APERTURA', rango:'RANGO DEL DÍA', tendencia:'TENDENCIA',
      drivers:'LO QUE MUEVE AL MERCADO', lectura:'LECTURA CLAVE', lecturaAlt:'Lectura clave', escenarios:'ESCENARIOS', mira:'EN LA MIRA', nota:'Nota:' };
      en = { lang:'en', pulso:'MARKET PULSE', apertura:'OPEN', rango:'DAY RANGE', tendencia:'TREND', drivers:'MARKET DRIVERS',
      lectura:'KEY TAKEAWAY', lecturaAlt:'Key takeaway', escenarios:'SCENARIOS', mira:'WATCHLIST', nota:'Note:' }.
      `const L = FX_HTML_LABELS[report.locale ?? 'es'] ?? FX_HTML_LABELS.es;` and replace each hardcoded label (pulsoCols labels,
      section titles, card mini-labels, kitSlot alt, footer prefix `${L.nota} `, `<html lang="${L.lang}">`). ES output must stay identical.
      Do not change `driverKitId` (EN titles already route: MEXICO→flag_mx, U.S.→flag_us, GLOBAL BACKDROP→entorno_globe).
      Tests `src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts` (vitest): fixture report without `locale` → contains every ES label
      and `lang="es"`; `locale:'en'` → contains every EN label, `lang="en"`, and none of the ES section labels; EN driver titles render the
      flag_mx / flag_us / entorno_globe kit URLs respectively.
      Files: src/utils/design-studio/buildFxDailyHtml.ts, src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts
      Verify: `npm test -- src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts` passes; `npm run type-check` passes.

- [ ] 7. Hook + UI selector + clear server errors, with hook test. (Depends on 1, 6.)
      `useFxDaily.ts`: `const [locale, setLocale] = useState<FxLocale>('es')`; `processMd` body `{ business_id, raw_input, locale }`
      (add `locale` to its deps); return `locale, setLocale`; `reset()` keeps the selected locale. Error path: when `data` has no
      `report`, try `fnError.context` — if it's a `Response`, `await ctx.clone().json()` and use `body.message` when it's a string
      (small local helper `readFnErrorMessage`), else fall back to the current message chain.
      `FxDailyPanel.tsx`: in the "Paso 1 — MD" card, above the textarea, add `<Label htmlFor="fx-locale">Idioma del reporte</Label>` +
      native `<select id="fx-locale">` styled like the existing selects (`h-8 w-full rounded-md border border-input bg-background px-2 text-xs`),
      options `es` → `Español`, `en` → `English`, `disabled={fx.isProcessing}`, plus one helper line `text-xs text-muted-foreground`:
      "English: redacción nativa de mercado para lectores corporativos internacionales (no traducción literal)." Download filename:
      change `.replace(/\s+/g, '-')` to `.replace(/[\s,]+/g, '-')` (ES output identical; EN `Aug 25, 2026` → `aug-25-2026`).
      Tests `src/hooks/__tests__/useFxDaily.locale.test.ts`, mocking like `newsFxSharedGeneration.test.ts` (react, `../useActiveBusiness`,
      `../useDesignMockups`, `@/integrations/supabase/client`, `@/utils/design-studio/buildFxDailyHtml`, `@/utils/xendingDesign/canvasRenderer`):
      default `processMd` sends `locale: 'es'`; after `setLocale('en')` sends `locale: 'en'`; non-2xx with
      `error.context = new Response(JSON.stringify({ message: 'La versión en inglés no pasó la validación: X' }), { status: 422 })` →
      `error` state equals that message and returns false.
      Files: src/hooks/useFxDaily.ts, src/components/design-studio/FxDailyPanel.tsx, src/hooks/__tests__/useFxDaily.locale.test.ts
      Verify: `npm test -- src/hooks/__tests__/useFxDaily.locale.test.ts` passes; `npm run type-check` passes; `npm run lint` reports no new
      errors in the three touched `src/` files.

- [ ] 8. Final verification and cleanup.
      Run: `npm run type-check`; `npm run lint`; `npm test -- supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts`;
      full `npm test` (compare with item-1 baseline; no new failures); `deno check supabase/functions/generate-fx-daily/index.ts`.
      Search the repo diff for `DEBUG-TEMP` and remove any occurrence. `git status --short` to confirm only the intended files changed
      (plus the pre-existing uncommitted ones); do NOT commit, push, or deploy.
      Files: none new.
      Verify: all commands above pass (or match baseline with documented pre-existing failures); zero `DEBUG-TEMP` lines.

## Commands for the implementer
- Type-check (frontend): `npm run type-check`
- Lint (src only, per eslint.config.js): `npm run lint`
- Tests: `npm test -- supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts` and full `npm test`
- Deno type-check (edge): `deno check supabase/functions/generate-fx-daily/index.ts`

## Known gaps / assumptions
- No sample MD exists in the repo; tests use synthetic Spanish MD fixtures written in the format the ES prompt describes
  ("Apertura y contexto", escenarios con %, "Qué vigilar").
- `tendencia_dir` keeps its existing ambiguous "sentiment" semantics in both locales (not in scope to redefine).
- `escenario_central` isn't rendered in the HTML today; it's still filled from facts in EN for the editor.
- Calendar event names are kept as in the MD; if the MD writes an event in Spanish, it stays Spanish (per user instruction), and the
  `spanish_residue` rule only targets generic phrases, not event names.
