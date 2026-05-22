-- =============================================================================
-- Pipeline Orchestrator Tables
-- =============================================================================
-- Creates: pipeline_runs, pipeline_steps, pipeline_pieces
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships, update_updated_at_column)
-- NOTE: pipeline_pieces is DIFFERENT from design_pieces — pipeline_pieces tracks
--       orchestration state (image_iterations, visual_tone, layout_variation,
--       compliance_status) while design_pieces is campaign-scoped for manual flows.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pipeline_runs — Tracks full pipeline execution lifecycle
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE pipeline_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES business_tenants(id),
  status TEXT NOT NULL DEFAULT 'initialized',
  current_step INTEGER NOT NULL DEFAULT 0,
  total_steps INTEGER NOT NULL DEFAULT 6,

  -- Input
  brief JSONB NOT NULL,
  options JSONB NOT NULL DEFAULT '{}',

  -- Outputs (each agent writes its result)
  strategy_output JSONB,
  content_output JSONB,
  validation_output JSONB,
  approved_idea_ids TEXT[] DEFAULT '{}',

  -- Error tracking
  error JSONB,
  retry_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,

  CONSTRAINT valid_status CHECK (status IN (
    'initialized', 'running_strategy', 'running_content',
    'running_validation', 'awaiting_idea_approval',
    'running_image_prompts', 'awaiting_image_selection',
    'running_image_generation', 'awaiting_image_approval',
    'running_html_assembly', 'running_render',
    'completed', 'failed', 'cancelled'
  ))
);

-- RLS
ALTER TABLE pipeline_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own business pipeline runs"
  ON pipeline_runs FOR ALL
  USING (business_id IN (
    SELECT business_id FROM user_business_memberships
    WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_pipeline_runs_business_status
  ON pipeline_runs(business_id, status);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_pipeline_runs_updated_at ON pipeline_runs;
CREATE TRIGGER trg_pipeline_runs_updated_at
  BEFORE UPDATE ON pipeline_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pipeline_steps — Individual agent execution records within a run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE pipeline_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  step_number INTEGER NOT NULL,
  agent_name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',

  -- Input/Output
  input JSONB,
  output JSONB,

  -- Timing
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,

  -- Error info
  error JSONB,
  retry_count INTEGER DEFAULT 0,

  CONSTRAINT valid_step_status CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'skipped', 'awaiting_input'
  )),
  CONSTRAINT unique_step_per_run UNIQUE (pipeline_run_id, step_number)
);

-- RLS
ALTER TABLE pipeline_steps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own pipeline steps"
  ON pipeline_steps FOR ALL
  USING (pipeline_run_id IN (
    SELECT id FROM pipeline_runs
    WHERE business_id IN (
      SELECT business_id FROM user_business_memberships
      WHERE user_id = auth.uid()
    )
  ));

-- Indexes
CREATE INDEX idx_pipeline_steps_run_id
  ON pipeline_steps(pipeline_run_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. pipeline_pieces — Generated creative pieces within a pipeline run
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE pipeline_pieces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_run_id UUID NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  business_id UUID NOT NULL REFERENCES business_tenants(id),
  idea_id TEXT NOT NULL,

  -- Copy
  headline TEXT NOT NULL,
  body TEXT,
  cta TEXT,
  footer TEXT,
  status_pill TEXT,
  data_badge TEXT,
  image_intent TEXT,
  angle TEXT,
  narrative_angle TEXT,
  funnel_stage TEXT,

  -- Image
  image_type TEXT,
  image_prompt TEXT,
  image_storage_path TEXT,
  image_iterations JSONB DEFAULT '[]',

  -- Template & Render
  template_type TEXT,
  visual_tone TEXT,
  layout_variation TEXT,
  platform TEXT NOT NULL,
  html_content TEXT,
  png_storage_path TEXT,

  -- Compliance
  compliance_status TEXT DEFAULT 'pending',
  compliance_notes JSONB DEFAULT '[]',

  -- Status
  piece_status TEXT NOT NULL DEFAULT 'draft',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_piece_status CHECK (piece_status IN (
    'draft', 'content_ready', 'image_ready', 'html_ready', 'rendered', 'approved'
  ))
);

-- RLS
ALTER TABLE pipeline_pieces ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can manage own business pieces"
  ON pipeline_pieces FOR ALL
  USING (business_id IN (
    SELECT business_id FROM user_business_memberships
    WHERE user_id = auth.uid()
  ));

-- Indexes
CREATE INDEX idx_pipeline_pieces_run_id
  ON pipeline_pieces(pipeline_run_id);

CREATE INDEX idx_pipeline_pieces_business_id
  ON pipeline_pieces(business_id);

-- Auto-update updated_at
DROP TRIGGER IF EXISTS trg_pipeline_pieces_updated_at ON pipeline_pieces;
CREATE TRIGGER trg_pipeline_pieces_updated_at
  BEFORE UPDATE ON pipeline_pieces
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
