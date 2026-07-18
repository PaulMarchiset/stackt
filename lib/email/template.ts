import type { Card, Project, EmailPrefs, EmailSection } from '@/lib/types';

export interface DigestInput {
  projects: Project[]; // only the user's reminder-enabled projects
  cards: Card[];       // cards belonging to those projects
  prefs: EmailPrefs;
  today: string;       // YYYY-MM-DD in the user's reference timezone
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

/* Put each open card into exactly one bucket relative to `today`. Undated cards
   have their own bucket, so they can be included without a date. */
function bucketFor(card: Card, today: string, horizonEnd: string): EmailSection | null {
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
  overdue:  { label: 'Overdue',   accent: '#E5484D', ink: '#B4282C', tint: '#FBE7E7' },
  today:    { label: 'Due today', accent: '#E6B400', ink: '#8A6300', tint: '#FDF3D4' },
  upcoming: { label: 'Upcoming',  accent: '#4BAE6A', ink: '#356B2E', tint: '#EBF4E0' },
  undated:  { label: 'No date',   accent: '#B3B0A6', ink: '#5E5C54', tint: '#F2F0E9' }
};

/* Whole days from `a` to `b` (both YYYY-MM-DD). Negative when b precedes a. */
function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split('-').map(Number);
  const [by, bm, bd] = b.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
}

/* The urgency line under a task: how late it is, or how soon it lands. This is
   what makes the list scannable — a date alone forces the reader to do the
   arithmetic themselves. Empty for undated cards: the section already says so,
   and the row renders without a second line. */
function timingLabel(card: Card, today: string, bucket: EmailSection): string {
  if (!card.target_date) return '';
  const date = formatDigestDate(card.target_date);
  const diff = daysBetween(today, card.target_date);
  if (bucket === 'today') return `Due today · ${date}`;
  if (diff < 0) return `${date} · ${diff === -1 ? '1 day' : `${-diff} days`} late`;
  if (diff === 1) return `${date} · tomorrow`;
  return `${date} · in ${diff} days`;
}

/* One task: title on its own line, the timing beneath it. The project isn't
   repeated here — it heads the group this row sits in. The title is the only
   emphasised text in the row; everything else leans on size and colour. */
function renderCardRow(card: Card, today: string, bucket: EmailSection, first: boolean): string {
  const t = SECTION_THEME[bucket];
  const timing = timingLabel(card, today, bucket);
  const meta = timing
    ? `<div style="margin-top:3px;font-family:${FONT};font-size:11.5px;font-weight:400;line-height:1.5;color:${t.ink};">${esc(timing)}</div>`
    : '';
  return `<tr>
    <td style="padding:${first ? '0' : '9px'} 0 0 0;font-family:${FONT};">
      <div style="font-family:${FONT};font-size:14.5px;font-weight:400;line-height:1.4;color:#1B1A17;">${esc(card.title || 'Untitled')}</div>
      ${meta}
    </td>
  </tr>`;
}

/* Tasks of one project inside a section: a white block on the section's tint.
   The contrast alone separates the projects — no rules, no outlines. */
function renderProjectGroup(projectName: string, cards: Card[], today: string, bucket: EmailSection): string {
  const rows = cards.map((c, i) => renderCardRow(c, today, bucket, i === 0)).join('');
  return `<tr>
    <td style="padding:0 0 6px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:#FFFFFF;border-radius:10px;">
        <tr>
          <td style="padding:12px 14px 13px 14px;">
            <div style="font-family:${FONT};font-size:10px;font-weight:400;letter-spacing:0.11em;text-transform:uppercase;color:#97948A;padding-bottom:8px;">
              ${esc(projectName || 'Untitled project')}
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/* Group a section's cards by project, keeping the order they were sorted in
   (a project appears where its most urgent task falls). */
function groupByProject(cards: Card[], projName: Map<string, string>): { name: string; cards: Card[] }[] {
  const groups: { name: string; cards: Card[] }[] = [];
  const index = new Map<string, number>();
  for (const c of cards) {
    const at = index.get(c.project_id);
    if (at === undefined) {
      index.set(c.project_id, groups.length);
      groups.push({ name: projName.get(c.project_id) || '', cards: [c] });
    } else {
      groups[at].cards.push(c);
    }
  }
  return groups;
}

/* One bucket: a tinted panel headed by a coloured dot, the label and a count,
   holding one white block per project. */
function renderSection(bucket: EmailSection, cards: Card[], projName: Map<string, string>, today: string): string {
  const t = SECTION_THEME[bucket];
  const groups = groupByProject(cards, projName)
    .map((g) => renderProjectGroup(g.name, g.cards, today, bucket))
    .join('');
  return `<tr>
    <td style="padding:0 0 12px 0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
             style="background:${t.tint};border-radius:14px;">
        <tr>
          <td style="padding:15px 14px 9px 14px;">
            <!-- Section header -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:11px;">
              <tr>
                <td width="14" style="vertical-align:middle;padding-left:4px;">
                  <div style="width:8px;height:8px;background:${t.accent};border-radius:9999px;font-size:0;line-height:0;">&nbsp;</div>
                </td>
                <td style="vertical-align:middle;font-family:${FONT};font-size:11.5px;font-weight:400;letter-spacing:0.08em;text-transform:uppercase;color:${t.ink};">
                  ${t.label}
                </td>
                <td align="right" style="vertical-align:middle;padding-right:4px;font-family:${FONT};font-size:11.5px;font-weight:400;color:${t.ink};">
                  ${cards.length}
                </td>
              </tr>
            </table>
            <!-- One block per project -->
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${groups}</table>
          </td>
        </tr>
      </table>
    </td>
  </tr>`;
}

/* Build the reminder email for one user. Returns null when, after applying the
   user's section choices, there is nothing worth emailing about. */
export function renderDigest(input: DigestInput): { subject: string; html: string } | null {
  const { projects, cards, prefs, today } = input;
  const horizonEnd = addDays(today, Math.max(0, prefs.horizon_days));
  const projName = new Map(projects.map((p) => [p.id, p.name]));

  // Only cards from reminder-enabled projects, bucketed and kept if the user
  // asked for that section.
  const byBucket: Record<EmailSection, Card[]> = { overdue: [], today: [], upcoming: [], undated: [] };
  for (const c of cards) {
    if (!projName.has(c.project_id)) continue;
    const b = bucketFor(c, today, horizonEnd);
    if (b && prefs.sections.includes(b)) byBucket[b].push(c);
  }

  // Undated last: it's a backlog, not something due.
  const order: EmailSection[] = ['overdue', 'today', 'upcoming', 'undated'];
  const total = order.reduce((n, b) => n + byBucket[b].length, 0);
  if (total === 0) return null;

  const active = order.filter((b) => byBucket[b].length > 0);

  const blocks = active
    .map((b) => {
      const items = byBucket[b]
        // Undated cards have no date to sort on — fall back to title.
        .sort((x, y) => (b === 'undated'
          ? (x.title || '').localeCompare(y.title || '')
          : (x.target_date || '').localeCompare(y.target_date || '')));
      return renderSection(b, items, projName, today);
    })
    .join('');

  const subject = (prefs.subject && prefs.subject.trim()) || defaultSubject(today);

  /* A one-line summary, used both as the standfirst and as the inbox preview
     snippet — the reader should know the shape of the mail before opening it. */
  const projectCount = new Set(
    active.flatMap((b) => byBucket[b].map((c) => c.project_id))
  ).size;
  const summary =
    `${total} open ${total === 1 ? 'task' : 'tasks'} across ` +
    `${projectCount} ${projectCount === 1 ? 'project' : 'projects'}` +
    (byBucket.overdue.length ? ` · ${byBucket.overdue.length} overdue` : '');

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
