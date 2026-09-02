-- ============================================================
-- Migration 0015 — live updates on the open board:
--   • cards and versions published to the realtime stream
--   • REPLICA IDENTITY FULL on both, so row-level security can judge them
--
-- What REPLICA IDENTITY FULL buys, and why it is not optional here:
--
--   By default Postgres puts only the primary key of the OLD row into the WAL
--   for an UPDATE or DELETE. Realtime evaluates our policies against that old
--   row to decide who may be told about the change — and our policy asks
--   `is_project_member(project_id)`. With only the id available, project_id is
--   not there to test, so the change is withheld from everyone and deletes
--   never reach the other tabs. FULL writes the whole old row instead.
--
--   The cost is a bigger WAL: every update carries a complete before-image.
--   For a table of short text rows this is small, and it is the price of
--   having the *database* decide who sees what rather than the client.
--
-- On security: the client also passes a `project_id=eq.…` filter when it
-- subscribes. That is a convenience, NOT a boundary — it only spares the
-- browser traffic it would ignore. Someone subscribing to a project they are
-- not a member of receives nothing, because these policies are what realtime
-- consults. The filter narrows; RLS refuses.
--
-- project_groups, user_prefs and email_prefs stay off the stream: they are
-- personal, so there is no second viewer to notify.
--
-- Run it in the Supabase SQL editor, after 0014.
-- ============================================================

begin;

alter table public.cards    replica identity full;
alter table public.versions replica identity full;

/* `alter publication … add table` errors if the table is already a member, so
   it is guarded rather than run blind — this migration has to stay re-runnable
   like the rest of the series. */
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'cards'
  ) then
    alter publication supabase_realtime add table public.cards;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'versions'
  ) then
    alter publication supabase_realtime add table public.versions;
  end if;
end $$;

commit;
