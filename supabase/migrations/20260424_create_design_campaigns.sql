-- Design Campaigns table for Xending Design Generator
-- Stores campaign metadata: brand, brief, content type, partner, and status

CREATE TABLE IF NOT EXISTS public.design_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  brand text NOT NULL,
  name text NOT NULL,
  brief text NOT NULL,
  content_type text NOT NULL,
  status text NOT NULL DEFAULT 'draft',
  partner text NOT NULL DEFAULT 'none',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Index on user_id for fast user-scoped queries
CREATE INDEX IF NOT EXISTS idx_design_campaigns_user_id
  ON public.design_campaigns(user_id);

-- Enable Row Level Security
ALTER TABLE public.design_campaigns ENABLE ROW LEVEL SECURITY;

-- Users can select their own campaigns
CREATE POLICY "Users can view own design campaigns"
  ON public.design_campaigns
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Users can insert their own campaigns
CREATE POLICY "Users can create own design campaigns"
  ON public.design_campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users can update their own campaigns
CREATE POLICY "Users can update own design campaigns"
  ON public.design_campaigns
  FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

-- Users can delete their own campaigns
CREATE POLICY "Users can delete own design campaigns"
  ON public.design_campaigns
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- Auto-update updated_at on row changes
CREATE OR REPLACE FUNCTION public.update_design_campaigns_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_design_campaigns_updated_at
  BEFORE UPDATE ON public.design_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.update_design_campaigns_updated_at();
