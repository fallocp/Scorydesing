# Arquitectura de Agentes — Pipeline de Campaña Xending

> Estado: Mayo 2026
> Cada agente es independiente, tiene un input/output definido, y se alimenta del anterior o de input manual.

---

## Pipeline Visual — Simplificado

```
BRIEF (manual o Agente 1)
  │
  ▼
┌──────────────────┐
│  AGENTE 1        │
│  Strategy        │
│                  │
│  IN: brief       │
│  OUT: config     │
│       estratégica│
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  AGENTE 2        │
│  Content         │
│                  │
│  IN: config      │
│  OUT: pieces[]   │
│    headline      │
│    body, cta     │
│    imageIntent   │
│    angle         │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  AGENTE 3        │
│  Image           │
│                  │
│  IN: imageIntent │
│      + copy      │
│  OUT: 3 prompts  │
│    fotografia    │
│    infografia    │
│    mapa_rutas    │
└────────┬─────────┘
         │ (usuario elige tipo)
         ▼
┌──────────────────┐
│  GPT Image 2     │
│  (API call)      │
│                  │
│  IN: prompt      │
│  OUT: imagen     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  AGENTE 4        │
│  HTML Assembly   │
│                  │
│  IN: copy +      │
│      imagen +    │
│      brand data  │
│  OUT: HTML pieza │
│  (puede generar  │
│   templates      │
│   nuevos)        │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│  AGENTE 5        │
│  Render          │
│                  │
│  IN: HTML +      │
│      dimensiones │
│  OUT: PNG base64 │
└──────────────────┘
```

**Agentes opcionales (se llaman manualmente cuando se necesitan):**
- **Variant** — optimiza copy existente sin cambiar estrategia
- **Claim Validator** — safety net de compliance (futuro, si se necesita)

---

## Agente 1 — Strategy

**Responsabilidad:** Tomar el brief del usuario y convertirlo en una configuración estratégica completa que alimenta al Content Agent.

**Edge Function:** `generate-strategy`
**Master Prompt:** No tiene prompt propio — es lógica de negocio + DB lookups.

| Campo | Descripción |
|-------|-------------|
| **Input** | Brief manual: marca, tema, audiencia, objetivo, plataformas |
| **Output** | Config estratégica completa |

**Output estructura:**
```json
{
  "brand": "xending",
  "productLine": "Pagos Internacionales / FX",
  "commercialBranch": "cobertura_cambiaria",
  "branchObjective": "...",
  "mainInsight": "...",
  "businessPain": "...",
  "promise": "...",
  "industryVertical": "agro",
  "marketMoment": "...",
  "audience": "...",
  "angle": "velocidad",
  "channel": "instagram_story",
  "format": "9:16",
  "proofPoints": ["..."],
  "avoidClaims": ["..."],
  "tone": "...",
  "defaultCTAs": ["..."],
  "footerSuggestions": ["..."],
  "visualGuidelines": "..."
}
```

**Qué NO hace:** No genera copy. No genera imágenes. Solo resuelve la configuración.

**Estado actual:** `generate-strategy` existe pero no está conectado al flujo principal. El brief se arma manualmente en el frontend.

---

## Agente 2 — Content

**Responsabilidad:** Generar las piezas de copy completas con `imageIntent` semántico.

**Edge Function:** `generate-ideas` (path master) / `generate-design-copy`
**Master Prompt:** `masterContentPrompt` (`prompt_type = 'content'`)

| Campo | Descripción |
|-------|-------------|
| **Input** | Config estratégica del Agente 1 (o manual) |
| **Output** | Array de `pieces[]` con copy completo + `imageIntent` |

**Output por pieza:**
```json
{
  "headline": "Tu banco tarda 5 días. Tu proveedor no.",
  "body": "Liquidación el mismo día hábil. La velocidad es margen.",
  "cta": "Envía hoy",
  "footer": "Disponible solo para clientes en Estados Unidos.",
  "angle": "velocidad",
  "imageIntent": "velocidad de decisión bajo presión cambiaria",
  "visualStyle": "premium corporate",
  "recommendedTemplate": "breaking-news"
}
```

**Qué NO hace:** No describe escenas fotográficas. No genera prompts de imagen. Solo define QUÉ debe comunicar la imagen (`imageIntent`), no CÓMO se ve.

**Estado actual:** `generate-ideas` tiene path master y legacy. `generate-design-copy` es el legacy. El campo `imageDirection` se renombró a `imageIntent` — `generate-ideas` ya emite `imageIntent` en su output y el mapper acepta ambos campos para backward compatibility.

---

## Agente 3 — Image

**Responsabilidad:** Traducir `imageIntent` + copy en 3 prompts técnicos para GPT Image 2.

**Edge Function:** `generate-design-image` (mode = "prompts")
**Master Prompt:** `masterImagePrompt` (`prompt_type = 'image'`)

| Campo | Descripción |
|-------|-------------|
| **Input** | `imageIntent` + `headline` + `body` + `angle` + `brandColors` + `format` |
| **Output** | 3 prompts técnicos: `fotografia`, `infografia`, `mapa_rutas` |

**Output:**
```json
{
  "fotografia": { "prompt_final": "...", "negative_instructions": "...", "aspect_ratio": "...", "creative_rationale": "..." },
  "infografia": { "prompt_final": "...", "negative_instructions": "...", "aspect_ratio": "...", "creative_rationale": "..." },
  "mapa_rutas": { "prompt_final": "...", "negative_instructions": "...", "aspect_ratio": "...", "creative_rationale": "..." }
}
```

**Qué NO hace:** No inventa el mensaje. No decide el ángulo. No valida compliance. Solo traduce el concepto semántico al lenguaje técnico de cada tipo de imagen.

**Generación de imagen:** Cuando el usuario elige un tipo, se llama al mismo Edge Function con `mode = "generate"` + `promptFinal` → GPT Image 2 devuelve `imageBase64`.

**Estado actual:** ✅ Deployado y funcional con el nuevo formato de 3 prompts.

---

## Agente 4 — Claim Validator

**Responsabilidad:** Validar compliance de una pieza antes de guardar/publicar. Gate obligatorio.

**Edge Function:** No existe todavía — pendiente de crear.
**Master Prompt:** `masterClaimValidationPrompt` (`prompt_type = 'claim_validation'`)

| Campo | Descripción |
|-------|-------------|
| **Input** | Pieza completa: `headline` + `body` + `cta` + `footer` + `proofPoints` + `avoidClaims` |
| **Output** | `riskLevel` (low/medium/high) + `issues[]` + `approvedVersion` |

**Output:**
```json
{
  "riskLevel": "low",
  "issues": [],
  "approvedVersion": { "headline": "...", "body": "...", "cta": "...", "footer": "..." },
  "finalRecommendation": "Pieza aprobada sin cambios."
}
```

**Qué NO hace:** No genera copy. No modifica la estrategia. Solo valida y corrige si hay riesgo.

**Cuándo se llama:**
- Después de que el Agente 2 genera las piezas (automático)
- Después de que el Agente 5 genera variantes (automático)
- Antes de guardar cualquier pieza en la DB (gate obligatorio)

**Estado actual:** ❌ Prompt existe en `docs/prompts/`, pero no hay Edge Function ni integración.

---

## Agente 5 — Variant

**Responsabilidad:** Generar variantes de copy sin cambiar la estrategia.

**Edge Function:** `generate-variants`
**Master Prompt:** `masterVariantPrompt` (`prompt_type = 'variant'`)

| Campo | Descripción |
|-------|-------------|
| **Input** | Pieza original + instrucción de optimización (ej: "hazlo más directo") |
| **Output** | Array de `variants[]` con copy alternativo |

**Output:**
```json
{
  "variants": [
    {
      "headline": "...",
      "body": "...",
      "cta": "...",
      "footer": "...",
      "changeReason": "...",
      "complianceNotes": []
    }
  ]
}
```

**Qué NO hace:** No cambia el ángulo. No cambia la marca. No genera imágenes. Solo optimiza el copy.

**Estado actual:** `generate-variants` existe. Pendiente integrar con master prompt.

---

## Agente 6 — HTML Assembly

**Responsabilidad:** Ensamblar la pieza HTML final con copy + imagen + template + datos dinámicos.

**Edge Function:** `generate-design-html`
**Master Prompt:** No usa LLM — es lógica de template.

| Campo | Descripción |
|-------|-------------|
| **Input** | Copy aprobado + imagen (base64 o URL) + template + brand identity + partner + data badge |
| **Output** | HTML completo listo para render |

**Datos que inyecta en el template:**
- Brand lockup (logo + sublabel si Capital)
- Headline, subcopy, CTA botón (texto referente al ángulo)
- Hero image
- Data Badge (según ángulo: velocidad→MISMO DÍA HÁBIL, FX→tasa, cobertura→+30 PAÍSES, disponibilidad→24/7)
- Status Pill (referente al ángulo y headline)
- Partner badge (auto-inyectado desde `partners.json` si partner ≠ none)
- Promoter area (si aplica)
- Disclaimer obligatorio

**Qué NO hace:** No genera copy. No genera imágenes. No valida compliance. Solo ensambla.

**Estado actual:** `generate-design-html` existe. Usa GPT para generar HTML — pendiente evaluar si debería ser template puro sin LLM.

---

## Agente 7 — Render

**Responsabilidad:** Convertir HTML en PNG pixel-perfect.

**Edge Function:** `render-design-png`
**Master Prompt:** No aplica — es Puppeteer.

| Campo | Descripción |
|-------|-------------|
| **Input** | HTML + width + height + filename |
| **Output** | PNG base64 |

**Qué NO hace:** Nada más. Solo renderiza.

**Estado actual:** Edge Function existe pero no tiene Puppeteer (Deno no lo soporta). Está preparado para proxy a servicio externo (`RENDER_SERVICE_URL`). Alternativa: render local con `xending-design/scripts/render.js`.

---

## Tabla Resumen

| # | Agente | Edge Function | Master Prompt | Input viene de | Estado |
|---|--------|---------------|---------------|----------------|--------|
| 1 | Strategy | `generate-strategy` | — (DB lookups) | Brief manual | ⚠️ Existe, no conectado |
| 2 | Content | `generate-ideas` | `masterContentPrompt` | Agente 1 o manual | ⚠️ Funcional, falta `imageIntent` |
| 3 | Image | `generate-design-image` | `masterImagePrompt` | Agente 2 (`imageIntent` + copy) | ✅ Deployado |
| 4 | Claim Validator | — | `masterClaimValidationPrompt` | Agente 2 o 5 (pre-save) | ❌ No existe |
| 5 | Variant | `generate-variants` | `masterVariantPrompt` | Pieza + instrucción | ⚠️ Existe, falta master prompt |
| 6 | HTML Assembly | `generate-design-html` | — (template) | Copy + imagen + config | ⚠️ Existe, usa LLM |
| 7 | Render | `render-design-png` | — (Puppeteer) | HTML + dimensiones | ⚠️ Sin Puppeteer nativo |

---

## Contrato entre Agentes

Cada agente tiene un contrato de input/output estricto. Si un agente cambia su output, solo afecta al siguiente en la cadena.

```
Agente 1 (Strategy)
  output: config estratégica
  ↓ alimenta a:
Agente 2 (Content)
  output: pieces[] con imageIntent
  ↓ alimenta a:
  ├── Agente 3 (Image) — recibe imageIntent + copy
  ├── Agente 4 (Claim Validator) — recibe pieza completa
  └── Agente 5 (Variant) — recibe pieza + instrucción
         ↓ variantes pasan por:
         Agente 4 (Claim Validator) — gate obligatorio

Agente 3 (Image)
  output: 3 prompts → usuario elige → GPT Image 2 → imagen
  ↓ alimenta a:
Agente 6 (HTML Assembly)
  output: HTML completo
  ↓ alimenta a:
Agente 7 (Render)
  output: PNG base64
```

---

## Próximos Pasos (por prioridad)

1. ~~**Agente 2 — Content:** Actualizar `generate-ideas` para que use `imageIntent` en lugar de `imageDirection`~~ ✅ Completado
2. **Agente 4 — Claim Validator:** Crear Edge Function `validate-claim` con el prompt existente
3. **Agente 5 — Variant:** Integrar `masterVariantPrompt` en `generate-variants`
4. **Agente 1 — Strategy:** Conectar `generate-strategy` al flujo principal del frontend
5. **Agente 6 — HTML Assembly:** Evaluar si `generate-design-html` debería ser template puro (sin LLM)
6. **Agente 7 — Render:** Configurar `RENDER_SERVICE_URL` o alternativa
