import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { DEMO_USER, demoData } from '@/lib/demo/fixture';
import { isDemo } from '@/lib/demo/server';
import type { Project, ProjectGroup } from '@/lib/types';
import { withPersonal, type MembershipRow } from '@/lib/personal';
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
        userId={DEMO_USER.id}
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

  /* The safety net under invite_to_project(). Invitations to an address with no
     account yet still wait in project_invites, and until this call existed the
     only thing that redeemed them was the sign-in path — so anyone who signed
     up, stayed signed in, and was invited afterwards saw nothing and had no way
     to make the board appear short of signing out.

     Serial, not in the Promise.all below: a membership written after the
     projects SELECT has already run would not show up until the next load,
     which is the whole failure this is here to prevent. It costs an index probe
     on project_invites and returns without writing when there is nothing
     addressed to this person, which is nearly always.

     Never allowed to fail the page: not reaching a shared project is a smaller
     failure than not reaching your own. */
  const { error: claimErr } = await supabase.rpc('claim_project_invites');
  if (claimErr) console.error('claim_project_invites failed:', claimErr.message);

  const [{ data: projects }, { data: cards }, { data: groups }, { data: members }] = await Promise.all([
    supabase.from('projects').select('*').order('created_at'),
    supabase.from('cards').select('id, project_id, type, done'),
    supabase.from('project_groups').select('*').order('position'),
    supabase.from('project_members')
      .select('project_id, favorite, position, group_id').eq('user_id', user.id)
  ]);

  /* Favourite, order and band are personal, so they come off this user's
     membership rather than the shared project row (lib/personal.ts). */
  const merged = withPersonal((projects ?? []) as Project[], (members ?? []) as MembershipRow[]);

  return (
    <ProjectsHome
      initialProjects={merged}
      cards={(cards ?? []) as CardLite[]}
      groups={(groups ?? []) as ProjectGroup[]}
      userId={user.id}
      userEmail={user.email ?? ''}
      userName={(user.user_metadata?.username as string) ?? ''}
    />
  );
}
