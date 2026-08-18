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
  onSelectProject, onDragStart, onDragOverTab, onDropTab, onView, onOpenRepo, onComposer
}: {
  islands: ProjectIsland[]; activeId: string | null; project: Project | null;
  view: BoardView; devMode: boolean; userEmail: string; userName: string;
  openCount: (projectId: string) => number;
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
}) {
  return (
    <header className="topbar">
      <a className="brand" href="/projects" title="All projects">
        <Logo height={22} className="brand-logo-full" />
      </a>
      {/* One run of tabs per island. A labelled island wears its group name; the
          divider is what makes two runs read as two places rather than one list. */}
      <div className="projects" role="tablist">
        {islands.map((isle, i) => (
          <div key={isle.key} className={'proj-isle card-theme-' + (isle.colorIndex ?? versionTheme(isle.label ?? ''))}>
            {i > 0 && <span className="isle-sep" aria-hidden />}
            {isle.label && <span className="isle-label">{isle.label}</span>}
            {isle.projects.map((p) => (
              <button key={p.id} className={'tab' + (p.id === activeId ? ' active' : '')}
                draggable
                onDragStart={(e) => { onDragStart(p.id); e.dataTransfer.effectAllowed = 'move'; }}
                onDragOver={(e) => { e.preventDefault(); onDragOverTab(p.id); }}
                onDrop={(e) => { e.preventDefault(); onDropTab(); }}
                onDragEnd={onDropTab}
                onClick={() => onSelectProject(p.id)}>
                {p.name || 'Untitled'}
                <span className="count">{openCount(p.id)}</span>
              </button>
            ))}
          </div>
        ))}
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
