-- ============================================================
-- Migration 0011 — what happens to a shared project when its owner leaves:
--   • projects.user_id stops being a cascade key
--   • delete_own_account() hands over or cleans up before deleting
--   • projects_needing_new_owner() feeds the confirmation dialog
--
-- Run it in the Supabase SQL editor, after 0010.
-- ============================================================

begin;

-- ---------- 1. A project must outlive its creator ----------
-- After 0010, projects.user_id records who *made* it — ownership lives in
-- project_members. But the column still carried `on delete cascade`, so:
--
--   Alice creates a project, invites Bob, promotes him to owner, leaves.
--   projects.user_id still points at Alice. She deletes her account months
--   later and Bob's project vanishes with her.
--
-- The column keeps its meaning (attribution) and loses its authority: when the
-- creator goes, the row survives with a null creator. Deciding whether a
-- project should still exist is now delete_own_account()'s job, below, where
-- the answer can depend on who else is on it.
alter table public.projects alter column user_id drop not null;

alter table public.projects drop constraint if exists projects_user_id_fkey;
alter table public.projects
  add constraint projects_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- Same defect, one table down, and worse: cards.user_id also cascaded.
--
--   Bob joins Alice's project and writes twenty cards. Bob closes his account.
--   Twenty cards disappear out of Alice's board.
--
-- After 0010 this column means "who wrote it" — no policy reads it for access.
-- An author leaving must not take the team's work with them, so the card stays
-- and simply loses its byline.
alter table public.cards alter column user_id drop not null;

alter table public.cards drop constraint if exists cards_user_id_fkey;
alter table public.cards
  add constraint cards_user_id_fkey
  foreign key (user_id) references auth.users (id) on delete set null;

-- ---------- 2. What the confirmation dialog needs ----------
-- Every project the caller is the ONLY owner of that other people are on.
-- Those are the ones that need a decision; anything else resolves itself.
-- Candidates come back oldest-membership-first, which is the suggested pick.
create or replace function public.projects_needing_new_owner()
returns table (project_id uuid, project_name text, candidates jsonb)
language sql
stable
security definer
set search_path = public, auth
as $$
  select
    p.id,
    p.name,
    (
      select jsonb_agg(c order by c->>'joined_at')
      from (
        select jsonb_build_object(
                 'user_id',   o.user_id,
                 'email',     u.email,
                 'role',      o.role,
                 'joined_at', o.created_at
               ) as c
        from public.project_members o
        join auth.users u on u.id = o.user_id
        where o.project_id = p.id and o.user_id <> (select auth.uid())
      ) s
    )
  from public.projects p
  join public.project_members me
    on me.project_id = p.id and me.user_id = (select auth.uid()) and me.role = 'owner'
  where
    -- no other owner
    not exists (
      select 1 from public.project_members o
      where o.project_id = p.id and o.user_id <> (select auth.uid()) and o.role = 'owner'
    )
    -- but somebody else is here
    and exists (
      select 1 from public.project_members o
      where o.project_id = p.id and o.user_id <> (select auth.uid())
    );
$$;

revoke all on function public.projects_needing_new_owner() from public, anon;
grant execute on function public.projects_needing_new_owner() to authenticated;

-- ---------- 3. Deleting an account, with the handover built in ----------
-- Supersedes the version from 0009. The fallback lives here rather than in the
-- client on purpose: a dialog can be skipped, a direct POST can bypass it, and
-- a half-finished deletion must never strand somebody else's project. The UI
-- prompt is how a user *overrides* this rule, not how it gets applied.
create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  uid   uuid := auth.uid();
  proj  record;
  heir  uuid;
begin
  if uid is null then
    raise exception 'delete_own_account: no authenticated user';
  end if;

  -- Every project where we are the last owner standing.
  for proj in
    select m.project_id
    from public.project_members m
    where m.user_id = uid
      and m.role = 'owner'
      and not exists (
        select 1 from public.project_members o
        where o.project_id = m.project_id and o.user_id <> uid and o.role = 'owner'
      )
  loop
    -- The longest-standing other member, if there is one. Ties break on the id
    -- so the choice is deterministic rather than whatever the planner returns.
    select o.user_id into heir
    from public.project_members o
    where o.project_id = proj.project_id and o.user_id <> uid
    order by o.created_at, o.user_id
    limit 1;

    if heir is null then
      -- Nobody else was ever here: the project leaves with its owner.
      delete from public.projects where id = proj.project_id;
    else
      -- Hand it over. The last-owner trigger then lets our row go quietly.
      update public.project_members set role = 'owner'
      where project_id = proj.project_id and user_id = heir;
    end if;
  end loop;

  delete from auth.users where id = uid;
end;
$$;

revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

commit;
