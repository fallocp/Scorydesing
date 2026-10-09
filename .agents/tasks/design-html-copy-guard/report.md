# Reporte: guard de texto aprobado y «Salir conservando…»

Rama `codex/ui-crear-editar-v2`. Commits: `bfce237`, `f74e860`, `5f1b1b0`, `683a67d`.

## Causa raíz

BUG 1: «El HTML no conservó el texto aprobado» (`supabase/functions/_shared/designCanvasHtml.ts`)
- El guard comparaba el texto aprobado contra el HTML como una sola cadena, en el mismo orden. Rechazaba HTML válido cuando el modelo reacomodaba bloques (tarjetas en columnas, párrafos después del grid, título y descripción juntos), mostraba títulos en mayúsculas, usaba guiones tipográficos o movía un `*`.
- El mensaje no decía qué texto fallaba.
- Fix: `copyMismatch` valida línea por línea y en cualquier orden. Tolera espacios, guiones y «…», mayúsculas de presentación, `* † ‡` movidos, restos sin letras ni dígitos y textos completos del HTML actual. El rechazo nombra el bloque: `falta: «…»`, `sobra: «…»` o `cambió: esperado «…» · recibido «…»`. El prompt `TEXTO LITERAL` ya no exige el mismo orden. Además, `normalizeCopy` quita caracteres de control y se eliminó un bucle que podía no terminar.

BUG 2: «Salir conservando el último borrador guardado» no hacía nada
- El botón llamaba a `onClose`, pero `UnifiedDesignWorkspace` le pasaba una función vacía. Por eso el error y el banner seguían en pantalla.
- Fix: en modo conversación, el botón vuelve a leer el borrador guardado, lo marca como `ready` y descarta propuestas hechas para otra revisión (`leaveHtmlDesignDraft`). También limpia el error del panel. Ahora `onClose` limpia el error local y el de la conversación con el nuevo `clearError()` de `useDesignConversation`. El modo standalone no cambia.

## Archivos modificados
- `supabase/functions/_shared/designCanvasHtml.ts`
- `supabase/functions/_shared/__tests__/designCanvasHtml.test.ts`
- `supabase/functions/_shared/__tests__/designCanvasHtmlCopy.test.ts`
- `src/components/presentations/SlideGeneratorPanel.tsx`
- `src/components/presentations/UnifiedDesignWorkspace.tsx`
- `src/lib/presentations/htmlDesignDraft.ts`
- `src/lib/presentations/useDesignConversation.ts`
- `src/lib/presentations/__tests__/htmlDesignDraft.test.ts`
- `src/lib/presentations/__tests__/useDesignConversation.test.ts`

No se modificó `desaing-server`. Solo `generate-design-html` importa `designCanvasHtml.ts`.

## Verificado por ejecución
Evidencia tomada de `verification.md`. Las suites no se volvieron a correr para este reporte.
- Reproducción previa al fix: `designCanvasHtmlCopy.test.ts` tenía 8 de 13 en rojo, con el mismo mensaje que vio el usuario. `htmlDesignDraft.test.ts` tenía 2 en rojo.
- `npm run type-check`: pasa (exit 0).
- `npm run lint`: 606 problemas y 2 errores. Los 2 errores ya existían y están en archivos que no se tocaron. Los archivos de `src/` modificados tienen 0 errores.
- `npx vitest --run` sobre `designCanvasHtmlCopy.test.ts`, `designCanvasHtml.test.ts` y `src/lib/presentations`: 28 archivos y 315 tests pasan.
- `deno check --no-lock supabase/functions/generate-design-html/index.ts`: pasa (exit 0).
- Suite completa de vitest: 15 tests fallan. Corresponden a los tests de presupuesto y política del piloto en `_shared/desaing/__tests__` y a un demo legacy. Ninguno importa los módulos modificados.
- No quedan logs `🔍 DEBUG-TEMP:`.

## Solo inferido (sin verificar)
- El comportamiento real de la edge function desplegada al repetir «Aplicar al diseño actual» en la diapositiva Xending.
- El clic en el navegador sobre «Salir conservando…». Se espera que desaparezcan el error rojo y el banner amarillo «El documento cambió…», que la vista previa muestre «Documento actual» y que se pueda enviar otra solicitud. No hay tests de DOM.
- Si la solicitud HTML quedó sin respuesta (502/503), la acción sigue como `uncertain`. Se resuelve con la franja de recuperación que ya tiene la conversación. Esto no se cambió a propósito, para no reenviar la misma solicitud.

## Deploy

```powershell
supabase functions deploy generate-design-html
```
