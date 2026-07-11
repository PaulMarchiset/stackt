-- ============================================================
-- Migration phase 3 « contract » : retrait des colonnes legacy.
--
-- ⚠️ PRÉREQUIS OBLIGATOIRES avant de lancer ce fichier :
--   1. Le code phase 2 (version_id / table versions) est DÉPLOYÉ en
--      production et tourne sans erreur depuis quelques jours.
--   2. La vérification (a) de 0001 renvoie 0 ligne (aucune carte orpheline).
--
-- Tant que l'ancien code tourne encore quelque part, NE LANCE PAS :
-- il écrit dans ces colonnes et cesserait de fonctionner.
--
-- À exécuter en une transaction dans le SQL editor Supabase.
-- ============================================================

begin;

-- 1. Corriger le trigger d'amorçage AVANT de dropper active_version,
--    sinon toute nouvelle inscription planterait.
create or replace function public.seed_first_project()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.projects (user_id, name)
  values (new.id, 'My first project');
  return new;
end;
$$;

-- 2. Retirer les colonnes legacy (idempotent).
alter table public.cards    drop column if exists version;
alter table public.projects drop column if exists versions;
alter table public.projects drop column if exists completed_versions;
alter table public.projects drop column if exists version_colors;
alter table public.projects drop column if exists active_version;

commit;

-- ============================================================
-- Après ce DROP, préviens-moi : je nettoie côté code (types.ts +
-- découplage de la valeur "nom de version" de l'éditeur, qui
-- s'appuyait sur Card.version). Purement compile-time, sans risque prod.
-- ============================================================
