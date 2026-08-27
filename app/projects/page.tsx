import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEMO_USER, demoData } from '@/lib/demo/fixture';
import { isDemo } from '@/lib/demo/server';
import type { Project, ProjectGroup } from '@/lib/types';
import ProjectsHome, { type CardLite } from './ProjectsHome';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Your projects', robots: { index: false, follow: false } };

export default async function ProjectsPage() {
  /* Asked before auth: the demo has no session, and when you do have one it is
     the demo you came for (see /demo). */
  if (isDemo()) {
    const d = demoData();
    return (
      <ProjectsHome
        demo
        initialProjects={d.projects}
        cards={d.cards.map(({ id, project_id, type, done }) => ({ id, project_id, type, done }))}
        groups={d.groups}
        userEmail={DEMO_USER.email}
        userName={DEMO_USER.name}
      />
    );
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const [{ data: projects }, { data: cards }, { data: groups }] = await Promise.all([
    supabase.from('projects').select('*').order('position').order('created_at'),
    supabase.from('cards').select('id, project_id, type, done'),
    supabase.from('project_groups').select('*').order('position')
  ]);

  return (
    <ProjectsHome
      initialProjects={(projects ?? []) as Project[]}
      cards={(cards ?? []) as CardLite[]}
      groups={(groups ?? []) as ProjectGroup[]}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
    />
  );
}
