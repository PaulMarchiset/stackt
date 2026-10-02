import type { Card, CardAssignee, CardComment, HeaderItem, BoardProject, ProjectGroup, Version } from '@/lib/types';

/**
 * The board a screenshot should find.
 *
 * Everything the demo shows is built here, once, from a single day-zero: dates
 * are expressed as offsets from *today*, so the timeline is never stale and the
 * "overdue · today · next week" story reads the same whenever the shot is
 * taken. Ids are readable strings rather than uuids — the app only ever
 * compares them, and a fixture you can grep is worth more than a realistic one.
 *
 * Only `demo-stackt` is filled in: it is the project the screenshots are of.
 * The others exist so the projects page and the board header have something to
 * be a page *of* — groups, favorites, a couple of client boards, and two
 * projects in the non-developer dialect (Phase / Urgent) so both vocabularies
 * can be photographed from the same demo.
 *
 * Nothing here is ever written back: in demo mode every write goes to the stub
 * in lib/demo/db.ts. Edit this file to change what the screenshots say.
 */

/* ---------- identity shown in the header ---------- */
export const DEMO_USER = {
  id: 'demo-user',
  email: 'demo@stackt.app',
  name: 'Paul'
};

/* ---------- dates ---------- */
/* Midnight UTC today, so the whole fixture agrees on what "today" is. */
function dayZero(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/* YYYY-MM-DD, `n` days from today (negative = past). */
function day(n: number): string {
  const d = dayZero();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/* An ISO timestamp `n` days ago at `hour` — what done_at / completed_at hold. */
function stamp(n: number, hour = 11): string {
  const d = dayZero();
  d.setUTCDate(d.getUTCDate() + n);
  d.setUTCHours(hour, 20, 0, 0);
  return d.toISOString();
}

/* ---------- groups ---------- */
const GROUPS: ProjectGroup[] = [
  { id: 'demo-g-side', user_id: DEMO_USER.id, name: 'Side projects', color_index: 2, position: 0 },
  { id: 'demo-g-client', user_id: DEMO_USER.id, name: 'Client work', color_index: 4, position: 1 }
];

/* ---------- projects ---------- */
const PROJECTS: BoardProject[] = [
  {
    id: 'demo-stackt', name: 'Stackt', active_version_id: 'demo-v-110',
    group_id: 'demo-g-side', favorite: true,
    repo_url: 'https://github.com/paulmarchiset/stackt',
    position: 0, dev_mode: true, remind: true
  },
  {
    id: 'demo-portfolio', name: 'Portfolio', active_version_id: 'demo-v-pf',
    group_id: 'demo-g-side', favorite: false,
    repo_url: 'https://github.com/paulmarchiset/portfolio',
    position: 1, dev_mode: true, remind: false
  },
  {
    id: 'demo-weather', name: 'Pixel Weather', active_version_id: null,
    group_id: 'demo-g-side', favorite: false, repo_url: '',
    position: 2, dev_mode: true, remind: false
  },
  {
    id: 'demo-atelier', name: 'Atelier Renaud', active_version_id: 'demo-v-at',
    group_id: 'demo-g-client', favorite: true, repo_url: '',
    position: 3, dev_mode: false, remind: true
  },
  {
    id: 'demo-mistral', name: 'Cafe Mistral', active_version_id: 'demo-v-mi',
    group_id: 'demo-g-client', favorite: false, repo_url: '',
    position: 4, dev_mode: false, remind: false
  },
  {
    id: 'demo-flat', name: 'Flat renovation', active_version_id: null,
    group_id: null, favorite: false, repo_url: '',
    position: 5, dev_mode: false, remind: false
  }
];

/* ---------- versions ---------- */
const V = (
  id: string, project_id: string, name: string, position: number,
  extra: Partial<Version> = {}
): Version => ({
  id, project_id, name, color_index: null, completed: false, completed_at: null,
  ship_date: null, position, ...extra
});

const VERSIONS: Version[] = [
  /* Stackt — two shipped, one in flight, one queued. */
  V('demo-v-090', 'demo-stackt', 'v0.9.0', 0, { completed: true, completed_at: stamp(-38), ship_date: day(-40), color_index: 3 }),
  V('demo-v-100', 'demo-stackt', 'v1.0.0', 1, { completed: true, completed_at: stamp(-11), ship_date: day(-12), color_index: 0 }),
  V('demo-v-110', 'demo-stackt', 'v1.1.0', 2, { ship_date: day(9), color_index: 4 }),
  V('demo-v-120', 'demo-stackt', 'v1.2.0', 3, { ship_date: day(31), color_index: 2 }),
  /* The supporting cast — one open version each is enough to fill a card. */
  V('demo-v-pf', 'demo-portfolio', 'v2.1.0', 0, { ship_date: day(16), color_index: 1 }),
  V('demo-v-at', 'demo-atelier', 'Launch', 0, { ship_date: day(6), color_index: 4 }),
  V('demo-v-mi', 'demo-mistral', 'Opening week', 0, { ship_date: day(21), color_index: 5 }),
  V('demo-v-fl', 'demo-flat', 'Kitchen', 0, { color_index: 3 })
];

/* ---------- cards ---------- */
type CardSpec = Partial<Card> & { title: string };

let seq = 0;
const C = (project_id: string, version_id: string | null, spec: CardSpec): Card => ({
  id: 'demo-card-' + ++seq,
  project_id, version_id,
  title: spec.title,
  comment: spec.comment ?? '',
  target_date: spec.target_date ?? null,
  end_date: spec.end_date ?? null,
  status: spec.status ?? 'todo',
  done: spec.status === 'done',
  done_at: spec.status === 'done' ? spec.done_at ?? stamp(-1) : null,
  type: spec.type ?? 'update',
  branch: spec.branch ?? '',
  position: seq
});

const CARDS: Card[] = [
  /* ---- Stackt · v1.1.0, the version on screen ---- */
  C('demo-stackt', 'demo-v-110', {
    title: 'Group projects into bands on the projects page',
    comment: 'Drag a project onto a band to move it. The band heading is the name field, so there is no dialog. The same groups feed the board header, which is why the two can never disagree.',
    branch: 'feat/project-groups', status: 'inprogress', target_date: day(-1), end_date: day(2)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Compose the board header from favorites, groups and single projects',
    comment: 'The header is a list of entries, not a mode you switch between. Drag to reorder, click an entry to see what it brings in.',
    branch: 'feat/header-composer', status: 'inprogress', target_date: day(0)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Favorites as a chip bar, not a band of duplicate cards',
    branch: 'feat/favorites-bar', status: 'inprogress', target_date: day(1)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Fold a group shut and remember it per device',
    comment: 'A folded group keeps its name in view and tucks its tabs behind a count.',
    branch: 'feat/fold-groups', target_date: day(2)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Keyboard shortcuts for the board',
    comment: 'N for a new card, / to filter, 1-3 to jump between columns.',
    target_date: day(3), end_date: day(4)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Empty states for a brand-new board',
    target_date: day(5)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Favorites bar overflows below 340px',
    comment: 'The chips wrap into the logo on an iPhone SE. They should scroll sideways instead.',
    type: 'bug', branch: 'fix/fav-overflow', target_date: day(0)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Dragging a card across midnight lands a day early in UTC+2',
    comment: 'Reschedule parses the drop day as UTC. Compare local midnights instead.',
    type: 'bug', target_date: day(-2)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Timeline: draw the ship date as a milestone flag',
    status: 'done', done_at: stamp(-1, 18), branch: 'feat/milestones', target_date: day(-3)
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Drag to reorder the header entries',
    status: 'done', done_at: stamp(-2, 16), branch: 'feat/header-composer'
  }),
  C('demo-stackt', 'demo-v-110', {
    title: 'Row-level security on project_groups',
    comment: 'Owner-only select / insert / update / delete, same shape as the other tables.',
    status: 'done', done_at: stamp(-4, 10), branch: 'feat/rls-groups'
  }),

  /* ---- Stackt · v1.2.0, what comes next ---- */
  C('demo-stackt', 'demo-v-120', { title: 'Weekly digest alongside the daily reminder', target_date: day(14) }),
  C('demo-stackt', 'demo-v-120', { title: 'Read-only share link for a board' }),
  C('demo-stackt', 'demo-v-120', { title: 'Import: accept Markdown checkboxes as well as bullets' }),
  C('demo-stackt', 'demo-v-120', { title: 'Offline draft for the card editor' }),
  C('demo-stackt', 'demo-v-120', { title: 'Card comments lose their line breaks in the timeline popover', type: 'bug' }),

  /* ---- Stackt · shipped work, behind the completed versions ---- */
  C('demo-stackt', 'demo-v-100', { title: 'Daily reminder email with a live preview', status: 'done', done_at: stamp(-12, 9), branch: 'feat/reminders' }),
  C('demo-stackt', 'demo-v-100', { title: 'Timeline view, with a vertical agenda on mobile', status: 'done', done_at: stamp(-15, 17) }),
  C('demo-stackt', 'demo-v-100', { title: 'Developer mode: one vocabulary switch for the whole app', status: 'done', done_at: stamp(-18, 14) }),
  C('demo-stackt', 'demo-v-100', { title: 'Paste a list, preview it, import it as cards', status: 'done', done_at: stamp(-21, 11), branch: 'feat/import' }),
  C('demo-stackt', 'demo-v-090', { title: 'Move to Next.js + Supabase with real accounts', status: 'done', done_at: stamp(-39, 20) }),
  C('demo-stackt', 'demo-v-090', { title: 'Drag a card between columns', status: 'done', done_at: stamp(-44, 15) }),

  /* ---- the other boards: enough for a count on their card ---- */
  C('demo-portfolio', 'demo-v-pf', { title: 'Case study: Stackt', status: 'inprogress', target_date: day(4) }),
  C('demo-portfolio', 'demo-v-pf', { title: 'Swap the hero type for something with more contrast', target_date: day(8) }),
  C('demo-portfolio', 'demo-v-pf', { title: 'Images served at 3x on mobile', type: 'bug' }),
  C('demo-portfolio', null, { title: 'Write the about page', status: 'done', done_at: stamp(-6) }),

  C('demo-weather', null, { title: 'Hourly forecast strip', status: 'inprogress', target_date: day(2) }),
  C('demo-weather', null, { title: 'Cache the last response for offline launches' }),
  C('demo-weather', null, { title: 'Widget shows Fahrenheit after a locale change', type: 'bug' }),

  C('demo-atelier', 'demo-v-at', { title: 'Shoot the workshop for the header', status: 'inprogress', target_date: day(1) }),
  C('demo-atelier', 'demo-v-at', { title: 'Contact form goes to the studio inbox', target_date: day(3) }),
  C('demo-atelier', 'demo-v-at', { title: 'Client cannot open the drafts page', type: 'bug', target_date: day(0) }),
  C('demo-atelier', 'demo-v-at', { title: 'Sign off the colour palette', status: 'done', done_at: stamp(-2) }),

  C('demo-mistral', 'demo-v-mi', { title: 'Menu page with the autumn card', target_date: day(9) }),
  C('demo-mistral', 'demo-v-mi', { title: 'Opening hours on the map listing', target_date: day(11) }),

  C('demo-flat', 'demo-v-fl', { title: 'Measure the worktop', status: 'inprogress', target_date: day(2) }),
  C('demo-flat', 'demo-v-fl', { title: 'Order the tiles', target_date: day(7) }),
  C('demo-flat', 'demo-v-fl', { title: 'Leak under the sink', type: 'bug', target_date: day(-1) })
];

/* Which projects head the demo board: the favorites run, then the client group. */
const HEADER_ITEMS: HeaderItem[] = [{ kind: 'favorites' }, { kind: 'group', id: 'demo-g-client' }];

export interface DemoData {
  projects: BoardProject[];
  groups: ProjectGroup[];
  versions: Version[];
  cards: Card[];
  assignees: CardAssignee[];
  comments: CardComment[];
  headerItems: HeaderItem[];
}

const ASSIGNEES: CardAssignee[] = [
  { card_id: 'demo-card-1', project_id: 'demo-stackt', user_id: DEMO_USER.id, created_at: '2026-01-04T09:00:00Z' },
  { card_id: 'demo-card-1', project_id: 'demo-stackt', user_id: 'demo-mate-1', created_at: '2026-01-04T09:00:00Z' },
  { card_id: 'demo-card-7', project_id: 'demo-stackt', user_id: 'demo-mate-2', created_at: '2026-01-04T09:00:00Z' }
];

const COMMENTS: CardComment[] = [
  { id: 'demo-comment-1', card_id: 'demo-card-1', project_id: 'demo-stackt', user_id: 'demo-mate-1', body: '@demo@stackt.app can you confirm the band heading copy before I merge?', created_at: '2026-01-05T10:00:00Z', updated_at: '2026-01-05T10:00:00Z' },
  { id: 'demo-comment-2', card_id: 'demo-card-7', project_id: 'demo-stackt', user_id: DEMO_USER.id, body: 'Repro on iPhone SE only — scrolling sideways should fix it.', created_at: '2026-01-06T10:00:00Z', updated_at: '2026-01-06T10:00:00Z' }
];

/* Fresh copies on every call — the demo is interactive, and one visit's edits
   must not leak into the next render. */
export function demoData(): DemoData {
  return {
    projects: PROJECTS.map((p) => ({ ...p })),
    groups: GROUPS.map((g) => ({ ...g })),
    versions: VERSIONS.map((v) => ({ ...v })),
    cards: CARDS.map((c) => ({ ...c })),
    assignees: ASSIGNEES.map((a) => ({ ...a })),
    comments: COMMENTS.map((c) => ({ ...c })),
    headerItems: HEADER_ITEMS.map((h) => ({ ...h }))
  };
}
