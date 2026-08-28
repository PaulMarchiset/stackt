-- ============================================================
-- Migration 0008 — cleanup, run *after* 0007 has been live for a release:
--   • user_prefs.header_mode : replaced by header_items
--   • projects.pinned        : the 'custom' mode's storage; a hand-picked
--                              project is now a {kind:'project'} entry
-- Both were backfilled into user_prefs.header_items by 0007 and no client
-- reads them any more. Dropping them is the only destructive step in this
-- series: check that 0007 ran everywhere first.
-- ============================================================

begin;

alter table public.user_prefs drop column if exists header_mode;
alter table public.projects   drop column if exists pinned;

commit;
