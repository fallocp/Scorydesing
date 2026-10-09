# Verification — copy guard del HTML + «Salir conservando…»

## Reproduction (tests written before the fix)
- `npx vitest --run supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts` on the old guard: 8 of 13 failed.
  The Xending base case, column-major cards + paragraphs after the grid, merged title+description and the moved asterisk failed with
  «El HTML no conservó el texto aprobado (cambió el orden, las mayúsculas o la puntuación)» (the user's message). Uppercase titles,
  en dash and uppercase approved title failed with «sobra: …». The must-throw test failed because a changed word reported «sobra» instead of «esperado …».
- `npx vitest --run src/lib/presentations/__tests__/htmlDesignDraft.test.ts` before the helper: 2 failed (`leaveHtmlDesignDraft is not a function`).

## After the fix
| Command | Result |
|---|---|
| `npm run type-check` | pass (exit 0) |
| `npm run lint` | 606 problems, 2 errors — only the known pre-existing ones (`useCarouselQueue.sharedGeneration.test.ts:77`, `useGenerateSlide.canvas.test.ts:10`). Changed `src/` files: 0 errors; their warnings are on untouched lines (pre-existing exhaustive-deps / refs). `supabase/functions/**` is ignored by the lint config. |
| `npx vitest --run supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts supabase/functions/_shared/__tests__/designCanvasHtml.test.ts src/lib/presentations` | 28 files, 314 tests pass |
| `deno check --no-lock supabase/functions/generate-design-html/index.ts` | pass (exit 0) |
| `npx vitest --run` (whole suite) | 3242 pass, 15 fail in `supabase/functions/_shared/desaing/__tests__/{serverExploration,htmlBackend,materialsBackend,pilotHttp,productionBackend,serverGeneration}.test.ts` (pilot budget/policy tests) + legacy `docs/UI-handoffv2/.../demo-controller.test.mjs` suite. None import the changed modules (grep for `designCanvasHtml`, `htmlDesignDraft`, `SlideGeneratorPanel` under `_shared/desaing` = no matches); not touched. |
| `🔍 DEBUG-TEMP:` search in `src/` and `supabase/functions/_shared/` | none |

## What changed
- Bug 1 (`supabase/functions/_shared/designCanvasHtml.ts`): `copyDifference` + order-sensitive whole-string match replaced by `copyMismatch` (line-by-line, any order, contiguous; allows whitespace, typographic dashes/«…», all-caps rendering, moved `* † ‡`, leftovers without letters/digits, texts of the current HTML). Rejection names the block: `falta: «…»`, `sobra: «…»` or `cambió: esperado «…» · recibido «…»`. Prompt `TEXTO LITERAL` no longer demands the same order; copy each line character by character, never separate `*`, approved_copy wins over HTML ACTUAL/RESULTADO ACTUAL; reference/brand text exclusion and `text-transform` kept.
- Bug 2: the button called `onClose`, which `UnifiedDesignWorkspace` passed as a no-op. In conversation mode it now re-reads the saved draft, sets it `ready`, drops a proposal made for another revision (`leaveHtmlDesignDraft` in `htmlDesignDraft.ts`), clears the panel error and calls `onClose`, which now clears the host's local error. Standalone mode unchanged.

## Iteration 2 (review.json findings)
- composer-error-not-cleared (blocking): `useDesignConversation` exposes `clearError()`; the embedded `SlideGeneratorPanel` `onClose` in `UnifiedDesignWorkspace` now calls `setLocalError('')` and `work.clearError()`, so the composer's red «El HTML no conservó…» (`work.error`) also disappears after «Salir conservando…». Test: the existing «closes the HTML action when the service answered without HTML» case now calls `clearError()` and expects `error === ''`.
- copy-mismatch-infinite-loop: `normalizeCopy` strips control characters (`\u0000-\u0008`, `\u000e-\u001f`, `\u007f`), and the `while (take(...))` loop over current_html texts is gone.
- current-html-substring-exemption: leftovers of a block (what remains after the approved lines) are split at the used spans; each piece with letters/digits must equal a whole current_html text (ignoring `* † ‡`, edge punctuation, all-caps rendering). Pieces no longer combine. New test in `designCanvasHtml.test.ts`: «XENDING CAPITAL», «2» and a `&#1;` block pass; «Capital 2» (glued from two current texts) → `sobra: «Capital 2»`; «Liquidez ágil 2X» rejected.
- uncertain-conversation-pending: not changed. If the HTML request got no answer (502/503), the action stays `uncertain` and the conversation's existing recovery strip resolves it. Releasing it from the button could send the same request twice, which would change behavior beyond this fix.

| Command (iteration 2) | Result |
|---|---|
| `npx vitest --run supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts supabase/functions/_shared/__tests__/designCanvasHtml.test.ts src/lib/presentations` | 28 files, 315 tests pass |
| `npm run type-check` | pass (exit 0) |
| `npm run lint` | 606 problems, 2 errors: only the known pre-existing ones. Changed `src/` files: 0 errors |
| `deno check --no-lock supabase/functions/generate-design-html/index.ts` | pass (exit 0) |
| `🔍 DEBUG-TEMP:` search in `src/` and `supabase/functions/` | none |

## Not verified here (needs the user)
- Runtime of the edge function: deploy `supabase functions deploy generate-design-html`, then repeat «Aplicar al diseño actual» on the Xending slide.
- Browser click on «Salir conservando el último borrador guardado» (no DOM test infra; not driven in a browser): red error and yellow «El documento cambió…» banner should disappear, preview shows «Documento actual», and a new request can be sent.
