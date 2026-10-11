# Plan: diseñar sobre lo que ya existe (HTML e Imagen IA)

Rama `codex/ui-crear-editar-v2`, HEAD `8176473`. Investigación de solo lectura: no se cambió código, no se llamó a APIs pagadas y no se leyeron `.env*`.

## Resumen

1. La idea no falló. Falló la ejecución. Lo que se intentó entre el 7 y el 10 de octubre (ficha de estilo, conservar textos, partir del original, ediciones sin IA) era la dirección correcta, pero se implementó con huecos.
   - Las reglas del prompt se contradicen y cambiaron de sentido tres veces en horas.
   - La ficha medida no llega en tres caminos: Imagen IA, fuente de otra diapositiva y cuando la medición todavía no termina.
   - La regla de TAMAÑO MÍNIMO (07c7242) le gana a la ficha. Por eso cambian los tamaños de Poppins y Montserrat.
   - Nadie comprueba la salida contra la ficha. Solo hay un guard para el texto.
   - Las referencias de estilo de la sesión se vuelven a enviar en cada ajuste, con la orden «Nunca descartes una referencia de estilo».
2. Tu hipótesis se confirma para Imagen IA: el HTML actual nunca llega como imagen base.
   - Se captura, se reduce a 1024 px y se manda como `layout_reference`, al final de la lista, en una acción que el planner define como «diseño raster nuevo».
   - El servidor hoy prohíbe usar esa captura como base. Un test fija ese comportamiento.
   - Así, el modelo rehace la diapositiva por construcción, no por capricho.
3. En HTML, `current_html` sí llega. Lo que se pierde en el camino es la captura, la ficha y la prioridad de la base.
4. Recomendación:
   - Primero, una Fase 0 sin código (~US$1) que separa «el modelo de imagen deriva aunque tenga base» de «nunca le dimos la base».
   - En paralelo, las fases HTML de bajo riesgo (F1–F3). Son las que más arreglan lo que reportas.
   - La imagen con base (F4) se construye solo si la Fase 0 la valida.

---

## A. Qué se intentó y por qué falló

### Línea de tiempo (git log)
| Commit | Qué intentó | Qué pasó después |
|---|---|---|
| `cb23262` 7-oct 10:50 | «Diseño actual»: el aspecto lo define SIEMPRE la diapositiva y no la referencia | 8 minutos después se invierte |
| `ad3795b` 10:58 | «Seguir el patrón NO es dejar la diapositiva tal cual: la composición se rediseña… puede cambiar libremente» (`conversationActions.ts`, `designCanvasHtml.ts`) | Invita a rehacer. Sigue vivo en P6: «Libertad de composición…» (`designCanvasHtml.ts` l.240) |
| `17bec88` 11:18 | Siempre partir de la diapositiva original. Nueva base «Esta versión» | Correcto, se mantiene |
| `e27e806` 11:34 | Mover, quitar o repetir imágenes montadas sin rechazo | Correcto |
| `7268c7c` 11:43 | Con texto resuelto, no enviar los píxeles de la referencia al adaptar (`references: []`) | **Revertido sin aviso en `c84ae97`** (git log -S). Además se añadió «Nunca descartes una referencia de estilo por existir HTML ACTUAL» (`designCanvasHtml.ts` l.244) |
| `3c842fe` 12:04 | Ficha de estilo medida (`styleSpec.ts`) que va al chat y al motor HTML | Solo con Formato HTML. Se descarta con `design_source`. Es solo texto, sin clases. Nadie la verifica después |
| `c84ae97` 9-oct | Chat unificado: 106 archivos y +10 060 líneas en un commit | Mezcló y deshizo decisiones anteriores (la de `7268c7c`) |
| `07c7242` 9-oct | Obedecer órdenes, `edit_elements` estructural (3→6 sin IA), `rewrite`, **TAMAÑO MÍNIMO** (`designTypography.ts`: cuerpo ≥ 18 px en 1920×1080) | El mínimo «prevalece sobre la base y la FICHA» (design.md C9). Choca con «los tamaños deben ser iguales» |
| `8176473` 10-oct | Si falla la captura de la fuente en HTML, se sigue sin ella | En Imagen IA la captura sigue siendo obligatoria (l.991-993) |

No hay commits de revert. Los cambios se deshicieron de forma implícita dentro de commits grandes.

### Dónde se pierde el dato (tu hipótesis, de punta a punta)

**Imagen IA con Base «Diapositiva original» o «Esta versión» (sin imagen IA previa)**
1. La captura va como referencia, no como base: `useDesignConversation.ts` l.1019-1030 hace `uploaded.push({ reference: { ...capture, roles: ['layout_reference'] } })`. `base` solo se llena si ya existe una imagen IA o un asset fuente (l.1014-1019). El test `useDesignConversation.test.ts` l.1207-1237 lo fija: «uses the exact HTML capture as a fourth image-generation reference», con `expect(generated.base).toBeUndefined()`.
2. El servidor no admite la captura como base. `serverGeneration.ts` `assertOperation` (l.~146-178) exige `generate_image` sin `base_asset`. `edit_image` en presentaciones exige que la base tenga como padre un job IA `full_design`, y una captura importada no lo tiene. El precedente que sí acepta un PNG cualquiera como base es `production` (`presentationServerDesign.ts` l.~283, `serverProduction.ts`).
3. Resolución: `preparePresentationReference` normaliza a 1024 px (`presentationReferences.ts` l.105) y `import` exige ≤1024 (`PILOT_LIMITS.maxReferenceEdge`, `pilotHttp.ts` l.17). Una diapositiva de 1920×1080 llega a 1024×576 y la salida es de 1536×864: los textos chicos llegan ilegibles y el modelo los repinta. Una base de edición podría llegar hasta 4096 (`serverGeneration.ts`: `edit && isBase ? 4096`).
4. Orden y etiqueta: la captura va después de las referencias del usuario (posición 4 en el test). El prompt solo dice `N: reference; roles: layout_reference` (`imageRequest.ts` `prepareImageInputs`), o sea «composición», no «edita esto».
5. El prompt no lleva ficha, ni estructura, ni HTML, ni tipografía medida. `buildConversationImageOperation` (`designConversationImages.ts`) recibe instrucción, marca (JSON), copy y referencias. Además, el planner no recibe `style_spec` con Formato Imagen (`useDesignConversation.ts` l.772: `format === 'html'`).
6. Semántica: el planner lee «generate_image crea un diseño raster nuevo» (`conversationActions.ts` l.362).
7. Al editar una imagen IA previa (`edit_image`), no se reenvía su `effective_prompt` (`buildConversationImageOperation`).
8. La captura se omite si ya hay 4 referencias y la inspección incluyó la diapositiva (l.1021). Es menor.

**HTML (refine/patch/rewrite)**
1. `current_html` sí llega: `SlideGeneratorPanel.tsx` `requestHtml` l.242 (`proposalBase?.html ?? props.currentHtml`, o el original con `fromCurrent`).
2. La captura del HTML actual (`render_base64`) se pierde en silencio en tres casos:
   - si ya hay 4 referencias (l.242);
   - si el cuerpo pasa de 5 MB (l.252);
   - si falla el render (`.catch(() => undefined)`, l.231).
3. `style_spec`:
   - Se descarta con cualquier `design_source`, por ejemplo al adaptar otra diapositiva (l.248 `!designSource`).
   - Queda vacía si la medición no terminó o falló. `UnifiedDesignWorkspace.tsx` l.59-66 traga el error y `spec` vale `''` mientras no resuelve. Que el usuario envíe antes de que termine es inferido, no reproducido.
   - Con base `new` no se envía al planner.
4. Fuente de diapositiva con `adapt_layout`: llega con `design_base: 'new'` y siempre como `edit_mode: 'rewrite'` (l.237, l.245), sin ficha.
5. Referencias persistentes: cada ajuste reenvía todas las referencias de la sesión (`htmlContext` → `conversationHtmlReferences`, `designConversationVisuals.ts` l.151), salvo `content_source` con copy literal. Eso se suma a l.244 «Nunca descartes una referencia de estilo».
6. Planner: el resumen de `current_html` se recorta hasta 600 caracteres si el request supera 64 KB (`designConversationDeck.ts` `fitConversationPresentationRequest`). Pasa en decks grandes.
7. Nadie corrige tipografía ni tamaños al final. `finalizeDesignCanvasHtml` solo valida texto, imágenes montadas y dimensiones.

### Fallos de idea frente a fallos de ejecución
- **Ejecución (la mayoría):**
  - Reglas contradictorias en P6: libertad de composición, «recalcula tamaños», mínimo > ficha y «no descartes la referencia» frente a «conserva clases y tipografía».
  - El reporte `design-chat-confirmation-loop` (C4, C5, C8, C9) ya lo documentó. `07c7242` resolvió C4 y C8, pero C9 quedó al revés de lo que pides.
  - La ficha no llega en 3 caminos y no tiene clases ni selectores.
  - No hay verificación de estilo en la salida.
  - La reversión silenciosa de `7268c7c`.
  - Prompts de 11–18 k caracteres (`design-pipeline-cost/report.md` §Resumen 1) que diluyen las reglas.
  - En Imagen IA nunca se implementó «ajustar desde el HTML». Solo existe «editar una imagen IA previa».
- **Idea dudosa, sin verificar:** pedirle al modelo de imagen que repinte el copy literal y las fuentes exactas. Los modelos GPT Image regeneran la imagen completa incluso en `/edits`. En gpt-image-2, `input_fidelity` es fija en alta y no se envía como parámetro ([foro OpenAI](https://community.openai.com/t/openai-must-document-the-input-image-pricing-of-gpt-image-2/1382940)). Para gpt-image-2.5-flare no hay dato. Por eso va primero la Fase 0.

---

## B. Qué hay hoy de cada pieza

| Pieza | Hay | Falta |
|---|---|---|
| 1. Comparar antes de proponer | Ficha medida (`styleSpec.ts` `formatStyleSpec`) visible en Referencias. Catálogo `editable_elements` con grupos de tarjetas. `design_understanding.preserve`. Plan con «¿Lo creo así?» | Un «Lo que tienes / Lo que pides / Qué cambio / Qué conservo» armado sin IA. Una lista de lo que se desbloquea (sin ella, conservar por defecto no se puede verificar) |
| 2. Imagen IA ajustando el HTML | Captura del HTML (`captureConversationHtml`), `edit_image` sobre imagen IA y endpoint `/v1/images/edits` | La captura como base (cliente y servidor), resolución de base 1536, un prompt de edición corto con ficha, estructura, textos y cambios, y modo explorar separado |
| 3. Prompt de la imagen base | `provenance.effective_prompt` en cada versión Desaing (`serverWorker.ts` l.362), legible con `readConversationImage`. Patrón «prompt de origen + Cambios solicitados» en `serverProduction.relativeProductionInstruction` | Usarlo en `edit_image`, una ficha para referencias subidas y la UI «Prompt usado» |
| 4. HTML no rehace | `edit_elements` determinista (retext/duplicate/remove/reflow, `designElementEdits.ts`, `designElementTools.ts`), patch por defecto, `rewrite` explícito, guard de copy literal | Ficha con `design_source`, referencias solo cuando se nombran, la corrección final de fuentes y tamaños, una métrica de clases conservadas y P6 sin contradicciones |

---

## C. Plan por fases

Interruptor general: `VITE_DESAING_DESIGN_FROM_EXISTING`, con subflags por fase en `PresentationDesignContext.tsx`, siguiendo el patrón `VITE_DESAING_*`. Para el servidor se usan capacidades nuevas en `serverGenerationContract.ts`, como `supports_*`. Apagado = comportamiento actual.

Las pruebas de cada fase corren solo sobre los archivos tocados. Al final: `npm test`, `npm run type-check`, `npm run lint` y `deno check --no-lock` de `desaing-server/index.ts` y `generate-design-html/index.ts`.

### Protocolo manual (se repite en cada fase)
Se usan 3 diapositivas reales de Xending, en una sesión nueva:
- **P1:** «agrega 3 cuadros más» (3→6 tarjetas).
- **P2:** «cambia el título a «…»».
- **P3:** adjuntar una referencia y pedir «aplica el estilo de esta referencia».

Se anota para cada una:
- la ficha de la base y la ficha de la salida (con la base «Esta versión» se ve la ficha de la versión);
- si los textos quedaron intactos;
- las llamadas pagadas (`desaing_explorations` y logs de `generate-design-html`).

Una fase se acepta cuando cumple su criterio en 3 de 3 casos.

### Fase 0: prueba barata del enfoque de imagen (sin código)
- **Qué:** separar el fallo de ejecución del fallo del modelo. En las 3 diapositivas, con Formato Imagen IA y Base Diapositiva original:
  - a) «genera esta diapositiva como imagen tal cual». Es el camino actual: la captura va como referencia.
  - b) Con esa imagen seleccionada (Base Esta versión): «cambia solo el título a «…»». Es `edit_image` con base real, que ya existe.
  - c) Repetir b) pidiendo «cambia el fondo de las tarjetas a …».
- **Criterio:** en b) y c), fuera de lo pedido no cambian los textos (carácter por carácter), ni el logo, ni la familia y el tamaño aparente de la letra, ni el color o radio de las tarjetas, ni el número de elementos. Revisión humana lado a lado.
- **Lectura del resultado:**
  - Si a) deriva y b) y c) se conservan, el problema era la ejecución y F4 vale la pena.
  - Si b) y c) también derivan, **no construir F4**. Imagen IA queda para explorar y para fondos o ilustraciones sin texto (`copyMode 'none'`, ya existe). «Ajustar» va por HTML y luego se exporta el HTML como PNG con el renderer actual, sin deriva y sin costo de imagen.
- **Costo:** 3 × (1 generación + 2 ediciones) en calidad low ≈ US$0.03–0.09 cada una, más ~10 turnos de planner a ~US$0.013. Total **≈ US$0.5–1.0**.
- **Riesgo:** ninguno en código. Mitigación: usar calidad low.

### Fase 1: ficha confiable y respetada (HTML, bajo riesgo y mayor impacto)
- **Cambio:**
  1. `styleSpec.ts`: agregar a cada nivel tipográfico y componente su selector estable (primera clase o `#id`) y exponer `collectStyleSamples` para comparar.
  2. `UnifiedDesignWorkspace.tsx` y `useDesignConversation.ts`: esperar la ficha (máximo 8 s) antes de enviar. Si falla, mostrar «Ficha no disponible» en vez de seguir en silencio.
  3. `SlideGeneratorPanel.tsx` l.248: con `design_source` de diapositiva, enviar la ficha **de la fuente** en lugar de omitirla.
  4. `designCanvasHtml.ts` P6, solo en `patch` y `rewrite` con `current_html`:
     - la FICHA prevalece sobre el TAMAÑO MÍNIMO en los componentes existentes y en sus copias;
     - el mínimo aplica solo a texto nuevo sin componente equivalente;
     - quitar «Libertad de composición» y «Recalcula… tamaños» en modo `patch`. Se dejan en creación nueva.
- **Archivos:** `src/lib/presentations/styleSpec.ts`, `src/components/presentations/UnifiedDesignWorkspace.tsx`, `src/components/presentations/SlideGeneratorPanel.tsx`, `supabase/functions/_shared/designCanvasHtml.ts`, y sus tests (`styleSpec.test.ts`, `designCanvasHtml.test.ts`, `SlideGeneratorPanel.inspection.test.ts`).
- **Aceptación:** en P1 y P2, cada nivel tipográfico de la salida tiene la misma familia y tamaño ±1 px que la base. Las tarjetas mantienen fondo, radio y sombra. Los textos quedan intactos.
- **Validar barato:** los tests unitarios del formateador y el builder del prompt. Después, P1 y P2 en real (2 llamadas HTML ≈ US$0.10–0.40).
- **Interruptor:** subflag `ficha_estricta`. Apagado = prompt y envío actuales.
- **Costo por uso:** igual al actual. La ficha añade ~800 tokens de entrada ≈ US$0.0006.
- **Riesgos:**
  - Con 6 tarjetas a tamaño original puede no caber. Mitigación: F2 detecta el desborde y pregunta.
  - Contradice la decisión C9 de `07c7242`. Ver la Decisión 1.

### Fase 2: candado de estilo determinista y «lo que tienes / lo que pides»
- **Cambio:**
  1. Nuevo `src/lib/presentations/styleLock.ts`:
     - compara las muestras de la base y de la salida por selector;
     - para las propiedades no desbloqueadas (familia, tamaño, peso, color de texto, fondo, radio y sombra de los componentes) inyecta `<style id="scory-style-lock">` con los valores de la base;
     - después corre `designStructuralCheck.ts` (render sin IA). Si hay desborde, retira el candado de tamaño y deja el aviso «No cabe con el tamaño original; ¿reacomodo o reduzco a N px?».
  2. Desbloqueo: campo opcional `unlock` en `design_understanding` (`conversationActions.ts`, `explorationProvider.ts`), enum de 4 valores: `typography`, `colors`, `components`, `layout`. **Sin `unlock`, el candado solo informa y no corrige.** Así nunca revierte un cambio que sí pediste.
  3. UI: panel «Lo que tienes» (ficha resumida, armada sin IA) / «Lo que pides» (tu mensaje) / «Qué cambio» (el plan y `unlock`) / «Qué conservo» (el resto). Después de generar: «Diferencias de estilo: ninguna» o la lista.
- **Archivos:** `src/lib/presentations/styleLock.ts` (nuevo), `SlideGeneratorPanel.tsx` (después de recibir la propuesta, ~l.294), `UnifiedDesignWorkspace.tsx`, `supabase/functions/_shared/desaing/conversationActions.ts`, `explorationProvider.ts`, y tests nuevos y existentes de esos módulos.
- **Aceptación:**
  - En P1, P2 y P3, 0 diferencias no pedidas después del candado.
  - En P3 (estilo de referencia), `unlock` incluye `colors` o `components` y el candado no revierte lo pedido.
  - Clases de la base presentes en la salida: 100 % en patch y ≥90 % en rewrite. Es una métrica nueva que se muestra como aviso.
- **Validar barato:** tests con dos HTML fijos (base y salida con la fuente cambiada) y la prueba del presupuesto de enums existente (`explorationProvider.test.ts`). En real: P1–P3.
- **Interruptor:** subflag `candado_estilo`. El servidor acepta clientes sin `unlock`.
- **Costo por uso:** US$0. Es cómputo en el navegador (~100–300 ms). El planner suma ~20 tokens de salida.
- **Riesgos:**
  - El selector no es estable si el rewrite renombra clases. Mitigación: emparejar por rol (nivel y orden) como respaldo y avisar.
  - El enum puede rozar el límite de 1000 del proveedor. Mitigación: los escalones de presupuesto que ya existen.

### Fase 3: el HTML no rehace por defecto
- **Cambio:**
  1. Las referencias de estilo solo viajan en el turno cuyo plan las cita (`action.reference_ids`). Así se retoma de forma controlada la idea de `7268c7c`. Archivo: `useDesignConversation.ts` `htmlContext`.
  2. P6 l.244: «Nunca descartes una referencia de estilo» pasa a ser «Usa una referencia de estilo solo si el encargo la nombra».
  3. Reservar un lugar para `render_base64` (la captura actual) antes que el 4.º adjunto, y avisar cuando se omite (`SlideGeneratorPanel.tsx` l.231 y l.242).
  4. `adapt_layout` desde una diapositiva: intentar primero `edit_elements` o patch sobre la copia del HTML fuente. Rewrite solo si eso falla (hoy siempre reescribe, l.245).
  5. La cascada `edit_elements` → patch → rewrite queda como está (07c7242).
- **Archivos:** `useDesignConversation.ts`, `SlideGeneratorPanel.tsx`, `designCanvasHtml.ts`, `conversationActions.ts` (una línea), y sus tests.
- **Aceptación:**
  - P2 (título) se resuelve con `edit_elements` o patch, sin rewrite.
  - P1 sin rewrite si `edit_elements` lo cubre.
  - Con una referencia adjunta en un turno anterior, «cambia el título» no altera colores ni tarjetas (0 diferencias con el candado en modo informe).
- **Validar barato:** tests de `useDesignConversation` (las referencias enviadas por turno) y del builder. En real: P1–P3 más un turno extra con la referencia vieja.
- **Interruptor:** subflag `referencias_por_turno`.
- **Costo por uso:**
  - edit_elements ≈ US$0.013, solo el planner;
  - patch ≈ US$0.05;
  - rewrite ≈ US$0.07–0.20 (pipeline-cost §3).
  - Ahorra rewrites en `adapt_layout`.
- **Riesgos:** puedes esperar que una referencia de hace 3 turnos siga aplicando. Mitigación: el plan dice «No uso la referencia X en este ajuste; dime si la quieres».

### Fase 4 (solo si la Fase 0 pasa): Imagen IA en modo ajustar desde el HTML
- **Cambio:**
  1. Cliente: con Formato Imagen, una base Diapositiva o Versión HTML y una intención de ajuste, se captura el HTML en 1536×864 y se sube como **base**, no como referencia. Es un `prepareConversationBase` nuevo, separado de `preparePresentationReference`. La acción es `edit_image`.
  2. Servidor:
     - `serverGeneration.ts` `assertOperation` acepta en `presentations` o `free_design` una base `imported` del mismo negocio, marca, proyecto y sesión (`base:<slide>`) ≤1536 px. El `import` admite base ≤1536 px solo para esa ruta. Patrón: `production`.
     - Nueva capacidad `supports_capture_base`.
  3. Prompt corto (meta < 2 500 caracteres) en un builder puro, `designConversationImageAdjust.ts`:
     - «Edita la imagen base (archivo 1). Conserva todo lo no pedido»;
     - la ficha resumida: fondo, tarjetas y niveles tipográficos con familia y px;
     - la estructura del catálogo (p. ej. «3 tarjetas en fila con ícono arriba»);
     - los textos literales por bloque;
     - «Cambia SOLO: …»;
     - sin JSON de marca: la marca ya está en la base, queda solo la regla del logo.
  4. «Explorar diseños» sigue con `generate_image` y la captura como `layout_reference`, que es el comportamiento actual, con libertad.
  5. Actualizar el test l.1207-1237. El camino viejo queda bajo el flag apagado.
- **Archivos:** `designConversationImages.ts`, `useDesignConversation.ts` (~l.1019-1040), `designConversationImageAdjust.ts` (nuevo), `presentationReferences.ts`, `supabase/functions/_shared/desaing/serverGeneration.ts`, `serverGenerationContract.ts`, y tests de esos módulos y `serverGeneration.test.ts`.
- **Aceptación:**
  - En P2 y en «cambia el fondo de las tarjetas», un comparador de visión gpt-5.4-mini (base frente a salida, una llamada de ≈ US$0.005) lista solo los cambios pedidos.
  - Textos idénticos en 3 de 3 casos y logo intacto.
  - Ficha visual (fondo, tarjetas y tamaño aparente) sin diferencias.
  - Si falla en más de 1 de 3 casos, se apaga el flag y se aplica la alternativa de la Fase 0.
- **Validar barato:** tests del builder (longitud y contenido) y de `assertOperation` (acepta la base importada correcta y rechaza la de otro negocio o proyecto, o > 1536 px). Después, 3 ediciones reales (≈ US$0.3).
- **Interruptor:** subflag `imagen_ajuste_con_base` más la capacidad del servidor. Si el servidor es viejo, el cliente usa el camino actual.
- **Costo por uso (flare):**
  - low ≈ US$0.03–0.09;
  - medium ≈ US$0.06–0.12;
  - más el planner, ~US$0.013;
  - comparador opcional, US$0.005.
  - La base de 1536 cuesta más entrada que la referencia de 1024, ~US$0.01–0.05. Es el término más incierto (pipeline-cost §1).
- **Riesgos:**
  - Seguridad: aceptar bases importadas. Mitigación: identidad, negocio, marca, proyecto y prefijo de sesión exactos, con tests de rechazo. Esta fase merece 1 revisión.
  - El texto repintado mal. Mitigación: copy por bloques cortos. Si aun así falla, imagen sin texto con los textos en HTML encima (el lienzo editable ya existe).

### Fase 5: el prompt de la imagen en que nos basamos
- **Cambio:**
  1. Al editar una versión Desaing (`edit_image`) o citarla como referencia, añadir «Prompt de origen» (`provenance.effective_prompt`, recortado a 1 500 caracteres) seguido de «Cambios solicitados: …». Mismo patrón que `relativeProductionInstruction`. Archivos: `designConversationImages.ts` y `readConversationImage`.
  2. Referencias subidas: el planner ya ve sus píxeles. Se le pide, una vez por `sha256`, una ficha de ≤ 300 caracteres en `design_understanding.references[].instruction`: fondo, tarjetas, tipografía aproximada y paleta. Se guarda con la referencia en `designConversationStore.ts` y no se vuelve a pedir.
  3. UI «Prompt usado» en cada versión y referencia: se ve y se edita. El texto editado sustituye a la ficha o al prompt de origen en el siguiente turno.
- **Archivos:** `designConversationImages.ts`, `useDesignConversation.ts`, `designConversationStore.ts`, `UnifiedDesignWorkspace.tsx`, `conversationActions.ts` (una línea), y sus tests.
- **Aceptación:**
  - El `effective_prompt` del padre aparece en el prompt de la edición (test del builder).
  - La ficha de una referencia se genera una sola vez (test del store).
  - Editar «Prompt usado» cambia el siguiente prompt.
  - En P3, el plan cita la ficha de la referencia.
- **Validar barato:** solo tests. En real: P3 una vez (≈ US$0.02–0.2 según el formato).
- **Interruptor:** subflag `prompt_base`.
- **Costo por uso:** ~US$0.001–0.004 por la entrada extra. Sin llamadas nuevas.
- **Riesgo:** un prompt de origen largo diluye el cambio. Mitigación: recortarlo y poner «Cambios solicitados» al final.

### Orden y costo de implementación
F0 (sin código) → F1 → F2 → F3 → (F4 si F0 pasa) → F5. F1, F2 y F3 son independientes de F0 y pueden empezar ya.

Esfuerzo aproximado:
- F1 y F3: pequeño, unas horas cada una.
- F2: mediano.
- F4: mediano a grande, con servidor y seguridad.
- F5: pequeño.

Pruebas reales totales: ≈ US$2–4.

### Verificado frente a inferido
- **Verificado leyendo código y tests:**
  - todos los puntos de pérdida citados;
  - el test que fija la captura como referencia;
  - que el servidor prohíbe la base importada;
  - el límite de 1024;
  - la reversión de `7268c7c` en `c84ae97` (`git log -S`);
  - que no existe ninguna corrección de estilo al final.
- **Inferido, sin ejecutar nada pagado:**
  - que el modelo de imagen conserve la base (por eso la Fase 0);
  - que la ficha llegue vacía por carrera;
  - los costos, estimados con tarifas oficiales y el reporte `design-pipeline-cost`, no medidos;
  - que `07c7242` esté desplegado (lo que explicaría los tamaños).

---

## D. Decisiones que necesito (máximo 3)

1. **¿La ficha le gana al tamaño mínimo en los componentes que ya existen?** Hoy, desde `07c7242`, el mínimo (18 px de cuerpo en 1920×1080) agranda los textos de la base.
   - Recomendación: **sí**. Los componentes existentes y sus copias conservan sus px medidos. El mínimo aplica solo a texto nuevo. Si no cabe, se pregunta.
2. **Si la Fase 0 muestra que la imagen deriva aun con base, ¿aceptas que Imagen IA quede para explorar y para fondos o ilustraciones sin texto, y que «ajustar» vaya por HTML exportado a PNG?**
   - Recomendación: **sí**. Da fidelidad del 100 % con costo de imagen cero. La imagen IA se usa donde aporta algo nuevo.
3. **¿Una referencia adjunta solo se aplica en el turno en que la nombras o que el plan la cita?** Evita que su estilo se cuele en cada ajuste posterior.
   - Recomendación: **sí**, y el plan avisa cuando no la usa.
