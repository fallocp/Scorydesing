# Decisiones de la branch `feat/xending-design-studio-final`

Registro de decisiones tomadas sobre el documento TO-BE, con su efecto en los criterios de
aceptación. Existe para que el Definition of Done no se evalúe contra criterios que fueron
modificados a propósito.

## D1 — La calidad de imagen se queda en `medium`

**Decisión:** no se implementa `high` en esta branch.

**Razón:** el TO-BE §4.10 y §41.2 asumen que `high` es una versión activa que solo hay que no
degradar. El preflight demostró que no existe: `high` a 1024² no regresa dentro de los 110s
que `fetchWithRetry` se concede antes del gateway, y el propio código concluye que volver a
`high` exige que el render deje de ser una petición sincrónica. Las imágenes en `medium` ya
tienen la calidad aprobada.

**Efecto en los criterios:**

- §41.2 ("`high` sigue en payload y pruebas") queda **anulado**.
- §1.2 ("la branch debe salir de la versión activa con `high`") queda **anulado**: la branch
  sale de `8fb80f3`, que usa `medium`.
- §38.1 ("el request final debe enviar `high`") queda **anulado**.
- §38.3 no aplica: no se rediseña a job asíncrono.
- Se conserva §38.2: seguir midiendo tiempos de render.

**Reversibilidad:** alta. El cambio es una línea en `useCarouselQueue.ts:793`, pero requiere
antes mover el render a un job asíncrono con polling. Queda documentado como trabajo futuro,
fuera de esta branch.

## D2 — ESLint se instala con configuración

**Decisión:** instalar ESLint y crear su configuración, en vez de retirar el script muerto.

**Razón:** el script `lint` de `package.json` invoca `eslint`, que no está instalado ni
declarado en `devDependencies`, y no existe archivo de configuración. El DoD §42 pide "Lint
sin errores nuevos", que hoy no es verificable.

**Pendiente de acordar:** versiones exactas a fijar y si el umbral arranca en
`--max-warnings 0` sobre una base que nunca pasó por lint.

## D3 — Las tres ramas sin kit siguen operativas, marcadas como draft

**Decisión:** `cuenta-multidivisa`, `control-operativo-pagos` y `banco-vs-xending` **no se
bloquean**. Se quedan visibles y generando como hoy. Se les agrega el estado `draft` tipado y
una etiqueta visible de "kit pendiente" para que su editorial incompleto sea evidente en la
interfaz. Se completarán con contexto maestro, banco de copys y kit aprobado más adelante,
fuera de esta branch.

**Razón:** son ramas en uso y bloquearlas retiraba tres opciones del selector sin que exista
todavía el reemplazo editorial.

**Efecto en los criterios:**

- §41.9 ("las seis ramas canónicas existen como kits tipados") se cumple.
- §41.10 ("las ramas incompletas están draft y no inventan claims") se cumple **a medias y a
  propósito**: quedan marcadas draft, pero sí generan.
- §7.6 ("impedir generación productiva desde una rama incompleta") queda **anulado**.

**Riesgo residual aceptado:** `banco-vs-xending` sigue produciendo comparativas contra bancos
sin ningún `editorialBansBlock` moderno, apoyada solo en su `prompt_kit` legacy. Es el caso
más expuesto de los tres y el que conviene atender primero cuando se completen los kits.

## D5 — Los 152 errores de tipos: regenerar los tipos de Supabase

**Decisión:** regenerar `src/integrations/supabase/types.ts` antes de empezar la Fase 1, y
después triar lo que quede.

**Diagnóstico:** los 152 errores no son 152 problemas. De las 32 tablas que `src/` consulta,
**14 no existen en el archivo de tipos generados**:

```
asset_snapshots      copy_bank_items    creative_profiles   custom_templates
design_feedback      design_mockups     design_sessions     learning_deltas
pipeline_pieces      pipeline_runs      pipeline_steps      presentations
template_registry    trigger_templates
```

La distribución de códigos confirma la causa: 36 `TS2339` (propiedad inexistente), 29
`TS2345` (no asignable a `never`), 13 `TS2769` (ningún overload coincide), 11 `TS2352`. Es el
patrón de consultar una tabla que el tipo `Database` no conoce: Postgrest resuelve a `never`
y todo lo posterior cascadea.

**Por qué antes y no al final:** la Fase 2 migra el Design Studio a `copy_bank_items`, una de
las tablas ausentes. Es la razón por la que `useCopyBankV2` usa un cliente destipado. Escribir
los contratos nuevos sobre tablas sin tipos obliga a `as any` y deja la Fase 3 sin
verificación.

**Comando:**

```powershell
supabase gen types typescript --linked > src/integrations/supabase/types.ts
```

**Pendiente después de regenerar:** medir la caída y triar el resto. Se esperan tres grupos
genuinos: `CampaignCategory` sin importar en `src/types/xendingDesign.ts`, fixtures de test
que construyen `VisualSelections` sin los campos de narrativa y embudo, y `chart.tsx` /
`resizable.tsx`, probable desajuste de versión de `recharts` y `react-resizable-panels`.

## D6 — La migración de slugs se aplica junto con el cambio de código

**Decisión:** `20260816_xending_branch_slug_identity.sql` no se aplica por separado. Corre en
el mismo deploy que el cambio que deja de inyectar `prompt_kit` legacy cuando existe kit
moderno.

**Razón:** por sí sola la migración no cambia nada visible; el texto con "costos ocultos"
sigue llegando al agente desde `prompt_kit`. Juntas dejan la rama de costos limpia en una sola
pasada.

**Alcance medido:** 2 filas de `commercial_branches`, 0 de `design_sessions`, 17 de
`design_mockups` y 2 de `design_feedback`. Solo `design_sessions` tenía impacto funcional y no
tiene filas afectadas. Todo son `UPDATE`, con rollback en el archivo.

## Hallazgo — la migración `20260811` nunca tuvo efecto

No es una decisión, es un defecto que la Fase 1 debe corregir.

`20260811_fix_costos_branch_editorial_compliance.sql` reescribió `strategic_config` para quitar
el ángulo de costos ocultos. Pero `buildBranchContextBlock` usa `prompt_kit` cuando existe y
**nunca** cae a `strategic_config`. La rama de costos tiene `prompt_kit`, así que el fix está
inerte desde que se aplicó: el bloque de 7,004 caracteres que llega hoy a los agentes sigue
conteniendo "Xending revela y elimina los costos ocultos que los bancos tradicionales
esconden", "Las empresas pagan 2-4% más de lo que creen en cada operación" y "La transparencia
no es un beneficio. Es un derecho que tu banco no te da".

El comentario final de esa migración justifica no cambiar el nombre de la rama porque
"rompería `resolveBranchForKitSlug`". Es incorrecto: esa función busca `/costo/` por regex, que
"Costos y Ahorro" cumple igual, y tras el rename acierta por slug exacto.

La corrección es por código (dejar de inyectar `prompt_kit` cuando hay kit moderno), no por
otra reescritura de datos que el código tampoco leería.

## D4 — Identidad de rama: el slug de la base absorbe el slug del kit

**Decisión:** renombrar dos slugs y un nombre visible para que rama y kit compartan
identificador.

| Antes | Después |
| --- | --- |
| slug `ahorro-costos-ocultos`, nombre "Ahorro / Costos Ocultos" | slug `costos-ahorro`, nombre "Costos y Ahorro" |
| slug `cobertura-cambiaria`, nombre "Cobertura Cambiaria" | slug `coberturas`, nombre "Cobertura Cambiaria" |

Los otros cuatro slugs ya coinciden con los canónicos del TO-BE §7.3.

**Razón adicional al alineamiento:** el nombre de la rama viaja al prompt como parámetro de
`buildBranchContextBlock`, y "Ahorro / Costos Ocultos" contiene la frase que el kit moderno
prohíbe. `prompt_kit.branch_name` repite el mismo texto y `prompt_kit.positioning` declara
"Xending revela y elimina los costos ocultos que los bancos tradicionales esconden". La
migración `20260811_fix_costos_branch_editorial_compliance.sql` corrigió el editorial pero
dejó el nombre, así que la frase prohibida sigue entrando por esa puerta.

**Impacto:** bajo. La llave entre tablas es `commercial_branches.id` (UUID), no el slug, así
que ninguna relación se rompe. Se toca:

- una migración nueva de rename (las tres históricas no se editan);
- `copyKitRegistry.ALIASES` conserva los alias viejos para datos existentes;
- `resolveBranchForKitSlug` pasa a acertar por slug exacto en vez de caer al regex;
- el fixture de `src/types/__tests__/copy-bank.test.ts:180`.

**Efecto en los criterios:** el alias `pagos-con-orden → control-operativo-pagos` del §7.4 se
retira: la base activa ya usa `control-operativo-pagos` y nunca contuvo `pagos-con-orden`.


