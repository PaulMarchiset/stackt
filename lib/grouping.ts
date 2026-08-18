import type { HeaderItem, HeaderMode, Project, ProjectGroup } from './types';
import { versionColor } from './util';

/**
 * How projects are organised — one module, because the board header and the
 * projects page must never disagree about it.
 *
 * Groups are the shared structure: same names, same colours, same order
 * everywhere. What differs is only what each surface *shows*:
 *
 *   · the header shows a composed selection (`headerIslands`); it is narrow, so
 *     a project appears at most once — the first entry that claims it wins;
 *   · the projects page shows everything (`projectSections`), where a favourite
 *     deliberately appears twice: once under Favorites for the quick hop, once
 *     inside its group.
 */

/* A group's colour follows the same rule as a version's: an explicit choice,
   else a stable hash of the name — one rule, one function. */
export const groupColor = (g: ProjectGroup): number => versionColor(g) ?? 0;

/* Groups in display order (position, then name — same rule as versions). */
export function sortGroups(list: ProjectGroup[]): ProjectGroup[] {
  return list.slice().sort((a, b) =>
    a.position - b.position ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/* ============================================================
   The board header
   ============================================================ */

/**
 * One segment of the board header. `label === null` means an unlabelled island
 * (the favorites run, or a run of hand-picked projects) — the header draws a
 * divider between islands either way.
 */
export interface ProjectIsland {
  key: string;
  label: string | null;
  colorIndex: number | null;
  projects: Project[];
}

/**
 * Turn a header selection into the islands the header should draw.
 *
 * Three rules make this safe to point at any data:
 *
 *  1. **Never show an empty header.** A selection that resolves to nothing
 *     (nothing starred yet, every chosen group deleted) falls back to every
 *     project. An empty header would look broken and strand the user.
 *  2. **The open project is always reachable.** If the active project is not in
 *     the selection, it is appended as its own island — otherwise opening a
 *     project from /projects would leave the header showing somewhere you
 *     aren't.
 *  3. **A project appears once.** Favorites and groups overlap by design, and
 *     two tabs lighting up together for one board is a puzzle — so the first
 *     entry that claims a project keeps it.
 */
export function headerIslands(
  items: HeaderItem[],
  projects: Project[],
  groups: ProjectGroup[],
  activeId: string | null
): ProjectIsland[] {
  if (projects.length === 0) return [];
  const islands = dedupe(build(items, projects, groups));
  if (islands.length === 0) return withActive([all(projects)], projects, activeId);
  return withActive(islands, projects, activeId);
}

const all = (projects: Project[]): ProjectIsland =>
  ({ key: 'all', label: null, colorIndex: null, projects });

function build(items: HeaderItem[], projects: Project[], groups: ProjectGroup[]): ProjectIsland[] {
  const projectById = new Map(projects.map((p) => [p.id, p] as const));
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  const out: ProjectIsland[] = [];
  /* What produced the island currently at the end, so consecutive single
     projects can join one run: a divider between two lone tabs would draw a
     boundary that isn't there. An entry resolving to nothing leaves it alone. */
  let lastKind: HeaderItem['kind'] | null = null;

  items.forEach((item, i) => {
    if (item.kind === 'favorites') {
      const favs = projects.filter((p) => p.favorite);
      if (!favs.length) return;
      out.push({ key: 'i' + i + ':favorites', label: null, colorIndex: null, projects: favs });
      lastKind = 'favorites';
      return;
    }
    if (item.kind === 'group') {
      const g = groupById.get(item.id);
      if (!g) return;                      // the group was deleted — the entry is inert
      const members = projects.filter((p) => p.group_id === g.id);
      // An empty group is a plan, not a section — don't draw a label over nothing.
      if (!members.length) return;
      out.push({ key: 'i' + i + ':' + g.id, label: g.name, colorIndex: groupColor(g), projects: members });
      lastKind = 'group';
      return;
    }
    const p = projectById.get(item.id);
    if (!p) return;                        // the project was deleted
    if (lastKind === 'project') out[out.length - 1].projects.push(p);
    else out.push({ key: 'i' + i + ':' + p.id, label: null, colorIndex: null, projects: [p] });
    lastKind = 'project';
  });
  return out;
}

/* Rule 3: the first island that claims a project keeps it. */
function dedupe(islands: ProjectIsland[]): ProjectIsland[] {
  const seen = new Set<string>();
  const out: ProjectIsland[] = [];
  for (const isle of islands) {
    const projects = isle.projects.filter((p) => !seen.has(p.id));
    projects.forEach((p) => seen.add(p.id));
    if (projects.length) out.push({ ...isle, projects });
  }
  return out;
}

/* Rule 2: make sure whatever board is open has a tab. */
function withActive(islands: ProjectIsland[], projects: Project[], activeId: string | null): ProjectIsland[] {
  if (!activeId || islands.some((i) => i.projects.some((p) => p.id === activeId))) return islands;
  const active = projects.find((p) => p.id === activeId);
  if (!active) return islands;
  return [...islands, { key: 'active', label: null, colorIndex: null, projects: [active] }];
}

/* ============================================================
   The header selection — reading it, and editing it
   ============================================================ */

/**
 * The column is JSONB: whatever is in there arrives untyped, possibly written
 * by an older or newer client. Anything unrecognised is dropped rather than
 * trusted, so a bad row degrades to "fewer entries", never to a crash.
 */
export function parseHeaderItems(raw: unknown): HeaderItem[] {
  if (!Array.isArray(raw)) return [];
  const out: HeaderItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const { kind, id } = entry as { kind?: unknown; id?: unknown };
    if (kind === 'favorites') out.push({ kind: 'favorites' });
    else if ((kind === 'group' || kind === 'project') && typeof id === 'string') out.push({ kind, id });
  }
  return out;
}

export const sameItem = (a: HeaderItem, b: HeaderItem): boolean =>
  a.kind === b.kind && (a.kind === 'favorites' || b.kind === 'favorites' || a.id === b.id);

export const hasItem = (items: HeaderItem[], item: HeaderItem): boolean =>
  items.some((x) => sameItem(x, item));

/* Adding an entry that is already there is a no-op, not a duplicate. */
export const addItem = (items: HeaderItem[], item: HeaderItem): HeaderItem[] =>
  hasItem(items, item) ? items : [...items, item];

export const removeItem = (items: HeaderItem[], item: HeaderItem): HeaderItem[] =>
  items.filter((x) => !sameItem(x, item));

/* Move the entry at `from` so it lands at index `to`. */
export function moveItem(items: HeaderItem[], from: number, to: number): HeaderItem[] {
  if (from === to || from < 0 || from >= items.length) return items;
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
  return next;
}

/**
 * The three exclusive modes, translated into a selection. Mirrors the backfill
 * in migration 0007 so a client that still speaks modes writes the same list
 * the database would have. Goes away with the column.
 */
export function itemsFromMode(mode: HeaderMode, projects: Project[], groups: ProjectGroup[]): HeaderItem[] {
  if (mode === 'custom') return projects.filter((p) => p.pinned).map((p) => ({ kind: 'project', id: p.id }));
  if (mode === 'groups') return sortGroups(groups).map((g) => ({ kind: 'group', id: g.id }));
  return [{ kind: 'favorites' }];
}

/* ============================================================
   The projects page
   ============================================================ */

export type SectionKind = 'favorites' | 'group' | 'ungrouped';

/**
 * One band of the projects page. `key` doubles as the drop target id for the
 * drag and drop, which is why it has to be stable and unique: a group's own id,
 * or the fixed name of one of the two implicit bands.
 */
export interface ProjectSection {
  key: string;
  kind: SectionKind;
  group: ProjectGroup | null;
  label: string;
  colorIndex: number | null;
  projects: Project[];
}

/**
 * Every project, banded: Favorites, then each group in order, then whatever is
 * ungrouped. Empty bands are returned too — a group you just made has to be
 * visible to be filled, and an empty band is a drop target. The caller decides
 * which ones are worth drawing.
 *
 * Unlike the header, this does **not** deduplicate: a starred project shows up
 * under Favorites *and* inside its group, which is the point of Favorites here.
 */
export function projectSections(projects: Project[], groups: ProjectGroup[]): ProjectSection[] {
  const known = new Set(groups.map((g) => g.id));
  const sections: ProjectSection[] = [{
    key: 'favorites', kind: 'favorites', group: null, label: 'Favorites',
    colorIndex: null, projects: projects.filter((p) => p.favorite)
  }];
  for (const g of sortGroups(groups)) {
    sections.push({
      key: g.id, kind: 'group', group: g, label: g.name,
      colorIndex: groupColor(g), projects: projects.filter((p) => p.group_id === g.id)
    });
  }
  sections.push({
    key: 'ungrouped', kind: 'ungrouped', group: null, label: 'Ungrouped',
    colorIndex: null, projects: projects.filter((p) => !p.group_id || !known.has(p.group_id))
  });
  return sections;
}
