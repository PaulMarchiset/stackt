-- ============================================================
-- Migration 0007 — additive and safe:
--   • user_prefs.header_items : the ordered list of what heads the board
-- The three exclusive header modes (favorites / custom / groups) become one
-- composable list: [{kind:'favorites'}, {kind:'group',id}, {kind:'project',id}].
-- The order of the entries is the order of the islands.
--
-- header_mode and projects.pinned are left in place but are no longer read —
-- migration 0008 drops them once this one has shipped without incident.
-- No data is destroyed. Run it in the Supabase SQL editor.
-- ============================================================

begin;

-- ---------- 1. The list ----------
-- Ids inside the JSON are deliberately *not* foreign keys: a list that outlives
-- a deleted group must stay writable. The resolver (lib/grouping.ts) drops
-- entries that no longer point at anything, so a dangling id is inert, never
-- an error.
alter table public.user_prefs
  add column if not exists header_items jsonb not null default '[{"kind": "favorites"}]'::jsonb;

alter table public.user_prefs drop constraint if exists user_prefs_header_items_check;
alter table public.user_prefs add  constraint user_prefs_header_items_check
  check (jsonb_typeof(header_items) = 'array');

-- ---------- 2. Backfill from the old mode ----------
-- Accounts with no user_prefs row keep meaning "all defaults" (favorites), so
-- only existing rows need translating.
--   favorites → the favorites entry
--   custom    → one project entry per pinned project, in board order
--   groups    → one group entry per group, in group order
update public.user_prefs p set header_items = coalesce((
  case p.header_mode
    when 'custom' then (
      select jsonb_agg(jsonb_build_object('kind', 'project', 'id', x.id) order by x.position, x.created_at)
      from public.projects x
      where x.user_id = p.user_id and x.pinned
    )
    when 'groups' then (
      select jsonb_agg(jsonb_build_object('kind', 'group', 'id', g.id) order by g.position, g.name)
      from public.project_groups g
      where g.user_id = p.user_id
    )
    else null
  end
), '[{"kind": "favorites"}]'::jsonb);

commit;
