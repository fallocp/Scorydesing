# Handoff — Fase C: conectar el plan narrativo al guion

Contexto para continuar en una sesión nueva. Branch `feat/xending-design-studio-final`.
Continúa donde terminó `HANDOFF_FASE_B_CARRUSEL.md`, que ya está cerrado.

---

## 1. El problema que este trabajo resuelve

Los carruseles salían todos iguales. No por el modelo de imagen: por el orden de las
decisiones.

`generate-carousel-script` recibía un copy aprobado y devolvía headlines, briefs y motivo
visual **en una sola llamada**. Decidir la historia y redactarla al mismo tiempo tiene un
efecto medible: el modelo resuelve la redacción, que es lo que se le pide explícitamente, y
la estructura le sale por defecto. Cinco sets seguidos de costos con dos cotizaciones y la
misma secuencia de layouts.

Fases 1 y 2 separaron la decisión de la redacción. Existe un paso nuevo,
`generate-carousel-plan`, que produce un **plan creativo** con storyboard semántico y no
tiene un solo campo donde escribir copy.

**Está desplegado, funciona y no está conectado a nada.** Eso es la Fase C.

---

## 2. Estado del branch

Último commit: `1b3ca4d feat(xending-carousel): give each branch its own visual repertoire`.
Nada pusheado.

Todo el trabajo de Fases 1 y 2 está **sin commitear**, por pedido expreso del usuario:

> "no commitees nada sin mi consentimiento"

**Ofrecer un checkpoint antes de tocar más código, y esperar el sí.**

### Archivos nuevos, sin trackear

| Archivo | Qué es |
| --- | --- |
| `_shared/carousel-plan-types.ts` | Contratos. Sin una sola importación, para que el frontend lo lea igual que Deno |
| `_shared/carouselStoryRegistry.ts` | 20 rutas narrativas, huella semántica, gramática de composición |
| `_shared/buildCarouselCreativePlan.ts` | Prompt del planificador, normalización, `digestPlan` |
| `_shared/validateCarouselCreativePlan.ts` | Validación determinista + diversidad entre historias |
| `_shared/repairCarouselCreativePlan.ts` | Crítico, operaciones tipadas, tope de dos rondas |
| `generate-carousel-plan/index.ts` | La edge function. **Desplegada, ACTIVE v2+** |
| `_shared/__tests__/carouselStoryRegistry.test.ts` | 30 guardas del registro |
| `_shared/__tests__/carouselCreativePlan.test.ts` | 60+ guardas de plan, validación y reparación |
| `scripts/carousel-plan-smoke.test.ts` | Mide el prompt. Corre en `npm test`, no llama al modelo |
| `src/hooks/useCarouselPlan.ts` | Pide planes y los acumula para comparar |
| `src/components/design-studio/CarouselStoryboardPreview.tsx` | Lee un plan en lenguaje humano |

### Archivos modificados por este trabajo

- `_shared/scene-kits/{types,costos-ahorro,velocidad,coberturas}.ts` — ganaron
  `bannedPropTokens`: la versión corta y buscable de `bannedProps`, que sigue siendo prosa
  porque el prompt necesita el por qué.
- `src/types/design-studio.ts` — cuatro banderas en `CarouselPreset`.
- `src/components/design-studio/CarouselPanel.tsx` — el bloque "Plan narrativo · en pruebas".

### Archivos sucios que NO son de este trabajo

`deno.lock`, `MockupGallery.tsx`, `PieceCopyEditor.tsx`, `DesignStudioPage.tsx`,
`masterImagePrompt.ts`. ~197 líneas, ya estaban modificados al empezar. **No mezclarlos en el
commit del plan.**

---

## 3. Lo que hay que construir

El plan hoy solo se muestra. `generate-carousel-script` sigue inventando su propia estructura,
así que si el usuario pica "Generar idea carrusel", los storyboards que acaba de leer se
tiran.

### 3.1 Elegir un plan

El panel genera N historias y las muestra todas. Falta que el usuario pueda elegir una. Solo
las que traen `preflight.selectable === true`: un plan con bloqueantes no es una alternativa.

### 3.2 Persistir el plan

En `copy_bank_items.image_meta.carousel`, junto al resto del set. **No crear tabla nueva:** el
plan pertenece al carrusel, y una segunda fuente de verdad sobre lo mismo se desincroniza el
día que alguien edita un slide. Es la misma decisión que ya rige `CarouselMeta`.

Guardar también el `digest`, que es lo que permite pedir "otra historia" más adelante sin
volver a generar los planes anteriores.

### 3.3 El guion escribe DESDE los beats

`generate-carousel-script` recibe el plan y deja de decidir estructura. El mapeo:

| Del beat | Al slot |
| --- | --- |
| `verbalMessage` | la idea que el headline tiene que decir — **no el headline** |
| `visualEvidence` | `imageIntent` |
| `compositionFamily` | `brief.layout` |
| `primaryObjects` | `brief.primaryObjects` |
| `productVisualProxy` | cómo se ve el producto, cuando hace falta |
| `sceneState` | el estado de la escena en el brief |
| `figureRequirement` | qué documentos pide el motor numérico (Fase D) |

Lo que el guion sigue decidiendo: **las palabras exactas**. Nada más.

### 3.4 `SCRIPT_BEAT_RULES` abstractos

Este es el punto que quedó pendiente del review y **se desbloquea aquí**.

`CAROUSEL_ROLE_BRIEFS` describe contenido, no trabajo:

> `risk`: "Muestra la CONSECUENCIA. Si la línea habla de acumulación, la escena repite:
> varias compras, varios documentos, impacto agregado."

Eso es lo que hizo converger tres historias distintas en el mismo beat. Ya se retiró del
planificador; ahora se retira del guion y se reemplaza por reglas **verbales**:

```ts
const SCRIPT_BEAT_RULES = {
  tension: 'Plantea la tensión con claridad. No resuelve todavía.',
  shift:   'Aporta una idea nueva. No repite el headline anterior.',
  risk:    'Expresa una consecuencia o implicación, en condicional cuando corresponda.',
  solution:'Explica el valor definido por el Creative Plan. No cambia la solución elegida.',
  cta:     'Una sola invitación breve. Sin supporting copy adicional.',
};
```

**No se podía hacer antes de 3.3.** Sin el plan llegando a esa función, el guion se quedaba
sin ninguna fuente de contenido y los carruseles de hoy salían peor.

### 3.5 Autoridad, para no volver a discutirla

```
Preset   → cómo se lee el set y cuántos slides tiene
Ruta     → qué historia se cuenta
Beat     → qué trabajo narrativo se hace
Guionista→ las palabras exactas
Director → cómo se vuelve visible
Critic   → que todo avance y no se repita
```

El rol **no** decide la evidencia visual. Ese fue el bug de origen.

---

## 4. Lo que ya está decidido y no hay que rediscutir

- **El plan no lo escribe el agente entero.** La ruta declara límites —pregunta, tesis, modo
  de profundizar, resolución, vocabulario de evidencia—, el agente llena los beats dentro de
  eso. Una lista fija de cinco escenas por ruta sería el menú rígido con otro nombre: con 20
  rutas, 20 plantillas en vez de una.
- **`deepeningMode` es lo que separa dos historias.** Ninguna rama puede tener dos rutas con
  el mismo modo; hay un test que falla el build si pasa. Se descubrió por las malas: dos rutas
  de velocidad compartían `time_pressure` y la segunda historia se rechazaba sola.
- **La huella es semántica y no incluye `routeId`.** Con el id dentro, dos rutas con nombres
  distintos daban huellas distintas por construcción. Lo que la huella hace es detectar la
  misma estructura; detectar una paráfrasis es trabajo de `validateRouteSetDiversity`.
- **La composición es una gramática de cinco atributos**, no una etiqueta. La familia de cinco
  se **deriva** y sigue viajando aguas abajo porque `generate-design-image` y
  `CarouselSlot.brief.layout` la consumen. Reescribir el camino de imagen es Fase E.
- **Dos rondas de reparación, máximo.** Y hay fallos que ninguna operación cierra
  (`UNREPAIRABLE_CODES`): cuando el problema es la ruta, no se llama al crítico.
- **`blocking` frena, `advisory` solo reporta.** Un incumplimiento objetivo tiene una sola
  respuesta correcta; una preferencia creativa no, y corregirla automáticamente sustituye la
  dirección de arte del set por la del crítico.
- **Mostrar 17→22 como escenario es válido.** "Si el tipo de cambio pasara de 17 a 22" es una
  hipótesis etiquetada y es la única forma que tiene coberturas de explicar su mecanismo. Lo
  prohibido es "el dólar va a llegar a 22". Un guard anterior rechazaba las dos.
- **Nada se regenera automáticamente después del render.** El usuario dispara.

---

## 5. Hallazgos que costaron una corrida cada uno

- **Un brief que nombra un objeto gana sobre la ruta.** `CAROUSEL_ROLE_BRIEFS` y
  `CAROUSEL_ROLE_LAYOUT_HINT` dictaban los beats 3, 4 y 5 de cualquier historia; dos de tres
  storyboards devolvieron la secuencia de layouts exacta que se les mandaba. Hay un test que
  prohíbe sustantivos de escena en `PLANNER_BEAT_JOBS`.
- **Un fallo que no dice en qué campo está cuesta las dos rondas.** El crítico repara el campo
  más probable, la frase sobrevive en otro. Dos de tres historias se perdieron así. Los seis
  códigos que escanean varias superficies ahora nombran el campo.
- **Un campo que el validador revisa y la UI no muestra es indepurable.** `narrativeJob` era
  el único, y ahí vivía la frase prohibida.
- **Validar cada plan contra sí mismo no detecta que dos planes son el mismo.** Dos historias
  con cuatro de cinco beats equivalentes pasaron las dos aprobadas.
- **"Nunca repitas una de cinco etiquetas en cinco slides" es imposible de cumplir.** No dejaba
  holgura, y el crítico gastaba su ronda sin salida.
- **El usuario tenía razón sobre el guard de coberturas.** Rechazaba la comparación de dos
  tasas creyendo que era especulación, y con eso dejaba a la rama sin argumento.

---

## 6. Verificación estándar

```powershell
npm test
node node_modules/typescript/bin/tsc -b
npm run lint
npx vite build
deno check supabase/functions/generate-carousel-plan/index.ts
```

**Línea base a no empeorar:** 84 errores de `tsc`, 0 errores de lint (404 avisos), 1224 tests
en 100 archivos, `vite build` limpio.

Ojo: `npm run build` corre `tsc -b` primero y **ya fallaba antes de este trabajo** —
`templateAssembler.ts` arrastra 12 de los 84. Usar `npx vite build` para verificar el bundle.

### Probar el planificador en vivo

Desde la app: panel de carrusel, bloque "Plan narrativo · en pruebas", picar 2 o 3 veces.
Cada llamada excluye las rutas y los modos ya usados.

No hay modo local: `OPENAI_API_KEY` vive en los secrets de Supabase y no se puede leer de
vuelta. `scripts/carousel-plan-smoke.test.ts` solo mide el prompt.

---

## 7. Qué mirar para saber si tres historias son tres historias

El encabezado del preview trae los tres ejes. Si coinciden entre dos, son la misma aunque se
llamen distinto:

- **Pregunta** que contesta
- **Profundiza** por
- **Resuelve**

Criterio de aprobación acordado con el usuario:

- Los beats 1 no son tres paráfrasis.
- Los beats 3 usan evidencias distintas.
- Los beats 4 resuelven por mecanismos diferentes.
- Los beats 5 son destilaciones de cada ruta, no el mismo hero genérico.
- Ningún par comparte más de dos beats semánticamente equivalentes.
- Todas pasan preflight.
- Todos los objetos son renderizables.

**Última corrida (velocidad, copy "Pagar a China no debería tomar días"): las tres
utilizables**, con `expiring_condition`, `time_pressure` y `blocked_dependency`.

---

## 8. Después de la Fase C

- **Fase D — motor numérico.** `figureRequirement` declara la necesidad; falta el código que
  calcula. Aquí se retira `figurePolicy.scenariosByRole` de los scene kits y
  `figureScenarioFor` de `useCarouselQueue`, que son la asignación universal de cifras por rol.
  **No se puede antes:** es el camino de producción actual y quitarlo deja los sets sin cifras.
- **Fase E — el camino de imagen consume `CompositionSpec`** en vez de la familia de cinco.
- **Regeneración manual por slide** con reporte de lo que no cumplió.

---

## 9. Abierto con el usuario

- Aplicar `20260816_xending_branch_slug_identity.sql`. Escrita, ya corrida por el usuario según
  su mensaje; confirmar antes de asumirlo.
- Coberturas sigue en `coberturas-v1.0`; velocidad y costos están en v3.0.
- `generate-ideas` con `type='copy'` todavía inyecta `prompt_kit` vía
  `buildBranchContextBlock`. Es la misma contaminación en otro agente, fuera del alcance de
  estas fases.
