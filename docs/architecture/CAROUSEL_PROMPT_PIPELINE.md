# El stack de prompts del carrusel: qué se inyecta, de dónde sale y qué sigue

Mapa del camino completo, de un copy aprobado a cinco imágenes. Cada bloque de prompt con
su archivo, su función y su fuente de datos.

**Para ver los prompts reales, no este resumen:**

```powershell
$env:CAROUSEL_DUMP='1'; npm test -- scripts/dump-carousel-prompts.test.ts
```

Escribe a `docs/architecture/carousel-prompt-dumps/_current/`. El prompt del planificador
sale completo (28,751 caracteres en el escenario de costos). El del guionista y el de imagen
salen por piezas, porque sus ensambladores viven dentro de las edge functions y esas
importan `deno.land`, que vitest no puede resolver.

---

## El camino, de arriba a abajo

```
copy aprobado en el banco
        │
        ├─ 1. generate-carousel-plan      → QUÉ historia            (opcional)
        │
        ├─ 2. generate-carousel-script    → QUÉ dice cada slide
        │
        ├─ 3. generate-design-image        → CÓMO se ve cada slide
        │      modo carousel_prompts
        │
        └─ 4. generate-design-image        → la imagen
               modo render, una por slide
```

Los pasos 2, 3 y 4 son el camino que hoy produce carruseles. El 1 es opcional: si el usuario
no elige historia, el 2 decide su propia estructura.

---

## Paso 1 — `generate-carousel-plan`

Decide la historia antes de que exista una línea de copy. Se dispara desde
`CarouselPanel` → `useCarouselPlan.createPlan()`.

**Qué recibe del cliente** (`src/hooks/useCarouselPlan.ts:68-157`)

| campo | de dónde sale |
| --- | --- |
| `seedCopy.headline` / `.body` | `bankItem.row.headline` / `.subcopy`. Sin CTA |
| `roles` | `preset.roles`. Solo los roles, sin briefs |
| `beatCoupling`, `layoutPolicy`, `closingPolicy` | del preset |
| `objective`, `imageType` | selectores del panel |
| `excludeRouteIds`, `priorPlanDigests` | refs del hook, para pedir otra historia |
| `diversityMode: 'comparison'` | fijo: se comparan historias a propósito |

**Qué resuelve la función antes de armar el prompt** (`generate-carousel-plan/index.ts`)

| paso | línea | fuente |
| --- | --- | --- |
| rama y kit editorial | 224-270 | `commercial_branches` + `getCopyKit` |
| frases prohibidas | 261-279 | `kit.banned_phrases` + `complianceRules.forbidden_terms` |
| repertorio visual | 281 | `getSceneKit(branchSlug)` |
| rutas compatibles | 286-318 | `resolveCompatibleRoutes` + `rankRoutesByNovelty` |
| trabajo de cada beat | 337 | `beatJobForRole(role)`, **no** el cliente |

**Bloques del prompt** — todos en `_shared/buildCarouselCreativePlan.ts`

| bloque | función | de dónde saca el contenido |
| --- | --- | --- |
| `## ESTRUCTURA PEDIDA` | `roleLines` | `PLANNER_BEAT_JOBS` — el trabajo del beat, nunca su contenido |
| `## RUTAS DISPONIBLES` | `buildRouteCatalogBlock` | `carouselStoryRegistry.ts`, las 20 rutas |
| `## LA RUTA MANDA SOBRE EL ROL` | `buildRouteOwnershipBlock` | fijo |
| `## CIFRAS` | `buildFigureBlock` | `sceneKit.figurePolicy` + `route.figureScenarios` |
| `## COMPOSICIÓN` | `buildCompositionBlock` | los cinco atributos del `CompositionSpec` |
| `## OBJETOS Y ESCENA` | `buildObjectsBlock` | fijo |
| `## DE QUÉ ESTÁ HECHA LA ESCENA` | `buildSceneRepertoireBlock` | `sceneKit.dataSurfaces`, `changeMarkers`, `moments`, `bannedPropTokens` |
| `## ÁNGULOS PROHIBIDOS` | `buildBansBlock` | `ctx.bannedPhrases` |
| historias previas | `buildPriorStoriesBlock` | `priorPlanDigests` del cliente |

**Qué pasa con la respuesta**

```
callOpenAI (temp 0.9, 9000 tokens)
    → parseModelJson
    → normalizeCreativePlan     ← aquí se recorta lo que el modelo se pasó
    → validateCarouselCreativePlan
    → hasta 2 rondas de crítico  ← repairCarouselCreativePlan
    → preflight { passed, selectable }
```

Dos recortes en `normalizeCreativePlan` que no son del modelo:

- **`capFigureBeats`** — máximo 2 beats con cifras de 5, y nunca en `tension`, `solution`
  ni `cta`. Existe porque una corrida puso cifras en los cinco y un beat con cifras es un
  documento en cuadro: cinco documentos son el mismo cuadro cinco veces.
- **`deriveCompositionFamily`** — la familia de cinco valores se calcula del
  `CompositionSpec`, no la elige el agente.

El plan se persiste en `copy_bank_items.image_meta.carousel.plan` cuando el usuario lo
elige.

---

## Paso 2 — `generate-carousel-script`

Escribe las palabras exactas. Nada más, cuando hay plan.

**Qué recibe** (`src/hooks/useCarouselQueue.ts:createScript`)

| campo | con plan | sin plan |
| --- | --- | --- |
| `slides[].brief` | **no se manda** | `CAROUSEL_ROLE_BRIEFS[role]` |
| `slides[].layoutHint` | **no se manda** | `CAROUSEL_ROLE_LAYOUT_HINT[role]` |
| `plan` | el plan completo | ausente |
| `fxMoments` | tabla de contexto | igual |
| `narrativeRules` | `preset.narrativeRules` | igual |

Los dos primeros no se mandan juntos con el plan a propósito: el brief describe contenido
—"la escena repite: varias compras, varios documentos"— y le daría al guionista dos fuentes
contradictorias. Gana la más concreta, que es la equivocada.

**Bloques del prompt** — `generate-carousel-script/index.ts`, `buildSystemPrompt`

| bloque | línea aprox. | fuente |
| --- | --- | --- |
| `## LA HISTORIA YA ESTÁ DECIDIDA` | `planSection` | los tres ejes del plan + la escala de autoridad |
| `## ESTRUCTURA PEDIDA` | `roleLines` | `describeBeat()` por beat, o el brief por rol |
| `## CÓMO SE LEE ESTA ESTRUCTURA` | — | `preset.narrativeRules` |
| `## CIERRE Y PRESENCIA DE MARCA` | `objectiveRules` | el objetivo del set |
| few-shot de mecánica | — | `carouselExamples.ts`, filtrado por rama |
| `## HIGHLIGHTS` | — | `BRAND_COLOR_LANGUAGE_ES` + `HIGHLIGHT_LIMITS_ES` |
| `## COMPOSICIÓN` | `compositionSection` | con plan: "ya está decidida" |
| `## imageIntent` | `imageIntentSection` | con plan: redacta la evidencia del beat |
| `## visualMotif` | `motifSection` | con plan: el del plan, literal |
| `## CUMPLIMIENTO` | `complianceLines` | `businessCtx.complianceRules` |
| prohibiciones de rama | `editorialBans` | `buildEditorialBansBlock(kit)` |
| contexto de rama | `branchContext` | `buildBranchContextFromKit` |

**Qué se fuerza en código, no en el prompt** (`normalizeBrief`)

- `brief.layout` ← `beat.compositionFamily`, autoritativo
- `brief.primaryObjects` ← unión de los del beat y los del modelo
- `highlights` ← `normalizeHighlights()`: máx. 2 bloques, máx. 2 palabras de contenido por
  bloque, máx. 3 en total, y el segundo solo si opone al primero
- `visualMotif` de la respuesta ← el del plan
- `environmentalText` ← se filtran los números

---

## Paso 3 — `generate-design-image`, modo `carousel_prompts`

Una llamada por slide, en orden de lectura. La primera produce el bloque de diseño
compartido; las demás lo reciben y solo escriben su escena.

**Qué recibe** (`useCarouselQueue.buildPrompts`) — `carouselSlides[0]` con el slot completo,
incluido `brief` con sus `documents`.

**Los documentos con cifras se arman en el cliente**, nunca en un modelo:

```
con plan:   beat.figureRequirement.scenarioId → buildPlanFigureDocuments()
sin plan:   slot.role → figureScenarioFor(sceneKit) → buildFigureDocuments()
```

Los seis escenarios del plan y su constructor están en `src/types/design-studio.ts`. La
aritmética vive ahí porque es el mensaje: la pieza muestra el tipo de cambio y el total
juntos y tienen que cuadrar al multiplicarlos.

**Bloques del prompt final** — `assembleCarouselSlidePrompt`

| bloque | fuente |
| --- | --- |
| `CAROUSEL SLIDE n OF N` | índice y rol |
| `SUBJECT OF THIS SLIDE` | `motifLine()` — el motivo solo en el primero y el último |
| `DESIGN SPEC` | `carouselDesignBlock`, idéntico en todo el set |
| `SCENE FOR THIS SLIDE` | lo que escribió el modelo de escena |
| `briefBlock` | `slot.brief` |
| `BRAND_COLOUR_SYSTEM` | `_shared/brandColorLanguage.ts` |
| `FIGURE COLOUR GRAMMAR` | solo si el slide lleva documentos |
| `TEXT TO RENDER` | el copy final, literal |
| `TEXT COLOUR AND PLACEMENT` | `carouselTextRules()` + `HIGHLIGHT_CEILING_EN` |
| `AVOID` | lista fija de fallos ya vistos |

El repertorio visual de la rama entra por el mensaje de usuario del escritor de escena, vía
`buildSceneRepertoireBlock(sceneKit)` de `sceneKitRegistry.ts`.

---

## Paso 4 — el render

`generateSlot` manda el prompt ya armado. Un slide a la vez, así que uno malo se regenera
solo.

---

## Los tres registros que gobiernan todo

| registro | archivo | qué decide |
| --- | --- | --- |
| copy kit | `_shared/copy-kits/*.json` | ángulos y frases prohibidas de la rama |
| scene kit | `_shared/scene-kits/*.ts` | de qué está hecha la escena, y qué props son de otra rama |
| story registry | `_shared/carouselStoryRegistry.ts` | las 20 rutas: qué historia, cómo profundiza, qué evidencia la convertiría en otra |

Editar estos tres es lo que cambia el resultado sin tocar código.

---

## Donde el vocabulario se estrecha

Anotado porque es la causa de que los sets salgan parecidos, y no está resuelto.

`sceneKit.dataSurfaces` de costos tiene siete entradas y **seis son papel**. El campo
pregunta "dónde vive un dato", así que la respuesta es papel y pantallas. Lo que no existe
en el `SceneKit` es el mundo físico de la rama —la mercancía, el embalaje, la tarima, el
estante, el andén— así que un beat sin cifras no tiene otra cosa que sostener.

`route.allowedEvidenceDevices` ya se presenta como ejemplos y no como menú, y las
prohibiciones siguen duras. Pero mientras el repertorio de la rama sea casi todo papel, la
variedad no tiene de dónde salir.
