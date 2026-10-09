# Réplica con referencia nueva en Presentaciones: tope de salida del planificador y errores visibles

El commit `b7dce77` no resucita el viejo `analyze-image-reference`: conserva el flujo actual (referencia PNG → `context.references` → `input_image` en `gpt-5.4-mini` → `design_understanding`/`next_action.instruction` → `buildConversationImageOperation`) y ataca el punto donde se rompía, el 502 de `/exploration/plan`. El cambio de fondo sube `maxOutputTokens` de 4096 a 8192 en `desaing-server/index.ts` y expone al cliente los siete códigos `exploration_provider_*` para que la conversación diga por qué falló. De paso baja la consulta de `image_library` de 500 a 24 filas (500 HTTP) y pone guardas de igualdad en cuatro `setState` de efectos de `VisualDesignEditor` (aviso de profundidad de actualización). Nada surte efecto en el servidor hasta que el usuario despliegue `desaing-server`.

Watch for: el diagnóstico "causa confirmada" se apoya en un texto de UI que comparten `exploration_provider_incomplete` y `exploration_provider_invalid_result` (confirmed), así que el arreglo de tokens podría no tocar el fallo real; las respuestas de más de 4096 tokens ahora se contabilizan con la reserva completa de US$0.25 (confirmed); las guardas del editor no apuntan a un bucle identificado (likely). No quedan `🔍 DEBUG-TEMP:` en el diff, y no hay push, dependencias, migraciones ni deploys (HEAD un commit por delante de `origin`, sin cambios en `package.json` ni `supabase/migrations`; los cambios ajenos de `_shared/news/*` quedaron fuera).

**Verdict**: APPROVED

## High-level view

La cadena referencia → visión → prompt ya estaba cableada; los tests nuevos la fijan del lado cliente (la referencia llega a `planner.plan` y la `instruction` del análisis llega a `buildConversationImageOperation`, también con el builder real). Del lado servidor, las tres fallas preexistentes de `serverExploration.test.ts` son de presupuesto (`invalid budget/outputs/reserve`), no del paso bytes → `input_image` (spot-check: 40/43 pasan).

El arreglo del 502 es una línea de configuración dentro del límite que el proveedor ya valida (≤ 8192). Su eficacia depende de que el 502 real sea truncamiento por tokens, y eso no quedó probado de forma inequívoca. Además deja dos efectos laterales en el mismo camino que intenta arreglar: contabilidad de costo inflada y riesgo de timeout a 60 s. El 503 queda explicado como "Recuperar" sobre una entrada `uncertain`, sin cambio de código.

El 500 de `image_library` se resolvió recortando el límite a 24 en lugar de dejar de pedir `image_base64` como decía el plan: conserva las filas que sólo tienen base64, pero la biblioteca queda limitada a las 24 más recientes. Las guardas del editor no demuestran cortar el bucle y la verificación en navegador quedó pendiente.

<details>
<summary>Issues (6)</summary>

1. **Diagnóstico ambiguo del 502** — "La IA devolvió una respuesta incompleta" lo muestran tanto `exploration_provider_incomplete` como `exploration_provider_invalid_result`; confirmar `error_code` con la consulta del paso 5a (o el cuerpo JSON del 502 en DevTools) antes de dar el arreglo por bueno, y si es `invalid_result` revisar los topes de `assertDesignCopy` (4000 caracteres) en lugar del tope de tokens.
2. **Reserva completa en respuestas largas** — `estimateExplorationMicroUsd` devuelve `null` si `output_tokens > EXPLORATION_LIMITS.maxOutputTokens` (4096), así que cada respuesta de 4097–8192 tokens queda en US$0.25 en lugar de ~US$0.04; aplicar `202609260001` en remoto antes o junto con el deploy (la lista "Pendiente" de verification.md sólo menciona el deploy) y alinear el estimador con 8192 en el próximo cambio de contrato.
3. **Capacidad anunciada desfasada** — `/exploration/capabilities` sigue anunciando `max_output_tokens: 4096` mientras el servidor pide 8192; resolverlo en el mismo cambio de contrato del punto 2.
4. **Timeout de 60 s con salidas largas** — duplicar la salida en solicitudes con texto literal largo + referencias high-detail puede convertir `incomplete` en `exploration_provider_timeout`; observarlo en la prueba del paso 5e.
5. **Bucle de `VisualDesignEditor` sin identificar** — las cuatro guardas están en efectos cuyas dependencias no incluyen el estado que escriben, así que ninguno podía sostener un bucle por sí solo; si el aviso persiste en navegador, instrumentar con `🔍 DEBUG-TEMP:` según el paso 4c del plan.
6. **Biblioteca limitada a 24 imágenes** — "Biblioteca (generadas)" ya no permite llegar a imágenes anteriores a las 24 más recientes y sigue bajando ~12 MB de base64 por apertura; avisarlo al usuario junto con la verificación del 200.

</details>

<details>
<summary>Details</summary>

### Tope de 8192 tokens y el diagnóstico que lo justifica

La verificación dice que, tras exponer los códigos, la UI mostró "La IA devolvió una respuesta incompleta…" y de ahí concluye `exploration_provider_incomplete`. En `useDesignConversation.ts` (líneas 78–79) ese texto es idéntico para `exploration_provider_invalid_result` y `exploration_provider_incomplete` (confirmed). Con el flujo del usuario (texto literal pegado + diseño + referencia) ambas causas son plausibles: truncamiento a 4096 tokens produce `status != completed` → `incomplete`, pero un texto literal de más de 4000 caracteres o una `instruction` de referencia de más de 1200 hace fallar `assertDesignCopy`/`assertDesignUnderstanding` → `invalid_result`, y ahí 8192 tokens no cambia nada. La consulta del paso 5a del plan (`select … error_code … from desaing_explorations`) lo resuelve; verification.md no la reporta como hecha (likely).

La contabilidad sí cambia. `estimateExplorationMicroUsd` descarta el uso real cuando `usage.output_tokens > EXPLORATION_LIMITS.maxOutputTokens`, que sigue en 4096 (`serverExploration.ts:43`), y entonces se conserva la reserva completa (confirmed). Las respuestas largas, justo las que este arreglo habilita, quedan registradas a US$0.25 en lugar de ~US$0.04 (8192 × 18/4 µUSD). No tocar `EXPLORATION_LIMITS` fue deliberado: `serverExplorationContract.ts` e `isServerExplorationCapabilities` fijan `max_output_tokens: 4096`, y cambiarlo obliga a desplegar cliente y servidor juntos. El riesgo está en el orden de despliegue: el plan verificó que remoto no tiene `202609260001` y conserva el tope piloto de US$1, así que si se despliega la función sin `supabase db push`, unas cuatro respuestas largas agotan el tope y el usuario vuelve a ver un error (429 `exploration_quota_exceeded`) en el mismo flujo (likely). La lista "Pendiente" de verification.md sólo pide `supabase functions deploy desaing-server`.

El timeout del proveedor ya está en el máximo permitido (60 s). Una respuesta que necesita 5–8 k tokens de salida, más razonamiento y dos imágenes high-detail, se acerca a ese límite; si lo pasa, el 502 cambia de `incomplete` a `exploration_provider_timeout` (likely). Subirlo exige cambiar la validación del proveedor, así que basta con observarlo en la prueba 5e.

### Guardas de igualdad en `VisualDesignEditor`

Las cuatro guardas (`setCopyOptions`, `setSelectedStyles` sin selección, `setImgFilter`, `setSizeDraft`) viven en efectos con dependencias `[selectedId]`, `[selectedStyles.filter, selectedId]`, `[selectedId, overlays]` y `[selectedId, overlays, htmlWithOverrides]`, y ninguno escribe el estado del que depende; `htmlWithOverrides` es `useMemo` y `overlays` sólo cambia en `scanElements` (dentro de `setTimeout`) y en manejadores de arrastre. Ninguno podía sostener por sí solo la cadena de ~50 commits con actualizaciones en efectos que dispara el aviso (likely). verification.md admite que el ciclo no se reprodujo y el paso 4c del plan (instrumentar para que el usuario reproduzca) no se ejecutó, así que el origen del aviso sigue sin localizar.

### `image_library`: límite 24 en vez de quitar `image_base64`

El plan pedía `select('id, image_url, image_type, created_at')` + `.not('image_url','is',null)` manteniendo 500. El coder mantuvo `image_base64` y bajó a `.limit(24)`. Eso conserva las copias de mockups que sólo tienen base64 (que el plan aceptaba perder), a cambio de que "Biblioteca (generadas)" sólo muestre las 24 más recientes sin forma de llegar a las demás (confirmed) y de que cada apertura siga bajando ~24 × base64 (~12 MB según el comentario del propio código). La desviación no está justificada en verification.md y el 200 en navegador quedó pendiente.

</details>

<details>
<summary>File map</summary>

- `supabase/functions/desaing-server/index.ts` — `maxOutputTokens` 4096 → 8192 para `/exploration/plan`.
- `src/lib/desaing/serverClient.ts` — siete `exploration_provider_*` en `PUBLIC_ERRORS`.
- `src/components/VisualDesignEditor.tsx` — `image_library` `.limit(24)`; guardas de igualdad en cuatro `setState` de efectos.
- `src/lib/desaing/__tests__/serverClient.test.ts` — 502 conserva código del proveedor; código desconocido → `server_request_rejected`.
- `src/lib/presentations/__tests__/useDesignConversation.test.ts` — referencia nueva llega al planner y su instrucción a la generación.
- `src/lib/presentations/__tests__/designConversationImages.test.ts` — rol `image_style_reference`; instrucción y referencia en la operación.
- `supabase/functions/_shared/desaing/__tests__/explorationProvider.test.ts` — `max_output_tokens: 8192` en el body.
- `.agents/tasks/gpt-vision-reference-regression/{plan,verification}.md` — plan y evidencia.

Diff completo: `git show b7dce77`.

</details>
