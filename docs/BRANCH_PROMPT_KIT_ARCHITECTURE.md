# Branch Prompt Kit — Arquitectura

## Resumen

Sistema para que cada rama comercial tenga contexto narrativo propio en la generación de contenido, sin duplicar el prompt base universal.

## Arquitectura del prompt

```
PROMPT_STAGE_HEADER        → Define etapa (Atracción/Conexión/Conversión), rol, tono, reglas
    ↓
BRANCH_CONTEXT_BLOCK       → Contexto profundo de la rama (desde prompt_kit o strategic_config)
    ↓
PROMPT_BASE_UNIVERSAL      → Reglas de calidad, compliance, formato, ejemplos (fallback FX)
```

## Ramas comerciales

### Tipo: Product (solución específica)
| Rama | Slug | Foco |
|------|------|------|
| Velocidad - Mismo Día | `velocidad-mismo-dia` | Urgencia, tiempo, proveedor, liquidación rápida |
| Cuenta Multidivisa | `cuenta-multidivisa` | Saldos, monedas, control, visibilidad, tesorería global |
| Cobertura Cambiaria | `cobertura-cambiaria` | Volatilidad, márgenes, planeación, protección |
| Control Operativo de Pagos | `control-operativo-pagos` | Pagos masivos, trazabilidad, orden, conciliación |

### Tipo: Narrative (lente transversal)
| Rama | Slug | Foco |
|------|------|------|
| Ahorro / Costos Ocultos | `ahorro-costos-ocultos` | Costos invisibles, spread, comisiones, transparencia |

### Tipo: Comparison
| Rama | Slug | Foco |
|------|------|------|
| Banco vs Xending | `banco-vs-xending` | Comparación profesional, inercia, especialización |

## Fase 2 (futuro): Combinación de ramas

```
product_branch + narrative_branch + funnel_stage + creative_angle
```

Ejemplo:
- product_branch = Cuenta Multidivisa
- narrative_branch = Ahorro / Costos Ocultos
- funnel_stage = Atracción
- creative_angle = Problema oculto
- Resultado: contenido sobre costos ocultos de operar múltiples monedas

## Componentes

### 1. Migración SQL
- `20260504_add_prompt_kit_to_commercial_branches.sql` — Agrega columna `prompt_kit JSONB`
- `20260504_seed_prompt_kit_cuenta_multidivisa.sql` — Datos iniciales para Cuenta Multidivisa

### 2. Módulo compartido
- `supabase/functions/_shared/buildBranchContextBlock.ts`
  - `buildBranchContextBlock(promptKit, strategicConfig, commercialBranch)` → string
  - `getBranchContextDebugInfo(...)` → debug info object

### 3. Edge Function modificada
- `supabase/functions/generate-ideas/index.ts`
  - `fetchDynamicContext()` ahora trae `prompt_kit`
  - `selectStagePrompt()` reemplaza a `selectFunnelPrompt()`
  - `assembleContentPrompt()` nueva función que ensambla las 3 capas
  - Debug logging con `debug_prompt_context: true`

## Backward Compatibility

- Si una rama NO tiene `prompt_kit`, el sistema usa `strategic_config` como fallback
- Si no hay `funnelStage`, usa el master prompt de la DB o fallback a Atracción
- Los flujos existentes (image, punchline, legacy) no se modificaron

## Campos del prompt_kit

```json
{
  "branch_id": "string",
  "branch_name": "string",
  "positioning": "string",
  "short_positioning": "string",
  "executive_angle": "string",
  "provocative_angle": "string",
  "primary_problem": "string",
  "strategic_promise": "string",
  "audience": ["string"],
  "tensiones_clave": ["string"],
  "dolores_especificos": ["string"],
  "beneficios_especificos": ["string"],
  "buenos_headlines": ["string"],
  "malos_headlines": ["string"],
  "claims_permitidos": ["string"],
  "claims_prohibidos": ["string"],
  "formulas_narrativas": ["string"],
  "visual_language": ["string"],
  "restricciones_de_rama": ["string"],
  "temas_prioritarios": ["string"],
  "cta_recomendados": ["string"]
}
```

## Debug Mode

Enviar `debug_prompt_context: true` en el request body para loggear:
- commercialBranch
- funnelStage
- narrativeAngle
- promptKitFound: true/false
- strategicConfigFound: true/false
- doloresEspecificos usados
- restriccionesDeRama aplicadas
- branchContextLength
- finalPromptLength

## Testing

Probar con Cuenta Multidivisa + cada combinación:
- Atracción + Problema oculto
- Atracción + Antes vs Después
- Conexión + Checklist educativo
- Conexión + Dato duro
- Conversión + Costo de no actuar
- Conversión + Testimonial

### Criterio de aceptación
- 4/4 ideas hablan de control, saldos, monedas, tesorería, visibilidad, conciliación
- 0/4 ideas centradas en pagos a China, SWIFT, mismo día, FX genérico
- Headlines específicos a la rama, no genéricos
- Cada idea conecta con un dolor del prompt_kit
- Respeta etapa del funnel y ángulo narrativo
