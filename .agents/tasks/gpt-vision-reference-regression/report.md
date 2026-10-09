# Reporte: réplica de diseño con referencia nueva en Presentaciones

## Resumen
El "visor de GPT" viejo ya no existe en el frontend. Se reemplazó por la conversación de diseño de Presentaciones, que sí manda la referencia a visión (`gpt-5.4-mini`). La cadena está bien cableada en código. Se rompía en el servidor: `/exploration/plan` descartaba el turno entero cuando la respuesta del modelo se contradecía (`exploration_provider_invalid_result`, 502), y el 503 venía de pulsar "Recuperar" sobre esa solicitud fallida. Los arreglos están en los commits locales `b7dce77` y `59fa6c0`. Ninguno tiene efecto en producción hasta que despliegues `desaing-server`.

## 1. La función original de visión GPT
- Commit `6cdb105` (2026-07-04), "motor reusable de imagenes (ImageConceptStudio)… analisis de referencia".
- `src/hooks/useAnalyzeImageReference.ts` llamaba a la edge function `analyze-image-reference` (gpt-4o vision). Esa función analizaba la foto de referencia, la convertía en una "scene" (composición, estilo, elementos) y la mandaba al prompt de `generate-design-image` para replicar el diseño.
- La UI vivía en `ImageConceptStudio.tsx`, dentro del Image Stock.

## 2. Qué la rompió y cuándo
- Commit `00477d4` (2026-09-20), "refactor: retirar Image Stock descontinuado". Borró `ImageConceptStudio.tsx`, `useAnalyzeImageReference.ts` y el resto del Image Stock.
- La edge function `analyze-image-reference` sigue desplegada (v19), pero ya nada en `src/` la llama (se verificó con grep).
- Reemplazo: commit `ec6ebfa` (2026-09-20), "integrar flujos compartidos de Desaing". En Presentaciones, "Crear pieza para el slide" y "Crear presentación completa" abren `UnifiedDesignWorkspace.tsx` → `useDesignConversation.ts`.
- Decisión: no se resucitó el flujo viejo. Habría duplicado el motor actual, que ya hace lo mismo.

## 3. Dónde se rompe la cadena hoy
1. Frontend: la referencia se sube como PNG y viaja en `context.references` a `POST desaing-server/exploration/plan`. Funciona (cubierto por tests).
2. Edge function: `serverExploration.ts` baja los bytes del bucket `desaing-assets`. Funciona (cubierto por tests).
3. Llamada de visión: `explorationProvider.ts` manda la imagen a `gpt-5.4-mini` (Responses API) como `input_image` con `detail: 'high'`. **Aquí se rompía.** La respuesta cumplía el JSON schema, pero se contradecía en reglas cruzadas que el schema no expresa: `intent=requested` con preguntas pendientes, `clarify` con una acción de render, copy pendiente que ya traía texto o instrucción vacía. El servidor rechazaba el turno completo con 502. El fallo era intermitente: en la tabla del usuario pasaron 2 de 5 turnos.
4. Prompt de generación: `design_understanding` + `next_action.instruction` alimentan `buildConversationImageOperation`, que genera la imagen pasando también las referencias. Funciona (los tests nuevos lo fijan). Simplemente nunca llegaba el análisis.

## 4. Causa raíz de cada error de consola

### `image_library` → 500
- Lo dispara `ImagePickerPanel.loadImages` en `VisualDesignEditor.tsx` al abrir "Ver biblioteca del negocio".
- La consulta pedía hasta 500 filas con `image_base64`. La tabla pesa 401 MB (verificado con `supabase inspect db table-stats`), porque `generate-design-image` guarda la imagen completa en base64. PostgREST excede el timeout o el tamaño y responde 500.
- Origen: commit `befb6b5`. Antes la consulta pedía `id, image_url` con `limit(20)`.
- Arreglo: el límite bajó a 24. Se conserva `image_base64`, así que siguen apareciendo las copias de mockups que sólo tienen base64.
- Efecto: "Biblioteca (generadas)" sólo muestra las 24 más recientes.

### `Maximum update depth exceeded` en `VisualDesignEditor`
- La línea `1824:38` del stack corresponde al módulo transformado por Vite. Apunta a la declaración del componente, no al `setState` culpable.
- Arreglo: guardas de igualdad en cuatro `setState` dentro de efectos (`setCopyOptions`, `setSelectedStyles` sin selección, `setImgFilter`, `setSizeDraft`). Ahora no crean un objeto nuevo si el valor no cambió.
- El bucle exacto no se identificó. La revisión concluyó que ninguno de esos cuatro efectos podía sostener el bucle por sí solo. Si el aviso sigue, hay que instrumentar con logs `🔍 DEBUG-TEMP:` y reproducirlo en el navegador.
- No tiene relación con el 500 de `image_library`.

### `/exploration/plan` → 502 y luego 503
- **502**: el proveedor falló y el servidor lanzó `ServerBoundaryError(errorCode, 502)`. La tabla `desaing_explorations` mostró `exploration_provider_invalid_result`, con 580–759 tokens de salida. No era el tope de tokens. La causa son las contradicciones descritas en la sección 3.
- El código real del error no se veía. `PUBLIC_ERRORS` en `serverClient.ts` no incluía los códigos `exploration_provider_*`, así que llegaban al cliente como `server_request_rejected`.
- **503**: al pulsar "Recuperar solicitud" se reenvía la misma `request_key`. El servidor encuentra la entrada `uncertain` y responde `server_exploration_outcome_unknown`. Es consecuencia del 502, por diseño. Lo correcto es usar "Descartar".
- Factor agravante: la base remota está desfasada (verificado con `supabase migration list`):
  - Local tiene `202609190002`, `202609230001` y `202609260001`, que no están aplicadas en remoto.
  - Remoto tiene `202609180007` y `202609180008`, que no existen en local.
  - Con la SQL vieja, una entrada `uncertain` bloquea la sesión (409 `exploration_previous_unresolved`) y siguen vigentes los topes del piloto: 20 intentos y US$1 (429 `exploration_quota_exceeded`).

### Aviso de React Router v7
Es sólo un aviso de migración y no tiene que ver con este problema. No se tocó.

## 5. Qué se cambió

### Commit `b7dce77`: "fix: restaurar réplica con referencia nueva en Presentaciones"
- `src/lib/desaing/serverClient.ts`: se agregaron los siete códigos `exploration_provider_*` a `PUBLIC_ERRORS`. Ahora la conversación muestra el motivo real del fallo.
- `src/components/VisualDesignEditor.tsx`: `image_library` con `.limit(24)` y las guardas de igualdad en los cuatro `setState`.
- `supabase/functions/desaing-server/index.ts`: `maxOutputTokens` pasó de 4096 a 8192. Se revirtió en `59fa6c0`.
- Tests: `serverClient.test.ts`, `useDesignConversation.test.ts`, `designConversationImages.test.ts` y `explorationProvider.test.ts`.

### Commit `59fa6c0`: "fix: conversación de diseño sigue instrucciones y retoma la pregunta pendiente"
- `supabase/functions/_shared/desaing/conversationActions.ts`:
  - Prompt de asistente natural: las órdenes explícitas se ejecutan; las dudas menores se asumen y se avisan; se hace una sola pregunta sólo cuando cambia el resultado.
  - Campo opcional validado `conversation.pending_action`.
- `supabase/functions/_shared/desaing/explorationProvider.ts`:
  - `repairConversationOutput` corrige las contradicciones sólo hacia el estado seguro, nunca hacia ejecutar.
  - El copy pegado se trata como literal.
  - Si la respuesta sigue siendo inválida, se registra el log `exploration_result_rejected <código>`.
- `src/lib/presentations/useDesignConversation.ts`: envía la acción en espera como `pending_action`, para retomarla cuando respondes.
- `supabase/functions/desaing-server/index.ts`: `maxOutputTokens` vuelve a 4096. Con esto se resuelven las observaciones 2 y 3 de la revisión (costo inflado y capacidad anunciada desfasada).
- Tests: `conversationActions.test.ts`, `explorationProvider.test.ts` y `useDesignConversation.test.ts`.

"Quitar lo de rendimiento y escalabilidad" se interpretó como no hacer trabajo de rendimiento en este arreglo. No se tocó la regla de steering `rendimiento-y-escalabilidad`.

## 6. Verificado por ejecución vs. inferido

### Verificado por ejecución
- `npm run type-check`: exit 0.
- `npm run lint`: 2 errores, los mismos que antes del cambio (`useCarouselQueue.sharedGeneration.test.ts:77`, `useGenerateSlide.canvas.test.ts:10`).
- `npm test`: 15 tests fallan en 7 archivos, los mismos que antes del cambio. Pasan 3209.
- Tests del flujo (`conversationActions`, `explorationProvider`, `useDesignConversation`, `designConversationStore`, `presentationConversation`): 75/75 pasan.
- `deno check --no-lock supabase/functions/desaing-server/index.ts`: exit 0, así que lo que se va a desplegar compila.
- No quedan `DEBUG-TEMP` (`git grep`).
- Desfase de migraciones (`supabase migration list`), peso de `image_library` (`supabase inspect db table-stats`) y nombres de los secrets remotos: verificados.
- `error_code = exploration_provider_invalid_result` en `desaing_explorations`: lo obtuvo el usuario con la consulta SQL.

### Inferido o no verificado
- Que el 500 de `image_library` sea por tamaño o timeout. No se reprodujo la respuesta exacta.
- Que con límite 24 responda 200. Falta probarlo en el navegador.
- El efecto exacto que causa `Maximum update depth exceeded`. No se aisló, y las guardas podrían no cortarlo.
- Que el arreglo de `repairConversationOutput` elimine los 502 en producción. Sólo se probó con tests.
- Qué contienen las migraciones remotas `202609180007` y `202609180008`. No se revisó.
- No se hizo deploy, ni push, ni se aplicaron migraciones.

## 7. Comandos que tienes que correr

Desplegar la función (obligatorio, porque cliente y servidor comparten el contrato `pending_action`):

```powershell
supabase functions deploy desaing-server
```

Aplicar las migraciones pendientes (quitan el bloqueo por `uncertain` y los topes del piloto):

```powershell
supabase db push
```

Si `db push` rechaza el push porque remoto tiene `202609180007` y `202609180008`, revisa qué son antes de reconciliarlas. No corras `migration repair` sin revisarlas primero.

```powershell
git log --all --name-status -- "supabase/migrations/20260918000*"
```

Si vuelve a fallar, corre esta consulta en el SQL Editor para ver el error real:

```sql
select request_key, status, error_code, created_at from public.desaing_explorations order by created_at desc limit 10;
```

También puedes revisar Supabase → Edge Functions → desaing-server → Logs y buscar `exploration_result_rejected`.

Prueba en el navegador: Presentaciones → "Crear pieza para el slide" → Referencias → sube la imagen → "Crear imagen". Si queda una solicitud vieja pendiente, usa "Descartar", no "Recuperar". Revisa también que "Ver biblioteca del negocio" cargue y que ya no salga el aviso de profundidad de actualización.
