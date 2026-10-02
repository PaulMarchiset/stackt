-- ============================================================
-- Migration 0020 — card comments + @mentions (Closes #1, part 2):
--   • card_comments: one row per message; cards.comment stays as-is
--     (the description — relabelled, not migrated)
--   • card_mentions: (comment_id, mentioned_user_id, read_at) — unread = bell
--   • add_comment_with_mentions(): atomic insert of comment + mention rows
--
-- Permissions: any member reads + posts; only the author edits/deletes
-- their own comment (update/delete check user_id = auth.uid()).
-- Reassigning assignees stays open (0019); comments stay personal.
--
-- Email (if wanted) is sent by the app server route reusing the Brevo
-- provider — not by the database. The function only records the mentions.
--
-- Run it in the Supabase SQL editor, after 0019.
-- ============================================================

begin;

-- ---------- Comments ----------
create table if not exists public.card_comments (
  id         uuid primary key default gen_random_uuid(),
  card_id    uuid not null references public.cards (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id    uuid default auth.uid() references auth.users (id) on delete set null,
  body       text not null check (char_length(body) between 1 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_comments_card_idx on public.card_comments (card_id, created_at);
create index if not exists card_comments_project_idx on public.card_comments (project_id);

drop trigger if exists card_comments_set_updated_at on public.card_comments;
create trigger card_comments_set_updated_at before update on public.card_comments
  for each row execute function public.set_updated_at();

alter table public.card_comments enable row level security;

drop policy if exists "comments_select_member" on public.card_comments;
create policy "comments_select_member" on public.card_comments for select
  using (public.is_project_member(project_id));
drop policy if exists "comments_insert_member" on public.card_comments;
create policy "comments_insert_member" on public.card_comments for insert
  with check (public.is_project_member(project_id) and user_id = (select auth.uid()));
drop policy if exists "comments_update_own" on public.card_comments;
create policy "comments_update_own" on public.card_comments for update
  using (user_id = (select auth.uid()) and public.is_project_member(project_id))
  with check (user_id = (select auth.uid()) and public.is_project_member(project_id));
drop policy if exists "comments_delete_own" on public.card_comments;
create policy "comments_delete_own" on public.card_comments for delete
  using (
    -- Own comment: always. Other's comment: only when the card has no other
    -- trace of you — practically, members delete their own; owners moderate
    -- via the card itself. Kept simple: own only, plus project owners.
    user_id = (select auth.uid()) or public.is_project_owner(project_id)
  );

-- ---------- Mentions ----------
create table if not exists public.card_mentions (
  comment_id        uuid not null references public.card_comments (id) on delete cascade,
  mentioned_user_id uuid not null references auth.users (id) on delete cascade,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);

create index if not exists card_mentions_user_idx on public.card_mentions (mentioned_user_id, read_at);

alter table public.card_mentions enable row level security;

-- Members of the project can read mentions (so the thread can render "@you");
-- only the mentioned user (or the comment author clearing their own ping)
-- flips read_at. Rows are written by add_comment_with_mentions() below.
drop policy if exists "mentions_select_member" on public.card_mentions;
create policy "mentions_select_member" on public.card_mentions for select
  using (
    exists (
      select 1 from public.card_comments c
      where c.id = card_mentions.comment_id and public.is_project_member(c.project_id)
    )
  );
drop policy if exists "mentions_insert_member" on public.card_mentions;
create policy "mentions_insert_member" on public.card_mentions for insert
  with check (
    exists (
      select 1 from public.card_comments c
      where c.id = card_mentions.comment_id and public.is_project_member(c.project_id)
    )
  );
drop policy if exists "mentions_update_reader" on public.card_mentions;
create policy "mentions_update_reader" on public.card_mentions for update
  using (
    mentioned_user_id = (select auth.uid())
    or exists (
      select 1 from public.card_comments c
      where c.id = card_mentions.comment_id and c.user_id = (select auth.uid())
    )
  )
  with check (
    mentioned_user_id = (select auth.uid())
    or exists (
      select 1 from public.card_comments c
      where c.id = card_mentions.comment_id and c.user_id = (select auth.uid())
    )
  );
drop policy if exists "mentions_delete_author" on public.card_mentions;
create policy "mentions_delete_author" on public.card_mentions for delete
  using (
    exists (
      select 1 from public.card_comments c
      where c.id = card_mentions.comment_id
        and (c.user_id = (select auth.uid()) or public.is_project_owner(c.project_id))
    )
  );

-- ---------- One call: comment + its @pings ----------
-- SECURITY DEFINER so the two writes are atomic under one membership check.
-- mentioned_ids must all be members of the card's project; strangers are
-- ignored rather than failing the whole comment.
create or replace function public.add_comment_with_mentions(
  c uuid, b text, mentioned_ids uuid[] default '{}'
)
returns public.card_comments
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  card_proj uuid;
  created public.card_comments;
  mid uuid;
begin
  if uid is null then raise exception 'add_comment_with_mentions: no authenticated user'; end if;
  if b is null or char_length(btrim(b)) = 0 then raise exception 'add_comment_with_mentions: empty body'; end if;

  select project_id into card_proj from public.cards where id = c;
  if card_proj is null then raise exception 'add_comment_with_mentions: unknown card'; end if;
  if not public.is_project_member(card_proj) then
    raise exception 'add_comment_with_mentions: not a member of project %', card_proj;
  end if;

  insert into public.card_comments (card_id, project_id, user_id, body)
  values (c, card_proj, uid, btrim(b))
  returning * into created;

  if mentioned_ids is not null then
    foreach mid in array mentioned_ids loop
      -- Only members can be pinged; silently skip anyone else (e.g. left).
      if mid is not null and mid <> uid and exists (
        select 1 from public.project_members m
        where m.project_id = card_proj and m.user_id = mid
      ) then
        insert into public.card_mentions (comment_id, mentioned_user_id)
        values (created.id, mid)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return created;
end;
$$;

revoke all on function public.add_comment_with_mentions(uuid, text, uuid[]) from public, anon;
grant execute on function public.add_comment_with_mentions(uuid, text, uuid[]) to authenticated;

-- ---------- Realtime ----------
alter table public.card_comments replica identity full;
alter table public.card_assignees replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_comments') then
    alter publication supabase_realtime add table public.card_comments;
  end if;
  if not exists (select 1 from pg_publication_tables
                 where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'card_mentions') then
    alter publication supabase_realtime add table public.card_mentions;
  end if;
end $$;

commit;
