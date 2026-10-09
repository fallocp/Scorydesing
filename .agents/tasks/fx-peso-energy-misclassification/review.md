# FX guard, strict energy and no-invented-data rule for Xending News image prompts (pass 2)

A peso/tipo-de-cambio story no longer gets forced into the energy archetype just because the subcopy says "petrolero". A headline-driven FX guard now runs ahead of every energy branch. Energy needs a strong signal: a complete oil/fuel term in the headline, or a confident LLM energy label, and an equities headline blocks it. When a guard overrides the LLM archetype, the subject is replaced so the prompt stays coherent. A DATA RULES block whitelists figures that appear verbatim in the story. This pass checks the iteration-2 fixes for the four prior findings, and all four are in place: the article-less peso fix, `' yen '`/`' yenes'`, aligned archetype closings and dates excluded from the whitelist. `deno check` on the resolver and the prompt builder exits 0.

Watch for: a headline that opens with a bare "Peso …" ("Peso gana por alza del petróleo") stays FX only when the LLM also says `fx`. If the LLM says `energy`, it still becomes an energy scene (confirmed, minor). The new year filter also drops real 4-digit price levels between 1900 and 2099 from the whitelist (likely, fail-safe).

**Verdict**: APPROVED

## High-level view

The FX guard sits right after executive wrap, ahead of LLM-mixed, energy+competing, pure energy, equities and central-bank. A peso story with oil as the cause stays `fx`/`single`, with at most a subordinate oil cue in `supporting_elements`. It never gets the energy STYLE block and never becomes `mixed_macro`. FX is detected from headline phrases (`el peso`, `al peso`, `tipo de cambio`, `usd/mxn`, `superpeso`, `divisa`, `frente al dolar`, ` yen `…; no bare `peso`/`dolar`) or from a confident LLM `fx` label. The LLM path is now disabled only when the headline has an energy word and does not name the peso, so "Brent arriba de 90" + LLM fx still resolves to energy.

Energy is strict. The bare `petrol` substring is replaced by `petroleo`/`petrolera`/`petrolero`/`combustible`, which count only in the headline. LLM energy needs confidence ≥ threshold, and an equities headline blocks energy. Competing-primary detection is headline-only, so "La Fed … petróleo presiona" stays `mixed_macro`. The energy archetype's exclusions are intact.

Coherence comes from `GUARD_DIRECTION`: when the final archetype (fx, energy, equities or central_bank) differs from the LLM's, the subject, physical context and supporting elements are replaced. `news-types.ts` and `NewsVisualResolution` are unchanged.

The figure whitelist is built from headline + subcopy + key_data, without day-of-month numbers or bare 19xx/20xx years. FX allows only the story pair. Energy allows Brent/WTI only when named. The master, IMPORTANT and NO_BRANDING text and every archetype closing now allow whitelisted figures, while headline/source/date/slide number/branding are still composited externally. The FX archetype ties color to the headline currency: turquoise #2ED4C7 for appreciation, coral #FF7A4A for depreciation/pressure. The resolver carries `REGLA DE FX` and the `appreciates`/`depreciates` mechanism convention.

Verification is recorded in implementation.md / plan.md:

- news tests: 21/21 pass;
- full suite: the same 15 pre-existing failures in `_shared/desaing` pilot-limit tests and a legacy demo suite, none touching `_shared/news`;
- `tsc -b`: exit 0;
- lint: 2 pre-existing errors in untouched hook tests.

The diff touches only the four news modules plus the new test file, with no debug logs and no new dependencies.

<details>
<summary>Issues (2)</summary>

1. **Bare headline-initial "Peso …" depends on the LLM (minor, non-blocking)**: "Peso gana por alza del petróleo" with LLM `energy` still resolves to `energy` because no FX phrase matches and `headlineNamesCurrency` only applies when the LLM already said `fx`. Optional: treat a headline that starts with `peso ` (normalized) as an FX keyword, and add a test with LLM `energy`.
2. **Year filter drops real 4-digit levels (minor, fail-safe)**: `/^(?:19|20)\d{2}$/` also removes price levels such as "Oro toca 2045 dólares" or an index at "2010" written without a thousands separator, so those charts render with no number. Optional: skip a 4-digit 19xx/20xx only when it follows "de", "en el" or a month, or when it isn't followed by a unit (dólares/pesos/puntos/%).

</details>

<details>
<summary>Details</summary>

## Iteration-2 fix for the FX/energy gate

```ts
const fxSignal =
  hasFxHeadline(plan) || (llmFx && (!energyHeadline || headlineNamesCurrency(plan)));
```

These cases now behave as intended (confirmed by reading the code and the tests b3/b4/h):

- "Peso gana por alza del petróleo" + LLM fx → fx with the oil cue;
- "Peso se deprecia por caída del crudo" + LLM fx → fx;
- "Petróleo cae y fortalece al peso" (via `al peso`) → fx even with LLM energy;
- "Brent arriba de 90" + LLM fx → energy, with the subject replaced from `GUARD_DIRECTION.energy`.

The remaining gap is narrow (confirmed): without an article and without LLM fx, a peso headline with an oil word still falls to the energy branch. `REGLA DE FX` in the resolver prompt makes LLM fx the likely answer, so this is a residual risk, not a regression. Anchoring `^peso ` at the start of the normalized headline would close it deterministically without reintroducing the "tiene peso" false positive.

The FX branch also precedes an LLM `mixed` result with a non-energy secondary, so "La Fed sube tasas y el peso se desploma" becomes fx/single and drops the Fed. That follows plan decision 3 and `REGLA DE FX` ("por la Fed" doesn't change the domain), so it is treated as deliberate.

## Figure whitelist edge

`extractAllowedFigures` now skips "N de <mes>" and bare years, which fixes the date leak raised in the prior pass. The year check is purely numeric, though: any whitelisted figure matching `^(19|20)\d{2}$` is dropped regardless of context (likely). The failure mode is fail-safe. The chart shows no number rather than an invented one, and the story's `key_data` overlay still carries the figure in the composed piece.

## Test coverage

Cases (a)–(h) and the iteration-2 regressions are all covered. Not tested: a bare "Peso …" headline with LLM `energy` (Issue 1), and a 4-digit price level in the 1900–2099 range (Issue 2).

</details>

<details>
<summary>File map</summary>

- `supabase/functions/_shared/news/newsVisualResolver.ts`: FX guard (keywords incl. `al peso`, ` yen `/` yenes`, `headlineNamesCurrency`, domains, subordinate oil cue), headline-only energy/competing/equities helpers, new branch order, `GUARD_DIRECTION` coherence, resolver prompt `REGLA DE FX` / FX mechanism convention / subject-based `REGLA DE PETRÓLEO`.
- `supabase/functions/_shared/news/archetypes.ts`: FX accent tied to headline-currency direction (turquoise/coral), optional subordinate oil hint; energy option (e) is crude chart, Brent/WTI label only if named; all closings allow an allowed chart micro-label.
- `supabase/functions/_shared/news/newsPromptBuilder.ts`: `extractAllowedFigures` (dates/years skipped), `DATA RULES` block, IMPORTANT allows whitelisted numbers.
- `supabase/functions/_shared/news/newsStyleV1.ts`: `NEWS_NO_LOGO_DIRECTIVE` allows chart figures, drops "data" from the externally composited list.
- `supabase/functions/_shared/news/__tests__/newsVisualResolver.test.ts`: new, 21 tests.

Full diff: `git diff -- supabase/functions/_shared/news` plus the untracked test file.

</details>
