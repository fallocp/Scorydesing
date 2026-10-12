# Reporte: pantalla completa de diseño y chat natural (Frente 1)

Rama `feat/own-local-supabase` (sin commit; lo hace el orquestador).

## Cambios por archivo

- `src/App.tsx`: ruta `/presentaciones/:projectId/disenar/:slideNumber` → `PresentationsPage`.
- `src/lib/presentations/designScreenRoute.ts` (nuevo): interruptor `VITE_DESAING_DESIGN_SCREEN`, ruta y lectura de la URL (`?sesion=`, `?formato=html|imagen`, `borrador` = deck sin guardar).
- `src/pages/PresentationsPage.tsx`: con el interruptor encendido, «Diseñar con IA» navega a la ruta. La página abre el proyecto y la diapositiva de la URL y monta la pantalla en lugar del popup. La sesión y el formato se escriben en la query. Sin el interruptor, el popup queda igual.
- `src/components/presentations/DesignScreen.tsx` + `.css` (nuevos): layout de tres paneles (barra única, miniaturas perezosas con flechas y arrastre `@N`, lienzo con zoom, comparación antes/después con deslizador, tira de versiones, chat), los pasos y el comportamiento responsive (≤1280 riel, ≤1024 chat desplegable).
- `src/components/presentations/UnifiedDesignWorkspace.tsx`: prop `layout="screen"`. Las piezas (sesiones, formato, referencias, mensajes, composer, vista previa, acciones) son variables compartidas. El popup arma el mismo DOM que antes y la pantalla las acomoda en el layout nuevo, con la tarjeta «Así quedará / Se conserva», el botón «Corregir» bajo la nota de revisión, Deshacer/Ctrl+Z, «Original/v1/v2…» y la soltura de miniaturas en el chat.
- `src/components/presentations/SlideGeneratorPanel.tsx`: `backgroundReview` (devuelve la propuesta sin revisar), `reviewLater()` (revisión sin reparaciones, fuera del candado de ocupado) y `renderPreview`.
- `src/lib/presentations/useDesignConversation.ts`: opción `natural` (pasos con duración y `console.info('design-timing: …')`, respuesta en vivo, respuestas locales, `@N`, resumen del deck y captura sólo cuando hacen falta, ficha medida en paralelo, referencias de estilo en detalle bajo, resultado primero y revisión en segundo plano). También agrega `initialSession` (sesión de la URL) y textos con tono nuevo.
- `src/lib/presentations/designChatNatural.ts` (nuevo): respuestas locales, «¿qué cambiaste?», menciones `@N`, detección de pedido sólo de texto, mensaje «Aquí está…» y nota de revisión.
- `src/lib/presentations/designConversationStore.ts`: `version_reviews` (revisión tardía por versión, validada) y `versionReview()`.
- `src/lib/presentations/designVisualReview.ts`: `maxRepairs` (0 = sólo revisar) y textos con tono nuevo («Revisada: no vi problemas. ¿Algo más?», «Ojo: … ¿La corrijo?»).
- `src/lib/desaing/plannerStream.ts` (nuevo): texto parcial de `message`, `planWithStream` con respaldo a `/plan`.
- `src/lib/desaing/serverClient.ts`: `planStream` (SSE) y `capabilities({ stream })` con respaldo para servidores viejos.
- `supabase/functions/_shared/desaing/sseStream.ts` (nuevo): parser SSE compartido.
- `.../serverHttp.ts`: ruta `/exploration/stream` (SSE con `delta`, `result` y `error` con su status). `capabilities` acepta `supports_stream: 1`.
- `.../serverExploration.ts`: `plan(..., { onText })` con la misma admisión, journal y presupuesto.
- `.../explorationProvider.ts`: `stream: true` con lectura SSE de Responses, `prompt_cache_key` estable por versión de prompt (huella FNV del prompt fijo), log `design-timing: planner` con `cached_tokens`, detalle `low` para `low_detail_reference_ids` y regla de tono en el prompt.
- `.../serverExplorationContract.ts`, `explorationContracts.ts`, `conversationActions.ts`: `supports_stream`, `planStream` y `low_detail_reference_ids` (opcional y validado).
- Tests nuevos: `designScreenRoute`, `designChatNatural`, `plannerStream` (cliente), `explorationStream` (proveedor y HTTP). Tests ampliados: `useDesignConversation` (+4) y `designVisualReview` (+1). Ajusté 3 expectativas de texto por el tono nuevo.

## Decisiones tomadas

1. Usé la ruta tal cual la pidió el brief (en español, junto a `/presentations`). `borrador` identifica el deck sin guardar.
2. La pantalla vive dentro de `PresentationsPage` para reutilizar el deck, el guardado y los aplicadores sin duplicarlos. Tras «Aplicar» la pantalla no se cierra: se remonta en la revisión nueva, igual que al reabrir el popup.
3. Cambiar de diapositiva reemplaza la URL y quita `?sesion=` (cada diapositiva tiene sus sesiones). El formato se conserva.
4. Lo de chat natural (pasos, streaming, respuestas locales, resultado primero) sólo corre en la pantalla. El popup sigue revisando y reparando antes de mostrar. Los textos fijos con tono nuevo sí aplican a ambos, igual que la regla de tono y el `prompt_cache_key` del planner.
5. `supports_stream` sólo se reporta si el cliente lo pide, porque los clientes viejos validan las capacidades con lista cerrada. Si el stream falla por transporte, se repite `/plan` con la misma `request_key`. El journal lo hace idempotente, así que no hay doble costo.
6. `cached_tokens` va al log del servidor, no al journal: el contrato de `usage` es estricto y lo rompería en clientes viejos.
7. Las versiones son inmutables, así que la revisión tardía se guarda en `version_reviews` y la nota se agrega al chat.
8. Si una corrección queda peor, ahora no se descarta (ya se mostró). La nota avisa y la versión anterior queda en la tira.
9. El detalle bajo sólo aplica a adjuntos `image_style_reference` que no son la fuente. Se envía sólo si el servidor reporta streaming, lo que garantiza que es un servidor nuevo.
10. La captura para el planner se omite en pedidos que sólo cambian texto (heurística). El generador sigue capturando cuando lo necesita.
11. «Íconos y logos» quedó en dos botones: «Íconos», que abre el editor con el selector de íconos, y «Logos». Las flechas mueven el foco en las miniaturas y Enter abre la diapositiva, para no remontar en cada tecla. Las miniaturas se desactivan mientras hay un cambio en curso.

## Verificación

- Tests de los archivos tocados: 14 archivos, 459 tests en verde.
- `npm test` (una vez): 3903 ok y 13 fallidos. Son los 12 conocidos (piloto/presupuesto y legacy demo-v1) más `designLogo.test.ts`, que no toqué y pasa solo (7/7). Es intermitente bajo carga.
- `npm run type-check`: ok. `npm run lint`: 13 errores (la línea base). En los archivos tocados: 0 errores.
- `deno check --no-lock` de `desaing-server/index.ts` y `generate-design-html/index.ts`: ok.
- Capturas con datos simulados (sin red ni IA) en `artifacts/design-screen-qa/`: `plan-1440.png`, `result-1440.png`, `compare-1440.png`, `plan-1024.png`, `result-1024.png` y `chat-open-1024.png`, más `results.json` (sin desbordes ni errores de página). Corregí lo que vi: el botón Chat y la X visibles en escritorio, la barra que se desbordaba a 1024 (ahora usa dos filas) y el lienzo que no llenaba el alto.
- No quedan logs `🔍 DEBUG-TEMP:`.

## Pendientes y riesgos

- No probé el SSE a través del gateway real de Supabase. Si lo almacena en búfer, el texto llega al final, pero el resultado no cambia.
- Si el usuario cierra la pestaña a mitad del stream, el runtime puede cortar la función. El plan queda `running` y se recupera con «Recuperar», igual que hoy con una petición normal.
- `edit_elements` (sin IA) no muestra un paso propio. No hay test de navegador para el arrastre de miniaturas ni para Ctrl+Z.
- Sigue pendiente el secret hardcodeado preexistente en `generate-design-html/index.ts` (URL firmada), ya reportado.

## Cómo encender

Build del front con `VITE_DESAING_SERVER_ENABLED=true` y `VITE_DESAING_DESIGN_SCREEN=true`. Con cualquier otro valor se mantiene el popup.

## Despliegue (orden: servidor antes que el front)

```powershell
supabase functions deploy desaing-server
```

Después, rebuild del front con el interruptor. `generate-design-html` no cambió. No hay migraciones.

## Qué probar en real

1. En Presentaciones, «Diseñar con IA» abre la pantalla completa en la diapositiva actual. «← Presentaciones» vuelve.
2. En la diapositiva 3, cambia a la Sesión 2 y recarga: sigue en la 3, en la Sesión 2 y con el mismo formato.
3. Envía un pedido: aparecen «✓ Leí la diapositiva · x s», «Preparando el plan…» y el texto del asistente escribiéndose. Luego, la tarjeta «Así quedará / Se conserva».
4. Ejecuta: la propuesta aparece con «Aquí está: …» antes de la revisión. Después llega «Revisada…» u «Ojo… ¿La corrijo?» con el botón «Corregir», sin reparaciones automáticas.
5. Escribe «usa el estilo de @2» o arrastra la miniatura 2 al chat: el mensaje se envía como «la diapositiva 2 («título»)».
6. «gracias» y «¿qué cambiaste?» responden al instante, sin llamar al planner.
