-- =============================================================================
-- Design Mockups — track when a mockup was published/uploaded to social media
-- =============================================================================
-- NULL  => not uploaded yet.
-- value => the mockup was marked as uploaded, and this is when it happened.
-- A single timestamp column carries both the flag and the date, so the grid can
-- show a checkmark and the day it was published without a second column.

ALTER TABLE public.design_mockups
  ADD COLUMN IF NOT EXISTS uploaded_at TIMESTAMPTZ;
