import type { BoardProject, PersonalFields, Project } from './types';

/**
 * The one place that knows which fields belong to the project and which belong
 * to the person looking at it.
 *
 * Four screens need this merge — the board, the projects page, and two settings
 * panels — and before this file existed the rule was written out at each of
 * them. Four copies of a boundary is four chances to get it wrong, and getting
 * it wrong here is silent: you would simply be writing your favourites onto
 * somebody else's row.
 */

/* Named once so useProjectsStore can route a patch by asking this list rather
   than repeating it. Adding a personal field means adding it here and letting
   the compiler find the rest. */
export const PERSONAL_FIELDS = ['remind', 'favorite', 'position', 'group_id'] as const;

export function isPersonalField(key: string): boolean {
  return (PERSONAL_FIELDS as readonly string[]).includes(key);
}

/* What a project_members row looks like when only the personal columns were
   selected. Partial because each caller asks for what it needs. */
export type MembershipRow = { project_id: string } & Partial<PersonalFields>;

/* Defaults for a project with no membership row for this reader. That should
   not happen — you cannot see a project you are not a member of — but a screen
   that renders nothing because one row was missing is a worse failure than one
   that renders it unstarred. */
const NONE: PersonalFields = { remind: false, favorite: false, position: 0, group_id: null };

/**
 * Merge each reader's own settings onto the shared rows, in their own order.
 *
 * Sorting happens here rather than in SQL because the column it sorts on left
 * the table being queried: `order('position')` on `projects` would now either
 * fail or, worse, silently order by nothing.
 */
export function withPersonal(projects: Project[], rows: MembershipRow[]): BoardProject[] {
  const mine = new Map(rows.map((r) => [r.project_id, r]));
  return projects
    .map((p) => {
      const m = mine.get(p.id);
      return {
        ...p,
        remind: m?.remind ?? NONE.remind,
        favorite: m?.favorite ?? NONE.favorite,
        position: m?.position ?? NONE.position,
        group_id: m?.group_id ?? NONE.group_id
      };
    })
    .sort((a, b) => a.position - b.position);
}
