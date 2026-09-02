-- ============================================================
-- Migration 0016 — cleanup, run *after* 0014 has been live for a release:
--   projects.remind / favorite / position / group_id are dropped
--
-- These four were opinions living on a shared row. 0010 and 0014 moved them to
-- project_members, where they belong: with two people on a board, "starred" and
-- "third in my list" are things a person thinks, not properties of the project.
-- Since 0014 nothing reads them and nothing writes them.
--
-- Dropping rather than leaving them is the point of this migration. A dead
-- column that still accepts writes is a trap: the next person to type
-- `update projects set favorite = true` gets no error, no effect, and no clue
-- why. Removing it turns that mistake into a failure at the moment it is made.
--
-- This is the only destructive step in the series. Check that 0014 ran
-- everywhere and that the client reading project_members is deployed, because
-- an older client still pointed at these columns will lose favourites and
-- ordering the moment they go.
--
-- Run it in the Supabase SQL editor.
-- ============================================================

begin;

alter table public.projects drop column if exists remind;
alter table public.projects drop column if exists favorite;
alter table public.projects drop column if exists position;
alter table public.projects drop column if exists group_id;

/* Indexed the old shared ordering; there is nothing left to order by here.
   The replacement lives on project_members (project_members_user_idx). */
drop index if exists public.projects_user_idx;
drop index if exists public.projects_group_idx;

commit;
