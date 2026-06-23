'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Project } from '@/lib/types';
import Logo from '../Logo';

export type CardLite = { id: string; project_id: string; type: string };

export default function ProjectsHome({
  initialProjects, cards, userEmail
}: {
  initialProjects: Project[]; cards: CardLite[]; userEmail: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [busy, setBusy] = useState(false);

  const counts = (id: string) => {
    let u = 0, b = 0;
    cards.forEach((c) => { if (c.project_id === id) (c.type === 'bug' ? b++ : u++); });
    return { u, b };
  };

  async function create() {
    setBusy(true);
    const { data, error } = await supabase.from('projects').insert({ name: 'New project' }).select().single();
    setBusy(false);
    if (error || !data) { alert('Could not create project — check your connection.'); return; }
    router.push(`/board?p=${(data as Project).id}`);
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete "${name}"? Its cards will be deleted too. This cannot be undone.`)) return;
    setProjects((ps) => ps.filter((p) => p.id !== id));
    await supabase.from('projects').delete().eq('id', id);
  }

  return (
    <div className="home">
      <header className="home-top">
        <Logo height={22} className="brand-logo-full" />
        <div className="meta-spacer" />
        <span className="user-email">{userEmail}</span>
        <form action="/auth/signout" method="post">
          <button className="btn signout" type="submit">Sign out</button>
        </form>
      </header>

      <div className="home-head">
        <h1 className="home-title">Your projects</h1>
        <button className="btn solid" onClick={create} disabled={busy}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg>
          {busy ? 'Creating…' : 'New project'}
        </button>
      </div>

      <div className="home-grid">
        {projects.map((p) => {
          const { u, b } = counts(p.id);
          return (
            <div key={p.id} className="proj-card">
              <a className="proj-open" href={`/board?p=${p.id}`}>
                <span className="proj-mark"><span /><span /><span /></span>
                <h2 className="proj-name">{p.name || 'Untitled'}</h2>
                <p className="proj-meta">
                  {u} update{u !== 1 ? 's' : ''}{b ? ` · ${b} bug${b !== 1 ? 's' : ''}` : ''}
                </p>
              </a>
              <button className="proj-del" title="Delete project" onClick={() => remove(p.id, p.name)}>
                <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" /></svg>
              </button>
            </div>
          );
        })}
        {projects.length === 0 && <div className="empty-hint">No projects yet — create your first one.</div>}
      </div>
    </div>
  );
}
