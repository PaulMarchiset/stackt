import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEMO_USER, demoData } from '@/lib/demo/fixture';
import { isDemo } from '@/lib/demo/server';
import { DEFAULT_USER_PREFS, type CardAssignee, type CardComment, type CardMention, type HeaderItem, type Project, type Card, type ProjectGroup, type Version } from '@/lib/types';
import { parseHeaderItems } from '@/lib/grouping';
import { withPersonal, type MembershipRow } from '@/lib/personal';
import BoardApp from './BoardApp';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Board', robots: { index: false, follow: false } };

export default async function BoardPage({
  searchParams
}: {
  searchParams: { p?: string };
}) {
  /* Asked before auth — same reason as /projects. Without ?p the demo opens on
     the project the screenshots are of, not on whatever sorts first. */
  if (isDemo()) {
    const d = demoData();
    return (
      <BoardApp
        demo
        initialProjects={d.projects}
        initialCards={d.cards}
        initialVersions={d.versions}
        initialAssignees={d.assignees}
        initialComments={d.comments}
        groups={d.groups}
        headerItems={d.headerItems}
        userId={DEMO_USER.id}
        userEmail={DEMO_USER.email}
        userName={DEMO_USER.name}
        initialActiveId={searchParams.p ?? 'demo-stackt'}
      />
    );
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: projects }, { data: cards }, { data: versions }, { data: groups }, { data: prefs }, { data: members }, { data: assignees }, { data: comments }, { data: mentions }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('cards').select('*').order('created_at'),
    supabase.from('versions').select('*').order('position'),
    supabase.from('project_groups').select('*').order('position'),
    supabase.from('user_prefs').select('header_items').eq('user_id', user.id).maybeSingle(),
    /* Scoped to this user: on a shared project the table also holds the other
       members' rows, and their reminder choice is not ours to read. */
    supabase.from('project_members')
      .select('project_id, remind, favorite, position, group_id').eq('user_id', user.id),
    // Best-effort: older databases may not have run migrations 0019/0020 yet.
    // A missing table resolves as an error here, not a crash — default to [].
    supabase.from('card_assignees').select('*').then((r) => ({ data: r.error ? [] : r.data })),
    supabase.from('card_comments').select('*').order('created_at').then((r) => ({ data: r.error ? [] : r.data })),
    supabase.from('card_mentions').select('*').eq('mentioned_user_id', user.id).then((r) => ({ data: r.error ? [] : r.data }))
  ]);

  /* The reader's own settings, merged onto the shared rows (lib/personal.ts).
     Components go on reading project.remind / .favorite and never learn where
     the values came from; the writes route back through the store. */
  const withRemind = withPersonal((projects ?? []) as Project[], (members ?? []) as MembershipRow[]);

  /* No row means "never chose anything" — the defaults. An existing row with an
     empty list means the opposite: you took everything out on purpose, and the
     header falls back to showing every project (see headerIslands, rule 1).
     Collapsing the two would put Favorites back after a reload. */
  const items: HeaderItem[] = prefs
    ? parseHeaderItems(prefs.header_items)
    : DEFAULT_USER_PREFS.header_items;

  return (
    <BoardApp
      initialProjects={withRemind}
      initialCards={(cards ?? []) as Card[]}
      initialVersions={(versions ?? []) as Version[]}
      initialAssignees={((assignees as unknown as CardAssignee[] | null) ?? []) as CardAssignee[]}
      initialComments={((comments as unknown as CardComment[] | null) ?? []) as CardComment[]}
      initialMentions={((mentions as unknown as CardMention[] | null) ?? []) as CardMention[]}
      groups={(groups ?? []) as ProjectGroup[]}
      headerItems={items}
      userId={user.id}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
      initialActiveId={searchParams.p ?? null}
    />
  );
}
