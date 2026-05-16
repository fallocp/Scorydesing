-- =============================================================================
-- Design Library — Biblioteca de diseños finales renderizados
-- =============================================================================
-- Almacena diseños terminados (template + copy + foto + formato) con versionado.
-- Separada de image_library (que guarda assets/fotos crudas).
--
-- Relaciones:
--   business_id → business_tenants
--   commercial_branch_id → commercial_branches (rama: velocidad, ahorro, etc.)
--   narrative_angle_id → narrative_angles (ángulo: problema oculto, dato duro, etc.)
--   image_id → image_library (foto/asset usado en el diseño)
--   campaign_id → design_campaigns (campaña origen, opcional)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.design_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.business_tenants(id) ON DELETE CASCADE,

  -- Taxonomía
  commercial_branch_id uuid REFERENCES public.commercial_branches(id) ON DELETE SET NULL,
  narrative_angle_id uuid REFERENCES public.narrative_angles(id) ON DELETE SET NULL,
  funnel_stage text CHECK (funnel_stage IN ('atraccion', 'conexion', 'conversion')),

  -- Copy
  headline text NOT NULL,
  subcopy text NOT NULL,
  cta text NOT NULL,

  -- Imagen usada
  image_id uuid REFERENCES public.image_library(id) ON DELETE SET NULL,

  -- Formato y template
  platform_format text NOT NULL CHECK (platform_format IN (
    'instagram-story', 'instagram-post', 'linkedin-post', 'banner'
  )),
  template_id text NOT NULL, -- card-light, card-dark, card-coral, etc.

  -- Versionado
  version_number integer NOT NULL DEFAULT 1,
  is_active boolean NOT NULL DEFAULT true,

  -- Contenido renderizado
  html_content text,
  rendered_url text, -- URL en storage del PNG final

  -- Promotor (opcional)
  promoter_name text,
  promoter_role text,
  promoter_photo text,

  -- Origen
  campaign_id uuid REFERENCES public.design_campaigns(id) ON DELETE SET NULL,
  piece_id uuid REFERENCES public.design_pieces(id) ON DELETE SET NULL,

  -- Metadata
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'ready', 'approved', 'published')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_design_library_business
  ON public.design_library(business_id);
CREATE INDEX IF NOT EXISTS idx_design_library_branch
  ON public.design_library(commercial_branch_id);
CREATE INDEX IF NOT EXISTS idx_design_library_angle
  ON public.design_library(narrative_angle_id);
CREATE INDEX IF NOT EXISTS idx_design_library_format
  ON public.design_library(platform_format);
CREATE INDEX IF NOT EXISTS idx_design_library_branch_angle
  ON public.design_library(commercial_branch_id, narrative_angle_id);
CREATE INDEX IF NOT EXISTS idx_design_library_active
  ON public.design_library(business_id, is_active) WHERE is_active = true;

-- =============================================================================
-- Row Level Security
-- =============================================================================
ALTER TABLE public.design_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members can view designs"
  ON public.design_library FOR SELECT TO authenticated
  USING (public.user_is_member_of(business_id));

CREATE POLICY "Members can create designs"
  ON public.design_library FOR INSERT TO authenticated
  WITH CHECK (public.user_is_member_of(business_id));

CREATE POLICY "Members can update designs"
  ON public.design_library FOR UPDATE TO authenticated
  USING (public.user_is_member_of(business_id));

CREATE POLICY "Members can delete designs"
  ON public.design_library FOR DELETE TO authenticated
  USING (public.user_is_member_of(business_id));

-- =============================================================================
-- Trigger: updated_at automático
-- =============================================================================
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_design_library_updated_at ON public.design_library;
CREATE TRIGGER trg_design_library_updated_at
  BEFORE UPDATE ON public.design_library
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
