-- =============================================================================
-- Phase 6 — Task 11.1: Multi-Channel Copy Output (Overlays + Captions)
--
-- Adds columns to pipeline_pieces so a single generated idea can produce
-- one row per platform, each with its own:
--   - overlay variant (text rendered ON the image via the template engine)
--   - caption (text shown OUTSIDE the image, copy/pasted to the post)
--
-- The orchestrator maps platform → overlay_variant and platform → caption:
--
--   linkedin-post   → professional overlay + linkedin caption
--   facebook-post   → professional overlay + facebook caption
--   banner          → professional overlay + NO caption (NULL)
--   instagram-post  → square overlay + instagram caption (with hashtags)
--   instagram-story → vertical overlay + NO caption (NULL)
--
-- All new columns are nullable so existing rows remain valid (backward
-- compatible). The CHECK constraint on overlay_variant only enforces
-- valid values when the column is populated.
--
-- See:
--   - .kiro/specs/creative-os-pipeline/design.md → Componente 6.5
--   - .kiro/specs/creative-os-pipeline/requirements.md → Requirement 18
--   - docs/prompts/_drafts/masterContentPrompt.draft.md
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Add multi-channel columns to pipeline_pieces
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pipeline_pieces
  -- Which overlay variant was inyected into the template for this piece
  ADD COLUMN IF NOT EXISTS overlay_variant TEXT,
  -- Caption body (post text, OUTSIDE the image). NULL for banner / instagram-story.
  ADD COLUMN IF NOT EXISTS caption_body TEXT,
  -- Optional bullet points for linkedin / facebook captions, formatted with "▪"
  ADD COLUMN IF NOT EXISTS caption_bullets JSONB DEFAULT '[]'::jsonb,
  -- Hashtags for instagram-post captions only. Empty array for other platforms.
  ADD COLUMN IF NOT EXISTS caption_hashtags JSONB DEFAULT '[]'::jsonb;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. CHECK constraint for overlay_variant values
--    (NULL allowed for backward compatibility with existing rows)
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.pipeline_pieces
  DROP CONSTRAINT IF EXISTS valid_overlay_variant;

ALTER TABLE public.pipeline_pieces
  ADD CONSTRAINT valid_overlay_variant CHECK (
    overlay_variant IS NULL
    OR overlay_variant IN ('professional', 'square', 'vertical')
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Index for filtering pieces by overlay variant within a run
--    (used when the frontend queries pieces grouped by tab/platform)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_pipeline_pieces_overlay_variant
  ON public.pipeline_pieces(pipeline_run_id, overlay_variant)
  WHERE overlay_variant IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Comments for clarity in DB explorer
-- ─────────────────────────────────────────────────────────────────────────────

COMMENT ON COLUMN public.pipeline_pieces.overlay_variant IS
  'Which overlay variant was used: professional (LI/FB/Banner) | square (IG Post) | vertical (IG Story). NULL on legacy rows.';

COMMENT ON COLUMN public.pipeline_pieces.caption_body IS
  'Post caption (outside the image). NULL for banner and instagram-story (no caption).';

COMMENT ON COLUMN public.pipeline_pieces.caption_bullets IS
  'Optional bullet list formatted with "▪". Used in linkedin/facebook captions when applicable.';

COMMENT ON COLUMN public.pipeline_pieces.caption_hashtags IS
  'Hashtags for instagram-post captions only. Empty array for other platforms.';
