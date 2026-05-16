-- Extend existing design tables for Campaign Architecture Refactor
-- Adds business_id and campaign architecture FK columns to design_campaigns,
-- design_pieces, and design_images for multi-tenant support.
-- Depends on: 20260424_create_design_campaigns.sql, 20260424_create_design_pieces.sql,
--             20260424_create_design_images.sql, 20260501_create_business_tenants.sql,
--             20260501_create_campaign_architecture.sql

-- =============================================================================
-- 1. ALTER design_campaigns — add new nullable FK columns
-- =============================================================================
ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_tenants(id) ON DELETE SET NULL;

ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS category_id uuid REFERENCES public.campaign_categories(id) ON DELETE SET NULL;

ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS commercial_branch_id uuid REFERENCES public.commercial_branches(id) ON DELETE SET NULL;

ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS vertical_id uuid REFERENCES public.industry_verticals(id) ON DELETE SET NULL;

ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS moment_id uuid REFERENCES public.market_moments(id) ON DELETE SET NULL;

ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS channel text;

ALTER TABLE public.design_campaigns
  ADD COLUMN IF NOT EXISTS angle text;

-- Indexes on new FK columns for performance
CREATE INDEX IF NOT EXISTS idx_design_campaigns_business_id
  ON public.design_campaigns(business_id);

CREATE INDEX IF NOT EXISTS idx_design_campaigns_category_id
  ON public.design_campaigns(category_id);

CREATE INDEX IF NOT EXISTS idx_design_campaigns_commercial_branch_id
  ON public.design_campaigns(commercial_branch_id);

CREATE INDEX IF NOT EXISTS idx_design_campaigns_vertical_id
  ON public.design_campaigns(vertical_id);

CREATE INDEX IF NOT EXISTS idx_design_campaigns_moment_id
  ON public.design_campaigns(moment_id);

-- =============================================================================
-- 2. ALTER design_pieces — add business_id
-- =============================================================================
ALTER TABLE public.design_pieces
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_design_pieces_business_id
  ON public.design_pieces(business_id);

-- =============================================================================
-- 3. ALTER design_images — add business_id
-- =============================================================================
ALTER TABLE public.design_images
  ADD COLUMN IF NOT EXISTS business_id uuid REFERENCES public.business_tenants(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_design_images_business_id
  ON public.design_images(business_id);

-- =============================================================================
-- 4. Ensure RLS is enabled (safe to re-run)
-- =============================================================================
ALTER TABLE public.design_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.design_images ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- 5. New RLS policies for design_campaigns — business_id-based access
--    Existing user_id-based policies are preserved (they cover NULL business_id).
-- =============================================================================

-- SELECT: members of the business can view campaigns with that business_id
DROP POLICY IF EXISTS "Business members can view business design campaigns" ON public.design_campaigns;
CREATE POLICY "Business members can view business design campaigns"
  ON public.design_campaigns
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_campaigns.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- INSERT: members can insert campaigns with their business_id
DROP POLICY IF EXISTS "Business members can create business design campaigns" ON public.design_campaigns;
CREATE POLICY "Business members can create business design campaigns"
  ON public.design_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_campaigns.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- UPDATE: owner/admin/editor of the business can update
DROP POLICY IF EXISTS "Business editors can update business design campaigns" ON public.design_campaigns;
CREATE POLICY "Business editors can update business design campaigns"
  ON public.design_campaigns
  FOR UPDATE
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_campaigns.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin', 'editor')
    )
  );

-- =============================================================================
-- 6. New RLS policies for design_pieces — business_id-based access
--    Existing campaign_id-based policies are preserved (they cover NULL business_id).
-- =============================================================================

-- SELECT: members of the business can view pieces with that business_id
DROP POLICY IF EXISTS "Business members can view business design pieces" ON public.design_pieces;
CREATE POLICY "Business members can view business design pieces"
  ON public.design_pieces
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_pieces.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- INSERT: members can insert pieces with their business_id
DROP POLICY IF EXISTS "Business members can create business design pieces" ON public.design_pieces;
CREATE POLICY "Business members can create business design pieces"
  ON public.design_pieces
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_pieces.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- UPDATE: owner/admin/editor of the business can update
DROP POLICY IF EXISTS "Business editors can update business design pieces" ON public.design_pieces;
CREATE POLICY "Business editors can update business design pieces"
  ON public.design_pieces
  FOR UPDATE
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_pieces.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin', 'editor')
    )
  );

-- =============================================================================
-- 7. New RLS policies for design_images — business_id-based access
--    Existing policies are preserved (they cover NULL business_id / unlinked stock).
-- =============================================================================

-- SELECT: members of the business can view images with that business_id
DROP POLICY IF EXISTS "Business members can view business design images" ON public.design_images;
CREATE POLICY "Business members can view business design images"
  ON public.design_images
  FOR SELECT
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_images.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- INSERT: members can insert images with their business_id
DROP POLICY IF EXISTS "Business members can create business design images" ON public.design_images;
CREATE POLICY "Business members can create business design images"
  ON public.design_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_images.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- UPDATE: owner/admin/editor of the business can update
DROP POLICY IF EXISTS "Business editors can update business design images" ON public.design_images;
CREATE POLICY "Business editors can update business design images"
  ON public.design_images
  FOR UPDATE
  TO authenticated
  USING (
    business_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = design_images.business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin', 'editor')
    )
  );
