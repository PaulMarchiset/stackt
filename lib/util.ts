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
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString().slice(0, 10);
}

export function formatDate(iso: string | null): string {
  if (!iso) return 'No date';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
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
