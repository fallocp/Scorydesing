-- Xending News — news_editions table
-- Stores each editorial edition: raw input, normalized schema, slide plan,
-- visual plan and generated slides. 100% independent from the commercial
-- carousel pipeline. Part of the Xending News module (see docs/xending-news/).

-- =============================================================================
-- 1. news_editions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.news_editions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  title TEXT,                          -- "Xending News · 21 ago 2026"
  edition_type TEXT NOT NULL DEFAULT 'daily',

  -- Input
  raw_input TEXT,                      -- what the user pasted / uploaded
  input_format TEXT,                   -- 'markdown' | 'json' | 'paste' | 'morning_brief'

  -- Pipeline artifacts
  normalized JSONB,                    -- NewsNormalizedEdition (spec section 7)
  slide_plan JSONB DEFAULT '[]',       -- NewsSlidePlan[]
  visual_plan JSONB DEFAULT '[]',      -- NewsSlideVisual[] (resolution + prompts)
  slides JSONB DEFAULT '[]',           -- generated images + per-slide state

  status TEXT NOT NULL DEFAULT 'draft',

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  CONSTRAINT valid_news_edition_type CHECK (edition_type IN ('daily', 'special')),
  CONSTRAINT valid_news_edition_status CHECK (status IN ('draft', 'completed', 'discarded')),
  CONSTRAINT valid_news_input_format CHECK (
    input_format IS NULL
    OR input_format IN ('markdown', 'json', 'paste', 'morning_brief')
  )
);

-- Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS trg_news_editions_updated_at ON public.news_editions;
CREATE TRIGGER trg_news_editions_updated_at
  BEFORE UPDATE ON public.news_editions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2. Indexes
-- =============================================================================

-- Recent editions per business (edition history, newest first)
CREATE INDEX IF NOT EXISTS idx_news_editions_business_recent
  ON public.news_editions (business_id, created_at DESC);

-- =============================================================================
-- 3. Row Level Security
-- =============================================================================
ALTER TABLE public.news_editions ENABLE ROW LEVEL SECURITY;

-- Members of a business can manage the news editions of that business.
-- Shared team resource, mirrors design_mockups: any member sees and edits the
-- editions of their tenant. created_by records authorship, not ownership.
DROP POLICY IF EXISTS "Members can manage business news editions" ON public.news_editions;
CREATE POLICY "Members can manage business news editions"
  ON public.news_editions
  FOR ALL
  TO authenticated
  USING (
    business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    business_id IN (
      SELECT ubm.business_id FROM public.user_business_memberships ubm
      WHERE ubm.user_id = auth.uid()
    )
  );
