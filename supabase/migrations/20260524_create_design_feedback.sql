-- =============================================================================
-- Design Feedback — Mockup Likes, Dislikes, Chat, and Preferences
-- =============================================================================
-- Creates: design_feedback
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, user_business_memberships)
--             20260523_create_design_mockups.sql (design_mockups)
-- Purpose: Stores user feedback on generated mockups (likes, dislikes, chat messages,
--          and explicit preferences). This table IS the practical implementation of
--          `learning_deltas` for the Design Studio context.
--          The interpreted_changes JSONB uses the same {increase, decrease} structure
--          as learning_deltas, ensuring zero-friction migration when consolidating
--          memory systems later.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. design_feedback — User feedback on mockups and design preferences
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.design_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  mockup_id UUID REFERENCES public.design_mockups(id) ON DELETE SET NULL,
  feedback_type TEXT NOT NULL,
  message TEXT,
  interpreted_changes JSONB DEFAULT '{"increase": [], "decrease": []}',
  prompt_used TEXT,
  selections JSONB,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_feedback_type CHECK (feedback_type IN ('like', 'dislike', 'chat', 'preference'))
);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Indexes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_design_feedback_business_type_created
  ON public.design_feedback(business_id, feedback_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_design_feedback_mockup_id
  ON public.design_feedback(mockup_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.design_feedback ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view feedback" ON public.design_feedback;
CREATE POLICY "Members can view feedback"
  ON public.design_feedback
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_feedback.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can insert feedback" ON public.design_feedback;
CREATE POLICY "Members can insert feedback"
  ON public.design_feedback
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_feedback.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can delete own feedback" ON public.design_feedback;
CREATE POLICY "Members can delete own feedback"
  ON public.design_feedback
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());
