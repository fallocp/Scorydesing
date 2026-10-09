# Validación por líneas del texto aprobado y salida real de «Salir conservando el último borrador guardado» (pasada 3)

Esta pasada revisa la iteración 2 (`683a67d`) sobre los commits `f74e860` y `5f1b1b0`, contra los hallazgos de la pasada anterior. Se resolvió el bloqueante: `useDesignConversation` expone `clearError()` y el `onClose` del `SlideGeneratorPanel` embebido llama a `setLocalError('')` y `work.clearError()`. Con eso, el mensaje rojo del compositor también desaparece tras el clic. En el guard, `normalizeCopy` quita los caracteres de control, ya no existe el `while` que podía ciclar, y lo que sobra en un bloque sólo pasa si cada tramo es un texto completo de `current_html`. El cuarto hallazgo (pendiente `uncertain`) se dejó como está, con una justificación que se sostiene.

Watch for: un texto completo de `current_html` todavía puede quedar pegado dentro de un bloque junto a líneas aprobadas, aunque el prompt pide «en su propio bloque» (confirmed, no bloqueante). El cableado del botón sigue sin prueba automatizada y sin prueba en navegador (confirmed, el repo no tiene infraestructura DOM).

**Verdict**: APPROVED

## High-level view

El guard sigue rechazando palabras inventadas, faltantes o cambiadas, tildes perdidas, dígitos alterados, mayúsculas mezcladas y texto ajeno en medio de una línea. Acepta orden distinto, mayúsculas completas o `text-transform`, bloques unidos o partidos, `*` movido, comillas y guiones tipográficos, y espacios. La suite Xending de `designCanvasHtmlCopy.test.ts` cubre las variantes legítimas y las que deben fallar. El rechazo nombra el bloque con `falta`, `sobra` o `cambió: esperado … · recibido …`. Las exenciones salen sólo de `approved_copy` y de `current_html`, y en esta ruta las referencias no se envían. Ningún texto de referencia puede entrar a la copy aprobada.

La exención por HTML actual ahora trabaja por tramos completos. Lo que queda de cada bloque, cortado en los tramos ya usados por líneas aprobadas, debe coincidir entero con un texto de `current_html` (sin `* † ‡`, puntuación de borde ni diferencias de mayúsculas completas). Así se cierra el hueco de armar texto nuevo con pedazos («Capital 2» se rechaza).

En el panel, el botón vuelve al borrador guardado (`ready`, sin la propuesta de otra revisión) y limpia los tres errores visibles: el del pie del panel, el `localError` del host y el `work.error` de la conversación. El rechazo del guard llega como HTTP 502 con cuerpo. `useGenerateSlide` lo convierte en `DesignHtmlRequestError` definitivo y la conversación cierra la acción, así que en el caso del usuario se puede pedir otra solicitud de inmediato. Sólo los fallos sin respuesta (red o relay) dejan la acción `uncertain` para la tira de recuperación existente.

<details>
<summary>Issues (2)</summary>

1. **Texto viejo pegado dentro de un bloque nuevo (no bloqueante)**: `isKept` acepta, dentro de un bloque que también tiene líneas aprobadas, un tramo igual a un texto completo de `current_html`. Por ejemplo, `<p>Liquidez ágil Tasa 12%</p>` pasa si la diapositiva actual tenía el bloque «Tasa 12%». Si se quiere apegar a «en su propio bloque», se puede exigir que el tramo conservado ocupe el bloque completo.
2. **Botón sin prueba de cableado (no bloqueante)**: `leaveHtmlDesignDraft` y `clearError` tienen pruebas, pero el `onClick` (`leave` + `onClose`) no. Hay que probarlo a mano en el navegador después de recargar Vite: deben desaparecer el error rojo y el aviso amarillo, y se debe poder pedir «Aplicar al diseño actual» otra vez.

</details>

<details><summary>Details</summary>

### Tramos conservados del HTML actual

```ts
const rest = hay.slice(start, start + parts[i].length).split(used).map(core).filter(piece => /[\p{L}\p{N}]/u.test(piece));
if (!rest.every(isKept)) unexplained.push(blocks[i]);
```

El caso Xending depende del orden de consumo: el párrafo 1, que contiene «Xending Capital», se consume primero por ser más largo, y el logo escrito queda como bloque completo exento. La prueba nueva cubre «XENDING CAPITAL» en mayúsculas, el número de página «2», un bloque `&#1;` y los rechazos de «Capital 2» y «Liquidez ágil 2X». Un texto viejo completo puede compartir bloque con una línea aprobada, porque el corte es por tramo y no por bloque (confirmed). Antes de la serie sólo se exentaban bloques completos. El riesgo práctico es bajo, ya que se trata de copy que ya estaba en la diapositiva, no de texto inventado.

### Error del compositor y acción de la conversación

```
refine() 502 (guard) ─► DesignHtmlRequestError(definitive) ─► completeConversationAction + work.error
botón ─► run(leave) ─► panel error '' ; onClose ─► setLocalError('') + work.clearError()
```

Revisé `useGenerateSlide.ts` L63-67: `FunctionsHttpError` da `definitive = true`, así que el rechazo del guard cierra la acción y no deja pendiente. La prueba existente «closes the HTML action when the service answered without HTML» ahora también llama a `clearError()` y espera `error === ''`.

No está probado: el `onClick` del botón en modo conversación y el efecto combinado en pantalla. La verificación lo deja como chequeo manual.

### Alcance y restricciones

Los tres commits tocan sólo `designCanvasHtml.ts` y sus dos pruebas, `htmlDesignDraft.ts` y su prueba, `SlideGeneratorPanel.tsx`, `UnifiedDesignWorkspace.tsx` y `useDesignConversation.ts` con su prueba. `news/**`, `fx-peso-energy-misclassification/` y `gpt-vision-reference-regression/` siguen sin stage. La rama está `ahead 17`, sin push. No cambió `package.json`, no hay cambios de rendimiento ni deploy, no quedan `🔍 DEBUG-TEMP:` en `src/` ni en `supabase/functions/`, y los textos de UI siguen en español. `verification.md` registra la reproducción previa (8 de 13 pruebas fallaban, varias con el mensaje del usuario) y, para la iteración 2, type-check, lint (sólo los 2 errores conocidos), 315 pruebas y `deno check`. No volví a correr pruebas.

</details>

<details>
<summary>Archivos</summary>

- `supabase/functions/_shared/designCanvasHtml.ts`: `copyMismatch` por líneas, `normalizeCopy` con guiones, «…» y caracteres de control; exención por tramos completos; prompt `TEXTO LITERAL` sin «orden».
- `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts`: suite Xending «Aplicar al diseño actual» y aserción del prompt.
- `supabase/functions/_shared/__tests__/designCanvasHtml.test.ts`: orden distinto aceptado, palabra cambiada rechazada, exención sólo de textos completos.
- `src/lib/presentations/htmlDesignDraft.ts` y su prueba: `leaveHtmlDesignDraft`.
- `src/lib/presentations/useDesignConversation.ts` y su prueba: `clearError()`.
- `src/components/presentations/SlideGeneratorPanel.tsx`: `leave()` y `onClick` del botón en modo conversación.
- `src/components/presentations/UnifiedDesignWorkspace.tsx`: `onClose` limpia `localError` y `work.error`.

Diff completo: `git diff bfce237 683a67d`.

</details>
