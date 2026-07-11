-- ============================================================
-- Migration : versions text[]/jsonb → table normalisée
-- Phase 1 « expand » : on AJOUTE la table + les colonnes de
-- référence et on recopie les données. Les anciennes colonnes
-- sont conservées (pas de DROP) comme filet de sécurité.
--
-- À exécuter en une transaction dans le SQL editor Supabase.
-- Les requêtes de vérification et les DROP sont EN DEHORS de la
-- transaction, tout en bas, à lancer séparément plus tard.
-- ============================================================

begin;

-- 1. Nouvelle table versions ------------------------------------------------
create table if not exists public.versions (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  name        text not null,
  color_index smallint,                       -- index de palette 0..5 (null = auto)
  completed   boolean not null default false,
  position    integer not null default 0,
  created_at  timestamptz not null default now(),
  unique (project_id, name)
);

create index if not exists versions_project_idx on public.versions (project_id, position);

-- 2. RLS : une version n'est accessible que si son projet appartient au user.
alter table public.versions enable row level security;

drop policy if exists "versions_select_own" on public.versions;
create policy "versions_select_own" on public.versions
  for select using (exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "versions_insert_own" on public.versions;
create policy "versions_insert_own" on public.versions
  for insert with check (exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "versions_update_own" on public.versions;
create policy "versions_update_own" on public.versions
  for update using (exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()))
  with check (exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

drop policy if exists "versions_delete_own" on public.versions;
create policy "versions_delete_own" on public.versions
  for delete using (exists (
    select 1 from public.projects p where p.id = project_id and p.user_id = auth.uid()));

-- 3. Peupler versions depuis projects.versions (nom + couleur + statut).
--    unnest(... with ordinality) fournit la position d'origine dans le tableau.
insert into public.versions (project_id, name, color_index, completed, position)
select
  p.id,
  v.name,
  (p.version_colors ->> v.name)::smallint,          -- null si la clé est absente
  v.name = any(p.completed_versions),
  v.ord::int
from public.projects p
cross join lateral unnest(p.versions) with ordinality as v(name, ord)
on conflict (project_id, name) do nothing;

-- 4. Cas limite : versions présentes dans completed_versions mais absentes
--    de versions[] (données incohérentes historiques).
insert into public.versions (project_id, name, color_index, completed, position)
select
  p.id,
  cv.name,
  (p.version_colors ->> cv.name)::smallint,
  true,
  9999
from public.projects p
cross join lateral unnest(p.completed_versions) as cv(name)
on conflict (project_id, name) do nothing;

-- 5. Référence version_id sur cards + backfill par (projet, nom).
alter table public.cards add column if not exists version_id uuid references public.versions (id) on delete set null;

update public.cards c
set version_id = v.id
from public.versions v
where v.project_id = c.project_id
  and v.name = c.version
  and c.version_id is null;

-- 6. Référence active_version_id sur projects + backfill.
alter table public.projects add column if not exists active_version_id uuid references public.versions (id) on delete set null;

update public.projects p
set active_version_id = v.id
from public.versions v
where v.project_id = p.id
  and v.name = p.active_version
  and coalesce(p.active_version, '') <> ''
  and p.active_version_id is null;

commit;

-- ============================================================
-- ÉTAPE CORRECTIVE (à lancer si la vérification (a) renvoie des lignes)
-- Certaines versions n'existaient QUE sur des cartes (saisie libre non
-- ajoutée à projects.versions[]). On crée leur ligne puis on relie.
-- Idempotent : sans effet si tout est déjà relié.
-- ============================================================
begin;

insert into public.versions (project_id, name, position)
select distinct c.project_id, c.version, 9998
from public.cards c
where coalesce(c.version, '') <> '' and c.version_id is null
on conflict (project_id, name) do nothing;

update public.cards c
set version_id = v.id
from public.versions v
where v.project_id = c.project_id
  and v.name = c.version
  and c.version_id is null;

commit;

-- ============================================================
-- VÉRIFICATIONS (à lancer séparément, elles ne modifient rien)
-- ============================================================
-- a) Cartes dont le texte "version" n'a matché aucune ligne :
--    (version orpheline, faute de frappe, supprimée entre-temps)
--
--   select c.id, c.project_id, c.version as unmatched_version_text
--   from public.cards c
--   where coalesce(c.version, '') <> '' and c.version_id is null;
--
-- b) Comparaison des comptes avant/après :
--
--   select
--     (select count(*) from public.versions) as versions_rows,
--     (select coalesce(sum(array_length(versions,1)),0) from public.projects) as old_version_labels;
--
-- ============================================================
-- PHASE 3 « contract » — SEULEMENT après avoir (1) validé les
-- vérifications ci-dessus ET (2) déployé le code appli qui écrit
-- dans la table versions / version_id. Garde le filet quelques jours.
--
--   alter table public.cards    drop column version;
--   alter table public.projects drop column versions;
--   alter table public.projects drop column completed_versions;
--   alter table public.projects drop column version_colors;
--   alter table public.projects drop column active_version;
-- ============================================================
