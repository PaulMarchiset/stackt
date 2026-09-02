-- ============================================================
-- Stackt — canonical schema (fresh install)
-- The reference state of the database. To create a fresh environment
-- (staging, a new dev machine, a self-hosted deployment), run THIS file once.
-- To EVOLVE an existing database, write a numbered migration in
-- supabase/migrations/ (0001, 0002, …) instead.
--
-- Regenerated after migration 0016. Two things changed shape since the last
-- version of this file, and both are worth reading before the SQL:
--
--   1. Access means MEMBERSHIP, not ownership. `projects.user_id` records who
--      created a project and nothing else — no policy reads it. Whether you can
--      see a project is whether there is a row for you in project_members.
--
--   2. Four columns left `projects` for `project_members`: remind, favorite,
--      position, group_id. They are opinions, not properties — with two people
--      on one board, "starred" and "third in my list" are things a person
--      thinks. Keeping them on the shared row meant starring something for your
--      collaborators and refiling it out from under them.
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
-- Personal to one account and never shared: your bands are how YOU file things.
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
-- Only what every member shares. See project_members for the rest.
create table if not exists public.projects (
  id                uuid primary key default gen_random_uuid(),
  -- Who created it. NOT an access key, and ON DELETE SET NULL rather than
  -- CASCADE: a project handed to someone else must outlive the person who made
  -- it (migration 0011). What happens to a project when its last owner closes
  -- their account is decided by delete_own_account(), below.
  user_id           uuid default auth.uid() references auth.users (id) on delete set null,
  name              text not null default 'New project',
  active_version_id uuid,                       -- FK added after the versions table (circular dependency)

  repo_url          text not null default '',
  dev_mode          boolean,                    -- null = follow the device default
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

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
  -- Who WROTE it. Like projects.user_id, not an access key, and SET NULL so a
  -- collaborator closing their account doesn't delete the team's cards.
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
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
create index if not exists cards_version_idx on public.cards (version_id);
create index if not exists cards_done_at_idx on public.cards (project_id, done_at desc nulls last) where done;

-- ---------- Membership: who can reach a project, and what they think of it ----------
-- Guarded rather than run blind: an enum has no IF NOT EXISTS, and this file
-- must stay re-runnable like every migration in the series.
do $$ begin
  create type public.project_role as enum ('owner', 'editor');
exception when duplicate_object then null;
end $$;

create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id)      on delete cascade,
  role       public.project_role not null default 'editor',

  -- The four opinions. Each person's own; never the project's.
  remind     boolean not null default false,  -- include it in MY daily email
  favorite   boolean not null default false,  -- starred by me
  position   integer not null default 0,      -- where I keep it in my order
  group_id   uuid references public.project_groups (id) on delete set null,

  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx  on public.project_members (user_id, position);
create index if not exists project_members_group_idx on public.project_members (user_id, group_id, position);

-- ---------- Invitations ----------
-- Addressed to an email, not a user: someone can be invited before they have an
-- account, and claim_project_invites() picks it up when they first sign in.
create table if not exists public.project_invites (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email      text not null,
  role       public.project_role not null default 'editor',
  invited_by uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '14 days'),
  unique (project_id, email)
);

create index if not exists project_invites_email_idx on public.project_invites (email);

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

-- ============================================================
-- Functions
-- ============================================================

-- ---------- The two questions every policy asks ----------
-- SECURITY DEFINER for one specific reason: a policy on project_members that
-- queried project_members would recurse forever. Running the lookup as the
-- owner steps outside RLS for that one read and breaks the cycle. Both answer
-- only about the CALLING user — auth.uid() is read inside, never passed in —
-- so neither can be aimed at someone else.
create or replace function public.is_project_member(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_owner(p uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p and m.user_id = (select auth.uid()) and m.role = 'owner'
  );
$$;

-- ---------- Creating a project ----------
-- An RPC rather than a plain insert, because a bare `insert … returning` has
-- its RETURNING checked by the SELECT policy — which asks whether you are a
-- member — before the AFTER trigger below has made you one. The row is created
-- and the refusal happens on the way back. See migration 0012.
create or replace function public.create_project(
  p_name text default 'New project', p_repo_url text default '', p_dev_mode boolean default null
)
returns public.projects language plpgsql security definer set search_path = public as $$
declare
  uid uuid := auth.uid();
  created public.projects;
begin
  if uid is null then raise exception 'create_project: no authenticated user'; end if;

  insert into public.projects (user_id, name, repo_url, dev_mode)
  values (uid, coalesce(nullif(btrim(p_name), ''), 'New project'), coalesce(p_repo_url, ''), p_dev_mode)
  returning * into created;

  insert into public.project_members (project_id, user_id, role)
  values (created.id, uid, 'owner')
  on conflict (project_id, user_id) do nothing;

  return created;
end;
$$;

-- ---------- A new project owns itself ----------
create or replace function public.add_project_owner()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

-- ---------- A project must never lose its last owner ----------
create or replace function public.forbid_last_owner_removal()
returns trigger language plpgsql set search_path = public as $$
begin
  -- Deleting the project cascades to every membership row, which would trip
  -- this guard and make projects undeletable. RI cascades run as AFTER triggers
  -- of the parent delete, so the project's absence here means "it is going".
  if not exists (select 1 from public.projects p where p.id = old.project_id) then
    return old;
  end if;

  if old.role = 'owner' and not exists (
    select 1 from public.project_members m
    where m.project_id = old.project_id and m.user_id <> old.user_id and m.role = 'owner'
  ) then
    raise exception 'project % would be left without an owner', old.project_id;
  end if;
  return old;
end;
$$;

-- ---------- Invitations ----------
create or replace function public.normalize_invite_email()
returns trigger language plpgsql as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

-- The address is read from auth.users for the CALLING user — never a parameter
-- — so nobody can claim an invitation addressed to someone else.
create or replace function public.claim_project_invites()
returns integer language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  addr text;
  taken integer := 0;
begin
  if uid is null then raise exception 'claim_project_invites: no authenticated user'; end if;

  select lower(u.email) into addr from auth.users u where u.id = uid;
  if addr is null then return 0; end if;

  insert into public.project_members (project_id, user_id, role)
  select i.project_id, uid, i.role
  from public.project_invites i
  where i.email = addr and i.expires_at > now()
  on conflict (project_id, user_id) do nothing;

  get diagnostics taken = row_count;
  delete from public.project_invites where email = addr;
  return taken;
end;
$$;

-- ---------- Membership administration ----------
-- Funnelled through functions rather than an UPDATE policy: RLS policies are
-- OR'd, so a policy permissive enough to let a member edit their own row would
-- also let them promote themselves. A function checks the two things apart.
create or replace function public.set_project_role(p uuid, target uuid, new_role public.project_role)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.is_project_owner(p) then
    raise exception 'set_project_role: not an owner of project %', p;
  end if;
  update public.project_members set role = new_role where project_id = p and user_id = target;
end;
$$;

create or replace function public.remove_project_member(p uuid, target uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- An owner removes anyone; anyone removes themselves. The last-owner trigger
  -- still has the final word.
  if not (public.is_project_owner(p) or target = (select auth.uid())) then
    raise exception 'remove_project_member: not permitted on project %', p;
  end if;
  delete from public.project_members where project_id = p and user_id = target;
end;
$$;

-- ---------- What the sharing panel renders ----------
-- SECURITY DEFINER, which is exactly why both check the caller in their WHERE.
-- Without that test these would let anyone enumerate the email address of
-- everyone on any project in the database. The guard IS the access control.
create or replace function public.project_members_detailed(p uuid)
returns table (user_id uuid, email text, role public.project_role, joined_at timestamptz)
language sql stable security definer set search_path = public, auth as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.project_members m
  join auth.users u on u.id = m.user_id
  where m.project_id = p and public.is_project_member(p)
  order by (m.role = 'owner') desc, m.created_at, m.user_id;
$$;

create or replace function public.project_invites_pending(p uuid)
returns table (id uuid, email text, role public.project_role, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.email, i.role, i.expires_at
  from public.project_invites i
  where i.project_id = p and public.is_project_owner(p) and i.expires_at > now()
  order by i.created_at;
$$;

-- ---------- Deleting an account ----------
-- The handover rule lives here, not in the client: a dialog can be skipped and
-- a direct POST bypasses it, and a half-finished deletion must never strand
-- somebody else's project. The UI prompt overrides this default; it does not
-- replace it.
create or replace function public.delete_own_account()
returns void language plpgsql security definer set search_path = public, auth as $$
declare
  uid uuid := auth.uid();
  proj record;
  heir uuid;
begin
  if uid is null then raise exception 'delete_own_account: no authenticated user'; end if;

  for proj in
    select m.project_id from public.project_members m
    where m.user_id = uid and m.role = 'owner'
      and not exists (
        select 1 from public.project_members o
        where o.project_id = m.project_id and o.user_id <> uid and o.role = 'owner'
      )
  loop
    select o.user_id into heir
    from public.project_members o
    where o.project_id = proj.project_id and o.user_id <> uid
    order by o.created_at, o.user_id
    limit 1;

    if heir is null then
      delete from public.projects where id = proj.project_id;   -- nobody else was here
    else
      update public.project_members set role = 'owner'
      where project_id = proj.project_id and user_id = heir;
    end if;
  end loop;

  delete from auth.users where id = uid;
end;
$$;

-- ---------- Seed a starter project for every new user ----------
create or replace function public.seed_first_project()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.projects (user_id, name) values (new.id, 'My first project');
  return new;
end;
$$;

-- ============================================================
-- Triggers
-- ============================================================

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

drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_project_owner();

drop trigger if exists project_members_keep_owner on public.project_members;
create trigger project_members_keep_owner before delete on public.project_members
  for each row execute function public.forbid_last_owner_removal();

drop trigger if exists project_invites_normalize on public.project_invites;
create trigger project_invites_normalize before insert or update on public.project_invites
  for each row execute function public.normalize_invite_email();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.seed_first_project();

-- ============================================================
-- Grants and row-level security
-- ============================================================

alter table public.projects        enable row level security;
alter table public.project_groups  enable row level security;
alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;
alter table public.versions        enable row level security;
alter table public.cards           enable row level security;
alter table public.email_prefs     enable row level security;
alter table public.user_prefs      enable row level security;

-- Spelled out rather than inherited from the schema's default privileges. RLS
-- narrows what a role may touch; it never widens it, so a policy on a table the
-- role has no grant on simply never applies.
--
-- Note what `authenticated` is NOT given on project_members: INSERT, and every
-- UPDATE column except the three opinions. Rows are created only by
-- add_project_owner() and claim_project_invites(), which are SECURITY DEFINER.
-- "You cannot add yourself to a project" and "you cannot promote yourself" are
-- enforced by missing privileges, not by a policy anyone could argue with.
grant select, delete on public.project_members to authenticated;
grant update (remind, favorite, position, group_id) on public.project_members to authenticated;
grant select, insert, delete on public.project_invites to authenticated;

revoke all on function public.is_project_member(uuid)        from public, anon;
revoke all on function public.is_project_owner(uuid)         from public, anon;
revoke all on function public.create_project(text, text, boolean) from public, anon;
revoke all on function public.claim_project_invites()        from public, anon;
revoke all on function public.set_project_role(uuid, uuid, public.project_role) from public, anon;
revoke all on function public.remove_project_member(uuid, uuid) from public, anon;
revoke all on function public.project_members_detailed(uuid) from public, anon;
revoke all on function public.project_invites_pending(uuid)  from public, anon;
revoke all on function public.delete_own_account()           from public, anon;

grant execute on function public.is_project_member(uuid)        to authenticated;
grant execute on function public.is_project_owner(uuid)         to authenticated;
grant execute on function public.create_project(text, text, boolean) to authenticated;
grant execute on function public.claim_project_invites()        to authenticated;
grant execute on function public.set_project_role(uuid, uuid, public.project_role) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;
grant execute on function public.project_members_detailed(uuid) to authenticated;
grant execute on function public.project_invites_pending(uuid)  to authenticated;
grant execute on function public.delete_own_account()           to authenticated;

-- ---------- projects ----------
-- Membership everywhere except DELETE, which stays with the owner: an editor
-- removing the project would take the other members' work with it.
drop policy if exists "projects_select_member" on public.projects;
create policy "projects_select_member" on public.projects for select
  using (public.is_project_member(id));

drop policy if exists "projects_insert_self" on public.projects;
create policy "projects_insert_self" on public.projects for insert
  with check (user_id = (select auth.uid()));

drop policy if exists "projects_update_member" on public.projects;
create policy "projects_update_member" on public.projects for update
  using (public.is_project_member(id)) with check (public.is_project_member(id));

drop policy if exists "projects_delete_owner" on public.projects;
create policy "projects_delete_owner" on public.projects for delete
  using (public.is_project_owner(id));

-- ---------- project_members ----------
drop policy if exists "members_select" on public.project_members;
create policy "members_select" on public.project_members for select
  using (public.is_project_member(project_id));

drop policy if exists "members_update_self" on public.project_members;
create policy "members_update_self" on public.project_members for update
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "members_delete" on public.project_members;
create policy "members_delete" on public.project_members for delete
  using (user_id = (select auth.uid()) or public.is_project_owner(project_id));

-- ---------- project_invites ----------
-- Owner-only throughout. An invitee never reads this table —
-- claim_project_invites() acts for them — so a pending invitation cannot be
-- used to discover who has a Stackt account.
drop policy if exists "invites_select_owner" on public.project_invites;
create policy "invites_select_owner" on public.project_invites for select
  using (public.is_project_owner(project_id));

drop policy if exists "invites_insert_owner" on public.project_invites;
create policy "invites_insert_owner" on public.project_invites for insert
  with check (public.is_project_owner(project_id) and invited_by = (select auth.uid()));

drop policy if exists "invites_delete_owner" on public.project_invites;
create policy "invites_delete_owner" on public.project_invites for delete
  using (public.is_project_owner(project_id));

-- ---------- versions ----------
drop policy if exists "versions_select_member" on public.versions;
create policy "versions_select_member" on public.versions for select
  using (public.is_project_member(project_id));
drop policy if exists "versions_insert_member" on public.versions;
create policy "versions_insert_member" on public.versions for insert
  with check (public.is_project_member(project_id));
drop policy if exists "versions_update_member" on public.versions;
create policy "versions_update_member" on public.versions for update
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
drop policy if exists "versions_delete_member" on public.versions;
create policy "versions_delete_member" on public.versions for delete
  using (public.is_project_member(project_id));

-- ---------- cards ----------
-- cards.user_id is "who wrote it" and nothing more, which is why none of these
-- four mentions it: a card authored by a collaborator has to stay editable by
-- the rest of the project.
drop policy if exists "cards_select_member" on public.cards;
create policy "cards_select_member" on public.cards for select
  using (public.is_project_member(project_id));
drop policy if exists "cards_insert_member" on public.cards;
create policy "cards_insert_member" on public.cards for insert
  with check (public.is_project_member(project_id) and user_id = (select auth.uid()));
drop policy if exists "cards_update_member" on public.cards;
create policy "cards_update_member" on public.cards for update
  using (public.is_project_member(project_id)) with check (public.is_project_member(project_id));
drop policy if exists "cards_delete_member" on public.cards;
create policy "cards_delete_member" on public.cards for delete
  using (public.is_project_member(project_id));

-- ---------- Personal tables: owner-only, never shared ----------
drop policy if exists "project_groups_select_own" on public.project_groups;
create policy "project_groups_select_own" on public.project_groups for select using (auth.uid() = user_id);
drop policy if exists "project_groups_insert_own" on public.project_groups;
create policy "project_groups_insert_own" on public.project_groups for insert with check (auth.uid() = user_id);
drop policy if exists "project_groups_update_own" on public.project_groups;
create policy "project_groups_update_own" on public.project_groups for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "project_groups_delete_own" on public.project_groups;
create policy "project_groups_delete_own" on public.project_groups for delete using (auth.uid() = user_id);

drop policy if exists "email_prefs_select_own" on public.email_prefs;
create policy "email_prefs_select_own" on public.email_prefs for select using (auth.uid() = user_id);
drop policy if exists "email_prefs_insert_own" on public.email_prefs;
create policy "email_prefs_insert_own" on public.email_prefs for insert with check (auth.uid() = user_id);
drop policy if exists "email_prefs_update_own" on public.email_prefs;
create policy "email_prefs_update_own" on public.email_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "email_prefs_delete_own" on public.email_prefs;
create policy "email_prefs_delete_own" on public.email_prefs for delete using (auth.uid() = user_id);

drop policy if exists "user_prefs_select_own" on public.user_prefs;
create policy "user_prefs_select_own" on public.user_prefs for select using (auth.uid() = user_id);
drop policy if exists "user_prefs_insert_own" on public.user_prefs;
create policy "user_prefs_insert_own" on public.user_prefs for insert with check (auth.uid() = user_id);
drop policy if exists "user_prefs_update_own" on public.user_prefs;
create policy "user_prefs_update_own" on public.user_prefs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "user_prefs_delete_own" on public.user_prefs;
create policy "user_prefs_delete_own" on public.user_prefs for delete using (auth.uid() = user_id);

-- ============================================================
-- Realtime
-- ============================================================
-- REPLICA IDENTITY FULL is not optional: by default Postgres puts only the
-- primary key of the OLD row into the WAL, and realtime evaluates our policies
-- against that old row to decide who may be told. is_project_member(project_id)
-- needs project_id to be there — without FULL, updates reach nobody and deletes
-- never arrive.
alter table public.cards    replica identity full;
alter table public.versions replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cards') then
    alter publication supabase_realtime add table public.cards;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'versions') then
    alter publication supabase_realtime add table public.versions;
  end if;
end $$;
