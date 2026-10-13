-- =============================================================================
-- Add iteration tracking columns to design_mockups
-- Fixes 400 error: code inserts parent_mockup_id and iteration_feedback
-- but columns did not exist.
-- =============================================================================

ALTER TABLE public.design_mockups
  ADD COLUMN IF NOT EXISTS parent_mockup_id UUID REFERENCES public.design_mockups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS iteration_feedback TEXT;

CREATE INDEX IF NOT EXISTS idx_design_mockups_parent
  ON public.design_mockups(parent_mockup_id);
