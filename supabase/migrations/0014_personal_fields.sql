-- ============================================================
-- Migration 0014 — the last three fields that were opinions on a shared row:
--   • project_members.group_id : which of YOUR bands the project sits in
--   • re-backfill of favorite / position / group_id onto the owner's row
--
-- 0010 moved `favorite` and `position` onto the membership but nothing read
-- them yet, so every star and every drag since has been writing to
-- projects.* while the membership copy stayed frozen at its migration-time
-- value. This re-runs the copy so the switchover keeps what people actually
-- did in between; without it everyone loses the last few days of favourites
-- and ordering the moment the client starts reading the new columns.
--
-- group_id is the same defect, one field wider, and the worst of the three:
--
--   You file "Client X" under your "Client work" band. Groups are personal
--   (project_groups is owner-only), so a collaborator can't even see that band
--   — the project just renders ungrouped for them, which is fine. But the
--   moment they file it under a band of their own, they overwrite your
--   group_id and your filing is gone, silently.
--
-- Nothing is dropped here. The old columns stay in place, unread, until a
-- cleanup migration removes them — the 0007 → 0008 pattern.
--
-- Run it in the Supabase SQL editor, after 0013, and BEFORE deploying the
-- client that reads these columns.
-- ============================================================

begin;

-- ---------- Which of my own bands this project sits in ----------
-- Nullable and ON DELETE SET NULL, like projects.group_id was: deleting a band
-- must free its projects, not delete them.
alter table public.project_members
  add column if not exists group_id uuid references public.project_groups (id) on delete set null;

create index if not exists project_members_group_idx
  on public.project_members (user_id, group_id, position);

-- ---------- Re-backfill ----------
-- Onto the OWNER's row only. The value sitting on the shared project row is
-- the owner's opinion in every case that matters — and where a collaborator
-- was the last to click, the owner inherits their choice, which is the same
-- outcome as today and no worse than what the shared column already did.
--
-- A collaborator's own row keeps its defaults (not favourite, position 0, no
-- band): they have never expressed an opinion about this project, and
-- inventing one for them would be guessing.
update public.project_members m
set favorite = p.favorite,
    position = p.position,
    group_id = p.group_id
from public.projects p
where p.id = m.project_id
  and m.role = 'owner';

-- The column grant from 0010 predates group_id, so re-issue it with the full
-- set. Still no `role` — promoting yourself stays impossible.
revoke update on public.project_members from authenticated;
grant update (remind, favorite, position, group_id) on public.project_members to authenticated;

commit;
