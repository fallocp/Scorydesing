-- ---------------------------------------------------------------------------
-- Copy bank: usage tracking + image metadata
-- ---------------------------------------------------------------------------
-- Two additions needed to actually USE the 180 seeded copies from Design Studio:
--
--   used_at / used_note  With ~8 months of content sitting in the bank, the
--                        first question every week is "which ones did I already
--                        publish". Cheap now, painful to retrofit later.
--
--   image_meta           The image prompt is generated per copy and must persist
--                        with it. In the v1 flow this lived in
--                        generated_ideas.piece_v2; here it gets its own column,
--                        scoped to image concerns only.
-- ---------------------------------------------------------------------------

alter table public.copy_bank_items
  add column if not exists used_at timestamptz,
  add column if not exists used_note text,
  add column if not exists used_by uuid references auth.users (id) on delete set null,
  add column if not exists image_meta jsonb;

comment on column public.copy_bank_items.used_at is
  'Set when the copy has been published or turned into a finished piece. Null = available.';
comment on column public.copy_bank_items.image_meta is
  'Image prompt state for this copy: { imageType, imagePrompt, imagePromptRevision, masterImagePromptVersion, imageBackgroundStyle, corridorOverride, corridorAnalysis }. Mirrors the image half of generated_ideas.piece_v2.';

-- The bank list is always filtered by availability, so index the unused subset.
create index if not exists copy_bank_items_unused_idx
  on public.copy_bank_items (business_id, branch_slug, corridor, angle_tag)
  where used_at is null and status in ('approved', 'seed');
