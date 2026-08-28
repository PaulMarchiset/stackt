-- ============================================================
-- Stackt — canonical schema (fresh install)
-- The reference state of the database. To create a fresh environment
-- (staging, a new dev machine), run THIS file once.
-- To EVOLVE an existing database, write a numbered migration in
-- supabase/migrations/ (0001, 0002, …) instead.
--
-- Every row is owned by a user; RLS guarantees each person only ever
-- sees and modifies their own data.
-- ============================================================

-- ---------- Utility functions ----------
-- Touches updated_at on every UPDATE (light audit trail, useful as we scale).
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- Per-account preferences ----------
-- Deliberately separate from email_prefs: that table is about one feature, this
-- one is about the account. A missing row means "all defaults".
create table if not exists public.user_prefs (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  -- What heads the board, in order: [{kind:'favorites'}, {kind:'group',id}, …].
  -- Ids inside the list are deliberately not foreign keys (see migration 0007).
  header_items jsonb not null default '[{"kind": "favorites"}]'::jsonb
               check (jsonb_typeof(header_items) = 'array'),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- ---------- Project groups ("islands" in the board header) ----------
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

-- ---------- Projects ----------
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name              text not null default 'New project',
  active_version_id uuid,                       -- FK added after the versions table (circular dependency)
  group_id          uuid references public.project_groups (id) on delete set null,
  favorite          boolean not null default false,

  repo_url          text not null default '',
  dev_mode          boolean,                    -- null = follow the device default
  remind            boolean not null default false,
  position          integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists projects_user_idx  on public.projects (user_id, position);
create index if not exists projects_group_idx on public.projects (group_id, position);

-- ---------- Versions ----------
create table if not exists public.versions (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  name         text not null,
  color_index  smallint,                        -- palette index 0..5; null = auto
  completed    boolean not null default false,
  completed_at timestamptz,                     -- when it was marked completed; null while open
  ship_date    date,                            -- the milestone this version aims at
  position     integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists versions_project_idx on public.versions (project_id, position);

-- Completed versions are listed most recently completed first.
create index if not exists versions_completed_at_idx
  on public.versions (project_id, completed_at desc nulls last)
  where completed;

create index if not exists versions_ship_date_idx
  on public.versions (project_id, ship_date)
  where ship_date is not null;

-- A project's active version references versions (added now the table exists).
alter table public.projects
  drop constraint if exists projects_active_version_id_fkey;
alter table public.projects
  add constraint projects_active_version_id_fkey
  foreign key (active_version_id) references public.versions (id) on delete set null;

-- ---------- Cards ----------
create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  version_id  uuid references public.versions (id) on delete set null,
  title       text not null default '',
  comment     text not null default '',
  branch      text not null default '',
  target_date date,
  end_date    date,
  status      text not null default 'todo' check (status in ('todo','inprogress','done')),
  done        boolean not null default false,
  done_at     timestamptz,  -- when the card was checked (drives the Done column order)
  type        text not null default 'update' check (type in ('update','bug')),
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists cards_project_idx on public.cards (project_id, status, position);
create index if not exists cards_user_idx    on public.cards (user_id);
create index if not exists cards_version_idx  on public.cards (version_id);
create index if not exists cards_done_at_idx  on public.cards (project_id, done_at desc nulls last) where done;

-- ---------- Email reminder preferences ----------
create table if not exists public.email_prefs (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  enabled      boolean not null default true,
  subject      text,
  horizon_days integer not null default 3 check (horizon_days between 0 and 30),
  sections     text[] not null default '{overdue,today,upcoming}'
               check (sections <@ array['overdue','today','upcoming','undated','milestones']),
  -- Which weekdays the reminder may send on. 0 = Sunday … 6 = Saturday, matching
  -- JS getDay(); the weekday is resolved in the cron's reference timezone.
  days         smallint[] not null default '{0,1,2,3,4,5,6}'
               check (days <@ array[0,1,2,3,4,5,6]::smallint[]),
  updated_at   timestamptz not null default now()
);

-- ---------- updated_at triggers ----------
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists versions_set_updated_at on public.versions;
create trigger versions_set_updated_at before update on public.versions
  for each row execute function public.set_updated_at();

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

drop trigger if exists email_prefs_set_updated_at on public.email_prefs;
create trigger email_prefs_set_updated_at before update on public.email_prefs
  for each row execute function public.set_updated_at();

drop trigger if exists user_prefs_set_updated_at on public.user_prefs;
create trigger user_prefs_set_updated_at before update on public.user_prefs
  for each row execute function public.set_updated_at();

drop trigger if exists project_groups_set_updated_at on public.project_groups;
create trigger project_groups_set_updated_at before update on public.project_groups
  for each row execute function public.set_updated_at();

-- ---------- Row-level security ----------
alter table public.projects       enable row level security;
alter table public.project_groups enable row level security;
alter table public.versions       enable row level security;
alter table public.cards          enable row level security;
alter table public.email_prefs    enable row level security;
alter table public.user_prefs     enable row level security;

-- Projects: owner-only.
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects for select using (auth.uid() = user_id);
drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects for insert with check (auth.uid() = user_id);
drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects for delete using (auth.uid() = user_id);

-- Project groups: owner-only.
drop policy if exists "project_groups_select_own" on public.project_groups;
create policy "project_groups_select_own" on public.project_groups for select using (auth.uid() = user_id);
drop policy if exists "project_groups_insert_own" on public.project_groups;
create policy "project_groups_insert_own" on public.project_groups for insert with check (auth.uid() = user_id);
drop policy if exists "project_groups_update_own" on public.project_groups;
create policy "project_groups_update_own" on public.project_groups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "project_groups_delete_own" on public.project_groups;
create policy "project_groups_delete_own" on public.project_groups for delete using (auth.uid() = user_id);

-- Versions: accessible only if the parent project belongs to the user.
drop policy if exists "versions_select_own" on public.versions;
create policy "versions_select_own" on public.versions for select
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
drop policy if exists "versions_insert_own" on public.versions;
create policy "versions_insert_own" on public.versions for insert
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
drop policy if exists "versions_update_own" on public.versions;
create policy "versions_update_own" on public.versions for update
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
drop policy if exists "versions_delete_own" on public.versions;
create policy "versions_delete_own" on public.versions for delete
  using (exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- Cards: owner-only, and the parent project must belong to the same user.
drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards for select using (auth.uid() = user_id);
drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards for insert with check (
  auth.uid() = user_id
  and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));
drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards for delete using (auth.uid() = user_id);

-- Email prefs: owner-only.
drop policy if exists "email_prefs_select_own" on public.email_prefs;
create policy "email_prefs_select_own" on public.email_prefs for select using (auth.uid() = user_id);
drop policy if exists "email_prefs_insert_own" on public.email_prefs;
create policy "email_prefs_insert_own" on public.email_prefs for insert with check (auth.uid() = user_id);
drop policy if exists "email_prefs_update_own" on public.email_prefs;
create policy "email_prefs_update_own" on public.email_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "email_prefs_delete_own" on public.email_prefs;
create policy "email_prefs_delete_own" on public.email_prefs for delete using (auth.uid() = user_id);

-- User prefs: owner-only.
drop policy if exists "user_prefs_select_own" on public.user_prefs;
create policy "user_prefs_select_own" on public.user_prefs for select using (auth.uid() = user_id);
drop policy if exists "user_prefs_insert_own" on public.user_prefs;
create policy "user_prefs_insert_own" on public.user_prefs for insert with check (auth.uid() = user_id);
drop policy if exists "user_prefs_update_own" on public.user_prefs;
create policy "user_prefs_update_own" on public.user_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_prefs_delete_own" on public.user_prefs;
create policy "user_prefs_delete_own" on public.user_prefs for delete using (auth.uid() = user_id);

-- ---------- Seed a starter project for every new user ----------
create or replace function public.seed_first_project()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.projects (user_id, name) values (new.id, 'My first project');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_first_project();
