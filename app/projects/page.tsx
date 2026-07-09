import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Project } from '@/lib/types';
import ProjectsHome, { type CardLite } from './ProjectsHome';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your projects', robots: { index: false, follow: false } };

export default async function ProjectsPage() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: projects }, { data: cards }] = await Promise.all([
    supabase.from('projects').select('*').order('position').order('created_at'),
    supabase.from('cards').select('id, project_id, type, done')
  ]);

  return (
    <ProjectsHome
      initialProjects={(projects ?? []) as Project[]}
      cards={(cards ?? []) as CardLite[]}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
    />
  );
}
