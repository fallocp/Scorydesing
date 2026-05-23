-- =============================================================================
-- Migration: Create custom_templates table
-- =============================================================================
-- Design Studio — stores user-created templates with HTML placeholders
-- Depends on: business_tenants, auth.users, design_sessions
-- =============================================================================

CREATE TABLE custom_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id),
  created_by UUID NOT NULL REFERENCES auth.users(id),

  -- Identification
  name TEXT NOT NULL,
  platform TEXT NOT NULL,

  -- Template content
  html_template TEXT NOT NULL,         -- HTML with {{placeholders}}
  slots JSONB NOT NULL DEFAULT '[]',   -- TemplateSlot[]

  -- Preview
  thumbnail_url TEXT,                  -- Storage path for thumbnail

  -- Source tracking
  source_session_id UUID REFERENCES design_sessions(id),
  source_mockup_url TEXT,

  -- Status
  is_active BOOLEAN DEFAULT true,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_platform CHECK (platform IN (
    'instagram-story', 'instagram-post', 'facebook-post', 'linkedin-post', 'banner'
  ))
);

-- RLS: strict multi-tenant isolation
ALTER TABLE custom_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own business templates"
  ON custom_templates FOR ALL
  USING (
    business_id IN (
      SELECT business_id FROM user_business_memberships
      WHERE user_id = auth.uid()
    )
  );

-- Index for listing templates by business (active only)
CREATE INDEX idx_custom_templates_business
  ON custom_templates (business_id, is_active, platform)
  WHERE is_active = true;

-- Auto-update updated_at timestamp
CREATE TRIGGER set_custom_templates_updated_at
  BEFORE UPDATE ON custom_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
