# Plan: regresión del "visor de imagen de GPT" (referencia → análisis → réplica)

## Diagnóstico

### Qué era la función original y qué pasó con ella
- **Original:** `6cdb105` (2026-07-04) "motor reusable de imagenes (ImageConceptStudio)… analisis de referencia".
  `src/hooks/useAnalyzeImageReference.ts` llamaba a la edge function `analyze-image-reference` (gpt-4o vision),
  que convertía la foto de referencia en una "scene" que luego alimentaba el prompt de `generate-design-image`.
- **Se quitó:** `00477d4` (2026-09-20) "refactor: retirar Image Stock descontinuado" borró `ImageConceptStudio.tsx`,
  `useAnalyzeImageReference.ts` y el resto del Image Stock. La edge function `analyze-image-reference` sigue desplegada
  (v19) pero **ya nada en `src/` la llama** (verificado con grep).
- **Reemplazo (lo que hoy es "el visor"):** `ec6ebfa` (2026-09-20) "integrar flujos compartidos de Desaing".
  En Presentaciones, "Crear pieza para el slide" / "Crear presentación completa" abren
  `src/components/presentations/UnifiedDesignWorkspace.tsx` → `src/lib/presentations/useDesignConversation.ts`.
  Las referencias se suben como PNG, viajan como `context.references` a `POST desaing-server/exploration/plan`;
  `supabase/functions/_shared/desaing/serverExploration.ts` baja los bytes del bucket `desaing-assets` y
  `explorationProvider.ts` los manda a `gpt-5.4-mini` (Responses API) como `input_image` con `detail: 'high'`.
  El resultado (`design_understanding` + `next_action.instruction`) alimenta
  `buildConversationImageOperation` (`designConversationImages.ts`), que genera la imagen pasando también las referencias.
- **Decisión:** no resucitar `ImageConceptStudio`/`analyze-image-reference`. El reemplazo está completo en código;
  lo que falla es el despliegue/servidor (abajo). Restaurar el flujo viejo duplicaría el motor.

### Punto exacto donde se rompe la cadena
La cadena está cableada en código (UI → referencias → `input_image` → análisis → instrucción de generación; cubierta por
`serverExploration.test.ts`, `explorationProvider.test.ts`, `conversationActions.test.ts`, `useDesignConversation.test.ts`).
Se rompe en **`/exploration/plan` en el servidor remoto**: la primera llamada devuelve 502 y la recuperación 503,
así que el análisis nunca llega a la generación.

### Error 3: `/exploration/plan` → 502 y luego 503
- **502** = `serverExploration.plan()` línea final: `throw new ServerBoundaryError(errorCode, 502)` después de que el
  proveedor OpenAI falló (la entrada queda `uncertain` en `desaing_explorations`). `errorCode` es uno de
  `exploration_provider_{timeout,rejected,invalid_result,incomplete,unexpected_output,response_too_large,unknown}`.
- **El código real se pierde en el cliente:** `PUBLIC_ERRORS` en `src/lib/desaing/serverClient.ts` no incluye esos
  códigos, así que llegan como `server_request_rejected` y los mensajes en español que ya existen en
  `useDesignConversation.ts` (`describeError`) nunca se muestran.
- **503** = al pulsar "Recuperar solicitud" se reenvía la misma `request_key`; el servidor encuentra la entrada `uncertain`
  y `replay()` lanza `server_exploration_outcome_unknown` (503). Es la consecuencia del 502, no un fallo aparte.
- **El servidor remoto está desfasado (verificado con `supabase migration list`):** local tiene `202609190002`,
  `202609230001`, `202609260001` que **no están aplicadas en remoto**; remoto tiene `202609180007` y `202609180008`
  que no existen en local. Con la SQL vieja (`202609170002`), `desaing_claim_exploration` bloquea la sesión para siempre
  si hay una entrada `uncertain` (409 `exploration_previous_unresolved`), mantiene el tope de 20 intentos y US$1
  (429 `exploration_quota_exceeded`) y el trigger `guard_shared_design_budget`. Así que, aun tras "Descartar",
  la siguiente solicitud de la misma sesión sigue bloqueada.
- **Función desplegada posiblemente vieja (inferido):** `desaing-server` v38 se desplegó 2026-09-28; el commit
  `a170ae8` (cambia el timeout del proveedor de 30 s a 60 s "dos referencias high-detail pasan de 30 s" y quita los
  pines del piloto) es posterior. Si lo desplegado es anterior, la causa más probable del 502 es
  `exploration_provider_timeout` con referencias. No se pudo descargar el código desplegado (requiere Docker) ni leer
  logs (`supabase functions logs` no existe en CLI 2.58.5). **Necesita verificación** con la consulta SQL del paso 5.
- Secrets remotos (solo nombres, verificado): `DESAING_SERVER_ENABLED`, `DESAING_EXPLORATION_ENABLED`,
  `DESAING_PILOT_SUPABASE_ORIGIN`, `OPENAI_API_KEY` existen.

### Error 1: `image_library` → 500
- Llamador: `ImagePickerPanel.loadImages` en `src/components/VisualDesignEditor.tsx` (~línea 683), al abrir
  "Ver biblioteca del negocio": `select('id, image_url, image_base64, image_type, created_at') … .limit(500)`.
- `supabase inspect db table-stats` (verificado): `public.image_library` pesa **401 MB**; `generate-design-image`
  guarda la imagen completa en `image_base64`. Pedir hasta 500 filas con su base64 excede el statement timeout/tamaño de
  PostgREST → 500. El `.limit(500)` + `image_base64` viene de `befb6b5` (antes era `id, image_url` y `limit(20)`).
- No se pudo reproducir la respuesta exacta (login de prueba devolvió 400); el código PG (`57014` u otro) queda
  **por verificar**, pero la causa por tamaño es la única coherente con columnas y RLS correctas.

### Error 2: `Maximum update depth exceeded` en `VisualDesignEditor`
- La línea `VisualDesignEditor.tsx:1824:38` del stack es la del módulo servido por Vite (con JSX expandido); señala la
  declaración del componente (fuente ~1221), no el `setState`. **No se aisló el efecto exacto leyendo el código:
  necesita verificación durante la implementación.**
- Candidatos (efectos que hacen `setState` con un objeto/arreglo nuevo cada vez; ESLint `react-hooks/set-state-in-effect`
  los marca en las líneas 662, 1009, 1042, 1285, 1387, 2019, 2643, 3012, 3843, 3854, 3866):
  - 2018: `if (!selectedId) { setSelectedStyles({}); return; }` con deps `[selectedId, overlays, htmlWithOverrides]`.
  - 2641: `setImgFilter({...})` nuevo objeto cuando no hay filtro.
  - 3010: `setSizeDraft({ w, h })` nuevo objeto con deps `[selectedId, overlays]`.
  - Sitios `setOverlays((prev) => prev.map(...))` en ~3307, ~3358, ~3495: si alguno corre dentro de un efecto que
    depende de `overlays`, es un bucle directo (revisar primero).
  - Efecto `[html]` (~1818): si el padre re-sanitiza el HTML (`prepareDeck` → `sanitizePresentationHtml`) el eco de
    `onApply` no coincide con `lastEmittedRef` y resetea estado; revisar que no se encadene.
- No se relaciona con el 500 de `image_library` (ese error vive en el subcomponente `ImagePickerPanel` y sólo hace
  un `setErrorMessage`).

### Fuera de alcance
- Aviso de React Router v7: no relacionado.
- Sin trabajo de rendimiento (sin paginación nueva, índices ni tests de rendimiento). `useImageLibrary.ts` también hace
  `select('*')` (incluye base64) en `AssetLibraryPage`; no se reportó, no se toca, sólo se anota.

## Implementation Plan

- [ ] 1. Mostrar el error real del proveedor en la conversación de diseño.
      Agregar a `PUBLIC_ERRORS` los códigos `exploration_provider_timeout`, `exploration_provider_rejected`,
      `exploration_provider_invalid_result`, `exploration_provider_incomplete`, `exploration_provider_unexpected_output`,
      `exploration_provider_response_too_large`, `exploration_provider_unknown` (son códigos fijos del servidor, no
      filtran datos). `describeError` ya tiene sus textos en español. Agregar un test: respuesta 502
      `{ error: 'exploration_provider_timeout' }` en `exploration(business).plan` produce
      `DesignServerClientError` con `code: 'exploration_provider_timeout'` y `httpStatus: 502`; y que
      `isExplorationAdmissionRefusal` sigue devolviendo `false` para ese error.
      Files: `f:\ScoryDesign\src\lib\desaing\serverClient.ts`, `f:\ScoryDesign\src\lib\desaing\__tests__\serverClient.test.ts`
      Verify: `npx vitest --run src/lib/desaing/__tests__/serverClient.test.ts` pasa.

- [ ] 2. Test que confirme que la imagen de referencia llega a la visión y su análisis llega al prompt de generación.
      En `useDesignConversation.test.ts`, extender el caso de `send('Crea una imagen.')` con `result(request, 'generate_image', true)`:
      afirmar que `planner.plan.mock.calls[0][0].context.references` contiene la referencia subida, y que
      `buildConversationImageOperation.mock.calls[0][0]` recibe `instruction === next_action.instruction` (texto que viene
      del análisis) y las mismas `references`. En `designConversationImages.test.ts`, afirmar que la operación construida
      incluye esa instrucción en `context.instruction` y las referencias en `context.references`.
      El lado servidor ya está cubierto: `serverExploration.test.ts` (bytes de referencia → `provider.plan(images)`) y
      `explorationProvider.test.ts` (`input_image` con `data:image/png;base64`, `detail: 'high'`); correrlos.
      Files: `f:\ScoryDesign\src\lib\presentations\__tests__\useDesignConversation.test.ts`,
      `f:\ScoryDesign\src\lib\presentations\__tests__\designConversationImages.test.ts`
      Verify: `npx vitest --run src/lib/presentations/__tests__/useDesignConversation.test.ts src/lib/presentations/__tests__/designConversationImages.test.ts supabase/functions/_shared/desaing/__tests__/serverExploration.test.ts supabase/functions/_shared/desaing/__tests__/explorationProvider.test.ts supabase/functions/_shared/desaing/__tests__/conversationActions.test.ts` pasa.

- [ ] 3. Arreglar el 500 de la biblioteca de imágenes.
      En `ImagePickerPanel.loadImages` cambiar la consulta a `select('id, image_url, image_type, created_at')`,
      agregar `.not('image_url', 'is', null)`, conservar `.eq('business_id', scope)`, el orden y `.limit(500)`, y quitar el
      mapeo a `data:image/png;base64,...`. Efecto visible: las filas que sólo tienen base64 (copias de mockups del
      Design Studio, según `20260813_image_library_mockup_link.sql`) dejan de listarse en "Biblioteca (generadas)";
      sus archivos siguen en la pestaña "Storage (archivos)". Hoy la lista no muestra nada por el 500.
      Files: `f:\ScoryDesign\src\components\VisualDesignEditor.tsx`
      Verify: `npm run type-check` y `npx eslint src/components/VisualDesignEditor.tsx` sin errores nuevos.
      Pendiente de verificar por el usuario en el navegador: abrir "Ver biblioteca del negocio" ya no da 500.

- [ ] 4. Localizar y corregir el bucle `Maximum update depth exceeded` (necesita verificación durante la implementación).
      a) Leer los sitios `setOverlays` (~3307, ~3358, ~3495) y el efecto `[html]` (~1818); si alguno corre en un efecto que
      depende del estado que modifica, ese es el bucle: corregir con guard de igualdad o deps correctas.
      b) Aplicar guards de igualdad mínimos (sin refactor) en los efectos candidatos: 2018
      `setSelectedStyles(prev => Object.keys(prev).length ? {} : prev)`; 2641 devolver `prev` si los cuatro valores no
      cambian; 3010 devolver `prev` si `w`/`h` no cambian.
      c) Si no se confirma por lectura, agregar logs temporales `🔍 DEBUG-TEMP:` en esos efectos para que el usuario
      reproduzca (abrir el editor visual del slide) y retirarlos antes de terminar.
      Files: `f:\ScoryDesign\src\components\VisualDesignEditor.tsx`
      Verify: `npm run lint` y `npm run type-check` sin errores nuevos; no quedan `DEBUG-TEMP` (`git diff`).
      Reproducción final en navegador a cargo del usuario.

- [ ] 5. Dejar al usuario los pasos de servidor (no ejecutarlos: sin deploy ni migraciones remotas).
      Documentar en el reporte final, en este orden:
      a) Ver el error real del 502 en el SQL Editor del dashboard:
         `select request_key, status, error_code, created_at from public.desaing_explorations order by created_at desc limit 10;`
      b) Revisar el desfase de migraciones antes de empujar: remoto tiene `202609180007` y `202609180008` que no existen en
         `supabase/migrations` (el implementador debe buscarlas en el historial con
         `git log --all --name-status -- "supabase/migrations/20260918000*"` y anotar qué son). Si `db push` las rechaza,
         el usuario decide cómo reconciliarlas; no correr `migration repair` sin su confirmación.
      c) Aplicar las tres migraciones pendientes (`202609190002`, `202609230001`, `202609260001`): `supabase db push`
      d) Redesplegar las funciones con el código actual (timeout 60 s, sin pines del piloto):
         `supabase functions deploy desaing-server` y `supabase functions deploy desaing-state`
      e) Probar: Presentaciones → "Crear pieza para el slide" → Referencias → subir la imagen → "Crear imagen". Si una
         solicitud vieja queda pendiente, usar "Descartar".
      Files: ninguno (sólo reporte).
      Verify: `deno check supabase/functions/desaing-server/index.ts` pasa (confirma que lo que se va a desplegar compila).

- [ ] 6. Verificación final.
      Verify: `npm run lint`, `npm run type-check`, `npm test` (vitest --run) en verde, o con fallas idénticas a las
      previas al cambio (registrar cuáles); `deno check supabase/functions/desaing-server/index.ts` pasa.
      Commit local con prefijo `fix:`; nunca `git push`.

## Notas
- No tocar los archivos ya modificados sin commit en `supabase/functions/_shared/news/*` ni `.agents/tasks/fx-peso-energy-misclassification/`: son trabajo ajeno.
- No leer ni imprimir valores de `.env*`.
- "Quita lo de rendimiento y escalabilidad" se interpretó como: no hacer trabajo de rendimiento en este arreglo.
