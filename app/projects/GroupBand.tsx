'use client';

import { useEffect, useState } from 'react';
import type { ProjectSection } from '@/lib/grouping';
import { PALETTE } from '@/lib/types';
import { IconDots, IconGrip, IconStar, IconTrash } from '@/app/components/icons';

/**
 * One band of the projects page: a heading, and the projects under it.
 *
 * The three kinds share one heading shape on purpose — Favorites, a group and
 * Ungrouped are read as siblings, and a group only distinguishes itself by the
 * two things that are actually different: it has a colour, and its name can be
 * fixed where it stands, on the heading you are looking at.
 *
 * Only a group can be reordered, so only a group's heading grows a grip.
 */
export default function GroupBand({
  section, groupsExist, menuOpen, onMenu, onRename, onRecolor, onDelete, drag, head, receiving, children
}: {
  section: ProjectSection;
  groupsExist: boolean;
  menuOpen: boolean;
  onMenu: () => void;
  onRename: (name: string) => void;
  onRecolor: (index: number) => void;
  onDelete: () => void;
  /* Picking the band up. Desktop only, and groups only — the two implicit
     bands have no order of their own: Favorites always leads, Ungrouped
     always trails. */
  drag?: {
    dragging: boolean;
    over: boolean;
    onStart: () => void;
    onEnd: () => void;
  };
  /* The heading as a drop zone. Every band has one, whatever is in flight —
     the page decides what a drop there means. */
  head?: {
    onOver: () => void;
    onDrop: () => void;
  };
  /* A dragged project would land in this band. */
  receiving?: boolean;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState(section.label);
  const [armed, setArmed] = useState(false);
  useEffect(() => { setDraft(section.label); }, [section.label]);

  const commit = () => {
    const clean = draft.trim() || 'Group';
    setDraft(clean);
    if (clean !== section.label) onRename(clean);
  };

  /* Without groups there is nothing to be "ungrouped" from, so the catch-all
     band is simply everything you have. */
  const label = section.kind === 'ungrouped' && !groupsExist ? 'All projects' : section.label;

  return (
    <section
      className={'home-band'
        + (section.kind === 'group' ? ' card-theme-' + section.colorIndex : '')
        + (drag?.dragging ? ' band-dragging' : '')
        + (drag?.over ? ' band-over' : '')
        + (receiving ? ' band-receiving' : '')}
      draggable={armed}
      /* A card inside starts its own drag, and that event bubbles up to here.
         Only an event whose source *is* this band is this band being pulled. */
      onDragStart={(e) => {
        if (e.target !== e.currentTarget) return;
        e.dataTransfer.effectAllowed = 'move';
        drag?.onStart();
      }}
      onDragEnd={(e) => { if (e.target !== e.currentTarget) return; setArmed(false); drag?.onEnd(); }}>
      <div className="band-head"
        onDragOver={head && ((e) => { e.preventDefault(); head.onOver(); })}
        onDrop={head && ((e) => { e.preventDefault(); head.onDrop(); })}>
        {drag && (
          <span className="band-grip" title="Drag to reorder the groups"
            onMouseDown={() => setArmed(true)} onMouseUp={() => setArmed(false)}>
            <IconGrip />
          </span>
        )}
        {section.kind === 'favorites' && <IconStar className="band-star" />}
        {section.kind === 'group' && <span className="band-dot" aria-hidden />}

        {section.kind === 'group' ? (
          <input className="band-name" value={draft} spellCheck={false} aria-label="Group name"
            size={Math.max(6, draft.length)}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
              if (e.key === 'Escape') { setDraft(section.label); e.currentTarget.blur(); }
            }} />
        ) : (
          <h2 className={'band-title' + (section.kind === 'ungrouped' ? ' muted' : '')}>{label}</h2>
        )}

        <span className="band-count">{section.projects.length}</span>

        {section.kind === 'group' && (
          <div className="band-tools">
            <button className="band-menu-btn" title="Group options" aria-haspopup="menu" aria-expanded={menuOpen}
              onClick={onMenu}><IconDots /></button>
            {menuOpen && (
              <div className="band-menu" role="menu">
                <div className="band-menu-head">Colour</div>
                <div className="band-colors">
                  {PALETTE.map((c, i) => (
                    <button key={i} type="button" title={c.name}
                      className={'color-opt' + (section.colorIndex === i ? ' sel' : '')}
                      style={{ background: c.dot }} onClick={() => onRecolor(i)} />
                  ))}
                </div>
                <div className="band-menu-sep" />
                <button role="menuitem" className="danger" onClick={onDelete}><IconTrash /> Delete group</button>
              </div>
            )}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}
