# Implementation — FX/energy misclassification + no-invented-data rule

Iteration 1 (no review.json). No commit, no push, no new dependencies. `news-types.ts` untouched.

## Changes

- `supabase/functions/_shared/news/newsVisualResolver.ts`
  - `ENERGY_KEYWORDS`: removed bare `petrol`; added `petroleo`, `petrolera`, `petrolero`, `combustible`. Energy keywords now count only in the HEADLINE (`hasEnergyHeadline` via new `paddedHeadline`).
  - New FX guard: `FX_DOMAINS`, `FX_KEYWORDS` (phrases only, no bare `peso`/`dolar`), `hasFxHeadline`, `FX_ENERGY_CUE`.
  - `hasCompetingPrimary(plan)` is headline-keyword only; `COMPETING_DOMAINS` removed.
  - New `hasEquitiesHeadline` blocks energy ("Wall Street sube por petroleras").
  - `coerceResolutions`: `fxSignal = hasFxHeadline || (llmFx && !energyHeadline)`; `energySignal = !equitiesHeadline && (energyHeadline || llmEnergy)` (LLM energy needs confidence >= `NEWS_CONFIDENCE_THRESHOLD`). The new `fxSignal` branch sits right after executive wrap and before the LLM-mixed / energy / equities / central-bank branches. It sets `archetype='fx'`, `domain='fx'` and single story; engine/layout are set only if the LLM did not pick fx.
  - Coherence: when the final archetype ≠ LLM archetype and the final one is fx/energy/equities/central_bank, `visual_subject`, `physical_context` and `supporting_elements` are replaced from `GUARD_DIRECTION`. FX with energy in the headline appends the subordinate `FX_ENERGY_CUE` (max 3 elements). No debug field added.
  - `buildResolverMessages`: FX mechanism from the headline currency's perspective (`appreciates`/`depreciates`/`breaks_level`); `economic_object` includes the pair; new `REGLA DE FX`; `REGLA DE PETRÓLEO` is now subject-based (passing mention ≠ energy); story_type exception for "El peso gana por el petróleo".
- `supabase/functions/_shared/news/archetypes.ts`
  - `archetypeFx`: the accent is the story pair's chart; turquoise `#2ED4C7` when the headline currency appreciates (even if USD/MXN falls), coral `#FF7A4A` on depreciation/pressure. Optional small subordinate oil hint (no Brent/WTI label). Micro-label allowed only with a story figure.
  - `archetypeEnergy`: option (e) is a "crude price chart"; the Brent/WTI label is allowed only if the story names it.
- `supabase/functions/_shared/news/newsPromptBuilder.ts`
  - New exported `extractAllowedFigures(plan)`: verbatim figures from headline + subcopy + key_data, deduped, in order of appearance.
  - New `DATA RULES` block (between STYLE directives and IMPORTANT):
    - Figure whitelist, or "NO numbers — lines only" when there are none.
    - Asset labels per archetype: FX gets only the story pair, with no Brent/WTI/indices/other assets. Energy gets Brent/WTI only if named in the story. Everything else gets only assets named verbatim.
    - Negative rules: no invented figures/tickers/other-asset prices/accompanying data.
  - IMPORTANT: "numerical data" removed from the "added later" list. Headline/source/date/slide number/branding are still not rendered. Numbers are allowed only from the whitelist.
- `supabase/functions/_shared/news/newsStyleV1.ts` (`NEWS_NO_LOGO_DIRECTIVE` only): "No text (other than the allowed chart figures and micro-labels)". Removed "data" from the externally composited list.
- New `supabase/functions/_shared/news/__tests__/newsVisualResolver.test.ts`: 16 tests covering cases (a)–(h), plus subcopy-only energy, low-confidence LLM energy, the REGLA DE FX prompt text and the IMPORTANT wording.

## Verification (run from f:\ScoryDesign, pwsh)

- `npx vitest run supabase/functions/_shared/news` → 1 file, 16/16 passed.
- `npm run test` → Test Files 7 failed | 218 passed | 1 skipped (226); Tests 15 failed | 3193 passed | 4 skipped (3212). All 15 failures are pre-existing and unrelated: `_shared/desaing/__tests__/{serverExploration,htmlBackend,pilotHttp,materialsBackend,productionBackend,serverGeneration}` (pilot limit/budget/reserve policy assertions, consistent with commit `a170ae8 feat: retirar límites del piloto`), plus the legacy suite `docs/UI-handoffv2/legacy/demo-v1/tests/demo-controller.test.mjs`. None import `_shared/news`. All news tests pass.
- `npm run type-check` (`tsc -b`) → exit 0.
- `npm run lint` → 603 problems (2 errors, 601 warnings). Both errors are pre-existing `react-hooks/rules-of-hooks` in `src/hooks/__tests__/useCarouselQueue.sharedGeneration.test.ts` and `src/hooks/__tests__/useGenerateSlide.canvas.test.ts` (untouched; lint ignores `supabase/functions/**`).
- `deno check` not run.
- No `🔍 DEBUG-TEMP:` logs.

## Iteration 2 (review.json findings)

- Blocking, `newsVisualResolver.ts`: new `headlineNamesCurrency` (`/\bpesos?\b/` on the normalized headline). `fxSignal = hasFxHeadline || (llmFx && (!energyHeadline || headlineNamesCurrency))`, so "Peso gana por alza del petróleo" / "Peso se deprecia por caída del crudo" + LLM fx stay fx with the subordinate oil cue. Added `'al peso'` to `FX_KEYWORDS` ("Petróleo cae y fortalece al peso" → fx deterministically). "Brent arriba de 90" + LLM fx still → energy.
- Minor, `newsVisualResolver.ts`: `' yen'` → `' yen '` and `' yenes'` (no match on "yendo").
- Minor, `archetypes.ts`: all "Do not generate text or logos." / "Do not generate text or the Xending logo." closings now say "Do not generate text (other than an allowed chart micro-label) …", matching FX and DATA RULES.
- Minor, `newsPromptBuilder.ts`: `extractAllowedFigures` skips a number followed by "de <mes>" and bare 19xx/20xx years.
- Tests: 5 new (21 total) covering the article-less peso headline, "al peso", yen/yendo, archetype closing wording and date figures.
- Verification: news tests 21/21 passed; `npm run test` 15 failed | 3198 passed | 4 skipped (same 15 pre-existing failures); `npm run type-check` exit 0; `npm run lint` 2 errors / 601 warnings (same pre-existing errors).

## Iteration 3 (review.md minor findings)

- `newsVisualResolver.ts` `hasFxHeadline`: a normalized headline that STARTS with `peso ` / `pesos ` / `superpeso` is now a deterministic FX signal (`/^ (?:pesos? |superpeso)/` on `paddedHeadline`). "Peso gana por alza del petróleo" and "Peso se deprecia por caída del crudo" resolve to fx (subordinate oil cue, subject replaced via `GUARD_DIRECTION`) even when the LLM says energy. A bare `peso` mid-headline is still not FX ("Gana peso la propuesta petrolera" → energy).
- `newsPromptBuilder.ts` `extractAllowedFigures`: a 19xx/20xx number is kept only when followed by a unit (`dólares`/`dolares`/`usd`/`pesos`/`puntos`/`pb`/`bps`/`barriles`/`mxn`/`unidades`) or preceded by `$`/`€`/`£`/`USD`/`MXN`. Otherwise it's treated as a year and dropped ("en 2026", "octubre de 2026"). `2045%` was already kept, since the `%` is part of the match. The "N de <mes>" day filter is unchanged.
- Tests: 3 new (24 total): (b5) "Peso …" + LLM energy → fx with oil cue and no energy STYLE; (b6) "Gana peso la propuesta petrolera" → energy, not fx; figures "Oro toca 2045 dólares" → `2045`, "S&P 500 en 2045 puntos" → `500, 2045`, "octubre de 2026" / "en 2026" dropped.
- Verification: `npx vitest run supabase/functions/_shared/news` → 24/24 passed; `npm run type-check` exit 0; `npm run test` 15 failed | 3201 passed | 4 skipped (same 15 pre-existing desaing/legacy failures); `npm run lint` 2 errors / 601 warnings (same pre-existing errors). No debug logs, no commit.
