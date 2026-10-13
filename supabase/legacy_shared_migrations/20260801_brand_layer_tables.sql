-- Brand layer — editable presets for the Design Studio "Montar marca" step
--
-- Two tables:
--   brand_disclaimers → several legal texts per brand, editable from the UI.
--   promoters         → the person block (photo + name + role) composited on
--                       pieces; replaces the hardcoded list in PromoterSelector.
--
-- `brand_key` lets one tenant hold several brand identities ('xending',
-- 'xending_usa', 'xending_capital') without creating extra tenants.
--
-- Depends on: business_tenants, user_business_memberships.
-- Non-destructive: only CREATE ... IF NOT EXISTS.

-- =============================================================================
-- 1. brand_disclaimers
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.brand_disclaimers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,

  -- Brand identity the text belongs to: 'xending', 'xending_usa', 'xending_capital'.
  brand_key TEXT NOT NULL,
  -- Short name shown in the picker, e.g. 'Completo', 'Corto', 'Promoción'.
  label TEXT NOT NULL,
  body TEXT NOT NULL,

  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_brand_disclaimers_business_brand
  ON public.brand_disclaimers(business_id, brand_key, sort_order);

-- =============================================================================
-- 2. promoters
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.promoters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,

  full_name TEXT NOT NULL,
  role TEXT,
  email TEXT,
  phone TEXT,
  -- Storage URLs. photo_url feeds the circular person block on the piece.
  photo_url TEXT,
  qr_url TEXT,

  is_active BOOLEAN NOT NULL DEFAULT true,
  sort_order INTEGER NOT NULL DEFAULT 0,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_promoters_business
  ON public.promoters(business_id, sort_order);

-- =============================================================================
-- 3. updated_at triggers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.brand_layer_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_brand_disclaimers_updated_at ON public.brand_disclaimers;
CREATE TRIGGER trg_brand_disclaimers_updated_at
  BEFORE UPDATE ON public.brand_disclaimers
  FOR EACH ROW EXECUTE FUNCTION public.brand_layer_set_updated_at();

DROP TRIGGER IF EXISTS trg_promoters_updated_at ON public.promoters;
CREATE TRIGGER trg_promoters_updated_at
  BEFORE UPDATE ON public.promoters
  FOR EACH ROW EXECUTE FUNCTION public.brand_layer_set_updated_at();

-- =============================================================================
-- 4. Row Level Security
-- =============================================================================
ALTER TABLE public.brand_disclaimers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own business brand disclaimers" ON public.brand_disclaimers;
CREATE POLICY "Users can manage own business brand disclaimers"
  ON public.brand_disclaimers
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = brand_disclaimers.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = brand_disclaimers.business_id
        AND ubm.user_id = auth.uid()
    )
  );

ALTER TABLE public.promoters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage own business promoters" ON public.promoters;
CREATE POLICY "Users can manage own business promoters"
  ON public.promoters
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = promoters.business_id
        AND ubm.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = promoters.business_id
        AND ubm.user_id = auth.uid()
    )
  );
