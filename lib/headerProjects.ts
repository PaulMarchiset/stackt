import type { HeaderMode, Project, ProjectGroup } from './types';

/**
 * One segment of the board header. `label === null` means an unlabelled island
 * (the single run of projects in favorites/custom mode, or the trailing catch-all
 * in groups mode) — the header draws a divider between islands either way.
 */
export interface ProjectIsland {
  key: string;
  label: string | null;
  colorIndex: number | null;
  projects: Project[];
}

/* Groups in display order (position, then name — same rule as versions). */
export function sortGroups(list: ProjectGroup[]): ProjectGroup[] {
  return list.slice().sort((a, b) =>
    a.position - b.position ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/**
 * Turn a header mode into the islands the header should draw.
 *
 * Two rules make this safe to point at any data:
 *
 *  1. **Never show an empty header.** A filtering mode that selects nothing
 *     (no favorite starred yet, no group created yet) falls back to every
 *     project. An empty header would look broken and strand the user.
 *  2. **The open project is always reachable.** If the active project is
 *     filtered out, it is appended as its own island — otherwise opening a
 *     non-favorite project from /projects would leave the header showing
 *     somewhere you aren't.
 */
export function headerIslands(
  mode: HeaderMode,
  projects: Project[],
  groups: ProjectGroup[],
  activeId: string | null
): ProjectIsland[] {
  if (projects.length === 0) return [];
  const islands = build(mode, projects, groups);
  const shown = islands.flatMap((i) => i.projects);
  if (shown.length === 0) return withActive([all(projects)], projects, activeId);
  return withActive(islands, projects, activeId);
}

const all = (projects: Project[]): ProjectIsland =>
  ({ key: 'all', label: null, colorIndex: null, projects });

function build(mode: HeaderMode, projects: Project[], groups: ProjectGroup[]): ProjectIsland[] {
  if (mode === 'custom') {
    const picked = projects.filter((p) => p.pinned);
    return picked.length ? [{ key: 'pinned', label: null, colorIndex: null, projects: picked }] : [];
  }
  if (mode === 'groups') {
    const out: ProjectIsland[] = [];
    for (const g of sortGroups(groups)) {
      const members = projects.filter((p) => p.group_id === g.id);
      // An empty group is a plan, not a section — don't draw a label over nothing.
      if (members.length) out.push({ key: g.id, label: g.name, colorIndex: g.color_index, projects: members });
    }
    const loose = projects.filter((p) => !p.group_id || !groups.some((g) => g.id === p.group_id));
    if (loose.length) out.push({ key: 'ungrouped', label: null, colorIndex: null, projects: loose });
    return out;
  }
  const favs = projects.filter((p) => p.favorite);
  return favs.length ? [{ key: 'favorites', label: null, colorIndex: null, projects: favs }] : [];
}

/* Rule 2: make sure whatever board is open has a tab. */
function withActive(islands: ProjectIsland[], projects: Project[], activeId: string | null): ProjectIsland[] {
  if (!activeId || islands.some((i) => i.projects.some((p) => p.id === activeId))) return islands;
  const active = projects.find((p) => p.id === activeId);
  if (!active) return islands;
  return [...islands, { key: 'active', label: null, colorIndex: null, projects: [active] }];
}
