-- =============================================================================
-- Migration: Create template_registry table
-- =============================================================================
-- Stores parametrized HTML templates with visual tone and layout variations.
-- NULL business_id = global/starter templates available to all brands.
-- Specific business_id = brand-specific templates (e.g., Xending's).
--
-- Tone mapping from legacy designTemplates.ts:
--   card-light    → light
--   card-dark     → dark
--   card-coral    → medium
--   card-turquesa → medium
--   card-navy     → dark
--
-- All existing templates become layout_variation = 'A' (current layout).
-- =============================================================================

-- =============================================================================
-- 1. Create template_registry table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.template_registry (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID REFERENCES public.business_tenants(id), -- NULL = global/starter

  -- Identification
  content_type TEXT NOT NULL,
  platform TEXT NOT NULL,
  visual_tone TEXT NOT NULL,
  layout_variation TEXT NOT NULL DEFAULT 'A',

  -- Template content
  html_template TEXT NOT NULL,       -- HTML with {{placeholders}}
  css_overrides TEXT,                -- Additional CSS for this variant
  slots JSONB NOT NULL DEFAULT '[]', -- Slot definitions (TemplateSlot[])

  -- Metadata
  preview_url TEXT,                  -- URL for static preview
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_content_type CHECK (content_type IN (
    'breaking-news', 'corporate', 'market-update', 'stat-of-the-day', 'event-special'
  )),
  CONSTRAINT valid_platform CHECK (platform IN (
    'instagram-story', 'instagram-post', 'linkedin-post', 'facebook-post', 'banner'
  )),
  CONSTRAINT valid_visual_tone CHECK (visual_tone IN ('light', 'medium', 'dark')),
  CONSTRAINT valid_layout_variation CHECK (layout_variation IN ('A', 'B', 'C'))
);

-- Unique constraint for brand-specific templates (business_id NOT NULL)
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_registry_unique_brand
  ON public.template_registry (business_id, content_type, platform, visual_tone, layout_variation)
  WHERE business_id IS NOT NULL;

-- Unique constraint for global/starter templates (business_id IS NULL)
-- PostgreSQL UNIQUE constraints treat NULLs as distinct, so we need a partial index
CREATE UNIQUE INDEX IF NOT EXISTS idx_template_registry_unique_global
  ON public.template_registry (content_type, platform, visual_tone, layout_variation)
  WHERE business_id IS NULL;

-- =============================================================================
-- 2. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_template_registry_business_active
  ON public.template_registry (business_id, is_active, content_type, platform)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_template_registry_global_active
  ON public.template_registry (content_type, platform, visual_tone, layout_variation)
  WHERE business_id IS NULL AND is_active = true;

-- =============================================================================
-- 3. Auto-update updated_at trigger
-- =============================================================================
CREATE TRIGGER set_template_registry_updated_at
  BEFORE UPDATE ON public.template_registry
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4. Row Level Security
-- =============================================================================
ALTER TABLE public.template_registry ENABLE ROW LEVEL SECURITY;

-- Policy: Anyone authenticated can read global (starter) templates
CREATE POLICY "Authenticated users can read global templates"
  ON public.template_registry
  FOR SELECT
  TO authenticated
  USING (business_id IS NULL);

-- Policy: Business members can read their own brand-specific templates
CREATE POLICY "Members can read own business templates"
  ON public.template_registry
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
    )
  );

-- Policy: Business owners/admins can insert brand-specific templates
CREATE POLICY "Owners and admins can insert business templates"
  ON public.template_registry
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IS NOT NULL
    AND business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

-- Policy: Business owners/admins can update their own templates
CREATE POLICY "Owners and admins can update business templates"
  ON public.template_registry
  FOR UPDATE
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

-- Policy: Business owners can delete their own templates
CREATE POLICY "Owners can delete business templates"
  ON public.template_registry
  FOR DELETE
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );
