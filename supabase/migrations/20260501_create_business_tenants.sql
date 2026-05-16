-- Business Tenants and User Business Memberships tables
-- Multi-tenant foundation for the Campaign Architecture Refactor (MaaS)
-- Stores business identity, brand config, and user-to-business role assignments

-- =============================================================================
-- 1. Reusable updated_at trigger function
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- 2. business_tenants table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.business_tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  industry text,
  logo_url text,
  primary_color text,
  secondary_color text,
  accent_color text,
  fonts jsonb DEFAULT '{}',
  disclaimer text,
  short_disclaimer text,
  compliance_rules jsonb DEFAULT '{}',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Auto-update updated_at on row changes
DROP TRIGGER IF EXISTS trg_business_tenants_updated_at ON public.business_tenants;
CREATE TRIGGER trg_business_tenants_updated_at
  BEFORE UPDATE ON public.business_tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- =============================================================================
-- 3. user_business_memberships table
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.user_business_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'admin', 'editor', 'viewer')),
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, business_id)
);

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_user_business_memberships_user_id
  ON public.user_business_memberships(user_id);

CREATE INDEX IF NOT EXISTS idx_user_business_memberships_business_id
  ON public.user_business_memberships(business_id);

-- =============================================================================
-- 4. Row Level Security — business_tenants
-- =============================================================================
ALTER TABLE public.business_tenants ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated users who are members of the business
DROP POLICY IF EXISTS "Members can view their business tenants" ON public.business_tenants;
CREATE POLICY "Members can view their business tenants"
  ON public.business_tenants
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = id
        AND ubm.user_id = auth.uid()
    )
  );

-- INSERT: any authenticated user can create a business (they become owner)
DROP POLICY IF EXISTS "Authenticated users can create business tenants" ON public.business_tenants;
CREATE POLICY "Authenticated users can create business tenants"
  ON public.business_tenants
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE: only owner or admin role members
DROP POLICY IF EXISTS "Owners and admins can update business tenants" ON public.business_tenants;
CREATE POLICY "Owners and admins can update business tenants"
  ON public.business_tenants
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

-- DELETE: only owner role members
DROP POLICY IF EXISTS "Owners can delete business tenants" ON public.business_tenants;
CREATE POLICY "Owners can delete business tenants"
  ON public.business_tenants
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- =============================================================================
-- 5. Row Level Security — user_business_memberships
-- =============================================================================
ALTER TABLE public.user_business_memberships ENABLE ROW LEVEL SECURITY;

-- SELECT: users can see memberships for businesses they belong to
DROP POLICY IF EXISTS "Members can view memberships of their businesses" ON public.user_business_memberships;
CREATE POLICY "Members can view memberships of their businesses"
  ON public.user_business_memberships
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships my_membership
      WHERE my_membership.business_id = business_id
        AND my_membership.user_id = auth.uid()
    )
  );

-- INSERT: only owner or admin of the business can add members
DROP POLICY IF EXISTS "Owners and admins can add business members" ON public.user_business_memberships;
CREATE POLICY "Owners and admins can add business members"
  ON public.user_business_memberships
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role IN ('owner', 'admin')
    )
  );

-- UPDATE: only owner of the business can change member roles
DROP POLICY IF EXISTS "Owners can update business memberships" ON public.user_business_memberships;
CREATE POLICY "Owners can update business memberships"
  ON public.user_business_memberships
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );

-- DELETE: only owner of the business can remove members
DROP POLICY IF EXISTS "Owners can delete business memberships" ON public.user_business_memberships;
CREATE POLICY "Owners can delete business memberships"
  ON public.user_business_memberships
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_business_memberships ubm
      WHERE ubm.business_id = business_id
        AND ubm.user_id = auth.uid()
        AND ubm.role = 'owner'
    )
  );
