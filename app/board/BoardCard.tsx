'use client';

import type { Card, Project, Version } from '@/lib/types';
import { versionColor } from '@/lib/util';
import { vocab } from '@/lib/labels';
import { useBoardDevMode } from '@/lib/devModeContext';
import BranchChip from '@/app/components/BranchChip';
import TypeTag from '@/app/components/TypeTag';
import { IconCheck, IconDots, IconPencil, IconTrash } from '@/app/components/icons';
import DatePill from './DatePill';

/**
 * One card in a kanban column. Drag-and-drop lives here; the column below it
 * owns the drop. Desktop gets inline edit/delete buttons and a clickable date
 * pill; touch gets a single ⋯ that opens the card action sheet.
 */
export default function BoardCard({
  card, version, project, index, justMoved, isMobile,
  onToggleDone, onEdit, onDelete, onMenu, onReschedule
}: {
  card: Card;
  version: Version | null;
  project: Project;
  index: number;
  justMoved: boolean;
  isMobile: boolean;
  onToggleDone: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onMenu: () => void;
  onReschedule: (start: string | null, end: string | null) => void;
}) {
  const devMode = useBoardDevMode();
  const v = vocab(devMode);
  const ci = versionColor(version);
  const cls = 'card' + (ci != null ? ' card-theme-' + ci : '')
    + (card.type === 'bug' ? ' is-bug' : '') + (card.done ? ' done' : '') + (justMoved ? ' dropped' : '');

  return (
    <article className={cls}
      style={{ animationDelay: justMoved ? '0ms' : `${Math.min(index * 45, 260)}ms` }}
      draggable
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', card.id); const el = e.currentTarget; window.setTimeout(() => el.classList.add('dragging'), 0); }}
      onDragEnd={(e) => e.currentTarget.classList.remove('dragging')}
      onDoubleClick={(e) => { if ((e.target as HTMLElement).closest('button, [role="button"]')) return; onEdit(); }}>
      <div className="card-top">
        <button className={'checkbox' + (card.done ? ' checked' : '')} title="Mark done" onClick={onToggleDone}>
          <IconCheck />
        </button>
        <div className="card-title">{card.title || `Untitled ${v.update.toLowerCase()}`}</div>
        <div className={'card-menu' + (isMobile ? ' m-visible' : '')}>
          {isMobile ? (
            <button className="icon-btn" title="Actions" onClick={onMenu}><IconDots /></button>
          ) : (
            <>
              <button className="icon-btn" title="Edit" onClick={onEdit}><IconPencil /></button>
              <button className="icon-btn del" title="Delete" onClick={onDelete}><IconTrash /></button>
            </>
          )}
        </div>
      </div>
      {card.comment && <div className="card-comment">{card.comment}</div>}
      <div className="card-meta">
        {card.type === 'bug' && <TypeTag />}
        {version && <span className="chip version">{version.name}</span>}
        <DatePill card={card} editable={!isMobile} onChange={onReschedule} />
        {card.branch && <BranchChip repoUrl={project.repo_url} branch={card.branch} />}
      </div>
    </article>
  );
}
