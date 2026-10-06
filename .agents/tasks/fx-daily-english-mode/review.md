# English output mode for Daily Report FX (pass 2)

This pass re-checks the `locale: 'es' | 'en'` change to `generate-fx-daily` after the fixes from pass 1. English mode makes one facts-first LLM call. `applyEnFacts` writes the structured fields deterministically from `facts`, and a no-LLM post-check (number parity, calque blocklist, headline direction, `pulso.variacion` sign, word limits) gates the result. One repair call runs only when every violation is in prose; any violation on a facts-owned field returns 422 right away. All six pass-1 findings are resolved. Both blocking ones are fixed: "remesas" is gone from prompt-facing text and the test now guards both spellings, and the useless repair call on facts-owned fields is skipped. The four non-blocking ones are also handled: the time budget is documented, there is a sign check, `calendar_events` was dropped, and the `deno.lock` hunk was reverted (`git diff -- deno.lock` is empty).

Watch for: one small asymmetry with the ES path on empty headlines (confirmed, non-blocking). Nothing blocks shipping.

**Verdict**: APPROVED

## High-level view

The Spanish path is additive-only. The ES branch in `generate-fx-daily/index.ts` keeps the same single `callOpenAI` with the same params and headline logic. The only new things are `report.locale = 'es'` on the response and, in the hook, the server `message` surfaced from `error.context` on non-2xx responses. ES HTML labels and the `Nota: ` prefix render the same. The ES prompt edits in the diff (55–75 words, approved-headline rule) come from the earlier uncommitted headline-options work the plan builds on.

The image prompt is unchanged. `buildFxDailyImagePrompt` only reads `report.pair`, and the EN path forces `'USD/MXN'`, so both locales produce the same scene prompt.

Cost on the EN path is one call normally (4000 output tokens max vs 3000 for ES). It reaches two calls only when every violation is in prose and therefore fixable. The documented worst case is about 274 s, with the same retry pattern as ES (about 242 s).

The native-English pipeline matches what the user asked for. Facts come first in the response, the report is written from facts with "do not translate sentence by sentence", the style guide and glossary are in code (`fxEnglishStyleGuide.ts`), direction rules (USD/MXN up = peso weaker, no "exchange rate improved/worsened", levels belong to USD/MXN) are enforced in the prompt and partly by regex, and calendar event names are preserved by prompt rule. The audience is corporate treasury, with no remittances wording in any model-facing string.

<details>
<summary>Issues (1)</summary>

1. **EN empty-headline asymmetry** (non-blocking, confirmed): the ES path accepts an empty LLM headline when the MD has an approved headline (`index.ts:142`), but the EN path returns 422 `empty_report` whenever the English headline is empty (`fxDailyEnglishPipeline.ts:117`), even with an approved headline. This is defensible, since a Spanish headline can't be used on an English piece. If the policy is intentional, add a one-line comment saying so.

</details>

<details>
<summary>Details</summary>

### Facts-owned coupling and failure mode

`isFactsOwnedField` (`fxDailyExtractorEn.ts`) has to mirror the `||` fallbacks in `applyEnFacts` by hand. If a future edit makes another field facts-owned and doesn't update the helper, the pipeline goes back to spending a repair call that can't succeed. The failure mode is fail-closed: a figure that isn't in the source never ships, and one wrong number in `facts` sinks the whole EN report (422 after one call, with no partial fallback). The 422 message is in Spanish but embeds English violation details.

### Test coverage

Number parity, auto-fixes, every violation rule with false-positive cases, headline direction, sign check, length bounds, call counts per pipeline branch, and HTML labels per locale are covered deterministically. Not tested: a byte-level snapshot of the ES HTML (the test checks labels, not the full output), and real-model prompt quality, which `verification.md` already lists as not verified.

</details>

<details>
<summary>File map</summary>

- `supabase/functions/_shared/fx-daily/fx-daily-types.ts`: `FxLocale`, optional `locale` on report/request, `FX_DEFAULT_NOTA_EN` (plus earlier headline-options types).
- `supabase/functions/_shared/fx-daily/fxDailyExtractor.ts`: helpers exported. The ES prompt edits come from the earlier headline-options work.
- `supabase/functions/_shared/fx-daily/fxEnglishStyleGuide.ts` (new): style guide, glossary, calque rules, EN driver titles and scenario labels.
- `supabase/functions/_shared/fx-daily/fxEnglishPostCheck.ts` (new): number parity, auto-fixes, blocklist, headline direction, variacion sign, length bounds.
- `supabase/functions/_shared/fx-daily/fxDailyExtractorEn.ts` (new): facts-first prompt, repair prompt, facts coercion, `isFactsOwnedField`, `applyEnFacts`.
- `supabase/functions/_shared/fx-daily/fxDailyEnglishPipeline.ts` (new): 1 + optional 1 call orchestration and the 422 policy.
- `supabase/functions/generate-fx-daily/index.ts`: locale validation, EN branch, `report.locale = 'es'` on the ES branch.
- `src/utils/design-studio/buildFxDailyHtml.ts`: locale-driven baked labels and `lang`.
- `src/hooks/useFxDaily.ts`: `locale` state, sent in the request body, server message read from `error.context`.
- `src/components/design-studio/FxDailyPanel.tsx`: "Idioma del reporte" selector, filename regex handles commas in EN dates.
- Tests: `_shared/fx-daily/__tests__/{fxEnglishPostCheck,fxDailyExtractorEn,fxDailyEnglishPipeline}.test.ts`, `src/utils/design-studio/__tests__/buildFxDailyHtml.test.ts`, `src/hooks/__tests__/useFxDaily.locale.test.ts`.
- The working tree also contains unrelated `desaing`/presentations changes. They are out of scope.

Full diff: `git diff -- supabase/functions/_shared/fx-daily supabase/functions/generate-fx-daily src/hooks/useFxDaily.ts src/components/design-studio/FxDailyPanel.tsx src/utils/design-studio/buildFxDailyHtml.ts` plus the untracked files listed above.

</details>
