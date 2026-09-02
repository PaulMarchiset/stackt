-- ============================================================
-- Migration 0010 — additive and safe:
--   • project_members  : who can reach a project, and in what role
--   • project_invites  : an invitation addressed to an email, account or not
--   • RLS rewritten off ownership and onto membership
--
-- The shape of the change: access used to mean "projects.user_id = auth.uid()".
-- It now means "there is a row for me in project_members". projects.user_id
-- stays, but only as a record of who created it — NOTHING derives access from
-- it any more, and no policy below reads it.
--
-- Nothing is dropped. projects.remind / favorite / position are copied into
-- project_members and left in place, unread, until the client switches over;
-- a later migration removes them (the 0007 → 0008 pattern).
--
-- Run it in the Supabase SQL editor.
-- ============================================================

begin;

-- ---------- Roles ----------
-- Two, deliberately. An editor does everything to the contents; only an owner
-- invites, changes roles, and deletes the project itself.
do $$ begin
  create type public.project_role as enum ('owner', 'editor');
exception when duplicate_object then null;
end $$;

-- ---------- Membership ----------
-- Also the natural home for the per-person settings that were sitting on the
-- shared project row: with two people on one project, "favorite" and the
-- board position are opinions, not properties of the project.
create table if not exists public.project_members (
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id)      on delete cascade,
  role       public.project_role not null default 'editor',

  remind     boolean not null default false,  -- was projects.remind
  favorite   boolean not null default false,  -- was projects.favorite
  position   integer not null default 0,      -- was projects.position

  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create index if not exists project_members_user_idx
  on public.project_members (user_id, position);

-- ---------- The two questions every policy asks ----------
-- These are SECURITY DEFINER for one specific reason: a policy on
-- project_members that queried project_members would recurse forever. Running
-- the lookup as the owner steps outside RLS for that one read, which breaks the
-- cycle. They take a project id and answer only about the *calling* user —
-- auth.uid() is read inside, never passed in, so neither can be aimed at
-- someone else.
create or replace function public.is_project_member(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p and m.user_id = (select auth.uid())
  );
$$;

create or replace function public.is_project_owner(p uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.project_members m
    where m.project_id = p
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_project_member(uuid) from public, anon;
revoke all on function public.is_project_owner(uuid)  from public, anon;
grant execute on function public.is_project_member(uuid) to authenticated;
grant execute on function public.is_project_owner(uuid)  to authenticated;

-- ---------- Backfill: every existing project gets its creator as owner ----------
insert into public.project_members (project_id, user_id, role, remind, favorite, position)
select p.id, p.user_id, 'owner', p.remind, p.favorite, p.position
from public.projects p
on conflict (project_id, user_id) do nothing;

-- ---------- A new project owns itself ----------
-- SECURITY DEFINER so the insert doesn't have to satisfy the members policy
-- below, which requires an owner that doesn't exist yet at this instant.
create or replace function public.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role, remind, favorite, position)
  values (new.id, new.user_id, 'owner', new.remind, new.favorite, new.position)
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists projects_add_owner on public.projects;
create trigger projects_add_owner after insert on public.projects
  for each row execute function public.add_project_owner();

-- ---------- A project must never lose its last owner ----------
create or replace function public.forbid_last_owner_removal()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  /* Deleting the project itself cascades to every membership row, which would
     otherwise trip this guard and make projects undeletable. Referential-
     integrity cascades run as AFTER triggers of the parent delete, so by the
     time we get here the project row is already gone — its absence is how we
     tell "the project is being deleted" from "someone is leaving it". */
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

drop trigger if exists project_members_keep_owner on public.project_members;
create trigger project_members_keep_owner before delete on public.project_members
  for each row execute function public.forbid_last_owner_removal();

-- ---------- Invitations ----------
-- Addressed to an email, not to a user: someone can be invited before they
-- have an account, and claim_project_invites() picks it up when they sign in.
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

-- One spelling of an address, so "Paul@x.com" and "paul@x.com" are one invite.
create or replace function public.normalize_invite_email()
returns trigger language plpgsql as $$
begin
  new.email = lower(trim(new.email));
  return new;
end;
$$;

drop trigger if exists project_invites_normalize on public.project_invites;
create trigger project_invites_normalize before insert or update on public.project_invites
  for each row execute function public.normalize_invite_email();

-- ---------- Claiming ----------
-- Called by the client after sign-in. The address is read from auth.users for
-- the *calling* user — it is never a parameter, so nobody can claim an
-- invitation addressed to someone else.
create or replace function public.claim_project_invites()
returns integer
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid   uuid := auth.uid();
  addr  text;
  taken integer := 0;
begin
  if uid is null then
    raise exception 'claim_project_invites: no authenticated user';
  end if;

  select lower(u.email) into addr from auth.users u where u.id = uid;
  if addr is null then return 0; end if;

  insert into public.project_members (project_id, user_id, role)
  select i.project_id, uid, i.role
  from public.project_invites i
  where i.email = addr and i.expires_at > now()
  on conflict (project_id, user_id) do nothing;

  get diagnostics taken = row_count;

  -- Expired ones go too: they were addressed to this person and are spent.
  delete from public.project_invites where email = addr;
  return taken;
end;
$$;

revoke all on function public.claim_project_invites() from public, anon;
grant execute on function public.claim_project_invites() to authenticated;

-- ---------- Owner-only membership administration ----------
-- Role changes and removing someone else are funnelled through functions
-- rather than an UPDATE policy. Reason: RLS policies are OR'd, so a policy
-- permissive enough to let a member edit their own row would also let them
-- promote themselves to owner. A function can check the two things separately.
create or replace function public.set_project_role(p uuid, target uuid, new_role public.project_role)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_project_owner(p) then
    raise exception 'set_project_role: not an owner of project %', p;
  end if;
  update public.project_members set role = new_role
  where project_id = p and user_id = target;
end;
$$;

create or replace function public.remove_project_member(p uuid, target uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- An owner removes anyone; anyone removes themselves (leaving the project).
  -- The last-owner trigger still has the final word.
  if not (public.is_project_owner(p) or target = (select auth.uid())) then
    raise exception 'remove_project_member: not permitted on project %', p;
  end if;
  delete from public.project_members where project_id = p and user_id = target;
end;
$$;

revoke all on function public.set_project_role(uuid, uuid, public.project_role) from public, anon;
revoke all on function public.remove_project_member(uuid, uuid) from public, anon;
grant execute on function public.set_project_role(uuid, uuid, public.project_role) to authenticated;
grant execute on function public.remove_project_member(uuid, uuid) to authenticated;

-- ============================================================
-- Row-level security
-- ============================================================

alter table public.project_members enable row level security;
alter table public.project_invites enable row level security;

/* Table-level grants, spelled out rather than inherited from the schema's
   default privileges. RLS narrows what a role may touch; it never widens it,
   so a policy on a table the role has no grant on simply never applies.

   Note what `authenticated` is NOT given on project_members: INSERT. Rows are
   created only by add_project_owner() and claim_project_invites(), which are
   SECURITY DEFINER and run as the function owner. That is the whole enforcement
   for "you cannot add yourself to a project" — there is no policy to get past
   because there is no grant to use. */
grant select, delete on public.project_members to authenticated;
grant select, insert, delete on public.project_invites to authenticated;

-- ---------- project_members ----------
-- Members see who else is on the project. Inserts never come from here: the
-- trigger and claim_project_invites() are SECURITY DEFINER and bypass this.
drop policy if exists "members_select" on public.project_members;
create policy "members_select" on public.project_members for select
  using (public.is_project_member(project_id));

-- Only your own row, and — via the column grant below — only the columns that
-- are your own opinion. Role is not one of them.
drop policy if exists "members_update_self" on public.project_members;
create policy "members_update_self" on public.project_members for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke update on public.project_members from authenticated;
grant update (remind, favorite, position) on public.project_members to authenticated;

drop policy if exists "members_delete" on public.project_members;
create policy "members_delete" on public.project_members for delete
  using (user_id = (select auth.uid()) or public.is_project_owner(project_id));

-- ---------- project_invites ----------
-- Only an owner of the project ever sees or writes its invitations. An invitee
-- never reads this table — claim_project_invites() acts on their behalf — so a
-- pending invitation can't be used to discover who has a Stackt account.
drop policy if exists "invites_select_owner" on public.project_invites;
create policy "invites_select_owner" on public.project_invites for select
  using (public.is_project_owner(project_id));

drop policy if exists "invites_insert_owner" on public.project_invites;
create policy "invites_insert_owner" on public.project_invites for insert
  with check (public.is_project_owner(project_id) and invited_by = (select auth.uid()));

drop policy if exists "invites_delete_owner" on public.project_invites;
create policy "invites_delete_owner" on public.project_invites for delete
  using (public.is_project_owner(project_id));

-- ---------- projects ----------
-- Membership replaces ownership everywhere except DELETE, which stays with the
-- owner: an editor removing the project would take the other members' work
-- with it.
drop policy if exists "projects_select_own" on public.projects;
drop policy if exists "projects_insert_own" on public.projects;
drop policy if exists "projects_update_own" on public.projects;
drop policy if exists "projects_delete_own" on public.projects;

create policy "projects_select_member" on public.projects for select
  using (public.is_project_member(id));

-- Creating one is still an act of a single user; the trigger makes them owner.
create policy "projects_insert_self" on public.projects for insert
  with check (user_id = (select auth.uid()));

create policy "projects_update_member" on public.projects for update
  using (public.is_project_member(id))
  with check (public.is_project_member(id));

create policy "projects_delete_owner" on public.projects for delete
  using (public.is_project_owner(id));

-- ---------- versions ----------
drop policy if exists "versions_select_own" on public.versions;
drop policy if exists "versions_insert_own" on public.versions;
drop policy if exists "versions_update_own" on public.versions;
drop policy if exists "versions_delete_own" on public.versions;

create policy "versions_select_member" on public.versions for select
  using (public.is_project_member(project_id));
create policy "versions_insert_member" on public.versions for insert
  with check (public.is_project_member(project_id));
create policy "versions_update_member" on public.versions for update
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy "versions_delete_member" on public.versions for delete
  using (public.is_project_member(project_id));

-- ---------- cards ----------
-- cards.user_id becomes "who wrote it", nothing more. Access comes from the
-- project, which is why none of these four policies mentions it — a card
-- authored by a collaborator has to be editable by the rest of the project.
drop policy if exists "cards_select_own" on public.cards;
drop policy if exists "cards_insert_own" on public.cards;
drop policy if exists "cards_update_own" on public.cards;
drop policy if exists "cards_delete_own" on public.cards;

create policy "cards_select_member" on public.cards for select
  using (public.is_project_member(project_id));
create policy "cards_insert_member" on public.cards for insert
  with check (public.is_project_member(project_id) and user_id = (select auth.uid()));
create policy "cards_update_member" on public.cards for update
  using (public.is_project_member(project_id))
  with check (public.is_project_member(project_id));
create policy "cards_delete_member" on public.cards for delete
  using (public.is_project_member(project_id));

-- project_groups, user_prefs and email_prefs are untouched: they are personal
-- to one account and never shared.

commit;
