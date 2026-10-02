-- ============================================================
-- Migration 0019 — multiple assignees per card (Closes #1, part 1):
--   • card_assignees join table: (card_id, user_id), one row per responsible
--   • project_id denormalized: RLS + realtime filter need it without a join
--     (same reason cards/versions carry it — see migration 0015)
--
-- Rules: any project member can assign/unassign any member (matches
-- cards_update_member). Leaving/deleted users cascade cleanly.
--
-- Run it in the Supabase SQL editor, after 0018.
-- ============================================================

begin;

create table if not exists public.card_assignees (
  card_id    uuid not null references public.cards (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (card_id, user_id)
);

create index if not exists card_assignees_card_idx on public.card_assignees (card_id);
create index if not exists card_assignees_project_idx on public.card_assignees (project_id);
create index if not exists card_assignees_user_idx on public.card_assignees (user_id);

alter table public.card_assignees enable row level security;

-- Any member reads / assigns / unassigns. Reassigning is a content edit,
-- like moving a card — not a membership change — so editors are allowed.
drop policy if exists "assignees_select_member" on public.card_assignees;
create policy "assignees_select_member" on public.card_assignees for select
  using (public.is_project_member(project_id));
drop policy if exists "assignees_insert_member" on public.card_assignees;
create policy "assignees_insert_member" on public.card_assignees for insert
  with check (public.is_project_member(project_id));
drop policy if exists "assignees_delete_member" on public.card_assignees;
create policy "assignees_delete_member" on public.card_assignees for delete
  using (public.is_project_member(project_id));

-- Live updates for the open board (same pattern as migration 0015).
alter table public.card_assignees replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_assignees') then
    alter publication supabase_realtime add table public.card_assignees;
  end if;
end $$;

commit;
