import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Project, Card } from '@/lib/types';
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

  const [{ data: projects }, { data: cards }] = await Promise.all([
    supabase.from('projects').select('*').order('position').order('created_at'),
    supabase.from('cards').select('*').order('created_at')
  ]);

  return (
    <BoardApp
      initialProjects={(projects ?? []) as Project[]}
      initialCards={(cards ?? []) as Card[]}
      userEmail={user.email ?? ''}
      initialActiveId={searchParams.p ?? null}
    />
  );
}
