import type { Card, Version } from './types';
import { PALETTE } from './types';

/* Stable hash of a version label → palette index 0..5. */
export function versionTheme(v: string): number {
  const s = String(v || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
}

/* Palette index for anything that carries a name and an optional chosen colour —
   a version or a project group. Structural on purpose: both follow the same rule
   (an explicit choice, else the stable hash), and one rule deserves one function. */
export type Tinted = { name: string; color_index: number | null };

export function versionColor(ver?: Tinted | null): number | null {
  if (!ver) return null;
  return ver.color_index ?? versionTheme(ver.name);
}

/* A project's versions in display order (position, then numeric name). */
export function sortVersions(list: Version[]): Version[] {
  return list.slice().sort((a, b) =>
    a.position - b.position ||
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
}

/* Completed versions, most recently completed FIRST — so the one you just closed
   sits leftmost in the version bar and the oldest trails off to the right.
   Versions completed before completed_at existed (or by an older client) carry no
   stamp; they fall back to newest-created first and sit after the stamped ones. */
export function sortCompletedVersions(list: Version[]): Version[] {
  return list.slice().sort((a, b) =>
    (b.completed_at || '').localeCompare(a.completed_at || '') ||
    b.position - a.position);
}

/* The reminder cron is scheduled at 08:00 **UTC** (see vercel.json), and Vercel
   only guarantees it fires within the hour — so the mail lands in a one-hour
   window, not at a precise time. */
export const CRON_UTC_HOUR = 8;
export const CRON_WINDOW_HOURS = 1;

/* Every date the UI prints is formatted with THIS locale, never the ambient one.
   Passing `undefined` as the locale asks the runtime for its default, and the
   runtime is a different machine on each side of a render: Node formats the
   server pass, the browser formats the hydration pass. A French browser against
   an English server turns "9 Sept" into "9 sept.", React sees text it did not
   expect, hydration fails, and — because the failure is outside a Suspense
   boundary — the whole page falls back to client rendering with no event
   handlers attached. The board looks perfectly normal and no button works.

   Pinning it makes both passes agree. en-GB matches sendWindow below and the
   reminder email, which spells its months out for exactly the same reason. */
export const DATE_LOCALE = 'en-GB';

/* The device's own timezone, e.g. "Europe/Paris". */
export function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}

/* The cron's send window rendered in `tz`, e.g. { from: '10:00', to: '11:00' }.
   Anchored to `ref`'s UTC date so DST is applied for the right day. */
export function sendWindow(tz: string, ref: Date = new Date()): { from: string; to: string } {
  const fmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
  });
  const at = (hour: number) =>
    fmt.format(new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate(), hour)));
  return { from: at(CRON_UTC_HOUR), to: at(CRON_UTC_HOUR + CRON_WINDOW_HOURS) };
}

export function todayISO(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* "3 Mar → 7 Mar 2025" for a multi-day card; falls back to a single date. */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end || end <= start) return formatDate(start);
  const s = start.split('-').map(Number), e = end.split('-').map(Number);
  const sd = new Date(s[0], s[1] - 1, s[2]);
  const ed = new Date(e[0], e[1] - 1, e[2]);
  const sameYear = s[0] === e[0];
  const left = sd.toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const right = ed.toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left} → ${right}`;
}

/* "15 Sep" — the compact form used on a version chip, where a full date would
   double the pill's width. */
export function formatDateShort(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(DATE_LOCALE, { month: 'short', day: 'numeric' });
}

/* A version's ship date, classified for display: 'late' once the day has passed
   with the version still open, 'soon' inside three days, '' otherwise. A
   completed version's date is history, so it never reads as late. */
export function shipClass(ver: Version, today = todayISO()): string {
  if (!ver.ship_date || ver.completed) return '';
  if (ver.ship_date < today) return 'late';
  const days = Math.round((Date.parse(ver.ship_date) - Date.parse(today)) / 86400000);
  return days <= 3 ? 'soon' : '';
}

/* '', 'overdue', 'soon', or 'none' for date pill styling. */
export function dateClass(card: Card): string {
  if (card.done) return '';
  if (!card.target_date) return 'none';
  const today = todayISO();
  if (card.target_date < today) return 'overdue';
  const t = new Date(card.target_date).getTime();
  const n = new Date(today).getTime();
  const days = Math.round((t - n) / 86400000);
  return days <= 3 ? 'soon' : '';
}

export function sortByDate(cards: Card[]): Card[] {
  return cards.slice().sort((a, b) => {
    const da = a.target_date || '9999-12-31';
    const db = b.target_date || '9999-12-31';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/* Kanban column order: unresolved bugs first, then overdue, then by date (undated last).
   Pass `byCompletion` for the Done column: most recently checked first, so the card you
   just ticked lands on top. Cards closed before done_at existed (or by an older client)
   carry no stamp and sit underneath. */
export function sortCards(cards: Card[], byCompletion = false): Card[] {
  if (byCompletion) {
    return cards.slice().sort((a, b) => (b.done_at || '').localeCompare(a.done_at || ''));
  }
  const today = todayISO();
  const rank = (c: Card) =>
    c.type === 'bug' && !c.done ? 0
      : (!c.done && c.target_date && c.target_date < today ? 1 : 2);
  return cards.slice().sort((a, b) => {
    const r = rank(a) - rank(b);
    if (r) return r;
    const da = a.target_date || '9999-12-31';
    const db = b.target_date || '9999-12-31';
    return da < db ? -1 : da > db ? 1 : 0;
  });
}

/* Build a browsable URL for a card's branch from the project's repo URL.
   Returns null if either piece is missing. Detects GitHub/GitLab/Bitbucket path styles. */
export function branchUrl(repoUrl: string, branch: string): string | null {
  const repo = (repoUrl || '').trim().replace(/\/+$/, '');
  const b = (branch || '').trim();
  if (!repo || !b) return null;
  const base = /^https?:\/\//i.test(repo) ? repo : 'https://' + repo;
  const path = b.split('/').map(encodeURIComponent).join('/'); // keep slashes in branch names
  if (/gitlab\./i.test(base)) return `${base}/-/tree/${path}`;
  if (/bitbucket\./i.test(base)) return `${base}/branch/${path}`;
  return `${base}/tree/${path}`; // GitHub + most others
}

/* Short "org/repo" (or hostname) label for a repo URL, for a compact chip. */
export function repoLabel(repoUrl: string): string {
  const raw = (repoUrl || '').trim();
  if (!raw) return '';
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : 'https://' + raw);
    const p = u.pathname.replace(/^\/+|\/+$/g, '').replace(/\.git$/, '');
    return p || u.hostname;
  } catch {
    return raw;
  }
}

/* Bump the patch of the highest vX.Y.Z, else v1.0.0. */
export function suggestNextVersion(versions: string[]): string {
  const semver = versions
    .map((v) => /^v?(\d+)\.(\d+)\.(\d+)$/.exec(v))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => [+m[1], +m[2], +m[3]] as [number, number, number]);
  if (!semver.length) return 'v1.0.0';
  semver.sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2]);
  const [maj, min] = semver[semver.length - 1];
  return 'v' + maj + '.' + (min + 1) + '.0';
}
