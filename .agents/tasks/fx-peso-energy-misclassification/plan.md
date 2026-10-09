# Implementation Plan — FX/energy misclassification + no-invented-data rule

Work directly in `f:\ScoryDesign` (no worktree). No commits, no push, no new dependencies, no refactors beyond what is listed.

## Context (read once)

- Flow: `supabase/functions/generate-news-visuals/index.ts` → `buildResolverMessages` (LLM) → `coerceResolutions(parsed.data, body.slide_plan)` → `buildSlideVisuals`. Nothing else imports the resolver/prompt builder.
- Files touched: `supabase/functions/_shared/news/newsVisualResolver.ts`, `newsPromptBuilder.ts`, `archetypes.ts` (only `archetypeFx` and two lines of `archetypeEnergy`), `newsStyleV1.ts` (only `NEWS_NO_LOGO_DIRECTIVE`). New test: `supabase/functions/_shared/news/__tests__/newsVisualResolver.test.ts`.
- `news-types.ts` is NOT modified (frontend imports `NewsSlideVisual`/`NewsSlidePlan` from it).
- Commands: `npm run test` (= `vitest --run`; Vitest has no `include` filter, so `__tests__` under `supabase/functions` is picked up, same as `_shared/desaing/__tests__`). `npm run type-check` (= `tsc -b`, covers `src/` + transitive `news-types.ts`). `npm run lint` (ignores `supabase/functions/**`; run anyway per repo rules). Test import style (from `_shared/desaing/__tests__/formats.test.ts`): `import { describe, expect, it } from 'vitest';` and relative imports with `.ts` extension (`'../newsVisualResolver.ts'`).
- `newsVisualResolver.ts` only does `import type { OpenAIMessage } from '../callOpenAI.ts'`, so it runs under Vitest without Deno. `newsPromptBuilder.ts` imports only `newsStyleV1.ts`, `archetypes.ts`, `news-types.ts` (all pure).

## Design decisions (fixed — do not re-decide)

1. Headline is the narrative. Every deterministic keyword guard that can override the LLM (FX, energy, energy+competing) matches on the normalized HEADLINE only (`normalizeForMatch`, padded with spaces). The existing equities and central-bank guards keep their current any-text matching (`paddedText`) because they run after FX/energy and are not part of this bug.
2. FX signal = FX keyword in headline, OR (LLM domain in `FX_DOMAINS` or LLM archetype `fx`, with `confidence >= NEWS_CONFIDENCE_THRESHOLD`, AND the headline has no energy keyword). Gap resolved: when the headline names only oil (e.g. "Brent arriba de 90") and the LLM says fx, the headline wins → energy (same principle as the Brent/bonds bug).
3. FX branch goes right after the executive-wrap branch and BEFORE the LLM-mixed branch, so "El peso gana por alza del petróleo" stays `fx` even if the LLM returned `story_type: "mixed"` with an energy secondary (user: "no domina", not mixed_macro). It also precedes equities/central-bank (REGLA DE FX: "por la Fed" doesn't change the domain).
4. FX branch sets `archetype='fx'`, `domain='fx'`, `storyType` stays `'single'` (no secondary fields). Engine/layout are set to `editorial_photography_plus_data`/`L1` only when the LLM did NOT already pick `fx` (keeps the LLM's globe-vs-desk variety when it was right).
5. Subordinate energy cue on FX: added only when the HEADLINE has an energy keyword (oil is the stated cause). A subcopy-only mention ("ante optimismo económico, petrolero y geopolítico" — one of several drivers) adds no cue. The cue goes into `supporting_elements` (max 3 kept), never as a secondary subject, never the energy STYLE block.
6. Strict energy signal = `!equitiesHeadline && (energyHeadline || llmEnergy)`, where `llmEnergy` = LLM domain in `ENERGY_DOMAINS` or LLM archetype `energy`, with confidence >= threshold. `equitiesHeadline` (EQUITIES_KEYWORDS in the headline) blocks energy so "Wall Street sube por petroleras" falls to the equities guard.
7. Competing primary (energy+Fed/rates → mixed_macro) becomes HEADLINE-keyword only; the LLM-domain check is dropped. Reason: with domain `bonds` from the LLM (the original Brent bug) the old domain check would turn "Brent arriba de 90" into mixed_macro. "La Fed sube el tono y el petróleo presiona" still has `fed` + `petroleo` in the headline → mixed_macro unchanged.
8. Coherence: when the final archetype differs from the LLM's archetype AND the final archetype is one of the guard-forced single-theme archetypes (`fx`, `energy`, `equities`, `central_bank`), replace `visual_subject`, `physical_context` and `supporting_elements` with a coherent default for that archetype. `mixed_macro` (keeps LLM primary on purpose), `executive_wrap` and `fallback_*` are left as today. No debug/QA field is added (keeps `NewsVisualResolution` and the persisted `visual_plan` unchanged).
9. No-invented-data: new `DATA RULES` block in the image prompt, built from a verbatim figure whitelist (headline + subcopy + key_data). Applies to all archetypes; it explicitly overrides any STYLE note that allows readable figures (e.g. equities boards) — other screens/boards stay blurred/illegible. The IMPORTANT block and `NEWS_NO_LOGO_DIRECTIVE` stop forbidding numerical data: headline, source, date, slide number and branding are still composited externally; whitelisted figures may appear as chart micro-labels.
10. FX pair label is NOT auto-detected; the rule says "only the currency pair of this story (e.g. USD/MXN)". Brent/WTI labels for energy are allowed only if the word appears in the story text (case-insensitive check).

---

- [ ] 1. Resolver: FX keywords/domains, headline-only energy, competing, equities-headline helpers.
      File: `supabase/functions/_shared/news/newsVisualResolver.ts`, section "Guardia de energía" (L66–186) and the equities section (L190–234).
      Changes:
      - `ENERGY_KEYWORDS` (L88–103): remove `'petrol'`; add `'petroleo'` (covers petroleos), `'petrolera'` (covers petroleras), `'petrolero'` (covers petroleros), `'combustible'` (covers combustibles). Keep the rest as is (`brent, wti, crudo, barril, opep, opec, ormuz, hormuz, gasolina, diesel, refiner, oleoduct, ' oil'`). Update the doc comment: "Señales de petróleo/energía en el TITULAR (sin acentos, minúsculas). Solo cuentan en el titular."
      - Add after `normalizeForMatch`:
        ```ts
        /** Titular normalizado con padding: la señal fuerte de las guardias que sobreescriben al LLM. */
        function paddedHeadline(plan: NewsSlidePlan): string {
          return ` ${normalizeForMatch(plan.headline ?? '')} `;
        }
        ```
      - Add a new section "Guardia de FX" (before the energy section's `hasEnergySignal`):
        ```ts
        const FX_DOMAINS = new Set(['fx', 'currency', 'currencies', 'forex', 'exchange_rate']);
        /** Frases de divisa/tipo de cambio. NO "peso"/"dolar" sueltos ("tiene peso", "90 dolares"). " yen" con espacio para no chocar con "incluyen". */
        const FX_KEYWORDS = [
          'tipo de cambio', 'usdmxn', 'usd/mxn', 'peso mexicano', 'el peso', 'superpeso',
          'divisa', 'dolar a peso', 'dolar frente al peso', 'frente al dolar', 'eurusd', ' yen', 'euro frente',
        ];
        function hasFxHeadline(plan: NewsSlidePlan): boolean {
          const h = paddedHeadline(plan);
          return FX_KEYWORDS.some((k) => h.includes(k));
        }
        /** Cue de energía SUBORDINADO dentro de una nota FX (el petróleo es la causa, no el sujeto). */
        const FX_ENERGY_CUE =
          'a very subtle, softly-blurred oil hint in the background (e.g. a distant oil barrel or faint crude-oil cue) — small, subordinate to the exchange-rate subject, never dominant, no label and no price';
        ```
      - Replace `hasEnergySignal(domain, plan)` (L181–185) with:
        ```ts
        /** Señal fuerte de energía en el TITULAR. Una mención de paso en subcopy/dato no fuerza energía. */
        function hasEnergyHeadline(plan: NewsSlidePlan): boolean {
          const h = paddedHeadline(plan);
          return ENERGY_KEYWORDS.some((k) => h.includes(k));
        }
        ```
      - Replace `hasCompetingPrimary(domain, plan)` (L188–192) with a headline-only version `hasCompetingPrimary(plan: NewsSlidePlan)` using `paddedHeadline` + `COMPETING_KEYWORDS` (no domain check; update its comment per decision 7). `COMPETING_DOMAINS` becomes unused → delete it and its comment block.
      - In the equities section add:
        ```ts
        /** Equities en el TITULAR: bloquea la guardia de energía ("Wall Street sube por petroleras"). */
        function hasEquitiesHeadline(plan: NewsSlidePlan): boolean {
          const h = paddedHeadline(plan);
          return EQUITIES_KEYWORDS.some((k) => h.includes(k));
        }
        ```
      - Add the coherence table (new section after `MIXED_ENERGY_CUE`):
        ```ts
        /** Dirección coherente cuando una guardia cambia el arquetipo del LLM: evita "Primary subject: currency screen" + STYLE de energía. */
        const GUARD_DIRECTION: Partial<Record<NewsArchetypeId, { visual_subject: string; physical_context: string; supporting_elements: string[] }>> = {
          fx: {
            visual_subject: 'a bright, minimal financial trading desk with real monitors showing a softly-blurred exchange-rate chart of the currency pair in the story',
            physical_context: 'modern financial office with daylight, foreign-exchange desk',
            supporting_elements: ['one thin exchange-rate chart line'],
          },
          energy: {
            visual_subject: 'a coastal oil terminal and storage tank farm under soft daylight',
            physical_context: 'real oil and fuel infrastructure (terminal, pipes, valves)',
            supporting_elements: ['pipes and valves', 'one thin crude price line'],
          },
          equities: {
            visual_subject: 'a stock-exchange trading floor with large overhead market display boards',
            physical_context: 'stock exchange / financial district',
            supporting_elements: ['subtle ticker ribbon glow'],
          },
          central_bank: {
            visual_subject: 'the neoclassical stone facade of a central-bank headquarters, empty of people',
            physical_context: 'central-bank institution',
            supporting_elements: ['a small policy-rate dial'],
          },
        };
        ```
      Verify: `npm run test` — existing suites still pass (the file won't compile-check in Vitest until item 2 uses the new helpers; unused functions are fine for esbuild).

- [ ] 2. Resolver: new branch order, strict energy, coherence in `coerceResolutions`. (Depends on 1.)
      File: `newsVisualResolver.ts`, `coerceResolutions` body (L375–502).
      Changes:
      - After `let archetype = pick(...)` add `const llmArchetype = archetype;` (the LLM's own choice, before overrides).
      - Replace the signal block (L401–404) with:
        ```ts
        const normDomain = rawDomain.toLowerCase().trim();
        const llmConfident = confidence >= NEWS_CONFIDENCE_THRESHOLD;
        const energyHeadline = hasEnergyHeadline(plan);
        const equitiesHeadline = hasEquitiesHeadline(plan);
        const llmFx = llmConfident && (FX_DOMAINS.has(normDomain) || llmArchetype === 'fx');
        const llmEnergy = llmConfident && (ENERGY_DOMAINS.has(normDomain) || llmArchetype === 'energy');
        // FX es FX: titular de divisa, o el LLM eligió fx (salvo que el titular sea solo de petróleo).
        const fxSignal = hasFxHeadline(plan) || (llmFx && !energyHeadline);
        // Energía estricta: señal fuerte (titular o LLM confiado), nunca una mención de paso en subcopy.
        const energySignal = !equitiesHeadline && (energyHeadline || llmEnergy);
        const competing = hasCompetingPrimary(plan);
        const equitiesSignal = hasEquitiesSignal(rawDomain, plan);
        const centralBankSignal = hasCentralBankSignal(rawDomain, plan);
        ```
      - Insert a new `else if (fxSignal)` branch between the wrap branch and the `llmStoryType === 'mixed'` branch:
        ```ts
        } else if (fxSignal) {
          // Guardia FX: una nota de peso/tipo de cambio es FX aunque el petróleo, la Fed
          // o el crudo aparezcan como CAUSA. Precede a energía y a la mixta del LLM:
          // "El peso gana por el petróleo" es FX con un guiño de energía subordinado.
          archetype = 'fx';
          domain = 'fx';
          if (llmArchetype !== 'fx') {
            engine = 'editorial_photography_plus_data';
            layout = 'L1';
          }
        } else if (llmStoryType === 'mixed' ...
        ```
        Leave the other branches' bodies untouched (they now read the stricter `energySignal` / headline `competing`).
      - Before `return {`, compute coherence + cue:
        ```ts
        const coherent = archetype !== llmArchetype ? GUARD_DIRECTION[archetype] : undefined;
        const fxEnergyCue = archetype === 'fx' && energyHeadline;
        const baseSupporting = coherent ? coherent.supporting_elements : toStrArray(o.supporting_elements);
        const supporting = fxEnergyCue
          ? [...baseSupporting.slice(0, 2), FX_ENERGY_CUE]
          : baseSupporting.slice(0, 3);
        ```
        and in the returned object use `physical_context: coherent?.physical_context ?? toStr(o.physical_context)`, `visual_subject: coherent?.visual_subject ?? toStr(o.visual_subject)`, `supporting_elements: supporting`.
      - Update the JSDoc of `coerceResolutions` bullet list: add "guardia FX (titular de divisa) antes que energía", "energía solo con señal fuerte (titular o LLM confiado)", "coherencia de sujeto cuando una guardia cambia el arquetipo".
      Verify: `npm run test` passes (no regressions in other suites).

- [ ] 3. Resolver LLM prompt: REGLA DE FX, FX mechanism/economic_object, energy-as-subject. (Independent of 1–2.)
      File: `newsVisualResolver.ts`, `buildResolverMessages` system string (L298–330).
      Changes (Spanish, append to the existing bullet text; keep everything else verbatim):
      - `mechanism:` bullet — after the list add: ` Para FX, mechanism se expresa desde la perspectiva de la divisa del TITULAR: appreciates (se aprecia/gana/se fortalece), depreciates (se deprecia/pierde/presión) o breaks_level (rompe un nivel). Ej. "El peso rompe 18" = appreciates o breaks_level, aunque el par USD/MXN baje.` Also add `appreciates, depreciates` to the parenthesized list.
      - `economic_object:` bullet — append: ` Para FX incluye el par y su dirección (ej: "USD/MXN falls").`
      - `archetype:` bullet — insert before `REGLA DE BANCO CENTRAL`: `REGLA DE FX: si el titular trata de una divisa o tipo de cambio (el peso, peso mexicano, superpeso, USD/MXN, dólar frente a otra moneda, euro, yen), usa archetype "fx" y domain "fx" con story_type "single". Los drivers citados como causa ("ante optimismo petrolero", "por el crudo", "por la Fed") NO cambian el dominio ni vuelven mixta la nota; a lo sumo el petróleo aparece como un guiño sutil subordinado, nunca como escena de energía.` In `REGLA DE PETRÓLEO` change `si la nota es PURAMENTE de petróleo, crudo, Brent, WTI, OPEP, gasolina o geopolítica energética` → `si el SUJETO de la nota es petróleo, crudo, Brent, WTI, OPEP, diésel, gasolina, combustibles o precios del crudo, o geopolítica energética`, and append after its first sentence: ` Una mención de paso del petróleo como causa de otra cosa (divisa, bolsa, comercio) NO hace la nota "energy".`
      - `story_type:` bullet — append: ` Excepción: una nota de divisa con un driver citado como causa ("El peso gana por el petróleo") es "single" con archetype "fx".`
      Verify: `npm run test` passes (prompt-text assertions in item 6 check `REGLA DE FX` is present).

- [ ] 4. FX archetype direction/color + energy label tweak.
      File: `supabase/functions/_shared/news/archetypes.ts`.
      Changes:
      - `archetypeFx.prompt` (L36–51): replace the line `Layer only a subtle Xending data accent: one thin turquoise chart/exchange-rate line or a small rate label. No floating currency symbols, no flat/cartoon icons.` with:
        ```
        The data accent is the exchange-rate chart of the currency pair in the story (e.g. USD/MXN): one thin chart line, optionally a small rate micro-label using only a figure from the story.

        Tie the accent color to the direction of the HEADLINE currency, not to the slope of the line: if the local currency appreciates or strengthens (e.g. the peso gains, even when the USD/MXN line goes DOWN), use a thin turquoise (#2ED4C7) line; if it depreciates or is under pressure, use restrained coral (#FF7A4A).

        If the story cites oil or energy as the cause, you MAY add only a small subordinate energy hint (e.g. a faint, softly-blurred oil barrel or oil cue in the background). It never dominates, never becomes an oil or refinery scene and carries no Brent/WTI label.

        No floating currency symbols, no flat/cartoon icons.
        ```
        Do NOT use the words "energy scene" in this archetype (tests assert the FX prompt has no "energy scene").
      - `archetypeEnergy.prompt`: option (e) `with a subtle Brent/WTI price chart` → `with a subtle crude price chart`; and `one thin turquoise price line or a small "Brent"/"WTI" label.` → `one thin turquoise price line, or a small "Brent"/"WTI" label only if the story names it.` Keep every other line, including the `This is an ENERGY story: do NOT show ...` exclusions, verbatim.
      - No other archetype is touched.
      Verify: `npm run test` passes.

- [ ] 5. Prompt builder: figure whitelist, DATA RULES block, IMPORTANT edit; no-logo directive edit.
      Files: `supabase/functions/_shared/news/newsPromptBuilder.ts`, `supabase/functions/_shared/news/newsStyleV1.ts`.
      Changes in `newsPromptBuilder.ts`:
      - Export a pure helper (above `buildSlideVisual`):
        ```ts
        /**
         * Cifras permitidas en la imagen: las que aparecen TAL CUAL en titular + subcopy + dato
         * (ej. "17.99", "18.00", "18", "4.5%"), en orden de aparición y sin duplicados.
         * Nada fuera de esta lista puede aparecer como número en la imagen.
         */
        export function extractAllowedFigures(plan: NewsSlidePlan): string[] {
          const text = `${plan.headline ?? ''}\n${plan.subcopy ?? ''}\n${plan.key_data ?? ''}`;
          const found = text.match(/\d+(?:[.,]\d+)*%?/g) ?? [];
          return [...new Set(found)];
        }
        ```
        (`\d+(?:[.,]\d+)*` keeps "17.99"/"1,250.5" whole and drops a trailing sentence period: "18." → "18".)
      - Add a private `buildDataRules(plan: NewsSlidePlan, archetypeId: NewsArchetypeId): string` (import `NewsArchetypeId` type from `./news-types.ts`):
        ```ts
        const figures = extractAllowedFigures(plan);
        const figuresRule = figures.length
          ? `Allowed figures (verbatim from the story): ${figures.join(', ')}\nChart numbers, axis values, labels and micro-labels may use ONLY these figures, written exactly as listed.`
          : 'The story contains no figures: the chart has NO numbers at all — lines only, no axis values, no numeric labels.';
        const lower = `${plan.headline ?? ''} ${plan.subcopy ?? ''} ${plan.key_data ?? ''}`.toLowerCase();
        let assetRule: string;
        if (archetypeId === 'fx') {
          assetRule = 'Allowed asset labels: only the currency pair of this story (e.g. USD/MXN). No Brent, no WTI, no stock indices, no other currencies or assets.';
        } else if (archetypeId === 'energy') {
          const named = ['Brent', 'WTI'].filter((t) => lower.includes(t.toLowerCase()));
          assetRule = named.length
            ? `Allowed asset labels: ${named.join(', ')} only. No currency pairs, no stock indices, no other assets.`
            : 'Allowed asset labels: none — do not label Brent or WTI (not named in the story). No currency pairs, no stock indices, no other assets.';
        } else {
          assetRule = 'Allowed asset labels: only assets named verbatim in the story.';
        }
        return `DATA RULES (no invented data — overrides any style note above that allows readable figures)
        ${figuresRule}
        ${assetRule}
        No invented figures. No invented tickers. No prices or charts of other assets. No "accompanying" or decorative data that is not in the story. Any other screen, board or document in the scene stays softly blurred and illegible.`;
        ```
        (Write the template without leading indentation on continuation lines, like the existing prompt template.)
      - In the `prompt` template: insert `${buildDataRules(plan, resolution.archetype)}` + blank line between `${NEWS_STYLE_DIRECTIVES}` and `IMPORTANT`.
      - IMPORTANT block (L127–128): replace the two lines with:
        ```
        The exact headline, source, date, slide number and branding will be added later by Xending Design.
        Do not render them into the generated image.
        Numerical data may appear inside the image only as chart figures or micro-labels taken verbatim from the allowed figures in DATA RULES; if there are none, render no numbers.
        ```
      - File header comment (L9–13): change "El texto, las cifras, la fuente, la fecha y el branding NO van en la imagen" → "El titular, la fuente, la fecha, el número de slide y el branding NO van en la imagen; las cifras solo pueden ir como micro-labels del gráfico y únicamente las que vienen tal cual en el texto (DATA RULES)". Add `+ DATA_RULES` to the structure line.
      Change in `newsStyleV1.ts` (`NEWS_NO_LOGO_DIRECTIVE`, L72–74), minimal wording only:
      - `No text, no logos, no watermarks, no signage with readable text.` → `No text (other than the allowed chart figures and micro-labels), no logos, no watermarks, no signage with readable text.`
      - `so headline, data, source, date and branding can be composited externally afterwards.` → `so headline, source, date and branding can be composited externally afterwards.`
      Verify: `npm run test` passes; `npm run type-check` passes.

- [ ] 6. Tests. (Depends on 2–5.)
      File (new): `supabase/functions/_shared/news/__tests__/newsVisualResolver.test.ts`.
      Setup: `import { describe, expect, it } from 'vitest';`, `import { buildResolverMessages, coerceResolutions } from '../newsVisualResolver.ts';`, `import { buildSlideVisual, extractAllowedFigures } from '../newsPromptBuilder.ts';`, `import type { NewsSlidePlan } from '../news-types.ts';`. Helpers:
      ```ts
      const plan = (headline: string, subcopy = '', key_data = ''): NewsSlidePlan => ({
        slide_number: 1, headline, subcopy, key_data, data_label: '', secondary_data: '', source: [], editorial_type: 'market_update',
      });
      const llm = (o: Record<string, unknown>) => ({ slides: [{ slide_number: 1, visual_confidence: 0.8, story_type: 'single',
        mechanism: 'rises', visual_engine: 'editorial_photography_plus_data', layout_family: 'L1', text_safe_area: 'left', ...o }] });
      const resolve = (p: NewsSlidePlan, o: Record<string, unknown>) => coerceResolutions(llm(o), [p])[0];
      ```
      Cases (use accented Spanish in inputs to exercise normalization):
      - (a) `PESO = plan('El peso rompe 18 ante optimismo', 'El tipo de cambio se ubicó en 17.99, tras un mínimo de 17.91, por debajo de 18.00, por el retroceso del dólar y el apetito por riesgo ante optimismo económico, petrolero y geopolítico.')`.
        - a1: LLM `{ domain: 'fx', archetype: 'fx', visual_subject: 'currency trading screen with a downward USD/MXN chart' }` → `archetype 'fx'`, `domain 'fx'`, `story_type 'single'`, `visual_subject` unchanged (LLM already right), no FX_ENERGY_CUE (`supporting_elements.join(' ')` does not contain `oil`).
        - a2: LLM `{ domain: 'energy', archetype: 'energy', visual_subject: 'oil refinery at dusk', supporting_elements: ['oil tanker'] }` → `archetype 'fx'`, `domain 'fx'`, `visual_subject` does not match `/oil|refinery/i` and contains `exchange-rate`.
        - a3 (prompt, from a2's resolution): `buildSlideVisual(PESO, r).image_prompt` contains `about foreign exchange and currency markets`, does not contain `energy scene` nor `This is an ENERGY story`; contains `17.99`, `17.91`, `18.00`; contains `No Brent, no WTI, no stock indices`; the `Primary subject:` line (split prompt by `\n`, find line starting with `Primary subject:`) does not match `/oil|refinery/i`.
        - a4: `extractAllowedFigures(PESO)` equals `['18', '17.99', '17.91', '18.00']`.
      - (b) `plan('El peso gana por alza del petróleo')`:
        - b1: LLM `{ domain: 'fx', archetype: 'fx' }` → `fx`, `story_type 'single'`, `supporting_elements` contains an element matching `/oil/` (the subordinate cue).
        - b2: LLM `{ domain: 'fx', archetype: 'mixed_macro', story_type: 'mixed', secondary_domain: 'energy', secondary_visual_subject: 'oil refinery' }` → `archetype 'fx'`, `story_type 'single'`, `secondary_visual_subject` undefined; prompt has no `This is an ENERGY story`, no `Secondary subject:`, no `mixed macro`.
      - (c) `plan('Brent arriba de 90')`: LLM `{ domain: 'bonds', archetype: 'bonds', visual_subject: 'U.S. Treasury building' }` → `archetype 'energy'`, `domain 'energy'`, `visual_engine 'industrial_macro'`; also with LLM `{ domain: 'commodities', archetype: 'bonds' }` → energy. Prompt contains `Allowed asset labels: Brent only` and `90`.
      - (d) `plan('Gasolina sube en México')`: LLM `{ domain: 'commodities', archetype: 'fallback_industrial_macro' }` → `energy`; prompt contains `do not label Brent or WTI`.
      - (e) `plan('Wall Street sube por petroleras')`: LLM `{ domain: 'equities', archetype: 'equities' }` → `equities`; LLM `{ domain: 'energy', archetype: 'energy' }` → `archetype` not `energy` (expected `equities`).
      - (f) `plan('La Fed sube el tono y el petróleo presiona')`: LLM `{ domain: 'central_bank', archetype: 'central_bank' }` → `mixed_macro`, `story_type 'mixed'`, `secondary_domain 'energy'`; LLM `{ domain: 'central_bank', archetype: 'mixed_macro', story_type: 'mixed', secondary_domain: 'energy', secondary_visual_subject: 'oil tanker' }` → `mixed_macro` with `secondary_visual_subject 'oil tanker'`.
      - (g) `plan('Banxico mantiene su postura', 'La junta reiteró un tono prudente.')` with LLM `{ domain: 'central_bank', archetype: 'central_bank' }`: `extractAllowedFigures` is `[]`; prompt contains `the chart has NO numbers`; prompt contains `Allowed asset labels: only assets named verbatim in the story.` (archetype central_bank via guard).
      - (h) coherence: `plan('Brent arriba de 90')` with LLM `{ domain: 'fx', archetype: 'fx', visual_subject: 'currency trading screen with downward FX chart', supporting_elements: ['ticker tape glow'] }` → `archetype 'energy'`, `visual_subject` does not match `/currency|fx/i`, `supporting_elements` has no `ticker tape glow`; the prompt's `Primary subject:` line does not match `/currency/i` and the prompt contains `energy scene`.
      - Extra regression: subcopy-only energy on a non-FX headline does not force energy — `plan('Exportaciones crecen en agosto', 'Impulso por optimismo petrolero.')` with LLM `{ domain: 'trade', archetype: 'trade_map' }` → `trade_map`.
      - Extra: low-confidence LLM energy domain no longer forces energy — `plan('Mercados atentos', 'Sesión mixta.')` with LLM `{ domain: 'energy', archetype: 'energy', visual_confidence: 0.3 }` → `fallback_institutional`.
      - Extra: `buildResolverMessages([PESO])[0].content` contains `REGLA DE FX` and `appreciates`.
      - Extra: `buildSlideVisual(PESO, r).image_prompt` IMPORTANT block no longer contains `numerical data, source` and contains `The exact headline, source, date, slide number and branding`.
      Verify: `npm run test -- supabase/functions/_shared/news` → all new tests pass; then full `npm run test` → no regressions.

- [ ] 7. Final verification.
      Run `npm run test`, `npm run type-check`, `npm run lint`. All must pass (lint ignores `supabase/functions/**`, but must stay green). If `deno` is available locally, optionally `deno check supabase/functions/generate-news-visuals/index.ts`; if not, state it was not run. No `🔍 DEBUG-TEMP:` logs left. No commit.

## Notes / accepted risks

- `'el peso'` can false-positive on "el peso de la deuda"; accepted per the user's keyword list.
- Behavior changes beyond the bug, by design: LLM energy domain now needs confidence >= 0.5 to force energy; competing-primary detection is headline-only; equities in the headline now beats energy; FX headlines now beat central-bank/equities guards; DATA RULES make readable figures on equities boards illegible unless they come from the story.
- Deploy (not part of this task): `supabase functions deploy generate-news-visuals`.

## Verification results (iteration 1)

Items 1–7 implemented (see `implementation.md`). Commands run from `f:\ScoryDesign` (pwsh):

- `npx vitest run supabase/functions/_shared/news` → 1 file, 16/16 tests passed.
- `npm run test` → Test Files 7 failed | 218 passed | 1 skipped (226); Tests 15 failed | 3193 passed | 4 skipped (3212). The 15 failures are pre-existing and unrelated: the pilot-limit policy tests in `supabase/functions/_shared/desaing/__tests__/` (serverExploration 3, htmlBackend 1, pilotHttp 4, materialsBackend 1, productionBackend 2, serverGeneration 4) and the legacy suite `docs/UI-handoffv2/legacy/demo-v1/tests/demo-controller.test.mjs`. None import `_shared/news`.
- `npm run type-check` → exit 0.
- `npm run lint` → 2 errors, 601 warnings. Both errors are pre-existing `react-hooks/rules-of-hooks` in `src/hooks/__tests__/useCarouselQueue.sharedGeneration.test.ts` and `useGenerateSlide.canvas.test.ts` (untouched files).
- `deno check` not run (not required). No `🔍 DEBUG-TEMP:` logs. No commit.

## Verification results (iteration 2 — review findings)
Fixes: (1, blocking) `fxSignal = hasFxHeadline || (llmFx && (!energyHeadline || headlineNamesCurrency))` with `headlineNamesCurrency` = `/\bpesos?\b/` on the normalized headline, plus `'al peso'` in `FX_KEYWORDS`; (2) `' yen'` → `' yen '` + `' yenes'`; (3) non-FX archetype closings now read "Do not generate text (other than an allowed chart micro-label) or logos/the Xending logo"; (4) `extractAllowedFigures` skips the day in "N de <mes>" and bare 19xx/20xx years. 5 new tests (article-less peso + LLM fx, "Peso se deprecia por caída del crudo", "Petróleo cae y fortalece al peso", yen/yendo, archetype closing wording, date figures). Case (h) "Brent arriba de 90" + LLM fx → energy still passes.
Commands run from `f:\ScoryDesign` (pwsh):
- `npx vitest run supabase/functions/_shared/news` → 1 file, 21/21 tests passed.
- `npm run test` → Test Files 7 failed | 218 passed | 1 skipped (226); Tests 15 failed | 3198 passed | 4 skipped (3217). Same 15 pre-existing failures as iteration 1 (`_shared/desaing` pilot-limit tests + legacy `demo-controller.test.mjs`); none touch `_shared/news`.
- `npm run type-check` → exit 0.
- `npm run lint` → 603 problems (2 errors, 601 warnings); same 2 pre-existing `react-hooks/rules-of-hooks` errors in untouched hook tests.
- `deno check` not run. No `🔍 DEBUG-TEMP:` logs. No commit.
