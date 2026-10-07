# Verificación: regresión del visor GPT (referencia → visión → réplica)

## Causa confirmada
- Tras exponer los códigos del proveedor (paso 1), el usuario reenvió con la referencia nueva y la UI mostró
  "La IA devolvió una respuesta incompleta…" → `exploration_provider_incomplete` (OpenAI devolvió `status != completed`).
- Flujo del usuario: pega el texto literal + diseño actual seleccionado + referencia nueva con el acomodo. La respuesta
  estructurada repite ese texto en `design_understanding.copy.text`, `resolved_instruction`, `references[].instruction`,
  `message` y `next_action.instruction`; con 4096 tokens de salida se cortaba. Fix: `maxOutputTokens: 8192` en
  `desaing-server/index.ts` (la validación del proveedor ya permite ≤ 8192). No se tocó `EXPLORATION_LIMITS.maxOutputTokens`
  (contrato de capacidades fijo en 4096).
- El 503 posterior es "Recuperar solicitud" sobre la entrada `uncertain` (por diseño). Hay que usar "Descartar".

## Comandos ejecutados y resultado
| Comando | Resultado | Baseline |
|---|---|---|
| `npm run type-check` | exit 0 | exit 0 |
| `npm run lint` | 604 problemas, **2 errores** (`useCarouselQueue.sharedGeneration.test.ts:77`, `useGenerateSlide.canvas.test.ts:10`) | 603 / mismos 2 errores |
| `npx eslint` sobre los 5 archivos `src/` tocados | 0 errores | — |
| `npm test` | 7 archivos / **15 tests fallando** (htmlBackend 1, materialsBackend 1, pilotHttp 4, productionBackend 2, serverExploration 3, serverGeneration 4, demo-controller.test.mjs) ; 3205 pasan | mismos 15 |
| `npx vitest run serverClient, useDesignConversation, explorationProvider, conversationActions, designConversationImages` | todos pasan | — |
| `deno check --no-lock supabase/functions/desaing-server/index.ts` | exit 0 | exit 0 |
| `git grep DEBUG-TEMP -- src supabase` | 0 coincidencias | — |

## Tests nuevos (la referencia llega a visión y el análisis llega al prompt)
- `useDesignConversation.test.ts` › "sends a new reference image to the vision planner and carries its analysis into the image generation prompt":
  `planner.plan` recibe la referencia en `context.references`; `buildConversationImageOperation` recibe
  `instruction` = `next_action.instruction` del análisis y la misma referencia.
- `designConversationImages.test.ts` › "puts the uploaded style reference and the vision analysis instruction into the generation operation":
  subida real + builder real → `op.context.instruction` contiene la instrucción y `op.context.references` la referencia (`image_style_reference`, `version_id` = sha256).
- `serverClient.test.ts` › 502 `exploration_provider_timeout` conserva su código; código desconocido → `server_request_rejected`.
- `explorationProvider.test.ts` › con `maxOutputTokens: 8192` el body a OpenAI lleva `max_output_tokens: 8192`.

## Pendiente (no verificable desde aquí)
- Desplegar: `supabase functions deploy desaing-server`.
- Navegador: `image_library` responde 200 (límite 24) y ya no aparece "Maximum update depth exceeded" (guardas de igualdad; el ciclo no se reprodujo localmente).
- Respuestas > 4096 tokens: el estimador conserva la reserva completa (US$0.25) en vez del costo real (comportamiento conservador existente). Si la migración `202609260001` no está aplicada en remoto, eso consume el tope piloto de US$1 más rápido.
