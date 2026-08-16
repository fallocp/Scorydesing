# Preflight — respuestas al Apéndice F

El documento TO-BE exige resolver doce preguntas sobre el código real antes de codificar, y
prohíbe resolverlas mediante supuestos silenciosos (§ Apéndice F). Este archivo las responde
con evidencia de archivo y línea, y registra cinco puntos donde la realidad del repo
contradice premisas del TO-BE.

Medido sobre el commit base `8fb80f3`, branch `feat/xending-design-studio-final`.

---

## 1. ¿Cuál es exactamente la branch/commit con `high`?

**No existe una versión activa con `high`.** Ni en el working tree ni en ninguna branch viva.

`src/hooks/useCarouselQueue.ts:793` envía `imageQuality: 'medium'`. El único lugar donde
`high` existió es el commit histórico `336b3154cf820a0265ba5e2ef595d1c9840e78ee`, ya
revertido. El servidor tiene `medium` como default en los dos armados de payload
(`generate-design-image/index.ts:1505` y `:2284`).

La reversión fue deliberada y está documentada en el código. El comentario de
`useCarouselQueue.ts:782-793` explica que `high` a 1024² no regresaba dentro de los 110s que
la función se concede, así que **todos** los slides fallaban por timeout, y cierra con la
conclusión técnica: volver a `high` requiere que el render deje de ser una petición
sincrónica, no un timeout más largo.

Consecuencia para el TO-BE: la instrucción §1.2 ("la branch debe salir de la versión activa
con `high`") no es ejecutable, y el criterio de aceptación §41.2 no se puede cumplir sin
cambiar la arquitectura de render. Ver [Contradicción A](#contradicción-a--high-no-es-una-preservación-es-un-rediseño).

## 2. ¿Qué callers activos usan `handleLegacyPath`?

`handleLegacyPath` vive en `generate-design-image/index.ts:2084` y tiene **dos disparadores**
en el dispatch de `serve` (`:876-892`), en este orden:

1. `requestBody.styleSystemPrompt` presente → legacy, **incluso si viene `business_id`**.
2. Ausencia de `business_id` → legacy.

Callers reales:

| Caller | Cómo entra | Consecuencia |
| --- | --- | --- |
| `ImageConceptStudio.tsx:283,336` | manda `styleSystemPrompt`, no manda `business_id` | doblemente legacy, nunca toca el master de Xending |
| `ImageGeneratorPanel.tsx` | `useGenerateImage` sin `business_id` | legacy con prompt genérico |
| `CopyWorkstation.tsx` | igual | legacy con prompt genérico |
| `StockGeneratorPage.tsx` | igual | legacy con prompt genérico |

Causa raíz estructural: `GenerateImageRequest` en `src/hooks/useGenerateImage.ts:12-61`
**no declara `business_id`**, así que todo consumidor de ese hook cae en legacy por omisión.

Riesgo silencioso: si falta `business_id` no hay error ni warning. El request se atiende con
un prompt genérico ("photorealistic editorial photography", mood `trust, growth, stability`,
`:2110-2146`). Es degradación invisible del sistema visual de Xending.

## 3. ¿Qué filas útiles siguen solo en `generated_ideas`?

Ambos bancos están vivos en el flujo productivo. `DesignStudioPage.tsx:145-166` instancia
`useCopyBank(selectedBranchId)` (v1, sobre `generated_ideas`) **y** `useCopyBankV2()`
(`copy_bank_items`) al mismo tiempo, y mantiene `activeSource: 'v1' | 'v2'` con default `'v2'`
para decidir a qué tabla escribe el image prompt.

- `useDesignCopyBank.ts` sí existe: `useCopyBank`, `useSaveBankCopies`, `useUpdateBankMeta`,
  `useUpdateBankCopy`. Marca origen con `piece_v2.source = 'design_studio'`
  (`DESIGN_STUDIO_SOURCE`, `src/types/design-studio.ts:896-927`).
- v1 sigue vivo por dos razones concretas: sesiones existentes y el generador de 4 copys
  (`useGenerateIdeas`). `useCarouselQueue` recibe un writer explícito porque el default
  apunta a `generated_ideas` y un id v2 no existe ahí.

El inventario fila por fila requiere consulta a la base productiva; no se puede resolver
solo con código. Queda como tarea de la Fase 2 con el reporte `copy-bank-migration-report.md`
que pide §9.4.

## 4. ¿Qué kits modernos están completos y aprobados?

**Tres de seis.** `supabase/functions/_shared/copy-kits/` contiene exactamente tres archivos.

| Kit | `kit_version` | Copys aprobados | Completitud |
| --- | --- | --- | --- |
| `velocidad` | `velocidad-v2.0` | 90 | Parcial: sin `scope` ni `hard_business_rules` |
| `costos-ahorro` | `costos-ahorro-v2.0` | 90 | Completo |
| `coberturas` | `coberturas-v1.0` | 60 | Completo, el más extenso |

Total 240 copys sembrados (`seed_20260806_copy_bank_v2.sql`,
`seed_20260809_copy_bank_coberturas.sql`). Cero filas para las otras tres ramas.

La falta de `hard_business_rules` en velocidad es medible: `buildEditorialBansBlock`
compone el bloque con `banned_phrases + banned_openings + hard_business_rules`, y el dump
AS-IS registra 1,193 chars para velocidad contra 1,951 (costos) y 2,072 (coberturas).

## 5. ¿Qué capacidades reales sostienen Cuenta Multidivisa?

Ninguna como rama propia. Hoy es un **ángulo absorbido por el kit de costos-ahorro**: la
regla dura "Cuenta multidivisa: el beneficio es UNIFICAR cuentas. Frasear como 'cada cuenta
suma costos y procesos'" (`docs/prompts/_generated/costos-ahorro.*.prompt.md:163`).

No hay contexto maestro, ni banco fuente, ni kit JSON, ni entrada en `copyKitRegistry`.
`docs/XENDING_CAPITAL.md §3` enumera los cinco pasos de alta de una rama; ninguno está hecho.

## 6. ¿Qué capacidades reales sostienen Control Operativo de Pagos?

Igual que multidivisa: existe como ángulo dentro de costos-ahorro, con un gold example
("Centraliza pagos internacionales y reduce procesos de conciliación"). Sin kit, sin banco,
sin bans.

## 7. ¿Banco vs Xending tiene copy bank final o sigue draft?

**Draft, y es el caso más expuesto de los tres.** Tiene `commercial_branches.prompt_kit` en
la base, así que sí genera contenido, pero no mapea a `copyKitRegistry` y por lo tanto su
system prompt viaja **sin ningún `editorialBansBlock` moderno**: conserva comparativas y
claims del `prompt_kit` legacy sin capa editorial que los acote
(`CAROUSEL_PROMPT_STACK_AS_IS.md §15.6`).

Es exactamente el riesgo que el TO-BE §8.6 quiere evitar, activo hoy en producción.

## 8. ¿El logo se reserva siempre en portada o depende del template?

**Depende del preset, y solo en el path de carrusel.**

`reservedSpaceBlock` (`generate-design-image/index.ts:970-1005`) tiene dos ramas: `logo`
reserva top-left (22% ancho × 12% alto) y `disclaimer` reserva la franja inferior 12%. Ambas
formuladas como ausencia, nunca como banda, porque nombrar una banda hacía que el modelo la
pintara.

Quién reserva qué lo decide `brandPlacement` del preset (`src/types/design-studio.ts:451`).
Los cuatro presets vigentes declaran **solo logo**: `{ logo: 'tension' }`, `{ logo: 'hook' }`,
`{ logo: 'promise' }`, `{ logo: 'moment' }`. Ninguno declara `disclaimer`, con la razón
escrita en `:574-576`.

Dos consecuencias:

- La rama BOTTOM STRIP del prompt existe pero **está muerta** para los presets actuales. El
  TO-BE §4.7 pide eliminar la reserva de banda; en la práctica ya no se activa, solo hay que
  retirar el código.
- El logo tampoco es universal dentro del set: `brandElementsForSlide` devuelve `[]` salvo
  para la **primera** aparición del rol nombrado (`design-studio.ts:881-894`), porque
  direccionar por rol ponía tres lockups en un set.

En el path de imagen única no hay reserva de ninguna de las dos.

## 9. ¿Qué path de exportación es el oficial?

**Directo, sin brandizar.** Está declarado en el docstring de `exportCarousel.ts:1-20`: no se
compone logo, ni wordmark, ni disclaimer, porque montarlos es decisión manual del editor de
capa de marca. El path anterior los estampaba en posición default y duplicaba el lockup en
piezas ya brandizadas a mano.

- PNG: descarga el archivo almacenado tal cual, sin re-render.
- PDF: pasa por el render server solo para ensamblar páginas. Usa `buildBrandLayerHtml`
  degradado a "lienzo con una imagen", sin logo ni disclaimer.
- `exportOrderedPdf`: camino manual sobre mockups ya brandizados, con `contain` para no
  recortar.

Logo y disclaimer se montan en HTML (`buildBrandLayerHtml.ts`), como elementos arrastrables
del editor. El prompt de imagen los prohíbe explícitamente (`index.ts:1349-1350`).

Dato relevante para §4.7: `buildBrandLayerHtml` tiene un `.bottom-cover`, una banda opaca
cuya única razón de existir es **tapar el disclaimer que el modelo horneó en mockups viejos**.
Es deuda que confirma el problema que el TO-BE quiere cerrar.

## 10. ¿Qué timeout permite la versión `high`?

`fetchWithRetry` aborta a los **110,000 ms** (`generate-design-image/index.ts:2436`), para
quedar bajo el gateway de plataforma (~150s) y devolver un error limpio.

El retry **no** aplica a aborts (`:2496-2505`): reintentar una generación lenta solo apila
otra espera larga y dispara el 504 del gateway. Al abortar devuelve `error: 'timeout'` con
status 500 a propósito, para que el cliente no re-dispare, con el mensaje "La generación
tardó demasiado. Prueba con calidad Media o reintenta."

El mismo techo de 110s ya forzó otra decisión de diseño: partir la generación en **un slide
por request** (`:1368-1371`, `:1862-1866`), reusando `carouselDesignBlock` entre llamadas.

No hay timeout ni `AbortController` propio en el cliente: `useCarouselQueue` depende del
default de `supabase.functions.invoke` y del gateway.

## 11. ¿Qué funciones creativas no validan membership?

**Solo una de seis lo hace completo.**

| Función | `verify_jwt` | Auth en código | Membership | Veredicto |
| --- | --- | --- | --- | --- |
| `generate-carousel-script` | `true` | sí | sí, antes de leer datos | Correcta |
| `generate-design-image` | `false` | no | no | **Crítica** |
| `generate-design-mockups` | `false` | opcional, solo para preferencias | no | Insuficiente |
| `generate-design-html` | `false` | no | no | Insuficiente |
| `hydrate-templates` | default `true` | no | no | Insuficiente |
| `render-design-png` | `false` | no (service role puro) | no | Insuficiente |

El caso grave es `generate-design-image`: crea cliente con `SUPABASE_SERVICE_ROLE_KEY`, lee
contexto de negocio filtrando por el `business_id` **del body**, y además **escribe**
`image_library.insert({ business_id: requestBody.business_id, ... })` (`:1544-1560`). Sin JWT
ni membership, es el hueco de aislamiento entre marcas más grande del Studio.

`generate-carousel-script:779-828` es el patrón correcto a replicar: header, `getUser()`,
membership contra `user_business_memberships`, y solo después el service client.

**No existe helper compartido en `_shared/`.** Cada función que valida lo hace con su propio
bloque copiado (`quick-fire:167-172`, `render-multichannel:287-292`,
`scrape-brand-presence:557-563`). La única implementación reutilizable,
`validate-claim/lib/resolveTenant.ts`, no la importa nadie más.

## 12. ¿Qué partes de `PROMPT_ENGINEER_SYSTEM` tienen consumers reales?

`PROMPT_ENGINEER_SYSTEM` está en `generate-design-image/index.ts:19` y se usa en un solo
lugar, `:2156-2158`:

```ts
systemContent = requestBody.styleSystemPrompt
  ? styleSystemPrompt + JSON_OUTPUT_ENFORCER
  : PROMPT_ENGINEER_SYSTEM;
```

Se alcanza solo cuando un caller va por legacy **sin** `styleSystemPrompt` y **sin**
`promptFinal`. Image Stock Studio siempre manda `styleSystemPrompt`, así que no lo toca. Los
que sí lo alcanzan: `ImageGeneratorPanel`, `CopyWorkstation`, `StockGeneratorPage`.

No es código muerto, pero el Design Studio de Xending nunca lo usa. La frontera que pide
§6.3 es viable: `styleSystemPrompt` ya es una ruta con contrato propio; lo que falta es
dejar de llamarla "legacy" y que la ausencia de `business_id` deje de ser un fallback
invisible.

---

## Selección V1/V2 y fuente del master prompt

No es parte del Apéndice F pero condiciona la Fase 1.

Los cuatro símbolos viven juntos en `generate-design-image/index.ts:818-835`:
`MASTER_IMAGE_PROMPT_VERSION` (env, default `v2`), `MASTER_IMAGE_PROMPT_FALLBACK`,
`DEFAULT_MASTER_IMAGE_BACKGROUND_STYLE` (`navy` con v1, `white` con v2) y
`MASTER_IMAGE_PROMPT_SOURCE` (default `code`).

**No hay fallback dinámico a V1 ante error.** V1 solo entra por petición explícita o por el
secret. Pero sí hay una vía silenciosa desde la UI: `resolveMasterImagePromptSelection`
(`src/utils/design-studio/masterImagePrompt.ts:23-41`) devuelve `masterPromptVersion: 'v1'`
para los fondos `white-classic` y `white-minimal`. Elegir un fondo en la interfaz mete V1 en
el request sin que V1 se nombre en ninguna parte.

La DB puede reemplazar el prompt completo (`master_prompts.prompt_text` vía
`fetchMasterPromptByType`), pero solo si el secret está en `database` **y** el request no
manda `masterPromptVersion`. Design Studio y carrusel siempre lo mandan, así que hoy son
inmunes. El único caller de la ruta master que no lo manda es
`pipeline-orchestrator/lib/runPipeline.ts:414-438`.

## Símbolos legacy confirmados

Verificados por grep, con ubicación:

| Símbolo | Ubicación | Nota |
| --- | --- | --- |
| `FIGURE_SCENARIO_BY_ROLE` | `useCarouselQueue.ts:101` | mapea `shift → two_moment`, `risk → repeated_purchases` |
| `FX_MOMENT_LABELS` | `useCarouselQueue.ts:91` | tres etiquetas fijas |
| `CAROUSEL_SCENE_VARIETY` | `generate-design-image/index.ts:923` | centrado en documentos FX |
| `carouselMechanicsExamples` | `_shared/carouselExamples.ts:49` | firma solo toma `objective`, no preset ni rama |
| `split_photo` | `design-studio.ts:194`, `index.ts:1142` | y `CAROUSEL_ROLE_LAYOUT_HINT` liga roles a layouts |
| `visualMotif` | ambas funciones y `design-studio.ts:418` | contrato de continuidad actual |
| "texto SIEMPRE arriba" | `index.ts:1421` y `:1428` | duplicado en las dos ramas del user message |
| `useDesignCopyBank` | `src/hooks/useDesignCopyBank.ts` | banco v1 activo |

---

## Contradicciones entre el TO-BE y el repo

### Contradicción A — `high` no es una preservación, es un rediseño

El TO-BE lo trata como algo que ya funciona y solo hay que no degradar (§4.10, §41.2,
§38.3: "no rediseñar a job asíncrono si `high` ya funciona de forma estable"). El repo dice
lo contrario: `high` **no** funciona sincrónicamente, y el propio código concluye que
volver a él exige dejar de ser petición sincrónica.

Las opciones del §38.3 se agotan hasta la 3. Decisión pendiente del usuario.

### Contradicción B — dos de los seis slugs canónicos no son slugs de rama

El TO-BE §7.3 declara canónicos `costos-ahorro` y `coberturas`. En la base esos son nombres
de **kit**; las ramas se llaman `ahorro-costos-ocultos` y `cobertura-cambiaria`. Hoy
conviven dos universos de slugs con dos capas de traducción independientes: `ALIASES` +
regex en `copyKitRegistry.ts:36-79` (rama → kit) y `resolveBranchForKitSlug` en
`src/types/copy-bank.ts` (kit → rama).

### Contradicción C — el alias `pagos-con-orden` no aplica

El TO-BE §7.4 pide migrar `pagos-con-orden → control-operativo-pagos`. La base activa **ya
tiene** `control-operativo-pagos` y **no contiene** `pagos-con-orden`
(`CAROUSEL_PROMPT_STACK_AS_IS.md:187`). Ese alias sobra.

### Contradicción D — bloquear las ramas draft es una regresión visible

El TO-BE §7.6 exige impedir generación productiva desde ramas incompletas. Las tres ramas sin
kit están hoy activas en el selector del Studio, porque `useDesignStudioBranches` filtra solo
por `is_active`. Cumplir §7.6 retira tres opciones que el usuario ve y usa hoy.

Nota: `generate-copy-v2` ya devuelve 400 `unknown_branch` para ellas, pero
`generate-carousel-script` no bloquea: atrapa el error de `getCopyKit`, deja los bans vacíos
y genera con el contexto legacy.

### Contradicción E — el DoD pide TypeScript sin errores y la base tiene 152

`docs/architecture/BRANCH_BASELINE.md` registra 152 errores de tipos preexistentes. El DoD
(§42) pide "TypeScript sin errores" y "Lint sin errores nuevos", pero el script `lint` no es
ejecutable: ESLint no está instalado ni declarado, y no hay archivo de configuración.

---

## Decisiones que bloquean el inicio de la Fase 1

1. **`high`**: medir la latencia real de `high` a 1024² antes de decidir, y luego elegir entre
   render asíncrono con polling (aumenta el alcance) o mantener `medium` y corregir el criterio
   §41.2. Recomendación: medir primero, porque el resto del plan no depende de esto.
2. **Slugs**: fijar la rama de la base como identidad y el kit como capa editorial, con una
   sola tabla de traducción en vez de dos. Retirar el alias `pagos-con-orden`.
3. **Ramas draft**: confirmar que se aceptan tres opciones menos en el selector, o definir un
   estado intermedio que permita generar con aviso explícito.
4. **ESLint**: instalar con configuración, o retirar el script y ajustar el DoD.
5. **Los 152 errores**: dejarlos como deuda declarada, o limpiar al menos
   `templateAssembler.ts` y `VisualSelections`, que se cruzarán con los contratos nuevos.
