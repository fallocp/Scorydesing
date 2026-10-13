# Patrones del deck: replicarlos siempre con variedad (análisis y propuesta)

Investigación de solo lectura. Rama `feat/own-local-supabase`, HEAD `e900b50`. No cambié código.

## Respuesta corta

- **Qué hacen los sistemas de imágenes.** Separan tres capas:
  1. Un ADN fijo y versionado: `newsStyleV1` y `xendingVisualSystem`.
  2. Un catálogo cerrado de arquetipos por ID. Cada arquetipo trae dentro sus variantes: (a), (b), (c)…
  3. Unas reglas deterministas que la IA no puede saltarse: enum con fallback, «no tres layouts iguales seguidos», «no dos composiciones idénticas contiguas», ranking por novedad contra lo reciente, y repertorio por marca sin mezclar marcas.

  La IA solo elige dentro del catálogo.
- **Qué pasa hoy en diapositivas.** Medimos muy bien una diapositiva: ficha por rol, acentos, líneas y tarjetas (`collectRoleSheet`). Pero no existe el nivel «deck»:
  - Lo único que se agrega entre diapositivas es la escala tipográfica (≤6 vecinas).
  - Nadie clasifica los acomodos (arquetipos).
  - El estilo completo solo se copia cuando el usuario cita «la slide 2».
  - Los ejemplos que recibe el generador se eligen por cercanía, no por el acomodo que se necesita.
  - No hay anti-repetición frente a las vecinas ni memoria.
- **Propuesta.** Un «Sistema de la presentación», detectado sin IA en el navegador a partir de las fichas que ya medimos:
  - **Tokens por rol, acentos, líneas, tarjetas y tratamiento de foto:** se aplican siempre, sin IA, con la misma transferencia de `e900b50`.
  - **Arquetipos de acomodo recurrentes:** cada diapositiva lleva una firma de 5 atributos, como en el carrusel. La variedad se decide con reglas: arquetipo, número y orientación de tarjetas, lado de la foto y posición del acento, sin repetir la firma de la vecina.
  - **El planner** elige el arquetipo por ID y lo nombra en el plan. **El generador** recibe una sola diapositiva real de ese arquetipo como ejemplo, en vez de las 3 más cercanas.
- **Costo y alcance.** La detección y la aplicación cuestan $0. Por turno se suman unos 700 tokens al planner (≈ $0.0005). En el generador debería bajar el costo, porque pasa de 3 ejemplos de hasta 40 k caracteres a 1; hay que medirlo. Las fases 0 a 2 son solo cliente, sin migración ni despliegue.

---

## 1. Cómo codifican patrones y variedad los sistemas de imagen

| Mecanismo | Dónde | Qué aprendemos para diapositivas |
|---|---|---|
| ADN fijo y versionado | `_shared/news/newsStyleV1.ts` (`NEWS_STYLE_PROFILE = 'xending_news_v1'`, master, negative y directives); `_shared/desaing/xendingVisualSystem.ts` (`xendingStyleBlock` por estilo `white_v2`/`white_v3`/`navy`) | El sistema del deck también debe tener versión y ser un bloque fijo. Se cambia agregando una versión v2, no editando la v1. |
| Arquetipo = ID + motor + layout por defecto + prompt con variantes internas | `_shared/news/archetypes.ts` (`NEWS_ARCHETYPES`; p. ej. `archetypeTradeMap` (a)–(g): «VARY the choice between slides… do not default to cargo trucks») | La variedad vive **dentro** del arquetipo: un mismo acomodo admite 2 a 4 variantes. Un arquetipo nuevo no significa un diseño nuevo. |
| Fallback seguro | `getNewsArchetype` / `fallbackArchetypeForEngine` | Un ID desconocido cae en un fallback del mismo deck. Nunca en un diseño genérico ni en un throw. |
| IA elige y las reglas deterministas corrigen | `newsVisualResolver.ts`: `buildResolverMessages` (REGLAS DE DIVERSIDAD en el prompt) y `coerceResolutions` (`pick()` contra enums y guardias) | El prompt **pide** variedad, pero solo se garantiza lo que se aplica en código: `enforceLayoutVariation` rompe rachas de 3 layouts iguales. El «no repitas visual_subject» quedó solo en el prompt. |
| Firma de composición y validador | `_shared/carouselStoryRegistry.ts` `compositionSignature` (`visualStructure/copyZone/cameraScale/density/alignment`); `validateCarouselCreativePlan.ts`: `identical_adjacent_composition` (bloquea), `low_composition_variety` (mínimo de estructuras distintas), `closing_repeats_resolution` | Este es el modelo que conviene copiar: comparar la **firma completa**, no una etiqueta. Una etiqueta como `hero_clean` juntaba cosas distintas. |
| La política de layout la declara el set | `carousel-plan-types.ts` `PresetLayoutPolicy = 'varied' \| 'repeated' \| 'progressive' \| 'mirrored'` | A veces repetir es la intención: pasos 1-2-3 o una serie. La regla de no repetir tiene que poder apagarse. |
| Memoria de lo usado | `rankRoutesByNovelty(routes, recentRouteIds)`: lo reciente **se manda al final, no se elimina**; `generate-ideas` `previousIdeas` en cascada desde BD (l.1353–1426) como «FILTRO DE PATRONES» | La anti-repetición debe degradar el orden de los candidatos, no prohibir. Si se prohíbe y el deck solo tiene 2 arquetipos, se queda sin salida. |
| Repertorio por marca, sin prestar | `_shared/sceneKitRegistry.ts`: `SCENE_KITS` es `Partial`, `getSceneKit` devuelve `null`; nunca entrega el kit de otra rama | Si un negocio no tiene sistema detectado, recibe solo la parte neutral. Nunca recibe el sistema de Xending. |
| Validación de datos por lista blanca | `newsPromptBuilder.ts` `extractAllowedFigures` / `buildDataRules` | Equivale al guard de copy que ya tenemos: el sistema del deck nunca aporta texto. |

**Problemas que tuvieron** (`.agents/tasks/fx-peso-energy-misclassification/report.md`; comentarios en `sceneKitRegistry.ts` y `scene-kits/types.ts`):
1. **Una guardia determinista sobreescribió a la IA con una regla demasiado amplia.** Bastaba la subcadena `petrol` para convertir una nota del peso en «energy». Lección: las reglas deterministas solo imponen restricciones duras (tokens, no repetir la vecina) y no reclasifican el contenido por palabras sueltas.
2. **El prompt quedó contradictorio.** La guardia cambió el arquetipo pero dejó el sujeto que había elegido la IA. Se arregló con `GUARD_DIRECTION`. Lección: si una regla cambia el arquetipo, también tiene que reescribir la frase de acomodo de la instrucción.
3. **Una tabla «posición → respuesta» se impuso a la historia** (`moments` / `scenariosByRole`, borrados). Lección: no asignar el arquetipo por número de diapositiva. Portada y cierre son preferencias, no reglas.
4. **Repertorio global de una sola rama inyectado a todas**, con `CAROUSEL_SCENE_VARIETY`. Lección: un sistema por deck o por negocio, sin fallback a otra marca.

Sobre la skill `.agent/skills/scory-design`: `visual-system.md` y `layout-picker.md` son reglas fijas de la marca Xending (paleta, tipografía, márgenes, tabla ángulo → tipo de contenido). No traen mecanismos de rotación ni de memoria. Sirven como semilla de tokens por defecto **solo para Xending**.

## 2. Estado actual en diapositivas

**Qué se mide** (`src/lib/presentations/styleSpec.ts`):
- `collectStyleSamples` → `StyleSamples`: textos, cuadros con su fondo, radio, sombra, borde y relleno, y rectángulos de imagen. Con eso, `formatStyleSpec` describe los grupos de cuadros (`arrangement`: «en una fila de N» o «en N filas») y el ícono con su tamaño y lado (`placement`).
- `collectRoleSheet` → `RoleSheet`: 9 roles (`STYLE_ROLES`) con familia, tamaño, peso, itálica, mayúsculas, tracking y color. También acentos con posición (`AccentPosition`), líneas cortas (`DecorationSample`, con `below`), tarjetas (`CardSample`) y fondo con degradado.
- `deriveTypeScale` / `deckScale` (en `styleTransfer.ts`): tamaño más común por rol, ±2 px. Es **el único agregado entre diapositivas**, y solo sobre las ≤6 más cercanas (`UnifiedDesignWorkspace.tsx` `scaleSlides`).

**Cómo se usa:**
- **Base «deck»** (`designConversationHtml.ts` `buildDeckStyleKit`): toma las 3 diapositivas con contenido **más cercanas por posición**.
  - El planner recibe `deck_style.slides` (resúmenes de ≤4000 caracteres; validado en `conversationActions.ts` l.279–283).
  - El generador recibe `style_examples` (HTML inerte de ≤40 k caracteres cada uno, sin imágenes; `designCanvasHtml.ts` l.219–222 y l.316–319).
  - La ficha se mide solo de `deckKit.ids[0]`.
- **Base «current»**: la ficha es de la propia diapositiva. Si esa diapositiva está fuera del sistema, el error se conserva.
- **Transferencia sin IA** (`styleTransfer.ts` `buildTransferPlan` → `applyStyleTransfer` → `checkTransfer`): solo se activa cuando `styleSourceSlide` detecta «como la slide N». Ahí sí copia rol por rol, con la prioridad fuente < `accent_plan` < indicaciones del usuario.
- **Candado** (`styleLock.ts`): restaura lo que no se desbloqueó frente a la **base**, no frente al deck.
- **Legacy** (`generate-design-html/index.ts` `buildSlideSystemPrompt` l.544–722 y `_shared/slideExamples.ts`, 34 KB): 10 componentes y 5 ejemplos fijos de «Xending Light Editorial». Solo sirve para Xending y pesa unos 12 k tokens. El camino nuevo no lo usa (`design-asset-aware-agent/report.md` §2). Ese reporte ya recomendaba convertir esos componentes en «fichas de componente» sin texto y usar diapositivas reales del deck como ejemplos. `design-asset-manifest/design.md` no existe en el repo.

**Lo que falta para hablar de «patrones del deck»:**
1. **Agregado de estilo.** No hay moda por rol de color, familia y peso, ni patrón de acento con su frecuencia (p. ej. «título: últimas palabras en coral itálica en 7 de 9»). Tampoco hay agregado de líneas, tarjetas ni variantes de fondo (claro / navy de sección).
2. **Arquetipos de acomodo.** Nadie clasifica portada, título + N tarjetas, foto + pasos, split, cifras o cierre. El dato crudo existe (rectángulos de cuadros, imágenes y textos), pero no se convierte en firma.
3. **Tratamiento de imagen.** Solo se mide el rectángulo. Faltan radio, `object-fit`, máscara o degradado, si sangra al borde y de qué lado, y la proporción del lienzo que ocupa. Esto explica en parte el caso «el barco ni se ve».
4. **Roles que faltan.** Los números de tarjeta (01–04) caen en `label` (regex `^[\d\s.%+-]{1,6}$`), junto con los eyebrows en mayúsculas. Si el número va en turquesa y el eyebrow en coral, la moda de `label` mezcla los dos. Tampoco se miden la posición del logo, el pie ni el número de página.
5. **Ejemplos por cercanía y no por arquetipo.**
6. **Ritmo entre diapositivas.** No hay anti-repetición frente a las vecinas, ni política de serie, ni memoria.
7. **Persistencia y UI.** Todo se recalcula por sesión. `measureStyleSamplesCached` usa como clave el HTML completo y no tiene tope. No hay un panel donde el usuario vea o corrija el sistema.

## 3. Propuesta: «Sistema de la presentación»

### (a) Qué se detecta y cómo

Todo se detecta de forma determinista en el navegador y reutiliza `measureRoleSheet` y `measureStyleSamples`, que ya existen. Costo de IA: $0.

- **Tokens por rol.** Moda ponderada por diapositiva de familia, tamaño (de `deckScale`), peso, color, itálica, mayúsculas y tracking. Cada valor lleva su soporte («7/9»), y solo entra al sistema si aparece en ≥40 % de las diapositivas o en ≥2 de ellas.
- **Patrones de acento por rol.** `AccentPosition.kind` más color, itálica y degradado, con su frecuencia. Ejemplo: `title: end/2 palabras coral itálica (0.78)`.
- **Decoraciones.** Línea corta bajo el rol X, con color, tamaño y radio.
- **Tarjetas.** Fondo, radio, sombra, borde y relleno, más la orientación interna (ícono o número arriba o al lado).
- **Fondos.** Hasta 2 variantes, p. ej. claro y navy de sección, con la regla de dónde aparece cada una.
- **Foto e íconos.** Hay que ampliar `collectStyleSamples` para medir el radio, el `object-fit`, si sangra al borde y de qué lado, y la fracción del lienzo que ocupa. Para íconos ya se mide tamaño y lado dentro de la tarjeta.
- **Arquetipo y firma por diapositiva.** La firma es `estructura/n_tarjetas/orientación/lado_foto/densidad`. Estructuras: `cover`, `title_cards`, `photo_steps`, `split`, `stats`, `section`, `closing`, `free`. Se calculan con reglas geométricas:
  - el número de cuadros y sus filas;
  - si hay una imagen que ocupa más del 25 % del lienzo y en qué lado;
  - si hay números grandes en las tarjetas;
  - si hay solo un título y un subtítulo centrados.

  Los arquetipos del deck son las estructuras con ≥1 ejemplar. Para cada una se guarda como ejemplar la diapositiva más representativa.
- **IA opcional, no en las primeras fases.** Si la geometría da `free` en más del 30 % del deck, se pide una sola llamada que etiquete los resúmenes. Costaría unos 9 k tokens de entrada y 1 k de salida (≈ $0.011) por revisión del deck, en caché.

### (b) Qué es fijo y qué varía

- **Fijo, sin IA.** Tokens por rol, patrón de acentos, líneas, tarjetas, escala y tratamiento de foto. Se aplican después de generar con la transferencia que ya existe, usando como «fuente» una ficha sintética del sistema en vez de una diapositiva citada. Las indicaciones del usuario siguen ganando (orden actual) y los desbloqueos de `inferStyleUnlocks` se respetan. Los tokens se calculan por arquetipo cuando hay ≥2 ejemplares, para no aplanar la portada ni las secciones navy.
- **Variable, con reglas.**
  - Arquetipo: un candidato que encaje con el contenido (N ítems → tarjetas; una cifra → `stats`; foto pedida → `photo_steps` o `split`).
  - Número y orientación de tarjetas.
  - Lado de la foto.
  - Posición del acento, dentro de las variantes vistas en el deck.
  - Variante de fondo.
- **Anti-repetición.** La firma nueva no puede ser igual a la de la vecina anterior ni a la de la siguiente. Los candidatos se ordenan con el mismo criterio de `rankRoutesByNovelty`: lo de las vecinas va al final, no se elimina. Excepción: si las dos vecinas comparten estructura (una serie), la política pasa a `repeated` y se conserva el acomodo, pero se varía un eje menor.

### (c) Dónde se guarda

- **Fase 0 a 2, sin migración.** Se recalcula en el cliente y se cachea en memoria por `presentationId` más una huella de `(slide.id, revision)`. Cada ficha se cachea por `id:revision` y no por el HTML completo. No se guarda nada nuevo. `presentations.slides` es un arreglo validado por `assertPresentationSlides`, así que no conviene meter ahí un objeto del deck.
- **Correcciones del usuario.** Fijar un arquetipo, excluir una diapositiva o fijar un token. Requiere la columna `presentations.design_system jsonb` (migración) y hereda la RLS de fila `"Users can manage own business presentations"`, sin política nueva. Tope: unos 8 KB, con `version`.
- **Por marca o negocio, opcional.** Tabla `brand_design_systems (id, business_id FK, version, system jsonb, source_presentation_id, created_at)`, con RLS por `business_id` e índice `(business_id, created_at)`. **Requiere tu aprobación.**

### (d) Cómo lo usa el chat y la UI

1. El cliente arma el sistema del deck una vez por sesión (`UnifiedDesignWorkspace`) y preselecciona hasta 3 arquetipos candidatos para el encargo, con una razón para cada uno.
2. El planner recibe `conversation.deck_system`: tokens resumidos (~300 tokens) y arquetipos `{id, label, firma, ejemplar: n° de diapositiva}` (~25 tokens cada uno). En el schema se agrega `design_understanding.archetype_id` (enum del deck) y `variation` (`card_count`, `orientation`, `image_side`). Se sigue el mismo patrón condicional que `style_source` → `accent_plan` en `explorationProvider.ts` l.115–119. En el plan lo nombra: «Usaré el acomodo *Título + 4 tarjetas horizontales* de la diapositiva 3, con la foto a la izquierda para no repetir la 4».
3. El generador recibe como `style_examples[0]` **solo el ejemplar** del arquetipo elegido, como ficha de componente, más el bloque «SISTEMA DE LA PRESENTACIÓN» en vez de la ficha de la vecina. Hoy recibe 3 ejemplos.
4. Al final, en este orden:
   - transferencia de tokens sin IA;
   - `checkTransfer`;
   - medir la firma del resultado y compararla con la de las vecinas. Si coincide, se avisa en la nota de revisión; no hay reintento automático.
5. **UI.** Panel «Sistema de la presentación» en la pantalla de diseño. Muestra:
   - tokens con su muestra de color y tipografía;
   - acentos con su frecuencia;
   - arquetipos con miniatura y conteo («Título + tarjetas · 4 diapositivas»).

   Al principio es de solo lectura. Con la columna, se puede fijar, excluir o editar.

### (e) Multi-marca

- El sistema sale **solo** de las diapositivas de la presentación abierta, que se lee filtrando por `business_id`, como en `PresentationsPage`.
- Los defaults de Xending (skill y legacy) se usan solo cuando el negocio es Xending, nunca para otro negocio. Es la lección de `getSceneKit` → `null`.
- La caché lleva la clave `business_id:presentation_id`.
- Si hay tabla por marca, la RLS va por `business_id` y se valida en el cliente que `system.business_id === activeBusinessId`.

### (f) Costo y escalabilidad

Precios de gpt-5.4-mini: $0.75 por 1 M de tokens de entrada, $0.075 en caché y $4.50 por 1 M de salida, según [OpenAI](https://developers.openai.com/api/docs/models/gpt-5.4-mini) y [economize.cloud](https://www.economize.cloud/resources/open-ai/pricing/gpt-5.4-mini/).

| Pieza | Tokens | Costo |
|---|---|---|
| Detección y aplicación | 0 | $0 |
| Índice en el planner, por turno | +~700 de entrada, +~40 de salida | ≈ $0.0007 |
| Generador | hoy hasta 3×40 k caracteres (≈ 30 k tokens); con la propuesta 1 ejemplar más ~1 k de sistema | estimado −$0.01 a −$0.02 por llamada, **a medir** con el `usage` real |
| Etiquetado con IA (opcional) | ~10 k por revisión del deck | ≈ $0.011, en caché |

Cómo crece con 10x diapositivas (de 30 a 300):
- **Agregación.** Es O(N) con `Map` por rol y por firma, sin bucles anidados sobre diapositivas.
- **Medición en iframe.** Es lo que domina el costo y **no está medido**. Primero hay que medirlo (tiempo por diapositiva con `performance.now()` y logs `🔍 DEBUG-TEMP:`). Si pasa de unos 150 ms por diapositiva:
  - medir de forma incremental, solo lo que cambió de revisión;
  - hacerlo en segundo plano y por lotes;
  - limitar la muestra a 24 diapositivas estratificadas, que siempre incluya las vecinas, la portada y el cierre.
- **Payload.** No crece con N, porque el índice tiene tope de 8 arquetipos y el generador recibe un solo ejemplar.

## 4. Plan por fases (cada una con interruptor y reversible)

Interruptor general: `VITE_DESAING_DECK_SYSTEM=true`, con piezas `_DETECCION`, `_TOKENS`, `_ARQUETIPO` y `_PLANNER`, siguiendo el patrón de `readDesignFromExistingFlags`.

| Fase | Qué | Archivos | Aceptación medible | Validación barata |
|---|---|---|---|---|
| **0 · Detectar y mostrar** (solo cliente) | `deckSystem.ts` puro: `buildDeckSystem(entries)` → tokens, acentos, líneas, tarjetas, fondos y arquetipos con firma. Ampliar `collectStyleSamples` con el tratamiento de imagen y crear el rol `number`. Panel de solo lectura | nuevo `src/lib/presentations/deckSystem.ts`; `styleSpec.ts`; `UnifiedDesignWorkspace.tsx`; tests en `__tests__/deckSystem.test.ts` y `deckSystem.browser.test.ts` | Con 4 diapositivas de fixture de Xending (las 2 actuales de `fixtures/` más 2 nuevas: portada y foto + pasos), el sistema da familia, color y tamaño de título iguales a los medidos, un acento de título con frecuencia ≥0.5 y la estructura correcta en las 4. `buildDeckSystem` con 300 fichas sintéticas tarda **< 50 ms** | `npm test` de los 2 archivos; type-check; lint |
| **1 · Tokens siempre** (sin IA) | Después de generar en un deck (diapositiva nueva o rediseño) se aplica `applyStyleTransfer` con una ficha sintética del sistema (por arquetipo si hay ≥2 ejemplares) y se verifica con `checkTransfer`. Respeta desbloqueos e indicaciones | `styleTransfer.ts` (`syntheticSourceSheet`); `SlideGeneratorPanel.tsx` (`transferStyle` reutilizado); `useDesignConversation.ts` | Una diapositiva nueva en el deck Xending termina con `checkTransfer` = [] para color, familia y tamaño (±2 px) de título, subtítulo, encabezado de tarjeta, texto y número, para el color de las líneas y para el fondo, radio y sombra de las tarjetas | Browser test con fixture; 1 corrida manual |
| **2 · Arquetipo y anti-repetición** (solo cliente) | `buildDeckStyleKit` elige el ejemplar del arquetipo candidato (encaje con el contenido + novedad frente a las vecinas) y no los 3 más cercanos. La instrucción incluye «Acomodo: X (como la n), variación: …». Al final se compara la firma del resultado con las vecinas | `designConversationHtml.ts`; `deckSystem.ts` (`pickArchetype`, `signatureOf`); `UnifiedDesignWorkspace.tsx` | La diapositiva nueva entre la 3 y la 4 usa un arquetipo existente del deck y su firma medida es distinta de las de la 3 y la 4, salvo política de serie. Los tokens de entrada del generador son ≤ los de hoy en el mismo encargo | Unit de `pickArchetype` con vecinas iguales y distintas, y con serie; 1 corrida comparando `usage` |
| **3 · El planner elige por ID** (servidor) | `conversation.deck_system` validado; `archetype_id`/`variation` en el schema solo cuando viene el campo; regla en el prompt; el plan lo nombra | `_shared/desaing/conversationActions.ts` (keys y validación); `explorationProvider.ts` (prompt y schema condicional); `exploration.ts` (assert); `designCanvasHtml.ts` (etiqueta «SISTEMA DE LA PRESENTACIÓN»); tests de los mismos | El plan menciona el arquetipo por su nombre y el generador recibe solo ese ejemplar. Un ID fuera del enum se rechaza y cae en la preselección de la fase 2 | `npm test` de los archivos tocados; `deno check --no-lock` de `desaing-server`. **Requiere desplegar `desaing-server`** |
| **4 · Persistir y editar** (migración) | Columna `presentations.design_system`. El panel permite fijar, excluir o editar. Opcional: tabla por marca | migración nueva; `PresentationsPage.tsx` (leer y escribir con `.eq('business_id', …)`); panel | Un arquetipo fijado se respeta en la siguiente diapositiva nueva. Otro negocio no ve el sistema | Test de RLS; **requiere aprobación** |

**Riesgos:**
- **Clasificación geométrica equivocada.** Mitigación: queda visible en el panel, hay fallback a cercanía y la fase 4 permite corregirla.
- **Aplanar diapositivas que son distintas a propósito** (portada, sección navy). Mitigación: tokens por arquetipo y desbloqueos.
- **Choque con el pedido del usuario.** Mitigación: se mantiene la prioridad actual.
- **Contradicción entre el plan y el ejemplar** (la lección de `GUARD_DIRECTION`). Mitigación: una sola fuente decide el arquetipo y la instrucción se reescribe con él.
- **Tiempo de medición en decks grandes.** Mitigación: medirlo primero y hacerlo incremental.
- **Fase 3.** Depende de un despliegue; las fases 0 a 2 no.

## Decisiones para ti (máximo 3)

1. **¿Aplicar el sistema siempre o solo en diapositivas nuevas?** Recomiendo **siempre**: en las nuevas, en los rediseños y en «estilo de la presentación». Tu indicación explícita y los desbloqueos siguen ganando.
2. **Variedad por defecto.** Recomiendo «**variada**»: no repetir la firma de la vecina, salvo que las vecinas ya formen una serie, que entonces se conserva. La alternativa es preguntar cada vez.
3. **Persistencia.** Recomiendo empezar **sin migración** (fases 0 a 2, que se recalculan) y aprobar después la columna `presentations.design_system`. La tabla por marca quedaría para cuando quieras reutilizar el sistema entre decks.
