-- =============================================================================
-- Image Stock Studio — foundation
-- =============================================================================
-- Adds a `collection` classifier to design_images so generated images can be
-- filed into reusable stock libraries (slide, icon_3d, professional, ...) and
-- picked from any process (pipeline, presentations, design studio).
--
-- Also seeds reusable image-style master prompts in master_prompts using
-- prompt_type = 'image_style:<key>'. These are editable from the UI (manual
-- + chat) and consumed by generate-design-image as the step-1 system prompt.
--
-- Depends on: 20260424_create_design_images.sql,
--             20260501_create_campaign_architecture.sql (master_prompts),
--             20260501_create_business_tenants.sql
-- Non-destructive: only ADD COLUMN IF NOT EXISTS + guarded INSERTs.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. design_images.collection — stock library classifier
-- ─────────────────────────────────────────────────────────────────────────────
-- 'design'       → existing insta/linkedin content images (default, untouched)
-- 'slide'        → images for presentation slides
-- 'icon_3d'      → 3D iconography (Tesla/Apple style)
-- 'professional' → professional/editorial photography
-- (extensible — any future generator adds its own key)

ALTER TABLE public.design_images
  ADD COLUMN IF NOT EXISTS collection text NOT NULL DEFAULT 'design';

CREATE INDEX IF NOT EXISTS idx_design_images_collection
  ON public.design_images(collection);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. master_prompts.prompt_type — defensive only
-- ─────────────────────────────────────────────────────────────────────────────
-- The column already exists in the live DB, so this is a NO-OP there (ADD COLUMN
-- IF NOT EXISTS is skipped entirely and never touches existing rows).
-- It is added WITHOUT NOT NULL/DEFAULT on purpose: if this ever runs on a DB
-- where the column is missing, existing rows stay untouched (prompt_type NULL)
-- instead of being back-filled/mislabeled. The seed INSERT below always sets
-- prompt_type explicitly, so a nullable column is sufficient.

ALTER TABLE public.master_prompts
  ADD COLUMN IF NOT EXISTS prompt_type text;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Seed starter image-style prompts (prompt_type = 'image_style:<key>')
-- ─────────────────────────────────────────────────────────────────────────────
-- One row per (existing tenant, style). Seeds for EVERY row in business_tenants
-- (no hardcoded UUIDs) so it works regardless of tenant ids and never hits a
-- foreign-key error. STARTER prompts, editable from the UI (manual + chat).
-- Idempotent: only inserts when the (tenant, style) pair is missing.

INSERT INTO public.master_prompts (business_id, prompt_type, prompt_text, version)
SELECT bt.id, s.prompt_type, s.prompt_text, 1
FROM public.business_tenants bt
CROSS JOIN (VALUES
  (
    'image_style:slide',
    'You are a creative director for premium corporate presentation slide imagery (editorial, keynote style). You receive a subject or idea and return one production-ready prompt for gpt-image-2. The image must be clean and cinematic, with generous negative space for text overlay, balanced composition, soft premium lighting, and commercial quality. No text, no logos, no watermarks, no clutter. Return only valid JSON with keys: prompt_final, negative_instructions, aspect_ratio, recommended_use, creative_rationale. [STARTER PROMPT - edit freely]'
  ),
  (
    'image_style:icon_3d',
    'You are a creative director specialized in 3D iconography in the Tesla and Apple product-render style. You receive an object or concept and return one production-ready prompt for gpt-image-2. The image must show a single centered 3D object with soft matte materials and clean surfaces, soft studio lighting, a neutral clean background (no scenes), gentle shadows, minimalist premium aesthetic, high detail. No text, no logos, no clutter. Return only valid JSON with keys: prompt_final, negative_instructions, aspect_ratio, recommended_use, creative_rationale. [STARTER PROMPT - edit freely]'
  ),
  (
    'image_style:professional',
    'You are a creative director and advertising photographer. You receive a subject or scene and return one production-ready prompt for gpt-image-2. Hyperrealistic editorial photography, believable business people and scenes, soft cinematic lighting, shallow depth of field, natural colors, premium quality suitable for paid ads, with generous negative space for copy. No text, no third-party logos, no misspelled words. Return only valid JSON with keys: prompt_final, negative_instructions, aspect_ratio, recommended_use, creative_rationale. [STARTER PROMPT - edit freely]'
  )
) AS s(prompt_type, prompt_text)
WHERE NOT EXISTS (
  SELECT 1 FROM public.master_prompts mp
  WHERE mp.business_id = bt.id
    AND mp.prompt_type = s.prompt_type
);
