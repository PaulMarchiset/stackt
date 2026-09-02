import type { Card, Project, EmailPrefs, EmailSection, Version } from '@/lib/types';

export interface DigestInput {
  /* Ids only. Reminders became per-member with the collaborative work, so
     "your reminder projects" is a set this reader opted into, not a set they
     own — and since the digest reports counts, the names are never read. */
  projectIds: string[];
  cards: Card[];       // cards belonging to those projects
  versions?: Version[]; // versions of those projects — only ship dates are read
  prefs: EmailPrefs;
  today: string;       // YYYY-MM-DD in the user's reference timezone
}

/* The weekday the reminder would be sent on, 0 = Sunday, from the digest's own
   reference date. The cron and the settings preview both read it, so "will this
   send today?" has one answer, not two. */
export function weekdayOf(today: string): number {
  const [y, m, d] = today.split('-').map(Number);
  return new Date(y, m - 1, d).getDay();
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

/* 1 → "1st", 22 → "22nd", 13 → "13th". */
function ordinal(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  return n + (['th', 'st', 'nd', 'rd'][n % 10] || 'th');
}

/* "2026-07-15" → "15th July". Spelled out rather than locale-formatted on
   purpose: this string is rendered by the cron on the server and previewed in
   the browser, and both must produce the same text. */
export function formatDigestDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d || m < 1 || m > 12) return iso;
  return `${ordinal(d)} ${MONTHS[m - 1]}`;
}

/* The subject used when the user hasn't set one. Exported so the settings
   preview can show the very same default instead of duplicating the wording. */
export function defaultSubject(today: string): string {
  return `Stackt reminder — ${formatDigestDate(today)}`;
}

/* The placeholders a custom subject may use, in the order the settings screen
   lists them. Only counts and the date: the same rule the body follows, so a
   subject can't smuggle out what the digest deliberately leaves behind. */
export const SUBJECT_TOKENS = ['date', 'total', 'overdue', 'today', 'milestones'] as const;
export type SubjectToken = (typeof SUBJECT_TOKENS)[number];

/* Substitute {token} in a user-written subject. An unknown token is left as
   typed rather than blanked — a literal "{foo}" in the inbox tells the user
   they got the name wrong, an empty gap doesn't.

   Newlines are stripped: the value ends up in a mail header, and a subject
   that can carry CR/LF is a header-injection primitive waiting for a provider
   that concatenates instead of encoding. */
export function expandSubject(
  raw: string | null | undefined,
  values: Record<SubjectToken, string>,
  today: string
): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return defaultSubject(today);
  const expanded = trimmed.replace(/\{(\w+)\}/g, (whole, name: string) =>
    (SUBJECT_TOKENS as readonly string[]).includes(name) ? values[name as SubjectToken] : whole
  );
  return expanded.replace(/[\r\n]+/g, ' ').trim() || defaultSubject(today);
}

/* Escape user-supplied text before dropping it into HTML. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

/* The sections a *card* can land in. 'milestones' is the one section built from
   versions instead, so it is deliberately not part of this union. */
export type CardSection = Exclude<EmailSection, 'milestones'>;

/* Put each open card into exactly one bucket relative to `today`. Undated cards
   have their own bucket, so they can be included without a date. */
function bucketFor(card: Card, today: string, horizonEnd: string): CardSection | null {
  if (card.done) return null;
  if (!card.target_date) return 'undated';
  if (card.target_date < today) return 'overdue';
  if (card.target_date === today) return 'today';
  if (card.target_date <= horizonEnd) return 'upcoming';
  return null; // beyond the horizon
}

const APP_URL = 'https://stackt.paulmarchiset.me';
const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/* Per-section presentation. Labels mirror EMAIL_SECTIONS in lib/types.ts (the
   same buckets, named in the settings UI); the colours are the board's, so a
   section reads the same in the mail as on screen. */
const SECTION_THEME: Record<EmailSection, {
  label: string; accent: string; ink: string; tint: string;
}> = {
  overdue:    { label: 'Overdue',    accent: '#E5484D', ink: '#B4282C', tint: '#FBE7E7' },
  today:      { label: 'Due today',  accent: '#E6B400', ink: '#8A6300', tint: '#FDF3D4' },
  upcoming:   { label: 'Upcoming',   accent: '#4BAE6A', ink: '#356B2E', tint: '#EBF4E0' },
  undated:    { label: 'No date',    accent: '#B3B0A6', ink: '#5E5C54', tint: '#F2F0E9' },
  milestones: { label: 'Milestones', accent: '#845EF7', ink: '#5B43B5', tint: '#EDE7FD' }
};

/* Whole days from `a` to `b` (both YYYY-MM-DD). Negative when b precedes a. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/* ---------------------------------------------------------------------------
   Rendering — counts, never content.
   ---------------------------------------------------------------------------
   This digest deliberately carries no task title, no project name and no
   version name. Reason: the mail leaves our infrastructure. It sits in a
   mailbox for years, gets indexed by the provider, shows up on a lock screen,
   and passes through a third-party sender (Brevo) that keeps it in its logs.
   A count tells you to open the board; a title tells everyone else what you
   are working on. Only the first of those is worth the exposure.

   Dates are the one exception, and they earn it: "3 overdue, oldest 12th
   August" is genuinely actionable and reveals nothing about the work itself.
   --------------------------------------------------------------------------- */

/* The date hint beside a count. Nothing for 'today' (the label already says
   it) and nothing for 'undated' (there is no date to speak of). */
function sectionHint(bucket: EmailSection, dates: string[], today: string): string {
  if (bucket === 'today' || bucket === 'undated' || dates.length === 0) return '';
  const sorted = [...dates].sort();

  if (bucket === 'overdue') {
    const oldest = sorted[0];
    const late = -daysBetween(today, oldest);
    return `oldest ${formatDigestDate(oldest)} · ${late === 1 ? '1 day' : `${late} days`} late`;
  }

  // 'upcoming' and 'milestones' both look forward — the nearest one leads.
  const nearest = sorted[0];
  const diff = daysBetween(today, nearest);
  if (diff === 0) return `next today`;
  if (diff === 1) return `next tomorrow`;
  return `next in ${diff} days`;
}

/* One line: a coloured dot, the bucket's name, an optional date hint, and the
   count hard right. Every row shares the same grid so the numbers line up. */
function renderCountRow(bucket: EmailSection, count: number, hint: string, first: boolean): string {
  const t = SECTION_THEME[bucket];
  const hintCell = hint
    ? `<div style="margin-top:2px;font-family:${FONT};font-size:11.5px;font-weight:400;line-height:1.45;color:${t.ink};">${esc(hint)}</div>`
    : '';
  return `<tr>
    <td style="padding:${first ? '0' : '14px'} 0 0 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
        <tr>
          <td width="16" style="vertical-align:top;padding-top:6px;">
            <div style="width:8px;height:8px;background:${t.accent};border-radius:9999px;font-size:0;line-height:0;">&nbsp;</div>
          </td>
          <td style="vertical-align:top;font-family:${FONT};">
            <div style="font-family:${FONT};font-size:14.5px;font-weight:500;line-height:1.35;color:#1B1A17;">${t.label}</div>
            ${hintCell}
          </td>
          <td align="right" style="vertical-align:top;font-family:${FONT};font-size:21px;font-weight:700;line-height:1.1;color:${t.ink};">
            ${count}
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/* The single panel holding every active bucket. One block, not five: with a
   number per section there simply isn't enough content to justify more. */
function renderPanel(rows: string): string {
  return `<tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#F2F0E9;border-radius:14px;">
        <tr>
          <td style="padding:18px 18px 20px 18px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/* Build the reminder email for one user. Returns null when, after applying the
   user's section choices, there is nothing worth emailing about. */
export function renderDigest(input: DigestInput): { subject: string; html: string } | null {
  const { projectIds, cards, prefs, today } = input;
  const horizonEnd = addDays(today, Math.max(0, prefs.horizon_days));
  /* A Set of ids: the digest reports counts, so no project name is ever read.
     Kept explicit here rather than left to a comment further down. */
  const inScope = new Set(projectIds);

  /* Milestones in range: still open, and either already past (those matter most)
     or landing inside the horizon. */
  const milestones = prefs.sections.includes('milestones')
    ? (input.versions || [])
      .filter((v) => v.ship_date && !v.completed && inScope.has(v.project_id) && v.ship_date <= horizonEnd)
      .sort((a, b) => (a.ship_date || '').localeCompare(b.ship_date || ''))
    : [];

  // Only cards from reminder-enabled projects, bucketed and kept if the user
  // asked for that section.
  // 'milestones' isn't a card bucket — it comes from versions, not cards.
  const byBucket: Record<CardSection, Card[]> = { overdue: [], today: [], upcoming: [], undated: [] };
  for (const c of cards) {
    if (!inScope.has(c.project_id)) continue;
    const b = bucketFor(c, today, horizonEnd);
    if (b && prefs.sections.includes(b)) byBucket[b].push(c);
  }

  // Undated last: it's a backlog, not something due.
  const order: CardSection[] = ['overdue', 'today', 'upcoming', 'undated'];
  const total = order.reduce((n, b) => n + byBucket[b].length, 0);
  if (total === 0 && milestones.length === 0) return null;

  const active = order.filter((b) => byBucket[b].length > 0);

  /* Milestones lead: a ship date is the frame the rest sits in. Each bucket
     becomes one row — a count and a date hint, never a name or a title. */
  let rowIndex = 0;
  const row = (bucket: EmailSection, count: number, dates: string[]) =>
    renderCountRow(bucket, count, sectionHint(bucket, dates, today), rowIndex++ === 0);

  const rows =
    (milestones.length
      ? row('milestones', milestones.length, milestones.map((v) => v.ship_date as string))
      : '') +
    active
      .map((b) => row(b, byBucket[b].length, byBucket[b].flatMap((c) => (c.target_date ? [c.target_date] : []))))
      .join('');

  const blocks = renderPanel(rows);

  const subject = expandSubject(prefs.subject, {
    date: formatDigestDate(today),
    total: String(total),
    overdue: String(byBucket.overdue.length),
    today: String(byBucket.today.length),
    milestones: String(milestones.length)
  }, today);

  /* A one-line summary, used both as the standfirst and as the inbox preview
     snippet. Counts only — this string lands in the notification on a lock
     screen, which is the least private surface the mail ever touches. */
  const summary =
    `${total} open ${total === 1 ? 'task' : 'tasks'}` +
    (byBucket.overdue.length ? ` · ${byBucket.overdue.length} overdue` : '') +
    (milestones.length ? ` · ${milestones.length} milestone${milestones.length === 1 ? '' : 's'}` : '');

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(subject)}</title>
</head>
<body style="margin:0;padding:0;background-color:#F6F4EC;font-family:${FONT};">
<!-- Inbox preview snippet, then blanks so the body copy doesn't bleed into it -->
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;font-family:${FONT};">${esc(summary)}</div>
<div style="display:none;max-height:0;overflow:hidden;">${'&#8203;&nbsp;'.repeat(30)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F4EC;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background:#FFFFFF;border-radius:18px;overflow:hidden;">
        <!-- Header — logo rebuilt in HTML so it always renders (no image to block) -->
        <tr>
          <td style="padding:32px 32px 0 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="vertical-align:middle;padding-right:11px;">
                  <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                    <tr><td width="30" align="right"><div style="width:30px;height:7px;background:#E58E36;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                    <tr><td height="2" style="font-size:0;line-height:2px;">&nbsp;</td></tr>
                    <tr><td width="30" align="right"><div style="width:22px;height:7px;background:#4B73F5;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                    <tr><td height="2" style="font-size:0;line-height:2px;">&nbsp;</td></tr>
                    <tr><td width="30" align="right"><div style="width:16px;height:7px;background:#2CBE3D;border-radius:2px;font-size:0;line-height:0;">&nbsp;</div></td></tr>
                  </table>
                </td>
                <td style="vertical-align:middle;font-family:${FONT};font-size:22px;font-weight:700;letter-spacing:-0.5px;color:#1B1A17;">
                  Stackt
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Standfirst: the date, then what's waiting -->
        <tr>
          <td style="padding:22px 32px 18px 32px;font-family:${FONT};">
            <h1 style="margin:0;font-family:${FONT};font-size:21px;font-weight:700;line-height:1.25;color:#1B1A17;letter-spacing:-0.4px;">Your reminder · ${esc(formatDigestDate(today))}</h1>
            <p style="margin:7px 0 0 0;font-family:${FONT};font-size:13px;font-weight:400;line-height:1.5;color:#5E5C54;">${esc(summary)}</p>
          </td>
        </tr>

        <!-- Sections -->
        <tr>
          <td style="padding:0 32px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${blocks}</table>
          </td>
        </tr>

        <!-- Call to action -->
        <tr>
          <td align="center" style="padding:10px 32px 4px 32px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="#FFD43B" style="border-radius:9999px;">
                  <a href="${APP_URL}/board" style="display:inline-block;padding:12px 26px;font-family:${FONT};font-size:14px;font-weight:600;color:#1B1A17;text-decoration:none;border-radius:9999px;">Open your board</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Divider + footer -->
        <tr>
          <td style="padding:24px 32px 28px 32px;">
            <div style="height:1px;background:#ECEAE1;font-size:0;line-height:0;">&nbsp;</div>
            <p style="margin:16px 0 0 0;font-family:${FONT};font-size:11.5px;font-weight:400;line-height:1.6;color:#97948A;">
              Don't want to receive these emails? You can manage your reminder preferences in your <a href="${APP_URL}/settings" style="font-family:${FONT};color:#4B73F5;text-decoration:none;">Settings</a>.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:18px 0 0 0;font-family:${FONT};font-size:11px;font-weight:400;color:#B3B0A6;">Stackt · Plan and track your updates</p>
    </td>
  </tr>
</table>
</body>
</html>`;

  return { subject, html };
}
