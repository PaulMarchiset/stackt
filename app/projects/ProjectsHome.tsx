'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Project, ProjectGroup, Version } from '@/lib/types';
import { applyProjectDrop, favoriteProjects, projectSections, sortGroups, type ProjectSection } from '@/lib/grouping';
import { useDevMode } from '@/lib/useDevMode';
import { useDragSort } from '@/lib/useDragSort';
import { useIsMobile } from '@/lib/useIsMobile';
import { useProjectsStore } from '@/lib/useProjectsStore';
import { useToast } from '@/lib/useToast';
import { vocab } from '@/lib/labels';
import Modal from '@/app/board/Modal';
import Toast from '@/app/components/Toast';
import WhatsNew from '@/app/components/WhatsNew';
import AccountMenu from '@/app/components/AccountMenu';
import { IconPlus } from '@/app/components/icons';
import Logo from '../Logo';
import FavoritesBar from './FavoritesBar';
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
 * Every project is drawn once, in the one band it lives in. Favorites is a
 * shortcut, so it is drawn like one: the chip bar on top, not a band of its own
 * repeating cards you can already see (see FavoritesBar).
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
  /* Dragging is a pointer affordance. On touch there is no handle at all and
     the ⋯ menus do the same work in one tap, so the whole apparatus is simply
     not handed down. */
  const dnd = useDragSort();
  const isMobile = useIsMobile();

  const [busy, setBusy] = useState(false);
  const [editProj, setEditProj] = useState<{ id: string; name: string; mode: Mode } | null>(null);
  const [confirmDel, setConfirmDel] = useState<{ id: string; name: string } | null>(null);
  const [delText, setDelText] = useState('');
  const [confirmDelGroup, setConfirmDelGroup] = useState<ProjectGroup | null>(null);
  const [menu, setMenu] = useState<OpenMenu>(null);
  /* The group made a moment ago, whose heading should take the caret. Naming
     happens in the heading itself rather than in a dialog beforehand, so the
     only thing left to carry across is *which* band to hand the keyboard to. */
  const [justMade, setJustMade] = useState<string | null>(null);

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

  /**
   * Make a group and start naming it.
   *
   * There is no "name it first" dialog: the band's heading is already an
   * editable field, so a modal was asking for something the page could ask for
   * itself — and it bought that name at the cost of an extra screen, a
   * placeholder-shaped decision made before you could see the band, and a band
   * that then appeared somewhere you weren't looking. The group is created with
   * a placeholder, lands on top, and its heading gets the caret with the
   * placeholder selected: type, press Enter, done.
   *
   * `forProject` is set when the group was started from a project's ⋯ menu, and
   * that project drops into it at once — the reason the group was made at all.
   */
  async function addGroup(forProject: string | null) {
    const created = await store.createGroup('New group');
    if (!created) return;
    if (forProject) store.patchProject(forProject, { group_id: created.id });
    setJustMade(created.id);
  }

  function deleteGroup() {
    if (!confirmDelGroup) return;
    store.deleteGroup(confirmDelGroup.id);
    setConfirmDelGroup(null);
  }

  const sections = useMemo(() => projectSections(projects, groups), [projects, groups]);
  const favorites = useMemo(() => favoriteProjects(projects), [projects]);
  /* A group always shows, empty or not — you just made it, and it has to be
     visible to be filled. Ungrouped only shows when it holds something: an
     empty catch-all heading teaches nothing. */
  const bands = sections.filter((s) => s.kind === 'group' || s.projects.length > 0);

  /* Turning a drop into a new order is one pure function (applyProjectDrop);
     the page only reports what was dropped where and hands the result to the
     store, which renumbers and writes the rows that actually changed. */
  function dropProject() {
    const d = dnd.drag;
    if (d?.kind !== 'project' || !d.over) { dnd.end(); return; }
    store.writeProjectOrder(applyProjectDrop(projects, sections, d.id, d.over.section, d.over.index));
    dnd.end();
  }

  function dropGroup() {
    const d = dnd.drag;
    if (d?.kind !== 'group' || !d.overKey) { dnd.end(); return; }
    const ordered = sortGroups(groups);
    const from = ordered.findIndex((g) => g.id === d.id);
    const to = ordered.findIndex((g) => g.id === d.overKey);
    if (from >= 0 && to >= 0) store.reorderGroups(from, to);
    dnd.end();
  }

  /* `others` is the band without the card in flight, which is what an insertion
     index has to count: dropping "third in this band" means the same thing
     whether or not the card was already one of its members. */
  const card = (p: Project, section: ProjectSection, others: Project[]) => {
    const { u, b } = counts(p.id);
    const pv = vocab(p.dev_mode ?? devMode);
    const meta = u + ' ' + (u !== 1 ? pv.updates : pv.update).toLowerCase()
      + (b ? ' · ' + b + ' ' + (b !== 1 ? pv.bugs : pv.bug).toLowerCase() : '');
    const at = others.findIndex((x) => x.id === p.id);
    /* One gap, one marker: the bar between two cards belongs to the card on its
       right, and only the last card can wear one on its own right. */
    const dropSide = dnd.dropSection !== section.key || at < 0 ? null
      : dnd.dropIndex === at ? 'before'
        : dnd.dropIndex === at + 1 && at === others.length - 1 ? 'after' : null;

    return (
      <ProjectCard key={p.id} project={p} meta={meta} groups={groups}
        menuOpen={menu?.kind === 'project' && menu.id === p.id}
        onMenu={() => setMenu(menu?.kind === 'project' && menu.id === p.id ? null : { kind: 'project', id: p.id })}
        onEdit={() => { setEditProj({ id: p.id, name: p.name, mode: devToMode(p.dev_mode) }); setMenu(null); }}
        onDelete={() => { setConfirmDel({ id: p.id, name: p.name }); setDelText(''); setMenu(null); }}
        onToggleFavorite={() => store.patchProject(p.id, { favorite: !p.favorite })}
        onMove={(groupId) => { store.patchProject(p.id, { group_id: groupId }); setMenu(null); }}
        onNewGroup={() => { addGroup(p.id); setMenu(null); }}
        drag={isMobile ? undefined : {
          dragging: dnd.draggingProject === p.id,
          dropSide,
          onStart: () => dnd.startProject(p.id),
          onOver: (after) => { if (at >= 0) dnd.overProject(section.key, after ? at + 1 : at); },
          onEnd: dnd.end
        }} />
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
        <button className="btn ghost" onClick={() => addGroup(null)}>
          <IconPlus className="ic" /> New group
        </button>
        <button className="btn solid" onClick={openCreate}>
          <IconPlus className="ic" /> New project
        </button>
      </div>

      <FavoritesBar projects={favorites} onUnfavorite={(id) => store.patchProject(id, { favorite: false })} />

      {projects.length === 0 && groups.length === 0 ? (
        <div className="home-grid"><div className="empty-hint">No projects yet — create your first one.</div></div>
      ) : bands.map((section) => {
        const g = section.group;
        const others = section.projects.filter((p) => p.id !== dnd.draggingProject);
        /* The band as a drop zone, heading and grid alike: whatever is in
           flight, landing anywhere on a band means "put it here" — a group
           takes this band's place, a project joins it at the end. A card
           hovered inside the grid speaks for itself and says where exactly. */
        const zone = isMobile ? undefined : {
          onOver: () => {
            if (dnd.draggingProject) dnd.overProject(section.key, others.length);
            else if (g) dnd.overGroup(g.id);
          },
          onDrop: () => (dnd.drag?.kind === 'group' ? dropGroup() : dropProject())
        };
        return (
          <GroupBand key={section.key} section={section} groupsExist={groups.length > 0}
            menuOpen={menu?.kind === 'band' && menu.id === section.key}
            onMenu={() => setMenu(menu?.kind === 'band' && menu.id === section.key ? null : { kind: 'band', id: section.key })}
            onRename={(name) => { if (g) store.patchGroup(g.id, { name }); }}
            onRecolor={(i) => { if (g) { store.patchGroup(g.id, { color_index: i }); setMenu(null); } }}
            onDelete={() => { setConfirmDelGroup(g); setMenu(null); }}
            autoName={!!g && justMade === g.id}
            receiving={dnd.dropSection === section.key}
            drag={isMobile || !g ? undefined : {
              dragging: dnd.draggingGroup === g.id,
              over: dnd.groupDropKey === g.id && dnd.draggingGroup !== g.id,
              onStart: () => dnd.startGroup(g.id),
              onEnd: dnd.end
            }}
            head={zone}>
            <div className="home-grid"
              onDragOver={zone && ((e) => { e.preventDefault(); zone.onOver(); })}
              onDrop={zone && ((e) => { e.preventDefault(); zone.onDrop(); })}>
              {section.projects.map((p) => card(p, section, others))}
              {section.projects.length === 0 && (
                <div className="empty-hint band-empty">
                  {isMobile ? 'Nothing here yet — move a project in from its ⋯ menu.'
                    : 'Nothing here yet — drag a project in, or move it from its ⋯ menu.'}
                </div>
              )}
            </div>
          </GroupBand>
        );
      })}

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
