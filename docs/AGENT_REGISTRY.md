# Agent Registry — SCORY Design

> Referencia rápida de todos los agentes del sistema.
> Cada agente es independiente, tiene un contrato estricto, y NO conoce a los demás.

---

## Reglas de Organización

1. **Un agente = una carpeta** en `supabase/functions/`
2. **Un agente = un propósito** — si hace dos cosas, son dos agentes
3. **Contratos en `_shared/pipeline-types.ts`** — todo input/output está tipado ahí
4. **El orquestador coordina** — los agentes NUNCA se llaman entre sí
5. **Nunca mezclar responsabilidades** — si un agente empieza a hacer algo que no le toca, crear uno nuevo

---

## Agentes de Producción (Pipeline)

| # | Nombre | Carpeta | Propósito | Input | Output |
|---|--------|---------|-----------|-------|--------|
| 1 | Strategy | `generate-strategy/` | Convertir brief en config estratégica | Brief del negocio | StrategicConfig |
| 2 | Content | `generate-ideas/` | Generar ideas de copy con imageIntent | Config estratégica + ángulo | ContentIdea[] |
| 3 | Image | `generate-design-image/` | Crear prompts de imagen o generar imagen | imageIntent + copy | 3 prompts o imageBase64 |
| 4 | Claim Validator | `validate-claim/` | Validar compliance de piezas | Pieza completa | riskLevel + issues |
| 5 | Variant | `generate-variants/` | Optimizar copy sin cambiar estrategia | Pieza + instrucción | CopyVariant[] |
| 6 | Channel Adapter | `adapt-channel/` | Adaptar pieza a diferentes canales | Pieza base + canales | ChannelAdaptation[] |
| 7 | HTML Assembly | `generate-design-html/` | Ensamblar HTML final con template | Copy + imagen + brand | HTML string |
| 8 | Render | `render-design-png/` | Convertir HTML en PNG | HTML + dimensiones | PNG base64 |

---

## Agentes de Inteligencia (por crear)

| # | Nombre | Carpeta | Propósito | Input | Output |
|---|--------|---------|-----------|-------|--------|
| 9 | Feedback Interpreter | `interpret-feedback/` | Convertir acciones del usuario en learning deltas | Aprobaciones/rechazos | LearningDelta |
| 10 | Brand Intelligence | `analyze-brand-assets/` | Analizar assets visuales y detectar estilo | Imágenes/PDFs/URLs | BrandInterpretation |
| 11 | Web Scraper | `scrape-brand-presence/` | Analizar presencia web/social | URLs | WebAnalysis + SocialAnalysis |
| 12 | Quick Fire | `quick-fire/` | Generar contenido reactivo instantáneo | Imagen + texto + business_id | QuickFireOutput |
| 13 | Template Generator | `generate-brand-templates/` | Crear templates HTML desde cero para una marca nueva | Brand identity + visual style | Set de templates HTML |

---

## Coordinadores

| Nombre | Carpeta | Propósito |
|--------|---------|-----------|
| Pipeline Orchestrator | `pipeline-orchestrator/` | Coordinar la cadena de agentes en secuencia |

---

## Flujo de datos (quién alimenta a quién)

```
Usuario → Orchestrator
              │
              ├→ Strategy Agent → config estratégica
              │                        │
              ├→ Content Agent ←────────┘ → ideas[]
              │                                │
              ├→ Claim Validator ←──────────────┘ → ideas validadas
              │                                        │
              ├→ Image Agent ←─────────────────────────┘ → imagen
              │                                              │
              ├→ HTML Assembly ←────────────────────────────┘ → HTML
              │                                                   │
              └→ Render ←─────────────────────────────────────────┘ → PNG
```

---

## Código compartido (_shared/)

| Archivo | Qué hace |
|---------|----------|
| `pipeline-types.ts` | Contratos de input/output de TODOS los agentes |
| `fetchBusinessContext.ts` | Lee brand identity, compliance, master prompt de la DB |
| `buildBranchContextBlock.ts` | Construye contexto narrativo desde prompt_kit |
| `interpolateTemplate.ts` | Reemplaza {{variables}} en templates |
| `validateResponse.ts` | Valida JSON de respuestas AI |

---

## Cómo agregar un agente nuevo

1. Crear carpeta: `supabase/functions/nombre-del-agente/`
2. Crear `index.ts` con la lógica
3. Definir input/output en `_shared/pipeline-types.ts`
4. Documentar en esta tabla
5. Si es parte del pipeline, conectar en el orchestrator

---

## API Model por Agente

| Agente | Modelo AI | Notas |
|--------|-----------|-------|
| Strategy | gpt-5.4-mini | Texto |
| Content | gpt-5.4-mini | Texto |
| Image (prompts) | gpt-5.4-mini | Texto |
| Image (generación) | gpt-image-2 | Imagen |
| Claim Validator | gpt-5.4-mini | Texto |
| Variant | gpt-5.4-mini | Texto |
| Channel Adapter | gpt-5.4-mini | Texto |
| HTML Assembly | **Sin LLM** (template engine) | Futuro: sin API call |
| Render | **Sin LLM** (Puppeteer) | Solo renderiza |
| Feedback Interpreter | gpt-5.4-mini | Texto |
| Brand Intelligence | gpt-5.4-mini (vision) | Analiza imágenes |
| Quick Fire | gpt-5.4-mini | Texto + orquestación |
