-- Design Pieces table for Xending Design Generator
-- Stores individual design pieces belonging to a campaign

CREATE TABLE IF NOT EXISTS public.design_pieces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES public.design_campaigns(id) ON DELETE CASCADE,
  headline text NOT NULL,
  subcopy text NOT NULL,
  cta text NOT NULL,
  image_id uuid,
  platform_format text NOT NULL,
  html_content text,
  png_url text,
  promoter_id text,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz DEFAULT now()
);

-- Index on campaign_id for fast campaign-scoped queries
CREATE INDEX IF NOT EXISTS idx_design_pieces_campaign_id
  ON public.design_pieces(campaign_id);

-- Enable Row Level Security
ALTER TABLE public.design_pieces ENABLE ROW LEVEL SECURITY;

-- Users can select pieces belonging to their own campaigns
CREATE POLICY "Users can view own design pieces"
  ON public.design_pieces
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );

-- Users can insert pieces into their own campaigns
CREATE POLICY "Users can create own design pieces"
  ON public.design_pieces
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );

-- Users can update pieces belonging to their own campaigns
CREATE POLICY "Users can update own design pieces"
  ON public.design_pieces
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );

-- Users can delete pieces belonging to their own campaigns
CREATE POLICY "Users can delete own design pieces"
  ON public.design_pieces
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.design_campaigns dc
      WHERE dc.id = campaign_id
        AND dc.user_id = auth.uid()
    )
  );
