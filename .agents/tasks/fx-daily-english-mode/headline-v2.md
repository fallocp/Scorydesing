# Headline v2 + ES trend — implementation evidence (iteration 2)

## Iteration 2 — review fixes (`headline-v2-review.json`)
- `alt-only-repair-422` (blocking): `fxDailyEnglishPipeline.ts`, parsed-repair branch. If the repaired report still has violations (after the alt-only fallback) AND the first pass failed only on `headline_alternative`, the first-pass report + `buildFallbackHeadlineEn` is used (when it validates clean) instead of 422. `repaired` stays `false` in that case (same as the failed-repair branch). A mixed first pass still → 422 (existing test unchanged and green).
  - New test: empty alternative on the first pass, then a repair with a distinct alternative + "rollercoaster" calque in `lectura_clave` → ok, 2 calls, 2 distinct options, fallback alternative "Mexican Peso Weakens, with NFP in Focus", first-pass `lectura_clave` kept.
- `titlecase-units` (non-blocking): `bp`/`bps` added to the lowercase set in `titleCaseEn`. New case: "banxico cuts 25 bp, peso holds steady" → "Banxico Cuts 25 bp, Peso Holds Steady".
- `example-leakage` (non-blocking): approved-rule alternative hint now says "leads with the main driver named in the body, named specifically (not a generic "risk appetite")" (no user-specific driver). The good few-shots in the style guide are kept, since the task requires them. A live check with an MD that has no Fed/LatAm drivers is still pending after deploy.

### Iteration 2 commands (from `f:\ScoryDesign`)
| Command | Result |
|---|---|
| `npx vitest --run supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts` | 6 files passed, 140 tests passed (+2 vs iteration 1) |
| `npm run type-check` | exit 0 |
| `deno check --no-lock supabase/functions/generate-fx-daily/index.ts` | exit 0 |
| `git status --short -- deno.lock` | empty (unchanged) |
| `npm run lint` | 603 problems (2 errors, 601 warnings) = baseline |
| Search `DEBUG-TEMP` in `src/**`, `supabase/functions/**` | 0 matches |

---
# Iteration 1 evidence

Implemented `headline-v2-plan.md` items 1–5 on top of the uncommitted tree. No commit, push, deploy, dependency install or DB change. No `src/` file touched.

## Root cause of the single EN option
- (a) `extractApprovedHeadline` used `/\(([^()\n]+)\)\s*$/`; with `((Peso firme, foco en minutas Fed))` the inner `(…)` is followed by `)` → no match → approved headline `''`.
- (b) `headlineOptions()` in the EN pipeline returned ONE option whenever there was no approved headline (ignored `headline_alternative`), and dropped an empty/identical alternative when approved. Nothing validated the alternative.

## Changes per file
- `_shared/fx-daily/fxDailyExtractor.ts`
  - `extractApprovedHeadline`: tries `((Titular))` first, then today's single-paren regex (single-paren result unchanged).
  - New `FX_ES_TREND_LABELS` (`up` 'Al alza', `down` 'A la baja', `lateral` 'Lateral').
  - ES prompt: `tendencia_dir` = USD/MXN trend direction ("up" si USD/MXN tiende al alza (peso más débil), "down" si tiende a la baja (peso más fuerte), "lateral" si opera en rango). Removed the `tendencia` free-text instruction ("positiva para el peso") and the SENTIMIENTO wording, and the `"tendencia": ""` key from the JSON shape. Nothing else in the ES prompt changed.
  - `coerceFxDaily`: `pulso.tendencia = FX_ES_TREND_LABELS[tendencia_dir]` (LLM text ignored). Only runs at generation time; panel edits go through `fx.updateReport` without coercion, so manual edits are unaffected. EN still overwrites with `FX_EN_TREND_LABELS` in `applyEnFacts`.
- `_shared/fx-daily/fx-daily-types.ts`: `tendencia` / `tendencia_dir` docs now describe pair semantics and fixed labels (dropped "up verde / down rojo").
- `_shared/fx-daily/fxEnglishStyleGuide.ts`: new short `HEADLINES (wire-service style, Title Case)` block in `FX_EN_STYLE_GUIDE` (peso-led patterns, verbs, "prefer Gains over Rises", don't default to "USD/MXN eases…", name the driver specifically, 2 good + 2 bad examples). Also reaches the repair prompt.
- `_shared/fx-daily/fxDailyExtractorEn.ts`
  - Approved-headline rule: wire-service rendering, "Keep every element of the approved headline (e.g., Fed focus); do not drop or add drivers", example `"Peso firme, foco en minutas Fed" → "Mexican Peso Firms, with Fed Minutes in Focus"`; alternative must be clearly different and lead with the main body driver named specifically.
  - No-approved rule: two options with clearly different framings; at least one names the main body driver.
  - Length rule: 6–13 words each, Title Case; alternative never empty, never repeats headline.
  - New `titleCaseEn` (keeps acronyms/internal caps: USD/MXN, U.S., PCE) and `buildFallbackHeadlineEn` (Gains/Weakens/Holds Steady from `variacion_dir` + first `en_la_mira` label, e.g. "Mexican Peso Weakens, with NFP in Focus"; avoids repeating the headline).
- `_shared/fx-daily/fxEnglishPostCheck.ts`: new rule `headline_options`; `sameHeadline` (case/punctuation-insensitive); `checkHeadlineAlternative` (empty / repeats headline / > 14 words); `checkHeadlineDirection(..., field = 'headline')`; `validateEnReport` now also direction-checks the alternative. Regexes were already `/i`, so Title Case "Mexican Peso Gains/Firms" is matched (tests added).
- `_shared/fx-daily/fxDailyEnglishPipeline.ts`: Title Case applied deterministically to headline + alternative after calque fixes; alternative violations join the normal post-check, so an empty/identical/wrong-direction alternative is fixed by the EXISTING single repair call (normal clean path still 1 call, never more than 2). If after repair (or a failed/unparseable repair) the ONLY violations are on `headline_alternative`, the deterministic fallback replaces it instead of a 422. Other violations still → 422. `headlineOptions` always returns 2 (`approved`|`alternative` + `alternative`).
- Tests: new `__tests__/fxDailyExtractor.test.ts`; extended `fxDailyExtractorEn.test.ts`, `fxEnglishPostCheck.test.ts`, `fxDailyEnglishPipeline.test.ts` (headline expectations updated to Title Case; "una sola opción" test replaced by "2 opciones distintas").

## Behavior notes for the user
- EN headlines are now Title Case (prompt + deterministic `titleCaseEn`).
- ES trend is now pair-based with fixed labels Al alza / A la baja / Lateral (intentional, approved ES change). The compass arrow follows the pair direction in both locales.
- ES single-option status: the `((…))` parser fix restores 2 options for the user's ES case (approved + alternative). Without an approved headline, ES still returns 1 option by design (the ES prompt asks for one headline); making it 2 needs an ES prompt/schema change (`headline_alternative`), not done. Ask the user.
- Changing "Tendencia (compás)" in the panel does not rewrite the `tendencia` text (unchanged behavior).

## OPEN QUESTION — compass colors (nothing changed)
`buildFxDailyHtml.ts` does not read `tendencia_dir`/`variacion_dir` and renders no color for the trend (TENDENCIA prints `pulso.tendencia` as text), so the HTML implies no semantics. Current mappings elsewhere:
- `FxDailyPanel.tsx` selects: Tendencia "Alcista (▲ verde)" / "Bajista (▼ rojo)" / "Lateral (↔ negro)"; Variación "Sube (▲ verde)" / "Baja (▼ rojo)" / "Lateral (– negro)".
- `fxDailyKit.ts`: compass up = turquoise #2ED4C7 ("favorable"), down = coral #FF7A4A ("adverso"), flat = navy.
With pair semantics, "up" (USD/MXN higher, peso weaker) shows green/turquoise "favorable" and "down" (peso stronger) red/coral "adverse". Keep (USD-buyer view), invert (peso view), or make neutral? Panel labels "Alcista/Bajista" also read as pair direction now.

## Commands and results (run from `f:\ScoryDesign`)
| Command | Result |
|---|---|
| `npx vitest --run supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts` | 6 files passed, 138 tests passed (baseline 5 / 103; +1 file, +35 tests). Includes the previous session's EN DIRECTION rule / EN trend labels tests, all green. |
| `npm run type-check` (`tsc -b`) | exit 0 |
| `deno check --no-lock supabase/functions/generate-fx-daily/index.ts` | exit 0 |
| `git status --short -- deno.lock` | empty (unchanged) |
| `npm run lint` | 603 problems (2 errors, 601 warnings) = baseline |
| `npm test` | 7 files failed / 217 passed / 1 skipped; 15 tests failed / 3175 passed / 4 skipped. Same pre-existing failures (demo-controller + 6 `_shared/desaing/__tests__`: serverExploration, htmlBackend, pilotHttp, materialsBackend, productionBackend, serverGeneration) |
| Search `DEBUG-TEMP` in `src/**`, `supabase/functions/**` | 0 matches |

## New tests (summary)
- ES: `((…))` extraction incl. inner spaces, single-paren unchanged, no-paren / `##` only → `''`; ES prompt has no "positiva para el peso"/"SENTIMIENTO" and has the pair wording; `coerceFxDaily` labels from `tendencia_dir` (up/down/lateral, garbage → Lateral).
- EN prompt: the 4 good/bad examples, "Title Case", "never empty and never repeats headline"; approved → "Keep every element of the approved headline (e.g., Fed focus)"; repair prompt has HEADLINES; `titleCaseEn`; `buildFallbackHeadlineEn` (down/up/flat, skips a candidate equal to the headline).
- Post-check: Title Case direction both ways ("Mexican Peso Gains/Firms" ok with down, flagged with up; "USD/MXN Eases" flagged with up; "Weakens" flagged with down); `field` param; alternative direction in `validateEnReport`; `checkHeadlineAlternative`; `sameHeadline`.
- Pipeline: no approved → 2 distinct options in 1 call; identical alternative → repaired (2 calls, hint "repeats headline"); empty twice → fallback; empty + failed repair → fallback (not 422); wrong-direction alternative twice → fallback; other prose violation + bad alternative → 422; double-paren end-to-end (prompt carries the approved headline + "Keep every element", options `approved` + `alternative`).
- EN trend labels: covered by the existing `applyEnFacts` test (`tendencia: 'Downtrend'`).

## Not verified
- No live LLM call (no deploy, no API key used). Headline quality (natural wording, keeping the Fed element, naming "Latin American risk appetite") must be checked after the user deploys `generate-fx-daily`.
