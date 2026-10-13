-- Design Images table for Xending Design Generator
-- Stores image metadata: brand, source, storage path, tags, and usage tracking

CREATE TABLE IF NOT EXISTS public.design_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand text NOT NULL,
  source text NOT NULL,
  storage_path text NOT NULL,
  description text NOT NULL,
  tags text[] DEFAULT '{}',
  theme text,
  prompt_used text,
  campaign_id uuid REFERENCES public.design_campaigns(id) ON DELETE SET NULL,
  usage_count integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Index on brand for brand-scoped queries
CREATE INDEX IF NOT EXISTS idx_design_images_brand
  ON public.design_images(brand);

-- GIN index on tags for array containment queries (@>, &&)
CREATE INDEX IF NOT EXISTS idx_design_images_tags
  ON public.design_images USING GIN (tags);

-- Enable Row Level Security
ALTER TABLE public.design_images ENABLE ROW LEVEL SECURITY;

-- All authenticated users can browse the image library
CREATE POLICY "Authenticated users can view all design images"
  ON public.design_images
  FOR SELECT
  TO authenticated
  USING (true);

-- Users can insert images linked to their own campaigns (or unlinked stock)
CREATE POLICY "Users can create design images"
  ON public.design_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    campaign_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );

-- Users can update images linked to their own campaigns (or unlinked stock)
CREATE POLICY "Users can update own design images"
  ON public.design_images
  FOR UPDATE
  TO authenticated
  USING (
    campaign_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );

-- Users can delete images linked to their own campaigns (or unlinked stock)
CREATE POLICY "Users can delete own design images"
  ON public.design_images
  FOR DELETE
  TO authenticated
  USING (
    campaign_id IS NULL
    OR EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );
