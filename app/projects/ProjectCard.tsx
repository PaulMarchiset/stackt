'use client';

import { useState } from 'react';
import type { Project, ProjectGroup } from '@/lib/types';
import { groupColor, sortGroups } from '@/lib/grouping';
import { isAfterMidpoint } from '@/lib/useDragSort';
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
 * The ⋯ menu carries the group picker rather than hiding it behind Edit:
 * moving a project is the most frequent thing done on this page, and it should
 * cost one click. It is also the whole story on touch, where `drag` is absent
 * and the card has no handle.
 *
 * Dragging is armed by the grip, not by the card: the card is mostly a link,
 * and links drag themselves by default. Holding the grip is what makes the
 * card draggable at all, so a stray drag on the title still opens the board.
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
  const [armed, setArmed] = useState(false);

  return (
    <div
      className={'proj-card'
        + (drag?.dragging ? ' dragging' : '')
        + (drag?.dropSide ? ' drop-' + drag.dropSide : '')}
      draggable={armed}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; drag?.onStart(); }}
      onDragEnd={() => { setArmed(false); drag?.onEnd(); }}
      onDragOver={drag && ((e) => {
        e.preventDefault();
        e.stopPropagation();          // the band would otherwise claim the drop for its end
        drag.onOver(isAfterMidpoint(e, e.currentTarget));
      })}>
      {drag && (
        <span className="proj-grip" title="Drag to move or reorder"
          onMouseDown={() => setArmed(true)} onMouseUp={() => setArmed(false)}>
          <IconGrip />
        </span>
      )}
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

      <a className="proj-open" href={'/board?p=' + p.id} draggable={false}>
        <span className={'proj-mark card-theme-' + versionTheme(p.name)}>{initials(p.name)}</span>
        <h2 className="proj-name">{p.name || 'Untitled'}</h2>
        <p className="proj-meta">{meta}</p>
      </a>
    </div>
  );
}
