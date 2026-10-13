# Sistema de la presentación: implementación de las fases 0 a 3

Rama `feat/own-local-supabase`, sobre `e900b50`. No hay commit, push, despliegue ni migración. La Fase 4 no se implementó.

## Cambios por archivo

- `src/lib/presentations/deckSystem.ts` (nuevo). Interruptor `readDeckSystemFlags`. Firma por diapositiva (`signatureOf`) y `buildDeckSystem`, que calcula tokens con soporte, acentos con frecuencia, líneas, tarjetas, fondos, foto y arquetipos con su ejemplar. También `pickArchetype`, `deckPickFor`, `archetypeLine`, `formatDeckSystem` y `conversationDeckSystem`, y `measureDeckSystem`, que usa caché y muestra estratificada de hasta 24 diapositivas y deja el log `design-timing: deck-system`.
- `styleSpec.ts`: rol `number` separado de `label`. El número de una tarjeta ya no decide cuál de sus textos es el encabezado. `CardSample.inner` dice si el ícono o el número va arriba o al lado. `collectPhotos` mide radio, `object-fit`, máscara o degradado, sangrado, lado y fracción del lienzo. `measureStyleSamples` acepta la marca para separar el título de marca.
- `styleTransfer.ts`: `syntheticSourceSheet`, `effectiveTokens` y `contrastRatio`. `runStyleTransfer` acepta `sourceSheet`, `scale`, `skip` (lo desbloqueado) y `label`. El mensaje dice contra qué comparó. `number` tiene su propio par de roles.
- `designConversationHtml.ts`: `buildDeckStyleKit(..., { exemplarId })` envía un solo ejemplar. Si ese ejemplar no está disponible, vuelve a elegir las diapositivas más cercanas.
- `useDesignConversation.ts`: manda `deck_system` al planner (pieza `_PLANNER`). `deckTurnFor` arma el turno de tokens, arquetipo, ejemplar y bloque para el generador, y agrega la línea «Acomodo: …» a la instrucción. Si el reporte trae `label` (sistema), el mensaje final suma la nota del candado en vez de reemplazarla.
- `SlideGeneratorPanel.tsx`: `turn.deck`. El ejemplar va en `style_examples` y en la captura, y `deck_system` va al generador. Después de generar se aplican los tokens sin IA (`applyDeckTokens`) y se compara la firma con las vecinas (`deckSignatureNote`). Si hay una diapositiva citada (`turn.transfer`), esa manda.
- `UnifiedDesignWorkspace.tsx`: mide el deck por `business_id:presentation_id` (más el nombre de la marca) y elige el ejemplar para el kit. Pasa `deckSystem` a la conversación y muestra el panel en la pantalla de diseño.
- `DesignScreen.tsx` y `.css`: `DeckSystemPanel`, de solo lectura y plegable. Muestra muestras de tipografía y color, acentos con %, tarjetas, línea, fondos, fotos y acomodos con miniatura y conteo.
- `PresentationDesignContext.tsx`: `service.deckSystem` desde `VITE_DESAING_DECK_SYSTEM`.
- `htmlDesignDraft.ts`: valida `styleTransfer.label`.
- `_shared/desaing/conversationActions.ts`: `DECK_ARCHETYPE_IDS` y las listas de variación. Agrega `conversation.deck_system`, con tipo y validación.
- `_shared/desaing/exploration.ts` y `explorationContracts.ts`: `archetype_id` y `variation` en `design_understanding`, con su assert.
- `_shared/desaing/explorationProvider.ts`: schema condicional (enum con los arquetipos del deck), `DECK_SYSTEM_PROMPT`, y una reparación que descarta un ID desconocido y acota `card_count`. La clave de caché del prompt rota.
- `_shared/designCanvasHtml.ts`: campo `deck_system`, bloque «SISTEMA DE LA PRESENTACIÓN» y etiqueta «EJEMPLAR DEL ACOMODO ELEGIDO» cuando llega un solo ejemplo.
- Tests nuevos: `deckSystem.test.ts`, `deckSystem.browser.test.ts`, el caso «archetype_id/variation» en `explorationProvider.test.ts`, y los fixtures `deck-system-cover.html` y `deck-system-photo-steps.html`.
- QA: `artifacts/deck-system-qa/capture.mjs` y `new-slide-generated.html`.

## Decisiones (resueltas con el reporte)

- **Arquetipo.** Es la estructura (8 IDs). La cantidad de tarjetas, la orientación y el lado de la foto son la variación dentro de él. El ejemplar es el miembro con la firma más común.
- **Portada, cierre y sección.** La posición solo separa estas tres cuando la geometría es «título y poco más» (lección 3 del reporte).
- **Tokens por arquetipo.** Solo se usan donde coinciden 2 o más ejemplares; para lo demás se usan los del deck (`effectiveTokens`). La QA mostró que, con 2 ejemplares, el 40 % dejaba entrar las rarezas de una diapositiva fuera de sistema (título de 96 px, línea navy).
- **Fondos.** La segunda variante necesita 2 o más diapositivas. Una portada, sección o cierre sola conserva su fondo y su tamaño de letra; no se aplana.
- **Contraste.** Un color del sistema solo se descarta si sería casi invisible sobre el fondo (contraste menor a 1.3, por ejemplo navy sobre navy). El turquesa sobre crema se conserva porque es del deck.
- **Cuándo se elige el acomodo.** Solo al crear, al rehacer, con base «presentación» o cuando se pide un cambio de acomodo. Un ajuste simple solo recibe tokens.
- **Una sola fuente decide.** Si el planner da un arquetipo válido, manda él. Si no, decide la preselección. Si el usuario describió su propio acomodo y el planner no nombró arquetipo, no se agrega la línea «Acomodo» y deciden sus palabras.
- **Prioridad.** Diapositiva citada > sistema. Los desbloqueos del turno (`unlock` más `inferStyleUnlocks`) no se pisan, y las indicaciones de color del usuario siguen ganando.
- **Multi-marca.** El sistema sale solo de `deckSlides` de la presentación abierta del negocio activo, con la caché por negocio y presentación. No se usan defaults de Xending en ningún caso, así que nunca se presta un sistema de otro negocio.

## Verificación

- **Tests de archivos tocados:** 13 archivos y 337 tests pasan. Incluyen 300 fichas sintéticas en menos de 50 ms (el mejor de 3 corridas es de unos 13 ms) y el browser test con los 4 fixtures de Xending. Ese test confirma:
  - título Montserrat, 64 px, navy (3/4 y 4/4);
  - acento de título coral itálica en ≥0.5 de las diapositivas;
  - estructuras `cover`, `title_cards`, `title_cards`, `photo_steps`;
  - foto a la izquierda, con máscara y a sangre;
  - números 01–04 en turquesa, separados de la etiqueta coral;
  - transferencia sintética sobre la diapositiva 3 con `failed = []` y el texto intacto.
- **Suite completa (`npm test`):**
  - En la primera corrida solo fallaron los 12 conocidos de piloto/presupuesto y el legacy demo-v1.
  - Volví a correrla una vez para ver los nombres de los fallos. Bajo esa carga fallaron mis dos tests nuevos: el `beforeAll` de Puppeteer pasó de 30 s y la medición de 50 ms salió con una sola muestra.
  - Lo corregí: el `beforeAll` ahora tiene 90 s y la medición toma el mejor de 3. Después corrí solo esos archivos y pasan.
- **Type-check y deno:** `npm run type-check` pasa. `deno check --no-lock` de `desaing-server/index.ts` y de `generate-design-html/index.ts` pasan.
- **Lint:** quedan 13 errores, los ya conocidos. Corregí el que yo introduje (memoización en `UnifiedDesignWorkspace`).
- **Capturas** en `artifacts/deck-system-qa/` (las revisé):
  - `panel.png`: el panel abierto, con tokens, acentos, componentes y acomodos con miniaturas.
  - `new-slide-before.png` y `new-slide-after.png`: diapositiva nueva entre la 2 y la 4. Antes: Arial, cajas grises, todo navy. Después: Montserrat; «de crédito» en coral itálica; línea turquesa; fondo #F5F3F0; tarjetas blancas con radio de 24 px y sombra; 01–04 en turquesa. Se compararon 114 puntos, se corrigieron 18 diferencias y no falló ninguna.
  - `neighbor-2.png`, `neighbor-4.png` y `results.json`.
  - El acomodo elegido fue «Título + tarjetas (como la 2), variación: 4 tarjetas en fila». La firma del resultado no repite a la 2 ni a la 4.
- **Tiempos medidos** con Chromium headless y 4 diapositivas: 436–546 ms en total. La primera tarda unos 320 ms porque carga las fuentes; las demás, 33–46 ms. Está por debajo del umbral de 150 ms por diapositiva, así que se queda la muestra estratificada de hasta 24 y la caché por `id:revision` (tope de 160), sin medición en segundo plano adicional.
- **No verificado:** el flujo real con IA (planner y generador), porque no usé APIs pagadas. Tampoco medí el `usage` real del generador para comprobar el ahorro de tokens.

## Pendientes

- Medir en el deck real el costo del generador con 1 ejemplar frente a 3 (`usage`), y el tiempo de medición de un deck grande con fotos remotas.
- Fase 4 (persistencia, fijar o excluir en el panel): requiere aprobación de migración.
- La clasificación geométrica puede equivocarse en diapositivas `free`. Se ve en el panel y la Fase 4 permitirá corregirla.

## Despliegue

Las fases 0 a 2 son solo cliente. La Fase 3 necesita desplegar:

```powershell
supabase functions deploy desaing-server
supabase functions deploy generate-design-html
```

Antes de desplegar `desaing-server`, deja `VITE_DESAING_DECK_SYSTEM_PLANNER=false`. Un servidor viejo rechaza `conversation.deck_system`. El generador viejo ignora `deck_system`, así que eso es inofensivo.

## Cómo encender

`VITE_DESAING_DECK_SYSTEM=true`. Se puede apagar una pieza con `VITE_DESAING_DECK_SYSTEM_DETECCION`, `_TOKENS`, `_ARQUETIPO` o `_PLANNER` igual a `false`. Sin detección no corre nada; con todo apagado, el comportamiento es el actual. El panel se ve en la pantalla de diseño (`VITE_DESAING_DESIGN_SCREEN=true`).

## Prueba real en «Xending Capital 2 test»

1. Abre la pantalla de diseño de una diapositiva que esté entre dos existentes. Despliega «Sistema de la presentación» en el chat y revisa que título, acentos, tarjetas, número turquesa y acomodos coincidan con el deck. La consola muestra `design-timing: deck-system` con los ms por diapositiva.
2. Pide crearla o rediseñarla, por ejemplo «agrega los 4 pasos para usar la línea». El plan debe nombrar «Usaré el acomodo … de la diapositiva N, con …».
3. Al generar, el mensaje dice «Comparé contra el sistema de la presentación (…) (N puntos): …», sin puntos fallidos.
4. Comprueba en la versión nueva los tokens: fuentes, colores, acento en coral itálica, línea turquesa y tarjetas.
5. Comprueba que el acomodo no repita el de las vecinas. Si lo repite, la nota lo avisa; no hay reintento automático.
