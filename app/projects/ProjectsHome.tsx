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
  const [editingId, setEditingId] = useState<string | null>(null);

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

  async function rename(id: string, name: string) {
    const clean = name.trim() || 'Untitled';
    setEditingId(null);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, name: clean } : p)));
    const { error } = await supabase.from('projects').update({ name: clean }).eq('id', id);
    if (error) { console.error('rename failed:', error); alert('Could not rename — check your connection.'); }
  }

  async function toggleFavorite(id: string, next: boolean) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, favorite: next } : p)));
    const { error } = await supabase.from('projects').update({ favorite: next }).eq('id', id);
    if (error) {
      console.error('favorite update failed:', error);
      setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, favorite: !next } : p))); // revert
      alert('Could not update favorite — check your connection.');
    }
  }

  const projectCard = (p: Project) => {
    const { u, b } = counts(p.id);
    const meta = `${u} update${u !== 1 ? 's' : ''}${b ? ` · ${b} bug${b !== 1 ? 's' : ''}` : ''}`;
    return (
      <div key={p.id} className="proj-card">
        <div className="proj-actions">
          <button
            className={'proj-fav' + (p.favorite ? ' on' : '')}
            title={p.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={p.favorite}
            onClick={() => toggleFavorite(p.id, !p.favorite)}
          >
            <svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9 6.75 19.66l1-5.86L3.5 9.66l5.9-.86z" /></svg>
          </button>
          <button className="proj-edit" title="Rename project" onClick={() => setEditingId(p.id)}>
            <svg viewBox="0 0 16 16"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" /></svg>
          </button>
          <button className="proj-del" title="Delete project" onClick={() => remove(p.id, p.name)}>
            <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" /></svg>
          </button>
        </div>
        {editingId === p.id ? (
          <div className="proj-open editing">
            <span className="proj-mark"><span /><span /><span /></span>
            <input className="proj-rename" defaultValue={p.name} autoFocus spellCheck={false}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') setEditingId(null); }}
              onBlur={(e) => rename(p.id, e.target.value)} />
            <p className="proj-meta">{meta}</p>
          </div>
        ) : (
          <a className="proj-open" href={`/board?p=${p.id}`}>
            <span className="proj-mark"><span /><span /><span /></span>
            <h2 className="proj-name">{p.name || 'Untitled'}</h2>
            <p className="proj-meta">{meta}</p>
          </a>
        )}
      </div>
    );
  };

  const favorites = projects.filter((p) => p.favorite);
  const others = projects.filter((p) => !p.favorite);

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

      {favorites.length > 0 && (
        <>
          <h2 className="home-section">
            <svg viewBox="0 0 24 24" className="home-section-ic"><path d="M12 3.5l2.6 5.3 5.9.86-4.25 4.14 1 5.86L12 17.9 6.75 19.66l1-5.86L3.5 9.66l5.9-.86z" /></svg>
            Favorites
          </h2>
          <div className="home-grid">
            {favorites.map(projectCard)}
          </div>
          <h2 className="home-section muted">All projects</h2>
        </>
      )}

      <div className="home-grid">
        {others.map(projectCard)}
        {projects.length === 0 && <div className="empty-hint">No projects yet — create your first one.</div>}
        {projects.length > 0 && others.length === 0 && favorites.length > 0 &&
          <div className="empty-hint">Every project is a favorite.</div>}
      </div>
    </div>
  );
}
