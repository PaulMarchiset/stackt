'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COLUMNS, PALETTE, type Card, type CardType, type Project, type Status } from '@/lib/types';
import {
  branchUrl, dateClass, formatDateRange, isVersionCompleted, projectVersions, repoLabel, sortByDate,
  suggestNextVersion, todayISO, versionColorIndex
} from '@/lib/util';
import { useIsMobile } from '@/lib/useIsMobile';
import Sheet from '@/app/components/Sheet';
import BranchChip from '@/app/components/BranchChip';
import CardEditor from './CardEditor';
import Modal from './Modal';
import Logo from '../Logo';
import Timeline from './Timeline';
import Agenda from './Agenda';

type EditTarget = string | null; // card id, or `__new__:status`, or null
type MobileSheet = { kind: 'project' } | { kind: 'menu' } | { kind: 'card'; id: string } | null;

export default function BoardApp({
  initialProjects, initialCards, userEmail, initialActiveId
}: {
  initialProjects: Project[]; initialCards: Card[]; userEmail: string; initialActiveId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const isMobile = useIsMobile();

  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [cards, setCards] = useState<Card[]>(initialCards);
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
  const [colorPop, setColorPop] = useState<{ v: string; x: number; y: number } | null>(null);
  const [saving, setSaving] = useState<'saved' | 'saving' | 'error'>('saved');
  const [toast, setToast] = useState<{ msg: string; err?: boolean } | null>(null);
  const toastTimer = useRef<number>(0);

  // Mobile-only UI: which bottom sheet is open, and swipe-column pager state.
  const [sheet, setSheet] = useState<MobileSheet>(null);
  // In-app git-repo editor (replaces the native prompt).
  const [repoEdit, setRepoEdit] = useState(false);
  const [repoDraft, setRepoDraft] = useState('');
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
  /* ---------- Card ops ---------- */
  async function addCard(values: Partial<Card>, status: Status) {
    if (!project) return;
    const row = {
      project_id: project.id, title: values.title ?? '', version: values.version ?? '',
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

  /* ---------- Version ops ---------- */
  function setActiveVersion(v: string) { if (project) { setEditing(null); patchProject(project.id, { active_version: v }); } }
  function addVersion() {
    if (!project) return;
    const guess = suggestNextVersion(projectVersions(project, projCards));
    const label = (prompt('New version label', guess) || '').trim();
    if (!label) return;
    const versions = project.versions.includes(label) ? project.versions : [...project.versions, label];
    patchProject(project.id, { versions, active_version: label });
    setEditing(null);
  }
  function removeVersion(v: string) {
    if (!project) return;
    const colors = { ...project.version_colors };
    delete colors[v];
    patchProject(project.id, {
      versions: project.versions.filter((z) => z !== v),
      completed_versions: project.completed_versions.filter((z) => z !== v),
      version_colors: colors,
      active_version: project.active_version === v ? '' : project.active_version
    });
  }
  /* Rename a version everywhere: project metadata + every card carrying the old label. */
  function renameVersion(oldV: string, raw: string) {
    if (!project) return;
    const newV = raw.trim();
    if (!newV || newV === oldV) return;
    const uniq = (arr: string[]) => Array.from(new Set(arr));
    const colors = { ...project.version_colors };
    if (Object.prototype.hasOwnProperty.call(colors, oldV)) { colors[newV] = colors[oldV]; delete colors[oldV]; }
    patchProject(project.id, {
      versions: uniq(project.versions.map((z) => (z === oldV ? newV : z))),
      completed_versions: uniq(project.completed_versions.map((z) => (z === oldV ? newV : z))),
      version_colors: colors,
      active_version: project.active_version === oldV ? newV : project.active_version
    });
    setCards((cs) => cs.map((c) => (c.project_id === project.id && c.version === oldV ? { ...c, version: newV } : c)));
    void persist(supabase.from('cards').update({ version: newV }).eq('project_id', project.id).eq('version', oldV));
    setColorPop(null);
  }
  /* Delete a version: drop it from the project and unversion (keep) any cards that used it. */
  function deleteVersion(v: string) {
    if (!project) return;
    removeVersion(v);
    setCards((cs) => cs.map((c) => (c.project_id === project.id && c.version === v ? { ...c, version: '' } : c)));
    void persist(supabase.from('cards').update({ version: '' }).eq('project_id', project.id).eq('version', v));
    setColorPop(null);
  }
  function setVersionColor(v: string, idx: number) {
    if (!project) return;
    patchProject(project.id, { version_colors: { ...project.version_colors, [v]: idx } });
    setColorPop(null);
  }
  function toggleCompleted(v: string) {
    if (!project) return;
    const has = project.completed_versions.includes(v);
    patchProject(project.id, {
      completed_versions: has ? project.completed_versions.filter((z) => z !== v) : [...project.completed_versions, v],
      active_version: !has && project.active_version === v ? '' : project.active_version
    });
    setColorPop(null);
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
            onClick={() => { setActiveId(p.id); setEditing(null); }}>
            {p.name || 'Untitled'}
            <span className="count">{cards.filter((c) => c.project_id === p.id).length}</span>
          </button>
        ))}
      </div>
      <div className="topbar-actions">
        <div className="view-toggle">
          <button className={'view-opt' + (view === 'board' ? ' active' : '')} onClick={() => setView('board')}>
            <svg viewBox="0 0 16 16"><path d="M2.5 2.5h4v11h-4zM9.5 2.5h4v11h-4z" /></svg> Board
          </button>
          <button className={'view-opt' + (view === 'timeline' ? ' active' : '')} onClick={() => setView('timeline')}>
            <svg viewBox="0 0 16 16"><path d="M4 3.5h9M4 8h9M4 12.5h9" /><circle cx="1.5" cy="3.5" r="1.3" /><circle cx="1.5" cy="8" r="1.3" /><circle cx="1.5" cy="12.5" r="1.3" /></svg> Timeline
          </button>
        </div>
        {renderRepoButton()}
        <a className="btn ghost" href="/projects" title="All projects">
          <svg viewBox="0 0 16 16" className="ic"><path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" /></svg> Projects
        </a>
        <form action="/auth/signout" method="post">
          <button className="btn signout" type="submit">Sign out</button>
        </form>
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
        <span className={'save-state ' + (saving === 'saving' ? 'saving' : saving === 'error' ? 'error' : '')}>
          {saving === 'saving' ? 'saving…' : saving === 'error' ? '!' : ''}
        </span>
        <div className="meta-spacer" />
        <button className="m-proj" onClick={() => setSheet({ kind: 'project' })}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M4 6l4 4 4-4" /></svg>
          <span className="m-proj-name">{project?.name || 'Untitled'}</span>
        </button>
        <button className="icon-btn m-menu" title="Menu" onClick={() => setSheet({ kind: 'menu' })}>
          <svg viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
        </button>
      </div>
      <div className="m-topbar-row2">
        <div className="view-toggle">
          <button className={'view-opt' + (view === 'board' ? ' active' : '')} onClick={() => setView('board')}>
            <svg viewBox="0 0 16 16"><path d="M2.5 2.5h4v11h-4zM9.5 2.5h4v11h-4z" /></svg> Board
          </button>
          <button className={'view-opt' + (view === 'timeline' ? ' active' : '')} onClick={() => setView('timeline')}>
            <svg viewBox="0 0 16 16"><path d="M4 3.5h9M4 8h9M4 12.5h9" /><circle cx="1.5" cy="3.5" r="1.3" /><circle cx="1.5" cy="8" r="1.3" /><circle cx="1.5" cy="12.5" r="1.3" /></svg> Timeline
          </button>
        </div>
        {renderRepoButton()}
      </div>
    </header>
  );

  // Git-repo control that lives in the header next to the Board/Timeline toggle.
  const renderRepoButton = () => project && (
    <button className={'btn ghost repo-btn' + (project.repo_url ? ' set' : '')} onClick={openRepoEdit}
      title={project.repo_url ? 'Git repository' : 'Set git repository'}>
      {project.repo_url ? (
        <>
          <svg viewBox="0 0 16 16" className="ic"><circle cx="4" cy="3.5" r="1.5" /><circle cx="4" cy="12.5" r="1.5" /><circle cx="12" cy="4" r="1.5" /><path d="M4 5v6M12 5.5V7a3 3 0 0 1-3 3H4" /></svg>
          <span className="repo-btn-label">{repoLabel(project.repo_url)}</span>
        </>
      ) : (
        <><svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> Repo</>
      )}
    </button>
  );

  const renderVersionChip = (v: string) => {
    if (!project) return null;
    const count = projCards.filter((c) => c.version === v).length;
    const completed = isVersionCompleted(project, v);
    const ci = versionColorIndex(project, v) ?? 0;
    const active = project.active_version || '';
    return (
      <button key={v} className={'vchip' + (v === active ? ' active' : '') + (completed ? ' completed' : '')}
        onClick={() => setActiveVersion(v)}>
        {completed && <span className="vcheck"><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg></span>}
        <span className="vswatch" style={{ background: PALETTE[ci].dot }} title="Color & options"
          onClick={(e) => { e.stopPropagation(); const r = (e.target as HTMLElement).getBoundingClientRect(); setColorPop({ v, x: r.left + window.scrollX, y: r.bottom + 8 + window.scrollY }); }} />
        <span className="vlabel">{v}</span>
        <span className="vcount">{count}</span>
        {count === 0 && <span className="vremove" title="Remove version" onClick={(e) => { e.stopPropagation(); removeVersion(v); }}>×</span>}
      </button>
    );
  };

  const renderCard = (card: Card, index: number) => {
    if (!project) return null;
    const ci = versionColorIndex(project, card.version);
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
          <div className="card-title">{card.title || 'Untitled update'}</div>
          <div className={'card-menu' + (isMobile ? ' m-visible' : '')}>
            {isMobile ? (
              <button className="icon-btn" title="Actions" onClick={() => setSheet({ kind: 'card', id: card.id })}>
                <svg viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
              </button>
            ) : (
              <>
                <button className="icon-btn" title="Edit" onClick={() => setEditing(card.id)}>
                  <svg viewBox="0 0 16 16"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" /></svg>
                </button>
                <button className="icon-btn del" title="Delete" onClick={() => deleteCard(card.id)}>
                  <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" /></svg>
                </button>
              </>
            )}
          </div>
        </div>
        <div className="card-meta">
          {card.type === 'bug' && (
            <span className="chip bug"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="11" rx="4" /><path d="M9.5 8a2.5 2.5 0 0 1 5 0M12 11.5v6M8 11.5H5M8 15.5H5.5M16 11.5h3M16 15.5h2.5" /></svg>Bug</span>
          )}
          {card.version && <span className="chip version">{card.version}</span>}
          <span className={'date ' + dcls}>
            <svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
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

  const versions = projectVersions(project, projCards);
  const active = project.active_version || '';
  const openV = versions.filter((v) => !isVersionCompleted(project, v));
  const doneV = versions.filter((v) => isVersionCompleted(project, v));
  const bugCount = projCards.filter((c) => c.type === 'bug').length;
  const inScope = (c: Card) => (!active || c.version === active) && (typeFilter === 'all' || c.type === typeFilter);
  const scopedCards = projCards.filter(inScope);

  // Timeline (desktop) and Agenda (mobile) share the same prop contract.
  const TimelineView = isMobile ? Agenda : Timeline;
  const timelineProps = {
    project, projCards, cards: scopedCards,
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
    onSubmit: (vals: Partial<Card>) => {
      if (editing && editing.startsWith('__new__')) void addCard(vals, 'todo');
      else if (editing) patchCard(editing, vals);
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
        <button className={'vchip' + (active === '' ? ' active' : '')} onClick={() => setActiveVersion('')}>
          <span className="vlabel">All versions</span>
          <span className="vcount">{projCards.length}</span>
        </button>

        {openV.map(renderVersionChip)}

        {doneV.length > 0 && (showCompleted ? (
          <>
            {doneV.map(renderVersionChip)}
            <button className="vchip reveal" onClick={() => setShowCompleted(false)}>Hide completed</button>
          </>
        ) : (
          <>
            {active && doneV.includes(active) && renderVersionChip(active)}
            <button className="vchip reveal" onClick={() => setShowCompleted(true)}>
              <svg viewBox="0 0 16 16" className="ic"><path d="M3.5 8.5l3 3 6-7" /></svg>
              {doneV.length} completed
            </button>
          </>
        ))}

        <button className="vchip add" onClick={addVersion}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> Version
        </button>

        <div className="type-filter">
          {([['all', 'All'], ['update', 'Updates'], ['bug', bugCount ? `Bugs · ${bugCount}` : 'Bugs']] as const).map(([val, label]) => (
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
              const colCards = sortByDate(scopedCards.filter((c) => c.status === col.key));
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
                          ? <CardEditor key={c.id} project={project} projCards={projCards} card={c} status={c.status}
                              onCancel={() => setEditing(null)} onSubmit={(vals) => { patchCard(c.id, vals); setEditing(null); }} />
                          : renderCard(c, i)
                      )}
                      {!isMobile && editing === `__new__:${col.key}` && (
                        <CardEditor key="__new__" project={project} projCards={projCards} status={col.key} defaultType={newCardType} defaultDate={newCardDate}
                          onCancel={() => setEditing(null)} onSubmit={(vals) => { void addCard(vals, col.key); setEditing(null); }} />
                      )}
                      {colCards.length === 0 && editing !== `__new__:${col.key}` && <div className="empty-hint">Nothing here yet</div>}
                    </div>
                    <button className={'add-card' + (addingBug ? ' add-bug' : '')}
                      onClick={() => { setNewCardType(addingBug ? 'bug' : 'update'); setNewCardDate(''); setEditing(`__new__:${col.key}`); }}>
                      <svg viewBox="0 0 16 16"><path d="M8 3.5v9M3.5 8h9" /></svg>
                      {addingBug ? 'Add bug' : 'Add update'}
                    </button>
                  </div>
                </section>
              );
            })}
          </main>
        </>
      )}

      {isMobile && view === 'board' && (mobileEditColumn || mobileEditCard) && (
        <Modal title={mobileEditCard ? 'Edit update' : 'New update'} onClose={() => setEditing(null)}>
          <CardEditor bare project={project} projCards={projCards}
            card={mobileEditCard ?? undefined}
            status={mobileEditCard ? mobileEditCard.status : (mobileEditColumn as Status)}
            defaultType={newCardType} defaultDate={mobileEditCard ? undefined : newCardDate}
            onCancel={() => setEditing(null)}
            onSubmit={(vals) => {
              if (mobileEditCard) patchCard(mobileEditCard.id, vals);
              else void addCard(vals, mobileEditColumn as Status);
              setEditing(null);
            }} />
        </Modal>
      )}

      {repoEdit && (
        <Modal title="Git repository" className="modal-wide modal-center" onClose={() => setRepoEdit(false)}>
          <div className="repo-form">
            <label className="repo-form-label">Repository URL</label>
            <input className="repo-form-input" autoFocus spellCheck={false} inputMode="url"
              placeholder="https://github.com/org/repo" value={repoDraft}
              onChange={(e) => setRepoDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveRepo(); if (e.key === 'Escape') setRepoEdit(false); }} />
            <p className="repo-form-hint">Turns each card&apos;s branch into a clickable link (GitHub, GitLab, Bitbucket).</p>
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
                <span className="count">{cards.filter((c) => c.project_id === p.id).length}</span>
              </button>
            ))}
          </div>
          <a className="sheet-item link" href="/projects">All projects →</a>
        </Sheet>
      )}

      {sheet?.kind === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <a className="sheet-item link" href="/projects">All projects</a>
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

      {colorPop && (isMobile ? (
        <Sheet title={colorPop.v} onClose={() => setColorPop(null)}>
          <div className="sheet-rename">
            <label>Rename version</label>
            <input className="auth-input" defaultValue={colorPop.v} spellCheck={false}
              onBlur={(e) => renameVersion(colorPop.v, e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
          </div>
          <div className="sheet-section-label">Color</div>
          <div className="color-row">
            {PALETTE.map((cc, i) => (
              <button key={i} className={'color-opt' + (versionColorIndex(project, colorPop.v) === i ? ' sel' : '')}
                style={{ background: cc.dot }} title={cc.name} onClick={() => setVersionColor(colorPop.v, i)} />
            ))}
          </div>
          <button className={'sheet-item' + (isVersionCompleted(project, colorPop.v) ? '' : ' done')}
            onClick={() => toggleCompleted(colorPop.v)}>
            {isVersionCompleted(project, colorPop.v) ? 'Reopen version' : 'Mark completed'}
          </button>
          <button className="sheet-item danger" onClick={() => deleteVersion(colorPop.v)}>Delete version</button>
        </Sheet>
      ) : (
        <ColorPopover x={colorPop.x} y={colorPop.y} label={colorPop.v}
          current={versionColorIndex(project, colorPop.v)} completed={isVersionCompleted(project, colorPop.v)}
          onPick={(i) => setVersionColor(colorPop.v, i)} onToggleComplete={() => toggleCompleted(colorPop.v)}
          onRename={(v) => renameVersion(colorPop.v, v)} onDelete={() => deleteVersion(colorPop.v)} />
      ))}

      {toast && <div className={'toast show' + (toast.err ? ' error' : '')}>{toast.msg}</div>}
    </div>
  );
}

function ColorPopover({
  x, y, label, current, completed, onPick, onToggleComplete, onRename, onDelete
}: {
  x: number; y: number; label: string; current: number | null; completed: boolean;
  onPick: (i: number) => void; onToggleComplete: () => void;
  onRename: (v: string) => void; onDelete: () => void;
}) {
  return (
    <div className="color-pop" style={{ top: y, left: x }}>
      <input className="pop-rename" defaultValue={label} spellCheck={false} aria-label="Version name"
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
          ? <><svg viewBox="0 0 16 16"><path d="M3.5 8h9M8 3.5l-4.5 4.5 4.5 4.5" /></svg> Reopen version</>
          : <><svg viewBox="0 0 16 16"><path d="M3.5 8.5l3 3 6-7" /></svg> Mark completed</>}
      </button>
      <button className="pop-action danger" onClick={onDelete}>
        <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" /></svg> Delete version
      </button>
    </div>
  );
}
