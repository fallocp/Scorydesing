# Handoff: escenarios direccionales para TODA la rama coberturas

> Estado: PROPUESTO / pendiente de ejecutar en otra sesión.
> Contexto: hoy el tratamiento direccional (escena fija import/export + cifras fijas por
> slide + labels direccionales + integridad de MXN) existe SOLO para `forward_protection`.
> El resto de escenarios de coberturas salen incoherentes (el caso observado: un copy de
> exportador — "El equipo médico se cobra dentro de 90 días" — renderizado como
> `cashflow_certainty` con escena de importador, un solo TC y el slide 1 sin total MXN).

## Objetivo
Llevar ese tratamiento a **todos** los escenarios de figuras que usa coberturas, arreglar
la propagación de dirección (hoy es un toggle manual con default `import`) y el enrutamiento
(un copy forward no debe caer en `cashflow_certainty` por rotación de rutas).

---

## Alcance: escenarios afectados

Escenarios que las rutas de coberturas pueden elegir (`carouselStoryRegistry.ts`, campo
`figureScenarios`):

| Escenario | Cardinalidad | Dirección aplica | Compartido con otras ramas | Estado hoy |
|---|---|---|---|---|
| `forward_protection` | 2 tasas (base vs expuesta) | sí | no (solo coberturas) | ✅ completo |
| `rate_comparison` | 2 tasas | sí | no | ❌ nada |
| `rate_range` | 2 tasas (hipotético A→B) | sí | **sí (costos_ahorro)** | ❌ nada |
| `margin_sensitivity` | 2 estados (precio fijo vs costo variable) | sí | **sí (costos_ahorro)** | ❌ nada |
| `cashflow_certainty` | 1 valor, sin contraparte | sí (solo label) | no | ❌ nada — **el roto** |

`quote_comparison`, `repeated_operations`, `accumulated_difference` NO los usa coberturas
(son de costos/ahorro): quedan fuera de alcance.

**Sutileza crítica:** `rate_range` y `margin_sensitivity` los comparten las rutas de
costos_ahorro, donde import/export NO significa nada. El flip de labels y las escenas
direccionales **deben gatearse por rama = coberturas** (o por `commercialIntent === 'forward'`),
no solo por `scenarioId`. Hoy el flip gatea por `scenarioId === 'forward_protection'`, que por
casualidad es coberturas-only; al extenderlo hay que evitar ensuciar costos.

---

## Estado actual (anclas de código)

`supabase/functions/_shared/buildCarouselCreativePlan.ts`
- `FORWARD_FIGURE_SCHEMA` (~línea 160): `Record<role, {factKeys, weight, suggestedSurface}>`.
- `FORWARD_SCENE_IMPORT` / `FORWARD_SCENE_EXPORT` (~200-265): `Record<role, {visualEvidence, visualDevice}>`.
- `applyForwardFigureSchema(plan, direction)` (~270): `if (plan.figureScenarioId !== 'forward_protection') return plan;` ← el candado a abrir.
- Se invoca en `generate-carousel-plan/index.ts:424`.

`src/types/design-studio.ts`
- `FORWARD_FACT_LABELS_IMPORT/EXPORT` (~1226-1252), `FORWARD_RESOLUTION_LABELS_IMPORT/EXPORT` (~1260-1272).
- `buildCarouselEconomicScenario` (~1281): aplica `forwardFactLabels` solo si `scenarioId === 'forward_protection'` (~1398).
- `projectCarouselEconomicFacts` (~1418): aplica `forwardResolutionLabels` solo si `scenarioId === 'forward_protection'` (~1422).
- `buildPlanFigureDocuments` (~1498): `case 'cashflow_certainty'` construye 1 documento; escenarios sin case → `default: { documents: [] }`.

`supabase/functions/_shared/carousel-plan-types.ts`
- `CAROUSEL_SCENARIO_FACT_KEYS` (~487): hechos permitidos por escenario.
  - `cashflow_certainty` = `['operation_usd','base_rate','defined_cost_mxn']`
  - `rate_comparison` = `rate_range` = `['operation_usd','base_rate','exposed_rate','base_cost_mxn','exposed_cost_mxn','cost_delta_mxn','cost_delta_pct']`
  - `margin_sensitivity` = `['operation_usd','base_rate','exposed_rate','base_cost_mxn','exposed_cost_mxn','sale_price_mxn','base_gross_profit_mxn','exposed_gross_profit_mxn','base_gross_margin_pct','exposed_gross_margin_pct']`
  - `forward_protection` = igual que margin_sensitivity + `cost_delta_mxn`, `cost_delta_pct` (grupo margen OPCIONAL, solo con precio de venta).

`supabase/functions/generate-design-image/index.ts`
- `canonicalFiguresBlock` (~1071): la rama de 1 tasa omite el MXN en silencio si no hay hecho MXN (~1122) → causa del "slide 1 sin total".
- `economicDataBlock` (~1140): `hasExposed` deriva la cardinalidad EXACTAMENTE UNO/DOS de los hechos (~1171). **Esto ya es correcto y global; NO se toca.**

`src/components/design-studio/CarouselPanel.tsx`
- `forwardDirection` state default `'import'` (~253), solo se manda cuando `usesForward` = `commercialIntent === 'forward'` (~998), y solo entra a `fxAssumptions.direction` bajo `usesForward` (~331).

`generate-carousel-plan/index.ts`
- Selección de ruta: `resolveCompatibleRoutes` + `rankRoutesByNovelty` (~311-322).
- `figureScenarioId` final lo fija `normalizeCreativePlan` a partir del primer beat con cifras
  (el LLM elige entre `route.figureScenarios`).

---

## Diseño propuesto

### 1. Registro por escenario (reemplaza el hardcode de forward)
En `buildCarouselCreativePlan.ts`, generalizar a un registro indexado por `scenarioId`:

```ts
type DirectionalScenes = { import: Record<Role, ForwardSceneSlot>; export: Record<Role, ForwardSceneSlot> };

const SCENARIO_FIGURE_SCHEMA: Partial<Record<ScenarioId, Record<Role, ForwardFigureSlot>>> = {
  forward_protection: FORWARD_FIGURE_SCHEMA,   // ya existe
  rate_comparison:    { /* ... */ },
  rate_range:         { /* ... */ },
  margin_sensitivity: { /* ... */ },
  cashflow_certainty: { /* ... */ },
};

const SCENARIO_SCENES: Partial<Record<ScenarioId, DirectionalScenes>> = {
  forward_protection: { import: FORWARD_SCENE_IMPORT, export: FORWARD_SCENE_EXPORT },
  rate_comparison:    { import: {/*...*/}, export: {/*...*/} },
  // ...
};
```

Renombrar `applyForwardFigureSchema` → `applyScenarioFigureSchema(plan, direction)`:
```ts
const schema = SCENARIO_FIGURE_SCHEMA[plan.figureScenarioId];
const scenes = SCENARIO_SCENES[plan.figureScenarioId];
if (!schema || !scenes) return plan;   // no-op solo si el escenario no está registrado
const sceneByRole = direction === 'export' ? scenes.export : scenes.import;
// resto igual que hoy
```
Mantener el nombre viejo como alias exportado, o actualizar el import en `index.ts`.

### 2. Labels direccionales para todos (con gateo por rama)
En `design-studio.ts`, cambiar el gateo de `scenarioId === 'forward_protection'` a
"el escenario tiene mapa de labels **y** el set es de coberturas/forward". Como
`buildCarouselEconomicScenario` hoy no recibe la rama, hay que **pasarla**:
- **Opción A (recomendada):** agregar `directionAware: boolean` (o `branchSlug`) a la firma de
  `buildCarouselEconomicScenario` y `projectCarouselEconomicFacts`, y que `useCarouselQueue`
  lo pase (`branchId === 'coberturas'`).
- Opción B: derivarlo de `assumptions.direction` presente explícitamente (requiere dejar de
  defaultear a `'import'` en costos → arriesgado, no recomendada).

Definir mapas de labels por escenario (reutilizar los de forward donde el vocabulario coincide).
Ej. `cashflow_certainty`: `defined_cost_mxn` → import `COSTO DEFINIDO`, export `INGRESO DEFINIDO`.

Referencia de labels actuales (forward), para reutilizar/derivar:
- IMPORT: `base_rate`=TC PRESUPUESTADO, `exposed_rate`=TC AL PAGO, `base_cost_mxn`=COSTO PRESUPUESTADO,
  `exposed_cost_mxn`=COSTO AL PAGO, `cost_delta_mxn`=AUMENTO DE COSTO, `sale_price_mxn`=PRECIO DE VENTA FIJO.
- EXPORT: `exposed_rate`=TC AL COBRO, `base_cost_mxn`=INGRESO PRESUPUESTADO, `exposed_cost_mxn`=INGRESO AL COBRO,
  `cost_delta_mxn`=CAÍDA DE INGRESO, `sale_price_mxn`=COSTO FIJO.
- Resolución IMPORT: `base_cost_mxn`=COSTO FINAL. EXPORT: `base_cost_mxn`=INGRESO FINAL. Ambas:
  `base_rate`=FORWARD PACTADO, `base_gross_profit_mxn`=UTILIDAD DEFINIDA, `base_gross_margin_pct`=MARGEN PROTEGIDO.

### 3. Escenas + cifras por escenario y rol
Escribir, con el mismo cuidado que forward, para cada escenario × 5 roles (tension, shift,
risk, solution, cta) × 2 direcciones:
- `factKeys` por rol (que **ningún slide con cifras se quede sin su MXN**).
- `visualEvidence` + `visualDevice` con la cardinalidad explícita en el texto.

Semántica por escenario:
- **rate_comparison / rate_range:** igual que forward (2 tasas), pero la conclusión de
  `rate_range` es condicional "si pasara de A a B", nunca afirmar que llegará. Solo el beat
  `risk` lleva las dos tasas; los demás, un solo valor.
- **margin_sensitivity:** precio de venta fijo (import) / costo fijo (export) contra el
  costo/ingreso variable; el beat `risk` muestra la franja de margen estrechándose. Dos estados.
- **cashflow_certainty:** UN solo valor en TODOS los slides (turquesa, sin coral). Import =
  "COSTO DEFINIDO / pago futuro"; export = "INGRESO DEFINIDO / cobro futuro". La escena habla de
  reservar efectivo para un **pago** (import) o de la certeza del **ingreso** (export). Nunca dos tarjetas.

### 4. Documentos para escenarios sin `case`
En `buildPlanFigureDocuments`, agregar `case` para los escenarios cuyos beats usen
`suggestedSurface: 'document'` (rate_comparison, rate_range, margin_sensitivity). Hoy caen en
`default → []` y el slide `heavy` se queda sin tarjetas. Si el schema del paso 3 no usa
`document` en ningún rol de esos escenarios, este paso no hace falta — decidirlo al escribir los schemas.

### 5. Propagación de dirección desde el copy (no el toggle manual)
Hoy `forwardDirection` es un toggle con default `'import'` y solo viaja bajo `usesForward`.
Problema: un copy de exportador cae como importador.
- Derivar la dirección del `angle_tag` del copy:
  - EXPORT: `cobro_a_90_dias`, `exportacion_60_dias`, `ingreso_usd_*`, `precio_pactado_ingreso_*`,
    `venta_realizada_*`, `siguiente_ciclo_productivo` (banco exportadores).
  - IMPORT: `pago_futuro_*`, `presupuesto_*`, `anticipo_saldo`, `reposicion_*`, `compras_recurrentes`
    (banco importadores).
- Helper `inferFxDirection(angleTag): 'import'|'export'|null` para **inicializar**
  `forwardDirection` en `CarouselPanel` (el toggle queda como override manual).
- **De raíz (opcional, mejor):** columna `fx_direction` en `copy_bank_items` seteada en los seeds;
  pasarla en `bankItem`. Elimina la heurística. Ver "Nota de esquema".
- Mandar `direction` a `fxAssumptions` **siempre que la rama sea coberturas**, no solo bajo
  `usesForward`, para que `cashflow_certainty` la reciba.

### 6. Enrutamiento (que un copy forward no caiga en cashflow por rotación)
En `resolveCompatibleRoutes` / la selección en `index.ts`: sesgar la elección según la naturaleza
del copy. Si el `angle_tag`/CTA es de forward ("Fija hoy tu tipo de cambio", "Cotiza un forward",
`cobro/pago_a_90_dias`), preferir rutas con `figureScenarios` que incluyan `forward_protection`
sobre las de `cashflow_certainty`. Implementar como un `preferredScenarios` derivado del angle,
aplicado antes de `rankRoutesByNovelty`.

### 7. Validación de integridad
En `validateCarouselCreativePlan.ts`: regla nueva — todo beat con
`figureRequirement.mode === 'illustrative'` cuya superficie muestre conversión a pesos **debe**
incluir el hecho MXN del escenario (`defined_cost_mxn`, `base_cost_mxn` o el que aplique). Y/o
hacer que `canonicalFiguresBlock` **falle en vez de omitir** cuando falta el MXN. Con el paso 3
(schema fijo) esto no debería dispararse; queda como red de seguridad.

---

## Nota de esquema (si se hace el paso 5 "de raíz")
`copy_bank_items` no tiene columna de dirección. Agregar
`fx_direction text check (fx_direction in ('import','export'))` nullable, poblarla en los seeds
de coberturas (exportadores → `export`, importadores → `import`) y regenerar. Nombres en
inglés/snake_case por convención del proyecto; los valores del CHECK en inglés.

---

## Orden de ejecución sugerido
1. Refactor no-funcional: `applyForwardFigureSchema` → registro `SCENARIO_*` con solo forward
   dentro (debe salir idéntico). Verificar que un carrusel forward no cambia (regresión).
2. `cashflow_certainty` completo (schema + escenas import/export + labels) — es el roto y el
   coberturas-only más simple.
3. Gateo por rama en labels (`buildCarouselEconomicScenario`/`projectCarouselEconomicFacts`
   reciben `branchSlug`/`directionAware`).
4. `rate_comparison`, luego `rate_range`, luego `margin_sensitivity`.
5. Propagación de dirección (paso 5) y enrutamiento (paso 6).
6. Validación (paso 7).

## Verificación
- Generar en modo `comparison` un carrusel por escenario × dirección (import y export) y revisar:
  cardinalidad correcta (1 o 2), labels correctos (COSTO vs INGRESO, PAGO vs COBRO), MXN presente
  en todos los slides con cifras, aritmética `USD × TC = MXN`.
- Regresión: el carrusel de autopartes forward ya validado debe salir idéntico.
- Type-check + lint. Deploy de `generate-carousel-plan` y `generate-design-image`.

## Archivos que se tocan
- `supabase/functions/_shared/buildCarouselCreativePlan.ts` (registro + apply)
- `src/types/design-studio.ts` (labels por escenario + gateo por rama)
- `supabase/functions/generate-design-image/index.ts` (canonicalFiguresBlock: fallar en vez de omitir)
- `supabase/functions/_shared/validateCarouselCreativePlan.ts` (regla MXN)
- `supabase/functions/generate-carousel-plan/index.ts` (enrutamiento por angle)
- `src/components/design-studio/CarouselPanel.tsx` (init dirección desde angle; mandar direction en coberturas)
- `src/hooks/useCarouselQueue.ts` (pasar branch a buildCarouselEconomicScenario)
- opcional: migración `copy_bank_items.fx_direction` + reseed coberturas

## Primer entregable más chico (si se quiere acotar)
Pasos 1 + 2 + 3(solo cashflow) + 5 + 7 resuelven el caso roto observado (equipo médico /
cashflow_certainty). rate_comparison, rate_range y margin_sensitivity pueden ir en una segunda tanda.
