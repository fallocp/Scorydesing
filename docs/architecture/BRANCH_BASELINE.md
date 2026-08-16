# Línea base — `feat/xending-design-studio-final`

Estado medido **antes** de cualquier cambio de código en el branch. Sirve como referencia
para distinguir regresiones introducidas por la reconstrucción del núcleo creativo de
problemas que ya existían.

## Origen

| Dato | Valor |
| --- | --- |
| Branch base | `feat/design-studio-content-modes` |
| Commit base | `8fb80f3` — feat(carrusel): ampliar guion, cifras y exportacion |
| Fecha de medición | 2026-08-16 |

> **Actualización.** Los números de abajo son la medición original del commit base. El estado
> actual del branch, tras regenerar los tipos de Supabase e instalar ESLint, está al final del
> documento en [Estado tras la Fase 0](#estado-tras-la-fase-0).

## Type-check (`tsc -b`)

**152 errores preexistentes.** El build de tipos NO está limpio en la base.

Concentración principal:

| Errores | Archivo |
| --- | --- |
| 35 | `src/components/CopyWorkstation.tsx` |
| 24 | `src/hooks/useDesignStudioSession.ts` |
| 12 | `src/utils/xendingDesign/templateAssembler.ts` |
| 8 | `src/components/pipeline/QuickFirePanel.tsx` |
| 8 | `src/hooks/useSaveCustomTemplate.ts` |
| 5 | `src/hooks/useMemoryTimeline.ts` |
| 5 | `src/store/pipelineStore.ts` |
| 5 | `src/components/ui/chart.tsx` |
| 5 | `src/components/ui/resizable.tsx` |

El resto se reparte en 23 archivos con 1 a 4 errores cada uno.

Causas recurrentes observadas:

- `template_registry` no existe en los tipos generados de Supabase
  (`templateAssembler.ts`), lo que cascada en errores `never` sobre columnas.
- `VisualSelections` creció con campos de narrativa y embudo que los tests y algunos
  callers todavía no construyen.
- `CampaignCategory` no está importado en `src/types/xendingDesign.ts`.

## Tests (`vitest --run`)

Verde. 96 archivos de test, 1073 pruebas pasan, 2 skipped.

## Lint

**No ejecutable.** El script `lint` de `package.json` invoca `eslint`, pero ESLint no está
instalado ni declarado en `devDependencies`, y no existe archivo de configuración
(`eslint.config.*` ni `.eslintrc*`). Queda pendiente decidir si se instala o si se retira
el script.

## Criterio de aceptación derivado

La reconstrucción no debe aumentar el conteo de 152 errores de tipos ni romper ninguna de
las 1073 pruebas. Reducir errores preexistentes es bienvenido, pero no es objetivo de este
branch salvo que bloqueen la implementación.

---

## Estado tras la Fase 0

Medido después de regenerar los tipos de Supabase, instalar ESLint y corregir los errores que
bloqueaban ambas herramientas.

| Medida | Base `8fb80f3` | Ahora |
| --- | --- | --- |
| `tsc -b` | 152 errores | **84 errores** |
| `npm run lint` | no ejecutable | **0 errores, 404 avisos** |
| `vitest --run` | 1073 pasan, 2 skipped | 1073 pasan, 2 skipped |

### Cómo bajaron los 152

1. **152 → 119** al regenerar `src/integrations/supabase/types.ts`. El archivo estaba
   desactualizado: de las 32 tablas que `src/` consulta, 14 no existían en los tipos. Postgrest
   resolvía a `never` y todo lo posterior cascadeaba. `useDesignStudioSession` pasó de 24
   errores a 3, y `pipelineStore` con `usePipelineRun` quedaron limpios.
2. **119 → 84** al declarar el estado de `CopyWorkstation.tsx`. Sus 35 errores venían de cinco
   causas: `savedDesigns` y `activeDesignId` ausentes de la interfaz local `CopyState`, el tipo
   `SavedDesign` sin definir, `callGenerateIdeas` devolviendo `unknown`, y un `branch_data` que
   necesitaba `Json` en vez de `Record<string, unknown>`. El componente ya escribía y leía esos
   campos en runtime; solo faltaba declararlos. Cero cambios de comportamiento.

### Los 84 que quedan

| Grupo | Errores | Qué son |
| --- | --- | --- |
| Tablas nunca desplegadas | 27 | `template_registry` y `custom_templates` no existen en la base conectada |
| shadcn vs dependencias nuevas | 12 | `chart.tsx`, `resizable.tsx` y `calendar.tsx` escritos para versiones mayores anteriores de `recharts`, `react-resizable-panels` y `react-day-picker` |
| Hooks del Design Studio | 23 | errores sueltos, de 1 a 5 por archivo |
| Fixtures de test | 9 | construyen `VisualSelections` sin los campos de narrativa y embudo |
| `CampaignCategory` sin importar | 4 | `src/types/xendingDesign.ts` |
| Otros | 9 | `QuickFirePanel`, `XendingDesignPage`, `MasterPromptEditor`, dos componentes de UI |

### Hallazgo — seis migraciones nunca se aplicaron

Al regenerar los tipos, seis tablas siguieron ausentes porque no existen en la base conectada,
aunque su migración de creación sí está en el repo:

```
20260523_create_custom_templates.sql
20260524_create_asset_snapshots.sql
20260524_create_creative_profiles.sql
20260524_create_learning_deltas.sql
20260525_create_template_registry.sql
20260526_create_trigger_templates.sql
```

Migraciones posteriores sí corrieron (las de agosto: `copy_bank_v2`, `coberturas`,
`costos_branch`, `image_library_mockup_link`), así que el historial está aplicado de forma
parcial. El código consulta esas seis tablas y en producción no existen: cualquier flujo que
las toque falla en tiempo de ejecución.

Aplicarlas está **fuera del alcance** de esta branch (§3.2 del TO-BE) y es una decisión de
infraestructura aparte. Sus 27 errores de tipos quedan como deuda declarada con esta razón.

## ESLint

Instalado con versiones exactas: `eslint@10.8.1`, `@eslint/js@10.0.1`,
`typescript-eslint@8.67.0`, `eslint-plugin-react-hooks@7.1.1`,
`eslint-plugin-react-refresh@0.5.4`, `globals@17.11.0`.

El script `lint` perdió `--ext ts,tsx`, que ya no existe en flat config, y `--max-warnings 0`,
que en una base sin lint previo bloquearía todo commit. Se agregó un script `type-check`.

Alcance limitado a `src/`. Fuera: `supabase/functions/**` (es Deno, importa por URL y usa el
global `Deno`), `renderer/**` (servicio Node aparte) y los tipos generados.

Los 404 avisos se reparten así: `no-explicit-any` 204, `no-unused-vars` 72,
`exhaustive-deps` 34, y 76 de reglas nuevas de `eslint-plugin-react-hooks` 7
(`set-state-in-effect`, `immutability`, `refs`, `purity`) que no existían cuando se escribió
este código. Todas quedan como aviso para ser visibles y medibles; se suben a error por regla,
a medida que se limpian.

### Criterio de aceptación actualizado

Reemplaza al de la medición original:

- `npm run lint` debe seguir saliendo con **0 errores**. Cualquier error nuevo es nuestro.
- `tsc -b` no debe pasar de **84 errores**.
- Las 1073 pruebas deben seguir pasando.
