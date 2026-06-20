-- =============================================================================
-- Trigger Templates — Pre-configured Quick Fire Shortcuts
-- =============================================================================
-- Creates: trigger_templates
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships)
-- Purpose: Store pre-configured trigger shortcuts for Quick Fire mode.
--          Each trigger template defines what content type to use, what angle,
--          a copy template pattern, which platforms to auto-generate for,
--          and what image strategy to apply.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. trigger_templates table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE trigger_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id) ON DELETE CASCADE,

  -- Identification
  name TEXT NOT NULL,                -- Human-readable name: "Fed sube tasas", "Dólar se dispara"

  -- Content configuration
  content_type TEXT NOT NULL,        -- breaking-news, market-update, event-special, stat-of-the-day
  default_angle TEXT NOT NULL,       -- cobertura, velocidad, confianza, ahorro, etc.

  -- Copy template patterns (headline/subcopy with {{placeholders}})
  copy_template JSONB NOT NULL,      -- { headline_pattern, subcopy_pattern, cta }

  -- Platform auto-selection
  auto_platforms TEXT[] NOT NULL DEFAULT '{}',  -- ['instagram-story', 'linkedin-post', ...]

  -- Image strategy
  image_strategy TEXT NOT NULL DEFAULT 'use_provided',

  -- Metadata
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_content_type CHECK (content_type IN (
    'breaking-news', 'market-update', 'event-special', 'stat-of-the-day', 'corporate'
  )),
  CONSTRAINT valid_image_strategy CHECK (image_strategy IN (
    'use_provided', 'generate_new', 'use_stock'
  )),
  CONSTRAINT unique_trigger_name_per_business UNIQUE (business_id, name)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auto-update updated_at
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TRIGGER trg_trigger_templates_updated_at
  BEFORE UPDATE ON trigger_templates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE trigger_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own trigger templates"
  ON trigger_templates
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_business_memberships ubm
      WHERE ubm.business_id = trigger_templates.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_business_memberships ubm
      WHERE ubm.business_id = trigger_templates.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Fast lookup of triggers for a business
CREATE INDEX idx_trigger_templates_business_id
  ON trigger_templates(business_id, is_active);

-- Lookup by content type (for auto-detection matching)
CREATE INDEX idx_trigger_templates_content_type
  ON trigger_templates(business_id, content_type);
