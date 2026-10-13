-- Xending News — replace the inert 'special' edition type with 'flash'.
--
-- The 'special' edition type was never wired to any distinct behavior (the
-- planner and visual builder ignored it). It is replaced by 'flash': a short
-- 1–3 piece edition for urgent/standalone notes (Fed/Banxico rate decisions,
-- breaking notes) that reuses the same resolver, archetypes and style.
--
-- Part of the Xending News module (see docs/xending-news/).

-- 1. Migrate any existing rows off the removed 'special' value.
--    'special' behaved exactly like 'daily', so they fold into 'daily'.
UPDATE public.news_editions
SET edition_type = 'daily'
WHERE edition_type = 'special';

-- 2. Swap the CHECK constraint to the new allowed set.
ALTER TABLE public.news_editions
  DROP CONSTRAINT IF EXISTS valid_news_edition_type;

ALTER TABLE public.news_editions
  ADD CONSTRAINT valid_news_edition_type CHECK (edition_type IN ('daily', 'flash'));
