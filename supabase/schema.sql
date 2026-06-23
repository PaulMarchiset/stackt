-- ============================================================
-- Update Tracker — Supabase schema
-- Run this in the Supabase SQL editor (or via the CLI) once.
-- Every row is owned by a user; row-level security guarantees
-- each user only ever sees and edits their own data.
-- ============================================================

-- ---------- Projects ----------
create table if not exists public.projects (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name               text not null default 'New project',
  active_version     text not null default '',
  versions           text[] not null default '{}',
  completed_versions text[] not null default '{}',
  version_colors     jsonb  not null default '{}'::jsonb,
  position           integer not null default 0,
  created_at         timestamptz not null default now()
);

create index if not exists projects_user_idx on public.projects (user_id, position);

-- ---------- Cards ----------
create table if not exists public.cards (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  project_id  uuid not null references public.projects (id) on delete cascade,
  title       text not null default '',
  version     text not null default '',
  target_date date,
  status      text not null default 'todo' check (status in ('todo','inprogress','done')),
  done        boolean not null default false,
  type        text not null default 'update' check (type in ('update','bug')),
  position    integer not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists cards_project_idx on public.cards (project_id, status, position);
create index if not exists cards_user_idx on public.cards (user_id);

-- ---------- Row-level security ----------
alter table public.projects enable row level security;
alter table public.cards    enable row level security;

-- Projects: owner-only access.
drop policy if exists "projects_select_own" on public.projects;
create policy "projects_select_own" on public.projects
  for select using (auth.uid() = user_id);

drop policy if exists "projects_insert_own" on public.projects;
create policy "projects_insert_own" on public.projects
  for insert with check (auth.uid() = user_id);

drop policy if exists "projects_update_own" on public.projects;
create policy "projects_update_own" on public.projects
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "projects_delete_own" on public.projects;
create policy "projects_delete_own" on public.projects
  for delete using (auth.uid() = user_id);

-- Cards: owner-only, and the card's project must belong to the same user.
drop policy if exists "cards_select_own" on public.cards;
create policy "cards_select_own" on public.cards
  for select using (auth.uid() = user_id);

drop policy if exists "cards_insert_own" on public.cards;
create policy "cards_insert_own" on public.cards
  for insert with check (
    auth.uid() = user_id
    and exists (select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid())
  );

drop policy if exists "cards_update_own" on public.cards;
create policy "cards_update_own" on public.cards
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "cards_delete_own" on public.cards;
create policy "cards_delete_own" on public.cards
  for delete using (auth.uid() = user_id);

-- ---------- Seed a starter project for every new user ----------
-- Gives a friendly first-run experience instead of an empty screen.
create or replace function public.seed_first_project()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.projects (user_id, name, active_version)
  values (new.id, 'My first project', '');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_first_project();
