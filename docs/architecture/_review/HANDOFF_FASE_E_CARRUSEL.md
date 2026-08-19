# Handoff — Fase E: devolverle la autoridad a la ruta

Contexto para continuar en una sesión nueva. Branch `feat/xending-design-studio-final`.
Continúa donde terminó `HANDOFF_FASE_C_CARRUSEL.md`.

---

## 1. Dónde estamos

El plan narrativo ya está conectado de punta a punta. Funciona esto:

- El usuario genera historias, compara y elige una en el panel.
- El plan se persiste en `copy_bank_items.image_meta.carousel.plan`.
- El guion escribe desde los beats y solo elige las palabras.
- Las cifras salen de `beat.figureRequirement`, con los seis escenarios construidos.
- El acento tipográfico está acotado a 1-2 palabras del headline, 3 máximo.

Y sigue fallando **una sola cosa**, que es la que motiva esta fase:

> Con el mismo copy y rutas distintas, los cinco beats siguen resolviéndose con la misma
> gramática: documento abierto → dos documentos → diferencia → documento cerrado → cierre.

No es falta de creatividad del modelo. El prompt le entrega la historia resuelta.

**Decisión del usuario que ordena esta fase:** el camino sin plan se elimina. Elegir historia
pasa a ser obligatorio. Hasta ahora convivían dos sistemas y el viejo ganaba por concreción y
volumen de instrucciones; mantener los dos significaba además hacer cada arreglo dos veces.
Ver E0.

---

## 2. El hallazgo principal, y es un bug introducido en la sesión anterior

`buildSceneRepertoireBlock` en `_shared/buildCarouselCreativePlan.ts` inyecta esto al
planificador:

```
Punto de partida por tiempo narrativo, y solo eso — un punto de partida:
  apertura:  el objeto de la compra y el documento donde vive su costo
  cambio:    DOS ESTADOS DE LO MISMO en el cuadro — dos cotizaciones…
  riesgo:    el efecto hecho visible — el total más largo, la columna sumando…
  solución:  la operación resuelta: un solo documento ordenado…
  cierre:    el cuadro más callado del set…
```

Es una tabla `tiempo narrativo → evidencia visual`. O sea, exactamente la hoja de respuestas
que Fase 2 quitó al retirar `CAROUSEL_ROLE_LAYOUT_HINT` y `CAROUSEL_ROLE_BRIEFS`. Se
reintrodujo al pasarle el repertorio de la rama al planificador: el `SceneKit` tiene un campo
`moments` indexado por tiempo narrativo, y se volcó tal cual.

Contraste con lo que el agente devolvió en la última corrida:

| beat | lo que ordena el bloque | lo que generó |
| --- | --- | --- |
| 1 | compra + documento | orden de compra impresa |
| 2 | dos estados | dos cotizaciones |
| 3 | diferencia visible | el total más largo |
| 4 | documento resuelto | una cotización final |
| 5 | motivo limpio | mobiliario + laptop |

El agente obedeció. Decir "y solo eso, un punto de partida" no cambia nada: una solución
concreta para los cinco beats le quita cualquier razón para inventar otra.

El mismo `moments` viaja al escritor de escena por `sceneKitRegistry.buildSceneRepertoireBlock`.

**Primera tarea de esta fase: quitar esa asignación de las dos rutas.** El rol dice el
trabajo narrativo; la evidencia la aporta la ruta.

---

## 3. Verificado contra el código, antes de discutir

Se auditó una lista de propuestas externas. Esto es lo que el código dice.

### Confirmado

| afirmación | evidencia |
| --- | --- |
| El bloque de tiempo narrativo es prescriptivo | `buildCarouselCreativePlan.ts`, `buildSceneRepertoireBlock` |
| `dataSurfaces` de costos es 6/7 papel | `scene-kits/costos-ahorro.ts` |
| Las 7 rutas de la rama van completas en un prompt | `buildRouteCatalogBlock`; system prompt de 28,751 chars |
| "FOTOGRAFIABLE" se exige sin importar el medio | `buildCarouselCreativePlan.ts:620` |
| `storyShape` se declara y valida, pero no cambia el trabajo de los beats | `PLANNER_BEAT_JOBS` es fijo |
| El lenguaje de color está escrito en términos de HOY/PAGO | `brandColorLanguage.ts` |
| El CTA aprobado no llega al planificador | `useCarouselPlan.ts`, omitido a propósito |

### Corregido — el análisis externo se equivocó

**`angleTag` sí llega.** Está en el user message (`buildCarouselCreativePlan.ts:694`) y en
`ctx.angleTag`, y `resolveCompatibleRoutes` lo usa para filtrar
(`carouselStoryRegistry.ts:1176-1180`). No salió en el dump porque el escenario volcado lo
tiene en `null`.

El problema real es otro y es peor: **las 20 rutas declaran `compatibleAngles: []`**, o sea
"todos los ángulos". El filtro existe y nunca se activa. Falta la data en el registro, no el
input.

**Los few-shot ya están filtrados por rama.** `carouselExamples.ts` manda las líneas
literales del banco aprobado solo a coberturas; las demás ramas reciben la mecánica en
abstracto más un contraejemplo. Ya no hay contaminación que quitar.

**`agent_proposed` no está prohibido por el sistema.** El cliente manda
`allowAgentProposedRoute: false` (`useCarouselPlan.ts`) porque en modo comparación se
quieren rutas del registro. La edge function acepta `true` por default, y el validador ya
tiene las tres guardas de ruta propuesta (`productTruth`, `branchFit`, `premise`). Habilitarlo
es cambiar un flag, no construir un mecanismo.

**Dos campos de cierre ya existen.** El registro tiene `resolutionMechanism` y
`closingDistillation` separados. Lo que falla es su contenido: los cuatro de costos terminan
en una hoja. Es edición de datos, no un campo nuevo.

### Sobre los prompts por rama

Ya lo están, en cuatro capas: copy kit, scene kit, rutas filtradas por `branchSlugs` y
ejemplos por rama. Un set de velocidad no recibe nada de costos. Reparto de rutas:
costos-ahorro 7, coberturas 6, velocidad 7.

Lo que **no** está segmentado, y es el grano que falta: las siete rutas de la rama van juntas
en el mismo prompt. Lo común entre ellas —operación, documento, costo, total, condición,
resultado definido— es donde el modelo converge. Y las prohibiciones repiten los mismos
sustantivos ("facturas apiladas", "tres compras", "documentos alineados") una vez por ruta,
así que la nube semántica del prompt está cargada justo de lo que no queremos ver.

---

## 4. El trabajo, en orden

Priorizado por efecto sobre lo que se ve, no por elegancia.

### E0 — Eliminar el camino sin plan. **Decidido por el usuario.**

Elegir historia pasa a ser obligatorio. Es lo primero porque todo lo demás se hace una vez en
vez de dos: hoy el prompt del guion lleva dos versiones de la sección de composición, dos de
`imageIntent` y dos de motivo, `normalizeBrief` tiene ramas para los dos sistemas y
`withFigures` tiene dos caminos.

Por qué existía: el handoff de Fase C escribió *"no se puede antes: es el camino de producción
actual y quitarlo deja los sets sin cifras"*. Era verdad cuando el plan no existía. Ya existe
y funciona, así que la razón caducó.

Inventario verificado, símbolo por símbolo:

| qué se borra | dónde está definido | quién lo usa |
| --- | --- | --- |
| `CAROUSEL_ROLE_BRIEFS` | `src/types/design-studio.ts:577` | `useCarouselQueue.ts:439` · `src/types/__tests__/carousel-presets.test.ts:25` |
| `CAROUSEL_ROLE_LAYOUT_HINT` | `src/types/design-studio.ts:615` | `useCarouselQueue.ts:442` · mismo test, línea 26 |
| `figureScenarioForRole` | `_shared/sceneKitRegistry.ts:52` | `useCarouselQueue.ts:141,145,575` · `scripts/carousel-prompt-smoke.test.ts:365-378` |
| `figureScenarioFor` (wrapper) | `useCarouselQueue.ts:141` | solo la rama sin plan |
| `scenariosByRole` | `_shared/scene-kits/types.ts:51` | los tres kits, y nada más tras borrar lo de arriba |
| `SceneFigureScenario` | `_shared/scene-kits/types.ts:22` | muere con `scenariosByRole` |
| `buildFigureDocuments` | `src/types/design-studio.ts` | lo llama `buildPlanFigureDocuments`, que **se queda**: ahí hay que decidir si se absorbe o se conserva como helper interno |

Y en la edge function del guion:

- Los campos `brief` y `layoutHint` de `CarouselSlideSpec` salen del contrato.
- Las cuatro ramas `plan ? … : …` de `buildSystemPrompt` se colapsan a la versión con plan:
  `compositionSection`, `imageIntentSection`, `motifSection` y las dos líneas del bloque
  `## SALIDA`.
- El fallback de `narrativeRules` se va: el preset siempre las manda.
- `normalizeBrief` pierde el parámetro `layoutHint` y su cadena de fallbacks; `compositionFamily`
  del beat queda como única fuente.
- `planCoversRoles` deja de ser una advertencia y pasa a ser un `400`: sin plan que cubra el set,
  la función no tiene nada que escribir.

Y en la UI: el botón "Generar guion del carrusel" solo existe con historia elegida. Hoy cambia
de etiqueta; tiene que cambiar de estado a deshabilitado, con el motivo a la vista.

**Ojo con dos cosas.** `buildFigureDocuments` sigue vivo porque `buildPlanFigureDocuments` lo
reusa para tres de los seis escenarios — no borrarlo de paso. Y `moments` en
`OnboardingStep5_Moments.tsx` / `OnboardingStep8_Review.tsx` es otra cosa completamente (los
momentos de mercado del onboarding), no tiene relación con el scene kit.

### E1 — Quitar la asignación de evidencia por tiempo narrativo

Dos lugares consumen `SceneKit.moments`, los dos hay que cortar:

| archivo | líneas | a quién le llega |
| --- | --- | --- |
| `_shared/buildCarouselCreativePlan.ts` | 409-413 | el planificador |
| `_shared/sceneKitRegistry.ts` | 99-103 | el escritor de escena de `generate-design-image` |

El campo `moments` del `SceneKit` deja de viajar a los prompts. Si no queda ningún consumidor,
se borra también de `scene-kits/types.ts:65` y de los tres kits, junto con
`SceneMomentRepertoire`. Hay una aserción que lo lee en
`scripts/carousel-prompt-smoke.test.ts:414` y hay que ajustarla.

Es el cambio más chico y, después de E0, el de mayor efecto. **Regenerar un plan justo después
de esto y antes de tocar nada más**, para medir cuánto de lo que queda se explica solo con
estos dos bloques. Puede que E2 haga menos falta de lo que parece.

### E2 — Familias de evidencia tipadas

Sustituir las listas de prosa por una taxonomía que el código pueda contar:

```ts
type EvidenceFamily =
  | 'physical_product'      | 'unit_to_volume'
  | 'document'              | 'dashboard'
  | 'process'               | 'comparison'
  | 'cost_anatomy'          | 'margin_relationship'
  | 'operational_workload'  | 'spatial_transition'
  | 'decision_state';
```

Cada ruta declara dos o tres. Cada beat declara la suya. Esto habilita lo que hoy no existe:
**un contador de variedad intra-plan**, análogo al `low_composition_variety` que ya tiene
composición. Con familias tipadas, "cuatro de cinco beats usan `document`" es una condición
comprobable; con prosa no lo es (el umbral léxico de 0.7 no la detecta, se midió).

Asignación propuesta para costos:

| ruta | familias |
| --- | --- |
| `cost_anatomy` | `physical_product`, `cost_anatomy`, `process` |
| `second_quote` | `document`, `comparison`, `decision_state` |
| `margin_under_pressure` | `physical_product`, `margin_relationship`, `unit_to_volume` |
| `accumulated_difference` | `unit_to_volume`, `document`, `operational_workload` |
| `factory_price_vs_landed_cost` | `spatial_transition`, `process`, `cost_anatomy` |

### E3 — Ideación de ruta separada del storyboard

Hoy cada intento cuesta un storyboard completo de 9,000 tokens, y el prompt lleva las siete
rutas. Partir en dos llamadas:

```
llamada 1  →  3 rutas candidatas, en versión compacta
              { id, question, thesis, storyShape, evidenceFamilies,
                resolutionMechanism, closingMechanism, figurePolicy }
llamada 2  →  storyboard, con UNA sola ruta en el prompt
```

Dos beneficios: la llamada 2 no ve el común denominador de las otras seis, y comparar
historias se vuelve barato.

### E4 — `compatibleAngles` con contenido

Las 20 rutas lo tienen vacío. Llenarlo hace que el ángulo del copy aprobado filtre de verdad:

```
segunda_cotizacion   → second_quote
impacto_acumulado    → accumulated_difference
margen_importacion   → margin_under_pressure
simplificacion       → operational_simplification
```

Requiere inventariar los `angle_tag` reales de los copy kits primero.

### E5 — "Representable en el medio" en vez de "fotografiable"

`buildCarouselCreativePlan.ts:620` exige una escena fotografiable siempre. Para
`infografia` eso descarta vista explotada, corte transversal, progresión de escala, capas y
flujo convergente — y empuja al agente a lo que una cámara encontraría en una oficina, que es
papel, pluma, laptop y carpeta. Condicionar la regla a `ctx.medium`.

### E6 — Roles de color generalizados

El mapeo actual es `turquesa = presente/HOY`, `coral = futuro/PAGO`. En una historia de dos
cotizaciones las dos existen hoy; en una anatomía de costos no hay HOY ni PAGO. Generalizar a
`reference | alternative | risk | control | action | neutral`, y dejar HOY/PAGO como una
aplicación de esos roles.

### E7 — `storyShape` funcional

Hoy la forma narrativa se declara y se valida contra la ruta, pero los cinco trabajos de beat
son los mismos siempre. Que la ruta pueda redefinir la función operativa de sus beats dentro
del marco del preset:

```
anatomy      objeto completo → separar capa → revelar el resto → reintegrar → acción
comparison   misma operación → dos alternativas → diferencia decisiva → elegir → actuar
scale        una unidad → pallet → lote → impacto de escala → cotizar volumen
```

El preset sigue fijando cinco posiciones, lectura encadenada y cierre en CTA.

### E8 — Una ruta que le falta a costos

Para `"El mobiliario tiene precio. El dólar también"`, `second_quote` es válida pero no es la
más directa. Falta algo como `fx_cost_component`:

- **Pregunta:** ¿por qué la moneda forma parte del costo de una compra?
- **Tesis:** el producto tiene precio en origen, y su conversión define cuánto representa en pesos.
- **Profundiza:** una unidad, un lote y un pedido muestran cómo la conversión se traslada al costo.
- **Resuelve:** la compra se cotiza con producto y conversión en la misma lectura.
- **Familias:** `physical_product`, `unit_to_volume`, `margin_relationship`.
- **Sin:** dos proveedores, tres fechas, acumulación obligatoria.

### E9 — Reducir el volumen del prompt

Consecuencia de E2 y E3, no un trabajo aparte. Las prohibiciones se validan en código
(`validateCarouselCreativePlan` ya lo hace con `forbiddenEvidenceDevices`) y dejan de
repetirse veinte sinónimos en el prompt.

---

---

## 4bis. Qué queda de cada sistema después de E0

| bloque | decisión |
| --- | --- |
| Briefs y layouts por rol | **Borrar** |
| Cifras por rol vía scene kit | **Borrar** |
| `moments` → evidencia por tiempo narrativo | **Borrar** (E1) |
| Ramas duplicadas del prompt del guion | **Colapsar** a la versión con plan |
| Repertorio documental global | **Sustituir** por familias de evidencia (E2) |
| Las 7 rutas completas en un prompt | **Filtrar antes** (E3) |
| Listas repetidas de prohibiciones | **Mover a código** (E9) |
| "Ruta propia no permitida" | **Cambiar el flag** del cliente |
| "Fotografiable" universal | **Condicionar** al medio (E5) |
| Color presente/futuro universal | **Generalizar** roles (E6) |
| Ruta sin `compatibleAngles` | **Llenar** el registro (E4) |

## 5. Lo que NO hay que tocar

Funciona y costó llegar:

`PLANNER_BEAT_JOBS` · la separación planificador/guionista · `viewerTakeaway` ·
`newInformation` · `carryFromPrevious` / `setupForNext` / `mustNotRevealYet` ·
`textImageRelation` · los campos separados de objetos, estado y composición · la composición
por atributos · el motivo como paréntesis · preflight y reparación con tope de dos rondas ·
el medio fijo por set · **toda la aritmética en código** · `figureRequirement` y sus seis
constructores · `capFigureBeats` · `normalizeHighlights`.

---

## 6. Criterio de la siguiente prueba

Con el mismo copy de mobiliario, el sistema debería poder proponer tres historias como:

```
A — La moneda también es parte del costo
    mueble → precio de origen → moneda → pedido → costo completo

B — La segunda cotización
    pedido → dos condiciones → diferencia → elección → acción

C — Del mueble al proyecto completo
    una unidad → conjunto → embarque → costo de volumen → cotización
```

Si las tres vuelven a ser `documento abierto → dos documentos → diferencia → documento
cerrado → CTA`, el planificador sigue recibiendo demasiada respuesta desde el prompt.

---

## 7. Herramientas para trabajar esto

```powershell
$env:CAROUSEL_DUMP='1'; npm test -- scripts/dump-carousel-prompts.test.ts
```

Escribe a `docs/architecture/carousel-prompt-dumps/_current/`. Vuelca los prompts reales
—no un resumen— corriendo las mismas funciones de producción. `TODO-EL-STACK.md` lleva todo
junto con índice; los sueltos sirven para comparar un bloque entre dos versiones. El
escenario se cambia en la constante `SCENARIO` del script.

El mapa del pipeline, con cada punto de inyección y su fuente, está en
`docs/architecture/CAROUSEL_PROMPT_PIPELINE.md`.

---

## 8. Verificación y línea base

```powershell
npm test                                   # 1289 en 104 archivos
node node_modules/typescript/bin/tsc -b    # 84 errores, es la línea base
npm run lint                               # 0 errores, 404 avisos
npx vite build                             # limpio
deno check supabase/functions/generate-carousel-plan/index.ts
deno check supabase/functions/generate-carousel-script/index.ts
```

`npm run build` corre `tsc -b` primero y **ya fallaba antes de todo este trabajo**:
`templateAssembler.ts` arrastra 12 de los 84. Usar `npx vite build` para el bundle.

**Pendiente de desplegar** (cambios hechos y no subidos):

```powershell
supabase functions deploy generate-carousel-plan
supabase functions deploy generate-carousel-script
supabase functions deploy generate-design-image
```

---

## 9. Sobre las pruebas

Acuerdo explícito con el usuario: **preguntar antes de escribir pruebas, y cuántas.** En la
sesión anterior se escribieron 63 y encontraron dos cosas; el ratio fue malo y el usuario lo
señaló con razón.

Dónde sí valen: aritmética que se hornea en una imagen que nadie puede editar después, y
guardas contra fallos que ya se pagaron una vez. Dónde no: "aguanta entradas corruptas",
"cubre todos los roles del catálogo", y cualquier prueba que repita una constante que está
tres líneas arriba. Quedan ~25 de esas por borrar en
`_shared/__tests__/carouselScriptBeats.test.ts`, `_shared/__tests__/carouselHighlights.test.ts`
y `src/types/__tests__/carousel-plan-figures.test.ts`.

---

## 10. Nada commiteado

Todo el trabajo de Fases 1, 2, C y D-parcial sigue sin commitear, por pedido del usuario.
Hay además archivos sucios que **no** son de este trabajo y no deben mezclarse:
`deno.lock`, `MockupGallery.tsx`, `PieceCopyEditor.tsx`, `DesignStudioPage.tsx`,
`masterImagePrompt.ts`.

Y en el stash hay un `WIP refactor undo/redo + fix doble-cuadro` que no tiene relación con
esto y que el usuario pidió revertir en su momento. No aplicarlo.
