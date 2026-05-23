# Claim Validator

## ¿Qué es?

El Claim Validator es una **compuerta automática de compliance** que revisa cada pieza de contenido publicitario antes de que avance en el pipeline de generación de SCORY Design. Implementa un modelo de validación de dos niveles que garantiza que ningún contenido riesgoso llegue a producción.

Funciona como una Supabase Edge Function (`validate-claim`) que puede invocarse de forma independiente o como paso obligatorio del pipeline orquestado.

---

## ¿Qué problema resuelve?

| Sin Claim Validator | Con Claim Validator |
|---|---|
| Contenido con promesas falsas puede publicarse | Se detecta y bloquea automáticamente |
| Depender de revisión humana para cada pieza | Validación instantánea sin intervención |
| Costo de API para validar contenido simple | Nivel 1 es local y gratuito — solo paga API cuando necesita análisis profundo |
| Un error en una pieza bloquea todo el lote | Cada pieza se valida independientemente — las buenas avanzan |
| No hay trazabilidad de por qué se rechazó algo | Cada rechazo incluye la razón, el texto problemático y una sugerencia de corrección |
| Reglas genéricas para todos los clientes | Nivel 2 usa las reglas personalizadas de cada tenant |

---

## Modelo de dos niveles

### Nivel 1 — Reglas éticas base (local)

- **Siempre activo** para todos los tenants
- **Sin costo** — no hace llamadas a APIs externas
- **Instantáneo** — solo operaciones de regex en memoria
- **Determinista** — mismo input siempre produce mismo output

Detecta:

| Categoría | Ejemplo | Riesgo |
|-----------|---------|--------|
| Retornos garantizados | "Te garantizamos un retorno del 10%" | Alto |
| Promesas falsas | "100% seguro", "nunca pierdes" | Alto |
| Comparaciones engañosas | "Mejor que cualquier banco" | Alto |
| Minimización de riesgos | "Riesgo cero", "sin ningún riesgo" | Alto |
| Falsa urgencia | "Última oportunidad", "solo hoy" | Alto |
| Discriminación | "Solo para hombres/mujeres" | Alto |
| Calificadores faltantes | Hablar de rendimiento sin disclaimer | Medio |

### Nivel 2 — Reglas personalizadas del tenant (IA)

- **Solo activo** cuando el tenant tiene `claim_validation_enabled: true`
- **Usa OpenAI** (gpt-4.1-mini) para análisis semántico profundo
- **Personalizado** — inyecta las reglas del tenant (configuradas con el Compliance Wizard)
- **Resiliente** — reintentos inteligentes por tipo de error

Valida contra:

| Tipo de regla | Qué hace | Ejemplo |
|---------------|----------|---------|
| Términos prohibidos | Bloquea contenido con estas palabras | "rendimiento garantizado" |
| Calificadores requeridos | Exige disclaimers cuando hay claims financieros | "Sujeto a regulación CNBV" |
| Valores máximos | Limita cifras numéricas | rendimiento_anual ≤ 15% |

---

## Flujo de validación

```
┌─────────────────────────────────────────────────────────────┐
│  1. Llega un request con N piezas publicitarias             │
│                                                             │
│  2. Validación de input                                     │
│     → ¿Tiene pieces? ¿Tiene business_id o brand?            │
│     → Si falla → 400 con detalle del error                  │
│                                                             │
│  3. Resolución de tenant                                    │
│     → Verificar membresía del usuario                       │
│     → Leer claim_validation_enabled y compliance_rules      │
│     → Si no tiene acceso → 403                              │
│                                                             │
│  4. NIVEL 1 — Para CADA pieza (siempre se ejecuta)          │
│     → Pattern matching contra reglas éticas base            │
│     → Verificar calificadores obligatorios                  │
│     → Resultado: riskLevel + issues con source:'base_rules' │
│                                                             │
│  5. NIVEL 2 — Para CADA pieza (solo si habilitado)          │
│     → Construir prompt con reglas del tenant                │
│     → Llamar a OpenAI con reintentos inteligentes           │
│     → Resultado: riskLevel + issues con source:'tenant_rules'│
│                                                             │
│  6. Combinación de resultados                               │
│     → Merge de issues de ambos niveles                      │
│     → riskLevel final = max(nivel1, nivel2)                 │
│     → compliance_status: 'rejected' si high, 'approved' si no│
│                                                             │
│  7. Agregación final                                        │
│     → pipelineAction: 'halt' si TODAS son high              │
│     → pipelineAction: 'continue' si al menos una pasa      │
│     → approvedPieceIndices: cuáles piezas pueden avanzar    │
│                                                             │
│  8. Respuesta al cliente                                    │
│     → 200 con resultados detallados por pieza               │
└─────────────────────────────────────────────────────────────┘
```

---

## Modos de uso

### Standalone (invocación directa)

Cualquier parte del sistema puede llamar al Claim Validator directamente:

```
POST /validate-claim
Authorization: Bearer <jwt>

{
  "business_id": "uuid-del-tenant",
  "pieces": [
    {
      "headline": "Invierte hoy con retornos increíbles",
      "body": "Nuestro producto ofrece las mejores tasas.",
      "cta": "Empieza ahora"
    }
  ]
}
```

### Como paso del pipeline

Cuando el Pipeline Orchestrator lo invoca, incluye un `pipelineRunId` para trazabilidad:

```
POST /validate-claim
Authorization: Bearer <jwt>

{
  "business_id": "uuid-del-tenant",
  "pieces": [...],
  "pipelineRunId": "run-abc-123"
}
```

El `pipelineRunId` se devuelve intacto en la respuesta.

---

## Estructura de la respuesta

```json
{
  "results": [
    {
      "pieceIndex": 0,
      "riskLevel": "medium",
      "issues": [
        {
          "text": "retornos increíbles",
          "risk": "medium",
          "reason": "Missing required qualifier: past_performance",
          "suggestedFix": "Add: rendimientos pasados no garantizan resultados futuros",
          "source": "base_rules"
        }
      ],
      "approvedVersion": {
        "headline": "Invierte hoy con potencial de crecimiento",
        "body": "Nuestro producto ofrece tasas competitivas.",
        "cta": "Conoce más",
        "footer": "Rendimientos pasados no garantizan resultados futuros."
      },
      "finalRecommendation": "Ajustes menores recomendados.",
      "compliance_status": "approved"
    }
  ],
  "pipelineAction": "continue",
  "approvedPieceIndices": [0],
  "validationLevel": "full",
  "pipelineRunId": "run-abc-123"
}
```

---

## Manejo de errores

### Errores de input (no llegan a validación)

| Situación | Respuesta |
|-----------|-----------|
| Array vacío o sin pieces | 400 — "pieces must be a non-empty array" |
| Pieza sin headline/body/cta | 400 — indica qué campos faltan y en qué posición |
| Sin business_id ni brand | 400 — "At least one required" |
| Usuario sin membresía | 403 — "Acceso denegado" |
| Tenant no encontrado | 404 — "Tenant not found or inactive" |

### Errores de OpenAI (Nivel 2)

| Error | Acción | Resultado |
|-------|--------|-----------|
| Rate limit | Espera retryAfter, reintenta hasta 2 veces | Si agota → pieza marcada high risk |
| JSON malformado | Reintenta con temperature 0.1 | Si falla de nuevo → pieza marcada high risk |
| Content policy | No reintenta | Pieza marcada high risk |
| Network error | No reintenta | 503 con Retry-After: 30s |
| Auth error | No reintenta | 500 genérico |

**Principio clave**: Un error en una pieza NO afecta a las demás. Cada pieza se procesa independientemente.

---

## Relación con el Compliance Wizard

```
┌──────────────────────┐         ┌──────────────────────┐
│  Compliance Wizard   │         │   Claim Validator    │
│                      │         │                      │
│  Configura reglas:   │────────▶│  Aplica reglas:      │
│  • forbidden_terms   │         │  • Nivel 1 (base)    │
│  • required_qualifiers│        │  • Nivel 2 (tenant)  │
│  • max_values        │         │                      │
│                      │         │  Genera:             │
│  Recibe feedback:    │◀────────│  • Rechazos          │
│  • Disputas          │         │  • Issues            │
│  • Patrones          │         │  • Sugerencias       │
└──────────────────────┘         └──────────────────────┘
```

- El **Compliance Wizard** es donde el usuario configura sus reglas
- El **Claim Validator** es donde esas reglas se aplican automáticamente
- Los rechazos del Validator alimentan las sugerencias del Wizard (loop de mejora continua)

---

## Seguridad y aislamiento

- JWT de Supabase para autenticación
- Row Level Security (RLS) activo — el cliente Supabase se crea con el token del usuario
- Verificación de membresía antes de procesar cualquier pieza
- Un usuario solo puede validar contenido de SU negocio
- Errores genéricos que no revelan datos internos (API keys, prompts, datos de otros tenants)
- Cuando solo Nivel 1 está activo, no hay riesgo de filtración vía errores de API

---

## Arquitectura técnica

### Módulos

| Módulo | Archivo | Responsabilidad |
|--------|---------|-----------------|
| Entry Point | `index.ts` | CORS, auth, orquestación del flujo completo |
| Input Validator | `lib/validateInput.ts` | Validar estructura del request |
| Tenant Resolver | `lib/resolveTenant.ts` | Resolver tenant, verificar acceso, leer config |
| Base Rules Engine | `lib/baseRulesEngine.ts` | Nivel 1 — validación local por regex |
| Base Ethical Rules | `lib/baseEthicalRules.ts` | Constantes de reglas éticas universales |
| Prompt Builder | `lib/buildPrompt.ts` | Construir prompt de Nivel 2 con reglas del tenant |
| OpenAI Validator | `lib/validatePieceOpenAI.ts` | Nivel 2 — validación semántica con reintentos |
| Response Validator | `lib/validateClaimResponse.ts` | Validar estructura de respuesta de OpenAI |
| Result Combiner | `lib/combineResults.ts` | Fusionar resultados de ambos niveles |
| Result Aggregator | `lib/aggregateResults.ts` | Determinar acción del pipeline |
| Constants | `lib/constants.ts` | Configuración del modelo y prompt fallback |
| Types | `lib/types.ts` | Interfaces TypeScript del contrato |

### Ubicación

```
supabase/functions/validate-claim/
├── index.ts                    # Entry point
├── lib/
│   ├── types.ts               # Interfaces
│   ├── constants.ts           # Config + fallback prompt
│   ├── validateInput.ts       # Validación de input
│   ├── resolveTenant.ts       # Resolución de tenant
│   ├── baseEthicalRules.ts    # Reglas éticas constantes
│   ├── baseRulesEngine.ts     # Motor Nivel 1
│   ├── buildPrompt.ts         # Constructor de prompt Nivel 2
│   ├── validatePieceOpenAI.ts # Motor Nivel 2 con retries
│   ├── validateClaimResponse.ts # Validador de respuesta OpenAI
│   ├── combineResults.ts      # Combinador de resultados
│   └── aggregateResults.ts    # Agregador final
└── __tests__/                  # Tests unitarios y property-based
```

### Base de datos (tablas referenciadas)

| Tabla | Uso |
|-------|-----|
| `business_tenants` | Leer `compliance_rules`, `claim_validation_enabled`, `slug` |
| `user_business_memberships` | Verificar acceso del usuario al tenant |
| `master_prompts` | Obtener prompt de validación personalizado (tipo `claim_validation`) |

---

## Propiedades de correctness (garantías formales)

El sistema fue desarrollado con 15 propiedades formales verificadas mediante property-based testing (fast-check, 100+ iteraciones cada una):

| # | Propiedad | Qué garantiza |
|---|-----------|---------------|
| 1 | Cardinalidad | N piezas de entrada → N resultados de salida, siempre |
| 2 | Detección de campos | Si falta headline/body/cta, se detecta con posición exacta |
| 3 | Nivel 1 siempre corre | Independiente del flag del tenant, sin llamadas a API |
| 4 | Detección ética | Patrones prohibidos → high, calificadores faltantes → medium |
| 5 | validationLevel correcto | 'base' ↔ deshabilitado, 'full' ↔ habilitado |
| 6 | Inyección completa | Todas las reglas del tenant aparecen en el prompt |
| 7 | Términos prohibidos → high | Si hay match prohibido, riskLevel es siempre 'high' |
| 8 | Combinación sin pérdida | Issues de ambos niveles se fusionan sin perder ni duplicar |
| 9 | Max de riesgo | riskLevel final = max(nivel1, nivel2) |
| 10 | Pipeline ID pass-through | pipelineRunId se devuelve intacto |
| 11 | Reintentos acotados | Máximo 2 reintentos por rate limit, nunca más |
| 12 | Aislamiento por pieza | Error en una pieza no afecta a las demás |
| 13 | Status ↔ riesgo | 'rejected' ↔ high, 'approved' ↔ low/medium |
| 14 | Acción del pipeline | 'halt' ↔ todas high, 'continue' ↔ al menos una no-high |
| 15 | Autorización | Sin membresía → 403, sin procesar nada |

---

## Preguntas frecuentes

**¿Qué pasa si mi tenant no tiene Nivel 2 activado?**
Solo se ejecuta Nivel 1 (reglas éticas base). Es instantáneo, gratuito y no depende de servicios externos. La respuesta incluye `validationLevel: 'base'`.

**¿Puedo validar piezas sin estar en el pipeline?**
Sí. El endpoint funciona standalone — solo necesitas un JWT válido y ser miembro del tenant.

**¿Qué pasa si OpenAI se cae?**
Si es un error de red, recibes un 503 con header `Retry-After: 30`. Si es un error por pieza (rate limit agotado, content policy), esa pieza se marca como high risk pero las demás se procesan normalmente.

**¿Cómo se decide si el pipeline se detiene?**
Solo se detiene (`pipelineAction: 'halt'`) si TODAS las piezas son high risk. Si al menos una pasa, el pipeline continúa con las aprobadas.

**¿Puedo usar `brand` en vez de `business_id`?**
Sí. Es la ruta legacy. Si envías `brand` (slug), el sistema busca el tenant por slug. Si envías ambos, `business_id` tiene prioridad.

**¿Las reglas de Nivel 1 se pueden personalizar?**
No. Son universales y hardcodeadas — aplican a todos los tenants por igual. Las reglas personalizables son las de Nivel 2 (configuradas con el Compliance Wizard).

**¿Qué es la `approvedVersion`?**
Cuando Nivel 2 detecta issues, OpenAI propone una versión corregida de la pieza. El orquestador puede usar esta versión automáticamente si el riesgo es medium.
