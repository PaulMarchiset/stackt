-- ============================================================
-- Migration 0012 — fixes a regression introduced by 0010:
--   creating a project failed with "new row violates row-level security policy"
--
-- What went wrong. The client creates a project with
--
--     insert into projects (...) ... returning *
--
-- and PostgreSQL applies the SELECT policy to the RETURNING output. That policy
-- is now `is_project_member(id)`. The row that makes you a member is written by
-- projects_add_owner, an AFTER INSERT trigger — and AFTER triggers fire once the
-- statement's rows, RETURNING included, have already been produced. So at the
-- moment the policy asks "are you a member?", the membership row does not exist
-- yet. The project was really created; it was handing it back that was refused.
--
-- No amount of AFTER-trigger work can fix that: the trigger is downstream of the
-- check. Creation therefore moves into one function that writes both rows
-- itself. SECURITY DEFINER, so no policy is consulted mid-flight, and the row
-- comes back to a caller who is a member by the time they see it.
--
-- Run it in the Supabase SQL editor, after 0011.
-- ============================================================

begin;

create or replace function public.create_project(
  p_name     text    default 'New project',
  p_repo_url text    default '',
  p_dev_mode boolean default null
)
returns public.projects
language plpgsql
security definer
set search_path = public
as $$
declare
  uid     uuid := auth.uid();
  created public.projects;
begin
  if uid is null then
    raise exception 'create_project: no authenticated user';
  end if;

  insert into public.projects (user_id, name, repo_url, dev_mode)
  values (
    uid,
    coalesce(nullif(btrim(p_name), ''), 'New project'),
    coalesce(p_repo_url, ''),
    p_dev_mode
  )
  returning * into created;

  /* projects_add_owner has already done this by now — the INSERT above is a
     complete statement, so its AFTER trigger has fired. Repeated here anyway,
     idempotently: this function is the contract ("you get back a project you
     own"), and it should not be silently dependent on a trigger someone could
     drop. */
  insert into public.project_members (project_id, user_id, role, remind, favorite, position)
  values (created.id, uid, 'owner', created.remind, created.favorite, created.position)
  on conflict (project_id, user_id) do nothing;

  return created;
end;
$$;

revoke all on function public.create_project(text, text, boolean) from public, anon;
grant execute on function public.create_project(text, text, boolean) to authenticated;

commit;
