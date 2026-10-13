-- =============================================================================
-- Learning Deltas — Incremental Changes in Creative Preferences
-- =============================================================================
-- Creates: learning_deltas
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships)
--             20260524_create_creative_profiles.sql (creative_profiles)
-- Pattern: Append-only. Each row records a single incremental change in
--          creative preferences, linked to the creative_profile version that
--          was active when the delta was created.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. learning_deltas table
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE learning_deltas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id),
  profile_version INTEGER NOT NULL,

  -- What changed
  increase JSONB NOT NULL DEFAULT '[]',  -- Things to do MORE of (e.g., ["fondos claros", "tipografía bold"])
  decrease JSONB NOT NULL DEFAULT '[]',  -- Things to do LESS of (e.g., ["glow effects", "colores pastel"])

  -- What triggered this delta
  trigger_type TEXT NOT NULL,  -- 'approval' | 'rejection' | 'explicit_feedback' | 'pattern'
  trigger_context JSONB,       -- Context: { pipeline_run_id, piece_id, user_message, ... }

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- FK to the creative_profile version that was active when this delta was created
  CONSTRAINT fk_profile FOREIGN KEY (business_id, profile_version)
    REFERENCES creative_profiles(business_id, version),

  -- Ensure trigger_type is a known value
  CONSTRAINT valid_trigger_type CHECK (trigger_type IN (
    'approval', 'rejection', 'explicit_feedback', 'pattern'
  ))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE learning_deltas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own learning deltas"
  ON learning_deltas
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_business_memberships ubm
      WHERE ubm.business_id = learning_deltas.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_business_memberships ubm
      WHERE ubm.business_id = learning_deltas.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

-- Fast lookup of deltas for a business (most recent first)
CREATE INDEX idx_learning_deltas_business_id
  ON learning_deltas(business_id, created_at DESC);

-- Lookup by profile version (to find all deltas for a specific profile version)
CREATE INDEX idx_learning_deltas_profile_version
  ON learning_deltas(business_id, profile_version);

-- Filter by trigger type
CREATE INDEX idx_learning_deltas_trigger_type
  ON learning_deltas(business_id, trigger_type, created_at DESC);
