-- ---------------------------------------------------------------------------
-- Copy bank v2
-- ---------------------------------------------------------------------------
-- Persistent, curated bank of copy for masterCopyPrompt v2.
--
-- Deliberately a new table instead of extending `generated_ideas`:
--   * generated_ideas.piece_v2 is already overloaded with Design Studio image
--     metadata, and this data needs indexable columns, not JSONB
--   * the weekly proposal job queries by angle_tag / corridor / status on every
--     run, so those must be real columns with indexes
--   * this is a long-lived brand asset, not per-session output
--
-- generated_ideas stays untouched and keeps serving the v1 flow.
-- ---------------------------------------------------------------------------

create table if not exists public.copy_bank_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_tenants (id) on delete cascade,

  -- Editorial coordinates. branch_slug resolves a copy kit (see
  -- _shared/copyKitRegistry.ts); corridor and industry are slugs from that kit.
  branch_slug text not null,
  corridor text,
  industry text,

  -- The copy itself.
  headline text not null,
  subcopy text not null,
  cta text not null,
  cta_alt text[] not null default '{}',

  -- Taxonomy. angle_tag drives the quota math; angle_label is free description.
  angle_tag text,
  angle_label text,
  formula text,
  tone_bucket text,

  -- Compliance.
  needs_legal_note boolean not null default false,
  legal_note text,

  -- Lifecycle. 'seed' marks the 180 human-written copies imported at rollout;
  -- they count toward the bank but are never edited by the agent.
  status text not null default 'proposed'
    check (status in ('proposed', 'approved', 'rejected', 'seed', 'archived')),
  review_note text,

  -- Provenance, so a bad batch can be traced to its prompt revision.
  prompt_revision text,
  kit_version text,
  model text,
  source text not null default 'agent'
    check (source in ('agent', 'seed', 'manual')),
  -- Groups a weekly proposal batch, e.g. '2026-W32'.
  week_batch text,

  -- Lint findings from validateCopyV2 at generation time.
  lint jsonb,

  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.copy_bank_items is
  'Curated copy bank for masterCopyPrompt v2. One text block per row (headline/subcopy/cta). Seeded from the 180 approved human-written copies.';
comment on column public.copy_bank_items.angle_tag is
  'Angle slug from the branch copy kit. Drives the quota deficit computation in analyzeCopyBank.ts.';
comment on column public.copy_bank_items.status is
  'seed = human-written rollout batch; proposed = awaiting review; approved = counts as gold standard.';

-- Indexes match the queries in analyzeCopyBank.computeBankState and the weekly
-- proposal job: always business + branch + status, often + corridor.
create index if not exists copy_bank_items_scope_idx
  on public.copy_bank_items (business_id, branch_slug, status, created_at desc);

create index if not exists copy_bank_items_corridor_idx
  on public.copy_bank_items (business_id, branch_slug, corridor, status);

create index if not exists copy_bank_items_angle_idx
  on public.copy_bank_items (business_id, branch_slug, angle_tag)
  where status in ('approved', 'seed');

create index if not exists copy_bank_items_week_idx
  on public.copy_bank_items (business_id, week_batch)
  where week_batch is not null;

-- Same headline twice in the same branch+corridor is a duplicate. Across
-- corridors it is fine: "Tu opción habitual no tiene que ser la única" exists
-- once for china_asia and once for internacional_general in the approved bank.
create unique index if not exists copy_bank_items_headline_unique_idx
  on public.copy_bank_items (business_id, branch_slug, coalesce(corridor, ''), lower(headline))
  where status in ('approved', 'seed');

-- ---------------------------------------------------------------------------
-- copy_kits — optional DB override of the code kits
-- ---------------------------------------------------------------------------
-- Read only when COPY_KIT_SOURCE=database. Mirrors the master_prompts pattern:
-- code is the default, DB lets an editor tune the editorial layer without a
-- redeploy.

create table if not exists public.copy_kits (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.business_tenants (id) on delete cascade,
  branch_slug text not null,
  kit_version text not null,
  kit jsonb not null,
  is_active boolean not null default true,
  notes text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.copy_kits is
  'Optional DB override for the branch editorial layer. Only read when COPY_KIT_SOURCE=database; otherwise the code kits in _shared/copy-kits win.';

create index if not exists copy_kits_lookup_idx
  on public.copy_kits (business_id, branch_slug, is_active, created_at desc);

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists copy_bank_items_updated_at on public.copy_bank_items;
create trigger copy_bank_items_updated_at
  before update on public.copy_bank_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS — same membership pattern as the rest of the schema
-- ---------------------------------------------------------------------------

alter table public.copy_bank_items enable row level security;
alter table public.copy_kits enable row level security;

drop policy if exists copy_bank_items_member_select on public.copy_bank_items;
create policy copy_bank_items_member_select
  on public.copy_bank_items for select
  using (
    exists (
      select 1 from public.user_business_memberships ubm
      where ubm.business_id = copy_bank_items.business_id
        and ubm.user_id = auth.uid()
    )
  );

drop policy if exists copy_bank_items_member_insert on public.copy_bank_items;
create policy copy_bank_items_member_insert
  on public.copy_bank_items for insert
  with check (
    exists (
      select 1 from public.user_business_memberships ubm
      where ubm.business_id = copy_bank_items.business_id
        and ubm.user_id = auth.uid()
    )
  );

drop policy if exists copy_bank_items_member_update on public.copy_bank_items;
create policy copy_bank_items_member_update
  on public.copy_bank_items for update
  using (
    exists (
      select 1 from public.user_business_memberships ubm
      where ubm.business_id = copy_bank_items.business_id
        and ubm.user_id = auth.uid()
    )
  );

drop policy if exists copy_bank_items_member_delete on public.copy_bank_items;
create policy copy_bank_items_member_delete
  on public.copy_bank_items for delete
  using (
    exists (
      select 1 from public.user_business_memberships ubm
      where ubm.business_id = copy_bank_items.business_id
        and ubm.user_id = auth.uid()
    )
  );

drop policy if exists copy_kits_member_select on public.copy_kits;
create policy copy_kits_member_select
  on public.copy_kits for select
  using (
    exists (
      select 1 from public.user_business_memberships ubm
      where ubm.business_id = copy_kits.business_id
        and ubm.user_id = auth.uid()
    )
  );

drop policy if exists copy_kits_member_write on public.copy_kits;
create policy copy_kits_member_write
  on public.copy_kits for all
  using (
    exists (
      select 1 from public.user_business_memberships ubm
      where ubm.business_id = copy_kits.business_id
        and ubm.user_id = auth.uid()
    )
  );
