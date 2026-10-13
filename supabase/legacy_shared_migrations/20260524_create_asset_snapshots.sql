-- =============================================================================
-- Asset Snapshots — Universal Versioning for Generated Assets
-- =============================================================================
-- Creates: asset_snapshots
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships, update_updated_at_column)
-- Purpose: Stores versioned snapshots of generated assets (images, HTML, copy).
--          Used by Image Iteration Engine to track iteration history.
--          Each iteration creates a new snapshot with parent_snapshot_id pointing
--          to the previous version. The memory system NEVER overwrites — always
--          version/append.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. asset_snapshots — Versioned snapshots of generated assets
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE asset_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id),

  -- Asset identification
  asset_type TEXT NOT NULL,
  asset_id TEXT NOT NULL,           -- External reference (e.g., pipeline_piece_id, idea_id)
  version INTEGER NOT NULL DEFAULT 1,

  -- Content
  content TEXT NOT NULL,            -- The actual asset content (base64 image, HTML, copy text)
  metadata JSONB DEFAULT '{}',     -- Additional metadata (dimensions, prompt_used, etc.)

  -- Iteration tracking
  feedback TEXT,                    -- User feedback that triggered this iteration
  parent_snapshot_id UUID REFERENCES asset_snapshots(id), -- Self-referencing FK for iteration chains

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_asset_type CHECK (asset_type IN ('image', 'html', 'copy')),
  CONSTRAINT unique_asset_version UNIQUE (asset_type, asset_id, version)
);

-- RLS
ALTER TABLE asset_snapshots ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own business asset snapshots"
  ON asset_snapshots FOR ALL
  USING (business_id IN (
    SELECT business_id FROM user_business_memberships
    WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_asset_snapshots_business_id
  ON asset_snapshots(business_id);

CREATE INDEX idx_asset_snapshots_asset_lookup
  ON asset_snapshots(asset_type, asset_id, version DESC);

CREATE INDEX idx_asset_snapshots_parent
  ON asset_snapshots(parent_snapshot_id);
