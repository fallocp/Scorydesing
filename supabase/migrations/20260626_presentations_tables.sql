-- Presentations persistence
-- Stores pitch deck presentations (slides as JSONB) per business tenant.
-- Slides shape: [{ "title": string, "html": string }]

-- =============================================================================
-- 1. presentations table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.presentations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,

  name TEXT NOT NULL DEFAULT 'Presentación',
  slides JSONB NOT NULL DEFAULT '[]',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- 2. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_presentations_business
  ON public.presentations(business_id);

CREATE INDEX IF NOT EXISTS idx_presentations_updated_at
  ON public.presentations(business_id, updated_at DESC);

-- =============================================================================
-- 3. updated_at trigger
-- =============================================================================
CREATE OR REPLACE FUNCTION public.presentations_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_presentations_updated_at ON public.presentations;
CREATE TRIGGER trg_presentations_updated_at
  BEFORE UPDATE ON public.presentations
  FOR EACH ROW EXECUTE FUNCTION public.presentations_set_updated_at();

-- =============================================================================
-- 4. Row Level Security
-- =============================================================================
ALTER TABLE public.presentations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own business presentations" ON public.presentations;
CREATE POLICY "Users can manage own business presentations"
  ON public.presentations
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = presentations.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = presentations.business_id
        AND ubm.user_id = auth.uid()
    )
  );
