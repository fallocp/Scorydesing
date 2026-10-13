-- =============================================================================
-- Design Mockups — persists generated mockup images from Design Studio
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.design_mockups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  platform TEXT NOT NULL,
  selections JSONB,
  prompt_used TEXT,
  status TEXT NOT NULL DEFAULT 'saved' CHECK (status IN ('saved', 'discarded', 'converted')),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_design_mockups_business_id
  ON public.design_mockups(business_id);

CREATE INDEX IF NOT EXISTS idx_design_mockups_created_by
  ON public.design_mockups(created_by);

-- RLS
ALTER TABLE public.design_mockups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view mockups" ON public.design_mockups;
CREATE POLICY "Members can view mockups"
  ON public.design_mockups
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_mockups.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can insert mockups" ON public.design_mockups;
CREATE POLICY "Members can insert mockups"
  ON public.design_mockups
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_mockups.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Members can update own mockups" ON public.design_mockups;
CREATE POLICY "Members can update own mockups"
  ON public.design_mockups
  FOR UPDATE
  TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Members can delete own mockups" ON public.design_mockups;
CREATE POLICY "Members can delete own mockups"
  ON public.design_mockups
  FOR DELETE
  TO authenticated
  USING (created_by = auth.uid());
