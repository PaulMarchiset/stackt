'use client';

import type { Project } from '@/lib/types';
import type { ProjectIsland } from '@/lib/grouping';
import { repoLabel, versionTheme } from '@/lib/util';
import AccountMenu from '@/app/components/AccountMenu';
import { IconBoard, IconChevronDown, IconDots, IconPlus, IconRepo, IconSliders, IconTimeline } from '@/app/components/icons';
import Logo from '../Logo';

export type BoardView = 'board' | 'timeline';

/* The Board / Timeline switch. Shared by both headers and by the mobile view
   row; the labels sit in spans so a caller can collapse it to two icons. */
export function ViewToggle({ view, onChange }: { view: BoardView; onChange: (v: BoardView) => void }) {
  return (
    <div className="view-toggle">
      <button className={'view-opt' + (view === 'board' ? ' active' : '')}
        aria-label="Board view" onClick={() => onChange('board')}>
        <IconBoard /><span>Board</span>
      </button>
      <button className={'view-opt' + (view === 'timeline' ? ' active' : '')}
        aria-label="Timeline view" onClick={() => onChange('timeline')}>
        <IconTimeline /><span>Timeline</span>
      </button>
    </div>
  );
}

/* Git-repo control. Desktop only — on touch it lives in the ⋯ menu sheet, so
   the header stays down to the things you actually tap. */
function RepoButton({ project, onOpen }: { project: Project; onOpen: () => void }) {
  return (
    <button className={'btn ghost repo-btn' + (project.repo_url ? ' set' : '')} onClick={onOpen}
      title={project.repo_url ? 'Git repository' : 'Set git repository'}>
      {project.repo_url ? (
        <>
          <IconRepo className="ic" />
          <span className="repo-btn-label">{repoLabel(project.repo_url)}</span>
        </>
      ) : (
        <><IconPlus className="ic" /> Repo</>
      )}
    </button>
  );
}

export function Topbar({
  islands, activeId, project, view, devMode, userEmail, userName, openCount, composer, composerOpen,
  foldedGroups, onSelectProject, onDragStart, onDragOverTab, onDropTab, onView, onOpenRepo, onComposer, onFoldGroup
}: {
  islands: ProjectIsland[]; activeId: string | null; project: Project | null;
  view: BoardView; devMode: boolean; userEmail: string; userName: string;
  openCount: (projectId: string) => number;
  /* Group ids whose run is folded shut. */
  foldedGroups: string[];
  /* The header's own "what goes here" panel. It hangs off the actions row
     rather than off the tabs: the tab strip scrolls sideways, and a popover
     anchored inside it would be clipped by that scroll. */
  composer: React.ReactNode;
  composerOpen: boolean;
  onSelectProject: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragOverTab: (overId: string) => void;
  onDropTab: () => void;
  onView: (v: BoardView) => void;
  onOpenRepo: () => void;
  onComposer: () => void;
  onFoldGroup: (groupId: string) => void;
}) {
  return (
    <header className="topbar">
      <a className="brand" href="/projects" title="All projects">
        <Logo height={22} className="brand-logo-full" />
      </a>
      {/* One run of tabs per island. A labelled island wears its group name; the
          divider is what makes two runs read as two places rather than one list.
          Clicking the name folds the run shut — the header is the narrowest
          thing on screen, and a group you aren't working in today can wait
          behind its own label. */}
      <div className="projects" role="tablist">
        {islands.map((isle, i) => {
          const folded = !!isle.groupId && foldedGroups.includes(isle.groupId);
          /* Folded still shows the open board: the rule that you can always see
             where you are outranks the one that says this run is shut. */
          const tucked = (id: string) => folded && id !== activeId;
          const hidden = isle.projects.filter((p) => tucked(p.id)).length;
          return (
            <div key={isle.key}
              className={'proj-isle card-theme-' + (isle.colorIndex ?? versionTheme(isle.label ?? ''))}>
              {i > 0 && <span className="isle-sep" aria-hidden />}
              {isle.label && (isle.groupId ? (
                <button className="isle-label" aria-expanded={!folded}
                  title={folded ? 'Show this group' : 'Fold this group'}
                  onClick={() => onFoldGroup(isle.groupId as string)}>
                  {isle.label}
                  {hidden > 0 && <span className="isle-more">{hidden}</span>}
                </button>
              ) : <span className="isle-label">{isle.label}</span>)}
              {/* Every tab stays mounted, folded or not — a tab removed from
                  the page cannot animate its way out. The slot is what closes,
                  and it closes onto the tab's own width rather than a guessed
                  one (grid 1fr → 0fr), so the run zips shut at any length.
                  A shut tab is taken out of the tab order and hidden from
                  assistive tech: still there, no longer reachable. */}
              {isle.projects.map((p) => (
                <span key={p.id} className={'tab-slot' + (tucked(p.id) ? ' tucked' : '')}
                  aria-hidden={tucked(p.id)}>
                  <span className="tab-slot-in">
                    <button className={'tab' + (p.id === activeId ? ' active' : '')}
                      draggable tabIndex={tucked(p.id) ? -1 : undefined}
                      onDragStart={(e) => { onDragStart(p.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={(e) => { e.preventDefault(); onDragOverTab(p.id); }}
                      onDrop={(e) => { e.preventDefault(); onDropTab(); }}
                      onDragEnd={onDropTab}
                      onClick={() => onSelectProject(p.id)}>
                      {p.name || 'Untitled'}
                      <span className="count">{openCount(p.id)}</span>
                    </button>
                  </span>
                </span>
              ))}
            </div>
          );
        })}
      </div>
      <div className="topbar-actions">
        <div className="hdr-pick">
          <button className={'icon-btn hdr-pick-btn' + (composerOpen ? ' on' : '')}
            title="Choose what heads the board" aria-label="Choose what heads the board"
            aria-haspopup="dialog" aria-expanded={composerOpen} onClick={onComposer}>
            <IconSliders />
          </button>
          {composerOpen && <div className="hdr-pop" role="dialog" aria-label="Board header">{composer}</div>}
        </div>
        <ViewToggle view={view} onChange={onView} />
        {project && devMode && <RepoButton project={project} onOpen={onOpenRepo} />}
        <AccountMenu userEmail={userEmail} userName={userName} />
      </div>
    </header>
  );
}

/**
 * Mobile header. Two rows, one block: where you are · which project · the ⋯ on
 * top, then Board/Timeline full-width beneath. The switch keeps its own line
 * (the top row needs every pixel for the project name) but belongs to the
 * header, so it sticks with it instead of scrolling away over the canvas.
 * The repo link and reminder switch live in the ⋯ sheet.
 */
export function MobileTopbar({
  project, view, saving, onOpenProjects, onOpenMenu, onView
}: {
  project: Project | null; view: BoardView; saving: 'saved' | 'saving' | 'error';
  onOpenProjects: () => void; onOpenMenu: () => void; onView: (v: BoardView) => void;
}) {
  return (
    <header className="m-topbar">
      <div className="m-topbar-row">
        <a className="brand" href="/projects" title="All projects">
          <Logo height={20} className="brand-logo-full" />
        </a>
        <span className={'save-state ' + (saving === 'saving' ? 'saving' : saving === 'error' ? 'error' : '')}>
          {saving === 'saving' ? '•' : saving === 'error' ? '!' : ''}
        </span>
        <div className="meta-spacer" />
        <button className="m-proj" onClick={onOpenProjects}>
          <IconChevronDown className="ic" />
          <span className="m-proj-name">{project?.name || 'Untitled'}</span>
        </button>
        <button className="icon-btn m-menu" title="Menu" aria-label="Menu" onClick={onOpenMenu}>
          <IconDots />
        </button>
      </div>
      <div className="m-topbar-row2">
        <ViewToggle view={view} onChange={onView} />
      </div>
    </header>
  );
}
