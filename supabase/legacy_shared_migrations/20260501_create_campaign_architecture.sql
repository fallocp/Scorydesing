-- Campaign Architecture tables
-- Four-layer campaign hierarchy + supporting entities for the MaaS platform
-- Depends on: 20260501_create_business_tenants.sql (business_tenants, update_updated_at_column)

-- =============================================================================
-- 1. campaign_categories
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.campaign_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_campaign_categories_business_id
  ON public.campaign_categories(business_id);

DROP TRIGGER IF EXISTS trg_campaign_categories_updated_at ON public.campaign_categories;
CREATE TRIGGER trg_campaign_categories_updated_at
  BEFORE UPDATE ON public.campaign_categories
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 2. commercial_branches
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.commercial_branches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.campaign_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  strategic_config jsonb NOT NULL,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_commercial_branches_business_id
  ON public.commercial_branches(business_id);

CREATE INDEX IF NOT EXISTS idx_commercial_branches_category_id
  ON public.commercial_branches(category_id);

DROP TRIGGER IF EXISTS trg_commercial_branches_updated_at ON public.commercial_branches;
CREATE TRIGGER trg_commercial_branches_updated_at
  BEFORE UPDATE ON public.commercial_branches
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 3. industry_verticals
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.industry_verticals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.campaign_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  keywords text[] DEFAULT '{}',
  visual_context text,
  display_order integer NOT NULL DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_industry_verticals_business_id
  ON public.industry_verticals(business_id);

CREATE INDEX IF NOT EXISTS idx_industry_verticals_category_id
  ON public.industry_verticals(category_id);

DROP TRIGGER IF EXISTS trg_industry_verticals_updated_at ON public.industry_verticals;
CREATE TRIGGER trg_industry_verticals_updated_at
  BEFORE UPDATE ON public.industry_verticals
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 4. market_moments
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.market_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.campaign_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  trigger_type text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (business_id, category_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_market_moments_business_id
  ON public.market_moments(business_id);

CREATE INDEX IF NOT EXISTS idx_market_moments_category_id
  ON public.market_moments(category_id);

DROP TRIGGER IF EXISTS trg_market_moments_updated_at ON public.market_moments;
CREATE TRIGGER trg_market_moments_updated_at
  BEFORE UPDATE ON public.market_moments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 5. master_prompts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.master_prompts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  prompt_text text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_master_prompts_business_id
  ON public.master_prompts(business_id);

-- =============================================================================
-- 6. schema_versions
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.schema_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL,
  version integer NOT NULL,
  schema_definition jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE (entity_type, version)
);

-- =============================================================================
-- 7. business_channels
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  platform_format text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_business_channels_business_id
  ON public.business_channels(business_id);

-- =============================================================================
-- 8. business_angles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_angles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  description text,
  display_order integer DEFAULT 0,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE (business_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_business_angles_business_id
  ON public.business_angles(business_id);

-- =============================================================================
-- 9. Row Level Security — campaign_categories
-- =============================================================================
ALTER TABLE public.campaign_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view campaign categories" ON public.campaign_categories;
CREATE POLICY "Members can view campaign categories"
  ON public.campaign_categories
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = campaign_categories.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert campaign categories" ON public.campaign_categories;
CREATE POLICY "Owners and admins can insert campaign categories"
  ON public.campaign_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = campaign_categories.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update campaign categories" ON public.campaign_categories;
CREATE POLICY "Owners and admins can update campaign categories"
  ON public.campaign_categories
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = campaign_categories.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete campaign categories" ON public.campaign_categories;
CREATE POLICY "Owners can delete campaign categories"
  ON public.campaign_categories
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = campaign_categories.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 10. Row Level Security — commercial_branches
-- =============================================================================
ALTER TABLE public.commercial_branches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view commercial branches" ON public.commercial_branches;
CREATE POLICY "Members can view commercial branches"
  ON public.commercial_branches
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = commercial_branches.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert commercial branches" ON public.commercial_branches;
CREATE POLICY "Owners and admins can insert commercial branches"
  ON public.commercial_branches
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = commercial_branches.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update commercial branches" ON public.commercial_branches;
CREATE POLICY "Owners and admins can update commercial branches"
  ON public.commercial_branches
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = commercial_branches.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete commercial branches" ON public.commercial_branches;
CREATE POLICY "Owners can delete commercial branches"
  ON public.commercial_branches
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = commercial_branches.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 11. Row Level Security — industry_verticals
-- =============================================================================
ALTER TABLE public.industry_verticals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view industry verticals" ON public.industry_verticals;
CREATE POLICY "Members can view industry verticals"
  ON public.industry_verticals
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = industry_verticals.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert industry verticals" ON public.industry_verticals;
CREATE POLICY "Owners and admins can insert industry verticals"
  ON public.industry_verticals
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = industry_verticals.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update industry verticals" ON public.industry_verticals;
CREATE POLICY "Owners and admins can update industry verticals"
  ON public.industry_verticals
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = industry_verticals.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete industry verticals" ON public.industry_verticals;
CREATE POLICY "Owners can delete industry verticals"
  ON public.industry_verticals
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = industry_verticals.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 12. Row Level Security — market_moments
-- =============================================================================
ALTER TABLE public.market_moments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view market moments" ON public.market_moments;
CREATE POLICY "Members can view market moments"
  ON public.market_moments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = market_moments.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert market moments" ON public.market_moments;
CREATE POLICY "Owners and admins can insert market moments"
  ON public.market_moments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = market_moments.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update market moments" ON public.market_moments;
CREATE POLICY "Owners and admins can update market moments"
  ON public.market_moments
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = market_moments.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete market moments" ON public.market_moments;
CREATE POLICY "Owners can delete market moments"
  ON public.market_moments
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = market_moments.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 13. Row Level Security — master_prompts
-- =============================================================================
ALTER TABLE public.master_prompts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view master prompts" ON public.master_prompts;
CREATE POLICY "Members can view master prompts"
  ON public.master_prompts
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = master_prompts.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert master prompts" ON public.master_prompts;
CREATE POLICY "Owners and admins can insert master prompts"
  ON public.master_prompts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = master_prompts.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update master prompts" ON public.master_prompts;
CREATE POLICY "Owners and admins can update master prompts"
  ON public.master_prompts
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = master_prompts.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete master prompts" ON public.master_prompts;
CREATE POLICY "Owners can delete master prompts"
  ON public.master_prompts
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = master_prompts.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 14. Row Level Security — schema_versions (no business_id)
-- =============================================================================
ALTER TABLE public.schema_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view schema versions" ON public.schema_versions;
CREATE POLICY "Authenticated users can view schema versions"
  ON public.schema_versions
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Only service role can insert schema versions" ON public.schema_versions;
CREATE POLICY "Only service role can insert schema versions"
  ON public.schema_versions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS "Only service role can update schema versions" ON public.schema_versions;
CREATE POLICY "Only service role can update schema versions"
  ON public.schema_versions
  FOR UPDATE
  TO service_role
  USING (true);

DROP POLICY IF EXISTS "Only service role can delete schema versions" ON public.schema_versions;
CREATE POLICY "Only service role can delete schema versions"
  ON public.schema_versions
  FOR DELETE
  TO service_role
  USING (true);

-- =============================================================================
-- 15. Row Level Security — business_channels
-- =============================================================================
ALTER TABLE public.business_channels ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view business channels" ON public.business_channels;
CREATE POLICY "Members can view business channels"
  ON public.business_channels
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_channels.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert business channels" ON public.business_channels;
CREATE POLICY "Owners and admins can insert business channels"
  ON public.business_channels
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_channels.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update business channels" ON public.business_channels;
CREATE POLICY "Owners and admins can update business channels"
  ON public.business_channels
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_channels.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete business channels" ON public.business_channels;
CREATE POLICY "Owners can delete business channels"
  ON public.business_channels
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_channels.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 16. Row Level Security — business_angles
-- =============================================================================
ALTER TABLE public.business_angles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can view business angles" ON public.business_angles;
CREATE POLICY "Members can view business angles"
  ON public.business_angles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_angles.business_id
        AND ubm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Owners and admins can insert business angles" ON public.business_angles;
CREATE POLICY "Owners and admins can insert business angles"
  ON public.business_angles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_angles.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners and admins can update business angles" ON public.business_angles;
CREATE POLICY "Owners and admins can update business angles"
  ON public.business_angles
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_angles.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

DROP POLICY IF EXISTS "Owners can delete business angles" ON public.business_angles;
CREATE POLICY "Owners can delete business angles"
  ON public.business_angles
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_angles.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );
