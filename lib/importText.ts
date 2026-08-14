import type { CardType } from './types';

/**
 * Bullet-list → cards.
 *
 * A pure parser, deliberately kept away from React and Supabase: the import
 * dialog previews exactly what this returns, and the writer creates exactly
 * what the preview showed. One grammar, one implementation, no second guess.
 *
 * Grammar (documented for the user in ImportDialog):
 *
 *   [v1.2.0]              opens a version block — everything under it lands there
 *   - Task title          a task (also *, •, –, —, +, or "1." / "1)")
 *   - Task title 15/09    a trailing date  (dd/mm · dd/mm/yyyy · yyyy-mm-dd)
 *   - Task 15/09 → 18/09  a trailing range → start and end date
 *   - ! Task title        a leading or trailing "!" marks it as a bug / urgent
 *
 * Tasks written before any [version] carry no version. Anything that is neither
 * a header nor a bullet is reported as skipped rather than silently dropped —
 * a paste that half-worked in silence is worse than one that says what it ignored.
 */

export interface ImportTask {
  line: number;              // 1-based source line, so the preview can point at it
  title: string;
  date: string | null;       // YYYY-MM-DD
  endDate: string | null;    // YYYY-MM-DD, only with an explicit range
  type: CardType;
}

export interface ImportBlock {
  version: string | null;    // null = "no version"
  tasks: ImportTask[];
}

export interface ImportSkip {
  line: number;
  text: string;
  reason: string;
}

export interface ImportResult {
  blocks: ImportBlock[];
  skipped: ImportSkip[];
  taskCount: number;
}

const BULLET = /^\s*(?:[-*+•–—]|\d{1,3}[.)])\s+/;
const HEADER = /^\s*\[(.*)\]\s*$/;

/* One date token: ISO, or day/month with an optional year. */
const DATE = String.raw`\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?`;
const RANGE_RE = new RegExp(String.raw`\s+@?(${DATE})\s*(?:->|=>|→|\.\.\.?|…)\s*@?(${DATE})\s*$`);
const SINGLE_RE = new RegExp(String.raw`\s+@?(${DATE})\s*$`);

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Resolve one date token to YYYY-MM-DD, or null if it isn't a real day.
 *
 * A `dd/mm` with no year is read as **the current year** — flatly, with no
 * cleverness about rolling forward. Guessing the year from how the date sits
 * against today would silently move half an imported backlog into next year;
 * a rule the reader can state in one sentence is worth more than a rule that is
 * right slightly more often. The preview shows the resolved date either way.
 *
 * Day-first (`15/09` = 15 September) — same reading as the Monday-first
 * calendar the rest of the app uses.
 */
export function resolveDate(token: string, year = new Date().getFullYear()): string | null {
  let y: number, m: number, d: number;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(token);
  if (iso) {
    [y, m, d] = [+iso[1], +iso[2], +iso[3]];
  } else {
    const slash = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?$/.exec(token);
    if (!slash) return null;
    d = +slash[1];
    m = +slash[2];
    y = slash[3] ? (slash[3].length <= 2 ? 2000 + +slash[3] : +slash[3]) : year;
  }
  if (m < 1 || m > 12 || d < 1) return null;
  const dim = new Date(y, m, 0).getDate();   // day 0 of next month = last of this one
  if (d > dim) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

/* Pull a trailing date or date range off a task title. Returns the title
   unchanged when nothing valid is there — a title is never mangled on a guess. */
function takeDates(text: string, year: number): { title: string; date: string | null; endDate: string | null } {
  const range = RANGE_RE.exec(text);
  if (range) {
    const a = resolveDate(range[1], year);
    const b = resolveDate(range[2], year);
    if (a && b) return { title: text.slice(0, range.index).trim(), date: a, endDate: b > a ? b : null };
  }
  const one = SINGLE_RE.exec(text);
  if (one) {
    const a = resolveDate(one[1], year);
    if (a) return { title: text.slice(0, one.index).trim(), date: a, endDate: null };
  }
  return { title: text.trim(), date: null, endDate: null };
}

/* "!" on either end means urgent. Stripped from the title once recognised. */
function takeType(text: string): { text: string; type: CardType } {
  let t = text.trim();
  let bug = false;
  if (/^!+\s*/.test(t)) { t = t.replace(/^!+\s*/, ''); bug = true; }
  if (/\s*!+$/.test(t)) { t = t.replace(/\s*!+$/, ''); bug = true; }
  return { text: t.trim(), type: bug ? 'bug' : 'update' };
}

export function parseImport(text: string, year = new Date().getFullYear()): ImportResult {
  const blocks: ImportBlock[] = [];
  const skipped: ImportSkip[] = [];
  let current: ImportBlock | null = null;

  const blockFor = (version: string | null): ImportBlock => {
    // Re-opening the same [version] later in the paste appends to it rather than
    // creating a second block that would collide on the unique (project, name).
    const found = blocks.find((b) => (b.version ?? '') === (version ?? ''));
    if (found) return found;
    const made: ImportBlock = { version, tasks: [] };
    blocks.push(made);
    return made;
  };

  text.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    if (!raw.trim()) return;                       // blank lines are just spacing

    const header = HEADER.exec(raw);
    if (header) {
      const name = header[1].trim();
      current = blockFor(name || null);            // "[]" means "back to no version"
      return;
    }

    if (!BULLET.test(raw)) {
      skipped.push({ line, text: raw.trim(), reason: 'not a bullet or a [version]' });
      return;
    }

    const { text: typed, type } = takeType(raw.replace(BULLET, ''));
    const { title, date, endDate } = takeDates(typed, year);
    if (!title) {
      skipped.push({ line, text: raw.trim(), reason: 'no title' });
      return;
    }
    if (!current) current = blockFor(null);   // bullets before any [version]
    const target: ImportBlock = current;
    target.tasks.push({ line, title, date, endDate, type });
  });

  // A [version] header with nothing under it creates no version — it was a
  // heading the user never filled in.
  const kept = blocks.filter((b) => b.tasks.length > 0);
  return { blocks: kept, skipped, taskCount: kept.reduce((n, b) => n + b.tasks.length, 0) };
}
