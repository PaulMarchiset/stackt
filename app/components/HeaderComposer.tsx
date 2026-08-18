'use client';

import type { HeaderItem, Project, ProjectGroup } from '@/lib/types';
import { addItem, groupColor, hasItem, moveItem, removeItem, sortGroups } from '@/lib/grouping';
import { IconChevronDown, IconClose, IconPlus, IconStar } from '@/app/components/icons';

/* What one entry stands for, resolved against the data. `null` means the entry
   points at something that no longer exists: it is skipped rather than drawn,
   which is the same thing the header itself does with it. */
type Described = { label: string; count: number; colorIndex: number | null; star?: boolean } | null;

function describe(item: HeaderItem, projects: Project[], groups: ProjectGroup[]): Described {
  if (item.kind === 'favorites') {
    return { label: 'Favorites', count: projects.filter((p) => p.favorite).length, colorIndex: null, star: true };
  }
  if (item.kind === 'group') {
    const g = groups.find((x) => x.id === item.id);
    if (!g) return null;
    return { label: g.name, count: projects.filter((p) => p.group_id === g.id).length, colorIndex: groupColor(g) };
  }
  const p = projects.find((x) => x.id === item.id);
  return p ? { label: p.name || 'Untitled', count: 1, colorIndex: null } : null;
}

/**
 * Choose what heads the board.
 *
 * The header used to be one of three exclusive modes; it is now a list you
 * build — your favorites, a group, a single project, in the order you want
 * them. The same component runs in the board's own header and in settings, so
 * there is one way to do this rather than two that drift.
 *
 * Order is changed with buttons rather than by dragging: this list is short and
 * often lives inside a popover, where a drag is both fiddly and unreachable
 * from a keyboard. The page it organises (/projects) is where dragging earns
 * its keep.
 */
export default function HeaderComposer({
  items, projects, groups, onChange
}: {
  items: HeaderItem[];
  projects: Project[];
  groups: ProjectGroup[];
  onChange: (next: HeaderItem[]) => void;
}) {
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
        {items.map((item, i) => {
          const d = describe(item, projects, groups);
          if (!d) return null;
          return (
            <li className={'hc-row' + (d.colorIndex !== null ? ' card-theme-' + d.colorIndex : '')}
              key={item.kind + ':' + (item.kind === 'favorites' ? '' : item.id)}>
              {d.star ? <IconStar className="hc-star" /> : <span className={'hc-dot' + (d.colorIndex === null ? ' plain' : '')} />}
              <span className="hc-label">{d.label}</span>
              <span className="hc-count">{d.count}</span>
              <button className="hc-btn" title="Move earlier" aria-label="Move earlier" disabled={i === 0}
                onClick={() => onChange(moveItem(items, i, i - 1))}>
                <IconChevronDown className="up" />
              </button>
              <button className="hc-btn" title="Move later" aria-label="Move later" disabled={i === items.length - 1}
                onClick={() => onChange(moveItem(items, i, i + 1))}>
                <IconChevronDown />
              </button>
              <button className="hc-btn del" title="Remove from the header" aria-label="Remove from the header"
                onClick={() => onChange(removeItem(items, item))}>
                <IconClose />
              </button>
            </li>
          );
        })}
        {items.length === 0 && (
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
