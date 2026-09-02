-- ============================================================
-- Migration 0009 — additive and safe:
--   • public.delete_own_account() : lets a signed-in user delete their own
--     auth record using their ordinary session
--
-- Why this exists: removing a row from auth.users used to require the
-- service-role key, which bypasses row-level security entirely and can read,
-- modify or delete every user's data. That key had exactly two callers; this
-- retires one of them (the cron is the other, and goes after the collaborative
-- work reshapes the policies it depends on).
--
-- `security definer` means the function runs with its OWNER's rights, not the
-- caller's — that is what grants it access to auth.users. The safety comes from
-- the body, which reads auth.uid() itself: a caller cannot name a victim, only
-- delete whoever they are already authenticated as. Nothing is parameterised,
-- so there is nothing to inject.
--
-- Everything the user owns disappears with them through the existing
-- `on delete cascade` foreign keys on auth.users (projects → versions → cards,
-- project_groups, user_prefs, email_prefs).
--
-- Run it in the Supabase SQL editor.
-- ============================================================

begin;

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer
-- Pinned so a caller can't shadow `auth` with their own schema on the path.
set search_path = public, auth
as $$
declare
  uid uuid := auth.uid();
begin
  -- Belt and braces: PostgREST only reaches this with a session, but an
  -- unauthenticated call must never fall through to an unqualified delete.
  if uid is null then
    raise exception 'delete_own_account: no authenticated user';
  end if;

  delete from auth.users where id = uid;
end;
$$;

-- Callable only by a signed-in user — never by the anon role.
revoke all on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

commit;
