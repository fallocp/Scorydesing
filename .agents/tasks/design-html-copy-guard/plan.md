# Implementation Plan — copy guard del HTML + «Salir conservando…»

Workspace: `f:\ScoryDesign` (no worktree, branch `codex/ui-crear-editar-v2`). Use absolute paths.

## Hard constraints (apply to every item)
- Only these two bug fixes. No performance/scalability work.
- No `git push`, no dependency installs, no `supabase functions deploy`. Record deploy commands for the user instead.
- Never stage/commit the user's unrelated changes: `supabase/functions/_shared/news/**`, `supabase/functions/_shared/news/__tests__/`, `.agents/tasks/fx-peso-energy-misclassification/`, `.agents/tasks/gpt-vision-reference-regression/*`. Stage files by name only.
- UI text in Spanish. Temporary logs only with prefix `🔍 DEBUG-TEMP:` and removed before finishing.
- Minimal fixes, existing patterns (one-line terse style of `designCanvasHtml.ts`, CAS draft store in `htmlDesignDraft.ts`).

## Project facts (from exploration)
- Tests: vitest, node environment, no jsdom / testing-library (no `.test.tsx` exist). Run single files with `npm test -- <path>`.
- Type-check: `npm run type-check` (`tsc -b`, covers `src/` only). Lint: `npm run lint`. `supabase/functions/_shared/designCanvasHtml.ts` is not covered by `tsc -b`; it is covered by its vitest tests (and `deno check supabase/functions/generate-design-html/index.ts` if deno is on PATH; skip if not).
- Edge call path: `generate-design-html/index.ts` design-canvas branch (~L753-790) → `buildDesignCanvasHtmlMessages` → one OpenAI call → `finalizeDesignCanvasHtml`.

---

## BUG 1 — «El HTML no conservó el texto aprobado (cambió el orden, las mayúsculas o la puntuación)»

### Root cause (confirmed by reading code; runtime model output not reproducible here)
`finalizeDesignCanvasHtml` (`supabase/functions/_shared/designCanvasHtml.ts`, block `if (request.copy_mode) {…}`) requires the HTML's visible text, read in DOM order and whitespace-stripped, to equal the whole approved copy **in the same order and case**. The final fallback message «cambió el orden, las mayúsculas o la puntuación» is reached only when no block is extra and every approved line exists somewhere, i.e. the words are all there but sequence/case/punctuation differ. In this flow that happens by construction:
- «Aplicar al diseño actual» uses `fromSlide` in `src/lib/presentations/useDesignConversation.ts` (~L455-469): the model refines the slide's own HTML (`current_html`) and, with literal copy, **references are NOT sent** (`references: []`). So the model is not copying text from the reference images in this path; it follows the current slide's DOM structure.
- The approved copy (`value.copy.text`, `htmlContext` ~L382) is the planner's transcription of the references, in the planner's reading order and casing. The model lays it into the slide's grid (paragraphs vs. cards vs. footnote, row/column order of the 3×2 cards), so DOM order ≠ approved order → rejected every time, even with all words correct.
- Secondary: the model sometimes types card titles in capitals (or the planner transcribes them in capitals while the slide uses sentence case + CSS), and puts the footnote `*` in its own `<sup>`/span or detaches it; dashes `–`/`—` vs `-` are compared literally.
- Prompt reinforces the problem: «utiliza todo el approved_copy, con las mismas palabras, signos, tildes, mayúsculas y **orden**», which conflicts with «la composición … se rediseña».

### Decision
Replace the order-sensitive whole-string comparison with a **line-multiset match** (each approved line must appear complete and contiguous, any order), with narrow, explicit allowances. Rationale: the guard exists to stop invented, missing or altered words; the order of lines in the DOM is a layout decision the prompt itself delegates to the model. Still strict on letters, accents, digits and punctuation **inside** each line (financial copy: «1 a 45 días», «15%» must not change).
- Allowed: any order of lines; a line split across adjacent blocks (`<br>`, spans) or merged with another line in one element; whitespace; typographic quotes (already), **dashes `‐‑‒–—―−` → `-` and `…` → `...`** (new in `normalizeCopy`); an **all-caps rendering** of a line (HTML segment fully uppercase, or approved line fully uppercase and HTML in another case — `toLocaleUpperCase('es')`); footnote markers `* † ‡` moved/detached (second pass ignoring only those markers); leftover between lines that has no letters/digits (decorative bullets/separators); whole blocks identical to a text block of `current_html` (written logo, lemas — existing «kept» rule, now evaluated on the leftover, which fixes the case where a kept block like «Xending Capital» is also a substring of an approved paragraph).
- Still rejected: any extra letters/digits not from `current_html`, missing line, changed word/accent/digit, mixed-case changes (e.g. «liquidez Ágil»), a line broken by foreign text in the middle, any text with `copy_mode: 'none'`.
- No retry call (would double latency on a 120 s call and the user already sees 502/503); no HTML rewriting repair.
- Message names the block: `(falta: «…»)`, `(sobra: «…»)` or `(cambió: esperado «…» · recibido «…»)`, clipped to 60 chars; keeps the substring «texto aprobado».

### Items

- [ ] 1. Add the reproduction tests FIRST (they must fail on current code for the legit variants).
      In `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts` add a `describe('adjusting the current slide (Aplicar al diseño actual)')` with a realistic request: `canvas 1920×1080`, `copy_mode: 'literal'`, `current_html` = a slide doc with a written logo block `<div class="logo">Xending Capital</div>` plus the current copy, `iteration_feedback: 'Aplica lo acordado al diseño actual.'`, `approved_copy` = lines in planner order: title «Una línea diseñada alrededor de tu flujo», subtitle «Liquidez cuando la necesitas. Flexibilidad para pagar cuando tu flujo se libera.», paragraph 1 («Las empresas enfrentan constantemente … sin detener la operación.», which contains «Xending Capital»), paragraph 2 («Una vez autorizada la línea, … previamente acordada.»), 6 cards as title/description line pairs in row-major order (`Liquidez ágil`, `Plazos flexibles`, `Línea revolvente`, `Sin comisión de apertura*`, `Certidumbre desde el inicio`, `Atención especializada`, each with a short description, e.g. «Elige un plazo de 1 a 45 días conforme a tu ciclo de flujo.»), footnote «*Cuando aplique conforme a las condiciones vigentes del producto y perfil del acreditado».
      Must PASS (`not.toThrow()`), one `it` each: (a) cards in column-major DOM order and the two paragraphs placed after the grid; (b) card titles typed in capitals (`LIQUIDEZ ÁGIL`); (c) title+description merged in one element `<p><strong>Liquidez ágil</strong> Accede…</p>`; (d) asterisk in its own element: `<h3>Sin comisión de apertura<sup>*</sup></h3>` and footnote `<small><sup>*</sup> Cuando aplique…</small>`, plus a variant where the `*` sits in a separate `<span class="mark">*</span>` before the card title; (e) en dash in HTML where approved has `-` (add one line with a hyphen); (f) the written logo block «Xending Capital» kept from `current_html` while paragraph 1 also contains «Xending Capital»; (g) approved title line in capitals while the HTML has sentence case.
      Must still THROW `'texto aprobado'`: invented block (`<p>Tasa preferencial</p>` → message contains `«Tasa preferencial»`), missing card description (message contains `falta`), changed word «Plazos variables» (message contains `esperado «Plazos flexibles»`), accent removed «Liquidez agil», digit changed «1 a 30 días», mixed case «liquidez Ágil», a line split with foreign text in the middle, `copy_mode: 'none'` with text.
      Files: `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts`
      Verify: `npm test -- supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts` — the new legit-variant tests FAIL with «cambió el orden, las mayúsculas o la puntuación» (record this in your step output as the reproduction), the must-throw tests pass.

- [ ] 2. Implement the line-multiset copy check in `supabase/functions/_shared/designCanvasHtml.ts` (depends on 1).
      - `normalizeCopy`: also map `[\u2010-\u2015\u2212]` → `-` and `\u2026` → `...` (keep existing quote/invisible/whitespace rules; update its doc comment).
      - Replace `copyDifference` with `copyMismatch(blocks: string[], approved: string, current: string[]): string | null` (doc comment explaining the allowances above). Algorithm: `compact = normalizeCopy(t).replace(/\s/g, '')`; `hay = blocks.map(compact).join('')`; approved lines = `approved.split('\n')` normalized, non-empty, matched longest-first; each match is cut once and replaced by a separator `\u0001`. Match = `indexOf` as written, else case-insensitive via `toLocaleUpperCase('es')` accepted only if the line is all-caps or the matched HTML segment is all-caps (skip the case fallback if uppercasing changes string length). Second pass for still-unmatched lines on `hay` and lines with `[*\u2020\u2021]` removed. Any unmatched line → hint: the HTML block sharing most lowercase words with it ⇒ `(cambió: esperado «line» · recibido «block»)`, else `(falta: «line»)`. Then each leftover segment (`hay.split('\u0001')`): remove occurrences of compact `current` blocks (longest first, markers stripped if pass 2 ran); if `/[\p{L}\p{N}]/u` remains → `(sobra: «original HTML block containing it»)`. Return `null` when everything matches.
      - In `finalizeDesignCanvasHtml` replace the body of `if (request.copy_mode) {…}` (the `visible/expected/kept/remaining/matches` logic) with one call: `copyMismatch(textBlocks(html), request.copy_mode === 'literal' ? request.approved_copy! : '', request.current_html ? textBlocks(request.current_html) : [])` and `reject(\`El HTML no conservó el texto aprobado${problem}. La versión anterior sigue disponible.\`)`. Update the comment that says «complete and in order».
      - Update the now-intentionally-changed assertions: `designCanvasHtmlCopy.test.ts` «still rejects … reordered text and typed capitals» (reordered and all-caps now pass; keep the brand-logo and missing-text rejections; move the two to expectations of acceptance), and `designCanvasHtml.test.ts` L135 and L143 (reordered lines now accepted; replace with a changed-word rejection so the test keeps guarding something). Do not weaken any other assertion.
      Files: `supabase/functions/_shared/designCanvasHtml.ts`, `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts`, `supabase/functions/_shared/__tests__/designCanvasHtml.test.ts`
      Verify: `npm test -- supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts supabase/functions/_shared/__tests__/designCanvasHtml.test.ts` — all pass, including every item-1 test.

- [ ] 3. Align the prompt with the check in `buildDesignCanvasHtmlMessages` (same file; depends on 2).
      In the `TEXTO LITERAL:` sentence replace «con las mismas palabras, signos, tildes, mayúsculas y orden» with wording that says: each line of approved_copy goes complete, copied character by character (same words, signs, accents and capitals), in one block or consecutive blocks; the order of lines in the HTML may follow the composition (e.g. the card grid); never separate the `*` mark from its text; approved_copy wins over the texts of HTML ACTUAL and RESULTADO ACTUAL when they differ. Keep the existing phrases asserted by tests: `text-transform`, `No copies texto visible de las referencias`, `puedes conservar, tal cual y en su propio bloque`. Add one assertion in `designCanvasHtmlCopy.test.ts` that the system prompt no longer requires «y orden» and mentions the `*` rule.
      Files: `supabase/functions/_shared/designCanvasHtml.ts`, `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts`
      Verify: `npm test -- supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts supabase/functions/_shared/__tests__/designCanvasHtml.test.ts` — pass. If `deno` is on PATH also `deno check supabase/functions/generate-design-html/index.ts` (otherwise state it was skipped).

  Needs verification at runtime (cannot be done here, no deploy allowed): after the user runs `supabase functions deploy generate-design-html`, repeat «Aplicar al diseño actual» on the Xending slide; it should produce the proposal, or fail naming the exact block (`falta/sobra/cambió: esperado … · recibido …`) for the user to report. Put that command and this check in the final output.

---

## BUG 2 — «Salir conservando el último borrador guardado» no hace nada

### Root cause (confirmed by reading code)
The button lives in `src/components/presentations/SlideGeneratorPanel.tsx` footer: `<button disabled={busy || fileBusy} onClick={props.onClose}>`. Inside «Diseñar diapositiva» the panel is embedded by `src/components/presentations/UnifiedDesignWorkspace.tsx` (~L205-214) with `embedded externalConversation … onClose={() => {}}` — a no-op. So the click does nothing: the red `error` stays (it is panel state set by `run(…, true)` when `requestHtml` throws), and the panel's IndexedDB draft keeps a proposal whose `target.revision` is older than the slide (`changed` → yellow banner «El documento cambió desde esta propuesta…»), which is still what the preview shows.

### Decision
In conversation mode (`externalConversation`) the button restores the panel to its last saved draft for the current version: re-read the stored draft, release an unconfirmed request (HTML generation keeps no server result, same rule as `discardPending`), drop the proposal only if it was made for another revision (the conversation keeps it in its versions), clear the panel error, then call `props.onClose()` so the host clears its own error. Standalone mode keeps today's behavior (closes the panel) because there the stale proposal has no other copy. The pure part goes into `htmlDesignDraft.ts` so it can be unit-tested (no DOM test infra in the repo; installing jsdom/testing-library is not allowed).

### Items

- [ ] 4. Add the failing test FIRST, then the pure helper `leaveHtmlDesignDraft` (independent of items 1-3).
      In `src/lib/presentations/htmlDesignDraft.ts` export `leaveHtmlDesignDraft(saved: HtmlDesignDraft | null, current: HtmlDesignDraft, target: HtmlDesignTarget): HtmlDesignDraft`: base = `saved ?? current` (structuredClone), `status: 'ready'`, `proposal` kept only when its `target` has the same document, slide and revision as `target`, otherwise `null`; instruction/copy/references/messages preserved. Short doc comment in the file's style.
      Tests in `src/lib/presentations/__tests__/htmlDesignDraft.test.ts` (reuse `draft()`/`proposal()` fixtures): stale proposal (revision 2 vs target revision 3) → `proposal === null`, status `'ready'`, messages/references kept; same-revision proposal kept; `status: 'uncertain'` saved draft → `'ready'`; `saved = null` falls back to `current`; result passes `assertHtmlDesignDraft`.
      Files: `src/lib/presentations/htmlDesignDraft.ts`, `src/lib/presentations/__tests__/htmlDesignDraft.test.ts`
      Verify: write the tests before the helper and run `npm test -- src/lib/presentations/__tests__/htmlDesignDraft.test.ts` (fails: not exported); after implementing, all pass.

- [ ] 5. Wire the exit handler (depends on 4).
      `SlideGeneratorPanel.tsx`: add `async function leave(life: Life)` inside `HtmlDesignWorkspace`: `const record = await life.store!.read(); await assertSession(life); if (record) life.revision = record.revision; const next = leaveHtmlDesignDraft(record?.value ?? null, draftRef.current, currentTarget()); await persist(next); draftRef.current = next; setDraft(next); if (next.proposal) notifyProposal(next.proposal, 'recovered');`. Footer button `onClick`: if `!props.externalConversation || !ready` → `props.onClose()` (unchanged behavior); else `void run(async life => { await leave(life); latest.current.onClose(); })`. Label unchanged.
      `UnifiedDesignWorkspace.tsx`: for the HTML `SlideGeneratorPanel` replace `onClose={() => {}}` with `onClose={() => setLocalError('')}` (leave the `DesignToHtmlPanel` one as is; it has no such button).
      Files: `src/components/presentations/SlideGeneratorPanel.tsx`, `src/components/presentations/UnifiedDesignWorkspace.tsx`
      Verify: `npm run type-check` passes; `npm run lint` shows no new errors in the two files (compare with `git stash`-free baseline: only report errors in changed lines); `npm test -- src/lib/presentations` passes.
      Needs verification at runtime: `npm run dev`, open «Diseñar diapositiva» on a slide whose HTML draft holds a proposal from an older revision, force an HTML failure (or use the existing failed state), click «Salir conservando el último borrador guardado»: the red error disappears, the yellow «El documento cambió…» banner disappears, the preview shows «Documento actual», and «Aplicar al diseño actual» can be sent again. If you cannot drive the browser, say so explicitly and leave it as a user check in the final output; you may add a temporary `console.debug('🔍 DEBUG-TEMP: leave', …)` while checking and must remove it.

---

## Final checks and hand-off
- [ ] 6. Full verification and local commit.
      Run `npm test` (whole suite; pre-existing failures unrelated to these files must be reported, not fixed), `npm run type-check`, `npm run lint`. Confirm no `🔍 DEBUG-TEMP:` remains (search the changed files). Commit locally, staging only: `supabase/functions/_shared/designCanvasHtml.ts`, `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts`, `supabase/functions/_shared/__tests__/designCanvasHtml.test.ts`, `src/lib/presentations/htmlDesignDraft.ts`, `src/lib/presentations/__tests__/htmlDesignDraft.test.ts`, `src/components/presentations/SlideGeneratorPanel.tsx`, `src/components/presentations/UnifiedDesignWorkspace.tsx`. Two commits are fine: `fix: el texto aprobado se valida por líneas y acepta cambios de acomodo, mayúsculas y marcas` and `fix: «Salir conservando el último borrador guardado» vuelve al borrador guardado de la versión actual`. Never push.
      Final output for the user must include the deploy command (only the edge function changed server-side):
      ```powershell
      supabase functions deploy generate-design-html
      ```
      and note that the frontend change only needs the Vite dev server reload (no restart of Supabase).
