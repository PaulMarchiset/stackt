import type { Card, Project, EmailPrefs, EmailSection } from '@/lib/types';

export interface DigestInput {
  projects: Project[]; // only the user's reminder-enabled projects
  cards: Card[];       // cards belonging to those projects
  prefs: EmailPrefs;
  today: string;       // YYYY-MM-DD in the user's reference timezone
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

const SECTION_TITLES: Record<EmailSection, string> = {
  overdue: '🔴 En retard',
  today: "🟡 Dus aujourd'hui",
  upcoming: '🟢 À venir'
};

function renderCardLine(card: Card, projectName: string): string {
  const date = card.target_date ? ` <span style="color:#888">— ${esc(card.target_date)}</span>` : '';
  const proj = `<span style="color:#888;font-size:12px"> · ${esc(projectName)}</span>`;
  return `<li style="margin:4px 0">${esc(card.title || 'Sans titre')}${date}${proj}</li>`;
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

  const subject = (prefs.subject && prefs.subject.trim()) || `Rappel Stackt — ${today}`;

  const html = `<!doctype html>
<html><body style="margin:0;background:#f6f7f9;padding:24px 0;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:28px 32px">
    <div style="font-weight:700;font-size:18px;margin-bottom:4px">Stackt</div>
    <div style="color:#888;font-size:13px;margin-bottom:8px">Ton rappel du ${esc(today)}</div>
    ${blocks}
    <div style="margin-top:28px;border-top:1px solid #eee;padding-top:14px;color:#aaa;font-size:12px">
      Tu reçois ce mail car tu as activé les rappels. Gère-les dans Réglages.
    </div>
  </div>
</body></html>`;

  return { subject, html };
}
