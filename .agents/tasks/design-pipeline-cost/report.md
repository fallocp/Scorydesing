# Reporte: costo y calidad de los pipelines de generación de diapositivas

Investigación de solo lectura sobre el working tree actual. No se ejecutaron llamadas a APIs pagadas, no se desplegó nada y no se leyeron archivos `.env*`. Los tokens se estimaron a partir del código: tamaño real de los prompts medido en caracteres y reglas oficiales de tokenización de imágenes. No se midieron respuestas reales. Precios consultados en la documentación oficial de OpenAI. El repo solo usa OpenAI en estos flujos.

## Resumen

1. **El costo no decide nada; la calidad y la tasa de error sí.** Con los modelos por defecto del código, cualquier pipeline cuesta entre US$0.02 y US$0.25 por diapositiva, o sea US$2 a US$25 por cada 100. La entrada domina: prompts de 11–18 k caracteres, HTML base y capturas. Por eso el modo parche apenas ahorra unos US$0.015 frente a regenerar completo, y además es el modo que más falla en cambios estructurales.
2. **El costo real se dispara por dos causas, no por el pipeline elegido.**
   - (a) El bucle del chat. Cada turno del planner cuesta ~US$0.013. Los ~10 turnos repetidos del caso Xending costaron más que una generación HTML completa.
   - (b) La variable `SLIDE_FIX_MODEL`. Si sigue en `gpt-5.5`, como recomendaba el commit `d37133c`, también la usan las revisiones y reparaciones. Eso multiplica por 5–6 el costo del ciclo de revisión (~US$0.60–1.30 por diapositiva). No se pudo verificar el valor remoto.
3. **Por qué antes salía mejor.** El flujo viejo era imagen de ChatGPT → `xending-slide`: 1 sola llamada de visión con gpt-5.4-mini, una librería fija de componentes Xending y 5 ejemplos «gold standard» (`generate-design-html/index.ts` `buildSlideSystemPrompt`, `_shared/slideExamples.ts`). Costaba ~US$0.04 y obligaba a mapear lo que veía a componentes reales. Desde `ec6ebfa` (2026-09-20) ningún componente de la UI usa ese contrato. El sustituto actual imagen→HTML (`convert_image_to_html`) produce un JSON de posiciones absolutas. Tiene como máximo 12 formas y 6 huecos, y no admite sombras ni degradados (`composition.ts` `COMPOSITION_LIMITS`). Una diapositiva Xending con 6 tarjetas con íconos más el logo no cabe en ese esquema. Es peor reconstructor que el flujo viejo.
4. **Recomendación: «Híbrida por intención»**, en tres caminos:
   - Cambios de cantidad o acomodo (3→6 tarjetas, quitar, reordenar): **edición estructural determinista**. ~US$0.013 (solo el planner) y <1 s de ejecución. Texto 100 % fiel y editabilidad total.
   - Adaptaciones que piden rediseñar la distribución: **HTML regenerado completo** desde `source_html` y la ficha de estilo, con gpt-5.4-mini y revisión visual. Cuesta ~US$0.07–0.20.
   - Dirección visual nueva: **imagen solo para explorar** (borradores `low`), y luego **HTML con el generador de lienzo usando la imagen como `design_source` replicate**, no la composición JSON. Cuesta ~US$0.10–0.35, solo en esas diapositivas.
   - Mezcla estimada: **~US$9 por 100 diapositivas**, frente a ~US$12 si todo va por HTML completo y ~US$24 si todo va por imagen→HTML actual.

---

## 1. Precios oficiales usados (USD por 1 M de tokens, procesamiento estándar)

| Modelo | Entrada | Entrada en caché | Salida | Notas |
|---|---|---|---|---|
| gpt-5.4-mini | 0.75 | 0.075 | 4.50 | Razonamiento por defecto `none` ([modelo](https://developers.openai.com/api/docs/models/gpt-5.4-mini)) |
| gpt-5.4 | 2.50 | 0.25 | 15.00 | ([modelo](https://developers.openai.com/api/docs/models/gpt-5.4)) |
| gpt-5.5 | 5.00 | 0.50 | 30.00 | Razonamiento por defecto `medium`; los tokens de razonamiento se cobran como salida ([modelo](https://developers.openai.com/api/docs/models/gpt-5.5)) |
| gpt-image-2.5-flare / sunburst | texto 5.00 · imagen 8.00 | texto 1.25 · imagen 2.00 | imagen 30.00 | ([modelo](https://developers.openai.com/api/docs/models/gpt-image-2.5-flare), [pricing](https://developers.openai.com/api/docs/pricing)) |
| gpt-image-2 | mismas tarifas por token | | | Referencia por imagen 1536×1024: low ≈ $0.005, medium ≈ $0.041, high ≈ $0.165 ([guía de imagen](https://developers.openai.com/api/docs/guides/image-generation)) |

Reglas de imagen relevantes ([visión](https://developers.openai.com/api/docs/guides/images-vision), [generación](https://developers.openai.com/api/docs/guides/image-generation)):
- En gpt-5.4-mini, `detail: high` y `auto` cubren la imagen con parches de 32 px, hasta 2 500 parches, con un multiplicador de 1.2. Una captura de 1920×1080 son 2 040 parches, ~2 448 tokens (~US$0.0018). Una de 1024×576 son 576 parches, ~692 tokens.
- OpenAI no publica cuántos tokens de salida consume Flare por calidad. Su calculadora es interactiva. Se usa gpt-image-2 medium (~US$0.04/imagen apaisada) como aproximación, con un rango de US$0.02–0.05.
- gpt-image-2 procesa siempre las imágenes de entrada en alta fidelidad. Con la regla documentada para gpt-image-1, eso supone ~6 500 tokens por imagen apaisada, unos US$0.05. Se usa el rango US$0.01–0.05 por imagen de referencia. Es el término más incierto de la estimación.
- La caché de entrada de GPT Image solo aplica a la herramienta de imagen en Responses, no a `/v1/images/edits`, que es el ejecutor por defecto (`DESAING_UI_EXECUTOR ?? 'image_api'`).

Contenido parafraseado de las fuentes por cumplimiento de licencias.

## 2. Llamadas a modelos por pipeline (evidencia en código)

### Bloques comunes

**P · Turno del planner** (`/exploration/plan`)
- Modelo: `gpt-5.4-mini`, fijado en código. `createExplorationProvider` rechaza cualquier otro modelo (`explorationProvider.ts` ~l.263; `desaing-server/index.ts` l.75).
- Endpoint: Responses API. `max_output_tokens` 4096, JSON schema estricto y sin reintento automático.
- Entrada:
  - Prompt developer de `SYSTEM` (3 500 caracteres) más `CONVERSATION_ACTION_PROMPT` (17 971 caracteres): ≈ 6 000 tokens.
  - Payload: historial de hasta 20 mensajes, resumen HTML, catálogo editable, `style_spec` de hasta 4 000 caracteres, marca y deck. Entre 3 000 y 8 000 tokens.
  - Hasta 4 imágenes con `detail: 'high'`, normalizadas a un lado máximo de 1024 (`presentationReferences.ts` l.105). Entre 700 y 4 000 tokens.
- Salida: 600–1 500 tokens. Se observaron 580–759 (`gpt-vision-reference-regression/report.md`).
- Costo: **≈ US$0.010–0.020 por turno, ~US$0.013 típico**. La caché del prefijo fijo (~6 k tokens) podría bajarlo unos US$0.004.
- Latencia: 10–40 s. El código anota que dos referencias en alta más JSON estricto superan con frecuencia los 30 s (`explorationProvider.ts` l.260).

**G · Generación HTML completa** (`generate-design-html`, rama `design-canvas`)
- Modelo: `SLIDE_MODEL || 'gpt-5.4-mini'` (index.ts l.784-786), vía Chat Completions (`callOpenAI.ts`). `max_completion_tokens` 12 000 y `temperature` 0.7, que se envía siempre. No envía `reasoning_effort`, así que gpt-5.4-mini trabaja con razonamiento `none`.
- Entrada:
  - Prompt de sistema de `buildDesignCanvasHtmlMessages`: 11 228 caracteres, ≈ 3 200 tokens.
  - Marca autorizada en JSON (hasta 40 000 caracteres). La marca se repite dentro de `instruction` por `htmlContext`.
  - Encargo con `approved_copy` y `copy_blocks`.
  - `source_html` de la diapositiva: ~3–6 k tokens.
  - `style_spec`.
  - Hasta 4 imágenes con `detail` por defecto (`auto`, que equivale a `high`).
  - Total ≈ 10–17 k tokens. Con base `deck` se suman hasta 3 `style_examples` de 40 000 caracteres, hasta ~30 k tokens.
- Salida: HTML completo de 4–8 k tokens.
- Costo: **≈ US$0.03–0.05**.
- Reintento: 1 corrección estructural, solo si `copy_binding: 'slots'` falla (`designCanvasGeneration.ts`). Suma ~US$0.06, porque reenvía la salida anterior.
- Latencia: 30–90 s (timeout de 120 s).

**R · Revisión visual** (`action: 'review'`)
- Modelo: `SLIDE_REVIEW_MODEL || SLIDE_FIX_MODEL || 'gpt-5.4-mini'` (l.784).
- Entrada: reutiliza todos los mensajes de la generación (`designCanvasReview.ts`) más el HTML generado y la captura real de 1920×1080 (~2 448 tokens; `designReviewRequest.ts`). Total ≈ 18–25 k tokens.
- Salida: 200–1 000 tokens, máximo 4 000.
- Costo: **≈ US$0.017**, más 2–5 s de render.

**F · Reparación tras revisión**
- `designReviewRequest` pone `current_html`, así que la reparación entra en **modo parche** con `SLIDE_FIX_MODEL`.
- Entrada: sistema más `DESIGN_CANVAS_PATCH_INSTRUCTIONS` (12.9 k caracteres) y todo el contexto anterior, ≈ 20–26 k tokens.
- Salida: JSON `before/after` de 1–3 k tokens.
- Costo: **≈ US$0.026**. Si el parche es inválido, se reintenta 1 vez (+~US$0.03).

**Bucle de revisión** (`designVisualReview.ts` `reviewAndRepairDesign`): hasta 3 revisiones y 2 reparaciones.

### (a) HTML directo, regeneración completa
- Llamadas: P×1–2, luego G, luego entre R y 3R+2F.
- Costo: mejor caso G+R ≈ **US$0.07**. Típico G+R+F+R ≈ **US$0.12**. Peor caso G+3R+2F con reintentos ≈ **US$0.23**.
- Latencia: entre 1 y 4 min.
- Cómo se llega hoy: solo si el planner elige `design_source` (`adapt_layout`/`replicate`) sobre la diapositiva, lo que produce `source_html` (`SlideGeneratorPanel.tsx` l.233-239). `create_html` está excluido con base `current` o `version` (`useDesignConversation.ts`, «Adapting an existing design never offers create from scratch»).

### (b) HTML parche
- Llamadas: P×1–2, luego un parche inicial (entrada ≈ 17–23 k tokens con el HTML actual y su captura; salida 1–3 k), con 1 reintento si es inválido, y después el mismo bucle R/F.
- Costo: mejor caso ≈ **US$0.05**, típico ≈ **US$0.10**, peor caso ≈ **US$0.23**.
- Es el camino obligatorio siempre que exista `current_html` («Never fall back to full generation», `designCanvasGeneration.ts`). El ahorro frente a (a) es de ~4 k tokens de salida, unos US$0.018. Para pasar de 3 a 6 tarjetas exige muchos pares `before/after` literales y únicos, lo que lo hace el modo más propenso a `invalid_canvas_patch`.

### (c) Edición determinista
- Llamadas: solo P×1–2 (~US$0.013–0.026). La ejecución, `applyDesignElementEdits` (`designElementEdits.ts`), no llama a ningún modelo y no dispara revisión: deja `visualReview.status = 'needs_review'` sin cobrar.
- Costo: **≈ US$0.013–0.026**. Si la operación se dispara desde un botón del editor, sin planner: **US$0**.
- Latencia: la del planner más menos de 1 s.
- Límite actual: solo `move | resize | text | style | image`. Las operaciones estructurales (duplicar o quitar tarjeta, reacomodar) se están implementando en paralelo y aún no aparecen en el archivo.

### (d) Imagen IA → visión → HTML (flujo actual)
- **Planner**: P×1–2.
- **Imagen**: `generate_image` o `edit_image` por `desaing-server`, con el ejecutor `image_api`.
  - Endpoint `/v1/images/edits` si hay referencias o captura base; si no, `/v1/images/generations` (`imageRequest.ts` `buildImageWireRequest`).
  - Modelo del ajuste del usuario: por defecto **`gpt-image-2.5-flare`, calidad `medium`** (`imageGenerationSettings.ts` `DEFAULT_IMAGE_GENERATION_SETTINGS`), 1 salida a **1536×864** para 1920×1080 (`presentationFullDesign.ts` `fullDesignImageSize`).
  - Sin reintento: «exactly one fetch per generate» (`liveImageProvider.ts`).
  - Costo por llamada: prompt de texto de 1–3 k tokens a US$5/M, más 1–4 imágenes de entrada (captura base, referencias e imagen base al editar) a US$0.01–0.05 cada una, más la salida de ~US$0.02–0.05. Total **≈ US$0.05–0.17**.
  - Latencia: 20–90 s, con polling cada 2 s hasta 180 s (`waitImage`).
- **Aprobación** de la imagen: un comando sin costo.
- **`convert_image_to_html`**: `createCompositionProvider` con `gpt-5.4-mini` en Responses (`compositionProvider.ts`).
  - Entrada: 1 imagen `detail: 'high'` (1536×864 son 1 296 parches, ~1 556 tokens) más los bloques de copy, ≈ 3–4 k tokens.
  - Salida: JSON de hasta 8 192 tokens.
  - Costo: **≈ US$0.015**. Sin revisión visual posterior.
- **Total del pipeline**: mejor caso ≈ **US$0.08**. Típico, con 1 ajuste de imagen, ≈ **US$0.24**. Peor caso, con 3 llamadas de imagen, ≈ **US$0.55**. Con calidad `high` se suman ~US$0.12 por imagen.

### (e) Híbrido: imagen solo para explorar, HTML para adaptar
- Llamadas: P, luego 1–3 borradores `low` (~US$0.005 de salida, más las entradas si hay referencias: US$0.01–0.06 cada uno), luego G con la imagen elegida como `design_source` `{kind:'asset', mode:'replicate'}`, más el bucle R/F.
- El contrato ya existe: `resolveConversationDesignSource` y `designSourceContext` convierten el asset en `layout_reference` (`conversationActions.ts` l.14-15, l.113-116).
- Costo: **≈ US$0.10–0.35**, solo en diapositivas con dirección nueva.

### Referencia histórica: imagen de ChatGPT → `xending-slide`
- 1 llamada `SLIDE_MODEL` (gpt-5.4-mini) con la imagen en `image_url` y un prompt con librería y ejemplos de ~46 k caracteres (≈ 13 k tokens) más ~1.8 k tokens de imagen. Salida de ~5–7 k tokens.
- Costo: **≈ US$0.04 por diapositiva**, más la imagen de ChatGPT, que va fuera de la API.
- Sigue en `generate-design-html/index.ts` (rama `xending-slide`), pero `useGenerateSlide` solo la envía si no es `design-canvas`, y `SlideGeneratorPanel` siempre manda `design-canvas`.

## 3. Costo por diapositiva y por 100 (modelos por defecto del código)

| Pipeline | Por diapositiva (mejor / típico / peor) | Por 100 (típico) | Latencia típica |
|---|---|---|---|
| (a) HTML completo | 0.07 / 0.12 / 0.23 | ~US$12 | 1.5–3 min |
| (b) HTML parche | 0.05 / 0.10 / 0.23 | ~US$10, más fallos y reintentos | 1–3 min |
| (c) Determinista | 0.00 / 0.013 / 0.026 | ~US$1.3 (US$0 sin planner) | <1 s, más el planner |
| (d) Imagen → composición JSON | 0.08 / 0.24 / 0.55 | ~US$24 | 2–4 min |
| (e) Híbrido (solo dirección nueva) | 0.10 / 0.20 / 0.35 | ~US$20 si se usara para todo | 2–4 min |
| Histórico ChatGPT → xending-slide | ~0.04 de API | ~US$4, más trabajo manual | ~1 min |
| **Mezcla recomendada** (50 % c, 35 % a, 15 % e) | — | **~US$9** | — |

### Escenarios de configuración (no verificados en remoto)

- **`SLIDE_FIX_MODEL=gpt-5.5`**. Así lo dejó el commit `d37133c` («SLIDE_MODEL=gpt-5.4-mini, SLIDE_FIX_MODEL=gpt-5.5»). Por la cascada de la l.784, gobierna también las revisiones.
  - Costo: R ≈ US$0.13–0.20 y F ≈ US$0.23–0.29, contando razonamiento `medium`. El ciclo típico de (a) sube a **~US$0.60**, y el peor a **~US$1.30**.
  - Riesgo adicional: `callOpenAI` siempre envía `temperature: 0.7`. Varios reportes indican que los modelos 5.x con razonamiento distinto de `none` rechazan `temperature` con un 400. Si eso aplica a gpt-5.5, las revisiones y parches fallarían. Conviene revisar los logs de `generate-design-html` buscando «API error 400».
- **`SLIDE_MODEL=gpt-5.4`** solo para la generación completa: G ≈ US$0.12, y (a) típico ≈ US$0.20. Es la palanca de calidad con mejor relación costo/beneficio si gpt-5.4-mini se queda corto. Hay que medirlo antes.
- **Bucle del chat**: 10 turnos P ≈ US$0.13, más que una generación completa. Arreglar la confirmación (ver `design-chat-confirmation-loop/report.md`) ahorra dinero, además de fricción.

Para conocer los nombres de los secrets remotos (sin valores):

```powershell
supabase secrets list
```

## 4. Calidad, fidelidad, editabilidad y riesgo

| Pipeline | Calidad visual | Fidelidad al copy | Editabilidad | Riesgo de error |
|---|---|---|---|---|
| (a) HTML completo | Media-alta. Reutiliza clases y CSS de `source_html` y la ficha de estilo. gpt-5.4-mini con razonamiento `none` compone de forma correcta pero conservadora | Alta: los `copy_blocks` o slots los inserta el servidor y el guard valida línea por línea (`design-html-copy-guard`) | Alta: HTML semántico con IDs | Medio: puede alterar partes que no se pidieron. La revisión cuesta y no garantiza el resultado |
| (b) HTML parche | Igual a la base | Alta | Alta | **Alto en cambios estructurales**: anclas `before` únicas, un solo reintento, y el prompt «no autoriza rediseñar las tarjetas» choca con 3→6 |
| (c) Determinista | Idéntica a la base: clona el componente real | Total: el texto lo pone el usuario o el planner, sin LLM de render | Total | Bajo: falla de forma explícita si el HTML cambió (`element_html_hash`). Al reacomodar puede faltar espacio, y conviene una regla de grid determinista |
| (d) Imagen → composición | Alta en la imagen, baja en el HTML. Máximo 12 formas y 6 huecos, colores planos sin sombra ni degradado, coordenadas absolutas. La identidad Xending (sombras suaves, línea coral, píldoras) se pierde | Imagen: puede pintar mal el texto, porque se envía `approvedCopy` para pintarlo. HTML: alta, por `copy_id` | Media-baja: todo absoluto, los íconos son huecos sin resolver y hay que completarlos en el editor | Medio-alto: 6 tarjetas, 6 íconos y logo exceden los 6 huecos; además el formato se cambia a mano (`excluded` en `useDesignConversation.ts`) |
| (e) Híbrido | Alta: la imagen fija la dirección y el generador HTML la reproduce con componentes | Alta (HTML final) | Alta | Medio: dos pasos, que necesitan una sola confirmación |

Notas de las investigaciones previas:
- `gpt-vision-reference-regression`: la visión del planner (gpt-5.4-mini, `detail: high`) funciona. Los fallos venían de contradicciones del JSON, no de la visión. El analizador viejo `analyze-image-reference` (gpt-4o) sigue desplegado sin uso.
- `design-html-copy-guard`: el guard de texto ya tolera reacomodos. La fidelidad del copy deja de ser un riesgo en (a) y (e).
- `design-chat-confirmation-loop`: el bucle y la elección de `edit_elements` frente a regenerar son fallos de orquestación. Ningún pipeline los resuelve por sí solo.

## 5. Propuestas

### Propuesta 1: «Económica» (determinista primero)
- **Cuándo**: cambios de cantidad o acomodo (más o menos tarjetas, quitar, reordenar, cambiar texto o estilo).
- **Costo**: ~US$0.013 por diapositiva con planner, US$0 desde el editor. Unos US$1–2 por cada 100.
- **Ya existe**: `designElementEdits.ts` (move, resize, text, style, image) y la rama `edit_elements` de `executeAction`.
- **Falta construir**:
  - Operaciones `duplicate`, `remove` y `reflow` en `designElementEdits.ts`, en curso en paralelo, con un grid determinista: columnas = ceil(n/filas) y tamaños mínimos de fuente por formato.
  - Esquema del planner en `conversationActions.ts` (`elementEditsSchema`), con una regla corta: «más o menos elementos del mismo tipo → edit_elements estructural».
  - Botón «Duplicar tarjeta» en `VisualDesignEditor.tsx`, sin LLM.
  - Tests: `designElementEdits.test.ts` y `useDesignConversation.test.ts`.
- **Límite**: no rediseña. Si el usuario pide otra composición, hay que escalar a la propuesta 2.

### Propuesta 2: «Calidad» (HTML completo, imagen solo bajo pedido)
- **Cuándo**: rediseñar o adaptar la distribución conservando el sistema visual.
- **Costo**: ~US$0.12 típico, ~US$12 por cada 100. Con `SLIDE_MODEL=gpt-5.4`, ~US$0.20.
- **Ya existe**: G, R y F; `design_source` `adapt_layout`/`replicate` con `source_html`.
- **Falta construir**:
  - Permitir regenerar completo con base `current` sin depender de que el planner infiera `design_source`: una operación `regenerate` en `useDesignConversation.ts`, que hoy excluye `create_html`.
  - Que las reparaciones de un diseño recién generado puedan ser regeneración completa y no solo parche (`designCanvasGeneration.ts`).
  - Fijar `SLIDE_FIX_MODEL` y `SLIDE_REVIEW_MODEL` a gpt-5.4-mini, o quitar `temperature` para modelos 5.x en `callOpenAI.ts`, si se mantiene gpt-5.5.

### Propuesta 3 (recomendada): «Híbrida por intención»
Decisión determinista en el cliente con la clasificación del planner. Una sola confirmación por plan.

| Intención | Camino | Costo |
|---|---|---|
| Más o menos elementos iguales, mover, cambiar texto o estilo | (c) determinista | ~US$0.013 |
| Adaptar la distribución o rehacer con la misma identidad | (a) HTML completo desde `source_html` y la ficha | ~US$0.12 |
| Dirección visual nueva o «explorar» | (e) 1–3 borradores de imagen `low` → elegir → (a) con la imagen como `design_source replicate` | ~US$0.25 |
| Ajuste local pequeño (un título, un color) | (b) parche | ~US$0.05–0.10 |

- **Costo mezclado**: ~US$9 por cada 100 diapositivas.
- **Ya existe**: todas las piezas de ejecución (`edit_elements`, `create_html` con `design_source`, `generate_image` en calidad `low`, `design_source.kind = 'asset'`).
- **Falta construir**, en orden:
  1. Operaciones estructurales deterministas (propuesta 1).
  2. `plan.operation` explícito (`structural_edit | regenerate | patch | explore_image`) en `explorationContracts.ts`, `conversationActions.ts` y `useDesignConversation.ts`. Así el cliente enruta sin reglas contradictorias en el prompt.
  3. Cambiar el destino de `convert_image_to_html`: en vez de `compositionProvider` (JSON de 12 formas), usar `create_html` con `design_source {kind:'asset', mode:'replicate'}`. Eso pasa por el generador de lienzo, la revisión y el guard de copy, y recupera lo que hacía bien `xending-slide`. Archivos: `useDesignConversation.ts` (rama `convert_image_to_html` y lista `excluded`), `UnifiedDesignWorkspace.tsx` y `conversationActions.ts` (validación l.299-301).
  4. Explorar con calidad `low` y sin pintar el texto en la imagen: `copyMode: 'none'` para exploración en `designConversationImages.ts`. El texto real lo pone el HTML. Así baja el costo y se evitan errores de texto pintado.
  5. Mínimos tipográficos por formato en `designCanvasHtml.ts` y `designCanvasReview.ts`.
- **Verificación prevista**: `npm test`, `npm run type-check`, `npm run lint` y `deno check --no-lock` sobre `desaing-server/index.ts` y `generate-design-html/index.ts`. Después, una prueba real del caso Xending 3→6, una vez por cada camino.

## 6. Conclusión

Para este proyecto conviene la **propuesta 3**. Los casos más frecuentes (más tarjetas, reacomodar o cambiar texto) no necesitan un modelo para ejecutarse: el camino determinista es el más barato, el más fiel al copy y el que no rompe la identidad Xending. Para rediseñar, el HTML completo con gpt-5.4-mini cuesta ~US$0.12 y conserva la editabilidad. La imagen aporta valor solo para explorar direcciones nuevas, y su conversión debe ir al generador HTML con componentes, no a la composición JSON actual. Esa conversión es el equivalente moderno del flujo `xending-slide` que antes funcionaba bien.

Antes de construir nada, hay que confirmar `SLIDE_FIX_MODEL` y `SLIDE_REVIEW_MODEL` en remoto y revisar los logs de errores 400. Si apuntan a gpt-5.5, ese es el mayor factor de costo y un posible origen de fallos.

## 7. Verificado frente a inferido

- **Verificado leyendo el código**:
  - Modelos por defecto: gpt-5.4-mini en planner, HTML, revisión y composición; gpt-image-2.5-flare medium en imagen.
  - Endpoints, `detail`, límites de tokens, tamaño de imagen 1536×864 y bucle de revisión 3R+2F.
  - Reintentos: parche ×1, slots ×1, red ×1 en `callOpenAI`; imagen sin reintento.
  - Límites de la composición, envío fijo de `temperature: 0.7`, flujo `xending-slide` sin uso desde la UI y el mensaje de `d37133c` sobre `SLIDE_FIX_MODEL=gpt-5.5`.
  - Tamaños de los prompts, medidos en caracteres.
- **Verificado en la web**: precios de gpt-5.4-mini, gpt-5.4, gpt-5.5 y GPT Image 2/2.5, y reglas de tokenización de imágenes.
- **Inferido o estimado**:
  - Tokens reales por llamada: tamaño del HTML base y de la marca, y conversión de caracteres a tokens (~3.5).
  - Tokens de salida de Flare y de entrada de imagen en GPT Image 2/2.5, sin calculadora disponible.
  - Latencias y distribución de la mezcla (50/35/15).
  - Que gpt-5.5 rechace `temperature`.
- **No verificado**: valores remotos de `SLIDE_MODEL`, `SLIDE_FIX_MODEL`, `SLIDE_REVIEW_MODEL` y `DESAING_UI_EXECUTOR`; consumo real en `desaing_explorations` y en el uso de OpenAI; la versión desplegada de las funciones.
