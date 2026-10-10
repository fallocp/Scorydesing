# Diseño del bugfix: captura de la diapositiva fuente

## Overview

Al confirmar un plan con fuente `slide`, `designSourceContext` (`src/lib/presentations/useDesignConversation.ts`, ~l.850-867) llama a `captureConversationHtml` y, si falla, descarta el error y lanza «No pude capturar la diapositiva elegida como fuente…», con lo que aborta la generación. La captura es opcional: el generador HTML ya recibe `sourceSlide` (→ `current_html`/`source_html`). El fix clasifica el error, reintenta una vez si es recuperable, sigue sin `sourceReference` con un aviso que nombra la causa y reutiliza la captura vigente del mismo HTML.

## Glossary

- **Bug_Condition (C)**: confirmación con `design_source.source.kind = 'slide'` cuya captura falla.
- **Property (P)**: la generación HTML se inicia con `sourceSlide` y el mensaje final nombra la causa concreta.
- **Preservation**: todo lo que no es C (captura exitosa, fuentes no-slide, errores de sesión/negocio, flujo de confirmación).
- **captureConversationHtml**: `src/lib/presentations/designConversationVisuals.ts`; renderiza el HTML con `renderHtmlForReview` y lo normaliza con `preparePresentationReference`. Hoy aborta a los 12 s.
- **requestRendererJson**: `src/lib/presentations/rendererTransport.ts`; transporte al renderer, plazo propio de 45 s.
- **life.capture / life.sourceCapture**: cachés por conversación de la captura del diseño actual (planner, `htmlCapture`) y de la fuente.
- **CaptureFailure**: `'unavailable' | 'too_large' | 'timeout' | 'invalid'`.

## Bug Details

### Bug Condition

```
FUNCTION isBugCondition(X)
  INPUT: X = confirmación de plan con design_source
  OUTPUT: boolean
  RETURN X.design_source.source.kind = 'slide'
         AND NOT reusableCapture(X.source.slide.html)        // ni life.sourceCapture ni life.capture del mismo HTML
         AND captureConversationHtml(X.source.slide.html) lanza error NO de sesión/negocio
END FUNCTION
```

### Examples

- «Adaptar distribución · Diapositiva 3: Xending capital (copia)» con íconos data URL + referencia «Estilo visual»: el render tarda > 12 s → `AbortError` → mensaje genérico, sin ajuste. Esperado: reintento; si vuelve a fallar, HTML generado y «Seguí sin la imagen de la fuente: la captura tardó demasiado.»
- HTML fuente > 5 MB: el renderer responde 400 «Usa HTML de hasta 5 MB…» (o 413 `preview_too_large` si el body > 6 MB). Esperado: sin reintento, HTML generado, aviso «su HTML es demasiado grande para capturarlo».
- Renderer ocupado (429 `preview_busy`, `active >= 2`) o caído (conexión/404). Esperado: un reintento y, si falla, aviso «el renderizador no está disponible».
- Fuente = diapositiva actual ya capturada por el planner (`life.capture.html === source.slide.html`). Esperado: se reutiliza, cero llamadas nuevas al renderer.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- Captura exitosa: se usa como `sourceReference` (rol según `mode`) y se guarda en `life.sourceCapture` (3.1).
- Planes sin fuente `slide` (reference, asset o sin fuente): idénticos, sin captura (3.2).
- Errores de sesión/negocio del transporte («La sesión cambió…», «Inicia sesión…», «Selecciona una marca…») y `assertCurrent` siguen abortando (3.3). Límites del renderer (5 MB HTML, 6 MB body, 256-3840 px, 8 MB PNG) sin cambios.
- Flujo de confirmación/ajuste/cancelación (commit 07c7242): una sola acción `html`, un solo mensaje de asistente (3.4).
- Referencias adjuntas siguen en `htmlInput.references` con su rol (3.5).
- `htmlCapture`, `capturePresentationInspection` y `designStructuralCheck` conservan su plazo de 12 s.

**Scope:** solo cambia la rama `source.slide` de `designSourceContext` y el texto final de `finishHtml` cuando hay aviso.

## Hypothesized Root Cause

Confirmado por lectura de código (sin logs del caso real):

1. **(a) Causa principal — timeout propio de 12 s**: `captureConversationHtml` aborta con `AbortController` a 12 s. El renderer (`renderer/scripts/design-preview.js`) lanza un Chromium nuevo en cada petición, espera `networkidle0` (hasta 30 s) y `document.fonts.ready`, con un tope propio de 40 s; el transporte permite 45 s. Un arranque en frío más un HTML con varias imágenes data URL supera 12 s de forma habitual, y el cliente corta un render que el servidor habría terminado. El `AbortError` se reenvía tal cual (`if (signal.aborted) throw problem`).
2. **(b) Secundaria**: el límite de 5 MB/6 MB solo aplica con data URL muy pesadas. Es posible pero no explica el caso típico; hoy además queda oculto.
3. **(c) Secundaria/transitoria**: renderer ocupado (429, máx. 2 renders en paralelo, compitiendo con la inspección del deck) o no disponible. Los errores de sesión no son la causa del aviso genérico, pero también quedan ocultos.
4. **(d) Agravante**: si la fuente es la diapositiva actual, solo se consulta `life.sourceCapture`; la captura del planner (`life.capture`) no se reutiliza porque solo guarda la referencia subida, no el `PreparedPresentationReference`.

El punto de fallo es el `catch {}` de `designSourceContext`, que convierte un apoyo opcional en un bloqueo y descarta la causa.

## Correctness Properties

Property 1: Bug Condition - La generación continúa sin captura y nombra la causa

_For any_ confirmación HTML donde isBugCondition es verdadero, el `designSourceContext` corregido SHALL devolver `designSource` y `sourceSlide` sin `sourceReference`, la generación SHALL llamar una sola vez a `htmlController.create` y el mensaje final SHALL contener la causa concreta del `CaptureFailure`; `captureConversationHtml` SHALL llamarse 2 veces si la causa es `timeout`/`unavailable` y 1 vez si es `too_large`/`invalid`.

**Validates: Requirements 2.1, 2.2, 2.3**

Property 2: Bug Condition - Reutilización de la captura vigente

_For any_ confirmación con fuente `slide` cuyo HTML coincide con `life.sourceCapture.html` o `life.capture.html`, el código corregido SHALL usar esa captura como `sourceReference` sin llamar al renderer.

**Validates: Requirements 2.4**

Property 3: Preservation - Comportamiento fuera de la condición

_For any_ confirmación donde isBugCondition es falso (captura exitosa, fuente no-slide, error de sesión/negocio), el código corregido SHALL producir el mismo contexto de generación, mensajes y errores que el original.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

Sin migraciones ni dependencias nuevas. Sin cambios en el renderer ni en `rendererTransport.ts`.

**File**: `src/lib/presentations/designConversationVisuals.ts`

1. **`DesignCaptureError`** (patrón de `DesignHtmlRequestError`): `class DesignCaptureError extends Error { constructor(message, readonly reason: CaptureFailure) }`. Conserva el mensaje original, así el test existente (`capture_aborted`) sigue válido.
2. **Clasificación en `captureConversationHtml`**: envolver render + normalización:
   - `timeout`: `controller.signal.aborted`, `AbortError`/`TimeoutError`, o «La captura tardó demasiado.»
   - `too_large`: «excede el tamaño permitido», «hasta 5 MB», «límite de 8 MB».
   - `invalid`: `invalid_design_capture`, PNG/mediciones inválidas del renderer, fallo de `preparePresentationReference`.
   - Errores de sesión/marca (`La sesión cambió`, `Inicia sesión`, `Selecciona una marca`): se relanzan sin envolver.
   - Resto (conexión, 404, 429, 5xx, respuesta no JSON): `unavailable`.
3. **Plazo opcional**: `options?: { timeoutMs?: number }`, por defecto 12000 (otros llamadores sin cambios).
4. **`captureFailureText(reason)`**: «el renderizador no está disponible» / «su HTML es demasiado grande para capturarlo» / «la captura tardó demasiado» / «la captura no fue válida».

**File**: `src/lib/presentations/useDesignConversation.ts`

5. **`htmlCapture`**: guardar también `prepared: capture` en `life.capture` (amplía el tipo de `Life.capture`).
6. **`designSourceContext`**, rama `source.slide`:
   - Reusar `life.sourceCapture` o, si `life.capture?.html === source.slide.html && life.capture.prepared`, esa captura.
   - Si no, capturar con `timeoutMs: 40000` (tope del renderer). Ante `DesignCaptureError` con `timeout`/`unavailable`, `assertCurrent` y un solo reintento.
   - Si falla, `assertCurrent(life)` y continuar sin `sourceReference`; devolver `notice = "Seguí sin la imagen de la fuente: ${captureFailureText(reason)}."`. No cachear el fallo. Cualquier otro error se relanza.
   - Firma: `{ context, notice? }`. En `executeAction`, `sourceContext = result?.context`, para que `notice` no se filtre al `htmlController`.
7. **Acciones de imagen** (`generate_image`/`edit_image`): el generador de imagen no recibe el HTML fuente, así que no hay con qué seguir. Se mantiene el bloqueo, pero con la causa: `No pude capturar la diapositiva elegida como fuente (${causa}). Reintenta para conservar su apariencia.` (decisión tomada).
8. **`finishHtml(life, proposal, composition?, notice?)`**: si hay `notice`, anteponerlo al texto del mensaje de asistente (un solo mensaje).

Costo: en el peor caso son 2 × 40 s antes de seguir, solo cuando el renderer está lento o caído. Para `too_large`/`invalid` no se espera de más.

## Testing Strategy

### Validation Approach

Primero reproducir el bug sobre el código sin corregir (mocks de `captureConversationHtml` / `renderHtmlForReview`), después verificar el fix y la preservación. Mientras se trabaja, correr solo los dos archivos de test tocados. Al final, una sola vez: `npm test`, `npm run type-check` y `npm run lint`. Hay 12 tests y 13 errores de lint preexistentes conocidos; no se investigan.

### Exploratory Bug Condition Checking

**Test Plan**: en `useDesignConversation.test.ts`, confirmar un plan `adapt_layout` con fuente `slide` y `captureConversationHtml` rechazando `AbortError`.

**Test Cases**:
1. **Timeout**: hoy no llama a `create` y muestra el mensaje genérico (fallará en código sin corregir).
2. **Too large**: rechazo «El HTML excede el tamaño permitido.»: mismo bloqueo, sin causa (fallará).
3. **Fuente = actual capturada por el planner**: hoy hay una segunda llamada al renderer (fallará).
4. **Timeout real a 12 s**: en `designConversationVisuals.test.ts`, un render que resuelve a los 15 s se aborta (confirma la causa (a)).

**Expected Counterexamples**: `create` no se llama; el mensaje no nombra la causa; `captureConversationHtml` se llama 1 vez sin reintento.

### Fix Checking

```
FOR ALL X WHERE isBugCondition(X) DO
  r := confirmar'(X)
  ASSERT create llamado 1 vez con sourceSlide AND sin sourceReference
  ASSERT mensaje final contiene captureFailureText(reason)
  ASSERT llamadas de captura = (reason IN {timeout, unavailable} ? 2 : 1)
END FOR
```

### Preservation Checking

```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT confirmar(X) = confirmar'(X)
END FOR
```

**Test Cases**:
1. Captura exitosa: `sourceReference` con rol correcto y cacheado. Una segunda confirmación no vuelve a capturar (tests existentes ~l.739-830 deben seguir pasando).
2. Error de sesión («La sesión cambió…») sigue abortando sin `create`.
3. Fuente `reference`/`asset` y planes sin fuente: sin llamadas de captura.
4. «Estilo visual» presente: llega en `references` con su rol, con o sin captura.

### Unit Tests

`src/lib/presentations/__tests__/designConversationVisuals.test.ts`:
- `timeoutMs: 40000` se respeta: no aborta a 12 s y sí a 40 s; sin opción sigue en 12 s (test existente).
- Clasificación: `AbortError` → `timeout`; «El HTML excede el tamaño permitido.» y «Usa HTML de hasta 5 MB…» → `too_large`; conexión/404/«ocupado» → `unavailable`; PNG inválido → `invalid`; «La sesión cambió…» se relanza sin envolver.
- `captureFailureText` para las 4 causas.

`src/lib/presentations/__tests__/useDesignConversation.test.ts`:
- Timeout ×2: 2 capturas, `create` con `sourceSlide` sin `sourceReference`, mensaje con «tardó demasiado», sin `pending`.
- Timeout + éxito: 2 capturas, `sourceReference` presente y cacheado.
- `too_large`: 1 captura, continúa, mensaje con «demasiado grande».
- Sesión cambiada: rechaza, sin `create`.
- Fuente = actual con `life.capture` previo: 0 capturas nuevas de la fuente, `sourceReference.sha256` igual al del planner.
- `generate_image` con fuente slide y fallo: error con la causa, sin despacho.

### Property-Based Tests

Con `fast-check` (ya en devDependencies), en `designConversationVisuals.test.ts`:
- Para mensajes/errores generados de las familias conocidas, la clasificación es total y estable; los errores de sesión nunca se envuelven.
- En `useDesignConversation.test.ts`, para secuencias generadas de resultados de captura (`ok | timeout | unavailable | too_large | invalid`, longitud ≤ 2): `create` se llama exactamente una vez, las capturas son ≤ 2 y solo hay reintento si el primer fallo es recuperable.

### Integration Tests

- El flujo completo confirmar → `create` → `finishHtml` deja un único mensaje de asistente con el aviso y una versión HTML con `design_source`.
- Reset de sesión (`life.capture = life.sourceCapture = undefined`) obliga a capturar de nuevo.
- Verificación manual opcional con `npm run dev:local`: repetir el caso «Diapositiva 3: Xending capital (copia)» y comprobar que se genera el ajuste.
