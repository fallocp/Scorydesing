-- =============================================================================
-- Creative Profiles — Versioned, Append-Only Memory
-- =============================================================================
-- Creates: creative_profiles
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships)
-- Pattern: NEVER UPDATE — always INSERT a new version row.
-- The latest version for a business is the one with MAX(version).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. creative_profiles table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE creative_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id),
  version INTEGER NOT NULL,

  -- Layer 1: Base Brand (colors, fonts, logo, visual identity)
  base_brand JSONB NOT NULL,

  -- Layer 2: Strategic (tone, topics, audience, positioning)
  strategic_layer JSONB NOT NULL,

  -- Layer 3: Creative Preferences (learned scoring, increase/decrease arrays)
  preferences JSONB NOT NULL,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by TEXT,  -- 'onboarding' | 'feedback' | 'manual'

  -- Unique version per business (append-only versioning)
  CONSTRAINT unique_version_per_business UNIQUE (business_id, version)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Auto-increment version on INSERT
-- ─────────────────────────────────────────────────────────────────────────────
-- If version is not provided (NULL or 0), auto-assign next version for the business.

CREATE OR REPLACE FUNCTION auto_increment_creative_profile_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.version IS NULL OR NEW.version = 0 THEN
    SELECT COALESCE(MAX(version), 0) + 1
      INTO NEW.version
      FROM creative_profiles
      WHERE business_id = NEW.business_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_creative_profiles_auto_version
  BEFORE INSERT ON creative_profiles
  FOR EACH ROW
  EXECUTE FUNCTION auto_increment_creative_profile_version();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Prevent UPDATE — enforce append-only pattern
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION prevent_creative_profile_update()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'creative_profiles is append-only. INSERT a new version instead of updating.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_creative_profiles_no_update
  BEFORE UPDATE ON creative_profiles
  FOR EACH ROW
  EXECUTE FUNCTION prevent_creative_profile_update();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE creative_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own creative profiles"
  ON creative_profiles
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_business_memberships ubm
      WHERE ubm.business_id = creative_profiles.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_business_memberships ubm
      WHERE ubm.business_id = creative_profiles.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Fast lookup of latest version per business
CREATE INDEX idx_creative_profiles_business_version
  ON creative_profiles(business_id, version DESC);
