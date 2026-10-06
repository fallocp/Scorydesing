# Two distinct EN headline options, Title Case wire-style headlines, and pair-based ES trend (pass 2)

This pass covers the iteration-2 fixes for the three findings from pass 1. The blocking one is resolved: when the first pass fails only on `headline_alternative` and the parsed repair adds a violation somewhere else, the pipeline now goes back to the first-pass report and uses the deterministic alternative instead of returning 422. A new test covers that path. `titleCaseEn` keeps `bp`/`bps` lowercase, and the approved-headline hint no longer names the user's specific driver. Every Part A and Part B requirement is either met in code or limited to the prompt and flagged for a live check.

Watch for: in the drifted-repair branch the pipeline throws away a valid alternative from the repair and uses the generic fallback instead (confirmed, non-blocking). Headline quality (keeping the Fed element, naming the body driver, not opening with "USD/MXN eases") is still enforced only by the prompt until a live run.

**Verdict**: APPROVED

## High-level view

Every exit from the EN pipeline that isn't a 422 now returns two distinct options, with one LLM call on the clean path and never more than two. When only the alternative is bad, the deterministic fallback covers three cases: a failed repair, a repair that is wrong only on the alternative, and a repair that drifted elsewhere. Mixed first passes still 422. The fallback is generic, so on those paths the body driver can end up missing from both options.

Part B and the ES side haven't changed since pass 1. The `headline-v2.md` summary describes the compass as if it already renders pair direction, which it doesn't. That should be fixed before the color question goes to the user.

<details>
<summary>Issues (3)</summary>

1. **Valid repaired alternative discarded (non-blocking, confirmed)**: in the drifted-repair branch, first try the first-pass report with `next.headlineAlternative`, and fall back to `buildFallbackHeadlineEn` only if that fails validation. That keeps an LLM option that names the driver over the generic fallback.
2. **Summary overstates compass rendering (non-blocking, confirmed)**: `headline-v2.md` says "The compass arrow follows the pair direction in both locales", but `buildFxDailyHtml` renders no compass and only the panel select uses `tendencia_dir`. Reword it so the color question isn't framed on a visual that doesn't exist.
3. **Prompt-only headline requirements (non-blocking, possible)**: keeping every approved element (Fed), naming the body driver in one option, and peso-led framing are enforced only by the prompt. Live-check after deploying `generate-fx-daily`, including an MD without Fed or LatAm drivers.

</details>

<details>
<summary>Details</summary>

### Drifted-repair branch picks the generic fallback over a good alternative

The new branch in `fxDailyEnglishPipeline.ts`:

```ts
} else {
  if (!altOnly(firstPass)) return validationFailed(next.violations);
  const fb = withFallback(current, sourceNumbers);
  if (fb.violations.length > 0) return validationFailed(next.violations);
  current = fb;
}
```

In the new test ("solo falla la alternativa y la reparación mete un calco en otro campo"), the repair returned `Mexican Peso Slips After Strong U.S. Jobs Data`. That alternative is valid, names the driver, and is what the repair call was for. The pipeline discards it for `Mexican Peso Weakens, with NFP in Focus`. Running `validate(current.report, next.headlineAlternative, sourceNumbers)` before falling back would keep the model's option whenever it is clean against the first-pass headline. This bears on requirement (4), that the body driver appear in at least one option. Not blocking, since two distinct options are still returned.

### Open items carried into the user summary

The line "The compass arrow follows the pair direction in both locales" in `headline-v2.md` is wrong. `tendencia_dir` is read only by the `FxDailyPanel` select, and `buildFxDailyHtml` prints `pulso.tendencia` as text. The user should get the color question with no hint that a rendered compass already changed meaning.

Requirements (3) and (4) depend on model output. The tests check the prompt text and the deterministic guards. They don't check that the approved rendering keeps "Fed" or that "Latin American Risk Appetite" appears.

</details>

<details>
<summary>File map</summary>

- `supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts`: fallback for an alt-only first pass followed by a drifted repair (iteration 2); Title Case pass, alternative validation, always 2 options (iteration 1).
- `supabase/functions/_shared/fx-daily/fxDailyExtractorEn.ts`: `bp`/`bps` lowercase in `titleCaseEn`, generic driver hint in the approved rule (iteration 2); headline rules, `titleCaseEn`, `buildFallbackHeadlineEn` (iteration 1).
- `supabase/functions/_shared/fx-daily/fxEnglishPostCheck.ts`: `headline_options` rule, `sameHeadline`, `checkHeadlineAlternative`, `field` parameter, alternative direction check.
- `supabase/functions/_shared/fx-daily/fxEnglishStyleGuide.ts`: HEADLINES block with good/bad examples.
- `supabase/functions/_shared/fx-daily/fxDailyExtractor.ts`: `((…))` parsing, `FX_ES_TREND_LABELS`, ES `tendencia_dir` wording, deterministic `pulso.tendencia`.
- `supabase/functions/_shared/fx-daily/fx-daily-types.ts`: pair-semantics docs for `tendencia` / `tendencia_dir`.
- `supabase/functions/_shared/fx-daily/__tests__/*`: drifted-repair pipeline test and `bp` Title Case case (iteration 2); new `fxDailyExtractor.test.ts` and extended EN tests (iteration 1).

Full diff: `git diff -- supabase/functions/_shared/fx-daily` plus the untracked `fx-daily` files.

</details>
