-- =============================================================================
-- Pipeline V2: Tablas nuevas + campos en business_tenants
-- =============================================================================
-- Crea: narrative_angles, image_library, content_library, content_calendar
-- Modifica: business_tenants (3 campos nuevos)
-- Migra: business_angles → narrative_angles, generated_ideas → content_library
-- Marca deprecated: business_angles, generated_ideas
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. narrative_angles — Ángulos narrativos universales (sin business_id)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.narrative_angles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  funnel_stage text NOT NULL CHECK (funnel_stage IN ('atraccion', 'conexion', 'conversion')),
  prompt_instruction text NOT NULL,
  display_order int DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Poblar 12 ángulos narrativos iniciales
-- ─────────────────────────────────────────────────────────────────────────────

-- ATRACCIÓN (5)
INSERT INTO public.narrative_angles (name, slug, funnel_stage, description, prompt_instruction, display_order) VALUES
('Problema oculto', 'problema-oculto', 'atraccion',
 'Revela algo que el cliente no sabe que le está pasando.',
 'Revela un problema que el cliente no sabe que tiene. No empieces con la solución — empieza con el problema invisible. El cliente debe pensar "no sabía que eso me estaba pasando". Usa datos o situaciones concretas del sector para hacer el problema tangible.',
 0),
('Mito vs realidad', 'mito-vs-realidad', 'atraccion',
 'Confronta una creencia popular con la verdad.',
 'Confronta una creencia común del mercado con la realidad. Estructura: "Mito: [creencia popular]. Realidad: [verdad con matiz]." No uses absolutos — la realidad siempre tiene matices. El objetivo es generar debate y curiosidad.',
 1),
('Error común', 'error-comun', 'atraccion',
 'Señala un error frecuente que cometen las empresas.',
 'Señala un error frecuente que cometen las empresas en su operación financiera o de pagos. El cliente debe pensar "¿yo estoy cometiendo ese error?". Sé específico — no genérico. Usa ejemplos del sector.',
 2),
('Riesgo ignorado', 'riesgo-ignorado', 'atraccion',
 'Alerta sobre un riesgo que el cliente no está midiendo.',
 'Alerta sobre un riesgo que el cliente no está midiendo ni monitoreando. Cuantifica el riesgo en términos de dinero, tiempo o oportunidades perdidas. El objetivo es que el cliente piense "debería estar prestando atención a esto".',
 3),
('Caso hipotético', 'caso-hipotetico', 'atraccion',
 'Plantea un escenario realista que el cliente puede vivir.',
 'Plantea un escenario realista y urgente que el cliente puede vivir mañana. Usa "Imagina que..." o "¿Qué pasa si...?". El escenario debe ser creíble y específico del sector. El objetivo es generar reflexión y urgencia sin vender directamente.',
 4);

-- CONEXIÓN (4)
INSERT INTO public.narrative_angles (name, slug, funnel_stage, description, prompt_instruction, display_order) VALUES
('Antes vs después', 'antes-vs-despues', 'conexion',
 'Contrasta la situación vieja con la nueva.',
 'Contrasta la situación actual del cliente (dolor) con la situación después de usar el producto (promesa). Estructura clara: "Antes: [situación con dolor]. Después: [situación con solución]." Usa datos concretos cuando sea posible.',
 5),
('Checklist educativo', 'checklist-educativo', 'conexion',
 'Aporta valor gratis con una lista accionable.',
 'Crea una lista corta (3-5 puntos) de cosas que el cliente debería revisar, verificar o considerar en su operación. Aporta valor real sin vender directamente. El objetivo es posicionar como experto y generar confianza.',
 6),
('Comparativo tradicional vs moderno', 'comparativo-tradicional', 'conexion',
 'Posiciona como experto comparando lo viejo con lo nuevo.',
 'Compara el modelo tradicional (banco, proceso manual, opacidad) con el modelo moderno (plataforma digital, transparencia, velocidad). Estructura lado a lado. No menciones competidores por nombre — compara modelos, no marcas.',
 7),
('Decisión defendible', 'decision-defendible', 'conexion',
 'Ayuda al CFO a justificar la decisión internamente.',
 'Ayuda al tomador de decisiones (CFO, tesorero, director) a justificar internamente por qué cambiar de proveedor o adoptar una nueva solución. El contenido debe ser un argumento que el cliente pueda usar en una junta. Tono: aliado estratégico.',
 8);

-- CONVERSIÓN (3)
INSERT INTO public.narrative_angles (name, slug, funnel_stage, description, prompt_instruction, display_order) VALUES
('Costo de no actuar', 'costo-de-no-actuar', 'conversion',
 'Muestra qué pierde el cliente cada día que no actúa.',
 'Muestra qué pierde el cliente cada día, semana o mes que no actúa. Cuantifica el costo en términos de margen, tiempo, confianza, oportunidades perdidas o condiciones comerciales deterioradas. El cliente debe sentir urgencia real, no artificial.',
 9),
('Dato duro', 'dato-duro', 'conversion',
 'Número concreto que justifica la acción inmediata.',
 'Presenta un dato numérico concreto y verificable que justifique la acción inmediata. Usa porcentajes, tiempos, montos o comparativas numéricas. El dato debe ser impactante pero creíble. Siempre incluir calificadores ("hasta", "en promedio", "según operación").',
 10),
('Testimonial', 'testimonial', 'conversion',
 'Prueba social con caso real o representativo.',
 'Presenta un caso de éxito real o representativo (sin nombres reales a menos que estén autorizados). Estructura: situación inicial → acción tomada → resultado medible. El objetivo es prueba social: "otros como yo ya lo hicieron y les funcionó".',
 11);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. image_library — Biblioteca de imágenes con etiqueta por rama
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.image_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  image_url text,
  image_base64 text,
  commercial_branch_id uuid REFERENCES public.commercial_branches(id) ON DELETE SET NULL,
  image_type text CHECK (image_type IN ('fotografia', 'infografia', 'mapa_rutas')),
  image_intent text,
  angle_tag text NOT NULL,
  pipeline_run_id uuid,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_image_library_business ON public.image_library(business_id);
CREATE INDEX IF NOT EXISTS idx_image_library_angle ON public.image_library(angle_tag);
CREATE INDEX IF NOT EXISTS idx_image_library_branch ON public.image_library(commercial_branch_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. content_library — Biblioteca de contenido con máquina de estados
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  piece_data jsonb NOT NULL,
  commercial_branch_id uuid REFERENCES public.commercial_branches(id) ON DELETE SET NULL,
  narrative_angle_id uuid REFERENCES public.narrative_angles(id) ON DELETE SET NULL,
  funnel_stage text NOT NULL CHECK (funnel_stage IN ('atraccion', 'conexion', 'conversion')),
  image_id uuid REFERENCES public.image_library(id) ON DELETE SET NULL,
  image_type text CHECK (image_type IN ('fotografia', 'infografia', 'mapa_rutas')),
  status text NOT NULL DEFAULT 'generated' CHECK (status IN (
    'generated', 'approved', 'image_selected',
    'channels_adapted', 'html_assembled', 'rendered',
    'scheduled', 'published'
  )),
  channels_adapted boolean DEFAULT false,
  pipeline_run_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_content_library_business ON public.content_library(business_id);
CREATE INDEX IF NOT EXISTS idx_content_library_branch ON public.content_library(commercial_branch_id);
CREATE INDEX IF NOT EXISTS idx_content_library_angle ON public.content_library(narrative_angle_id);
CREATE INDEX IF NOT EXISTS idx_content_library_status ON public.content_library(status);
CREATE INDEX IF NOT EXISTS idx_content_library_funnel ON public.content_library(funnel_stage);

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. content_calendar — Calendario trimestral con slots por funnel stage
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.content_calendar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  quarter text NOT NULL,
  piece_id uuid REFERENCES public.content_library(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  channel text NOT NULL CHECK (channel IN ('linkedin', 'instagram', 'facebook')),
  funnel_stage text NOT NULL CHECK (funnel_stage IN ('atraccion', 'conexion', 'conversion')),
  status text NOT NULL DEFAULT 'empty' CHECK (status IN (
    'empty', 'assigned', 'ready', 'rendered', 'published'
  )),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_business ON public.content_calendar(business_id);
CREATE INDEX IF NOT EXISTS idx_calendar_quarter ON public.content_calendar(quarter);
CREATE INDEX IF NOT EXISTS idx_calendar_date ON public.content_calendar(scheduled_date);

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. Campos nuevos en business_tenants
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.business_tenants
  ADD COLUMN IF NOT EXISTS posts_per_day int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS calendar_horizon_months int DEFAULT 3,
  ADD COLUMN IF NOT EXISTS posting_strategy jsonb DEFAULT '{
    "distribution": {"atraccion": 3, "conexion": 2, "conversion": 2},
    "rules": ["no_consecutive_conversion", "alternate_narrative_angles", "alternate_commercial_branches"],
    "default_times": {"linkedin": "09:00", "instagram": "12:00", "facebook": "15:00"}
  }'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. Nuevo registro en master_prompts para channel_adapter
-- ─────────────────────────────────────────────────────────────────────────────

-- Solo insertar si no existe ya uno con prompt_type = 'channel_adapter' para Xending
INSERT INTO public.master_prompts (id, business_id, prompt_type, prompt_text, version)
SELECT
  'de000000-0000-0000-0000-000000000010',
  'a0000000-0000-0000-0000-000000000001',
  'channel_adapter',
  'Eres un adaptador de contenido por canal. Tu tarea es tomar una pieza de copy base y adaptarla a 3 canales: LinkedIn (tono consultivo, body 3-4 oraciones, CTA profesional), Instagram (tono directo, body máx 2 oraciones, CTA de acción), Facebook (tono intermedio, body 3 oraciones, CTA contextual). Preserva sin modificación: angle, narrativeAngle, funnelStage, imageIntent, footer, dataBadge y disclaimer.',
  1
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_prompts
  WHERE business_id = 'a0000000-0000-0000-0000-000000000001'
    AND prompt_type = 'channel_adapter'
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 8. Migrar business_angles → narrative_angles (mapeo de funnel_stage)
-- ─────────────────────────────────────────────────────────────────────────────

-- Los ángulos existentes se mapean así:
-- Urgencia Operativa → conversion (ya existe como "Costo de no actuar")
-- Comparativa → conexion (ya existe como "Comparativo tradicional vs moderno")
-- Dato Duro → conversion (ya existe como "Dato duro")
-- Testimonial → conversion (ya existe como "Testimonial")
-- Educativo → conexion (ya existe como "Checklist educativo")
-- Emocional → atraccion (mapeado a "Problema oculto" como más cercano)
-- No se insertan duplicados — los 12 ángulos ya cubren estos conceptos.

-- ─────────────────────────────────────────────────────────────────────────────
-- 9. Migrar generated_ideas → content_library (si existen datos)
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.content_library (
  business_id, piece_data, commercial_branch_id, funnel_stage, status, created_at
)
SELECT
  gi.business_id,
  jsonb_build_object(
    'headline', gi.headline,
    'body', gi.subcopy,
    'cta', gi.cta,
    'imageIntent', COALESCE(gi.image_suggestion, ''),
    'angle', COALESCE(gi.angle, ''),
    'channel', COALESCE(gi.channel, '')
  ),
  gi.branch_id,
  'atraccion', -- default para ideas migradas sin funnel_stage
  CASE gi.status
    WHEN 'approved' THEN 'approved'
    WHEN 'used' THEN 'published'
    WHEN 'rejected' THEN 'generated'
    ELSE 'generated'
  END,
  gi.created_at
FROM public.generated_ideas gi
WHERE NOT EXISTS (
  -- Evitar duplicados si se ejecuta más de una vez
  SELECT 1 FROM public.content_library cl
  WHERE cl.business_id = gi.business_id
    AND cl.piece_data->>'headline' = gi.headline
    AND cl.created_at = gi.created_at
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 10. Marcar tablas deprecated
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE public.business_angles IS 'DEPRECATED — migrado a narrative_angles. No usar para nuevas funcionalidades.';
COMMENT ON TABLE public.generated_ideas IS 'DEPRECATED — migrado a content_library. No usar para nuevas funcionalidades.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 11. RLS para las 4 tablas nuevas
-- ─────────────────────────────────────────────────────────────────────────────

-- narrative_angles: lectura para todos los autenticados (universales)
ALTER TABLE public.narrative_angles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read narrative_angles"
  ON public.narrative_angles
  FOR SELECT
  TO authenticated
  USING (true);

-- image_library: por business_id
ALTER TABLE public.image_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view images"
  ON public.image_library FOR SELECT TO authenticated
  USING (public.user_is_member_of(business_id));

CREATE POLICY "Members can create images"
  ON public.image_library FOR INSERT TO authenticated
  WITH CHECK (public.user_is_member_of(business_id));

CREATE POLICY "Members can update images"
  ON public.image_library FOR UPDATE TO authenticated
  USING (public.user_is_member_of(business_id));

-- content_library: por business_id
ALTER TABLE public.content_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view content"
  ON public.content_library FOR SELECT TO authenticated
  USING (public.user_is_member_of(business_id));

CREATE POLICY "Members can create content"
  ON public.content_library FOR INSERT TO authenticated
  WITH CHECK (public.user_is_member_of(business_id));

CREATE POLICY "Members can update content"
  ON public.content_library FOR UPDATE TO authenticated
  USING (public.user_is_member_of(business_id));

-- content_calendar: por business_id
ALTER TABLE public.content_calendar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view calendar"
  ON public.content_calendar FOR SELECT TO authenticated
  USING (public.user_is_member_of(business_id));

CREATE POLICY "Members can create calendar slots"
  ON public.content_calendar FOR INSERT TO authenticated
  WITH CHECK (public.user_is_member_of(business_id));

CREATE POLICY "Members can update calendar slots"
  ON public.content_calendar FOR UPDATE TO authenticated
  USING (public.user_is_member_of(business_id));

-- ─────────────────────────────────────────────────────────────────────────────
-- 12. Verificación
-- ─────────────────────────────────────────────────────────────────────────────

SELECT 'narrative_angles' AS tabla, count(*) AS registros FROM public.narrative_angles
UNION ALL
SELECT 'image_library', count(*) FROM public.image_library
UNION ALL
SELECT 'content_library', count(*) FROM public.content_library
UNION ALL
SELECT 'content_calendar', count(*) FROM public.content_calendar;
