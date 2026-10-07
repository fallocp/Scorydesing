# Verificación: regresión del visor GPT (referencia → visión → réplica)

## Causa confirmada (corregida)
- La UI muestra el mismo texto ("La IA devolvió una respuesta incompleta…") para `exploration_provider_incomplete` y
  `exploration_provider_invalid_result`. La tabla `desaing_explorations` del usuario mostró `exploration_provider_invalid_result`
  con 580–759 tokens de salida: **no era el tope de tokens**. El cambio a 8192 de `b7dce77` se revirtió a 4096.
- Causa real: la respuesta cumple el JSON schema estricto pero se contradice en reglas cruzadas que el schema no expresa
  (`intent=requested` con `pending_questions`/copy pendiente → `conversation_action_not_ready`; ideas sin `explore_ideas`;
  `clarify` con acción de render; copy pendiente con texto; instrucción vacía). El servidor descartaba el turno entero.
  Intermitente: 2 de 5 turnos pasaron.
- El 503 posterior es "Recuperar solicitud" sobre la entrada `uncertain` (por diseño). Hay que usar "Descartar".

## Fase 1 (este commit)
- `conversationActions.ts`: prompt de asistente natural (órdenes explícitas se ejecutan; dudas menores se asumen y se avisan;
  una sola pregunta cuando cambia el resultado; analizar/proponer no ejecuta; `pending_action` se retoma al responder).
  Campo opcional `conversation.pending_action` validado en `assertConversationTurn`.
- `explorationProvider.ts`: regla de copy pegado = literal; `repairConversationOutput` corrige contradicciones sólo hacia el
  estado seguro (nunca hacia ejecución); log `exploration_result_rejected <código fijo>` si aún es inválida.
- `useDesignConversation.ts`: envía la acción en espera (`next_action` no `discuss` ni `requested`) como `pending_action`.
- `desaing-server/index.ts`: `maxOutputTokens` vuelve a 4096.

## Comandos ejecutados y resultado
| Comando | Resultado | Baseline |
|---|---|---|
| `npm run type-check` | exit 0 | exit 0 |
| `npm run lint` | 604 problemas, **2 errores** (`useCarouselQueue.sharedGeneration.test.ts:77`, `useGenerateSlide.canvas.test.ts:10`) | mismos 2 errores |
| `npm test` | 7 archivos / **15 tests fallando** (htmlBackend 1, materialsBackend 1, pilotHttp 4, productionBackend 2, serverExploration 3, serverGeneration 4, demo-controller.test.mjs); 3209 pasan | mismos 15 |
| `npx vitest run conversationActions, explorationProvider, useDesignConversation, designConversationStore, presentationConversation` | 75/75 pasan | — |
| `deno check --no-lock supabase/functions/desaing-server/index.ts` | exit 0 | exit 0 |
| `git grep DEBUG-TEMP -- src supabase` | 0 coincidencias | — |

## Tests
- `conversationActions.test.ts`: pregunta + `requested` → `suggested` con la pregunta (sin error); `clarify` en `create_html`,
  copy pendiente con texto e ids duplicados se reparan; orden completa sigue `requested` y `pending_action` viaja al prompt;
  `pending_action` inválido se rechaza; log sólo con el código fijo.
- `useDesignConversation.test.ts`: "asks once, then resumes the waiting action when the user answers"; y (commit anterior)
  la referencia nueva llega a `planner.plan` y su instrucción a `buildConversationImageOperation`.
- `designConversationImages.test.ts`, `serverClient.test.ts`: del commit anterior.

## «El HTML no conservó el texto aprobado» al pulsar «Crear el HTML»
- Causa (reproducida en `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts` con HTML realista de la diapositiva de 6 puntos):
  1. Falso rechazo: título y descripción de tarjeta como `<span>` contiguos con `display:block` (sin espacio entre ellos) se unían
     («Liquidez ágilAccede…») y la igualdad exacta fallaba. También `<small>`/`<aside>`/`<figcaption>` no separaban bloques,
     y comillas tipográficas, `&shy;`, espacios de ancho cero o `&nbsp;` contaban como diferencia.
  2. Rechazo correcto: con «Diseño nuevo» el modelo ve la referencia y copiaba texto visible que no está en el texto aprobado
     (la etiqueta «DIAPOSITIVA 2»), escribía el logo como texto («Xending Capital») o reescribía títulos en MAYÚSCULAS.
- Fix mínimo en `designCanvasHtml.ts`:
  - Comparación: mismos caracteres en el mismo orden; sólo puede diferir el espacio en blanco. Comillas tipográficas = rectas;
    se ignoran caracteres invisibles. Más etiquetas de bloque. Letras, mayúsculas, dígitos, guiones y puntuación se comparan tal cual.
  - El error ahora dice qué sobra o qué falta («sobra: «DIAPOSITIVA 2»»).
  - Prompt: no copiar texto de referencias, estilo del deck ni marca; mayúsculas con CSS `text-transform`.
- Sigue rechazado (tests): texto de la referencia, logo escrito, texto faltante, reordenado y mayúsculas tecleadas.
- Comandos: `npx vitest run designCanvasHtmlCopy.test.ts designCanvasHtml.test.ts` → 18/18; `npm run type-check` exit 0;
  `npm test` 15 fallos preexistentes, 3231 pasan; `npm run lint` 2 errores preexistentes; `deno check --no-lock generate-design-html/index.ts` exit 0;
  `git grep DEBUG-TEMP` 0.

## Pendiente (no verificable desde aquí)
- Desplegar: `supabase functions deploy desaing-server` (cliente y servidor comparten el contrato `pending_action`).
- Navegador: `image_library` 200 (límite 24) y sin "Maximum update depth exceeded".
- Si vuelve a fallar: Supabase → Edge Functions → desaing-server → Logs, buscar `exploration_result_rejected`.
