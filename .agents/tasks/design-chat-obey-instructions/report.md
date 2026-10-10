# Reporte: el chat de diseño obedece órdenes (implementación de design.md rev. 4)

Rama `codex/ui-crear-editar-v2`, sobre HEAD `b2701e0`. Sin commit, sin push y sin despliegue (los hace el orquestador). El modelo sigue siendo `gpt-5.4-mini`.

## Cambios por archivo

Servidor (`supabase/functions/_shared/**`)
- `desaing/conversationActions.ts`: el prompt anterior queda literal como `LEGACY_CONVERSATION_ACTION_PROMPT`. Se añade `conversationActionPrompt` (PRIORIDAD ÚNICA, CUÁNDO SE EJECUTA, QUÉ OPERACIÓN USAR, BASE/REFERENCIAS/COPY, segmentos `[ESTRUCTURAL]`). También `rewrite`, `supports_structural_edits` y `editable_text_complete` en tipos, asserts y esquema (con presupuesto `structural/compact/openSlideIds`), y `schemaEnumCount` y `conversationEditCorpus`.
- `desaing/explorationProvider.ts`: cambios del `SYSTEM` (§4.2), presupuesto de enums en 3 escalones, línea tipográfica, filtro de `slide_ids` inventados, limpieza de `rewrite`, copy inicial `pending` → `none` sobre el HTML actual y texto no aprobado → `suggested` con «Texto nuevo que pondré…».
- `desaing/designElementEdits.ts`: operaciones `retext`/`duplicate`/`remove`/`reflow`, `group`/`text_count`, índice `Map` del catálogo, `DesignElementEditError` con mensaje, esquema `structural/compact` (`duplicate` es una variante propia, lista para un `asset_id` futuro) y `unapprovedElementTexts`.
- `designCanvasHtml.ts`: P6 con PRIORIDAD (la paleta pedida por el usuario se aplica y el logo autorizado se conserva), TAMAÑO MÍNIMO, «SIN TEXTO NUEVO» con HTML actual, parche «salvo que el encargo lo pida», salida `'rewrite'` y `edit_mode` en el tipo y en el parse.
- `designCanvasGeneration.ts`: `rewriteDesignCanvas` (sin protocolo de parche, restaura `scory-mounted://`, admite los textos existentes y hace un solo reintento que pide bloques vacíos sin marcadores).
- `designCanvasReview.ts`: línea de mínimos de P8.
- `designTypography.ts` (nuevo): `designTypographyMinimum` (1920×1080 → cuerpo 18 px, notas 12 px).

Cliente
- `designConversationConfirmation.ts`: tokens, afirmativos tolerantes, `isDesignInsistence`, `isDesignApproval`, `needsResolvedCopy`, identidad estable del plan, clave `v2:`, `designPlanBlocker` con detalle de lo que cambió, `samePlan`, textos locales y etiqueta del botón.
- `useDesignConversation.ts`: respeta `requested` y ejecuta en el mismo turno solo con el usuario presente (`opts.execute`). Implementa los pasos 4-11 (antirrepetición, plan conservado, bucle de afirmativos, honestidad), el atajo del afirmativo y la respuesta local `stale`/`busy`, `executeArmedPlan`, «Hacer editable» en un clic, `rewrite`, la comprobación de encaje con escalado a `rewrite` y el parche fallido que propone `rewrite`. Además reanuda sola, al remontar, la petición que quedó en vuelo (solo lectura con `recover`).
- `designElementTools.ts`: grupos de tarjetas (firma, rutas de texto, cobertura del texto, reglas `#id`, tope de 24), hojas vacías como `text`, y aplicación en orden fijo (remove → retext → duplicate → reflow → resto) sin tocar `font-size`.
- `designStructuralCheck.ts` (nuevo): render sin IA y comparación de incidencias de texto (`fits`/`overflow`/`unverified`).
- `designConversationVisuals.ts`: una orden estructural nunca es copy; las líneas literales se suman al copy aprobado (orden aditiva M7). El rol visual de una referencia se toma si el usuario la nombra con una señal visual.
- `designConversationDeck.ts`: `editable_text_complete` solo si no se recortó nada.
- `designConversationStore.ts`: `rewrite` y `affirmation_misses`.
- `htmlRequestError.ts` y `useGenerateSlide.ts`: `code` del servicio (`invalid_canvas_patch`).
- `SlideGeneratorPanel.tsx`: `refine({ rewrite })`. Una fuente de diapositiva en `adapt_layout` envía `edit_mode:'rewrite'`, y las revisiones no lo heredan.
- `designReviewRequest.ts`: descarta `edit_mode`.
- `UnifiedDesignWorkspace.tsx`: textos nuevos y etiquetas del botón. El texto pendiente ya no bloquea un `edit_elements`. Se muestran el aviso de opciones cambiadas con su detalle, «Actualizar propuesta» sin forzar un plan y el estado «Recuperando la respuesta…».
- `activeSlideMemory.ts` (nuevo) y `PresentationsPage.tsx`: recuerdan la diapositiva activa de cada proyecto.

Pruebas: se actualizaron las que fijaban el comportamiento anterior (el cliente forzaba `suggested`, el botón pedía un segundo clic, la clave v1 y la etiqueta «Preparar ajuste»). Se añadieron pruebas para todos los casos pedidos: afirmativos tolerantes, afirmativo con plan caducado respondido sin planner, «agrega 3 cuadros más» en el primer turno, ejecución única, «rehazla» con el copy inicial, paleta pedida (P6), «Hacer editable» en un clic, 3→6 en Chromium real, presupuesto de enums con 80 elementos y 500 diapositivas, cliente antiguo sin cambios y la reanudación tras un remontaje.

## Verificación (pasada final)
- `npm test`: 3797 pasan y fallan 12, los mismos 12 de HEAD (piloto/presupuesto en `htmlBackend`, `materialsBackend`, `pilotHttp`, `productionBackend` y `serverGeneration`), más la suite heredada `docs/UI-handoffv2/legacy/demo-v1`, que ya fallaba. No hay fallos nuevos.
- `npm run type-check`: OK.
- `npm run lint`: 13 errores, todos preexistentes (comprobado con `git show HEAD:<archivo> | eslint --stdin`). No hay errores nuevos.
- `deno check --no-lock` de `desaing-server/index.ts` y `generate-design-html/index.ts`: OK.
- No quedan logs `🔍 DEBUG-TEMP:`.

## Decisiones tomadas sin preguntar (criterio del principio rector)
- Un «sí» con el texto pendiente o una pregunta abierta va al planner, tal como dice §5.2.3, porque puede estar respondiendo esa pregunta. Solo se responde en local sin planner cuando el plan caducó o hay otra solicitud en curso. Si el planner contesta dos veces sin acción, el segundo mensaje es local (paso 7).
- Paso 6 ampliado: si el usuario insiste y el planner responde `discuss` en fase de aclaración, el plan anterior se conserva sin armar, para que el paso 7 pueda ofrecerlo.
- Paso 10: un `discuss` sin plan no se reescribe, para no pisar respuestas legítimas sobre resultados anteriores.
- Un parche que falla con `invalid_canvas_patch` deja el plan `rewrite` armado y pregunta una sola vez, sin mostrar además un error.
- Una línea propuesta que solo repite la orden («3 cuadros más») nunca entra al copy, aunque aparezca en el mensaje.

## Bugs reportados durante la tarea
- **Salto a «Diapositiva 1 de 11».** `loadPresentationSlides` ponía `setCurrentSlide(0)` cada vez que se volvía a ejecutar su efecto, y eso pasa con HMR o con un cambio de `activeBusinessId`. Como la clave del popup incluye la diapositiva, se remontaba en la 1 con sus propias sesiones vacías. Ahora se restaura la diapositiva recordada de cada proyecto. La sesión activa ya se recordaba por diapositiva. No encontré efectos nuevos que remonten el popup ni bucles de render.
- **«Hay una solicitud pendiente» tras remontar** (y el «Descarté…» que vio el usuario). La petición en vuelo quedaba `pending` y el usuario tenía que pulsar Recuperar o Descartar. Ahora, si esta pestaña la estaba esperando, se lee su resultado guardado con `recover`, sin volver a despachar, y el plan queda armado pero no se ejecuta.
- **Un «sí» a «¿Conservo exactamente…?»** ahora resuelve la pregunta y ejecuta el mismo plan una vez (prueba incluida). Antes el cliente lo dejaba en `suggested`.

## Pendiente
- Faltan dos pruebas que el diseño menciona y que no estaban en la lista pedida: `edit_mode` en `SlideGeneratorPanel.inspection.test.ts` y `code` en el hook `useGenerateSlide`. El código está hecho y pasa type-check.
- Fuera de alcance según §10: detección `small_text`, agrupar tarjetas con variantes de clase y `asset_id` en `duplicate`.
- El límite de 1000 enums del proveedor no se pudo verificar en real. La prueba registra que con 500 diapositivas hacen falta los escalones 1 y 2, y que las operaciones estructurales se conservan.

## Despliegue
Primero el servidor, que acepta clientes viejos y nuevos:

```powershell
supabase functions deploy desaing-server
```
```powershell
supabase functions deploy generate-design-html
```

Después el frontend, y recargar las pestañas abiertas. No hay migraciones ni secrets nuevos. Al reabrir una sesión con un plan armado con la clave anterior, se verá una vez «Actualizar propuesta».

## Prueba real
En la diapositiva Xending con 3 tarjetas, con Formato HTML y Base «Diapositiva original», en una sesión nueva:
1. «agrega 3 cuadros más» debe generar 6 tarjetas en el primer turno, o como mucho tras un solo «sí», sin llamada de HTML y con el mensaje «Listo: agregué 3 bloques…». Si no caben, debe hacer una sola reescritura.
2. «rehazla con 6 tarjetas» debe regenerar en ese turno y conservar los textos, el logo y la paleta.
3. «sik» o «si» tras un plan debe ejecutar a la primera.
4. Recargar la página con el popup abierto en la diapositiva 3 debe volver a la diapositiva 3 con su sesión.
