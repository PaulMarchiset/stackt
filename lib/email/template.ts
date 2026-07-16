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

/* Put each open, dated card into exactly one bucket relative to `today`. */
function bucketFor(card: Card, today: string, horizonEnd: string): EmailSection | null {
  if (card.done || !card.target_date) return null;
  if (card.target_date < today) return 'overdue';
  if (card.target_date === today) return 'today';
  if (card.target_date <= horizonEnd) return 'upcoming';
  return null; // beyond the horizon
}

/* Mirrors EMAIL_SECTIONS in lib/types.ts, which labels the same buckets in the
   settings UI — keep the wording in step. */
const SECTION_TITLES: Record<EmailSection, string> = {
  overdue: '🔴 Overdue',
  today: '🟡 Due today',
  upcoming: '🟢 Upcoming'
};

function renderCardLine(card: Card, projectName: string): string {
  const date = card.target_date
    ? ` <span style="color:#888">— ${esc(formatDigestDate(card.target_date))}</span>`
    : '';
  const proj = `<span style="color:#888;font-size:12px"> · ${esc(projectName)}</span>`;
  return `<li style="margin:4px 0">${esc(card.title || 'Untitled')}${date}${proj}</li>`;
}

/* Build the reminder email for one user. Returns null when, after applying the
   user's section choices, there is nothing worth emailing about. */
export function renderDigest(input: DigestInput): { subject: string; html: string } | null {
  const { projects, cards, prefs, today } = input;
  const horizonEnd = addDays(today, Math.max(0, prefs.horizon_days));
  const projName = new Map(projects.map((p) => [p.id, p.name]));

  // Only cards from reminder-enabled projects, bucketed and kept if the user
  // asked for that section.
  const byBucket: Record<EmailSection, Card[]> = { overdue: [], today: [], upcoming: [] };
  for (const c of cards) {
    if (!projName.has(c.project_id)) continue;
    const b = bucketFor(c, today, horizonEnd);
    if (b && prefs.sections.includes(b)) byBucket[b].push(c);
  }

  const order: EmailSection[] = ['overdue', 'today', 'upcoming'];
  const total = order.reduce((n, b) => n + byBucket[b].length, 0);
  if (total === 0) return null;

  const blocks = order
    .filter((b) => byBucket[b].length > 0)
    .map((b) => {
      const items = byBucket[b]
        .sort((x, y) => (x.target_date || '').localeCompare(y.target_date || ''))
        .map((c) => renderCardLine(c, projName.get(c.project_id) || ''))
        .join('');
      return `<h3 style="margin:20px 0 6px;font-size:15px">${SECTION_TITLES[b]}</h3>
        <ul style="margin:0;padding-left:20px">${items}</ul>`;
    })
    .join('');

  const subject = (prefs.subject && prefs.subject.trim()) || defaultSubject(today);

  const html = `<!doctype html>
<html><body><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#F6F4EC;margin:0;padding:0;">
  <tr>
    <td align="center" style="padding:40px 16px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:480px;background:#FFFFFF;border-radius:18px;overflow:hidden;">
        <!-- Header — logo rebuilt in HTML so it always renders (no image to block) -->
        <tr>
          <td style="padding:32px 36px 8px 36px;">
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
                <td style="vertical-align:middle;font-family:'Helvetica Neue',Arial,sans-serif;font-size:22px;font-weight:800;letter-spacing:-0.5px;color:#1B1A17;">
                  Stackt
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:18px 36px 4px 36px;font-family:'Helvetica Neue',Arial,sans-serif;">
            <h1 style="margin:0 0 10px 0;font-size:21px;font-weight:800;color:#1B1A17;letter-spacing:-0.4px;">Your reminder of the ${esc(formatDigestDate(today))}</h1>
            <p style="margin:0;font-size:14.5px;line-height:1.6;color:#5E5C54;">
              ${blocks}
            </p>
          </td>
        </tr>
        <!-- Divider + footer -->
        <tr>
          <td style="padding:26px 36px 30px 36px;">
            <div style="height:1px;background:#ECEAE1;font-size:0;line-height:0;">&nbsp;</div>
            <p style="margin:18px 0 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11.5px;line-height:1.6;color:#97948A;">
              Don't want to receive these emails? You can manage your reminder preferences in your <a href="https://stackt.paulmarchiset.me/settings" style="color:#4B73F5;text-decoration:none;">Settings</a>.
            </p>
          </td>
        </tr>
      </table>

      <p style="margin:18px 0 0 0;font-family:'Helvetica Neue',Arial,sans-serif;font-size:11px;color:#B3B0A6;">Stackt · Plan and track your updates</p>
    </td>
  </tr>
</table><html><body>`;

  return { subject, html };
}
