-- ============================================================
-- Migration 0013 — what the sharing panel needs to render:
--   • project_members_detailed() : the people on a project, with their email
--   • project_invites_pending()  : invitations sent but not yet claimed
--
-- project_members stores user ids, and auth.users is not readable from the
-- browser — so a members list has nowhere to get a human-readable name from.
-- These two functions are the bridge.
--
-- Both are SECURITY DEFINER, which is exactly why both check the caller first.
-- A definer function steps outside row-level security: without the membership
-- test in the WHERE clause, project_members_detailed('<any uuid>') would let
-- anyone enumerate the email address of everyone on any project in the
-- database. The guard is not defensive tidiness, it is the whole access
-- control for these two calls.
--
-- Run it in the Supabase SQL editor, after 0012.
-- ============================================================

begin;

-- ---------- Who is on this project ----------
-- Visible to any member: you were invited by email, so the people you share a
-- board with knowing your address is the arrangement you already agreed to.
create or replace function public.project_members_detailed(p uuid)
returns table (user_id uuid, email text, role public.project_role, joined_at timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select m.user_id, u.email::text, m.role, m.created_at
  from public.project_members m
  join auth.users u on u.id = m.user_id
  where m.project_id = p
    and public.is_project_member(p)   -- ← the access control; see the header
  order by (m.role = 'owner') desc, m.created_at, m.user_id;
$$;

-- ---------- Invitations still outstanding ----------
-- Owner-only, matching the invites_select_owner policy: an editor has no
-- business seeing who has been asked and hasn't answered.
create or replace function public.project_invites_pending(p uuid)
returns table (id uuid, email text, role public.project_role, expires_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select i.id, i.email, i.role, i.expires_at
  from public.project_invites i
  where i.project_id = p
    and public.is_project_owner(p)
    and i.expires_at > now()
  order by i.created_at;
$$;

revoke all on function public.project_members_detailed(uuid) from public, anon;
revoke all on function public.project_invites_pending(uuid)  from public, anon;
grant execute on function public.project_members_detailed(uuid) to authenticated;
grant execute on function public.project_invites_pending(uuid)  to authenticated;

commit;
