'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Project, ProjectGroup, Version } from '@/lib/types';
import { projectSections } from '@/lib/grouping';
import { useDevMode } from '@/lib/useDevMode';
import { useProjectsStore } from '@/lib/useProjectsStore';
import { useToast } from '@/lib/useToast';
import { vocab } from '@/lib/labels';
import Modal from '@/app/board/Modal';
import { PromptDialog } from '@/app/components/Dialog';
import Toast from '@/app/components/Toast';
import WhatsNew from '@/app/components/WhatsNew';
import AccountMenu from '@/app/components/AccountMenu';
import { IconPlus } from '@/app/components/icons';
import Logo from '../Logo';
import GroupBand from './GroupBand';
import ProjectCard from './ProjectCard';

export type CardLite = { id: string; project_id: string; type: string; done: boolean };

/* Per-project board mode: follow the account default, or force developer/simple. */
type Mode = 'default' | 'dev' | 'simple';
const modeToDev = (m: Mode): boolean | null => (m === 'default' ? null : m === 'dev');
const devToMode = (d: boolean | null): Mode => (d == null ? 'default' : d ? 'dev' : 'simple');

/* Whichever menu is open — a card's ⋯ or a band's. At most one at a time. */
type OpenMenu = { kind: 'project' | 'band'; id: string } | null;

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

/**
 * The projects home: everything you have, banded by group.
 *
 * This is where projects get organised, which is why groups are created,
 * renamed, recoloured and filled here rather than in settings — you group
 * things while looking at them. The bands come from the same module the board
 * header reads (lib/grouping.ts), so a group's name, colour and order are the
 * same on both screens by construction.
 *
 * A favourite deliberately appears twice: once under Favorites, once inside its
 * group. Favorites is a shortcut, not a place a project lives.
 */
export default function ProjectsHome({
  initialProjects, cards, groups: initialGroups = [], userEmail, userName = ''
}: {
  initialProjects: Project[]; cards: CardLite[]; groups?: ProjectGroup[];
  userEmail: string; userName?: string;
}) {
  const [devMode] = useDevMode();
  const router = useRouter();
  const { toast, showToast } = useToast();
  const store = useProjectsStore(initialProjects, initialGroups, showToast);
  const { projects, groups, supabase, persistRow } = store;

  const [busy, setBusy] = useState(false);
  const [editProj, setEditProj] = useState<{ id: string; name: string; mode: Mode } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [delText, setDelText] = useState('');
  const [confirmDelGroup, setConfirmDelGroup] = useState<ProjectGroup | null>(null);
  const [menu, setMenu] = useState<OpenMenu>(null);
  /* Open while a group is being named. `forProject` is set when the group was
     started from a project's menu, and that project drops into it as soon as it
     exists — the reason the group was made in the first place. */
  const [newGroup, setNewGroup] = useState<{ forProject: string | null } | null>(null);

  // Close an open menu on outside click / Escape.
  useEffect(() => {
    if (!menu) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.proj-menu, .proj-menu-btn, .band-menu, .band-menu-btn')) setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [menu]);

  // "New project" dialog fields.
  const [newOpen, setNewOpen] = useState(false);
  const [npName, setNpName] = useState('');
  const [npRepo, setNpRepo] = useState('');
  const [npVersion, setNpVersion] = useState('');
  const [npMode, setNpMode] = useState<Mode>('default');
  // Vocabulary for the create dialog follows the mode being chosen for the new project.
  const npV = vocab(npMode === 'default' ? devMode : npMode === 'dev');

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
    const project = await persistRow<Project>(
      supabase.from('projects').insert({
        name: npName.trim() || 'New project',
        repo_url: npRepo.trim(),
        dev_mode: modeToDev(npMode)
      }).select().single(),
      { message: 'Could not create project — check your connection.' }
    );
    if (!project) { setBusy(false); return; }
    // Seed the first version as a real row and mark it active.
    if (version) {
      const { data: ver } = await supabase.from('versions')
        .insert({ project_id: project.id, name: version, position: 0 }).select().single();
      if (ver) await supabase.from('projects').update({ active_version_id: (ver as Version).id }).eq('id', project.id);
    }
    setBusy(false);
    router.push('/board?p=' + project.id);
  }

  function confirmDelete() {
    if (!confirmDel) return;
    if (delText.trim() !== (confirmDel.name || 'Untitled')) return; // name must match
    store.deleteProject(confirmDel.id);
    setConfirmDel(null);
  }

  function saveEdit() {
    if (!editProj) return;
    store.patchProject(editProj.id, {
      name: editProj.name.trim() || 'Untitled',
      dev_mode: modeToDev(editProj.mode)
    });
    setEditProj(null);
  }

  async function submitNewGroup(name: string) {
    const forProject = newGroup?.forProject ?? null;
    setNewGroup(null);
    const created = await store.createGroup(name);
    if (created && forProject) store.patchProject(forProject, { group_id: created.id });
  }

  function deleteGroup() {
    if (!confirmDelGroup) return;
    store.deleteGroup(confirmDelGroup.id);
    setConfirmDelGroup(null);
  }

  const sections = useMemo(() => projectSections(projects, groups), [projects, groups]);
  /* A group always shows, empty or not — you just made it, and it has to be
     visible to be filled. The two implicit bands only show when they hold
     something: an empty "Favorites" heading teaches nothing. */
  const bands = sections.filter((s) => s.kind === 'group' || s.projects.length > 0);

  const card = (p: Project) => {
    const { u, b } = counts(p.id);
    const pv = vocab(p.dev_mode ?? devMode);
    const meta = u + ' ' + (u !== 1 ? pv.updates : pv.update).toLowerCase()
      + (b ? ' · ' + b + ' ' + (b !== 1 ? pv.bugs : pv.bug).toLowerCase() : '');
    return (
      <ProjectCard key={p.id} project={p} meta={meta} groups={groups}
        menuOpen={menu?.kind === 'project' && menu.id === p.id}
        onMenu={() => setMenu(menu?.kind === 'project' && menu.id === p.id ? null : { kind: 'project', id: p.id })}
        onEdit={() => { setEditProj({ id: p.id, name: p.name, mode: devToMode(p.dev_mode) }); setMenu(null); }}
        onDelete={() => { setConfirmDel({ id: p.id, name: p.name }); setDelText(''); setMenu(null); }}
        onToggleFavorite={() => store.patchProject(p.id, { favorite: !p.favorite })}
        onMove={(groupId) => { store.patchProject(p.id, { group_id: groupId }); setMenu(null); }}
        onNewGroup={() => { setNewGroup({ forProject: p.id }); setMenu(null); }} />
    );
  };

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
        <div className="meta-spacer" />
        <button className="btn ghost" onClick={() => setNewGroup({ forProject: null })}>
          <IconPlus className="ic" /> New group
        </button>
        <button className="btn solid" onClick={openCreate}>
          <IconPlus className="ic" /> New project
        </button>
      </div>

      {projects.length === 0 && groups.length === 0 ? (
        <div className="home-grid"><div className="empty-hint">No projects yet — create your first one.</div></div>
      ) : bands.map((section) => (
        <GroupBand key={section.key} section={section} groupsExist={groups.length > 0}
          menuOpen={menu?.kind === 'band' && menu.id === section.key}
          onMenu={() => setMenu(menu?.kind === 'band' && menu.id === section.key ? null : { kind: 'band', id: section.key })}
          onRename={(name) => { if (section.group) store.patchGroup(section.group.id, { name }); }}
          onRecolor={(i) => { if (section.group) { store.patchGroup(section.group.id, { color_index: i }); setMenu(null); } }}
          onDelete={() => { setConfirmDelGroup(section.group); setMenu(null); }}>
          <div className="home-grid">
            {section.projects.map(card)}
            {section.projects.length === 0 && (
              <div className="empty-hint band-empty">Nothing here yet — move a project in from its ⋯ menu.</div>
            )}
          </div>
        </GroupBand>
      ))}

      {newGroup && (
        <PromptDialog title="New group" label="Name" placeholder="e.g. Clients" submitLabel="Create" required
          hint="Groups band this page, and can head the board once they hold something."
          onSubmit={submitNewGroup} onCancel={() => setNewGroup(null)} />
      )}

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
            <input className="modal-form-input" spellCheck={false} placeholder={'e.g. ' + npV.versionExample} value={npVersion}
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

      {confirmDelGroup && (
        <Modal title="Delete group" className="modal-center" onClose={() => setConfirmDelGroup(null)}>
          <div className="modal-form">
            <p className="modal-form-hint">
              Deleting <strong>“{confirmDelGroup.name}”</strong> keeps every project inside it — they move back to
              Ungrouped. If the group heads your board, it stops doing so.
            </p>
            <div className="edit-actions">
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setConfirmDelGroup(null)}>Cancel</button>
              <button className="btn danger-solid" onClick={deleteGroup}>Delete group</button>
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

      <Toast toast={toast} />
    </div>
  );
}
