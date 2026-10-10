# Plan de implementación

Mientras se trabaja, correr solo los dos archivos de test tocados:
`src/lib/presentations/__tests__/designConversationVisuals.test.ts` y `src/lib/presentations/__tests__/useDesignConversation.test.ts`.

- [x] 1. Escribir los tests exploratorios del bug
  - **Property 1: Bug Condition** - La generación continúa sin captura y nombra la causa
  - **CRÍTICO**: estos tests DEBEN FALLAR en el código sin corregir; el fallo confirma el bug
  - **NO corregir el test ni el código cuando falle**
  - **NOTA**: el test codifica el comportamiento esperado y validará el fix cuando pase
  - **Enfoque PBT acotado**: el bug es determinista; acotar la propiedad a los casos concretos
  - Condición: `isBugCondition(X)` = `X.design_source.source.kind = 'slide'` AND sin captura reutilizable del mismo HTML AND `captureConversationHtml` lanza un error que no es de sesión/negocio
  - En `useDesignConversation.test.ts`, confirmar un plan `adapt_layout` con fuente `slide`:
    - Timeout (`AbortError` ×2): esperar 2 capturas, `htmlController.create` llamado 1 vez con `sourceSlide` y sin `sourceReference`, mensaje final con «tardó demasiado»
    - Too large («El HTML excede el tamaño permitido.»): esperar 1 captura, `create` llamado, mensaje con «demasiado grande»
    - Fuente = diapositiva actual ya capturada por el planner (`life.capture.html === source.slide.html`): esperar 0 capturas nuevas y `sourceReference.sha256` igual al del planner (Property 2 del diseño, requisito 2.4)
    - PBT con `fast-check`: secuencias de resultados de captura (`ok | timeout | unavailable | too_large | invalid`, longitud ≤ 2) → `create` exactamente 1 vez, capturas ≤ 2, reintento solo si el primer fallo es recuperable
  - En `designConversationVisuals.test.ts`: un render que resuelve a los 15 s se aborta a 12 s (confirma la causa (a))
  - Correr los dos archivos sobre el código sin corregir
  - **RESULTADO ESPERADO**: los tests de `useDesignConversation` FALLAN (no se llama a `create`, mensaje genérico sin causa, sin reintento, segunda captura de la actual); el de 12 s PASA y confirma la causa
  - Documentar los contraejemplos encontrados
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4_

- [x] 2. Fix en `designConversationVisuals.ts`

  - [x] 2.1 Clasificar los fallos de captura y aceptar plazo opcional
    - Añadir `type CaptureFailure = 'unavailable' | 'too_large' | 'timeout' | 'invalid'` y `class DesignCaptureError extends Error` con `readonly reason: CaptureFailure`, siguiendo el patrón de `DesignHtmlRequestError` y conservando el mensaje original
    - En `captureConversationHtml`, envolver render + `preparePresentationReference`:
      - `timeout`: `controller.signal.aborted`, `AbortError`/`TimeoutError` o «La captura tardó demasiado.»
      - `too_large`: «excede el tamaño permitido», «hasta 5 MB», «límite de 8 MB»
      - `invalid`: `invalid_design_capture`, PNG/mediciones inválidas, fallo de `preparePresentationReference`
      - Errores de sesión/marca («La sesión cambió», «Inicia sesión», «Selecciona una marca»): relanzar sin envolver
      - Resto (conexión, 404, 429, 5xx, no JSON): `unavailable`
    - `options?: { timeoutMs?: number }`, por defecto 12000 (los demás llamadores no cambian)
    - `captureFailureText(reason)`: «el renderizador no está disponible» / «su HTML es demasiado grande para capturarlo» / «la captura tardó demasiado» / «la captura no fue válida»
    - Tests unitarios en el mismo archivo de test: `timeoutMs: 40000` no aborta a 12 s y sí a 40 s; clasificación de las 4 familias; errores de sesión sin envolver; `captureFailureText` para las 4 causas; PBT con `fast-check` de que la clasificación es total y estable
    - _Bug_Condition: isBugCondition(X) del diseño (causas (a), (b), (c))_
    - _Expected_Behavior: el fallo expone una causa concreta (`CaptureFailure`)_
    - _Preservation: sin opción el plazo sigue en 12 s; el test existente `capture_aborted` sigue válido; límites del renderer sin cambios_
    - _Requirements: 2.2, 2.3, 3.3_

- [x] 3. Fix en `useDesignConversation.ts`

  - [x] 3.1 Reutilizar captura, reintentar una vez y seguir sin `sourceReference`
    - `htmlCapture`: guardar también `prepared: capture` en `life.capture` (ampliar el tipo `Life.capture`)
    - `designSourceContext`, rama `source.slide`:
      - Reusar `life.sourceCapture` o, si `life.capture?.html === source.slide.html && life.capture.prepared`, esa captura
      - Si no, capturar con `timeoutMs: 40000`; ante `DesignCaptureError` con `timeout`/`unavailable`, `assertCurrent(life)` y un solo reintento
      - Si sigue fallando: `assertCurrent(life)`, continuar sin `sourceReference` y devolver `notice = "Seguí sin la imagen de la fuente: ${captureFailureText(reason)}."`; no cachear el fallo; cualquier otro error se relanza
      - Firma `{ context, notice? }`; en `executeAction`, `sourceContext = result?.context` para que `notice` no llegue al `htmlController`
    - Acciones `generate_image`/`edit_image`: mantener el bloqueo con la causa: `No pude capturar la diapositiva elegida como fuente (${causa}). Reintenta para conservar su apariencia.`
    - `finishHtml(life, proposal, composition?, notice?)`: si hay `notice`, anteponerlo al texto del único mensaje de asistente
    - Test: `generate_image` con fuente slide y fallo → error con la causa, sin despacho
    - _Bug_Condition: isBugCondition(X) del diseño_
    - _Expected_Behavior: Property 1 y Property 2 del diseño (generación con `sourceSlide`, aviso con la causa, reintento solo en recuperables, reutilización de la captura vigente)_
    - _Preservation: Preservation Requirements del diseño (captura exitosa cacheada, fuentes no-slide sin captura, errores de sesión abortan, flujo 07c7242, referencias con rol)_
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.4, 3.5_

  - [x] 3.2 Verificar que los tests exploratorios ahora pasan
    - **Property 1: Expected Behavior** - La generación continúa sin captura y nombra la causa
    - **IMPORTANTE**: volver a correr los MISMOS tests de la tarea 1, sin escribir tests nuevos
    - **RESULTADO ESPERADO**: PASAN (confirma que el bug está corregido)
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 4. Escribir los tests de preservación
  - **Property 2: Preservation** - Comportamiento fuera de la condición del bug
  - Condición: casos donde `isBugCondition(X)` es falso
  - En `useDesignConversation.test.ts`:
    - Captura exitosa: `sourceReference` con el rol según `mode` y guardado en `life.sourceCapture`; una segunda confirmación no vuelve a capturar (los tests existentes ~l.739-830 siguen pasando)
    - Error de sesión («La sesión cambió…») sigue abortando sin `create`
    - Fuente `reference`/`asset` y planes sin fuente: cero llamadas de captura
    - «Estilo visual» presente: llega en `htmlInput.references` con su rol, con o sin captura
    - Flujo confirmar → `create` → `finishHtml`: una sola acción `html` y un solo mensaje de asistente; reset de sesión obliga a capturar de nuevo
  - Correr los dos archivos de test
  - **RESULTADO ESPERADO**: PASAN (sin regresiones)
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 5. Checkpoint final
  - Correr una sola vez `npm test`, `npm run type-check` y `npm run lint`
  - Hay 12 tests fallidos y 13 errores de lint preexistentes conocidos: no investigarlos; solo confirmar que no aparecen fallos nuevos
  - Si surgen dudas, preguntar al usuario
