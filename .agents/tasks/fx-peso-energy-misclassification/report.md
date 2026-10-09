# Nota de peso clasificada como "energy": diagnóstico y propuestas

## Respuesta corta

La nota "El peso rompe 18 ante optimismo" sale como energía por una **guardia determinística por keywords** en `coerceResolutions` (`supabase/functions/_shared/news/newsVisualResolver.ts`). Esa guardia se agregó para arreglar el bug de "Brent arriba de 90". Basta con que el titular, el subcopy o el dato contengan la subcadena `petrol` para que la nota se fuerce a `archetype = 'energy'`, `domain = 'energy'` y `engine = 'industrial_macro'`. Se evalúa antes que cualquier otra guardia. **No existe una guardia de FX** y la nota no tiene señales "competidoras" (Fed, tasas, bonos), así que cae directo en la rama de energía pura.

- **¿Una sola mención pesa más que todo lo demás?** Sí. Un solo "petrolero" en el subcopy le gana a "peso", "tipo de cambio", "dólar" y "divisa", porque no hay puntaje, ni peso por titular, ni contrapeso de FX. Lo comprobé replicando la normalización y las listas sobre el texto del ejemplo: energía = `['petrol']`, competidoras = `[]`, equities = `[]`, banco central = `[]`.
- **¿Hay un arquetipo FX?** Sí, `archetypeFx` existe, pero ninguna regla determinística lo protege. Lo más probable es que el LLM sí eligiera `fx`, y la guardia lo sobreescribió.
- **El prompt queda contradictorio.** La guardia cambia el arquetipo y el dominio, pero conserva el `visual_subject` del LLM (pantalla de trading FX). El prompt final dice "Primary subject: currency trading screen" y, más abajo, en el STYLE: "Shoot ONE hyper-realistic energy scene… (a) oil terminal… This is an ENERGY story". El bloque STYLE es más largo, más imperativo y va después, así que en la práctica gana.

---

## Evidencia

### 1. Ruta exacta que convierte la nota en "energy"

Flujo: `generate-news-visuals/index.ts:104-130` → LLM (`buildResolverMessages`) → `coerceResolutions(parsed.data, body.slide_plan)` → `buildSlideVisuals`.

En `newsVisualResolver.ts`:

- **`ENERGY_KEYWORDS` (L88-103):** incluye `'petrol'` (L92), comentado como *cubre "petroleo", "petroleos", "petrolero"*, además de `crudo`, `barril`, ` oil`, etc. Se compara por subcadena.
- **`paddedText` (L169-174):** concatena `headline + subcopy + key_data` sin distinguir dónde aparece la palabra. El titular no pesa más que el subcopy.
- **`hasEnergySignal` (L181-185):** devuelve `true` si el dominio del LLM está en `ENERGY_DOMAINS` **o** si cualquier keyword aparece en cualquier parte del texto.
- **`COMPETING_KEYWORDS` (L137-158):** excluye "dólar" y "peso" a propósito. El comentario de L132-136 lo explica: *"El caso FX-mixto real (ej. 'Petróleo cae y fortalece al peso') lo cubre la clasificación del LLM (story_type), no esta red determinística."* Si el LLM responde `story_type: "single"`, no hay red para FX.
- **Cascada de precedencia en `coerceResolutions` (L409-472):**
  1. `isWrap || archetype === 'executive_wrap'` (L409)
  2. `llmStoryType === 'mixed' && (secondary…)` (L414)
  3. `energySignal && competing` → `mixed_macro` (L425)
  4. **`energySignal` → `archetype='energy'`, `engine='industrial_macro'`, `layout='L1'`, `domain='energy'` (L441-448)**
  5. `equitiesSignal` (L449)
  6. `centralBankSignal` (L458)
  7. confianza < umbral → fallback (L467)

  No hay ninguna rama de FX. La rama 4 ignora el `archetype` del LLM aunque sea `fx` con confianza alta. El comentario dice "una nota PURA de petróleo", pero el código no verifica que lo sea.
- **Huella en el prompt del ejemplo:** `Visual engine: industrial_macro` y `Layout family: L1` son los valores que fija la rama 4. `Primary subject: …currency trading screen…` y `Supporting elements: ticker tape glow…` vienen del LLM y no se tocan. Esa combinación solo ocurre cuando la guardia sobreescribe a un LLM que había resuelto FX.

Efecto colateral del orden: como energía va antes que equities (L449), una nota de bolsa como "Wall Street sube impulsada por petroleras" también se va a energía.

### 2. El arquetipo FX existe y pierde

- `archetypeFx` está en `archetypes.ts:32-52`: globo de vidrio sobre desk o trading desk real, más una línea turquesa de tipo de cambio (L47). Está registrado en `NEWS_ARCHETYPES` (L296) y en `ARCHETYPES` del resolver (L51).
- El prompt del resolver (L309) tiene una REGLA para banco central, petróleo y equities, pero **no para FX**. Solo dice "Usa fx/… solo cuando la nota calza claramente".
- Pierde porque la rama 4 se evalúa sin mirar el `archetype` que eligió el LLM.

### 3. Por qué Mechanism = "rises" y Primary data = "—"

- **Mechanism:** `mechanism: toStr(o.mechanism) || 'holds'` (L477) es texto libre del LLM, sin normalización ni convención de par. "rises" es correcto desde el punto de vista del peso (se aprecia), pero choca con el par USD/MXN, que baja, y con el "downward FX chart" que el mismo LLM puso como sujeto. Ningún código usa `mechanism` para decidir color o dirección. Solo se imprime en el prompt (`newsPromptBuilder.ts:115`). El arquetipo FX tampoco ata el color a la dirección, a diferencia de equities y banco central.
- **Primary data:** sale de `plan.key_data || '—'` (`newsPromptBuilder.ts:113`). El resolver nunca extrae cifras. `key_data` solo se llena en `generate-news-plan`:
  - JSON: `s.key_data ?? s.data ?? s.stat` (`newsInputAdapter.ts:104`).
  - Markdown canónico: solo si existe `**Dato:**` o `**Data:**` (`newsInputAdapter.ts:143`).
  - Texto pegado: lo extrae el LLM normalizador (`newsSlidePlanner.ts:47`).

  Los dos caminos determinísticos no infieren el número desde el subcopy. Si el input venía en markdown o JSON sin campo de dato, o si el normalizador lo dejó vacío, el resultado es "—". No pude verificar por cuál camino entró este caso.

  En la imagen el impacto es bajo, porque el prompt prohíbe renderizar cifras. En la pieza compuesta pesa más: `useNewsEdition.ts:209` usa `key_data` como el dato que se superpone.

### 4. Choque entre VISUAL DIRECTION y STYLE

En `newsPromptBuilder.ts`:

- `archetype = getNewsArchetype(resolution.archetype)` (L40) toma el arquetipo ya sobreescrito (energy).
- `primarySubject = resolution.visual_subject || archetype.label` (L66): el sujeto del LLM se conserva.
- El orden del prompt es MASTER → NEWS CONTEXT (con `Domain: energy`) → VISUAL DIRECTION (`Primary subject: FX screen`) → **STYLE = `archetype.prompt`** (L121-122) → directivas → negativos.
- No hay ningún chequeo de coherencia entre `visual_subject` y el arquetipo.

El STYLE de energía (`archetypes.ts:130-153`) es imperativo y excluyente: "Shoot ONE hyper-realistic energy scene", una lista (a)–(e) de terminal, refinería y tanker, y "This is an ENERGY story: do NOT show … a bank" (L148). Es más largo y va después del sujeto primario, y `Domain: energy` lo refuerza. El generador termina priorizando la escena petrolera, o mezcla las dos.

### 5. Tests

No hay tests del resolver ni del prompt builder. Solo existe `src/hooks/__tests__/newsFxSharedGeneration.test.ts`, que cubre generación compartida y no clasificación.

Vitest (`vitest.config.ts`) no restringe `include`, así que recogería tests en `supabase/functions/_shared/news/__tests__/`, igual que ya pasa con `supabase/functions/_shared/desaing/__tests__/`. `newsVisualResolver.ts` solo importa tipos de `callOpenAI.ts` (`import type`), así que se puede testear con `npm run test` sin Deno.

---

## Propuestas (ordenadas por impacto/riesgo, sin implementar)

### P1. Guardia FX con precedencia sobre la energía. Impacto alto, riesgo bajo.

- **Archivo:** `supabase/functions/_shared/news/newsVisualResolver.ts`.
- **Cambio:**
  - Agregar `FX_DOMAINS` (`fx`, `currency`, `currencies`, `forex`, `exchange_rate`) y `FX_KEYWORDS`. Evitar "peso" y "dólar" sueltos, porque "tiene peso" y "90 dólares" darían falsos positivos. Usar: `tipo de cambio`, `usdmxn`, `usd/mxn`, `peso mexicano`, `el peso`, `superpeso`, `divisa`, `dolar a peso`, `dolar frente al peso`, `eurusd`, `yen`, `euro frente`.
  - Crear `hasFxSignal(rawDomain, llmArchetype, plan)`: verdadero si el LLM dio dominio o arquetipo FX, o si hay keyword FX en el **titular**.
  - Insertar una rama nueva **antes** de las ramas de energía (antes de L425):
    - FX con energía solo en el subcopy → `archetype='fx'`, `domain='fx'`, `engine='editorial_photography_plus_data'`, `layout='L1'`.
    - FX con energía también en el titular (ej. "Petróleo cae y fortalece al peso") → `mixed_macro`, FX como primario y `MIXED_ENERGY_CUE` como secundario (65/35).
- **Riesgo:** bajo. Las notas puramente petroleras no traen señales FX en el titular. Una nota de crudo con "tipo de cambio" en el titular se volvería FX o mixta, que es lo correcto.
- **Prueba:** nuevo `supabase/functions/_shared/news/__tests__/newsVisualResolver.test.ts` que llame a `coerceResolutions` con salidas de LLM simuladas:
  - (a) este caso del peso → `fx`;
  - (b) "Brent arriba de 90" con el LLM respondiendo `bonds` → sigue `energy`;
  - (c) "Petróleo cae y fortalece al peso" → `mixed_macro`;
  - (d) "La Fed sube el tono y el petróleo presiona" → sigue `mixed_macro`.
- **Correr:** `npm run test`, `npm run lint`, `npm run type-check`.

### P2. Darle más peso al titular en la guardia de energía. Impacto alto, riesgo bajo-medio.

- **Archivo:** `newsVisualResolver.ts` (`hasEnergySignal`, `paddedText`).
- **Cambio:** separar la señal en fuerte (keyword en el titular, o dominio energy del LLM) y débil (keyword solo en el subcopy o el dato). La rama 4 (L441) solo fuerza energía con señal fuerte. Con señal débil, se respeta el arquetipo del LLM si no es fallback y tiene confianza ≥ umbral. Así una causa mencionada al pasar ("ante optimismo petrolero", "por alza del crudo") queda como contexto y no como sujeto.
- **Beneficio:** generaliza más allá de FX. También arregla notas de equities o comercio que mencionan petróleo de paso.
- **Riesgo:** una nota de petróleo cuyo titular no nombra el crudo (ej. "OPEP+ recorta…" sí entra porque `opep` está en la lista; "Arabia Saudita recorta producción" no) dependería del LLM. Mitigación: considerar fuerte también `archetype === 'energy'` del LLM.
- **Prueba:** el mismo archivo de test, más el caso "Wall Street sube por petroleras" → `equities`.

### P3. Coherencia entre el sujeto y el arquetipo cuando la guardia sobreescribe. Impacto medio-alto, riesgo bajo.

- **Archivos:** `newsVisualResolver.ts` (rama L441-448) y/o `newsPromptBuilder.ts` (L40-66).
- **Cambio:** si la guardia cambia el arquetipo respecto al del LLM, hacer una de dos cosas:
  - (a) degradar a `mixed_macro`, manteniendo el sujeto del LLM como primario y la energía como secundario, en lugar de energía pura; o
  - (b) reemplazar `visual_subject` por uno coherente con el arquetipo nuevo.

  Recomiendo (a), porque nunca borra la lectura del LLM. Opcional: no sobrescribir `domain` (L448) y guardar el original para QA.
- **Riesgo:** bajo. Ninguna guardia vuelve a producir un prompt contradictorio.
- **Prueba:** test que verifique que `buildSlideVisual(...).image_prompt` no contiene a la vez "currency"/"FX" en Primary subject y "energy scene" en STYLE cuando la historia es `single`.

### P4. Regla FX en el prompt del resolver. Impacto medio, riesgo bajo.

- **Archivo:** `newsVisualResolver.ts`, `buildResolverMessages` (L309-310).
- **Cambio:** agregar una "REGLA DE FX" análoga a las demás. Si el titular trata de una divisa o tipo de cambio (peso, USD/MXN, dólar frente a…), usar `archetype "fx"` y `domain "fx"`. Los drivers citados como causa ("ante optimismo petrolero", "por el crudo", "por la Fed") **no** cambian el dominio ni vuelven mixta la nota, salvo que el titular nombre ambas fuerzas.
- **Riesgo:** bajo, solo afecta la probabilidad. No basta sin P1 o P2, porque la guardia determinística igual sobreescribiría.
- **Prueba:** manual con 3–4 notas reales de peso en `generate-news-visuals`. Revisar `archetype`, `domain` y `story_type` en la respuesta.

### P5. Convención de dirección para pares de divisas y color en el arquetipo FX. Impacto medio, riesgo bajo.

- **Archivos:** `buildResolverMessages` (definición de `mechanism`, L304) y `archetypes.ts` (`archetypeFx`, L47).
- **Cambio:**
  - En el resolver, indicar que para FX `mechanism` se expresa desde la divisa del titular (`appreciates`/`depreciates`, o `breaks_level`) y que `economic_object` incluye el par (ej. "USD/MXN falls").
  - En el arquetipo FX, atar el color a la dirección: apreciación de la moneda local = línea **turquesa**, aunque la curva USD/MXN baje; depreciación o presión = **coral**. Así un "downward chart" no se pinta como riesgo.
- **Riesgo:** bajo, solo texto. No cambia la clasificación.
- **Prueba:** test de snapshot sobre `archetypeFx.prompt` y una generación manual de control.

### P6. Primary data cuando hay cifras en el texto. Impacto bajo en la imagen, medio en la pieza compuesta; riesgo medio.

- **Archivos:** `newsSlidePlanner.ts` (`selectAndPlan`) o `newsInputAdapter.ts`, y `NewsPanel.tsx`.
- **Cambio recomendado:** no extraer números automáticamente en el backend. Elegir mal la cifra ("18" del titular frente a "17.99" del subcopy) es peor que dejarla vacía, y la regla del normalizador es "no inventar".
  - Mostrar en `NewsPanel` un aviso de "Dato vacío" cuando `key_data` esté en blanco y el texto tenga cifras, para que el editor lo llene. El campo "Dato" ya es editable (`NewsPanel.tsx:537-539`, `801-803`).
  - Opcional: en el camino de texto pegado, reforzar el prompt del normalizador con un ejemplo de tipo de cambio ("se ubicó en 17.99" → `key_data: "17.99"`).
- **Riesgo:** medio si se automatiza; bajo con el aviso en la UI.
- **Prueba:** test unitario de la heurística de detección "hay cifra y key_data vacío".

### Orden sugerido

P1 + P2 + P3 juntas, porque atacan la causa raíz y comparten el archivo de tests. Después P4 y P5, que son ajustes de prompt. P6 queda aparte, como mejora de UX editorial.
