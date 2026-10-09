# Reporte: un agente de diseño que sabe con qué cuenta (componentes, íconos, imágenes, logos y marca)

Investigación de solo lectura sobre el working tree de `codex/ui-crear-editar-v2` (HEAD `36640ec`). Hay cambios sin commit en `conversationActions.ts`, `explorationProvider.ts`, `designCanvasHtml.ts` y `useDesignConversation.ts`, y unos 50 archivos sin seguimiento en git. Entre ellos están `designElementEdits.ts`, `designElementTools.ts`, `designLogo.ts`, `DesignLogoPicker.tsx`, `designCanvasGeneration.ts`, `designCanvasPatch.ts`, `designCanvasReview.ts` y `designVisualReview.ts`. Los números de línea son del working tree y pueden moverse con el trabajo paralelo. Cuando algo existe solo en el working tree, se indica.

No se editó código, no se desplegó nada, no se llamó a APIs pagadas y no se leyeron archivos `.env*`. La información externa viene de la documentación oficial de OpenAI, Anthropic y Supabase. El contenido de esas fuentes se parafraseó por cumplimiento de licencias.

## Resumen

1. **Hoy el agente no sabe con qué cuenta.** Los recursos existen, pero repartidos en 8 fuentes sin un índice común (§1). El planner solo conoce el logo del negocio (`brand-logo`, si hay `logo_url`) y las imágenes que ya están en la diapositiva. El generador ve `logo_url` dentro de MARCA AUTORIZADA y las piezas montadas como tokens `scory-mounted://`. Para todo ícono nuevo deja un hueco `<img src="">`, y si repite una tarjeta, el ícono repetido también se vacía. La revisión visual marca después "faltan recursos visuales" y puede gastar hasta 2 reparaciones que no pueden llenar esos huecos (inferido del código).
2. **Los 5 ejemplos sí se usaron, pero ya no.** Entre el 27-jun y el 20-sep-2026 iban en cada generación inicial de Presentaciones por `xending-slide`. Ese es el flujo que funcionaba con la imagen de ChatGPT. Desde `ec6ebfa` la UI solo usa `design-canvas` y los ejemplos son código muerto. Aportaban el CSS exacto de componentes reales, pero tienen cuatro problemas:
   - solo sirven para Xending;
   - pesan unos 12 k tokens;
   - los íconos son placeholders de 389 caracteres que el modelo copia en su salida;
   - traen texto real que hoy rechazaría el guard de copy.
   No conviene volver a pegarlos. Conviene convertir la librería en fichas de componente sin texto y usar diapositivas reales del deck como ejemplos.
3. **Cómo lo resuelven los asistentes con herramientas**, según la documentación de OpenAI y Anthropic:
   - un índice corto de capacidades;
   - búsqueda o detalle solo cuando hace falta;
   - IDs con enum estricto que resuelve el servidor, nunca URLs escritas por el modelo;
   - el prefijo estático primero, para que se cachee;
   - un plan B explícito cuando no hay un recurso adecuado.
4. **Recomendación: opción (d) con preselección determinista (b).** Se arma un manifiesto por negocio con 40 recursos y 10 componentes como máximo. El planner elige los IDs y los nombra en el plan («usaré los íconos Reloj, Escudo y Globo de tu biblioteca»). El generador recibe solo el detalle de lo elegido y escribe `scory-library://<id>`, y el cliente cambia ese token por los bytes. Costo estimado: unos US$0.0075 más por diapositiva (+5 %), sin llamadas extra. Cuando el cambio se resuelve con operaciones deterministas (duplicar tarjeta y poner su ícono), no hay costo de generación.
5. **Primer paso de bajo riesgo:** llenar `editable_assets` con hasta 20 recursos del manifiesto. Hoy solo lleva `brand-logo` (`useDesignConversation.ts:628`). El contrato y el enum ya existen en el working tree. Requiere el despliegue de `desaing-server` que ya estaba pendiente; a partir de ahí, el cambio es solo de cliente.
6. **Riesgos detectados entre clientes.** El manifiesto debe salir solo de fuentes con `business_id`:
   - `DesignLogoPicker` pasa el UUID del negocio como `brandKey` a `useBrandLogos`. Salvo los logos ya subidos desde ese mismo selector, nada coincide y muestra los logos de todas las marcas. Además, el botón «Ver todos los logos» siempre deja ver los de las otras marcas.
   - `design_images` tiene una política `SELECT USING (true)` y su bucket es público.
   - La rama legacy `xending-slide` no exige autenticación (`verify_jwt = false`).
   - Hay URLs firmadas con token escritas en el código (ver §5.10).
7. **Caché.** Es probable que el esquema JSON del planner, que cambia en cada turno, impida cachear sus ~6 k tokens de instrucciones. Antes de optimizar hay que medir `cached_tokens`; hoy no se registra.

---

## 1. Inventario de recursos

| # | Fuente | Dónde vive | ¿Aislada por negocio? | Índice / metadatos | ¿Quién la lista? | ¿La ve la IA? |
|---|---|---|---|---|---|---|
| 1 | Logo del negocio | `business_tenants.logo_url` (y `creative_profiles.base_brand.logo_url`) | Sí (RLS) | Ninguno; los seeds lo dejan en `NULL` | `designBrandContext.ts` `logo()`, que solo acepta https **sin query**, así que una URL firmada queda descartada; también `generate-design-html/index.ts:775` | Generador: sí, como URL en MARCA AUTORIZADA. Planner: solo como `brand-logo` en `editable_assets` |
| 2 | Logos "de la biblioteca" | Bucket privado `Brand` (raíz y subcarpetas; no se crea en ninguna migración) y `design-images/brand-icons/` (global) | **No.** Coincidencia por nombre o carpeta y, si nada coincide, todos (`useBrandLogos.ts:152`) | Solo el nombre de archivo | `useBrandLogos` (URLs firmadas por 7 días), `DesignLogoPicker`, `BrandLayerDialog`, `EditorBrandPanel`, `FreeBrandLayerPanel` | No. Se insertan a mano como data URL (`insertDesignLogo`) |
| 3 | Íconos de marca por negocio | `design-images/<business_id>/brand-icons/<uuid>.<ext>` (URL pública) | Sí, por carpeta | **Ninguno:** nombres UUID | `IconPickerModal`, pestaña Marca (`VisualDesignEditor.tsx:988`, prefijo cerca de l.1002) | No |
| 4 | Íconos genéricos | `src/constants/editorIcons.ts`: 29 SVG monocromo con `currentColor` (sociales y de negocio) | Neutros | `name` y `keywords` | `IconPickerModal`, pestaña Genéricos; se insertan como SVG inline (`addIconSvg`, l.2200) | No |
| 5 | Stock "Image Stock Studio" | Tabla `design_images` y archivos en el bucket público `design-images` (`<negocio>/stock/<op>.png` o `<marca>/<colección>/…`) | **Parcial.** `business_id` es opcional y la política "Authenticated users can view all design images" es `USING (true)` (`20260424_create_design_images.sql`); nunca se retiró | `brand`, `collection` (`design`, `slide`, `icon_3d`, `professional`, `generated`…), `description`, `tags[]` con índice GIN, `theme`, `prompt_used`, `usage_count` | La UI del generador se retiró en `00477d4`, pero los datos siguen. La escribe `saveImageToLibrary`; la leen `useBrandAssets` y `StockImageBrowser` **por `brand`, no por negocio** | No |
| 6 | Biblioteca del pipeline | Tabla `image_library` (`image_url` o `image_base64` de ~0.5 MB por fila, `image_type`, `image_intent`, `angle_tag`, `commercial_branch_id`, `mockup_id`) | Sí (RLS `user_is_member_of`) | Rama, ángulo y tipo | `AssetLibraryPage` (`/assets`) e `ImagePickerPanel`, que muestra solo 24 por el peso del base64 (`VisualDesignEditor.tsx:688`) | No |
| 7 | Piezas Desaing | `desaing_state.snapshot.assets` (versiones con identidad `business_id`/`asset_id`/`version_id`, procedencia con `effective_prompt`, revisiones y colocaciones con `alt_text`) y bucket privado `desaing-assets` con RLS restrictiva por clave exacta | **Sí, estricta** (`business_mismatch`, `assertAssetCatalog`) | `effective_prompt`, estado de revisión, procedencia | `listReusablePresentationAssets` y `presentationLibraryResults` (aprobadas), `MountedImagesPanel`, `DesignToHtmlPanel` | Solo como referencia adjunta (`selected_image` o `design_source` de tipo asset) |
| 8 | Recursos del propio deck | HTML de cada diapositiva y `mounted_assets` (identidad, región, `alt_text`, por defecto "Imagen montada") | Sí, por construcción | Pobre: el `alt` es genérico; el contexto real es el título de la tarjeta | Kit de estilo `buildDeckStyleKit` (`designConversationHtml.ts:75`), que **quita las imágenes** y deja `[datos omitidos]` (l.7) | No. El generador recibe la orden de dejar huecos (`designCanvasHtml.ts:238`) |

Otras fuentes que no participan en el diseño:
- `brand_assets` (onboarding, con la categoría `logo`) y el bucket privado `brand-assets`. Están aisladas por negocio, pero ningún flujo de diseño las lee.
- La biblioteca local en IndexedDB (`presentationAssets.ts`).
- Promotores y disclaimers de la capa de marca.
- `renderer/assets/*/descriptions.json`, que están vacíos.
- Los partners `monex-usa` y `ping-pong`, que solo existen como lista (`renderer/assets/shared/partners.json`, `PartnerSelector.tsx`) y como reglas en la skill. Sus archivos de logo no están en el repo.

**Cantidades:** el repo no permite saberlas, porque los datos viven en Storage y en la base de datos. El código solo fija 29 íconos genéricos y 22 plantillas de deck. Consultas de solo lectura para medir en el SQL Editor:

```sql
select coalesce(business_id::text,'(sin negocio)') business_id, brand, collection, count(*) from public.design_images group by 1,2,3 order by 4 desc;
select business_id, image_type, count(*) from public.image_library group by 1,2 order by 3 desc;
select bucket_id, (storage.foldername(name))[1] root, (storage.foldername(name))[2] sub, count(*) from storage.objects where bucket_id in ('design-images','Brand','desaing-assets','brand-assets') group by 1,2,3 order by 4 desc;
select business_id, jsonb_array_length(coalesce(snapshot #> '{assets,versions}','[]'::jsonb)) versions from public.desaing_state;
select policyname, cmd, qual from pg_policies where tablename = 'design_images';
```

**Cómo se ven hoy los íconos en las diapositivas:**
- **Plantillas del deck** (`presentationTemplates_v2.ts`): 57 SVG inline de 24×24 (íconos de línea); 14 placeholders `PG_ICON` (un SVG punteado que dice "icono") para íconos 3D o de marca que se cambian a mano; 29 `<img>` del logo con URL firmada.
- **Ejemplos legacy** (`slideExamples.ts`): 24 `<img>` con 25 placeholders y ningún ícono real.
- **Diapositivas del usuario:**
  - imágenes montadas como data URL con `data-asset-id` y `data-asset-version`;
  - íconos de marca como `<img src="https://…/design-images/<negocio>/brand-icons/<uuid>.png">`;
  - íconos genéricos como SVG inline;
  - el logo como `img[data-design-logo]`;
  - marcas de verificación como el texto «✓».
- **Salida de `design-canvas`:**
  - cada ícono nuevo sale como `<img id="icono-…" src="" alt="Ícono de …">` (`designCanvasHtml.ts:232,235,238`);
  - una pieza montada que se repite se convierte en hueco vacío al regenerar, o se rechaza en un parche (`finalizeDesignCanvasHtml`, l.440);
  - las URLs nuevas que no se reconocen pasan sin validar (l.411). Solo el prompt («No generes imágenes ni inventes URLs de activos», l.230) impide que el modelo invente una. El CSP del cliente admite cualquier imagen https (`presentationHtml.ts`).

## 2. Librería de componentes y los 5 ejemplos

**Qué define el flujo legacy** (`generate-design-html/index.ts`, `buildSlideSystemPrompt` desde l.544, y `_shared/slideExamples.ts`):
- **10 componentes** en HTML y CSS exactos: Eyebrow, Título con acento coral, Subtítulo, Tarjeta (`.card`, `.icon-slot`, `.card-line`, `.pill`), Panel con checklist, Franja de features, Stats, Mini-grid 2×2, Split-card y Banda hero a sangre.
- **Tokens:** `:root{--mint,--coral,--navy,--navy-title,--gray}`, Montserrat, Poppins y Fraunces.
- **Reglas:** "REGLA DE ORO", 7 reglas duras y las reglas de maquetación L1 a L7.
- **Scaffold:** 1920×1080 con un `<script>` de resize obligatorio.
- **Íconos:** placeholders con `#id` (l.574).
- **Cinco ejemplos A–E** "gold standard" (l.690).

**Tamaño:** la plantilla expandida mide ~23.9 k caracteres; la sección de librería, 12 k; los ejemplos expandidos, ~42.9 k (unos 11 a 13 k tokens). En total son ~66.8 k caracteres, ~17 a 20 k tokens. El reporte de costos anterior estimó ~46 k porque no expandió los placeholders.

**¿Se usaron en producción?** El código dice que sí; no hay logs para contar cuántas veces.
- `b0255f7` (27-jun-2026) añadió 4 ejemplos y `d37133c` (29-jun) añadió el quinto (`hedging`).
- Antes de `ec6ebfa`, `SlideGeneratorPanel` llamaba a `useGenerateSlide`, que enviaba `design_system: 'xending-slide'` en toda generación inicial, de texto o de imagen. Así lo muestra `git show ec6ebfa~1:src/hooks/useGenerateSlide.ts`.
- Los refinamientos usaban `buildSlideIterationPrompt`, sin ejemplos.
- Desde `ec6ebfa` (20-sep-2026) `SlideGeneratorPanel` siempre envía `design-canvas` (l.233 y l.343), y `design-canvas` no importa `slideExamples`. La afirmación «no se usaron» es imprecisa: se usaron unas 12 semanas en el flujo que daba buenos resultados y desde el 20 de septiembre están muertos.

**Compatibilidad con `design-canvas` y el editor:**

| Aspecto | Librería legacy | `design-canvas` y editor | Resultado |
|---|---|---|---|
| Raíz | `.slide` 1920×1080 con `<script>` | `.slide` o `.lab-canvas`; el prompt prohíbe scripts y `sanitizePresentationHtml` los elimina | La raíz encaja; la regla del script choca |
| Marca | Tokens Xending fijos | Marca del negocio; «No apliques un preset de otra marca» | Solo para Xending, Xending Capital y Xending USA, que comparten paleta y tipografías según los seeds |
| Estructura | Tarjetas hermanas, textos en hojas, íconos `IMG` | `buildDesignElementCatalog` asigna IDs `e:N` por orden del DOM; `duplicate`/`reflow` (trabajo paralelo) agrupan hermanos | Compatible |
| Íconos | Placeholder data-URI con `#id` | `src=""`, o tokens `scory-mounted://` para piezas montadas | Son dos convenciones; conviene unificarlas |
| Escala | px fijos para 16:9 | Lienzo de 96 a 4096 px | Solo en 16:9, o con una regla de escala |
| Texto | Ejemplos con copy real («Forward tradicional»…) | `copyMismatch` rechaza el texto que sobra | Riesgo de rechazo y reintentos pagados |

**Evaluación de los ejemplos:**
- **Aportan:** enseñaban sombras, radios, líneas coral y espaciados exactos de diapositivas reales. Eso daba la consistencia del flujo viejo.
- **Inducen copia por diseño:** el prompt pide replicar «EXACTAMENTE» y adaptar solo el texto y la cantidad.
- **Problemas en el flujo actual:**
  - copian texto ajeno al encargo;
  - pesan unos 12 k tokens por llamada;
  - el modelo reproduce los placeholders, unos 100 tokens de salida por ícono;
  - mezclarían marcas en negocios que no son Xending;
  - siguen sin traer íconos reales.
- `design-canvas` ya tiene un mecanismo mejor, `style_examples`: hasta 3 diapositivas reales del deck, inertes, más la ficha de estilo medida. Pero las elige por cercanía (`designConversationHtml.ts:79`) y no por el componente que se necesita, y les quita las imágenes.
- **Recomendación:** no incluir los 5 ejemplos fijos en el camino nuevo.
  - Extraer los 10 componentes como fichas de datos: id, cuándo usarlo, slots, capacidad, CSS y un esqueleto sin texto.
  - Usar como ejemplos las diapositivas reales del deck que contienen el componente elegido.
  - Conservar los 5 ejemplos, convertidos en esqueletos, solo como respaldo para decks Xending que no tengan ese componente.

## 3. Estado actual: qué sabe la IA y qué se valida

**Planner** (`explorationProvider.ts`, Responses API):
- **Configuración:** `tools: []`, `tool_choice: 'none'` y `store: false` (l.97); JSON schema estricto; una sola llamada por turno (`serverExploration.ts:175`).
- **Recibe:**
  - la marca resumida (nombre, paleta, tipografía), sin URL de logo (`designBrandExplorationContext`);
  - las referencias adjuntas y las capturas internas;
  - el resumen del HTML, donde URLs y data URIs aparecen como `[recurso omitido]` o `[datos omitidos]`;
  - el catálogo `editable_elements`, que incluye las imágenes por su `alt` o su ID;
  - `editable_assets`, que hoy es solo `brand-logo`;
  - `style_spec`, con tamaños de ícono y la frase «repite el mismo componente con su mismo ícono» (`styleSpec.ts:75`);
  - el índice del deck y las diapositivas inspeccionadas.
- **No recibe:** íconos de marca, íconos genéricos, stock, piezas aprobadas, logos de la biblioteca, logos de partners ni el significado de los íconos del deck.
- **Lo que el prompt pide sobre recursos:**
  - sustituir imágenes solo con `asset_id` de `editable_assets` (`conversationActions.ts:326`);
  - que en `create_html` «las fotos o ilustraciones quedan como piezas por montar después» (l.350).

**Generador** (`design-canvas`, Chat Completions):
- **Recibe:** la marca leída por el servidor con RLS (`name`, `logo_url`, colores, fuentes y perfil; l.775), el encargo, las referencias, `source_html`, `style_spec` y los ejemplos del deck sin imágenes.
- **Reglas sobre recursos:**
  - no inventar URLs;
  - no dibujar logos falsos;
  - dejar huecos para cada ícono o foto nuevos;
  - conservar los tokens `scory-mounted://` y `scory-source://`.
- **No existe ninguna forma de referirse a un recurso del catálogo por ID.**

**Cómo llegan hoy los logos de la biblioteca:** el usuario pulsa «Logos» y `DesignLogoPicker` llama a `useBrandLogos(businessId)` (`DesignLogoPicker.tsx:11`). Luego:
- La búsqueda compara el UUID con nombres pensados para claves como `xending` (`useBrandLogos.ts` l.137-148). Solo coinciden los logos subidos desde este selector, que van a `brand-icons/<uuid>/`. Si no hay ninguno, el hook cae a la lista completa (l.152) y se ven todos los logos de `Brand` y de `design-images/brand-icons`. Si los hay, «Ver todos los logos» muestra igualmente los de otras marcas.
- `readDesignLogo` convierte el logo elegido en data URL y `insertDesignLogo` lo coloca.
- En generaciones posteriores, el logo se conserva como pieza montada, enmascarada con su token.
- Al subir un logo, el archivo va a `design-images/brand-icons/<uuid>/…` (`DesignLogoPicker.tsx:23`). Esa ruta queda fuera de la carpeta que exige la política de negocio del bucket (`20260822_design_images_storage_policy.sql`). Si funciona, es por una política de INSERT que no aparece en las migraciones (no verificable).

**Validaciones que ya existen:**
- **`edit_elements`, operación `image`:**
  - el enum estricto de `asset_id` sale de `editable_assets` (`designElementEdits.ts:83`; límite de 20 recursos y 12 operaciones, l.18);
  - el servidor valida con `assertDesignElementEdits`;
  - el cliente solo resuelve IDs de su propio mapa y `assetSource` filtra protocolos (`designElementTools.ts:71,98`).
- **`design_source` de tipo asset:** se rechaza si pertenece a otro negocio (`parseDesignCanvasHtmlRequest`).
- **Piezas montadas:** el servidor restaura su identidad y rechaza cambios de identidad. El cliente solo reasigna identidades conocidas (`prepareHtmlDesignAssets`).
- **Piezas Desaing:** RLS restrictiva y verificación de negocio, aprobación, tamaño y dimensiones (`readReusablePresentationAsset`).
- **Referencias del planner:** el servidor comprueba negocio, PNG y hash antes de enviar los píxeles (`serverExploration.ts`).

**Lo que falta:**
- Una lista de URLs permitidas en el HTML generado.
- Que los logos de la biblioteca estén aislados por negocio.
- Que `design_images` esté aislada por negocio.
- Etiquetas en los íconos de marca, que hoy tienen nombre UUID.
- Que la revisión distinga un hueco intencional de una imagen que falta.

## 4. Cómo lo haría un asistente tipo ChatGPT o Claude

Principios documentados (parafraseados):
- **Pocas herramientas, con un propósito claro, que busquen en lugar de listar todo.** Respuestas con información útil y nombres legibles en vez de UUID; paginación y errores que orienten. Fuente: [Anthropic, Writing effective tools for agents](https://www.anthropic.com/engineering/writing-tools-for-agents).
- **El conjunto más pequeño de tokens con alta señal.** Recuperación "justo a tiempo" con identificadores ligeros, o un modelo híbrido: algo al inicio y el resto bajo demanda. Pocos ejemplos canónicos en lugar de listas de reglas. Fuente: [Anthropic, Effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- **Divulgación progresiva en tres niveles:** los metadatos van en el prompt de sistema, el `SKILL.md` se carga si aplica y los archivos anexos se leen bajo demanda. Fuente: [Anthropic, Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills).
- **Enums y estructura para impedir estados inválidos; trabajo determinista en código.** No pedir al modelo argumentos que la aplicación ya conoce. Pocas funciones al inicio (se sugieren menos de 20) y `tool_search` para diferir el resto (desde gpt-5.4). Las definiciones de herramientas se cobran como entrada. Fuente: [OpenAI, Function calling](https://developers.openai.com/api/docs/guides/function-calling).
- **Structured Outputs no permite valores de enum inválidos.** Las funciones sirven para conectar con datos y `text.format` para la respuesta final. Límite de 1000 valores de enum por esquema. Fuente: [OpenAI, Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
- **El caché exige que el prefijo coincida exactamente, incluidas las herramientas y el esquema de `text.format`.** El contenido estático debe ir primero. `prompt_cache_key` ayuda al enrutamiento en modelos anteriores a GPT-5.6. Fuente: [OpenAI, Prompt caching](https://developers.openai.com/api/docs/guides/prompt-caching).
- **En Claude, las herramientas diferidas se agregan al historial sin romper el prefijo cacheado**, mientras que cambiar las definiciones invalida todo el caché. Fuente: [Claude, Tool use con prompt caching](https://platform.claude.com/docs/en/agents-and-tools/tool-use/tool-use-with-prompt-caching).
- **gpt-5.4-mini admite function calling, Structured Outputs y tool search.** Precios: US$0.75 por M de entrada, US$0.075 en caché y US$4.50 de salida. Fuente: [OpenAI, gpt-5.4-mini](https://developers.openai.com/api/docs/models/gpt-5.4-mini).
- **Límites de Supabase Edge Functions:** 2 s de CPU por petición, 150 s de espera sin respuesta y 150 o 400 s de duración total según el plan. Fuente: [Supabase, Limits](https://supabase.com/docs/guides/functions/limits).

Contenido parafraseado de las fuentes por cumplimiento de licencias.

**Restricciones del código que condicionan las opciones:**
- El payload del planner tiene un presupuesto de 64 KB en el cliente (`fitConversationPresentationRequest`, `designConversationDeck.ts:82`) y de 128 KB en el servidor (`EXPLORATION_LIMITS`, `serverExploration.ts:27`).
- Reserva de US$0.25 por solicitud, con el costo calculado a partir de una única `usage`.
- Strict mode con, como mucho, 1000 valores de enum por esquema. Ya hay enums de diapositivas (hasta 500), elementos editables y referencias.
- Esos enums cambian en cada turno y el esquema forma parte del prefijo. Por eso es probable que el prompt de ~6 k tokens no se cachee entre turnos. Para confirmarlo hay que leer `usage.input_tokens_details.cached_tokens`; `responseMetadata` (l.137) no lo hace.

**Supuestos de costo** (por diapositiva típica):
- 3 turnos de planner de unos 12 k tokens de entrada y 1 k de salida, unos US$0.013 cada uno.
- Un ciclo HTML con generación, revisión, reparación y revisión (4 llamadas), unos US$0.10.
- Base: unos US$0.14.

| Opción | Qué es aquí | Tokens extra | US$ extra por diapositiva (sin caché / con caché) | Por 100 | Latencia | Complejidad | Riesgo | Calidad |
|---|---|---|---|---|---|---|---|---|
| (a) Todo en el prompt | Catálogo completo (~300 recursos × 25 tokens), librería (~3 k) y 5 ejemplos (~12 k) en el planner y el generador | ~22 k por llamada | +0.12 / +0.07 | +12 / +7 | +3 a 6 s por llamada | Baja | **Alto:** no cabe en los 64 KB del planner; pierde foco con tanto contexto; copia ejemplos; mezcla marcas | Media-baja |
| (b) Recuperación determinista | El planner devuelve conceptos y el cliente busca por etiquetas el top 12 para el generador | Planner +~100 de salida; generador +~400 × 4 llamadas | +0.002 | +0.2 | < 0.3 s | Media-baja | Bajo | Media-alta; depende de las etiquetas |
| (c) Tool calls reales | `search_assets` y `get_component` en el planner, en bucle | 1 o 2 llamadas Responses más (~13 k de entrada) en 2 de cada 3 turnos | +0.02–0.04 / +0.015–0.03 | +2–4 | +10 a 30 s por ronda; riesgo de llegar a los 150 s | **Alta:** bucle dentro del journal, presupuesto que suma varias llamadas, ejecutores de herramientas sobre tablas legacy | Medio-alto | Alta y flexible, pero variable con un modelo mini |
| (d) Dos etapas por ID | El planner recibe un índice (≤40 recursos, ≤10 componentes) y asigna IDs con enum; el generador recibe solo lo elegido | Planner +1.2 k de entrada y +200 de salida; generador +1 k neto × 4 | +0.0075 | +0.75 | +1 a 2 s por turno | Media | Bajo-medio | **Alta:** visible en el plan y corregible por el usuario |
| **(d)+(b) recomendado** | La preselección de (b) alimenta el índice de (d) | = (d) | +0.0075 | +0.75 | +1 a 2 s | Media | Bajo | Alta |
| Edición determinista con íconos | `duplicate` + `image` con un `asset_id` del manifiesto | Solo el planner | Unos −0.10 frente a regenerar el HTML | Unos −10 | < 1 s | Ya está en curso | Bajo | Máxima fidelidad |

**Por qué (d)+(b) y no (c):**
- Con catálogos de decenas a cientos de recursos por negocio, un índice preseleccionado basta, es casi gratis y no añade llamadas.
- El código ya sigue el patrón de IDs con enum resueltos por el anfitrión (`brand-logo`, tokens `scory-mounted://`, `design_source` de tipo asset).
- Si después hace falta buscar más («otro ícono de logística»), se puede añadir una acción `find_assets` que ejecute el cliente, igual que `inspect_slides`. No hace falta convertir el planner en un bucle de herramientas: cuesta una llamada más, unos US$0.013 y 10 a 40 s.
- Medido el volumen, se puede pasar a (c) con `tool_search` si cada negocio supera unos 200 recursos útiles.

## 5. Recomendación concreta

### 5.1 Arquitectura

1. El **cliente** arma un **manifiesto por negocio** una vez por sesión y lo memoriza por negocio, revisión del deck y versión de la biblioteca.
2. Cada turno, una **preselección determinista** reduce el manifiesto a ≤40 recursos y ≤10 componentes. Cruza texto aprobado, títulos de tarjetas, tipo de hueco y estilo de los íconos de la base.
3. El **planner** recibe ese índice al final del payload. En su plan elige `component_ids` y `asset_assignments` con enum estricto y los nombra. Si no hay uno adecuado, lo dice.
4. **Ejecución:**
   - **Determinista:** `edit_elements` (`retext`, `duplicate`, `remove`, `reflow`, `image`) con los mismos IDs, sin llamar al generador.
   - **Generación:** `create_html`, `refine_html` con reescritura, o `replicate` desde una imagen. El generador recibe solo el detalle de lo elegido y escribe `src="scory-library://<id>"`.
5. **Resolución en dos pasos:** `finalizeDesignCanvasHtml` acepta solo IDs del manifiesto de la petición; si el ID no está, deja el hueco vacío, y en modo parche rechaza. El cliente cambia cada token por bytes (data URL) y fija la identidad (`data-asset-id`/`data-asset-version` para piezas Desaing, `data-library-ref` para las demás) antes de medir y revisar. Así la revisión visual ve los íconos reales.

### 5.2 Formato del manifiesto (lo que ve el modelo)

```json
{
  "manifest_id": "am_7f3c2a1e",
  "design_system": "xending-light-editorial",
  "components": [
    { "id": "cmp.card-icon", "name": "Tarjeta blanca con ícono", "use": "3 a 6 beneficios cortos", "slots": ["icon","title","body","pill?"], "per_row": "3-4" }
  ],
  "assets": [
    { "id": "logo.primary", "kind": "logo", "label": "Logo Xending (bola)", "ratio": "1:1" },
    { "id": "icon.deck-reloj", "kind": "icon", "style": "3d", "label": "Reloj (tarjeta «Velocidad», diapositiva 4)", "tags": ["tiempo","rapidez"] },
    { "id": "icon.svg-escudo", "kind": "icon", "style": "line", "label": "Escudo", "tags": ["seguridad"], "recolor": true },
    { "id": "photo.puerto", "kind": "photo", "label": "Puerto con contenedores", "ratio": "16:9" },
    { "id": "badge.monex-usa", "kind": "partner_badge", "label": "Powered by Monex USA", "rule": "solo Xending USA; máximo 60 % del logo; versión mono" }
  ],
  "omitted": { "icon": 42, "photo": 130 }
}
```

**Reglas del formato:**
- Los IDs son cortos y semánticos, nunca UUID ni URL.
- Cada línea ocupa unos 20 a 25 tokens; con 40 recursos y 10 componentes, el índice cuesta unos 1.2 k tokens.
- `omitted` le dice al modelo que hay más, para que pueda pedir otro.

**Mapa del anfitrión** (nunca se envía al modelo): `id → { business_id, source: desaing | design_images | storage | generic | deck, ref, sha256?, width, height, mime }`.

**Fichas de componente** (solo para el generador y solo las elegidas): `{ id, css, skeleton }`. El esqueleto usa slots como `{{title}}` y `scory-library://{{icon}}`, y no lleva texto real.

**Preselección:**
- Normalizar en español: minúsculas, sin tildes y con un stemming simple.
- Puntos extra: recurso ya usado en este deck (+3), mismo estilo que los íconos de la base, 3D o de línea (+2), pieza aprobada (+1), más reciente.
- Cupos: íconos ≤24, fotos ≤8, logos ≤4, partners ≤2.
- `editable_assets` toma los 20 primeros íconos y logos.

### 5.3 Encaje con las operaciones deterministas

- El caso «de 3 a 6 tarjetas con íconos distintos» se resuelve con 3 `retext`, 3 `duplicate`, 3 `image` y 1 `reflow`: 10 operaciones, dentro del límite de 12.
- Las operaciones se refieren al catálogo original, así que una operación `image` no puede apuntar a la imagen de una copia creada en el mismo lote. Hay que coordinar con el trabajo paralelo (`design-chat-obey-instructions/design.md`, donde `duplicate` es `{ element_id, texts }`): añadir a `duplicate` un `asset_id` opcional, con el mismo enum de `editable_assets`, para el ícono de la copia. Por defecto, la copia conserva el ícono montado, que es lo que ese diseño ya define.
- Generalizar `object-fit: contain`, que hoy se aplica solo a `brand-logo` (`designElementTools.ts:104`), a los recursos de tipo `logo` e `icon`.

### 5.4 Imagen elegida → `design-canvas` en modo replicate

`convert_image_to_html` pasa a ser `create_html` con `design_source {kind: 'asset', mode: 'replicate'}`, más las fichas de componente (familia Xending) y el índice de recursos. El generador traduce lo que ve a componentes por ID, como hacía el flujo viejo («mapea lo que ves al componente más cercano»). Cada ícono pintado en la imagen se cambia por un ID del catálogo o se deja como hueco.

Si falta un ícono, hay dos salidas:
- **Recortarlo de la imagen elegida.** Usa `pixel_extraction`, que ya existe, y no cuesta nada.
- **Generar un ícono nuevo.** Es una operación pagada que pide confirmación. El resultado se guarda en la biblioteca con colección `icon_3d` y etiquetas, para reutilizarlo después.

### 5.5 Varias marcas sin mezclar recursos

**El constructor del manifiesto solo acepta:**
- piezas Desaing del mismo `business_id`;
- archivos en `design-images/<business_id>/…` (`brand-icons/` y, como convención nueva, `logos/` y `partners/`);
- filas de `design_images` con `business_id` igual al del negocio. Las filas legacy sin negocio entran solo si un mapeo explícito asocia su `brand` a ese negocio, nunca por parecido del nombre;
- metadatos de `image_library` del negocio, sin leer `image_base64`;
- recursos montados del deck abierto, comprobando que su `business_id` sea el del negocio;
- el `logo_url` del negocio y `brand_assets` con categoría `logo`;
- los íconos genéricos, que no pertenecen a ningún negocio.

**Excluye siempre:** la raíz del bucket `Brand` (salvo un mapeo explícito), la carpeta global `brand-icons/` y cualquier carpeta de otro negocio.

**El resolvedor** comprueba `entry.business_id ∈ {negocio activo, generic}` antes de descargar nada.

**Partners:** se habilitan por negocio, con su regla de uso. Monex USA solo para Xending USA. Ningún partner en Xending Capital. Ping Pong solo para Xending, según las reglas de la skill y del copy kit.

**Componentes:**
- `xending-light-editorial` aplica solo a los slugs `xending`, `xending_capital` y `xending-usa`.
- Los demás negocios usan componentes derivados de su propio deck: `style_spec` y diapositivas inspeccionadas.

### 5.6 Caché y medición

- **Medir primero:**
  - en el planner, leer `usage.input_tokens_details.cached_tokens` en `responseMetadata`;
  - en el generador, leer `usage.prompt_tokens_details.cached_tokens`, que hoy `callOpenAI` no devuelve.
- **Planner:** usar un `prompt_cache_key` estable por versión de prompt. Evaluar mover los enums que cambian cada turno (hash e IDs de elementos) a la validación del servidor, que ya hace `assertConversationNextAction`, para dejar el esquema estable. Ahorro estimado: ~6 k × (0.75 − 0.075) / M ≈ **US$0.004 por turno**, cerca del 30 %.
- **Generador:** poner primero el contenido estático del prompt de sistema. Hoy el modo `patch` cambia la segunda línea y las variantes de copy cambian el bloque intermedio.
- El índice va siempre al final del payload, nunca antes del prompt estático.

### 5.7 Plan B cuando no hay un recurso adecuado

1. Si la base usa íconos de línea, usar un SVG genérico recoloreado con la marca.
2. Si no, dejar un hueco con un `alt` descriptivo y `data-slot="icon"`, y decirlo en el plan.
3. Ofrecer recortarlo del diseño elegido (sin costo) o generar un ícono nuevo (con costo y confirmación).

Nunca escribir URLs, nunca dibujar logos y nunca usar recursos de otro negocio. La revisión visual no debe tomar como defecto un hueco intencional con `data-slot`; hoy lo resume como «faltan recursos visuales» (`designVisualReview.ts`).

### 5.8 Rendimiento y escalabilidad (según la steering de rendimiento)

| Pregunta | Respuesta |
|---|---|
| ¿Cuántos datos habrá? | No se puede saber desde el repo. Estimado: decenas a cientos de recursos por negocio hoy; miles en dos años, porque el stock y las piezas crecen con el uso. |
| ¿Cómo crece el costo con 10 veces más datos? | Construir el manifiesto es O(N) con `Map`/`Set`. Lo que se envía al modelo está acotado a ≤40, así que los tokens no crecen. |
| ¿Cuándo se ejecuta? | Una vez por sesión, memorizado, y la preselección O(N) una vez por turno. |
| Límites de la plataforma | 64 y 128 KB de payload del planner, 1000 enums por esquema, 20 recursos en `editable_assets`, 2 s de CPU y 150 s de espera en las Edge Functions. |
| ¿Qué pasa si se corta a la mitad? | La resolución es local. Un token que no se resuelve queda como hueco con un aviso, sin reintentos pagados. |

**Trampas que hay que evitar:**
- `getAssetVersion` y `getAssetReviewStatus` validan el catálogo entero en cada llamada (`assets.ts:373,410`). `presentationLibraryResults` llama a la segunda dentro de un recorrido, junto con un `jobs.find` por cada versión (`presentationServerDesign.ts:101,106`), y `DesignToHtmlPanel.tsx:156` hace lo mismo. Con cientos de versiones, el costo crece de forma cúbica. Hay que validar una vez y buscar con `indexValidatedAssetVersions` (l.380).
- No leer `image_base64` de `image_library`.
- Incluir una prueba con 100 y 1000 recursos que deba tardar menos de 50 ms.

### 5.9 Archivos que cambian

| Archivo | Cambio |
|---|---|
| `supabase/functions/_shared/desaing/designAssetManifest.ts` (nuevo) | Contrato compartido: tipos, límites, `assertDesignAssetManifest` y validación de tokens |
| `src/lib/presentations/designAssetManifest.ts` (nuevo) | Constructor por negocio, preselección y mapa de resolución |
| `src/lib/presentations/useDesignConversation.ts` (l.628 y l.781) | Llenar `editable_assets` y el mapa de recursos desde el manifiesto; pasar `asset_manifest` y `component_specs` al generador |
| `src/lib/presentations/designElementTools.ts` | `object-fit` por tipo de recurso; `asset_id` en `duplicate`, coordinado con el trabajo paralelo |
| `supabase/functions/_shared/desaing/designElementEdits.ts` | `asset_id` opcional en `duplicate`, coordinado |
| `supabase/functions/_shared/desaing/conversationActions.ts` | `asset_manifest` y `supports_asset_manifest` en el contexto del turno; `asset_assignments` y `component_ids` en `next_action`; un bloque RECURSOS corto que sustituye las reglas sueltas sobre huecos y logos |
| `supabase/functions/_shared/designCanvasHtml.ts` | Campos `asset_manifest` y `component_specs`; regla RECURSOS; tokens `scory-library://` en `finalizeDesignCanvasHtml` |
| `supabase/functions/_shared/designComponentLibrary.ts` (nuevo) | Las 10 fichas, extraídas de `buildSlideSystemPrompt` y `slideExamples.ts`, sin texto |
| `src/components/presentations/SlideGeneratorPanel.tsx` y `src/lib/presentations/htmlDesignAssets.ts` | Resolver los tokens a bytes e identidad antes de `cleanCandidate` y de medir |
| `src/lib/presentations/designConversationHtml.ts` | Elegir los ejemplos del deck por componente, no por cercanía |
| `src/hooks/useBrandLogos.ts` y `src/components/presentations/DesignLogoPicker.tsx` | Aislar por negocio: un hook nuevo `useBusinessLogos(businessId)`, sin caer a "todos"; subir a `<business_id>/logos/` |
| `supabase/functions/_shared/desaing/explorationProvider.ts` y `supabase/functions/_shared/callOpenAI.ts` | Medir `cached_tokens`; `prompt_cache_key` |

### 5.10 Plan por pasos, de menor a mayor riesgo

0. **Medir, sin cambiar el comportamiento.** Correr las consultas SQL de §1 y registrar `usage` y `cached_tokens` del planner y del generador. Verificación: pruebas de `explorationProvider` y `deno check`.
1. **Aislar los logos por negocio.** Es un arreglo independiente de la IA. Prueba: el negocio A nunca ve los logos del negocio B.
2. **Construir el manifiesto y la preselección**, todavía sin conectarlos. Pruebas:
   - aislamiento entre negocios con datos mezclados;
   - límites;
   - normalización de acentos;
   - 100 y 1000 recursos en menos de 50 ms.
3. **Conectarlo al camino determinista.** Llenar `editable_assets` (≤20) y el mapa en `apply`, y mostrar los nombres de los íconos en el plan. Requiere `desaing-server` desplegado con `edit_elements`, que hoy existe solo en el working tree. Prueba manual: «cambia el ícono de la tarjeta 2 por un escudo».
4. **Añadir `asset_id` en `duplicate`**, después de fusionar el trabajo paralelo. Requiere desplegar `desaing-server`.
5. **Darle recursos al generador:** `asset_manifest`, tokens `scory-library://` y resolución en el cliente. Requiere desplegar `generate-design-html`.
6. **Convertir la librería en fichas de componente** activadas por sistema de diseño, elegir los ejemplos del deck por componente y sacar los 5 ejemplos fijos del camino nuevo.
7. **Cambiar el contrato del planner** (`asset_assignments`, `component_ids`, bloque RECURSOS, capacidad declarada). Requiere desplegar `desaing-server` y `generate-design-html`.
8. **Imagen → replicate** con manifiesto y fichas; plan B de recorte o generación.
9. **Índice persistente**, solo si las mediciones superan unos 200 recursos por negocio. Tabla `design_asset_index` con columnas `business_id`, `asset_kind` (`logo`, `icon`, `photo`, `illustration`, `partner_badge`), `source`, `source_ref`, `label`, `tags`, `style`, `width`, `height`, `sha256`, `usage_count`. RLS por membresía, índices `(business_id, asset_kind)` y GIN sobre `tags`, etiquetado al subir. Mover el constructor a `desaing-state`, que es la función ligera. Necesita una migración nueva y tu aprobación.
10. **Caché:** esquema estable del planner y reordenar el prompt del generador. Medir antes y después.

**Seguridad, en paralelo y por separado (ya detectado):**
- **Ramas sin autenticación en `generate-design-html`.** La función tiene `verify_jwt = false` en `supabase/config.toml` y solo `design-canvas` valida el JWT. `xending-slide` y las demás ramas pueden disparar llamadas a OpenAI sin sesión. No conviene revivirla; hay que retirarla o autenticarla.
- **URLs firmadas de Storage con token escritas en el código:** `XENDING_LOGO_URL` en `supabase/functions/generate-design-html/index.ts:17` y `LOGO_URL` en `src/constants/presentationTemplates_v2.ts:12` (valor omitido). Conviene servir el logo como recurso del negocio y renovar la firma.
- **`design_images` y bucket `Brand`.** Revisar la política `USING (true)` de `design_images` y las políticas del bucket `Brand`, que no están en las migraciones.

**Riesgo de perder trabajo:** unos 50 archivos sin seguimiento en git son módulos centrales de este flujo. Conviene commitearlos cuando el trabajo paralelo termine; no lo hice.

**Verificación** de cada paso (desde la raíz del repo):

```powershell
npm test
npm run type-check
npm run lint
deno check --no-lock supabase/functions/desaing-server/index.ts
deno check --no-lock supabase/functions/generate-design-html/index.ts
```

Según el reporte `gpt-vision-reference-regression`, ya fallan 15 pruebas de piloto y presupuesto en `_shared/desaing/__tests__`, sin relación con este cambio.

**Prueba real final**, después de desplegar: el caso Xending de 3 a 6 tarjetas. El plan debe nombrar íconos de la biblioteca, el resultado no debe tener huecos y no debe aparecer ningún logo de otra marca.

### 5.11 Modelo

Conviene mantener gpt-5.4-mini en el planner y en las ediciones: elegir IDs con enum estricto es una tarea fácil para un modelo mini. gpt-5.4 vale la pena evaluarlo solo para la reescritura completa o `replicate`, después de medir unos 10 casos reales. Con recursos y componentes reales, el generador depende menos de su propia creatividad.

## 6. Verificado frente a inferido

- **Verificado en el código y en git:**
  - las 8 fuentes y sus tablas, buckets, políticas y hooks;
  - el filtro de logos que cae a "todos" y el UUID que se pasa como `brandKey`;
  - la política `USING (true)` de `design_images`;
  - que el planner trabaja sin herramientas y con un esquema dinámico;
  - que solo `brand-logo` está en `editable_assets`;
  - los huecos `src=""`, los íconos repetidos que se vacían y las URLs nuevas que pasan sin validar;
  - el historial de los 5 ejemplos, su tamaño y que `design-canvas` no los usa;
  - la falta de autenticación de la rama legacy y las URLs firmadas en el código;
  - los límites de payload, enums y presupuesto;
  - la validación cúbica del catálogo.
- **Verificado en la web:** precios y capacidades de gpt-5.4-mini; reglas de caché, function calling, Structured Outputs y tool search; principios de Anthropic; límites de Supabase.
- **Inferido o estimado:**
  - los tokens y costos por opción, con los supuestos de §4;
  - que el esquema dinámico rompe el caché;
  - que los huecos provocan reparaciones inútiles;
  - los volúmenes de recursos.
- **No verificado:**
  - cuántos recursos hay por negocio;
  - las políticas reales del bucket `Brand` y la política de INSERT de `design-images`;
  - qué versión de las funciones está desplegada (si incluye el working tree);
  - el uso real de `xending-slide` en producción, porque no hay logs.
