'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import type { Project, Version } from '@/lib/types';
import { versionTheme } from '@/lib/util';
import { useDevMode } from '@/lib/useDevMode';
import { vocab } from '@/lib/labels';
import Modal from '@/app/board/Modal';
import WhatsNew from '@/app/components/WhatsNew';
import AccountMenu from '@/app/components/AccountMenu';
import Logo from '../Logo';

export type CardLite = { id: string; project_id: string; type: string; done: boolean };

/* Per-project board mode: follow the account default, or force developer/simple. */
type Mode = 'default' | 'dev' | 'simple';
const modeToDev = (m: Mode): boolean | null => (m === 'default' ? null : m === 'dev');
const devToMode = (d: boolean | null): Mode => (d == null ? 'default' : d ? 'dev' : 'simple');

/* Up to two initials from a project name for its card avatar. */
function initials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/* Three-way segmented control for the board mode. */
function ModeSelect({ value, onChange }: { value: Mode; onChange: (m: Mode) => void }) {
  return (
    <div className="seg">
      {(['default', 'dev', 'simple'] as Mode[]).map((m) => (
        <button key={m} type="button" className={'seg-opt' + (value === m ? ' active' : '')} onClick={() => onChange(m)}>
          {m === 'default' ? 'Default' : m === 'dev' ? 'Developer' : 'Simple'}
        </button>
      ))}
    </div>
  );
}

export default function ProjectsHome({
  initialProjects, cards, userEmail, userName = ''
}: {
  initialProjects: Project[]; cards: CardLite[]; userEmail: string; userName?: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [devMode] = useDevMode();
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [busy, setBusy] = useState(false);
  const [editProj, setEditProj] = useState<{ id: string; name: string; mode: Mode } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [delText, setDelText] = useState('');
  const [menuId, setMenuId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number>(0);

  // Close an open card menu on outside click / Escape.
  useEffect(() => {
    if (!menuId) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.proj-menu') && !t.closest('.proj-menu-btn')) setMenuId(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuId(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menuId]);
  // "New project" dialog fields.
  const [newOpen, setNewOpen] = useState(false);
  const [npName, setNpName] = useState('');
  const [npRepo, setNpRepo] = useState('');
  const [npVersion, setNpVersion] = useState('');
  const [npMode, setNpMode] = useState<Mode>('default');
  // Vocabulary for the create dialog follows the mode being chosen for the new project.
  const npV = vocab(npMode === 'default' ? devMode : npMode === 'dev');

  function showToast(msg: string) {
    setToast(msg);
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }

  // Counts reflect remaining (not-done) work, so a project card shows what's left
  // to do rather than its lifetime total.
  const counts = (id: string) => {
    let u = 0, b = 0;
    cards.forEach((c) => { if (c.project_id === id && !c.done) (c.type === 'bug' ? b++ : u++); });
    return { u, b };
  };

  function openCreate() {
    setNpName(''); setNpRepo(''); setNpVersion(''); setNpMode('default');
    setNewOpen(true);
  }
  async function submitCreate() {
    if (busy) return;
    setBusy(true);
    const version = npVersion.trim();
    const { data, error } = await supabase.from('projects').insert({
      name: npName.trim() || 'New project',
      repo_url: npRepo.trim(),
      dev_mode: modeToDev(npMode)
    }).select().single();
    if (error || !data) { setBusy(false); showToast('Could not create project — check your connection.'); return; }
    const project = data as Project;
    // Seed the first version as a real row and mark it active.
    if (version) {
      const { data: ver } = await supabase.from('versions')
        .insert({ project_id: project.id, name: version, position: 0 }).select().single();
      if (ver) await supabase.from('projects').update({ active_version_id: (ver as Version).id }).eq('id', project.id);
    }
    setBusy(false);
    router.push(`/board?p=${project.id}`);
  }

  async function confirmDelete() {
    if (!confirmDel) return;
    if (delText.trim() !== (confirmDel.name || 'Untitled')) return; // name must match
    const { id } = confirmDel;
    setConfirmDel(null);
    setProjects((ps) => ps.filter((p) => p.id !== id));
    const { error } = await supabase.from('projects').delete().eq('id', id);
    if (error) { console.error('delete failed:', error); showToast('Could not delete — check your connection.'); }
  }

  async function saveEdit() {
    if (!editProj) return;
    const { id } = editProj;
    const clean = editProj.name.trim() || 'Untitled';
    const dev_mode = modeToDev(editProj.mode);
    setEditProj(null);
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, name: clean, dev_mode } : p)));
    const { error } = await supabase.from('projects').update({ name: clean, dev_mode }).eq('id', id);
    if (error) { console.error('save failed:', error); showToast('Could not save — check your connection.'); }
  }

  async function toggleFavorite(id: string, next: boolean) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, favorite: next } : p)));
    const { error } = await supabase.from('projects').update({ favorite: next }).eq('id', id);
    if (error) {
      console.error('favorite update failed:', error);
      setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, favorite: !next } : p))); // revert
      showToast('Could not update favorite — check your connection.');
    }
  }

  const projectCard = (p: Project) => {
    const { u, b } = counts(p.id);
    const pv = vocab(p.dev_mode ?? devMode);
    const meta = `${u} ${(u !== 1 ? pv.updates : pv.update).toLowerCase()}${b ? ` · ${b} ${(b !== 1 ? pv.bugs : pv.bug).toLowerCase()}` : ''}`;
    return (
      <div key={p.id} className="proj-card">
        <div className="proj-actions">
          <button
            className={'proj-fav' + (p.favorite ? ' on' : '')}
            title={p.favorite ? 'Remove from favorites' : 'Add to favorites'}
            aria-pressed={p.favorite}
            onClick={() => toggleFavorite(p.id, !p.favorite)}
          >
            <svg viewBox="0 0 24 24"><path d="M11.2827 3.45332C11.5131 2.98638 11.6284 2.75291 11.7848 2.67831C11.9209 2.61341 12.0791 2.61341 12.2152 2.67831C12.3717 2.75291 12.4869 2.98638 12.7174 3.45332L14.9041 7.88328C14.9721 8.02113 15.0061 8.09006 15.0558 8.14358C15.0999 8.19096 15.1527 8.22935 15.2113 8.25662C15.2776 8.28742 15.3536 8.29854 15.5057 8.32077L20.397 9.03571C20.9121 9.11099 21.1696 9.14863 21.2888 9.27444C21.3925 9.38389 21.4412 9.5343 21.4215 9.68377C21.3988 9.85558 21.2124 10.0372 20.8395 10.4004L17.3014 13.8464C17.1912 13.9538 17.136 14.0076 17.1004 14.0715C17.0689 14.128 17.0487 14.1902 17.0409 14.2545C17.0321 14.3271 17.0451 14.403 17.0711 14.5547L17.906 19.4221C17.994 19.9355 18.038 20.1922 17.9553 20.3445C17.8833 20.477 17.7554 20.57 17.6071 20.5975C17.4366 20.6291 17.2061 20.5078 16.7451 20.2654L12.3724 17.9658C12.2361 17.8942 12.168 17.8584 12.0962 17.8443C12.0327 17.8318 11.9673 17.8318 11.9038 17.8443C11.832 17.8584 11.7639 17.8942 11.6277 17.9658L7.25492 20.2654C6.79392 20.5078 6.56341 20.6291 6.39297 20.5975C6.24468 20.57 6.11672 20.477 6.04474 20.3445C5.962 20.1922 6.00603 19.9355 6.09407 19.4221L6.92889 14.5547C6.95491 14.403 6.96793 14.3271 6.95912 14.2545C6.95132 14.1902 6.93111 14.128 6.89961 14.0715C6.86402 14.0076 6.80888 13.9538 6.69859 13.8464L3.16056 10.4004C2.78766 10.0372 2.60121 9.85558 2.57853 9.68377C2.55879 9.5343 2.60755 9.38389 2.71125 9.27444C2.83044 9.14863 3.08797 9.11099 3.60304 9.03571L8.49431 8.32077C8.64642 8.29854 8.72248 8.28742 8.78872 8.25662C8.84736 8.22935 8.90016 8.19096 8.94419 8.14358C8.99391 8.09006 9.02793 8.02113 9.09597 7.88328L11.2827 3.45332Z" /></svg>
          </button>
          <button className="proj-menu-btn" title="More" aria-haspopup="menu" aria-expanded={menuId === p.id}
            onClick={() => setMenuId(menuId === p.id ? null : p.id)}>
            <svg viewBox="0 0 24 24"><path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" /><path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" /><path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" /></svg>
          </button>
        </div>
        {menuId === p.id && (
          <div className="proj-menu" role="menu">
            <button role="menuitem" onClick={() => { setEditProj({ id: p.id, name: p.name, mode: devToMode(p.dev_mode) }); setMenuId(null); }}>
              <svg viewBox="0 0 24 24"><path d="M12 20H21M3.00003 20H4.67457C5.16376 20 5.40835 20 5.63852 19.9447C5.84259 19.8957 6.03768 19.8149 6.21663 19.7053C6.41846 19.5816 6.59141 19.4086 6.93732 19.0627L19.5001 6.49998C20.3285 5.67156 20.3285 4.32841 19.5001 3.49998C18.6716 2.67156 17.3285 2.67156 16.5001 3.49998L3.93729 16.0627C3.59139 16.4086 3.41843 16.5816 3.29475 16.7834C3.18509 16.9624 3.10428 17.1574 3.05529 17.3615C3.00003 17.5917 3.00003 17.8363 3.00003 18.3255V20Z" /></svg> Edit
            </button>
            <button role="menuitem" className="danger" onClick={() => { setConfirmDel({ id: p.id, name: p.name }); setDelText(''); setMenuId(null); }}>
              <svg viewBox="0 0 24 24"><path d="M9 3H15M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 18.1409 18.8867 17.8 19.485C17.4999 20.0118 17.0472 20.4353 16.5017 20.6997C15.882 21 15.0911 21 13.5093 21H10.4907C8.90891 21 8.11803 21 7.49834 20.6997C6.95276 20.4353 6.50009 20.0118 6.19998 19.485C5.85911 18.8867 5.8065 18.0975 5.70129 16.5193L5 6" /></svg> Delete
            </button>
          </div>
        )}
        <a className="proj-open" href={`/board?p=${p.id}`}>
          <span className={'proj-mark card-theme-' + versionTheme(p.name)}>{initials(p.name)}</span>
          <h2 className="proj-name">{p.name || 'Untitled'}</h2>
          <p className="proj-meta">{meta}</p>
        </a>
      </div>
    );
  };

  const favorites = projects.filter((p) => p.favorite);
  const others = projects.filter((p) => !p.favorite);

  return (
    <div className="home">
      <WhatsNew />
      <header className="home-top">
        <Logo height={22} className="brand-logo-full" />
        <div className="meta-spacer" />
        <AccountMenu userEmail={userEmail} userName={userName} />
      </header>

      <div className="home-head">
        <h1 className="home-title">Your projects</h1>
        <button className="btn solid" onClick={openCreate}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg>
          New project
        </button>
      </div>

      {favorites.length > 0 && (
        <>
          <h2 className="home-section">
            <svg viewBox="0 0 24 24" className="home-section-ic"><path d="M11.2827 3.45332C11.5131 2.98638 11.6284 2.75291 11.7848 2.67831C11.9209 2.61341 12.0791 2.61341 12.2152 2.67831C12.3717 2.75291 12.4869 2.98638 12.7174 3.45332L14.9041 7.88328C14.9721 8.02113 15.0061 8.09006 15.0558 8.14358C15.0999 8.19096 15.1527 8.22935 15.2113 8.25662C15.2776 8.28742 15.3536 8.29854 15.5057 8.32077L20.397 9.03571C20.9121 9.11099 21.1696 9.14863 21.2888 9.27444C21.3925 9.38389 21.4412 9.5343 21.4215 9.68377C21.3988 9.85558 21.2124 10.0372 20.8395 10.4004L17.3014 13.8464C17.1912 13.9538 17.136 14.0076 17.1004 14.0715C17.0689 14.128 17.0487 14.1902 17.0409 14.2545C17.0321 14.3271 17.0451 14.403 17.0711 14.5547L17.906 19.4221C17.994 19.9355 18.038 20.1922 17.9553 20.3445C17.8833 20.477 17.7554 20.57 17.6071 20.5975C17.4366 20.6291 17.2061 20.5078 16.7451 20.2654L12.3724 17.9658C12.2361 17.8942 12.168 17.8584 12.0962 17.8443C12.0327 17.8318 11.9673 17.8318 11.9038 17.8443C11.832 17.8584 11.7639 17.8942 11.6277 17.9658L7.25492 20.2654C6.79392 20.5078 6.56341 20.6291 6.39297 20.5975C6.24468 20.57 6.11672 20.477 6.04474 20.3445C5.962 20.1922 6.00603 19.9355 6.09407 19.4221L6.92889 14.5547C6.95491 14.403 6.96793 14.3271 6.95912 14.2545C6.95132 14.1902 6.93111 14.128 6.89961 14.0715C6.86402 14.0076 6.80888 13.9538 6.69859 13.8464L3.16056 10.4004C2.78766 10.0372 2.60121 9.85558 2.57853 9.68377C2.55879 9.5343 2.60755 9.38389 2.71125 9.27444C2.83044 9.14863 3.08797 9.11099 3.60304 9.03571L8.49431 8.32077C8.64642 8.29854 8.72248 8.28742 8.78872 8.25662C8.84736 8.22935 8.90016 8.19096 8.94419 8.14358C8.99391 8.09006 9.02793 8.02113 9.09597 7.88328L11.2827 3.45332Z" /></svg>
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

      {newOpen && (
        <Modal title="New project" className="modal-wide modal-center" onClose={() => setNewOpen(false)}>
          <div className="modal-form">
            <label className="modal-form-label">Name</label>
            <input className="modal-form-input" autoFocus spellCheck={false} placeholder="My project" value={npName}
              onChange={(e) => setNpName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setNewOpen(false); }} />
            <label className="modal-form-label">Git repository <em>(optional)</em></label>
            <input className="modal-form-input" spellCheck={false} inputMode="url" placeholder="https://github.com/org/repo" value={npRepo}
              onChange={(e) => setNpRepo(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setNewOpen(false); }} />
            <label className="modal-form-label">First {npV.version.toLowerCase()} <em>(optional)</em></label>
            <input className="modal-form-input" spellCheck={false} placeholder={`e.g. ${npV.versionExample}`} value={npVersion}
              onChange={(e) => setNpVersion(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitCreate(); if (e.key === 'Escape') setNewOpen(false); }} />
            <label className="modal-form-label">Board mode</label>
            <ModeSelect value={npMode} onChange={setNpMode} />
            <div className="edit-actions">
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setNewOpen(false)}>Cancel</button>
              <button className="btn solid" onClick={submitCreate} disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
            </div>
          </div>
        </Modal>
      )}

      {editProj && (
        <Modal title="Edit project" className="modal-wide modal-center" onClose={() => setEditProj(null)}>
          <div className="modal-form">
            <label className="modal-form-label">Name</label>
            <input className="modal-form-input" autoFocus spellCheck={false} value={editProj.name}
              onChange={(e) => setEditProj({ ...editProj, name: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditProj(null); }} />
            <label className="modal-form-label">Board mode</label>
            <ModeSelect value={editProj.mode} onChange={(m) => setEditProj({ ...editProj, mode: m })} />
            <div className="edit-actions">
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setEditProj(null)}>Cancel</button>
              <button className="btn solid" onClick={saveEdit}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {confirmDel && (() => {
        const target = confirmDel.name || 'Untitled';
        const ok = delText.trim() === target;
        return (
          <Modal title="Delete project" className="modal-center" onClose={() => setConfirmDel(null)}>
            <div className="modal-form">
              <p className="modal-form-hint">
                Deleting <strong>“{target}”</strong> removes it and all its cards. This can&apos;t be undone.
              </p>
              <p className="modal-form-hint">Type <strong className="del-name">{target}</strong> to confirm.</p>
              <input className="modal-form-input" autoFocus spellCheck={false} value={delText}
                onChange={(e) => setDelText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && ok) confirmDelete(); if (e.key === 'Escape') setConfirmDel(null); }} />
              <div className="edit-actions">
                <div className="meta-spacer" />
                <button className="btn ghost" onClick={() => setConfirmDel(null)}>Cancel</button>
                <button className="btn danger-solid" onClick={confirmDelete} disabled={!ok}>Delete</button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {toast && <div className="toast show error">{toast}</div>}
    </div>
  );
}
