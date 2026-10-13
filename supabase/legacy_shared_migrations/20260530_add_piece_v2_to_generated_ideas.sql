-- =============================================================================
-- Phase 6 — Persist V2 multi-channel piece on `generated_ideas`
--
-- Today `generated_ideas` only stores headline / subcopy / cta (the v1 shape).
-- The V2 master content prompt produces shared + overlays + captions per idea,
-- but those richer fields are lost when persisting because no column exists
-- for them.
--
-- This migration adds a single nullable JSONB column `piece_v2` that holds
-- the full V2 piece object exactly as emitted by `generate-ideas` (under
-- `metadata.pieces[i]`). The frontend reads it back when the user wants to
-- render the same idea across multiple platforms.
--
-- Backward compatible: legacy rows have piece_v2 = NULL and the multichannel
-- flow falls back to v1 fields (the user only gets the LinkedIn render).
-- =============================================================================

ALTER TABLE public.generated_ideas
  ADD COLUMN IF NOT EXISTS piece_v2 JSONB;

COMMENT ON COLUMN public.generated_ideas.piece_v2 IS
  'V2 multi-channel piece: { id, shared, overlays{professional,square,vertical}, captions{linkedin,facebook,instagram} }. NULL on legacy rows.';

-- Optional partial index for queries that filter by presence of v2 data.
-- Cheap because most pre-existing rows are NULL.
CREATE INDEX IF NOT EXISTS idx_generated_ideas_has_v2
  ON public.generated_ideas(business_id)
  WHERE piece_v2 IS NOT NULL;
