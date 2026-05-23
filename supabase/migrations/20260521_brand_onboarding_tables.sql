-- Brand Onboarding Agent tables
-- Stores onboarding sessions and uploaded brand assets for automatic brand extraction
-- Supports two routes: brand_book (PDF) and materials (partial files)

-- =============================================================================
-- 1. brand_onboarding_sessions table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.brand_onboarding_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,

  -- Route & Status
  route TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',

  -- Input files
  uploaded_files JSONB NOT NULL DEFAULT '[]',

  -- Extraction result
  extracted_brand JSONB,
  field_confidence JSONB,
  overall_confidence NUMERIC(3,2),
  needs_user_input TEXT[] DEFAULT '{}',

  -- User corrections (what they changed after seeing extraction)
  user_corrections JSONB DEFAULT '{}',

  -- Final approved brand (after user confirmation)
  approved_brand JSONB,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  extracted_at TIMESTAMPTZ,
  approved_at TIMESTAMPTZ,

  -- Constraints
  CONSTRAINT valid_onboarding_status CHECK (status IN (
    'pending', 'extracting', 'awaiting_confirmation', 'confirmed', 'failed'
  )),
  CONSTRAINT valid_route CHECK (route IN ('brand_book', 'materials'))
);

-- =============================================================================
-- 2. brand_assets table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.brand_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  onboarding_session_id UUID REFERENCES public.brand_onboarding_sessions(id) ON DELETE SET NULL,

  -- File info
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  storage_path TEXT NOT NULL,
  category TEXT NOT NULL,

  -- Extraction from this specific file
  extraction_output JSONB,
  confidence NUMERIC(3,2),

  created_at TIMESTAMPTZ DEFAULT now(),

  -- Constraints
  CONSTRAINT valid_asset_category CHECK (category IN (
    'brand_book', 'logo', 'business_card', 'stationery',
    'website_screenshot', 'social_screenshot', 'other'
  ))
);

-- =============================================================================
-- 3. Indexes
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_brand_onboarding_business
  ON public.brand_onboarding_sessions(business_id);

CREATE INDEX IF NOT EXISTS idx_brand_assets_business
  ON public.brand_assets(business_id);

CREATE INDEX IF NOT EXISTS idx_brand_assets_session
  ON public.brand_assets(onboarding_session_id);

-- =============================================================================
-- 4. Row Level Security — brand_onboarding_sessions
-- =============================================================================
ALTER TABLE public.brand_onboarding_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own business onboarding" ON public.brand_onboarding_sessions;
CREATE POLICY "Users can manage own business onboarding"
  ON public.brand_onboarding_sessions
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = brand_onboarding_sessions.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = brand_onboarding_sessions.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 5. Row Level Security — brand_assets
-- =============================================================================
ALTER TABLE public.brand_assets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own business assets" ON public.brand_assets;
CREATE POLICY "Users can manage own business assets"
  ON public.brand_assets
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = brand_assets.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = brand_assets.business_id
        AND ubm.user_id = auth.uid()
    )
  );

-- =============================================================================
-- 6. Storage bucket — brand-assets
-- =============================================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('brand-assets', 'brand-assets', false)
ON CONFLICT (id) DO NOTHING;

-- RLS: only members of the business can manage files in their folder
DROP POLICY IF EXISTS "Business members can manage brand assets" ON storage.objects;
CREATE POLICY "Business members can manage brand assets"
  ON storage.objects
  FOR ALL
  TO authenticated
  USING (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT bt.id::text FROM public.business_tenants bt
      INNER JOIN public.user_business_memberships ubm ON ubm.business_id = bt.id
      WHERE ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'brand-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT bt.id::text FROM public.business_tenants bt
      INNER JOIN public.user_business_memberships ubm ON ubm.business_id = bt.id
      WHERE ubm.user_id = auth.uid()
    )
  );
