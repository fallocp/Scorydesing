# Design Studio — Arquitectura Completa

## Resumen

El Design Studio es un sistema de generación de piezas publicitarias con IA que permite crear mockups visuales, convertirlos a HTML, iterar con feedback en lenguaje natural, y guardarlos como templates reutilizables. Todo aislado por tenant (multi-marca).

---

## Flujo del Usuario (End-to-End)

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         DESIGN STUDIO FLOW                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. CONFIGURACIÓN                                                        │
│     ├── Cargar Brand Palette (colores, fonts, logo, disclaimer)          │
│     ├── Validar campos requeridos (primary_color, logo_url)              │
│     └── Restaurar sesión activa (si existe)                              │
│                                                                          │
│  2. INPUT (elegir modo)                                                  │
│     ├── Modo A: Selección Visual                                         │
│     │   ├── Background (dark-navy, light-cream, white-minimal, turquoise)│
│     │   ├── Visual Style (minimalist, glassmorphism, bold, financial...) │
│     │   ├── Content Type (stat, news, educational, promo, comparison...) │
│     │   ├── Hero Element (big-number, main-photo, icon, floating-badge)  │
│     │   ├── Platform (instagram-story, instagram-post, facebook, etc.)   │
│     │   ├── Content Mode (free / branch / custom)                        │
│     │   │   ├── Branch → carga content_ingredients de commercial_branches│
│     │   │   └── Custom → texto libre del usuario                         │
│     │   └── Piece Copy + Image Prompt (opcional, para modo branch)       │
│     │                                                                    │
│     └── Modo B: Imagen de Referencia                                     │
│         ├── Upload imagen (PNG/JPG/WEBP/PDF, max 10MB)                   │
│         └── Descripción de adaptación                                    │
│                                                                          │
│  3. GENERACIÓN DE MOCKUP                                                 │
│     ├── Llamar Edge Function: generate-design-mockups                    │
│     ├── GPT Image 2 genera la imagen (1 por request)                     │
│     ├── Auto-save a Supabase Storage + design_mockups                    │
│     └── Mostrar en galería (acumulativo)                                 │
│                                                                          │
│  4. ITERACIÓN DE MOCKUP (opcional)                                       │
│     ├── Chat conversacional (MockupIterationChat)                        │
│     ├── Acumular feedback → regenerar con correcciones                   │
│     ├── interpret-feedback interpreta cambios                            │
│     └── Nueva imagen se agrega a la galería                              │
│                                                                          │
│  5. CONVERSIÓN A HTML                                                    │
│     ├── Seleccionar mockup de la galería                                 │
│     ├── Llamar Edge Function: generate-design-html                       │
│     ├── GPT-4o Vision analiza la imagen → genera HTML pixel-perfect      │
│     └── Preview en iframe escalado                                       │
│                                                                          │
│  6. ITERACIÓN DE HTML (max 10 iteraciones)                               │
│     ├── Feedback en lenguaje natural ("más oscuro", "CTA más grande")    │
│     ├── GPT-4o refina el HTML existente                                  │
│     └── Historial de versiones con rollback visual                       │
│                                                                          │
│  7. GUARDAR COMO TEMPLATE                                                │
│     ├── convertToTemplate() detecta slots (headline, subcopy, cta, etc.) │
│     ├── Reemplaza contenido dinámico con {{placeholders}}                │
│     ├── Guarda en custom_templates                                       │
│     └── Marca sesión como completada                                     │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Base de Datos (Supabase PostgreSQL)

### Diagrama de Relaciones

```
business_tenants (tenant principal)
  │
  ├── design_sessions (estado de sesión del usuario)
  │     └── Campos: selections, mockups[], html_history[], iteration_count
  │
  ├── design_mockups (imágenes generadas persistidas)
  │     ├── image_url → Supabase Storage
  │     ├── parent_mockup_id → self-reference (cadena de iteraciones)
  │     └── iteration_feedback (qué pidió el usuario)
  │
  ├── design_feedback (likes, dislikes, chat, preferencias)
  │     ├── mockup_id → design_mockups (opcional)
  │     └── interpreted_changes: { increase: [], decrease: [] }
  │
  ├── custom_templates (templates guardados)
  │     ├── html_template (HTML con {{placeholders}})
  │     └── slots[] (metadata de cada placeholder)
  │
  └── commercial_branches (ramas comerciales con content_ingredients)
        └── strategic_config.content_ingredients (por ángulo)
```

### Tablas

#### `design_sessions`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| business_id | UUID FK → business_tenants | Aislamiento de tenant |
| user_id | UUID FK → auth.users | |
| status | TEXT | 'active' / 'completed' / 'discarded' |
| input_mode | TEXT | 'visual' / 'reference' |
| selections | JSONB | VisualSelections completo |
| reference_image_url | TEXT | Storage path (Modo B) |
| reference_description | TEXT | |
| platform | TEXT | Plataforma seleccionada |
| mockups | JSONB | GeneratedMockup[] (base64 + prompt) |
| selected_mockup_index | INTEGER | |
| current_html | TEXT | HTML actual |
| html_history | JSONB | HtmlIteration[] |
| iteration_count | INTEGER | Max 10 (constraint) |
| created_at / updated_at | TIMESTAMPTZ | |

#### `design_mockups`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| business_id | UUID FK | |
| created_by | UUID FK → auth.users | |
| image_url | TEXT | URL pública en Storage |
| platform | TEXT | |
| selections | JSONB | Selecciones usadas |
| prompt_used | TEXT | Prompt completo enviado a GPT Image |
| parent_mockup_id | UUID FK → self | Mockup padre (iteración) |
| iteration_feedback | TEXT | Feedback que generó esta iteración |
| status | TEXT | 'saved' / 'discarded' / 'converted' |
| created_at | TIMESTAMPTZ | |

#### `design_feedback`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| business_id | UUID FK | |
| mockup_id | UUID FK → design_mockups | Opcional |
| feedback_type | TEXT | 'like' / 'dislike' / 'chat' / 'preference' |
| message | TEXT | Texto del usuario (para chat) |
| interpreted_changes | JSONB | `{ increase: [...], decrease: [...] }` |
| prompt_used | TEXT | Prompt del mockup evaluado |
| selections | JSONB | Selecciones del mockup evaluado |
| created_by | UUID FK | |
| created_at | TIMESTAMPTZ | |

#### `custom_templates`
| Columna | Tipo | Descripción |
|---------|------|-------------|
| id | UUID PK | |
| business_id | UUID FK | |
| created_by | UUID FK | |
| name | TEXT | Nombre del template |
| platform | TEXT | |
| html_template | TEXT | HTML con `{{placeholders}}` |
| slots | JSONB | TemplateSlot[] |
| thumbnail_url | TEXT | |
| source_session_id | UUID FK → design_sessions | |
| is_active | BOOLEAN | |

### Row Level Security (RLS)

Todas las tablas tienen RLS habilitado. El acceso se valida via `user_business_memberships`:

```sql
-- Patrón común en todas las políticas:
EXISTS (
  SELECT 1 FROM user_business_memberships ubm
  WHERE ubm.business_id = <tabla>.business_id
    AND ubm.user_id = auth.uid()
)
```

### Storage

- **Bucket**: `design-images`
- **Path pattern**: `{business_id}/mockups/{timestamp}-{random}.png`
- Las imágenes se suben como PNG desde base64

---

## Edge Functions (Supabase Deno)

### 1. `generate-design-mockups`

**Propósito**: Genera imágenes publicitarias usando GPT Image 2.

**Input**:
```typescript
{
  business_id: string
  brand_palette: BrandPalette
  mode: 'visual' | 'reference'
  platform: PlatformFormat
  // Modo Visual:
  selections?: VisualSelections
  content_mode?: 'free' | 'branch' | 'custom'
  branch_ingredients?: BranchContentIngredients
  custom_idea?: string
  piece_copy?: { headline, body?, cta?, punchline? }
  piece_image_prompt?: { type, prompt }
  // Modo Reference:
  reference_image_base64?: string
  reference_description?: string
  // Iteración:
  iteration_feedback?: string
  previous_prompt?: string
}
```

**Output**: `{ mockups: [{ index, image_base64, prompt_used }] }`

**Flujo interno**:
1. Validar inputs
2. Fetch learned preferences de `design_feedback` (likes/dislikes/chat)
3. Construir prompt (visual o reference)
4. Si hay `iteration_feedback`, append correcciones al prompt
5. Llamar OpenAI `gpt-image-2` con size según plataforma
6. Retornar imagen en base64

**Tamaños por plataforma**:
| Plataforma | Size OpenAI |
|-----------|-------------|
| instagram-story | 1024x1536 |
| instagram-post | 1024x1024 |
| facebook-post / linkedin-post / banner | 1536x1024 |

**Learned Preferences**: Consulta los últimos 10 likes, 10 dislikes, y 10 chats del business. Extrae patrones (fondos, estilos, tipos) y los inyecta como sección "PREFERENCIAS APRENDIDAS" en el prompt.

---

### 2. `generate-design-html`

**Propósito**: Convierte mockup a HTML (GPT-4o Vision) o refina HTML existente.

**Dos flujos**:

**A) Mockup → HTML (inicial)**:
- System prompt con dimensiones exactas, identidad de marca, reglas de generación
- GPT-4o Vision analiza la imagen y genera HTML pixel-perfect
- Post-process: fuerza URL correcta del logo

**B) HTML → HTML refinado (iteración)**:
- System prompt de refinamiento
- Recibe HTML actual + feedback del usuario
- GPT-4o aplica solo los cambios solicitados

**También maneja** el flujo legacy de generación diaria (template-based con copy inyectado).

---

### 3. `interpret-feedback`

**Propósito**: Convierte feedback humano en deltas estructurados de aprendizaje.

**Input**:
```typescript
{
  business_id: string
  feedback_type: 'explicit' | 'pattern'
  content: string | PatternData
}
```

**Output**:
```typescript
{
  success: true
  delta: { increase: string[], decrease: string[] }
  profile_version: number
  learning_delta_id: string
}
```

**Flujo**:
1. Autenticar usuario + verificar membresía
2. Leer `creative_profiles` actual del business
3. GPT interpreta el feedback → `{ increase, decrease }`
4. Crear nueva versión de `creative_profiles` (merge)
5. Insertar `learning_delta` con contexto

---

## Frontend

### Stack
- **React** + TypeScript
- **Zustand** (state management con devtools)
- **TanStack Query** (server state, caching, mutations)
- **Supabase Client** (auth, DB, storage, functions)
- **shadcn/ui** (componentes)

### Arquitectura de Componentes

```
DesignStudioPage (orquestador principal)
├── BrandPalettePreview
├── Tabs (Visual / Reference)
│   ├── VisualSelector
│   ├── ContentModeSelector
│   ├── PieceCopyEditor
│   └── ReferenceImageUploader
├── MockupGallery
│   └── MockupIterationChat (modal)
├── SavedMockupsGrid (mockups de DB)
├── HtmlPreviewPanel (iframe + feedback)
├── DesignFeedbackChat (preferencias globales)
└── TemplateSaveDialog
```

### State Management (Zustand Store)

```typescript
// Estado principal
{
  sessionId, sessionStatus,
  brandPalette,
  inputMode: 'visual' | 'reference',
  selections: VisualSelections,
  referenceImage, referenceImagePreview, referenceDescription,
  selectedPlatform,
  mockups: GeneratedMockup[],
  selectedMockupIndex,
  currentHtml,
  htmlHistory: HtmlIteration[],
  iterationCount,
  isGeneratingMockups, isGeneratingHtml, isSaving, error
}
```

### Hooks

| Hook | Función |
|------|---------|
| `useDesignStudioSession` | Persistir/restaurar sesión en DB |
| `useGenerateMockups` | Invocar generate-design-mockups |
| `useGenerateDesignHtmlFromMockup` | Invocar generate-design-html |
| `useSaveMockup` | Upload a Storage + insert en design_mockups |
| `useSavedMockups` | Fetch mockups guardados del business |
| `useSaveCustomTemplate` | Guardar template en custom_templates |
| `useDesignStudioBranches` | Fetch ramas comerciales + extractIngredients |
| `useGenerateIdeas` | Generar copy (headline/subcopy/CTA) |
| `useLikeMockup` / `useDislikeMockup` | Feedback de like/dislike |
| `useSendChatFeedback` | Chat de preferencias → interpret-feedback |
| `useChatFeedbackHistory` | Historial de chat de preferencias |
| `useRecentFeedback` | Mapa mockup_id → like/dislike |

---

## Sistema de Aprendizaje (Learned Preferences)

```
┌──────────────────────────────────────────────────────────────┐
│                    FEEDBACK LOOP                               │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  Usuario da feedback                                          │
│    ├── 👍 Like mockup → design_feedback (type: 'like')        │
│    ├── 👎 Dislike mockup → design_feedback (type: 'dislike')  │
│    ├── 💬 Chat preferencia → interpret-feedback → delta       │
│    └── 🔄 Iteración → design_feedback (type: 'chat')          │
│                                                               │
│  En la próxima generación:                                    │
│    1. generate-design-mockups consulta design_feedback         │
│    2. Extrae patrones de likes (PREFIERO) y dislikes (EVITAR) │
│    3. Inyecta como sección en el prompt                       │
│    4. GPT Image genera respetando preferencias                │
│                                                               │
│  Resultado: cada generación es mejor que la anterior          │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## Content Ingredients (Ramas Comerciales)

Cada `commercial_branch` tiene `strategic_config.content_ingredients` con datos por ángulo:

```json
{
  "content_ingredients": {
    "default": { "headlines": [...], "sublines": [...], "ctas": [...], "big_stats": [...], "photo_direction": "..." },
    "comparativa": { ... },
    "dato_duro": { ... },
    "educativo": { ... }
  }
}
```

Cuando el usuario selecciona una rama + content type, `extractIngredients()` resuelve el ángulo correcto y lo pasa al prompt de generación.

**Ramas actuales (Xending)**:
- Velocidad - Mismo Día
- Ahorro / Costos Ocultos
- Cuenta Multidivisa
- Cobertura Cambiaria
- Pagos con Orden
- Banco vs Xending

---

## Template Converter

Cuando el usuario guarda un HTML como template:

1. `convertToTemplate()` detecta contenido dinámico via regex:
   - `<h1>/<h2>` → `{{headline}}`
   - `<p>` (no disclaimer) → `{{subcopy}}`
   - `<button>` / `<a.cta>` → `{{cta}}`
   - `<img src>` → `{{imageUrl}}`
   - `<small>` / `.disclaimer` → `{{disclaimer}}`

2. Retorna `{ template_html, detected_slots[] }`

3. `hydrateTemplate()` reemplaza placeholders con datos reales para renderizar.

---

## Plataformas Soportadas

| Plataforma | Dimensiones | Aspect Ratio |
|-----------|-------------|--------------|
| instagram-story | 1080 × 1920 | 9:16 (vertical) |
| instagram-post | 1080 × 1080 | 1:1 (cuadrado) |
| facebook-post | 1200 × 628 | ~1.91:1 (landscape) |
| linkedin-post | 1200 × 628 | ~1.91:1 (landscape) |
| banner | 1920 × 1080 | 16:9 (wide) |

---

## Errores Conocidos y Fixes Pendientes

| Error | Causa | Fix |
|-------|-------|-----|
| 400 en POST design_mockups | Columnas `parent_mockup_id` e `iteration_feedback` no existían | Migración `20260526_add_mockup_iteration_columns.sql` |
| CORS en interpret-feedback | Edge function no deployada o sin CORS headers | Deploy la función |
| Mockups no se guardan silenciosamente | `saveMockup.mutate` es fire-and-forget sin `onError` visible | Agregar toast de error |

---

## Dependencias Externas

| Servicio | Uso | Modelo |
|----------|-----|--------|
| OpenAI | Generación de imágenes | gpt-image-2 |
| OpenAI | Mockup→HTML + iteración | gpt-4o (vision) |
| OpenAI | Interpretación de feedback | gpt-5.4-mini |
| OpenAI | Generación de copy | gpt-5.4-mini |
| Supabase | Auth, DB, Storage, Edge Functions | — |

---

## Seguridad

- **Multi-tenant**: RLS en todas las tablas via `user_business_memberships`
- **Auth**: JWT de Supabase en cada request
- **Storage**: Paths con `business_id` como prefijo
- **CORS**: Headers configurados en cada Edge Function
- **API Keys**: En Supabase secrets (nunca en código)
