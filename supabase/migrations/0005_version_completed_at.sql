-- ============================================================
-- Migration 0005 — additive and safe:
--   • versions.completed_at : when the version/phase was marked completed
-- Drives the version bar's completed order: most recently completed first
-- (newest → left, oldest → right). No data is destroyed.
-- Run it in the Supabase SQL editor.
-- ============================================================

begin;

-- 1. Timestamp of the move to "completed".
alter table public.versions add column if not exists completed_at timestamptz;

-- 2. Backfill for already-completed versions: the real completion time was
--    never recorded, so updated_at is the closest available approximation
--    (a version is rarely touched after it ships). Versions completed from
--    now on carry their true completed_at.
update public.versions set completed_at = updated_at where completed and completed_at is null;

-- 3. Completed ordering (per project), most recently completed first.
create index if not exists versions_completed_at_idx
  on public.versions (project_id, completed_at desc nulls last)
  where completed;

commit;
