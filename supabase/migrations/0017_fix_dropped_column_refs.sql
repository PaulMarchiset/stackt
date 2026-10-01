-- ============================================================
-- Migration 0017 — HOTFIX for a regression introduced by 0016.
--
-- 0016 dropped projects.remind / favorite / position / group_id. Two functions
-- still read them, and neither is called by anything a `grep` of the TypeScript
-- would have turned up:
--
--   create_project()    (0012) — `created.remind, created.favorite, created.position`
--   add_project_owner() (0010) — `new.remind, new.favorite, new.position`
--
-- PL/pgSQL resolves those field references at execution time, so dropping the
-- columns did not fail the migration and did not fail the build. It failed the
-- next time somebody made a project: the RPC raised, the client reported
-- "Could not create project — check your connection", and creating a project
-- became impossible. Cards and versions kept working throughout because they
-- go through neither function — which is exactly what made it look like a
-- network problem rather than a schema one.
--
-- Both are redefined below reading only columns that still exist. The three
-- personal fields take their table defaults, which is what they should always
-- have done: a brand-new project is not a favourite, sits at position 0 and is
-- in no band, and copying those off the project row was only ever meaningful
-- while the project row still had them.
--
-- Run it in the Supabase SQL editor. Nothing else is needed — the trigger
-- references add_project_owner by name, so replacing the function is enough.
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

  /* The membership already exists by now — the INSERT above is a complete
     statement, so add_project_owner has fired. Repeated idempotently because
     this function is the contract ("you get back a project you own") and should
     not be silently dependent on a trigger someone could drop. */
  insert into public.project_members (project_id, user_id, role)
  values (created.id, uid, 'owner')
  on conflict (project_id, user_id) do nothing;

  return created;
end;
$$;

create or replace function public.add_project_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.project_members (project_id, user_id, role)
  values (new.id, new.user_id, 'owner')
  on conflict (project_id, user_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_project(text, text, boolean) from public, anon;
grant execute on function public.create_project(text, text, boolean) to authenticated;

commit;
