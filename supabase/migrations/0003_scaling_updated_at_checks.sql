-- ============================================================
-- Migration 0003 — améliorations « scaling » additives et sûres :
--   • updated_at + trigger sur projects / versions / cards
--   • CHECK sur email_prefs (horizon, sections valides)
--   • index cards(version_id) pour les ops par version
-- Aucune donnée détruite. À exécuter dans le SQL editor Supabase.
-- ============================================================

begin;

-- 1. Fonction de mise à jour automatique de updated_at.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 2. Colonnes updated_at (email_prefs en a déjà une).
alter table public.projects add column if not exists updated_at timestamptz not null default now();
alter table public.versions add column if not exists updated_at timestamptz not null default now();
alter table public.cards    add column if not exists updated_at timestamptz not null default now();

-- 3. Triggers.
drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists versions_set_updated_at on public.versions;
create trigger versions_set_updated_at before update on public.versions
  for each row execute function public.set_updated_at();

drop trigger if exists cards_set_updated_at on public.cards;
create trigger cards_set_updated_at before update on public.cards
  for each row execute function public.set_updated_at();

drop trigger if exists email_prefs_set_updated_at on public.email_prefs;
create trigger email_prefs_set_updated_at before update on public.email_prefs
  for each row execute function public.set_updated_at();

-- 4. Contraintes de validité sur email_prefs.
--    (Si l'ADD échoue, c'est qu'une ligne a une valeur invalide — à corriger d'abord.)
alter table public.email_prefs drop constraint if exists email_prefs_horizon_days_check;
alter table public.email_prefs add  constraint email_prefs_horizon_days_check
  check (horizon_days between 0 and 30);

alter table public.email_prefs drop constraint if exists email_prefs_sections_check;
alter table public.email_prefs add  constraint email_prefs_sections_check
  check (sections <@ array['overdue','today','upcoming']);

-- 5. Index pour les requêtes/updates par version (compléter, fusionner, compter).
create index if not exists cards_version_idx on public.cards (version_id);

commit;
