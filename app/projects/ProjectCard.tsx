'use client';

import type { Project, ProjectGroup } from '@/lib/types';
import { groupColor, sortGroups } from '@/lib/grouping';
import { isAfterMidpoint } from '@/lib/useDragSort';
import { versionTheme } from '@/lib/util';
import { IconChevronRight, IconDots, IconPencil, IconPlus, IconStar, IconTick, IconTrash } from '@/app/components/icons';

/* Up to two initials from a project name for its card avatar. */
export function initials(name: string): string {
  const words = (name || '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * One project on the projects page.
 *
 * The card is a thing you *move*, and opening it is a button. It used to be the
 * reverse — the whole card was a link and a hairline grip on its left edge was
 * the only place a drag could start — which meant the page's main organising
 * gesture was hidden in eighteen pixels most people never found. Now the body
 * is the handle: grab it anywhere and it moves. `Open` is a real link, so
 * middle-click and "open in new tab" keep working, and on touch (where `drag`
 * is absent and the card doesn't move at all) it is the whole way in, which is
 * why it spans the card rather than hiding in a corner.
 *
 * The ⋯ menu carries the group picker rather than burying it behind Edit:
 * moving a project is the most frequent thing done on this page, and on touch
 * it is the *only* way to do it.
 */
export default function ProjectCard({
  project, meta, groups, menuOpen,
  onMenu, onEdit, onDelete, onToggleFavorite, onMove, onNewGroup, drag
}: {
  project: Project;
  meta: string;
  groups: ProjectGroup[];
  menuOpen: boolean;
  onMenu: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onMove: (groupId: string | null) => void;
  onNewGroup: () => void;
  /* Desktop only — left off, the card simply isn't draggable. */
  drag?: {
    dragging: boolean;
    dropSide: 'before' | 'after' | null;
    onStart: () => void;
    onOver: (after: boolean) => void;
    onEnd: () => void;
  };
}) {
  const p = project;

  return (
    <div
      className={'proj-card'
        + (drag ? ' grabbable' : '')
        + (drag?.dragging ? ' dragging' : '')
        + (drag?.dropSide ? ' drop-' + drag.dropSide : '')}
      draggable={!!drag}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag?.onStart(); }}
      onDragEnd={() => drag?.onEnd()}
      onDragOver={drag && ((e) => {
        e.preventDefault();
        e.stopPropagation();          // the band would otherwise claim the drop for its end
        drag.onOver(isAfterMidpoint(e, e.currentTarget));
      })}>
      <div className="proj-actions">
        <button className={'proj-fav' + (p.favorite ? ' on' : '')}
          title={p.favorite ? 'Remove from favorites' : 'Add to favorites'}
          aria-pressed={p.favorite} onClick={onToggleFavorite}>
          <IconStar />
        </button>
        <button className="proj-menu-btn" title="More" aria-haspopup="menu" aria-expanded={menuOpen} onClick={onMenu}>
          <IconDots />
        </button>
      </div>

      {menuOpen && (
        <div className="proj-menu" role="menu">
          <button role="menuitem" onClick={onEdit}><IconPencil /> Edit</button>
          <button role="menuitem" className="danger" onClick={onDelete}><IconTrash /> Delete</button>
          <div className="proj-menu-sep" />
          <div className="proj-menu-head">Move to</div>
          <button role="menuitemradio" aria-checked={!p.group_id} className={!p.group_id ? 'on' : ''}
            onClick={() => onMove(null)}>
            <span className="proj-menu-dot none" />
            <span className="proj-menu-label">No group</span>
            {!p.group_id && <IconTick className="proj-menu-tick" />}
          </button>
          {sortGroups(groups).map((g) => (
            <button key={g.id} role="menuitemradio" aria-checked={p.group_id === g.id}
              className={p.group_id === g.id ? 'on' : ''} onClick={() => onMove(g.id)}>
              <span className={'proj-menu-dot card-theme-' + groupColor(g)} />
              <span className="proj-menu-label">{g.name}</span>
              {p.group_id === g.id && <IconTick className="proj-menu-tick" />}
            </button>
          ))}
          <button role="menuitem" onClick={onNewGroup}><IconPlus /> New group…</button>
        </div>
      )}

      {/* The handle. Nothing in here is clickable, so a press that lands
          anywhere on it can only mean "pick this up". */}
      <div className="proj-body">
        <span className={'proj-mark card-theme-' + versionTheme(p.name)}>{initials(p.name)}</span>
        <h2 className="proj-name">{p.name || 'Untitled'}</h2>
        <p className="proj-meta">{meta}</p>
      </div>

      <a className="proj-go" href={'/board?p=' + p.id} draggable={false}>
        Open board <IconChevronRight className="ic" />
      </a>
    </div>
  );
}
