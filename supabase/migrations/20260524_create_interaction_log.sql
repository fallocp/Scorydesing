-- =============================================================================
-- Interaction Log — User Action Tracking for Feedback Interpreter
-- =============================================================================
-- Creates: interaction_log
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships)
--             20260520_pipeline_orchestrator_tables.sql (pipeline_runs)
-- Purpose: Logs every user action (approve, reject, iterate, edit, select, cancel)
--          within the pipeline. This table feeds into the Feedback Interpreter Agent
--          for generating learning_deltas that evolve the creative_profile over time.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. interaction_log — Records every user action in the pipeline
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE interaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id),

  -- Context references
  pipeline_run_id UUID REFERENCES pipeline_runs(id) ON DELETE SET NULL, -- Nullable: some interactions may be outside pipeline
  piece_id TEXT,                   -- Nullable: references the piece being acted upon

  -- Action details
  action_type TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',     -- Additional context (what was changed, feedback text, etc.)

  -- Audit
  created_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_action_type CHECK (action_type IN (
    'approve', 'reject', 'iterate', 'edit', 'select', 'cancel'
  ))
);

-- RLS
ALTER TABLE interaction_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own business interaction logs"
  ON interaction_log FOR ALL
  USING (business_id IN (
    SELECT business_id FROM user_business_memberships
    WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_interaction_log_business_id
  ON interaction_log(business_id);

CREATE INDEX idx_interaction_log_pipeline_run
  ON interaction_log(pipeline_run_id)
  WHERE pipeline_run_id IS NOT NULL;

CREATE INDEX idx_interaction_log_created_at
  ON interaction_log(business_id, created_at DESC);
