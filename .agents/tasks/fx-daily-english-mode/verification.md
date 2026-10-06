# Verification — fx-daily-english-mode (iteration 2)

All commands run from `f:\ScoryDesign` on Windows/pwsh. No commit, push, deploy or dependency install.

## Review findings addressed
| Finding | Fix |
|---|---|
| remesas-in-prompts (blocking) | `fxEnglishStyleGuide.ts`: dropped `(Spanish "remesas")` from `FX_EN_STYLE_GUIDE`, removed the `{ es: 'remesas', en: [] }` glossary entry, reworded the `remittances` hint to "drop the household money-transfer point entirely", reworded the header comment. Detection regexes (`remittances`, `spanish_residue`) kept. Test now checks `/remittance\|remesas/i` over the guide, rendered glossary, glossary JSON, every `FX_EN_CALQUE_RULES` hint and the full extract prompt. |
| futile-repair-facts-owned-fields (blocking) | New `isFactsOwnedField(field, facts)` in `fxDailyExtractorEn.ts` (mirrors `applyEnFacts` fallbacks: `pulso.apertura/variacion/rango_dia`, `escenario_central` when the facts value is non-empty; `escenarios[*]` when `facts.escenarios` is non-empty). `fxDailyEnglishPipeline.ts`: if ANY first-pass violation is facts-owned, return 422 `en_validation_failed` right away (1 call). Prose-only violations still get the single repair call. |
| timeout-budget-ignores-retry | Documented the real worst case (≈274 s, same pattern as ES ≈242 s) in the pipeline header and in plan.md decision 5. Timeouts unchanged (lowering them would add failures on the normal path). |
| sign-insensitive-parity | New `checkVariacionSign` in `fxEnglishPostCheck.ts`, wired into `validateEnReport`: explicit `-`/`−` with `variacion_dir: 'up'`, or `+` with `'down'`, is a `direction` violation on `pulso.variacion`. Unsigned values and `'flat'` are not flagged. When `facts.pulso.variacion` is set this is facts-owned → 422 without repair. |
| calendar-events-unused | Removed `calendar_events` from `FxEnFacts`, the JSON shape in the prompt and `coerceFxEnFacts` (saves output tokens). Event-name preservation stays a prompt rule (guide "CALENDAR EVENTS" + en_la_mira instruction). |
| deno-lock-churn | `git checkout -- deno.lock` (reverted the 3-line hunk). `deno check` now runs with `--no-lock`; `git status -- deno.lock` is clean afterward. |

## Commands and results (iteration 2)
| Command | Result |
|---|---|
| `npx vitest --run supabase/functions/_shared/fx-daily src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts src/hooks/__tests__/useFxDaily.locale.test.ts` | 5 files passed, 103 tests passed (was 86; +17) |
| `deno check --no-lock supabase/functions/generate-fx-daily/index.ts supabase/functions/_shared/fx-daily/fxEnglishPostCheck.ts supabase/functions/_shared/fx-daily/fxDailyExtractorEn.ts supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts supabase/functions/_shared/fx-daily/fxEnglishStyleGuide.ts` | exit 0; `deno.lock` unchanged |
| `npm run type-check` (`tsc -b`) | exit 0 |
| `npm run lint` | exit 1: 603 problems (2 errors, 601 warnings), identical to baseline; no `src/` files touched this iteration |
| `npm test` (`vitest --run`) | 7 files failed / 216 passed / 1 skipped; 15 tests failed / 3140 passed / 4 skipped. Same 7 pre-existing failing files / 15 tests as baseline (demo-controller + 6 `_shared/desaing/__tests__`) |
| Search `DEBUG-TEMP` in `src/`, `supabase/functions/_shared/fx-daily`, `supabase/functions/generate-fx-daily` | 0 matches |
| Search `remesas` in fx-daily code | only the `spanish_residue` detection regex (not sent to the model) |

## New tests this iteration
- `fxEnglishPostCheck.test.ts`: `checkVariacionSign` (3 contradictions incl. U+2212 minus, 6 OK cases), sign flip caught by `validateEnReport` even though the figure is in the source; extended remittance/remesas guard.
- `fxDailyExtractorEn.test.ts`: `isFactsOwnedField` (owned vs. repairable when facts are empty, prose fields), prompt no longer asks for `calendar_events`.
- `fxDailyEnglishPipeline.test.ts`: facts-owned violation → 422 after exactly 1 call; facts sign contradiction → 422 after 1 call; prose + facts-owned → 422 after 1 call; structured field empty in facts (LLM-owned) → repaired with 2 calls.

## Baseline (iteration 1, before any change)
`npm run type-check` exit 0; `deno check` exit 0; `npm test` 7 files / 15 tests failed (same list as above); `npm run lint` 603 problems (2 errors, 601 warnings).

## Not verified
- No live LLM call (no deploy, no OpenAI key used); prompt quality on real MDs must be checked after the user deploys.
- Real-world wall-clock of the EN path under the Supabase plan's limit.
