-- =============================================================================
-- Carousel grouping for design_mockups
--
-- A carousel is a set of images that only means something in order: slide 3
-- makes no sense without slides 1 and 2. Without these columns the four
-- renders land in design_mockups as unrelated rows and SavedMockupsGrid shows
-- them shuffled by created_at, so there is no way to tell later which four
-- belonged together.
--
-- Both columns are nullable: every existing single-image mockup keeps NULL and
-- nothing about the current flow changes.
--
-- Depends on: design_mockups (20260501_extend_design_tables.sql).
-- Non-destructive: only additive ALTER ... IF NOT EXISTS.
-- =============================================================================

ALTER TABLE public.design_mockups
  -- Shared id for the slides of one carousel. Generated client-side when the
  -- carousel is created, so the four inserts can be independent.
  ADD COLUMN IF NOT EXISTS carousel_group_id UUID,
  -- 0-based reading order inside the group. Also the export order.
  ADD COLUMN IF NOT EXISTS carousel_index SMALLINT;

-- Reading a whole carousel in order is the only access pattern for these
-- columns, so the index covers exactly that.
CREATE INDEX IF NOT EXISTS idx_design_mockups_carousel
  ON public.design_mockups(carousel_group_id, carousel_index)
  WHERE carousel_group_id IS NOT NULL;

-- Keep the pair coherent: either the row belongs to a carousel and has both, or
-- it is a standalone mockup and has neither. A row with an index but no group
-- would be invisible to the grouped query and silently lost.
ALTER TABLE public.design_mockups
  DROP CONSTRAINT IF EXISTS design_mockups_carousel_pair_check;

ALTER TABLE public.design_mockups
  ADD CONSTRAINT design_mockups_carousel_pair_check
  CHECK (
    (carousel_group_id IS NULL AND carousel_index IS NULL)
    OR (carousel_group_id IS NOT NULL AND carousel_index IS NOT NULL AND carousel_index >= 0)
  );
