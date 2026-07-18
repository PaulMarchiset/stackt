-- ============================================================
-- Migration 0004 — additive and safe:
--   • cards.done_at : when the card was checked (Done column order)
--   • email_prefs.sections accepts the new 'undated' section
-- No data is destroyed. Run it in the Supabase SQL editor.
-- ============================================================

begin;

-- 1. Timestamp of the move to "done".
--    Drives the Done column order: most recently checked first.
alter table public.cards add column if not exists done_at timestamptz;

-- 2. Backfill for already-done cards: the real completion time was never
--    recorded, so updated_at is the closest available approximation. Cards
--    checked from now on carry their true done_at.
update public.cards set done_at = updated_at where done and done_at is null;

-- 3. Done ordering (per project), most recently checked first.
create index if not exists cards_done_at_idx
  on public.cards (project_id, done_at desc nulls last)
  where done;

-- 4. The allowed section list gains 'undated' (tasks with no date).
--    The old constraint would have rejected it on save.
alter table public.email_prefs drop constraint if exists email_prefs_sections_check;
alter table public.email_prefs add  constraint email_prefs_sections_check
  check (sections <@ array['overdue','today','upcoming','undated']);

commit;
