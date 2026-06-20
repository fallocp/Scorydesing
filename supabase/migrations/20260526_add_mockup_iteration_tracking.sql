-- =============================================================================
-- Add iteration tracking to design_mockups
-- =============================================================================
-- Adds parent_mockup_id and iteration_feedback to track the evolution chain
-- of mockups: which mockup was the "source" and what feedback produced the new one.

ALTER TABLE public.design_mockups
  ADD COLUMN IF NOT EXISTS parent_mockup_id UUID REFERENCES public.design_mockups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS iteration_feedback TEXT;

-- Index for querying iteration chains (find all children of a mockup)
CREATE INDEX IF NOT EXISTS idx_design_mockups_parent_id
  ON public.design_mockups(parent_mockup_id)
  WHERE parent_mockup_id IS NOT NULL;

COMMENT ON COLUMN public.design_mockups.parent_mockup_id IS 'The mockup this one was iterated from (null = original generation)';
COMMENT ON COLUMN public.design_mockups.iteration_feedback IS 'User feedback that produced this iteration from the parent';
