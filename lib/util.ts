import type { Card, Project } from './types';
import { PALETTE } from './types';

/* Stable hash of a version label → palette index 0..5. */
export function versionTheme(v: string): number {
  const s = String(v || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % PALETTE.length;
}

/* Chosen color for a version, else the stable hash. */
export function versionColorIndex(project: Project, v: string): number | null {
  if (!v) return null;
  const map = project.version_colors || {};
  if (Object.prototype.hasOwnProperty.call(map, v)) return map[v];
  return versionTheme(v);
}

/* All versions for a project: explicit list ∪ versions used by its cards. */
export function projectVersions(project: Project, cards: Card[]): string[] {
  const set = new Set<string>(project.versions || []);
  cards.forEach((c) => { if (c.version) set.add(c.version); });
  return Array.from(set).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
}

export function isVersionCompleted(project: Project, v: string): boolean {
  return !!(project.completed_versions && project.completed_versions.includes(v));
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
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/* "Mar 3 → Mar 7, 2025" for a multi-day card; falls back to a single date. */
export function formatDateRange(start: string | null, end: string | null): string {
  if (!start || !end || end <= start) return formatDate(start);
  const s = start.split('-').map(Number), e = end.split('-').map(Number);
  const sd = new Date(s[0], s[1] - 1, s[2]);
  const ed = new Date(e[0], e[1] - 1, e[2]);
  const sameYear = s[0] === e[0];
  const left = sd.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
  const right = ed.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  return `${left} → ${right}`;
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
