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
        ├─ 1. generate-carousel-plan      → QUÉ historia            (obligatorio)
        │
        ├─ 2. generate-carousel-script    → QUÉ dice cada slide
        │
        ├─ 3. generate-design-image        → CÓMO se ve cada slide
        │      modo carousel_prompts
        │
        └─ 4. generate-design-image        → la imagen
               modo render, una por slide
```

Los cuatro pasos forman el camino vigente. El guion rechaza cualquier request sin un plan que
cubra exactamente los roles del preset; ya no existe un camino alterno donde el guionista
decida estructura o evidencia.

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
| `## RUTAS DISPONIBLES` | `buildRouteCatalogBlock` | `carouselStoryRegistry.ts`, las 21 rutas |
| `## LA RUTA MANDA SOBRE EL ROL` | `buildRouteOwnershipBlock` | fijo |
| `## CIFRAS` | `buildFigureBlock` | escenario único + `factKeys`, peso y superficie por beat |
| `## COMPOSICIÓN` | `buildCompositionBlock` | los cinco atributos del `CompositionSpec` |
| `## OBJETOS Y ESCENA` | `buildObjectsBlock` | fijo |
| `## DE QUÉ ESTÁ HECHA LA ESCENA` | `buildSceneRepertoireBlock` | `physicalWorld`, `dataSurfaces`, `changeMarkers`, `bannedPropTokens` |
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

Dos normalizaciones en `normalizeCreativePlan` que no son del modelo:

- **Escenario económico único** — todos los beats con cifras se armonizan al mismo
  `scenarioId`; sus `factKeys` se filtran contra el vocabulario permitido del escenario.
- **`capHeavyFigureSurfaces`** — conserva todas las cifras y limita a dos únicamente las
  superficies `heavy`. Una tercera hoja/dashboard se degrada a `featured/freeform`; el
  hecho económico no se elimina.
- **`deriveCompositionFamily`** — la familia de cinco valores se calcula del
  `CompositionSpec`, no la elige el agente.

En rutas numéricas, los planes nuevos distribuyen hechos coherentes en 4–5 beats. Cada beat
separa cuatro decisiones: `factKeys`, `narrativePurpose`, `weight` y `suggestedSurface`.
`document` y `dashboard` son superficies posibles, no el significado de “lleva cifras”.

El plan se persiste en `copy_bank_items.image_meta.carousel.plan` cuando el usuario lo
elige.

---

## Paso 2 — `generate-carousel-script`

Escribe las palabras exactas. Nada más, cuando hay plan.

**Qué recibe** (`src/hooks/useCarouselQueue.ts:createScript`)

| campo | valor |
| --- | --- |
| `slides[]` | rol y elementos de marca; sin brief ni layout por rol |
| `plan` | obligatorio, completo y validado contra los roles |
| `economicScenario` | assumptions + derived + facts calculados una vez en cliente |
| `narrativeRules` | `preset.narrativeRules` |

No se mandan `CAROUSEL_ROLE_BRIEFS` ni `CAROUSEL_ROLE_LAYOUT_HINT`: el beat del plan es la
única autoridad sobre evidencia y composición. El escenario económico entra como contexto
para que el copy respete la mecánica, pero el modelo tiene prohibido copiar sus valores.

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

**Qué recibe** (`useCarouselQueue.buildPrompts`) — `carouselSlides[0]` con el slot completo.
Los planes nuevos llevan `brief.economicFacts` y `brief.figurePresentation`; los slots
históricos pueden seguir llevando `brief.documents`.

**La fuente económica se arma una vez en el cliente**, nunca en un modelo:

```
plan.figureScenarioId + TC/monto/markup editables
    → buildCarouselEconomicScenario()
    → CarouselMeta.economicScenario
    → beat.figureRequirement.factKeys
    → projectCarouselEconomicFacts()
    → brief.economicFacts + brief.figurePresentation
```

`buildCarouselEconomicScenario` calcula costo base/expuesto, diferencia, precio fijo,
utilidad bruta y margen bruto real. El TC inicial es 17.20, pero es editable; regenerar el
guion reconstruye el escenario completo con el valor actual del panel.

Para planes nuevos, `commercialIntent` separa el producto antes de elegir ruta:

- `quote_comparison` usa `second_quote` y el escenario simultáneo `quote_comparison`;
  recibe tasa Xending y otra cotización editables, sin fechas ni semántica HOY/PAGO;
- `forward` conserva la lógica de obligación futura dentro de coberturas;
- `cost_plus_speed` exige costo y condición operativa como dos criterios;
- `cost_component` explica anatomía, escala o margen sin comparar proveedores.

`rate_comparison` mantiene su significado histórico HOY/PAGO únicamente para planes legacy
y rutas de cobertura. El preflight rechaza que una comparación use fechas futuras, “costo
definido”, “fijar” o cualquier semántica de forward.

`buildPlanFigureDocuments()` permanece únicamente como adaptador compatible:

- un plan histórico sin `factKeys` conserva sus documentos;
- un plan nuevo lo usa solo si `suggestedSurface === 'document'`.

Las demás superficies reciben el mismo hecho sin forma documental: etiqueta sobre objeto,
unidad→lote→proyecto, banda de margen, anatomía, proceso, presupuesto espacial, decisión o
acumulación física.

**Bloques del prompt final** — `assembleCarouselSlidePrompt`

| bloque | fuente |
| --- | --- |
| `CAROUSEL SLIDE n OF N` | índice y rol |
| `SUBJECT OF THIS SLIDE` | `motifLine()` — el motivo solo en el primero y el último |
| `DESIGN SPEC` | `carouselDesignBlock`, idéntico en todo el set |
| `SCENE FOR THIS SLIDE` | lo que escribió el modelo de escena |
| `briefBlock` | `slot.brief` |
| `BRAND_COLOUR_SYSTEM` | `_shared/brandColorLanguage.ts` |
| `FIGURE COLOUR GRAMMAR` | si el slide lleva `economicFacts` o documentos legacy |
| `ECONOMIC FACTS` | hechos exactos + propósito, peso y regla de la superficie elegida |
| `DOCUMENT DATA` | solo si `brief.documents` existe |
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
| story registry | `_shared/carouselStoryRegistry.ts` | las 21 rutas: qué historia, cómo profundiza, qué evidencia la convertiría en otra |

Editar estos tres es lo que cambia el resultado sin tocar código.

---

## Corrección de la convergencia documental

`physicalWorld` amplió el repertorio físico, pero no resolvió por sí solo los beats
centrales: el contrato seguía equiparando “lleva cifra” con “recibe documentos”. La
corrección vigente separa tres capas:

1. **Cálculo:** `CarouselEconomicScenario` persiste assumptions, derived y facts.
2. **Proyección narrativa:** cada beat referencia `factKeys`, `narrativePurpose` y `weight`.
3. **Representación:** `suggestedSurface` decide cómo se integra el dato; `document` es una
   opción entre once.

Reglas deterministas:

- todas las cifras de un set pertenecen al mismo `scenarioId`;
- una ruta numérica nueva usa hechos en 4–5 beats;
- máximo dos beats tienen peso `heavy`;
- `document` y `dashboard` siempre son `heavy`;
- exceder el máximo aligera la superficie, no elimina el hecho;
- todo escenario hipotético lleva `ESCENARIO ILUSTRATIVO`;
- cobertura significa certidumbre del costo, no ahorro garantizado;
- una comparación con otro proveedor exige cotización o supuesto explícito.

El registro de costos está en `carousel-story-registry-v3`. Sus rutas describen
transformaciones empresariales, no escenas, y ya no inyectan `preferredVisualProxies` en el
prompt. La ruta nueva `fx_cost_component` sigue la misma conversión desde un artículo o
insumo hasta lote/proyecto sin fijar hoja, tabla o dashboard.

Compatibilidad: los carruseles persistidos con `brief.documents` siguen renderizando sin
reinterpretación. Los planes antiguos sin `factKeys` conservan el adaptador documental al
regenerar; solo los planes nuevos usan la proyección neutral.
