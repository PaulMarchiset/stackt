import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  /* An account with no row, an empty list, or a list whose every entry points at
     something deleted all mean the same thing: head the board the default way. */
  const items: HeaderItem[] = parseHeaderItems(prefs?.header_items);

  return (
    <BoardApp
      initialProjects={(projects ?? []) as Project[]}
      initialCards={(cards ?? []) as Card[]}
      initialVersions={(versions ?? []) as Version[]}
      groups={(groups ?? []) as ProjectGroup[]}
      headerItems={items.length ? items : DEFAULT_USER_PREFS.header_items}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
      initialActiveId={searchParams.p ?? null}
    />
  );
}
