# Implementation Plan — Daily FX: EN headlines v2 + ES trend aligned with the pair

## Global constraints (every item)
- Work directly in `f:\ScoryDesign` (no worktree). The tree has UNCOMMITTED work in these same files: edit on top; never
  revert/checkout/stash. Do NOT commit, push, deploy Supabase functions or install dependencies. No DB changes.
- Temp logs only with prefix `🔍 DEBUG-TEMP:`; remove all before finishing.
- UI labels stay Spanish; code comments may be Spanish.
- ES behavior changes ONLY in: approved-headline parsing (double parens) and the trend (`tendencia_dir` semantics +
  deterministic `pulso.tendencia`). Everything else in the ES path stays identical (`index.ts` ES branch untouched).
- `deno check` always with `--no-lock`; `f:\ScoryDesign\deno.lock` must stay unchanged (`git status -- deno.lock` clean).

## Baseline (do not attribute to this work)
- Targeted vitest (`npx vitest --run supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts`):
  5 files / 103 tests PASS (run by the planner on the current tree, so the previous session's un-run EN DIRECTION rule and
  EN trend labels are already green).
- `npm run lint`: 603 problems (2 errors, 601 warnings) pre-existing. This plan touches no `src/` file, so the count must stay identical.
- Full `npm test`: 7 files / 15 tests failing pre-existing (demo-controller + 6 files in
  `f:\ScoryDesign\supabase\functions\_shared\desaing\__tests__`). Not ours.
- `npm run type-check` and `deno check --no-lock f:\ScoryDesign\supabase\functions\generate-fx-daily\index.ts`: exit 0 at baseline.

## Findings (grounding)
- Root cause of the single EN option (confirmed in code):
  (a) `extractApprovedHeadline` (`f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyExtractor.ts` line ~32) uses
  `/\(([^()\n]+)\)\s*$/`; on `((Peso firme, foco en minutas Fed))` the inner `(…)` is followed by `)` so `\)\s*$` fails → `''`.
  (b) `headlineOptions()` in `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyEnglishPipeline.ts` returns ONE option
  whenever there is no approved headline (it ignores `headline_alternative` entirely), and when approved it drops the alternative
  if empty/identical. Nothing validates that the alternative exists or differs. With (a) failing, (b) produced the single option.
- `checkHeadlineDirection` regexes in `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxEnglishPostCheck.ts` already use `/i`
  and `\bpeso\s+(?:…gain\w*|firm\w*…)`, so "Mexican Peso Gains/Firms" is already matched; only tests are missing. The
  alternative headline is NOT direction-checked today.
- `validateEnReport` existing tests assert exact violation lists without a headline alternative (e.g. `toEqual([])`), so
  alternative-presence/duplicate checks must live in a NEW function, not inside `validateEnReport`.
- ES path (`f:\ScoryDesign\supabase\functions\generate-fx-daily\index.ts`): with approved headline → `[approved, alternative]`
  (alternative dropped if empty/identical); without approved → ONE option by design (the ES prompt asks for a single headline).
  The double-paren fix alone restores 2 options for the user's ES case. Making ES always return 2 without an approved headline
  needs an ES prompt/schema change (new `headline_alternative` key) → NOT trivial/safe under "ES identical"; do not fix, report it.
- `coerceFxDaily` is only used at generation time (ES branch of `index.ts` and the EN pipeline's `assemble`); manual edits in
  `FxDailyPanel.tsx` go through `fx.updateReport` without coercion, so deterministic labeling does not break edits. In the EN
  path `applyEnFacts` overwrites `pulso.tendencia` with `FX_EN_TREND_LABELS` after coercion, so ES labels never leak into EN.
- Compass colors (Part B question): `f:\ScoryDesign\src\utils\design-studio\buildFxDailyHtml.ts` does NOT read `tendencia_dir`
  (or `variacion_dir`) and renders no compass/arrow/color for the trend: the TENDENCIA column only prints `report.pulso.tendencia`
  as text. So the HTML implies no semantics and must NOT be changed. The up/down color mapping exists only in:
  - `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fx-daily-types.ts` doc comment: "up verde / down rojo / lateral".
  - `f:\ScoryDesign\src\components\design-studio\FxDailyPanel.tsx` selects: Tendencia "Alcista (▲ verde)" / "Bajista (▼ rojo)" /
    "Lateral (↔ negro)"; Variación "Sube (▲ verde)" / "Baja (▼ rojo)" / "Lateral (– negro)".
  - `f:\ScoryDesign\src\utils\design-studio\fxDailyKit.ts` kit prompts: `compass_up` turquoise #2ED4C7 ("favorable"),
    `compass_down` coral #FF7A4A ("adverso"), `compass_flat` navy #0A2540 (kit objects defined but not placed by `buildFxDailyHtml`).
  OPEN QUESTION for the user (record in headline-v2.md, change nothing): with pair semantics "up" = USD/MXN higher = peso weaker
  is shown as green/turquoise "favorable" and "down" = peso stronger as red/coral "adverse". Keep (USD-buyer view), invert
  (peso view), or make neutral?

## Design decisions
1. Double-paren parsing: try `/\(\(\s*([^()\n]+?)\s*\)\)\s*$/` first, then today's single-paren regex. Single-paren titles give
   exactly today's result.
2. Two distinct EN options, no extra LLM call on the normal path: the prompt demands a second, clearly different headline;
   a new `checkHeadlineAlternative` flags empty / identical (normalized) / >14-word alternatives as violations on field
   `headline_alternative`, which go through the EXISTING single repair call. If after repair (or if the repair call fails) the ONLY
   remaining violations are on `headline_alternative`, the pipeline substitutes a deterministic fallback
   (`buildFallbackHeadlineEn`, e.g. "Mexican Peso Weakens, with NFP in Focus") instead of failing the whole report with 422.
   Rationale: an alternative headline is not worth rejecting a valid report; the fallback is built only from validated fields.
3. Options are always 2: approved → `[{headline,'approved'},{alt,'alternative'}]`; no approved → `[{headline,'alternative'},{alt,'alternative'}]`.
4. Title Case is enforced deterministically on EN `headline` and `headline_alternative` (`titleCaseEn`, applied in the pipeline
   after calque fixes, before validation) plus asked for in the prompt. Rationale: guarantees the format at zero cost.
5. Headline style lives in a short `HEADLINES` block inside `FX_EN_STYLE_GUIDE` (so the repair prompt sees it too), with the
   2 good / 2 bad examples. The approved-headline rule in `buildExtractMessagesEn` says "Keep every element of the approved
   headline (e.g., Fed focus)". Prompt growth ≈ 10 lines.
6. Alternative direction: `checkHeadlineDirection` gets an optional `field` param; `validateEnReport` also checks the alternative
   when present (field `headline_alternative`, recoverable via fallback per decision 2).
7. ES trend: `FX_ES_TREND_LABELS` constant in `fxDailyExtractor.ts` (mirrors `FX_EN_TREND_LABELS` in the style guide);
   `coerceFxDaily` sets `pulso.tendencia = FX_ES_TREND_LABELS[tendencia_dir]` ignoring LLM text; the ES prompt drops the
   `tendencia` instruction and the `"tendencia": ""` key from its JSON shape (ignored anyway; saves tokens).

---

- [ ] 1. ES extractor: double-paren approved headline + Part B trend (prompt, deterministic labels, types doc), with a new test file.
      a) `extractApprovedHeadline`:
      ```ts
      const heading = rawInput.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? '';
      // ((Titular)) primero; luego (Titular) como siempre.
      const m = heading.match(/\(\(\s*([^()\n]+?)\s*\)\)\s*$/) ?? heading.match(/\(([^()\n]+)\)\s*$/);
      return m?.[1]?.trim() ?? '';
      ```
      b) Add next to `MIRA_CATEGORIES`:
      `export const FX_ES_TREND_LABELS: Record<FxScenarioDirection, string> = { up: 'Al alza', down: 'A la baja', lateral: 'Lateral' };`
      c) `buildExtractMessages` pulso rule: replace
      `tendencia: en palabras breves (ej "lateral", "positiva para el peso"). tendencia_dir: sesgo de la tendencia como SENTIMIENTO — "up" si es positiva/alcista, "down" si negativa/bajista, "lateral" si neutral/de rango.`
      with
      `tendencia_dir: dirección de la tendencia de USD/MXN — "up" si USD/MXN tiende al alza (peso más débil), "down" si tiende a la baja (peso más fuerte), "lateral" si opera en rango.`
      and remove `"tendencia": "", ` from the `pulso` line of the JSON shape. Nothing else in the ES prompt changes.
      d) `coerceFxDaily`: compute `const tendenciaDir = dir(pulsoRaw.tendencia_dir);` and set
      `tendencia: FX_ES_TREND_LABELS[tendenciaDir], tendencia_dir: tendenciaDir` (comment: texto fijo desde la dirección del par,
      siempre coincide con el compás; el usuario lo puede editar después).
      e) `fx-daily-types.ts` `FxPulso` docs: `tendencia` → "Tendencia en palabras. Al generar se fija desde tendencia_dir
      (ES 'Al alza'/'A la baja'/'Lateral', EN 'Uptrend'/'Downtrend'/'Range-bound'); el usuario puede editarla.";
      `tendencia_dir` → "Dirección de la tendencia del par USD/MXN (elige el compás): up = al alza (peso más débil), down = a la baja
      (peso más fuerte), lateral = en rango." (drop "up verde / down rojo"; colors are the open question).
      f) New `f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxDailyExtractor.test.ts` (vitest, same style as
      `fxDailyExtractorEn.test.ts`, imports `from '../fxDailyExtractor'`):
      - `extractApprovedHeadline('# ANALISIS SEMANAL USD/MXN 5 OCT 26 ((Peso firme, foco en minutas Fed))\nbody')` → `'Peso firme, foco en minutas Fed'`;
        `'# X (( A ))   '` → `'A'`; single paren `'# Análisis USD/MXN (El peso cede ante datos de EE.UU.)'` → `'El peso cede ante datos de EE.UU.'`;
        no parens → `''`; only a `## Sub (x)` heading → `''`.
      - `buildExtractMessages(md)` system text: `not.toContain('positiva para el peso')`, `not.toContain('SENTIMIENTO')`,
        `toContain('"up" si USD/MXN tiende al alza (peso más débil)')`, `toContain('"down" si tiende a la baja (peso más fuerte)')`.
      - `coerceFxDaily({ headline: 'H', pulso: { tendencia: 'positiva para el peso', tendencia_dir: X } })` → `pulso.tendencia`
        is `'Al alza'` / `'A la baja'` / `'Lateral'` for `up` / `down` / `lateral` (it.each), and `'Lateral'` for garbage (`'foo'`, missing);
        `pulso.tendencia_dir` equals the coerced dir.
      Files: f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyExtractor.ts,
             f:\ScoryDesign\supabase\functions\_shared\fx-daily\fx-daily-types.ts,
             f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxDailyExtractor.test.ts (new)
      Verify: `npx vitest --run supabase/functions/_shared/fx-daily` → all pass (existing 3 files unchanged + new file).

- [ ] 2. EN headline style + prompt rules + deterministic helpers (`titleCaseEn`, `buildFallbackHeadlineEn`), with tests.
      a) `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxEnglishStyleGuide.ts`: append to `FX_EN_STYLE_GUIDE` (after DIRECTION,
      before CALENDAR EVENTS) exactly this block:
      ```
      HEADLINES (wire-service style, Title Case)
      - Lead with the peso: "Mexican Peso <verb> on <driver>, with <catalyst> in Focus" or "Mexican Peso <verb> as <driver>".
      - Verbs: Gains, Firms, Strengthens, Holds Steady, Slips, Weakens. Prefer "Gains" over "Rises" for the peso. Do not default to "USD/MXN eases ..."; lead with USD/MXN only when a price level is the story.
      - Name the driver specifically ("Latin American Risk Appetite", not just "Risk Appetite").
      - Good: "Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus"; "Mexican Peso Firms, with Fed Minutes in Focus".
      - Bad: "USD/MXN eases as risk appetite supports the peso" (pair-led, vague driver); "Peso firm, focus on Fed minutes" (word-for-word, no verb).
      ```
      b) `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyExtractorEn.ts` `buildExtractMessagesEn`:
      - approved `headlineRule` →
        `- headline: the source has an APPROVED Spanish headline: "${approvedHeadline}". Write its natural English rendering in wire-service style (same direction; not word-for-word). Keep every element of the approved headline (e.g., Fed focus); do not drop or add drivers. Example: "Peso firme, foco en minutas Fed" → "Mexican Peso Firms, with Fed Minutes in Focus". headline_alternative: a second, clearly different option that leads with the main driver from the body, named specifically (e.g., "Latin American risk appetite").`
      - no-approved `headlineRule` →
        `- headline and headline_alternative: two fresh English headline options with clearly different framings (different lead driver or structure), both faithful to the facts; at least one names the main body driver specifically.`
      - replace `- headline: 6–12 words, one sentence, present tense, active voice.` with
        `- headline and headline_alternative: 6–13 words each, Title Case, present tense, active voice (see HEADLINES). headline_alternative is never empty and never repeats headline.`
      c) Add to `fxDailyExtractorEn.ts` (exported, pure):
      ```ts
      // Palabras que van en minúscula en Title Case (salvo la primera).
      const EN_TITLE_SMALL_WORDS = new Set(['a','an','the','and','but','or','nor','for','as','at','by','in','of','on','to','via','vs','with','from','amid','into']);
      /** Title Case de titulares EN; conserva siglas/mayúsculas internas (USD/MXN, U.S., PCE). */
      export function titleCaseEn(text: string): string
      ```
      Split on `/(\s+)/` keeping whitespace; first non-space token → uppercase first char; other tokens: if
      `tok.toLowerCase().replace(/[,;:.!?]+$/, '')` is in the set → `tok.toLowerCase()`, else `tok[0].toUpperCase() + tok.slice(1)`.
      ```ts
      /** Alternativa determinística (solo si el LLM no dio una válida). Usa campos ya validados. */
      export function buildFallbackHeadlineEn(report: FxDailyReport): string
      ```
      verb by `report.pulso.variacion_dir`: `down` → 'Gains', `up` → 'Weakens', `flat` → 'Holds Steady'; `subject = 'Mexican Peso ' + verb`;
      focus = first non-empty `report.en_la_mira[].label`; candidates in order:
      `${subject}, with ${titleCaseEn(focus)} in Focus` (only if focus), `${subject} Against the U.S. Dollar`, `subject`;
      return the first candidate where `!sameHeadline(candidate, report.headline)` (import `sameHeadline` from `./fxEnglishPostCheck.ts`,
      added in item 3 — implement item 3 BEFORE this sub-step 2c; no import cycle: postCheck does not import extractorEn).
      d) Tests in `f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxDailyExtractorEn.test.ts`:
      - extract prompt contains `FX_EN_STYLE_GUIDE` (already), and `toContain` each of: `'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus'`,
        `'Mexican Peso Firms, with Fed Minutes in Focus'`, `'USD/MXN eases as risk appetite supports the peso'`, `'Peso firm, focus on Fed minutes'`,
        `'Title Case'`; with approved headline `toContain('Keep every element of the approved headline (e.g., Fed focus)')`;
        without approved: update the existing `'two fresh English headline options'` assertion if the phrase changed (it stays per text above)
        and assert `not.toContain('Keep every element')`.
      - repair messages contain `'HEADLINES'` (guide is reused there).
      - `titleCaseEn('Mexican peso gains on Latin American risk appetite, with the Fed in focus')` →
        `'Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus'`; `'the peso firms as U.S. data eases'` →
        `'The Peso Firms as U.S. Data Eases'`; `'USD/MXN Eases On PCE'` → `'USD/MXN Eases on PCE'`.
      - `buildFallbackHeadlineEn`: dir down + en_la_mira `[{label:'Fed minutes'}]` → `'Mexican Peso Gains, with Fed Minutes in Focus'`;
        dir up, no en_la_mira → `'Mexican Peso Weakens Against the U.S. Dollar'`; flat → starts with `'Mexican Peso Holds Steady'`;
        when the headline equals the first candidate, returns the second.
      Files: f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxEnglishStyleGuide.ts,
             f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyExtractorEn.ts,
             f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxDailyExtractorEn.test.ts
      Verify: `npx vitest --run supabase/functions/_shared/fx-daily` → all pass (the remittance guard test over the guide must still pass).

- [ ] 3. Post-check: alternative checks + Title Case direction coverage, with tests. (Independent of items 1–2; do it before item 2c.)
      In `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxEnglishPostCheck.ts`:
      - `export type FxEnViolationRule = 'number_mismatch' | 'calque' | 'direction' | 'length' | 'headline_options';`
      - `export function sameHeadline(a: string, b: string): boolean` — compare `s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()`.
      - `checkHeadlineDirection(headline, dir, field = 'headline')` → returned violation uses `field` (default keeps today's behavior/tests).
      - `validateEnReport`: after the headline direction check, if `headlineAlternative` is non-empty also run
        `checkHeadlineDirection(headlineAlternative, report.pulso.variacion_dir, 'headline_alternative')`.
      - New `export function checkHeadlineAlternative(headline: string, alternative: string): FxEnViolation[]`:
        empty → `{ field:'headline_alternative', rule:'headline_options', detail:'headline_alternative is empty: write a second headline with a clearly different framing (e.g., lead with the main driver from the body)' }`;
        `sameHeadline` → same rule, detail `'headline_alternative repeats headline: write a clearly different framing (different lead driver or structure)'`;
        word count > `FX_EN_LENGTH_LIMITS.headline` → `rule:'length'` on `headline_alternative`. NOT called from `validateEnReport`
        (keeps its existing exact-list tests valid).
      Tests in `f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxEnglishPostCheck.test.ts`:
      - `checkHeadlineDirection('Mexican Peso Gains on Latin American Risk Appetite, with the Fed in Focus', 'down')` → null; same with `'up'` → violation;
        `'Mexican Peso Firms, with Fed Minutes in Focus'` with 'down' → null, 'up' → violation; `'USD/MXN Eases as Risk Appetite Returns'` with 'up' → violation;
        `'Mexican Peso Weakens …'` with 'down' → violation; field param → `field: 'headline_alternative'`.
      - `validateEnReport(baseReport(), src, <alt contradicting dir>)` contains a `direction` violation on `headline_alternative`.
      - `checkHeadlineAlternative`: `''` → 1 `headline_options`; `'Peso Firms.'` vs `'peso firms'` → 1 `headline_options`; distinct → `[]`; 15 words → `length`.
      Files: f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxEnglishPostCheck.ts,
             f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxEnglishPostCheck.test.ts
      Verify: `npx vitest --run supabase/functions/_shared/fx-daily` → all pass (existing post-check tests unchanged).

- [ ] 4. Pipeline: Title Case, alternative validation, deterministic fallback, always 2 options; update + add tests. (Depends on 2, 3.)
      In `f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyEnglishPipeline.ts`:
      - `assemble`: after `applyCalqueFixes`, set `report.headline = titleCaseEn(fixed.report.headline)` (new object, no mutation of input)
        and `alt = titleCaseEn(fixed.headlineAlternative)`; violations =
        `[...validateEnReport(report, sourceNumbers, alt), ...checkHeadlineAlternative(report.headline, alt)]`.
      - Helpers: `altOnly(vs) = vs.length > 0 && vs.every(v => v.field === 'headline_alternative')`;
        `withFallback(a: Assembled, sourceNumbers): Assembled` → `alt = buildFallbackHeadlineEn(a.report)`, re-run the same two validations.
      - Flow (still never more than 2 LLM calls; normal clean path = 1 call):
        first pass clean → ok. Facts-owned violation → 422 (unchanged). Otherwise repair call (unchanged params).
        Repair call fails / unparseable / `assemble` null: if `altOnly(firstPass)` → `withFallback(current)`; clean → ok
        (`repaired: false`), else `validationFailed(firstPass)`; otherwise `validationFailed(firstPass)` (unchanged).
        After repair: if `next.violations` non-empty and `altOnly(next.violations)` → `next = withFallback(next)`; if still violations →
        `validationFailed(next.violations)`. Then `current = next; repaired = true`.
      - `headlineOptions(headline, alternative, approved)` → always
        `[{ value: headline, source: approved ? 'approved' : 'alternative' }, { value: alternative, source: 'alternative' }]`
        (distinctness is guaranteed by the checks above). Update the header comment (Spanish): alternativa vacía/repetida = violación
        de prosa reparable; si solo falla la alternativa se usa una alternativa determinística.
      Tests in `f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxDailyEnglishPipeline.test.ts`:
      - Update expectations for Title Case: `'Peso Weakens as Strong NFP Lifts USD/MXN'` and `'USD/MXN Rises 0.6% After U.S. Jobs Data'`.
      - Replace `'sin titular aprobado: una sola opción alternative'` with: no approved → 2 options, both `'alternative'`, distinct, 1 call.
      - Approved present, clean → 2 options (`approved` + `alternative`), 1 call (existing test, updated strings).
      - Identical alternative (`headline_alternative` = headline) → 2 calls; repair returns a distinct alternative → ok, `repaired: true`,
        2 distinct options; repair messages contain `'repeats headline'`.
      - Empty alternative and repair returns empty again → ok, alternative = `'Mexican Peso Weakens, with NFP in Focus'` (FACTS: dir up,
        en_la_mira NFP), 2 calls, 2 distinct options.
      - Empty alternative and repair call fails (`{ success:false, … }`) → ok with the fallback alternative (not 422).
      - Alternative contradicting direction (e.g. `'Mexican Peso Gains on Risk Appetite'` with dir up) twice → fallback used, ok.
      - Prose violation elsewhere + bad alternative after repair → still 422 (hard violations win).
      - Double-paren end-to-end: `extractApprovedHeadline` on the user's title feeds `runFxEnglishPipeline` → first call's system prompt
        contains `'Peso firme, foco en minutas Fed'` and `'Keep every element'`; options[0].source `'approved'`.
      Files: f:\ScoryDesign\supabase\functions\_shared\fx-daily\fxDailyEnglishPipeline.ts,
             f:\ScoryDesign\supabase\functions\_shared\fx-daily\__tests__\fxDailyEnglishPipeline.test.ts
      Verify: `npx vitest --run supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts`
      → all pass; `deno check --no-lock supabase/functions/generate-fx-daily/index.ts supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts`
      → exit 0.

- [ ] 5. Final verification, cleanup and summary file.
      Run from `f:\ScoryDesign`:
      `npx vitest --run supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts`;
      `npm run type-check`; `deno check --no-lock supabase/functions/generate-fx-daily/index.ts`; `git status --short -- deno.lock` (empty);
      `npm run lint` (must equal baseline 603 problems / 2 errors); full `npm test` (only the 7 baseline files / 15 tests may fail).
      Search for `DEBUG-TEMP` in `f:\ScoryDesign\supabase\functions\_shared\fx-daily`, `f:\ScoryDesign\supabase\functions\generate-fx-daily`
      and `f:\ScoryDesign\src` → 0 matches.
      Write `f:\ScoryDesign\.agents\tasks\fx-daily-english-mode\headline-v2.md` (short): changes per file; root cause of the single option
      (findings a + b); ES single-option status (fixed for `((…))` via parser; without approved headline ES still returns 1 option by
      design, not changed — needs ES prompt/schema change, ask user); EN headlines now Title Case (deterministic + prompt); ES trend now
      pair-based with fixed labels Al alza / A la baja / Lateral (intentional ES change; manual edits unaffected); compass color OPEN
      QUESTION (mapping listed in Findings: HTML shows no color; panel "▲ verde / ▼ rojo"; kit compass up turquoise "favorable" /
      down coral "adverso") — keep, invert or neutral?; command results table; "not verified: no live LLM call — the user must deploy
      `generate-fx-daily`".
      Files: f:\ScoryDesign\.agents\tasks\fx-daily-english-mode\headline-v2.md (new)
      Verify: all commands above match the expected outcomes; file exists.

## Gaps / assumptions
- No real MD sample in the repo beyond the user's description; tests use synthetic MDs with the user's exact title.
- Prompt quality (natural headlines, keeping the Fed element, naming "Latin American risk appetite") can only be checked live after
  deploy; tests cover the prompt text and the deterministic guards.
- `FxDailyPanel.tsx` select labels ("Alcista (▲ verde)" …) are left unchanged pending the color question.
