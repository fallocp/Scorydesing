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
