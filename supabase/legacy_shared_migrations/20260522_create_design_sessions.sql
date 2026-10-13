-- Design Sessions table
-- Stores the state of Design Studio sessions: selections, mockups, HTML iterations
-- Part of the Design Studio feature for creating custom templates via AI generation

-- =============================================================================
-- 1. design_sessions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.design_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',

  -- Input configuration
  input_mode TEXT NOT NULL DEFAULT 'visual',
  selections JSONB,                    -- VisualSelections (Mode A)
  reference_image_url TEXT,            -- Storage path (Mode B)
  reference_description TEXT,
  platform TEXT,

  -- Generated mockups
  mockups JSONB DEFAULT '[]',          -- GeneratedMockup[]
  selected_mockup_index INTEGER,

  -- HTML state
  current_html TEXT,
  html_history JSONB DEFAULT '[]',     -- HtmlIteration[]
  iteration_count INTEGER DEFAULT 0,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_session_status CHECK (status IN ('active', 'completed', 'discarded')),
  CONSTRAINT valid_input_mode CHECK (input_mode IN ('visual', 'reference')),
  CONSTRAINT max_iterations CHECK (iteration_count <= 10)
);

-- Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS trg_design_sessions_updated_at ON public.design_sessions;
CREATE TRIGGER trg_design_sessions_updated_at
  BEFORE UPDATE ON public.design_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2. Indexes
-- =============================================================================

-- Fast lookup for active sessions per user within a business
CREATE INDEX IF NOT EXISTS idx_design_sessions_active
  ON public.design_sessions (business_id, user_id, status)
  WHERE status = 'active';

-- =============================================================================
-- 3. Row Level Security
-- =============================================================================
ALTER TABLE public.design_sessions ENABLE ROW LEVEL SECURITY;

-- Users can manage their own design sessions within their business
DROP POLICY IF EXISTS "Users can manage own design sessions" ON public.design_sessions;
CREATE POLICY "Users can manage own design sessions"
  ON public.design_sessions
  FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  )
  WITH CHECK (
    business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
    )
    AND user_id = auth.uid()
  );
