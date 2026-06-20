-- =============================================================================
-- Seed: trigger_templates — Xending pre-configured Quick Fire triggers
-- =============================================================================
-- Depends on: 20260526_create_trigger_templates.sql
--
-- Xending business_id: a0000000-0000-0000-0000-000000000001
--
-- These are common fintech triggers for reactive content generation.
-- Each trigger defines a pre-configured shortcut for Quick Fire mode:
--   - What content type to use
--   - What angle/approach to take
--   - A copy template with {{placeholders}} for dynamic data
--   - Which platforms to auto-generate for
--   - What image strategy to apply
-- =============================================================================

-- 1. Fed sube tasas (Fed raises rates)
INSERT INTO public.trigger_templates (
  business_id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Fed sube tasas',
  'breaking-news',
  'cobertura',
  '{
    "headline_pattern": "La Fed subió tasas — {{impacto}}",
    "subcopy_pattern": "El mercado reacciona. Tu estrategia financiera no tiene que esperar. Te explicamos qué significa para tu negocio y cómo proteger tu margen.",
    "cta": "Protege tu margen →"
  }'::jsonb,
  ARRAY['instagram-story', 'instagram-post', 'linkedin-post', 'facebook-post', 'banner'],
  'generate_new'
)
ON CONFLICT (business_id, name) DO NOTHING;

-- 2. Dólar se dispara (Dollar spikes)
INSERT INTO public.trigger_templates (
  business_id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Dólar se dispara',
  'market-update',
  'velocidad',
  '{
    "headline_pattern": "USD/MXN {{valor}} — {{direccion}}",
    "subcopy_pattern": "El tipo de cambio se movió fuerte. No dejes que tu margen absorba el golpe. Actúa ahora con cobertura inteligente.",
    "cta": "Cotiza cobertura →"
  }'::jsonb,
  ARRAY['instagram-story', 'linkedin-post'],
  'use_provided'
)
ON CONFLICT (business_id, name) DO NOTHING;

-- 3. Evento de mercado (Market event)
INSERT INTO public.trigger_templates (
  business_id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Evento de mercado',
  'event-special',
  'confianza',
  '{
    "headline_pattern": "{{evento}} — Lo que significa para tu negocio",
    "subcopy_pattern": "Los mercados se mueven. Tu estrategia también debería. Descubre cómo este evento impacta tus operaciones internacionales.",
    "cta": "Habla con un experto →"
  }'::jsonb,
  ARRAY['linkedin-post', 'facebook-post'],
  'generate_new'
)
ON CONFLICT (business_id, name) DO NOTHING;

-- 4. Dato del día (Stat of the day)
INSERT INTO public.trigger_templates (
  business_id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Dato del día',
  'stat-of-the-day',
  'ahorro',
  '{
    "headline_pattern": "{{dato}} — ¿Sabías esto?",
    "subcopy_pattern": "Un dato que puede cambiar cómo manejas tus finanzas internacionales. La información correcta en el momento correcto marca la diferencia.",
    "cta": "Descubre más →"
  }'::jsonb,
  ARRAY['instagram-story', 'instagram-post'],
  'use_stock'
)
ON CONFLICT (business_id, name) DO NOTHING;

-- 5. Alerta de mercado (Market alert)
INSERT INTO public.trigger_templates (
  business_id, name, content_type, default_angle, copy_template, auto_platforms, image_strategy
) VALUES (
  'a0000000-0000-0000-0000-000000000001',
  'Alerta de mercado',
  'breaking-news',
  'velocidad',
  '{
    "headline_pattern": "⚡ Alerta: {{alerta}}",
    "subcopy_pattern": "Movimiento importante en los mercados. Tu ventana de oportunidad es ahora. No esperes a que el spread se amplíe.",
    "cta": "Actúa ahora →"
  }'::jsonb,
  ARRAY['instagram-story', 'instagram-post', 'linkedin-post', 'facebook-post', 'banner'],
  'generate_new'
)
ON CONFLICT (business_id, name) DO NOTHING;
