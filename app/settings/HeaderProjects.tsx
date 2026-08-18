'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { parseHeaderItems } from '@/lib/grouping';
import { useHeaderItems } from '@/lib/useHeaderItems';
import type { Project, ProjectGroup } from '@/lib/types';
import HeaderComposer from '@/app/components/HeaderComposer';

/**
 * Which projects head the board.
 *
 * This screen used to be the only place groups existed at all: it created them,
 * named them, coloured them and held a grid of every project against every
 * group. All of that now lives on /projects, where the projects are — so what
 * is left here is the one account-wide choice that isn't about a project:
 * what the board header shows, and in which order.
 *
 * It is the same <HeaderComposer> the board draws in its own header, on the
 * same hook, so the two cannot disagree.
 */
export default function HeaderProjects({
  userId, onToast
}: {
  userId: string; onToast: (msg: string, error?: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [projects, setProjects] = useState<Project[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const selection = useHeaderItems(userId, [], onToast);
  const { setItems } = selection;

  useEffect(() => {
    let alive = true;
    (async () => {
      const [projRes, grpRes, prefRes] = await Promise.all([
        supabase.from('projects').select('*').order('position').order('created_at'),
        supabase.from('project_groups').select('*').order('position'),
        supabase.from('user_prefs').select('header_items').eq('user_id', userId).maybeSingle()
      ]);
      if (!alive) return;
      setProjects((projRes.data as Project[]) || []);
      setGroups((grpRes.data as ProjectGroup[]) || []);
      setItems(parseHeaderItems(prefRes.data?.header_items));
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase, userId, setItems]);

  if (loading) return <div className="set-card"><div className="set-row"><p className="set-desc">Loading…</p></div></div>;

  return (
    <div className="set-card">
      <div className="set-row">
        <span className="set-label">What heads the board</span>
        <p className="set-desc" style={{ marginTop: 0, marginBottom: 14 }}>
          Build the header out of your favorites, your groups and single projects — in the order you want them.
          Each entry becomes one island of tabs. Choosing nothing shows every project.
        </p>
        <HeaderComposer items={selection.items} projects={projects} groups={groups} onChange={selection.update} />
      </div>

      <div className="set-row">
        <div className="set-rowhead">
          <div className="set-rowtext">
            <h3 className="set-h3">Groups</h3>
            <p className="set-desc">
              Groups are made and filled where the projects are: drag a project into one, rename it in place,
              pick its colour. They band the projects page and can head the board from here.
            </p>
          </div>
          <Link className="btn ghost set-action" href="/projects">Open projects</Link>
        </div>
      </div>
    </div>
  );
}
