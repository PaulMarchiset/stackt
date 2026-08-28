'use client';

import { useState } from 'react';
import type { HeaderItem, Project, ProjectGroup } from '@/lib/types';
import { addItem, groupColor, hasItem, moveItem, removeItem, resolveHeader, sortGroups } from '@/lib/grouping';
import { isBelowMidpoint } from '@/lib/useDragSort';
import { IconChevronDown, IconClose, IconGrip, IconPlus, IconStar } from '@/app/components/icons';

/* One key per entry, stable across reordering — which is what the expanded set
   and React's reconciliation both need. */
const keyOf = (item: HeaderItem) => (item.kind === 'favorites' ? 'favorites' : item.kind + ':' + item.id);

/**
 * Choose what heads the board.
 *
 * The header used to be one of three exclusive modes; it is now a list you
 * build — your favorites, a group, a single project, in the order you want
 * them. The same component runs in the board's own header and in settings, so
 * there is one way to do this rather than two that drift.
 *
 * The count beside each entry is what it will *actually* contribute, taken
 * from resolveHeader() — the very pass the header renders from — so an entry
 * whose projects an earlier one already claimed reads 0 rather than promising
 * tabs that will never appear.
 *
 * Order can be dragged or nudged with the arrows. Both, deliberately: dragging
 * is quicker, and the arrows are the only version of it that a keyboard can
 * reach.
 */
export default function HeaderComposer({
  items, projects, groups, onChange
}: {
  items: HeaderItem[];
  projects: Project[];
  groups: ProjectGroup[];
  onChange: (next: HeaderItem[]) => void;
}) {
  const [drag, setDrag] = useState<{ from: number; over: number; below: boolean } | null>(null);

  const entries = resolveHeader(items, projects, groups);

  /* The hovered row and which half of it names a gap in the *current* list;
     moveItem() splices the entry out before putting it back, so an insertion
     point past the one that left has to come back a notch. */
  function drop() {
    if (!drag) return;
    const target = drag.over + (drag.below ? 1 : 0);
    onChange(moveItem(items, drag.from, target > drag.from ? target - 1 : target));
    setDrag(null);
  }

  const available: { key: string; item: HeaderItem; label: string; colorIndex: number | null; star?: boolean }[] = [];
  if (!hasItem(items, { kind: 'favorites' })) {
    available.push({ key: 'favorites', item: { kind: 'favorites' }, label: 'Favorites', colorIndex: null, star: true });
  }
  for (const g of sortGroups(groups)) {
    if (!hasItem(items, { kind: 'group', id: g.id })) {
      available.push({ key: 'g' + g.id, item: { kind: 'group', id: g.id }, label: g.name, colorIndex: groupColor(g) });
    }
  }
  for (const p of projects) {
    if (!hasItem(items, { kind: 'project', id: p.id })) {
      available.push({ key: 'p' + p.id, item: { kind: 'project', id: p.id }, label: p.name || 'Untitled', colorIndex: null });
    }
  }

  return (
    <div className="hc">
      <div className="hc-head">In your header</div>
      <ul className="hc-list">
        {entries.map((entry, i) => {
          if (entry.missing) return null;   // points at something deleted — never drawn
          const key = keyOf(entry.item);
          const star = entry.item.kind === 'favorites';
          return (
            <li className={'hc-item' + (drag?.from === i ? ' dragging' : '')
              + (drag && drag.over === i && drag.from !== i ? (drag.below ? ' drop-below' : ' drop-above') : '')}
              key={key}>
              <HeaderRow
                onDragStart={() => setDrag({ from: i, over: i, below: false })}
                onDragOver={(below) => setDrag((d) => (!d || (d.over === i && d.below === below) ? d : { ...d, over: i, below }))}
                onDrop={drop}
                onDragEnd={() => setDrag(null)}>
                {star ? <IconStar className="hc-star" />
                  : <span className={'hc-dot' + (entry.colorIndex === null ? ' plain' : '')} />}
                <span className="hc-label">{entry.title}</span>
                <span className="hc-count">{entry.projects.length}</span>
                <button className="hc-btn" title="Move earlier" aria-label="Move earlier" disabled={i === 0}
                  onClick={() => onChange(moveItem(items, i, i - 1))}>
                  <IconChevronDown className="up" />
                </button>
                <button className="hc-btn" title="Move later" aria-label="Move later" disabled={i === items.length - 1}
                  onClick={() => onChange(moveItem(items, i, i + 1))}>
                  <IconChevronDown />
                </button>
                <button className="hc-btn del" title="Remove from the header" aria-label="Remove from the header"
                  onClick={() => onChange(removeItem(items, entry.item))}>
                  <IconClose />
                </button>
              </HeaderRow>

            </li>
          );
        })}
        {/* Stale entries draw nothing, so a list made only of them is as empty
            as an empty one — and has to say the same thing. */}
        {entries.every((e) => e.missing) && (
          <li className="hc-empty">Nothing chosen — the header is showing every project.</li>
        )}
      </ul>

      {available.length > 0 && (
        <>
          <div className="hc-head">Add</div>
          <div className="hc-add">
            {available.map((a) => (
              <button key={a.key} className={'hc-chip' + (a.colorIndex !== null ? ' card-theme-' + a.colorIndex : '')}
                onClick={() => onChange(addItem(items, a.item))}>
                <IconPlus className="hc-chip-ic" />
                {a.star ? <IconStar className="hc-star" /> : a.colorIndex !== null && <span className="hc-dot" />}
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}

      <p className="hc-note">
        A group appears only once it holds something, a project appears once even if two entries claim it, and
        whatever board you have open always keeps its tab.
      </p>
    </div>
  );
}

/**
 * The line itself. Dragging is armed by holding the grip, the same bargain the
 * projects page strikes: the row is full of buttons, and a row that is always
 * draggable turns every click into a possible drag.
 */
function HeaderRow({
  children, onDragStart, onDragOver, onDrop, onDragEnd
}: {
  children: React.ReactNode;
  onDragStart: () => void;
  onDragOver: (below: boolean) => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <div className="hc-row" draggable={armed}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
      onDragEnd={() => { setArmed(false); onDragEnd(); }}
      onDragOver={(e) => { e.preventDefault(); onDragOver(isBelowMidpoint(e, e.currentTarget)); }}
      onDrop={(e) => { e.preventDefault(); onDrop(); }}>
      <span className="hc-grip" title="Drag to reorder"
        onMouseDown={() => setArmed(true)} onMouseUp={() => setArmed(false)}>
        <IconGrip />
      </span>
      {children}
    </div>
  );
}
