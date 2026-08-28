import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEMO_USER, demoData } from '@/lib/demo/fixture';
import { isDemo } from '@/lib/demo/server';
import { DEFAULT_USER_PREFS, type HeaderItem, type Project, type Card, type ProjectGroup, type Version } from '@/lib/types';
import { parseHeaderItems } from '@/lib/grouping';
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

  const [{ data: projects }, { data: cards }, { data: versions }, { data: groups }, { data: prefs }] = await Promise.all([
    supabase.from('projects').select('*').order('position').order('created_at'),
    supabase.from('cards').select('*').order('created_at'),
    supabase.from('versions').select('*').order('position'),
    supabase.from('project_groups').select('*').order('position'),
    supabase.from('user_prefs').select('header_items').eq('user_id', user.id).maybeSingle()
  ]);

  /* No row means "never chose anything" — the defaults. An existing row with an
     empty list means the opposite: you took everything out on purpose, and the
     header falls back to showing every project (see headerIslands, rule 1).
     Collapsing the two would put Favorites back after a reload. */
  const items: HeaderItem[] = prefs
    ? parseHeaderItems(prefs.header_items)
    : DEFAULT_USER_PREFS.header_items;

  return (
    <BoardApp
      initialProjects={(projects ?? []) as Project[]}
      initialCards={(cards ?? []) as Card[]}
      initialVersions={(versions ?? []) as Version[]}
      groups={(groups ?? []) as ProjectGroup[]}
      headerItems={items}
      userId={user.id}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
      initialActiveId={searchParams.p ?? null}
    />
  );
}
