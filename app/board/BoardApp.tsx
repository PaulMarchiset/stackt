'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COLUMNS, PALETTE, type Card, type CardDraft, type CardType, type Project, type Status, type Version } from '@/lib/types';
import {
  dateClass, formatDateRange, repoLabel, sortCards,
  sortVersions, suggestNextVersion, versionColor
} from '@/lib/util';
import { useIsMobile } from '@/lib/useIsMobile';
import { useDevMode } from '@/lib/useDevMode';
import { vocab } from '@/lib/labels';
import Sheet from '@/app/components/Sheet';
import BranchChip from '@/app/components/BranchChip';
import TypeTag from '@/app/components/TypeTag';
import WhatsNew from '@/app/components/WhatsNew';
import AccountMenu from '@/app/components/AccountMenu';
import NotifBell from '@/app/components/NotifBell';
import { BoardDevModeContext } from '@/lib/devModeContext';
import CardEditor from './CardEditor';
import Modal from './Modal';
import Logo from '../Logo';
import Timeline from './Timeline';
import Agenda from './Agenda';

type EditTarget = string | null; // card id, or `__new__:status`, or null
type MobileSheet = { kind: 'project' } | { kind: 'menu' } | { kind: 'card'; id: string } | null;

export default function BoardApp({
  initialProjects, initialCards, initialVersions, userEmail, userName = '', initialActiveId
}: {
  initialProjects: Project[]; initialCards: Card[]; initialVersions: Version[];
  userEmail: string; userName?: string; initialActiveId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isMobile = useIsMobile();
  const [defaultDevMode] = useDevMode();

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const firstActive = (initialActiveId && initialProjects.some((p) => p.id === initialActiveId))
    ? initialActiveId : initialProjects[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(firstActive);
  const [view, setView] = useState<'board' | 'timeline'>('board');
  const [editing, setEditing] = useState<EditTarget>(null);
  const [newCardType, setNewCardType] = useState<CardType>('update');
  const [newCardDate, setNewCardDate] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'update' | 'bug'>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [justMoved, setJustMoved] = useState<string | null>(null);
  const [colorPop, setColorPop] = useState<{ id: string; x: number; y: number } | null>(null);
  const [saving, setSaving] = useState<'saved' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const toastTimer = useRef<number>(0);

  // Mobile-only UI: which bottom sheet is open, and swipe-column pager state.
  const [sheet, setSheet] = useState<MobileSheet>(null);
  // In-app dialogs (replace native prompt/confirm).
  const [repoEdit, setRepoEdit] = useState(false);
  const [repoDraft, setRepoDraft] = useState('');
  const [addVerOpen, setAddVerOpen] = useState(false);
  const [verDraft, setVerDraft] = useState('');
  const [mergeConfirm, setMergeConfirm] = useState<{ fromId: string; fromName: string; toName: string } | null>(null);
  const [delVerConfirm, setDelVerConfirm] = useState<{ id: string; name: string } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const [activeCol, setActiveCol] = useState(0);
  const onBoardScroll = () => {
    const el = boardRef.current;
    if (el) setActiveCol(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const goCol = (i: number) => {
    const el = boardRef.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };

  const project = projects.find((p) => p.id === activeId) ?? projects[0] ?? null;
  const projCards = useMemo(
    () => (project ? cards.filter((c) => c.project_id === project.id) : []),
    [cards, project]
  );
  // This project's versions in display order, and a quick id → version lookup.
  const projVersions = useMemo(
    () => (project ? sortVersions(versions.filter((z) => z.project_id === project.id)) : []),
    [versions, project]
  );
  const versionById = useMemo(() => new Map(versions.map((z) => [z.id, z] as const)), [versions]);
  const versionName = (id: string | null | undefined) => (id ? versionById.get(id)?.name ?? '' : '');

  // Effective developer mode for the open board: the project's own choice if it
  // set one, otherwise the device-wide default.
  const devMode = project?.dev_mode ?? defaultDevMode;
  const v = vocab(devMode);

  // Latest projects order, for reads inside drag handlers (avoids stale closures).
  const projectsRef = useRef(projects);
  projectsRef.current = projects;
  const dragProj = useRef<string | null>(null);

  function showToast(msg: string, err = false) {
    setToast({ msg, err });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }

  async function persist(p: PromiseLike<{ error: unknown }>) {
    setSaving('saving');
    const { error } = await p;
    if (error) { setSaving('error'); showToast('Could not save — check your connection.', true); }
    else setSaving('saved');
  }

  /* ---------- Project ops ---------- */
  function patchProject(id: string, patch: Partial<Project>) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    void persist(supabase.from('projects').update(patch).eq('id', id));
  }
  function openRepoEdit() { setRepoDraft(project?.repo_url || ''); setRepoEdit(true); }
  function saveRepo() { if (project) patchProject(project.id, { repo_url: repoDraft.trim() }); setRepoEdit(false); }
  /* Drag-to-reorder the header project tabs; positions persist so the order sticks. */
  function onProjDragOver(overId: string) {
    const from = dragProj.current;
    if (!from || from === overId) return;
    setProjects((ps) => {
      const fi = ps.findIndex((p) => p.id === from);
      const ti = ps.findIndex((p) => p.id === overId);
      if (fi < 0 || ti < 0 || fi === ti) return ps;
      const arr = [...ps];
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      return arr;
    });
  }
  function onProjDrop() {
    dragProj.current = null;
    const arr = projectsRef.current;
    let dirty = false;
    arr.forEach((p, i) => {
      if (p.position !== i) { dirty = true; void persist(supabase.from('projects').update({ position: i }).eq('id', p.id)); }
    });
    if (dirty) setProjects((ps) => ps.map((p) => {
      const i = arr.findIndex((x) => x.id === p.id);
      return p.position === i ? p : { ...p, position: i };
    }));
  }
  /* ---------- Card ops ---------- */
  async function addCard(values: Partial<Card>, status: Status) {
    if (!project) return;
    const row = {
      project_id: project.id, title: values.title ?? '', comment: values.comment ?? '', version_id: values.version_id ?? null,
      target_date: values.target_date ?? null, end_date: values.end_date ?? null,
      status, done: status === 'done', type: values.type ?? 'update', branch: values.branch ?? ''
    };
    setSaving('saving');
    const { data, error } = await supabase.from('cards').insert(row).select().single();
    if (error || !data) { setSaving('error'); showToast('Could not add card', true); return; }
    setSaving('saved');
    setCards((cs) => [...cs, data as Card]);
  }
  function patchCard(id: string, patch: Partial<Card>) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    void persist(supabase.from('cards').update(patch).eq('id', id));
  }
  function deleteCard(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    void persist(supabase.from('cards').delete().eq('id', id));
  }
  function moveCard(id: string, status: Status) {
    const c = cards.find((x) => x.id === id);
    if (!c || c.status === status) return;
    setJustMoved(id);
    window.setTimeout(() => setJustMoved(null), 420);
    patchCard(id, { status, done: status === 'done' });
  }
  function toggleDone(id: string) {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const done = !c.done;
    const status: Status = done ? 'done' : c.status === 'done' ? 'todo' : c.status;
    patchCard(id, { done, status });
  }

  /* ---------- Version ops (the versions table is the source of truth) ---------- */
  function setActiveVersion(id: string | null) {
    if (project) { setEditing(null); patchProject(project.id, { active_version_id: id }); }
  }
  function openAddVersion() {
    if (!project) return;
    setVerDraft(devMode ? suggestNextVersion(projVersions.map((z) => z.name)) : '');
    setAddVerOpen(true);
  }
  /* Find an existing version by name (in this project) or create the row. */
  async function ensureVersion(name: string): Promise<Version | null> {
    if (!project) return null;
    const trimmed = name.trim();
    if (!trimmed) return null;
    const existing = projVersions.find((z) => z.name === trimmed);
    if (existing) return existing;
    const position = projVersions.reduce((m, z) => Math.max(m, z.position), -1) + 1;
    setSaving('saving');
    const { data, error } = await supabase.from('versions')
      .insert({ project_id: project.id, name: trimmed, position }).select().single();
    if (error || !data) { setSaving('error'); showToast('Could not add version', true); return null; }
    setSaving('saved');
    const ver = data as Version;
    setVersions((vs) => [...vs, ver]);
    return ver;
  }
  function confirmAddVersion() {
    if (!project) return;
    const label = verDraft.trim();
    if (!label) return;
    setAddVerOpen(false);
    setEditing(null);
    void ensureVersion(label).then((ver) => { if (ver) setActiveVersion(ver.id); });
  }
  /* Delete a version: its cards are kept (the FK sets their version_id → null). */
  function deleteVersion(id: string) {
    if (!project) return;
    setCards((cs) => cs.map((c) => (c.version_id === id ? { ...c, version_id: null } : c)));
    setVersions((vs) => vs.filter((z) => z.id !== id));
    if (project.active_version_id === id) patchProject(project.id, { active_version_id: null });
    void persist(supabase.from('versions').delete().eq('id', id));
    setColorPop(null);
  }
  /* Rename a version. If the new name already exists, this MERGES: the version's
     cards move onto the target and the old row is deleted. */
  function renameVersion(id: string, raw: string) {
    if (!project) return;
    const ver = versions.find((z) => z.id === id);
    const newV = raw.trim();
    if (!ver || !newV || newV === ver.name) return;
    const target = projVersions.find((z) => z.name === newV && z.id !== id);
    if (target) {
      setCards((cs) => cs.map((c) => (c.version_id === id ? { ...c, version_id: target.id } : c)));
      void persist(supabase.from('cards').update({ version_id: target.id }).eq('version_id', id));
      setVersions((vs) => vs.filter((z) => z.id !== id));
      if (project.active_version_id === id) patchProject(project.id, { active_version_id: target.id });
      void persist(supabase.from('versions').delete().eq('id', id));
    } else {
      setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, name: newV } : z)));
      void persist(supabase.from('versions').update({ name: newV }).eq('id', id));
    }
    setColorPop(null);
  }
  function setVersionColor(id: string, idx: number) {
    setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, color_index: idx } : z)));
    void persist(supabase.from('versions').update({ color_index: idx }).eq('id', id));
    setColorPop(null);
  }
  function toggleCompleted(id: string) {
    if (!project) return;
    const ver = versions.find((z) => z.id === id);
    if (!ver) return;
    const completed = !ver.completed;
    setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, completed } : z)));
    void persist(supabase.from('versions').update({ completed }).eq('id', id));
    if (completed && project.active_version_id === id) patchProject(project.id, { active_version_id: null });
    // Completing a version closes whatever's left in it (its unfinished cards → done).
    if (completed) {
      setCards((cs) => cs.map((c) => (c.version_id === id && !c.done ? { ...c, done: true, status: 'done' } : c)));
      void persist(supabase.from('cards').update({ done: true, status: 'done' }).eq('version_id', id).eq('done', false));
    }
    setColorPop(null);
  }
  /* Card-editor submissions carry a version *name*; resolve it to an id (creating
     the version if the user typed a new one) before writing the card. */
  async function submitCard(vals: CardDraft, target: { kind: 'new'; status: Status } | { kind: 'edit'; id: string }) {
    const ver = await ensureVersion(vals.versionName ?? '');
    const payload: CardDraft = { ...vals, version_id: ver?.id ?? null };
    delete payload.versionName;
    if (target.kind === 'new') await addCard(payload, target.status);
    else patchCard(target.id, payload);
  }

  // Close color popover on outside click / Escape.
  useEffect(() => {
    if (!colorPop) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.color-pop') && !t.closest('.vswatch')) setColorPop(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setColorPop(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [colorPop]);

  /* ---------- Render helpers (plain functions → stable element tree) ---------- */

  const renderTopbar = () => (
    <header className="topbar">
      <a className="brand" href="/projects" title="All projects">
        <Logo height={22} className="brand-logo-full" />
      </a>
      <div className="projects" role="tablist">
        {projects.map((p) => (
          <button key={p.id} className={'tab' + (p.id === activeId ? ' active' : '')}
            draggable
            onDragStart={(e) => { dragProj.current = p.id; e.dataTransfer.effectAllowed = 'move'; }}
            onDragOver={(e) => { e.preventDefault(); onProjDragOver(p.id); }}
            onDrop={(e) => { e.preventDefault(); onProjDrop(); }}
            onDragEnd={onProjDrop}
            onClick={() => { setActiveId(p.id); setEditing(null); }}>
            {p.name || 'Untitled'}
            <span className="count">{cards.filter((c) => c.project_id === p.id && !c.done).length}</span>
          </button>
        ))}
      </div>
      <div className="topbar-actions">
        <div className="view-toggle">
          <button className={'view-opt' + (view === 'board' ? ' active' : '')} onClick={() => setView('board')}>
            <svg viewBox="0 0 24 24"><path d="M10 18V6C10 5.06812 10 4.60218 9.84776 4.23463C9.64477 3.74458 9.25542 3.35523 8.76537 3.15224C8.39782 3 7.93188 3 7 3C6.06812 3 5.60218 3 5.23463 3.15224C4.74458 3.35523 4.35523 3.74458 4.15224 4.23463C4 4.60218 4 5.06812 4 6V18C4 18.9319 4 19.3978 4.15224 19.7654C4.35523 20.2554 4.74458 20.6448 5.23463 20.8478C5.60218 21 6.06812 21 7 21C7.93188 21 8.39782 21 8.76537 20.8478C9.25542 20.6448 9.64477 20.2554 9.84776 19.7654C10 19.3978 10 18.9319 10 18Z" /><path d="M20 14V6C20 5.06812 20 4.60218 19.8478 4.23463C19.6448 3.74458 19.2554 3.35523 18.7654 3.15224C18.3978 3 17.9319 3 17 3C16.0681 3 15.6022 3 15.2346 3.15224C14.7446 3.35523 14.3552 3.74458 14.1522 4.23463C14 4.60218 14 5.06812 14 6V14C14 14.9319 14 15.3978 14.1522 15.7654C14.3552 16.2554 14.7446 16.6448 15.2346 16.8478C15.6022 17 16.0681 17 17 17C17.9319 17 18.3978 17 18.7654 16.8478C19.2554 16.6448 19.6448 16.2554 19.8478 15.7654C20 15.3978 20 14.9319 20 14Z" /></svg> Board
          </button>
          <button className={'view-opt' + (view === 'timeline' ? ' active' : '')} onClick={() => setView('timeline')}>
            <svg viewBox="0 0 24 24"><path d="M14 14C14.9319 14 15.3978 14 15.7654 14.1522C16.2554 14.3552 16.6448 14.7446 16.8478 15.2346C17 15.6022 17 16.0681 17 17C17 17.9319 17 18.3978 16.8478 18.7654C16.6448 19.2554 16.2554 19.6448 15.7654 19.8478C15.3978 20 14.9319 20 14 20L6 20C5.06812 20 4.60218 20 4.23463 19.8478C3.74458 19.6448 3.35523 19.2554 3.15224 18.7654C3 18.3978 3 17.9319 3 17C3 16.0681 3 15.6022 3.15224 15.2346C3.35523 14.7446 3.74458 14.3552 4.23463 14.1522C4.60218 14 5.06812 14 6 14L14 14Z" /><path d="M18 4C18.9319 4 19.3978 4 19.7654 4.15224C20.2554 4.35523 20.6448 4.74458 20.8478 5.23463C21 5.60218 21 6.06812 21 7C21 7.93188 21 8.39783 20.8478 8.76537C20.6448 9.25542 20.2554 9.64477 19.7654 9.84776C19.3978 10 18.9319 10 18 10H6C5.06812 10 4.60218 10 4.23463 9.84776C3.74458 9.64477 3.35523 9.25542 3.15224 8.76537C3 8.39783 3 7.93188 3 7C3 6.06812 3 5.60218 3.15224 5.23464C3.35523 4.74458 3.74458 4.35523 4.23463 4.15224C4.60218 4 5.06812 4 6 4L18 4Z" /></svg> Timeline
          </button>
        </div>
        {renderRepoButton()}
        <NotifBell align="right" projectName={project?.name} remind={!!project?.remind}
          onToggleRemind={project ? (next) => patchProject(project.id, { remind: next }) : undefined} />
        <AccountMenu userEmail={userEmail} userName={userName} />
      </div>
    </header>
  );

  // Compact mobile header: brand + project switcher + overflow menu, then a
  // Board/Timeline toggle row. Desktop keeps renderTopbar() untouched.
  const renderMobileTopbar = () => (
    <header className="m-topbar">
      <div className="m-topbar-row">
        <a className="brand" href="/projects" title="All projects">
          <Logo height={20} className="brand-logo-full" />
        </a>
        <NotifBell btnClass="icon-btn" projectName={project?.name} remind={!!project?.remind}
          onToggleRemind={project ? (next) => patchProject(project.id, { remind: next }) : undefined} />
        <span className={'save-state ' + (saving === 'saving' ? 'saving' : saving === 'error' ? 'error' : '')}>
          {saving === 'saving' ? 'saving…' : saving === 'error' ? '!' : ''}
        </span>
        <div className="meta-spacer" />
        <button className="m-proj" onClick={() => setSheet({ kind: 'project' })}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M4 6l4 4 4-4" /></svg>
          <span className="m-proj-name">{project?.name || 'Untitled'}</span>
        </button>
        <button className="icon-btn m-menu" title="Menu" onClick={() => setSheet({ kind: 'menu' })}>
          <svg viewBox="0 0 24 24"><path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" /><path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" /><path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" /></svg>
        </button>
      </div>
      <div className="m-topbar-row2">
        <div className="view-toggle">
          <button className={'view-opt' + (view === 'board' ? ' active' : '')} onClick={() => setView('board')}>
            <svg viewBox="0 0 24 24"><path d="M10 18V6C10 5.06812 10 4.60218 9.84776 4.23463C9.64477 3.74458 9.25542 3.35523 8.76537 3.15224C8.39782 3 7.93188 3 7 3C6.06812 3 5.60218 3 5.23463 3.15224C4.74458 3.35523 4.35523 3.74458 4.15224 4.23463C4 4.60218 4 5.06812 4 6V18C4 18.9319 4 19.3978 4.15224 19.7654C4.35523 20.2554 4.74458 20.6448 5.23463 20.8478C5.60218 21 6.06812 21 7 21C7.93188 21 8.39782 21 8.76537 20.8478C9.25542 20.6448 9.64477 20.2554 9.84776 19.7654C10 19.3978 10 18.9319 10 18Z" /><path d="M20 14V6C20 5.06812 20 4.60218 19.8478 4.23463C19.6448 3.74458 19.2554 3.35523 18.7654 3.15224C18.3978 3 17.9319 3 17 3C16.0681 3 15.6022 3 15.2346 3.15224C14.7446 3.35523 14.3552 3.74458 14.1522 4.23463C14 4.60218 14 5.06812 14 6V14C14 14.9319 14 15.3978 14.1522 15.7654C14.3552 16.2554 14.7446 16.6448 15.2346 16.8478C15.6022 17 16.0681 17 17 17C17.9319 17 18.3978 17 18.7654 16.8478C19.2554 16.6448 19.6448 16.2554 19.8478 15.7654C20 15.3978 20 14.9319 20 14Z" /></svg> Board
          </button>
          <button className={'view-opt' + (view === 'timeline' ? ' active' : '')} onClick={() => setView('timeline')}>
            <svg viewBox="0 0 24 24"><path d="M14 14C14.9319 14 15.3978 14 15.7654 14.1522C16.2554 14.3552 16.6448 14.7446 16.8478 15.2346C17 15.6022 17 16.0681 17 17C17 17.9319 17 18.3978 16.8478 18.7654C16.6448 19.2554 16.2554 19.6448 15.7654 19.8478C15.3978 20 14.9319 20 14 20L6 20C5.06812 20 4.60218 20 4.23463 19.8478C3.74458 19.6448 3.35523 19.2554 3.15224 18.7654C3 18.3978 3 17.9319 3 17C3 16.0681 3 15.6022 3.15224 15.2346C3.35523 14.7446 3.74458 14.3552 4.23463 14.1522C4.60218 14 5.06812 14 6 14L14 14Z" /><path d="M18 4C18.9319 4 19.3978 4 19.7654 4.15224C20.2554 4.35523 20.6448 4.74458 20.8478 5.23463C21 5.60218 21 6.06812 21 7C21 7.93188 21 8.39783 20.8478 8.76537C20.6448 9.25542 20.2554 9.64477 19.7654 9.84776C19.3978 10 18.9319 10 18 10H6C5.06812 10 4.60218 10 4.23463 9.84776C3.74458 9.64477 3.35523 9.25542 3.15224 8.76537C3 8.39783 3 7.93188 3 7C3 6.06812 3 5.60218 3.15224 5.23464C3.35523 4.74458 3.74458 4.35523 4.23463 4.15224C4.60218 4 5.06812 4 6 4L18 4Z" /></svg> Timeline
          </button>
        </div>
        {renderRepoButton()}
      </div>
    </header>
  );

  // Git-repo control that lives in the header next to the Board/Timeline toggle.
  const renderRepoButton = () => project && devMode && (
    <button className={'btn ghost repo-btn' + (project.repo_url ? ' set' : '')} onClick={openRepoEdit}
      title={project.repo_url ? 'Git repository' : 'Set git repository'}>
      {project.repo_url ? (
        <>
          <svg viewBox="0 0 24 24" className="ic"><path d="M6 3V15M6 15C4.34315 15 3 16.3431 3 18C3 19.6569 4.34315 21 6 21C7.65685 21 9 19.6569 9 18M6 15C7.65685 15 9 16.3431 9 18M18 9C19.6569 9 21 7.65685 21 6C21 4.34315 19.6569 3 18 3C16.3431 3 15 4.34315 15 6C15 7.65685 16.3431 9 18 9ZM18 9C18 11.3869 17.0518 13.6761 15.364 15.364C13.6761 17.0518 11.3869 18 9 18" /></svg>
          <span className="repo-btn-label">{repoLabel(project.repo_url)}</span>
        </>
      ) : (
        <><svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> Repo</>
      )}
    </button>
  );

  const renderVersionChip = (ver: Version) => {
    if (!project) return null;
    const count = projCards.filter((c) => c.version_id === ver.id && !c.done).length;
    const ci = versionColor(ver) ?? 0;
    const active = project.active_version_id;
    return (
      <button key={ver.id} className={'vchip vchip-ver card-theme-' + ci + (ver.id === active ? ' active' : '') + (ver.completed ? ' completed' : '')}
        onClick={() => setActiveVersion(ver.id)}>
        {ver.completed && <span className="vcheck"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></span>}
        <span className="vlabel">{ver.name}</span>
        <span className="vcount">{count}</span>
        <span className="vopts" title="Color & options"
          onClick={(e) => {
            e.stopPropagation();
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
            setColorPop({ id: ver.id, x: Math.max(12, r.right + window.scrollX - 176), y: r.bottom + 8 + window.scrollY });
          }}>
          <svg viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" /></svg>
        </span>
      </button>
    );
  };

  const renderCard = (card: Card, index: number) => {
    if (!project) return null;
    const ver = card.version_id ? versionById.get(card.version_id) : null;
    const ci = versionColor(ver);
    const dcls = dateClass(card);
    const cls = 'card' + (ci != null ? ' card-theme-' + ci : '') +
      (card.type === 'bug' ? ' is-bug' : '') + (card.done ? ' done' : '') + (card.id === justMoved ? ' dropped' : '');
    return (
      <article key={card.id} className={cls}
        style={{ animationDelay: card.id === justMoved ? '0ms' : `${Math.min(index * 45, 260)}ms` }}
        draggable
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id); const el = e.currentTarget; window.setTimeout(() => el.classList.add('dragging'), 0); }}
        onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
        onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('button')) return; setEditing(card.id); }}>
        <div className="card-top">
          <button className={'checkbox' + (card.done ? ' checked' : '')} title="Mark done" onClick={() => toggleDone(card.id)}>
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </button>
          <div className="card-title">{card.title || `Untitled ${v.update.toLowerCase()}`}</div>
          <div className={'card-menu' + (isMobile ? ' m-visible' : '')}>
            {isMobile ? (
              <button className="icon-btn" title="Actions" onClick={() => setSheet({ kind: 'card', id: card.id })}>
                <svg viewBox="0 0 24 24"><path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" /><path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" /><path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" /></svg>
              </button>
            ) : (
              <>
                <button className="icon-btn" title="Edit" onClick={() => setEditing(card.id)}>
                  <svg viewBox="0 0 24 24"><path d="M12 20H21M3.00003 20H4.67457C5.16376 20 5.40835 20 5.63852 19.9447C5.84259 19.8957 6.03768 19.8149 6.21663 19.7053C6.41846 19.5816 6.59141 19.4086 6.93732 19.0627L19.5001 6.49998C20.3285 5.67156 20.3285 4.32841 19.5001 3.49998C18.6716 2.67156 17.3285 2.67156 16.5001 3.49998L3.93729 16.0627C3.59139 16.4086 3.41843 16.5816 3.29475 16.7834C3.18509 16.9624 3.10428 17.1574 3.05529 17.3615C3.00003 17.5917 3.00003 17.8363 3.00003 18.3255V20Z" /></svg>
                </button>
                <button className="icon-btn del" title="Delete" onClick={() => deleteCard(card.id)}>
                  <svg viewBox="0 0 24 24"><path d="M9 3H15M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 18.1409 18.8867 17.8 19.485C17.4999 20.0118 17.0472 20.4353 16.5017 20.6997C15.882 21 15.0911 21 13.5093 21H10.4907C8.90891 21 8.11803 21 7.49834 20.6997C6.95276 20.4353 6.50009 20.0118 6.19998 19.485C5.85911 18.8867 5.8065 18.0975 5.70129 16.5193L5 6" /></svg>
                </button>
              </>
            )}
          </div>
        </div>
        {card.comment && <div className="card-comment">{card.comment}</div>}
        <div className="card-meta">
          {card.type === 'bug' && <TypeTag />}
          {ver && <span className="chip version">{ver.name}</span>}
          <span className={'date ' + dcls}>
            <svg viewBox="0 0 24 24"><path d="M21 10H3M16 2V6M8 2V6M7.8 22H16.2C17.8802 22 18.7202 22 19.362 21.673C19.9265 21.3854 20.3854 20.9265 20.673 20.362C21 19.7202 21 18.8802 21 17.2V8.8C21 7.11984 21 6.27976 20.673 5.63803C20.3854 5.07354 19.9265 4.6146 19.362 4.32698C18.7202 4 17.8802 4 16.2 4H7.8C6.11984 4 5.27976 4 4.63803 4.32698C4.07354 4.6146 3.6146 5.07354 3.32698 5.63803C3 6.27976 3 7.11984 3 8.8V17.2C3 18.8802 3 19.7202 3.32698 20.362C3.6146 20.9265 4.07354 21.3854 4.63803 21.673C5.27976 22 6.11984 22 7.8 22Z" /></svg>
            {formatDateRange(card.target_date, card.end_date)}
            {dcls === 'overdue' && <span className="pill-overdue">overdue</span>}
          </span>
          {card.branch && <BranchChip repoUrl={project.repo_url} branch={card.branch} />}
        </div>
      </article>
    );
  };

  if (!project) {
    return (
      <div className="app">
        {isMobile ? renderMobileTopbar() : renderTopbar()}
        <div className="banner" style={{ marginTop: 20 }}>No projects yet. Use “+ Project” to create one.</div>
      </div>
    );
  }

  const active = project.active_version_id;
  const activeVer = active ? versionById.get(active) ?? null : null;
  const openV = projVersions.filter((z) => !z.completed);
  const doneV = projVersions.filter((z) => z.completed);
  const bugCount = projCards.filter((c) => c.type === 'bug' && !c.done).length;
  const inScope = (c: Card) => (!active || c.version_id === active) && (typeFilter === 'all' || c.type === typeFilter);
  const scopedCards = projCards.filter(inScope);

  // Timeline (desktop) and Agenda (mobile) share the same prop contract.
  const TimelineView = isMobile ? Agenda : Timeline;
  const timelineProps = {
    project, projCards, versions: projVersions, cards: scopedCards,
    editing, newCardDate,
    onAdd: (date: string) => { setNewCardType('update'); setNewCardDate(date); setEditing('__new__:todo'); },
    onEdit: (id: string) => setEditing(id),
    onToggle: toggleDone,
    onMenu: (id: string) => setSheet({ kind: 'card', id }),
    onReschedule: (id: string, date: string) => {
      const c = cards.find((x) => x.id === id);
      const nd = date || null;
      if (!c || c.target_date === nd) return;
      // Keep a multi-day card's duration: shift end_date by the same offset.
      let end = c.end_date;
      if (nd && c.target_date && c.end_date) {
        const span = (Date.parse(c.end_date) - Date.parse(c.target_date)) / 86400000;
        const e = new Date(nd); e.setDate(e.getDate() + span);
        end = e.toISOString().slice(0, 10);
      } else if (!nd) {
        end = null; // moved to "No date" → drop the range too
      }
      patchCard(id, { target_date: nd, end_date: end });
    },
    onSubmit: (vals: CardDraft) => {
      if (editing && editing.startsWith('__new__')) void submitCard(vals, { kind: 'new', status: 'todo' });
      else if (editing) void submitCard(vals, { kind: 'edit', id: editing });
      setEditing(null);
    },
    onCancel: () => setEditing(null)
  };

  // On mobile the board editor is a bottom-sheet Modal (not inline in a snapping column).
  const mobileEditColumn = isMobile && view === 'board' && editing?.startsWith('__new__:')
    ? (editing.split(':')[1] as Status) : null;
  const mobileEditCard = isMobile && view === 'board' && editing && !editing.startsWith('__new__')
    ? projCards.find((c) => c.id === editing) : null;

  return (
    <BoardDevModeContext.Provider value={devMode}>
    <div className="app">
      {isMobile ? renderMobileTopbar() : renderTopbar()}

      <div className="project-meta">
        <input className="project-name" value={project.name} spellCheck={false}
          onChange={(e) => setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, name: e.target.value } : p)))}
          onBlur={(e) => patchProject(project.id, { name: e.target.value.trim() || 'Untitled' })}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <div className="meta-spacer" />
        <span className={'save-state ' + (saving === 'saving' ? 'saving' : saving === 'error' ? 'error' : '')}>
          {saving === 'saving' ? 'saving…' : saving === 'error' ? 'save failed' : 'saved'}
        </span>
      </div>

      <div className="version-bar">
        <button className={'vchip' + (active === null ? ' active' : '')} onClick={() => setActiveVersion(null)}>
          <span className="vlabel">{`All ${v.versions.toLowerCase()}`}</span>
          <span className="vcount">{projCards.filter((c) => !c.done).length}</span>
        </button>

        {openV.map(renderVersionChip)}

        {doneV.length > 0 && (showCompleted ? (
          <>
            {doneV.map(renderVersionChip)}
            <button className="vchip reveal" onClick={() => setShowCompleted(false)}>Hide completed</button>
          </>
        ) : (
          <>
            {activeVer && activeVer.completed && renderVersionChip(activeVer)}
            <button className="vchip reveal" onClick={() => setShowCompleted(true)}>
              <svg viewBox="0 0 16 16" className="ic"><path d="M3.5 8.5l3 3 6-7" /></svg>
              {doneV.length} completed
            </button>
          </>
        ))}

        <button className="vchip add" onClick={openAddVersion}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> {v.version}
        </button>

        <div className="type-filter">
          {([['all', 'All'], ['update', v.updates], ['bug', bugCount ? `${v.bugs} · ${bugCount}` : v.bugs]] as const).map(([val, label]) => (
            <button key={val} className={'tf-opt' + (val === 'bug' ? ' bug' : '') + (typeFilter === val ? ' active' : '')}
              onClick={() => { setTypeFilter(val); setEditing(null); }}>{label}</button>
          ))}
        </div>
      </div>

      {view === 'timeline' ? (
        <TimelineView {...timelineProps} />
      ) : (
        <>
          {isMobile && (
            <div className="board-pager">
              {COLUMNS.map((col, i) => (
                <button key={col.key} className={'pager-opt' + (activeCol === i ? ' active' : '')}
                  data-status={col.key} onClick={() => goCol(i)}>
                  <span className={'dot ' + col.key} />{col.label}
                  <span className="pager-count">{scopedCards.filter((c) => c.status === col.key).length}</span>
                </button>
              ))}
            </div>
          )}
          <main className="board" ref={boardRef} onScroll={isMobile ? onBoardScroll : undefined}>
            {COLUMNS.map((col) => {
              const colCards = sortCards(scopedCards.filter((c) => c.status === col.key));
              const addingBug = typeFilter === 'bug';
              return (
                <section key={col.key} className="column" data-status={col.key}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drop-target'); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('drop-target'); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-target'); const id = e.dataTransfer.getData('text/plain'); if (id) moveCard(id, col.key); }}>
                  {/* .column stretches to the tallest column (drop zone); .column-body holds the
                      visible, content-height colored panel. The gap below stays transparent but droppable. */}
                  <div className="column-body">
                    <div className="column-head">
                      <span className="column-title"><span className={'dot ' + col.key} />{col.label}</span>
                      <span className="column-count">{colCards.length}</span>
                    </div>
                    <div className="cards">
                      {colCards.map((c, i) =>
                        editing === c.id && !isMobile
                          ? <CardEditor key={c.id} versions={projVersions} card={c} status={c.status}
                              onCancel={() => setEditing(null)} onSubmit={(vals) => { void submitCard(vals, { kind: 'edit', id: c.id }); setEditing(null); }} />
                          : renderCard(c, i)
                      )}
                      {!isMobile && editing === `__new__:${col.key}` && (
                        <CardEditor key="__new__" versions={projVersions} status={col.key} defaultType={newCardType} defaultDate={newCardDate} defaultVersion={versionName(active)}
                          onCancel={() => setEditing(null)} onSubmit={(vals) => { void submitCard(vals, { kind: 'new', status: col.key }); setEditing(null); }} />
                      )}
                      {colCards.length === 0 && editing !== `__new__:${col.key}` && <div className="empty-hint">Nothing here yet</div>}
                    </div>
                    <button className={'add-card' + (addingBug ? ' add-bug' : '')}
                      onClick={() => { setNewCardType(addingBug ? 'bug' : 'update'); setNewCardDate(''); setEditing(`__new__:${col.key}`); }}>
                      <svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>
                      {addingBug ? `Add ${v.bugNoun}` : `Add ${v.updateNoun}`}
                    </button>
                  </div>
                </section>
              );
            })}
          </main>
        </>
      )}

      {isMobile && view === 'board' && (mobileEditColumn || mobileEditCard) && (
        <Modal title={mobileEditCard ? `Edit ${v.update.toLowerCase()}` : `New ${v.update.toLowerCase()}`} onClose={() => setEditing(null)}>
          <CardEditor bare versions={projVersions}
            card={mobileEditCard ?? undefined}
            status={mobileEditCard ? mobileEditCard.status : (mobileEditColumn as Status)}
            defaultType={newCardType} defaultDate={mobileEditCard ? undefined : newCardDate} defaultVersion={versionName(active)}
            onCancel={() => setEditing(null)}
            onSubmit={(vals) => {
              if (mobileEditCard) void submitCard(vals, { kind: 'edit', id: mobileEditCard.id });
              else void submitCard(vals, { kind: 'new', status: mobileEditColumn as Status });
              setEditing(null);
            }} />
        </Modal>
      )}

      {repoEdit && (
        <Modal title="Git repository" className="modal-wide modal-center" onClose={() => setRepoEdit(false)}>
          <div className="modal-form">
            <label className="modal-form-label">Repository URL</label>
            <input className="modal-form-input" autoFocus spellCheck={false} inputMode="url"
              placeholder="https://github.com/org/repo" value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveRepo(); if (e.key === 'Escape') setRepoEdit(false); }} />
            <p className="modal-form-hint">Turns each card&apos;s branch into a clickable link (GitHub, GitLab, Bitbucket).</p>
            <div className="edit-actions">
              {project.repo_url && (
                <a className="btn ghost repo-open" target="_blank" rel="noopener noreferrer"
                  href={/^https?:\/\//i.test(project.repo_url) ? project.repo_url : 'https://' + project.repo_url}>Open ↗</a>
              )}
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setRepoEdit(false)}>Cancel</button>
              <button className="btn solid" onClick={saveRepo}>Save</button>
            </div>
          </div>
        </Modal>
      )}

      {addVerOpen && (
        <Modal title={`New ${v.version.toLowerCase()}`} className="modal-center" onClose={() => setAddVerOpen(false)}>
          <div className="modal-form">
            <label className="modal-form-label">{`${v.version} label`}</label>
            <input className="modal-form-input" autoFocus spellCheck={false} placeholder={`e.g. ${v.versionExample}`}
              value={verDraft} onChange={(e) => setVerDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') confirmAddVersion(); if (e.key === 'Escape') setAddVerOpen(false); }} />
            <p className="modal-form-hint">{`Groups ${v.updates.toLowerCase()} under a ${v.version.toLowerCase()}. You can rename or recolor it later.`}</p>
            <div className="edit-actions">
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setAddVerOpen(false)}>Cancel</button>
              <button className="btn solid" onClick={confirmAddVersion}>Add</button>
            </div>
          </div>
        </Modal>
      )}

      {mergeConfirm && (
        <Modal title={`${v.merge} ${v.versions.toLowerCase()}`} className="modal-center" onClose={() => setMergeConfirm(null)}>
          <div className="modal-form">
            <p className="modal-form-hint">
              Move every card from <strong>“{mergeConfirm.fromName}”</strong> into <strong>“{mergeConfirm.toName}”</strong>,
              then delete <strong>“{mergeConfirm.fromName}”</strong>. This can&apos;t be undone.
            </p>
            <div className="edit-actions">
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setMergeConfirm(null)}>Cancel</button>
              <button className="btn solid" onClick={() => { renameVersion(mergeConfirm.fromId, mergeConfirm.toName); setMergeConfirm(null); }}>{v.merge}</button>
            </div>
          </div>
        </Modal>
      )}

      {delVerConfirm && (
        <Modal title={`Delete ${v.version.toLowerCase()}`} className="modal-center" onClose={() => setDelVerConfirm(null)}>
          <div className="modal-form">
            <p className="modal-form-hint">
              Delete <strong>“{delVerConfirm.name}”</strong>? Its cards are kept but lose this {v.version.toLowerCase()} label. This can&apos;t be undone.
            </p>
            <div className="edit-actions">
              <div className="meta-spacer" />
              <button className="btn ghost" onClick={() => setDelVerConfirm(null)}>Cancel</button>
              <button className="btn danger-solid" onClick={() => { deleteVersion(delVerConfirm.id); setDelVerConfirm(null); }}>Delete</button>
            </div>
          </div>
        </Modal>
      )}

      {sheet?.kind === 'project' && (
        <Sheet title="Project" onClose={() => setSheet(null)}>
          <div className="sheet-rename">
            <label>Rename</label>
            <input className="auth-input" value={project.name} spellCheck={false}
              onChange={(e) => setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, name: e.target.value } : p)))}
              onBlur={(e) => patchProject(project.id, { name: e.target.value.trim() || 'Untitled' })} />
          </div>
          <div className="sheet-section-label">Switch project</div>
          <div className="sheet-list">
            {projects.map((p) => (
              <button key={p.id} className={'sheet-item' + (p.id === activeId ? ' active' : '')}
                onClick={() => { setActiveId(p.id); setEditing(null); setSheet(null); }}>
                {p.name || 'Untitled'}
                <span className="count">{cards.filter((c) => c.project_id === p.id && !c.done).length}</span>
              </button>
            ))}
          </div>
          <a className="sheet-item link" href="/projects">All projects →</a>
        </Sheet>
      )}

      {sheet?.kind === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <a className="sheet-item link" href="/projects">All projects</a>
          <a className="sheet-item link" href="/settings">Settings</a>
          <form action="/auth/signout" method="post">
            <button className="sheet-item danger" type="submit">Sign out</button>
          </form>
        </Sheet>
      )}

      {sheet?.kind === 'card' && (() => {
        const c = cards.find((x) => x.id === sheet.id);
        if (!c) return null;
        return (
          <Sheet title={c.title || 'Untitled'} onClose={() => setSheet(null)}>
            <div className="sheet-section-label">Move to</div>
            <div className="sheet-moves">
              {COLUMNS.map((col) => (
                <button key={col.key} className={'sheet-move' + (c.status === col.key ? ' current' : '')}
                  data-status={col.key} disabled={c.status === col.key}
                  onClick={() => { moveCard(c.id, col.key); setSheet(null); }}>
                  <span className={'dot ' + col.key} />{col.label}
                  {c.status === col.key && <span className="sheet-check">✓</span>}
                </button>
              ))}
            </div>
            <button className="sheet-item" onClick={() => { setEditing(c.id); setSheet(null); }}>Edit</button>
            <button className="sheet-item danger" onClick={() => { deleteCard(c.id); setSheet(null); }}>Delete</button>
          </Sheet>
        );
      })()}

      {colorPop && (() => {
        const cver = versionById.get(colorPop.id);
        if (!cver) return null;
        const others = projVersions.filter((z) => z.id !== colorPop.id).map((z) => z.name);
        return isMobile ? (
          <Sheet title={cver.name} onClose={() => setColorPop(null)}>
            <div className="sheet-rename">
              <label>{`Rename ${v.version.toLowerCase()}`}</label>
              <input className="auth-input" defaultValue={cver.name} spellCheck={false}
                onBlur={(e) => renameVersion(colorPop.id, e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
            </div>
            <div className="sheet-section-label">Color</div>
            <div className="color-row">
              {PALETTE.map((cc, i) => (
                <button key={i} className={'color-opt' + (versionColor(cver) === i ? ' sel' : '')}
                  style={{ background: cc.dot }} title={cc.name} onClick={() => setVersionColor(colorPop.id, i)} />
              ))}
            </div>
            <button className={'sheet-item' + (cver.completed ? '' : ' done')}
              onClick={() => toggleCompleted(colorPop.id)}>
              {cver.completed ? `Reopen ${v.version.toLowerCase()}` : 'Mark completed'}
            </button>
            {others.length > 0 && (
              <>
                <div className="sheet-section-label">{`${v.merge} into`}</div>
                <MergeSelect versions={others} verb={v.merge}
                  onPick={(vv) => { setMergeConfirm({ fromId: colorPop.id, fromName: cver.name, toName: vv }); setColorPop(null); }} />
              </>
            )}
            <button className="sheet-item danger" onClick={() => { setDelVerConfirm({ id: colorPop.id, name: cver.name }); setColorPop(null); }}>{`Delete ${v.version.toLowerCase()}`}</button>
          </Sheet>
        ) : (
          <ColorPopover x={colorPop.x} y={colorPop.y} label={cver.name} word={v.version} mergeVerb={v.merge}
            current={versionColor(cver)} completed={cver.completed}
            others={others}
            onPick={(i) => setVersionColor(colorPop.id, i)} onToggleComplete={() => toggleCompleted(colorPop.id)}
            onRename={(nv) => renameVersion(colorPop.id, nv)}
            onMerge={(t) => { setMergeConfirm({ fromId: colorPop.id, fromName: cver.name, toName: t }); setColorPop(null); }}
            onDelete={() => { setDelVerConfirm({ id: colorPop.id, name: cver.name }); setColorPop(null); }} />
        );
      })()}

      {toast && <div className={'toast show' + (toast.err ? ' error' : '')}>{toast.msg}</div>}
      <WhatsNew />
    </div>
    </BoardDevModeContext.Provider>
  );
}

/* A custom select: looks like a dropdown but the options are real, styleable
   elements (native <option> can't be styled on iOS/macOS). */
function MergeSelect({ versions, verb, onPick }: { versions: string[]; verb: string; onPick: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className={'merge-select' + (open ? ' open' : '')}>
      <button className="merge-trigger" onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 16 16"><path d="M5 3v4a4 4 0 0 0 4 4h4M9.5 8.5l3.5 2.5-3.5 2.5" /></svg>
        <span>{`${verb} into…`}</span>
        <svg className="merge-chevron" viewBox="0 0 16 16"><path d="M4 6l4 4 4-4" /></svg>
      </button>
      {open && (
        <div className="merge-menu">
          {versions.map((v) => (
            <button key={v} className="merge-opt" onClick={() => onPick(v)}>{v}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ColorPopover({
  x, y, label, word, mergeVerb, current, completed, others, onPick, onToggleComplete, onRename, onMerge, onDelete
}: {
  x: number; y: number; label: string; word: string; mergeVerb: string; current: number | null; completed: boolean; others: string[];
  onPick: (i: number) => void; onToggleComplete: () => void;
  onRename: (v: string) => void; onMerge: (target: string) => void; onDelete: () => void;
}) {
  return (
    <div className="color-pop" style={{ top: y, left: x }}>
      <input className="pop-rename" defaultValue={label} spellCheck={false} aria-label={`${word} name`}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onRename((e.target as HTMLInputElement).value); } }}
        onBlur={(e) => onRename(e.target.value)} />
      <div className="color-row">
        {PALETTE.map((c, i) => (
          <button key={i} className={'color-opt' + (current === i ? ' sel' : '')}
            style={{ background: c.dot }} title={c.name} onClick={() => onPick(i)} />
        ))}
      </div>
      <div className="pop-div" />
      <button className={'pop-action' + (completed ? '' : ' done')} onClick={onToggleComplete}>
        {completed
          ? <><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5l-4.5 4.5 4.5 4.5" /></svg> {`Reopen ${word.toLowerCase()}`}</>
          : <><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg> Mark completed</>}
      </button>
      {others.length > 0 && <MergeSelect versions={others} verb={mergeVerb} onPick={onMerge} />}
      <button className="pop-action danger" onClick={onDelete}>
        <svg viewBox="0 0 24 24"><path d="M9 3H15M3 6H21M19 6L18.2987 16.5193C18.1935 18.0975 18.1409 18.8867 17.8 19.485C17.4999 20.0118 17.0472 20.4353 16.5017 20.6997C15.882 21 15.0911 21 13.5093 21H10.4907C8.90891 21 8.11803 21 7.49834 20.6997C6.95276 20.4353 6.50009 20.0118 6.19998 19.485C5.85911 18.8867 5.8065 18.0975 5.70129 16.5193L5 6" /></svg> {`Delete ${word.toLowerCase()}`}
      </button>
    </div>
  );
}
