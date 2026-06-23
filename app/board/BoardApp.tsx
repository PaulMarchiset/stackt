'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { COLUMNS, PALETTE, type Card, type CardType, type Project, type Status } from '@/lib/types';
import {
  dateClass, formatDate, isVersionCompleted, projectVersions, sortByDate,
  suggestNextVersion, versionColorIndex
} from '@/lib/util';
import CardEditor from './CardEditor';
import Logo from '../Logo';
import Timeline from './Timeline';

type EditTarget = string | null; // card id, or `__new__:status`, or null

export default function BoardApp({
  initialProjects, initialCards, userEmail, initialActiveId
}: {
  initialProjects: Project[]; initialCards: Card[]; userEmail: string; initialActiveId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

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
  /* ---------- Card ops ---------- */
  async function addCard(values: Partial<Card>, status: Status) {
    if (!project) return;
    const row = {
      project_id: project.id, title: values.title ?? '', version: values.version ?? '',
      target_date: values.target_date ?? null, status, done: status === 'done',
      type: values.type ?? 'update'
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
        <a className="btn ghost" href="/projects" title="All projects">
          <svg viewBox="0 0 16 16" className="ic"><path d="M2.5 2.5h4v4h-4zM9.5 2.5h4v4h-4zM2.5 9.5h4v4h-4zM9.5 9.5h4v4h-4z" /></svg> Projects
        </a>
        <form action="/auth/signout" method="post">
          <button className="btn signout" type="submit">Sign out</button>
        </form>
      </div>
    </header>
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
          <div className="card-menu">
            <button className="icon-btn" title="Edit" onClick={() => setEditing(card.id)}>
              <svg viewBox="0 0 16 16"><path d="M11.5 2.5l2 2L6 12l-2.5.5L4 10z" /></svg>
            </button>
            <button className="icon-btn del" title="Delete" onClick={() => deleteCard(card.id)}>
              <svg viewBox="0 0 16 16"><path d="M3.5 4.5h9M6.5 4V3h3v1M5 4.5l.5 8h5l.5-8" /></svg>
            </button>
          </div>
        </div>
        <div className="card-meta">
          {card.type === 'bug' && (
            <span className="chip bug"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="11" rx="4" /><path d="M9.5 8a2.5 2.5 0 0 1 5 0M12 11.5v6M8 11.5H5M8 15.5H5.5M16 11.5h3M16 15.5h2.5" /></svg>Bug</span>
          )}
          {card.version && <span className="chip version">{card.version}</span>}
          <span className={'date ' + dcls}>
            <svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
            {formatDate(card.target_date)}
            {dcls === 'overdue' && <span className="pill-overdue">overdue</span>}
          </span>
        </div>
      </article>
    );
  };

  if (!project) {
    return (
      <div className="app">
        {renderTopbar()}
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

  return (
    <div className="app">
      {renderTopbar()}

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
        <Timeline
          project={project} projCards={projCards} cards={scopedCards}
          editing={editing} newCardDate={newCardDate}
          onAdd={(date) => { setNewCardType('update'); setNewCardDate(date); setEditing('__new__:todo'); }}
          onEdit={(id) => setEditing(id)}
          onToggle={toggleDone}
          onSubmit={(vals) => {
            if (editing && editing.startsWith('__new__')) void addCard(vals, 'todo');
            else if (editing) patchCard(editing, vals);
            setEditing(null);
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <main className="board">
          {COLUMNS.map((col) => {
            const colCards = sortByDate(scopedCards.filter((c) => c.status === col.key));
            const addingBug = typeFilter === 'bug';
            return (
              <section key={col.key} className="column" data-status={col.key}
                onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drop-target'); }}
                onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('drop-target'); }}
                onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-target'); const id = e.dataTransfer.getData('text/plain'); if (id) moveCard(id, col.key); }}>
                <div className="column-head">
                  <span className="column-title"><span className={'dot ' + col.key} />{col.label}</span>
                  <span className="column-count">{colCards.length}</span>
                </div>
                <div className="cards">
                  {colCards.map((c, i) =>
                    editing === c.id
                      ? <CardEditor key={c.id} project={project} projCards={projCards} card={c} status={c.status}
                          onCancel={() => setEditing(null)} onSubmit={(vals) => { patchCard(c.id, vals); setEditing(null); }} />
                      : renderCard(c, i)
                  )}
                  {editing === `__new__:${col.key}` && (
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
              </section>
            );
          })}
        </main>
      )}

      {colorPop && (
        <ColorPopover x={colorPop.x} y={colorPop.y}
          current={versionColorIndex(project, colorPop.v)} completed={isVersionCompleted(project, colorPop.v)}
          onPick={(i) => setVersionColor(colorPop.v, i)} onToggleComplete={() => toggleCompleted(colorPop.v)} />
      )}

      {toast && <div className={'toast show' + (toast.err ? ' error' : '')}>{toast.msg}</div>}
    </div>
  );
}

function ColorPopover({
  x, y, current, completed, onPick, onToggleComplete
}: {
  x: number; y: number; current: number | null; completed: boolean;
  onPick: (i: number) => void; onToggleComplete: () => void;
}) {
  return (
    <div className="color-pop" style={{ top: y, left: x }}>
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
    </div>
  );
}
