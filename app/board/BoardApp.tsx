'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { COLUMNS, DEFAULT_USER_PREFS, type Card, type CardDraft, type CardType, type EditTarget, type HeaderItem, type Project, type ProjectGroup, type Status, type TimelineViewProps, type Version } from '@/lib/types';
import { sortCards, sortCompletedVersions, sortVersions, suggestNextVersion, todayISO } from '@/lib/util';
import { headerIslands, projectSections } from '@/lib/grouping';
import { useBoardStore } from '@/lib/useBoardStore';
import { useHeaderItems } from '@/lib/useHeaderItems';
import { useFoldedGroups } from '@/lib/useFoldedGroups';
import { useIsMobile } from '@/lib/useIsMobile';
import { useDevMode } from '@/lib/useDevMode';
import { vocab } from '@/lib/labels';
import { BoardDevModeContext } from '@/lib/devModeContext';
import Sheet from '@/app/components/Sheet';
import Toast from '@/app/components/Toast';
import WhatsNew from '@/app/components/WhatsNew';
import NotifBell from '@/app/components/NotifBell';
import HeaderComposer from '@/app/components/HeaderComposer';
import { ConfirmDialog, PromptDialog } from '@/app/components/Dialog';
import { IconPlus, IconRepo } from '@/app/components/icons';
import CardEditor from './CardEditor';
import ImportDialog from './ImportDialog';
import Modal from './Modal';
import Timeline from './Timeline';
import Agenda from './Agenda';
import BoardCard from './BoardCard';
import VersionBar, { type TypeFilter, type VersionPopAnchor } from './VersionBar';
import { VersionPopover, VersionSheet, pendingVersionName } from './VersionMenu';
import { MobileTopbar, Topbar, type BoardView } from './BoardHeader';

type MobileSheet = { kind: 'project' } | { kind: 'menu' } | { kind: 'card'; id: string } | null;

/**
 * The board screen. This file owns *view* state only — what's open, what's
 * filtered, what's being edited. Anything that reads or writes data goes
 * through useBoardStore; anything with markup of its own lives in a sibling
 * component (BoardHeader · VersionBar · VersionMenu · BoardCard · CardEditor ·
 * Timeline/Agenda).
 */
export default function BoardApp({
  initialProjects, initialCards, initialVersions,
  groups = [], headerItems = DEFAULT_USER_PREFS.header_items,
  userId, userEmail, userName = '', initialActiveId
}: {
  initialProjects: Project[]; initialCards: Card[]; initialVersions: Version[];
  groups?: ProjectGroup[]; headerItems?: HeaderItem[];
  userId: string; userEmail: string; userName?: string; initialActiveId?: string | null;
}) {
  const store = useBoardStore(initialProjects, initialCards, initialVersions);
  const { projects, cards, versions, saving, toast } = store;
  /* What heads the board is an account setting the board can edit in place —
     same hook, same composer as the settings page. */
  const selection = useHeaderItems(userId, headerItems, store.showToast);
  /* Which group runs are folded shut — per device, not per account: it is about
     how much room this screen has. */
  const [foldedGroups, foldGroup] = useFoldedGroups();
  const isMobile = useIsMobile();
  const [defaultDevMode] = useDevMode();

  const firstActive = (initialActiveId && initialProjects.some((p) => p.id === initialActiveId))
    ? initialActiveId : initialProjects[0]?.id ?? null;
  const [activeId, setActiveId] = useState<string | null>(firstActive);
  const [view, setView] = useState<BoardView>('board');
  const [editing, setEditing] = useState<EditTarget | null>(null);
  const [newCardType, setNewCardType] = useState<CardType>('update');
  const [newCardDate, setNewCardDate] = useState<string>('');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [showCompleted, setShowCompleted] = useState(false);
  const [justMoved, setJustMoved] = useState<string | null>(null);
  const [verPop, setVerPop] = useState<VersionPopAnchor | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);

  // Mobile-only UI: which bottom sheet is open, and swipe-column pager state.
  const [sheet, setSheet] = useState<MobileSheet>(null);
  /* In-app dialogs (replace native prompt/confirm). Each is one piece of state:
     either it's open or it isn't, and <PromptDialog> owns whatever is typed. */
  const [repoEdit, setRepoEdit] = useState(false);
  const [addVerOpen, setAddVerOpen] = useState(false);
  const [mergeConfirm, setMergeConfirm] = useState<{ fromId: string; fromName: string; toId: string; toName: string } | null>(null);
  const [delVerConfirm, setDelVerConfirm] = useState<{ id: string; name: string } | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const dragProj = useRef<string | null>(null);
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
  const openCount = (projectId: string) => cards.filter((c) => c.project_id === projectId && !c.done).length;
  // Which projects head the board, and how they're segmented — an account
  // setting, resolved by one pure function (lib/grouping.ts).
  const islands = useMemo(
    () => headerIslands(selection.items, projects, groups, activeId),
    [selection.items, projects, groups, activeId]
  );
  /* Which island each tab belongs to. Dragging reorders projects, it does not
     re-group them — so a drag that crosses an island boundary is refused rather
     than accepted and then visually undone by the next render. */
  const islandOf = useMemo(() => {
    const m = new Map<string, string>();
    islands.forEach((i) => i.projects.forEach((p) => m.set(p.id, i.key)));
    return m;
  }, [islands]);

  // Effective developer mode for the open board: the project's own choice if it
  // set one, otherwise the device-wide default.
  const devMode = project?.dev_mode ?? defaultDevMode;
  const v = vocab(devMode);

  /* What `editing` means, asked rather than parsed. */
  const editingCard = (id: string) => editing?.kind === 'edit' && editing.id === id;
  const addingIn = (status: Status) => editing?.kind === 'new' && editing.status === status;

  /* ---------- Actions that mix view state with the store ---------- */
  function selectProject(id: string) { setActiveId(id); setEditing(null); }
  function setActiveVersion(id: string | null) {
    if (project) { setEditing(null); store.patchProject(project.id, { active_version_id: id }); }
  }
  function moveCard(id: string, status: Status) {
    setJustMoved(id);
    window.setTimeout(() => setJustMoved(null), 420);
    store.moveCard(id, status);
  }
  function saveRepo(url: string) {
    if (project) store.patchProject(project.id, { repo_url: url.trim() });
    setRepoEdit(false);
  }
  function confirmAddVersion(label: string) {
    if (!project) return;
    setAddVerOpen(false);
    setEditing(null);
    void store.ensureVersion(project.id, label.trim()).then((ver) => { if (ver) setActiveVersion(ver.id); });
  }
  const createVersion = (name: string) => (project ? store.ensureVersion(project.id, name) : Promise.resolve(null));

  // Close the version popover on outside click / Escape. Clicking away commits
  // whatever is typed in the rename field; Escape stays a cancel.
  // Desktop only: on touch the same listener fired on the *first* tap inside the
  // sheet (mousedown precedes click), unmounting the sheet before the button you
  // aimed at ever saw the click. The sheet commits through its own onClose.
  useEffect(() => {
    if (!verPop || !project || isMobile) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.color-pop')) {
        store.renameVersion(project, verPop.id, pendingVersionName());
        setVerPop(null);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVerPop(null); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [verPop, project, isMobile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Same dismissal as every other popover: click away, or press Escape.
  useEffect(() => {
    if (!composerOpen) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (!t.closest('.hdr-pop, .hdr-pick-btn')) setComposerOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setComposerOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [composerOpen]);

  const header = isMobile ? (
    <MobileTopbar project={project} view={view} saving={saving}
      onOpenProjects={() => setSheet({ kind: 'project' })}
      onOpenMenu={() => setSheet({ kind: 'menu' })}
      onView={setView} />
  ) : (
    <Topbar islands={islands} activeId={activeId} project={project} view={view} devMode={devMode}
      userEmail={userEmail} userName={userName} openCount={openCount}
      composerOpen={composerOpen} onComposer={() => setComposerOpen((o) => !o)}
      foldedGroups={foldedGroups} onFoldGroup={foldGroup}
      composer={<HeaderComposer items={selection.items} projects={projects} groups={groups}
        onChange={selection.update} />}
      onSelectProject={selectProject}
      onDragStart={(id) => { dragProj.current = id; }}
      onDragOverTab={(overId) => {
        const from = dragProj.current;
        if (from && islandOf.get(from) === islandOf.get(overId)) store.moveProjectBefore(from, overId);
      }}
      onDropTab={() => { dragProj.current = null; store.commitProjectOrder(); }}
      onView={setView} onOpenRepo={() => setRepoEdit(true)} />
  );

  if (!project) {
    return (
      <div className="app">
        {header}
        <div className="banner" style={{ marginTop: 20 }}>No projects yet. Use “+ Project” to create one.</div>
      </div>
    );
  }

  const active = project.active_version_id;
  const openV = projVersions.filter((z) => !z.completed);
  const doneV = sortCompletedVersions(projVersions.filter((z) => z.completed));
  const inScope = (c: Card) => (!active || c.version_id === active) && (typeFilter === 'all' || c.type === typeFilter);
  const scopedCards = projCards.filter(inScope);

  // Timeline (desktop) and Agenda (mobile) share the same prop contract.
  const TimelineView = isMobile ? Agenda : Timeline;
  const timelineProps: TimelineViewProps = {
    project, projCards, versions: projVersions, cards: scopedCards,
    editing, newCardDate,
    onAdd: (date: string) => { setNewCardType('update'); setNewCardDate(date); setEditing({ kind: 'new', status: 'todo' }); },
    onEdit: (id: string) => setEditing({ kind: 'edit', id }),
    onToggle: store.toggleDone,
    onMenu: (id: string) => setSheet({ kind: 'card', id }),
    onReschedule: store.rescheduleCard,
    onCreateVersion: createVersion,
    // The edit target is exactly what the store needs to know — hand it over.
    onSubmit: (vals: CardDraft) => {
      if (editing) void store.submitCard(project.id, vals, editing);
      setEditing(null);
    },
    onCancel: () => setEditing(null)
  };

  // On mobile the board editor is a bottom-sheet Modal (not inline in a snapping column).
  const mobileEdit = isMobile && view === 'board' ? editing : null;
  const mobileEditColumn = mobileEdit?.kind === 'new' ? mobileEdit.status : null;
  const mobileEditCard = mobileEdit?.kind === 'edit'
    ? projCards.find((c) => c.id === mobileEdit.id) : null;

  const popVersion = verPop ? versionById.get(verPop.id) ?? null : null;
  const menuActions = popVersion && {
    onPickColor: (i: number) => { store.setVersionColor(popVersion.id, i); setVerPop(null); },
    onToggleComplete: () => { store.toggleVersionCompleted(project, popVersion.id); setVerPop(null); },
    onRename: (name: string) => { store.renameVersion(project, popVersion.id, name); setVerPop(null); },
    // Setting a ship date leaves the menu open — you often set it while also
    // recolouring or renaming, and closing on every pick would fight that.
    onShipDate: (date: string | null) => store.setVersionShipDate(popVersion.id, date),
    /* The menu offers names (they're what the user picked from); the merge itself
       works on ids, so resolve it here rather than making the store match names. */
    onMerge: (toName: string) => {
      const to = projVersions.find((z) => z.name === toName);
      if (to) setMergeConfirm({ fromId: popVersion.id, fromName: popVersion.name, toId: to.id, toName: to.name });
      setVerPop(null);
    },
    onDelete: () => { setDelVerConfirm({ id: popVersion.id, name: popVersion.name }); setVerPop(null); },
    onClose: () => { store.renameVersion(project, popVersion.id, pendingVersionName()); setVerPop(null); }
  };

  return (
    <BoardDevModeContext.Provider value={devMode}>
    <div className="app">
      {header}

      {/* The project's own row. The reminder bell lives here rather than in the
          top bar: it is a setting of *this* project, not a permanent account
          control, and next to "saved" it sits with the other per-board state. */}
      <div className="project-meta">
        <input className="project-name" value={project.name} spellCheck={false}
          onChange={(e) => store.setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, name: e.target.value } : p)))}
          onBlur={(e) => store.patchProject(project.id, { name: e.target.value.trim() || 'Untitled' })}
          onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }} />
        <div className="meta-spacer" />
        <div className="meta-side">
          <span className={'save-state ' + (saving === 'saving' ? 'saving' : saving === 'error' ? 'error' : '')}>
            {saving === 'saving' ? 'saving…' : saving === 'error' ? 'save failed' : 'saved'}
          </span>
          {!isMobile && (
            <div className="meta-actions">
              <button className="btn ghost meta-import" onClick={() => setImportOpen(true)} title="Import a bullet list">
                <IconPlus className="ic" /> Import
              </button>
              <NotifBell align="right" btnClass="btn ghost icon-only meta-bell"
                projectName={project.name} remind={project.remind}
                onToggleRemind={(next) => store.patchProject(project.id, { remind: next })} />
            </div>
          )}
        </div>
      </div>

      <VersionBar project={project} projCards={projCards}
        openVersions={openV} completedVersions={doneV}
        showCompleted={showCompleted} typeFilter={typeFilter}
        onSelect={setActiveVersion}
        onOptions={setVerPop}
        onAdd={() => setAddVerOpen(true)}
        onShowCompleted={setShowCompleted}
        onTypeFilter={(next) => { setTypeFilter(next); setEditing(null); }} />

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
              const colCards = sortCards(scopedCards.filter((c) => c.status === col.key), col.key === 'done');
              const addingBug = typeFilter === 'bug';
              return (
                <section key={col.key} className="column" data-status={col.key}
                  onDragOver={(e) => { e.preventDefault(); e.currentTarget.classList.add('drop-target'); }}
                  onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) e.currentTarget.classList.remove('drop-target'); }}
                  onDrop={(e) => { e.preventDefault(); e.currentTarget.classList.remove('drop-target'); const id = e.dataTransfer.getData('text/plain'); if (id) moveCard(id, col.key); }}>
                  {/* .column stretches to the tallest column (drop zone); .column-body holds the
                      visible colored panel. The gap below stays transparent but droppable. */}
                  <div className="column-body">
                    <div className="column-head">
                      <span className="column-title"><span className={'dot ' + col.key} />{col.label}</span>
                      <span className="column-count">{colCards.length}</span>
                    </div>
                    <div className="cards">
                      {colCards.map((c, i) =>
                        editingCard(c.id) && !isMobile
                          ? <CardEditor key={c.id} versions={projVersions} card={c} status={c.status}
                              onCreateVersion={createVersion}
                              onCancel={() => setEditing(null)}
                              onSubmit={(vals) => { void store.submitCard(project.id, vals, { kind: 'edit', id: c.id }); setEditing(null); }} />
                          : <BoardCard key={c.id} card={c} index={i} project={project}
                              version={c.version_id ? versionById.get(c.version_id) ?? null : null}
                              justMoved={c.id === justMoved} isMobile={isMobile}
                              onToggleDone={() => store.toggleDone(c.id)}
                              onEdit={() => setEditing({ kind: 'edit', id: c.id })}
                              onDelete={() => store.deleteCard(c.id)}
                              onMenu={() => setSheet({ kind: 'card', id: c.id })}
                              onReschedule={(start, end) => store.patchCard(c.id, { target_date: start, end_date: end })} />
                      )}
                      {!isMobile && addingIn(col.key) && (
                        <CardEditor key="__new__" versions={projVersions} status={col.key} defaultType={newCardType}
                          defaultDate={newCardDate} defaultVersion={versionName(active)}
                          onCreateVersion={createVersion}
                          onCancel={() => setEditing(null)}
                          onSubmit={(vals) => { void store.submitCard(project.id, vals, { kind: 'new', status: col.key }); setEditing(null); }} />
                      )}
                      {colCards.length === 0 && !addingIn(col.key) && <div className="empty-hint">Nothing here yet</div>}
                    </div>
                    <button className={'add-card' + (addingBug ? ' add-bug' : '')}
                      onClick={() => { setNewCardType(addingBug ? 'bug' : 'update'); setNewCardDate(''); setEditing({ kind: 'new', status: col.key }); }}>
                      <IconPlus />
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
            onCreateVersion={createVersion}
            onCancel={() => setEditing(null)}
            onSubmit={(vals) => {
              if (mobileEditCard) void store.submitCard(project.id, vals, { kind: 'edit', id: mobileEditCard.id });
              else void store.submitCard(project.id, vals, { kind: 'new', status: mobileEditColumn as Status });
              setEditing(null);
            }} />
        </Modal>
      )}

      {repoEdit && (
        <PromptDialog title="Git repository" className="modal-wide modal-center"
          label="Repository URL" placeholder="https://github.com/org/repo" inputMode="url"
          defaultValue={project.repo_url || ''} submitLabel="Save"
          hint="Turns each card's branch into a clickable link (GitHub, GitLab, Bitbucket)."
          actionsLeft={project.repo_url && (
            <a className="btn ghost repo-open" target="_blank" rel="noopener noreferrer"
              href={/^https?:\/\//i.test(project.repo_url) ? project.repo_url : 'https://' + project.repo_url}>Open ↗</a>
          )}
          onSubmit={saveRepo} onCancel={() => setRepoEdit(false)} />
      )}

      {addVerOpen && (
        <PromptDialog title={`New ${v.version.toLowerCase()}`}
          label={`${v.version} label`} placeholder={`e.g. ${v.versionExample}`}
          defaultValue={devMode ? suggestNextVersion(projVersions.map((z) => z.name)) : ''}
          submitLabel="Add" required
          hint={`Groups ${v.updates.toLowerCase()} under a ${v.version.toLowerCase()}. You can rename or recolor it later.`}
          onSubmit={confirmAddVersion} onCancel={() => setAddVerOpen(false)} />
      )}

      {mergeConfirm && (
        <ConfirmDialog title={`${v.merge} ${v.versions.toLowerCase()}`} confirmLabel={v.merge}
          onConfirm={() => { store.mergeVersion(project, mergeConfirm.fromId, mergeConfirm.toId); setMergeConfirm(null); }}
          onCancel={() => setMergeConfirm(null)}>
          Move every card from <strong>“{mergeConfirm.fromName}”</strong> into <strong>“{mergeConfirm.toName}”</strong>,
          then delete <strong>“{mergeConfirm.fromName}”</strong>. This can&apos;t be undone.
        </ConfirmDialog>
      )}

      {delVerConfirm && (
        <ConfirmDialog title={`Delete ${v.version.toLowerCase()}`} confirmLabel="Delete" danger
          onConfirm={() => { store.deleteVersion(project, delVerConfirm.id); setDelVerConfirm(null); }}
          onCancel={() => setDelVerConfirm(null)}>
          Delete <strong>“{delVerConfirm.name}”</strong>? Its cards are kept but lose this {v.version.toLowerCase()} label. This can&apos;t be undone.
        </ConfirmDialog>
      )}

      {sheet?.kind === 'project' && (
        <Sheet title="Project" onClose={() => setSheet(null)}>
          <div className="sheet-rename">
            <label>Rename</label>
            <input className="auth-input" value={project.name} spellCheck={false}
              onChange={(e) => store.setProjects((ps) => ps.map((p) => (p.id === project.id ? { ...p, name: e.target.value } : p)))}
              onBlur={(e) => store.patchProject(project.id, { name: e.target.value.trim() || 'Untitled' })} />
          </div>
          <div className="sheet-section-label">Switch project</div>
          {/* Grouped like the projects page: every project once, in the band it
              lives in. With no groups this is one unlabelled run — exactly the
              flat list it has always been. */}
          <div className="sheet-list">
            {projectSections(projects, groups)
              .filter((s) => s.projects.length > 0)
              .map((s) => (
                <div key={s.key} className={'sheet-band' + (s.colorIndex !== null ? ' card-theme-' + s.colorIndex : '')}>
                  {s.kind === 'group' && <div className="sheet-band-label">{s.label}</div>}
                  {s.projects.map((p) => (
                    <button key={p.id} className={'sheet-item' + (p.id === activeId ? ' active' : '')}
                      onClick={() => { selectProject(p.id); setSheet(null); }}>
                      {p.name || 'Untitled'}
                      <span className="count">{openCount(p.id)}</span>
                    </button>
                  ))}
                </div>
              ))}
          </div>
          <a className="sheet-item link" href="/projects">All projects →</a>
        </Sheet>
      )}

      {/* The mobile overflow menu. Everything the one-row header gave up lands
          here: the repo link, the daily-reminder switch, then navigation. */}
      {sheet?.kind === 'menu' && (
        <Sheet title="Menu" onClose={() => setSheet(null)}>
          <div className="sheet-toggle">
            <span className="sheet-toggle-label">Daily reminder<em>Include “{project.name || 'Untitled'}” in your morning email</em></span>
            <button className={'switch' + (project.remind ? ' on' : '')} role="switch" aria-checked={project.remind}
              aria-label="Include this project in the daily email"
              onClick={() => store.patchProject(project.id, { remind: !project.remind })}><span /></button>
          </div>
          {devMode && (
            <button className="sheet-item" onClick={() => { setSheet(null); setRepoEdit(true); }}>
              <span className="sheet-item-main"><IconRepo /> Git repository</span>
              <span className="sheet-item-note">{project.repo_url ? 'Linked' : 'Not set'}</span>
            </button>
          )}
          <button className="sheet-item" onClick={() => { setSheet(null); setImportOpen(true); }}>
            <span className="sheet-item-main"><IconPlus /> Import a list</span>
          </button>
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
            <button className="sheet-item" onClick={() => { setEditing({ kind: 'edit', id: c.id }); setSheet(null); }}>Edit</button>
            <button className="sheet-item danger" onClick={() => { store.deleteCard(c.id); setSheet(null); }}>Delete</button>
          </Sheet>
        );
      })()}

      {verPop && popVersion && menuActions && (() => {
        const others = projVersions.filter((z) => z.id !== popVersion.id).map((z) => z.name);
        return isMobile
          ? <VersionSheet version={popVersion} others={others} {...menuActions} />
          : <VersionPopover version={popVersion} x={verPop.x} y={verPop.y} others={others} {...menuActions} />;
      })()}

      {importOpen && (
        <ImportDialog versions={projVersions} onClose={() => setImportOpen(false)}
          onImport={(blocks) => store.importBlocks(project.id, blocks)} />
      )}

      {/* Touch: one permanent target instead of an Add button buried at the foot
          of whichever column you happened to scroll to. It adds to the column
          you are looking at, so it means the same thing everywhere. */}
      {isMobile && (
        <button className="fab" aria-label={`Add ${v.updateNoun}`}
          onClick={() => {
            if (view === 'timeline') { timelineProps.onAdd(todayISO()); return; }
            setNewCardType(typeFilter === 'bug' ? 'bug' : 'update');
            setNewCardDate('');
            setEditing({ kind: 'new', status: COLUMNS[activeCol]?.key ?? 'todo' });
          }}>
          <IconPlus />
        </button>
      )}

      <Toast toast={toast} />
      <WhatsNew />
    </div>
    </BoardDevModeContext.Provider>
  );
}
