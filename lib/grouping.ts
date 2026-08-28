import type { HeaderItem, Project, ProjectGroup } from './types';
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
 *   · the projects page shows everything (`projectSections`), one band per
 *     place a project can *live* — a favourite is not a band there, it is a
 *     chip in the bar above them (`favoriteProjects`), because a shortcut that
 *     is drawn like content reads as a duplicate of it.
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
  /* The group this run came from, when it came from one. `key` changes with the
     entry's position; this doesn't, which is what a preference about the island
     (whether it is folded) has to hang on. */
  groupId: string | null;
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
  const islands = coalesce(resolveHeader(items, projects, groups));
  if (islands.length === 0) return withActive([all(projects)], projects, activeId);
  return withActive(islands, projects, activeId);
}

const all = (projects: Project[]): ProjectIsland =>
  ({ key: 'all', label: null, colorIndex: null, groupId: null, projects });

/**
 * What one entry of the selection actually contributes, after rule 3 has taken
 * its share away. Entry *i* of `resolveHeader`'s result answers for entry *i*
 * of the list you gave it, which is what lets the composer show the truth
 * rather than a hopeful count.
 */
export interface HeaderEntry {
  item: HeaderItem;
  /* The tab-run label the header draws: a group's name, null for the rest. */
  label: string | null;
  /* What to call the entry in a list of entries — always something. */
  title: string;
  colorIndex: number | null;
  /* Everything this entry still brings once earlier entries have taken theirs.
     Empty means it draws nothing: it is empty, stale, or already covered. */
  projects: Project[];
  /* The group or project it names is gone. */
  missing: boolean;
}

/**
 * Resolve a selection, entry by entry, in order.
 *
 * This is the single pass rule 3 lives in: a project is claimed by the first
 * entry that can take it, and later entries see it already gone. Both the
 * header (which coalesces these into islands) and the composer (which lists
 * them) read the same result, so what you are shown while choosing is what the
 * header will draw.
 */
export function resolveHeader(items: HeaderItem[], projects: Project[], groups: ProjectGroup[]): HeaderEntry[] {
  const projectById = new Map(projects.map((p) => [p.id, p] as const));
  const groupById = new Map(groups.map((g) => [g.id, g] as const));
  const taken = new Set<string>();
  const claim = (list: Project[]) => {
    const mine = list.filter((p) => !taken.has(p.id));
    mine.forEach((p) => taken.add(p.id));
    return mine;
  };
  const gone = (item: HeaderItem): HeaderEntry =>
    ({ item, label: null, title: '', colorIndex: null, projects: [], missing: true });

  return items.map((item) => {
    if (item.kind === 'favorites') {
      return {
        item, label: null, title: 'Favorites', colorIndex: null,
        projects: claim(projects.filter((p) => p.favorite)), missing: false
      };
    }
    if (item.kind === 'group') {
      const g = groupById.get(item.id);
      if (!g) return gone(item);
      return {
        item, label: g.name, title: g.name, colorIndex: groupColor(g),
        projects: claim(projects.filter((p) => p.group_id === g.id)), missing: false
      };
    }
    const p = projectById.get(item.id);
    if (!p) return gone(item);
    return { item, label: null, title: p.name || 'Untitled', colorIndex: null, projects: claim([p]), missing: false };
  });
}

/* Entries → the runs of tabs the header draws. An entry that brings nothing is
   not a section (an empty group is a plan, not a heading), and consecutive lone
   projects join one run: a divider between two single tabs would draw a
   boundary that isn't there. */
function coalesce(entries: HeaderEntry[]): ProjectIsland[] {
  const out: ProjectIsland[] = [];
  let lastKind: HeaderItem['kind'] | null = null;
  entries.forEach((e, i) => {
    if (!e.projects.length) return;
    if (e.item.kind === 'project' && lastKind === 'project') {
      out[out.length - 1].projects.push(...e.projects);
      return;
    }
    out.push({
      key: 'i' + i + ':' + (e.item.kind === 'favorites' ? 'favorites' : e.item.id),
      label: e.label, colorIndex: e.colorIndex, projects: e.projects,
      groupId: e.item.kind === 'group' ? e.item.id : null
    });
    lastKind = e.item.kind;
  });
  return out;
}

/* Rule 2: make sure whatever board is open has a tab. */
function withActive(islands: ProjectIsland[], projects: Project[], activeId: string | null): ProjectIsland[] {
  if (!activeId || islands.some((i) => i.projects.some((p) => p.id === activeId))) return islands;
  const active = projects.find((p) => p.id === activeId);
  if (!active) return islands;
  return [...islands, { key: 'active', label: null, colorIndex: null, groupId: null, projects: [active] }];
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


/* ============================================================
   The projects page
   ============================================================ */

export type SectionKind = 'group' | 'ungrouped';

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
 * Every project, banded: each group in order, then whatever is ungrouped.
 * Empty bands are returned too — a group you just made has to be visible to be
 * filled, and an empty band is a drop target. The caller decides which ones are
 * worth drawing.
 *
 * Every project appears exactly once, because a band is *where a project lives*
 * and it lives in one place. Favorites is not a band (see `favoriteProjects`):
 * a second copy of the same cards makes the page look like it is repeating
 * itself, and — since order is one global sequence — reordering either copy
 * silently reorders the other.
 */
export function projectSections(projects: Project[], groups: ProjectGroup[]): ProjectSection[] {
  const known = new Set(groups.map((g) => g.id));
  const sections: ProjectSection[] = [];
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

/**
 * Where a dragged project lands: the whole project list, reordered, with the
 * regrouping the drop implies already applied.
 *
 * Dropping is two statements at once — "it belongs here" and "it goes there" —
 * and both fall out of which band received it:
 *   · a group    — it joins that group.
 *   · Ungrouped  — it leaves whatever group it was in.
 *
 * Starring is not one of them: that is the star's job on the card. A drop can
 * therefore never mean something the band it landed in has no way to undo.
 *
 * Order is one global sequence (projects.position), the same one the board
 * header reads for its tabs, so a drop is expressed by re-inserting the project
 * next to its new *neighbours in that band* rather than at some index of its
 * own. `index` counts the band's other members, so it is stable whether or not
 * the project was already in the band. A project dropped into an empty band has
 * no neighbours to anchor to and goes last, where it is the only thing anyway.
 */
export function applyProjectDrop(
  projects: Project[],
  sections: ProjectSection[],
  draggedId: string,
  sectionKey: string,
  index: number
): Project[] {
  const dragged = projects.find((p) => p.id === draggedId);
  const section = sections.find((s) => s.key === sectionKey);
  if (!dragged || !section) return projects;

  const moved: Project = {
    ...dragged,
    group_id: section.kind === 'group' ? (section.group?.id ?? null) : null
  };

  const rest = projects.filter((p) => p.id !== draggedId);
  const neighbours = section.projects.filter((p) => p.id !== draggedId);
  const anchor = (id: string) => rest.findIndex((p) => p.id === id);
  const at = neighbours.length === 0 ? rest.length
    : index >= neighbours.length ? anchor(neighbours[neighbours.length - 1].id) + 1
      : anchor(neighbours[index].id);

  const next = rest.slice();
  next.splice(at < 0 ? rest.length : at, 0, moved);
  return next;
}

/**
 * The starred projects, in board order — everything the favorites bar shows.
 *
 * Deliberately a plain list and not a `ProjectSection`: the bar is a row of
 * chips you click to jump, with no drop target and no order of its own, so it
 * cannot restate the bands underneath it or fight them over `position`.
 */
export const favoriteProjects = (projects: Project[]): Project[] => projects.filter((p) => p.favorite);
