-- ============================================================
-- Migration 0006 — additive and safe:
--   • user_prefs            : per-account settings (which projects head the board)
--   • project_groups        : named, ordered "islands" of projects
--   • projects.group_id     : which island a project belongs to (0 or 1)
--   • projects.pinned       : hand-picked header selection ("custom" mode)
--   • versions.ship_date    : the milestone date a version is aiming at
--   • email_prefs.days      : which weekdays the reminder is allowed to send on
--   • email_prefs.sections  : accepts the new 'milestones' section
-- No data is destroyed. Run it in the Supabase SQL editor.
-- ============================================================

begin;

-- ---------- 1. Per-account preferences ----------
-- Kept apart from email_prefs: that table is about one feature, this one is
-- about the account. A missing row means "all defaults" (see DEFAULT_USER_PREFS).
create table if not exists public.user_prefs (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  header_mode text not null default 'favorites'
              check (header_mode in ('favorites','custom','groups')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists user_prefs_set_updated_at on public.user_prefs;
create trigger user_prefs_set_updated_at before update on public.user_prefs
  for each row execute function public.set_updated_at();

alter table public.user_prefs enable row level security;

drop policy if exists "user_prefs_select_own" on public.user_prefs;
create policy "user_prefs_select_own" on public.user_prefs for select using (auth.uid() = user_id);
drop policy if exists "user_prefs_insert_own" on public.user_prefs;
create policy "user_prefs_insert_own" on public.user_prefs for insert with check (auth.uid() = user_id);
drop policy if exists "user_prefs_update_own" on public.user_prefs;
create policy "user_prefs_update_own" on public.user_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_prefs_delete_own" on public.user_prefs;
create policy "user_prefs_delete_own" on public.user_prefs for delete using (auth.uid() = user_id);

-- ---------- 2. Project groups ("islands") ----------
create table if not exists public.project_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null,
  color_index smallint,                         -- palette index 0..5; null = auto
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists project_groups_user_idx on public.project_groups (user_id, position);

drop trigger if exists project_groups_set_updated_at on public.project_groups;
create trigger project_groups_set_updated_at before update on public.project_groups
  for each row execute function public.set_updated_at();

alter table public.project_groups enable row level security;

drop policy if exists "project_groups_select_own" on public.project_groups;
create policy "project_groups_select_own" on public.project_groups for select using (auth.uid() = user_id);
drop policy if exists "project_groups_insert_own" on public.project_groups;
create policy "project_groups_insert_own" on public.project_groups for insert with check (auth.uid() = user_id);
drop policy if exists "project_groups_update_own" on public.project_groups;
create policy "project_groups_update_own" on public.project_groups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "project_groups_delete_own" on public.project_groups;
create policy "project_groups_delete_own" on public.project_groups for delete using (auth.uid() = user_id);

-- ---------- 3. Projects gain a group and a pin ----------
-- on delete set null: deleting a group must never delete the work inside it.
alter table public.projects add column if not exists group_id uuid;
alter table public.projects drop constraint if exists projects_group_id_fkey;
alter table public.projects
  add constraint projects_group_id_fkey
  foreign key (group_id) references public.project_groups (id) on delete set null;

alter table public.projects add column if not exists pinned boolean not null default false;

create index if not exists projects_group_idx on public.projects (group_id, position);

-- ---------- 4. Version ship dates (milestones) ----------
alter table public.versions add column if not exists ship_date date;

create index if not exists versions_ship_date_idx
  on public.versions (project_id, ship_date)
  where ship_date is not null;

-- ---------- 5. Reminder weekdays ----------
-- 0 = Sunday … 6 = Saturday (matches JS getDay()). Default: every day, which is
-- what every existing user is getting today — the column changes nothing until
-- they narrow it.
alter table public.email_prefs
  add column if not exists days smallint[] not null default '{0,1,2,3,4,5,6}';

alter table public.email_prefs drop constraint if exists email_prefs_days_check;
alter table public.email_prefs add  constraint email_prefs_days_check
  check (days <@ array[0,1,2,3,4,5,6]::smallint[]);

-- ---------- 6. The allowed section list gains 'milestones' ----------
alter table public.email_prefs drop constraint if exists email_prefs_sections_check;
alter table public.email_prefs add  constraint email_prefs_sections_check
  check (sections <@ array['overdue','today','upcoming','undated','milestones']);

commit;
