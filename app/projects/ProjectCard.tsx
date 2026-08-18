'use client';

import type { Project, ProjectGroup } from '@/lib/types';
import { groupColor, sortGroups } from '@/lib/grouping';
import { versionTheme } from '@/lib/util';
import { IconDots, IconGrip, IconPencil, IconPlus, IconStar, IconTick, IconTrash } from '@/app/components/icons';

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
 * The ⋯ menu carries the group picker rather than hiding it behind Edit: moving
 * a project is the most frequent thing you do here, and it should cost one
 * click, not a dialog. It is also the whole story on touch, where dragging a
 * card is not an option.
 */
export default function ProjectCard({
  project, meta, groups, menuOpen, dragging,
  onMenu, onEdit, onDelete, onToggleFavorite, onMove, onNewGroup, onDragStart, onDragEnd
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
  /* Dragging is a desktop affordance the page hands down; without it the card
     is simply not draggable, which is exactly the case on touch. */
  dragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}) {
  const p = project;
  return (
    <div className={'proj-card' + (dragging ? ' dragging' : '')}
      draggable={!!onDragStart}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragEnd={onDragEnd}>
      {onDragStart && <span className="proj-grip" aria-hidden><IconGrip /></span>}
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
          <button role="menuitemradio" aria-checked={!p.group_id} className={!p.group_id ? ' on' : ''}
            onClick={() => onMove(null)}>
            <span className="proj-menu-dot none" />No group
            {!p.group_id && <IconTick className="proj-menu-tick" />}
          </button>
          {sortGroups(groups).map((g) => (
            <button key={g.id} role="menuitemradio" aria-checked={p.group_id === g.id}
              className={p.group_id === g.id ? ' on' : ''} onClick={() => onMove(g.id)}>
              <span className={'proj-menu-dot card-theme-' + groupColor(g)} />
              <span className="proj-menu-label">{g.name}</span>
              {p.group_id === g.id && <IconTick className="proj-menu-tick" />}
            </button>
          ))}
          <button role="menuitem" onClick={onNewGroup}><IconPlus /> New group…</button>
        </div>
      )}

      <a className="proj-open" href={'/board?p=' + p.id}>
        <span className={'proj-mark card-theme-' + versionTheme(p.name)}>{initials(p.name)}</span>
        <h2 className="proj-name">{p.name || 'Untitled'}</h2>
        <p className="proj-meta">{meta}</p>
      </a>
    </div>
  );
}
