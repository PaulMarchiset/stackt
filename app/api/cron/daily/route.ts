import { NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/email/sender';
import { renderDigest } from '@/lib/email/template';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_EMAIL_PREFS, type Card, type EmailPrefs, type Project } from '@/lib/types';

// Cron target, invoked daily by Vercel (see vercel.json).
// Runs on the Node.js runtime so provider SDKs / fetch behave predictably.
export const runtime = 'nodejs';
// Never cache a cron endpoint.
export const dynamic = 'force-dynamic';
// Allow up to 60s for larger sends (Vercel Hobby cap).
export const maxDuration = 60;

/* Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the
   CRON_SECRET env var is set. We reject anyone who doesn't present it, so the
   URL can't be triggered by the public. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true; // no secret configured (e.g. local dev) → allow
  return request.headers.get('authorization') === `Bearer ${secret}`;
}

/* Today in Europe/Paris, as YYYY-MM-DD (en-CA gives ISO-style parts). */
function parisToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date());
}

function prefsFor(userId: string, row: Partial<EmailPrefs> | undefined): EmailPrefs {
  return {
    user_id: userId,
    enabled: row?.enabled ?? DEFAULT_EMAIL_PREFS.enabled,
    subject: row?.subject ?? DEFAULT_EMAIL_PREFS.subject,
    horizon_days: row?.horizon_days ?? DEFAULT_EMAIL_PREFS.horizon_days,
    sections: row?.sections ?? DEFAULT_EMAIL_PREFS.sections
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const email = getEmailProvider();
  const today = parisToday();

  // 1. All reminder-enabled projects, grouped by owner.
  const { data: projects, error: pErr } = await db
    .from('projects')
    .select('id, user_id, name, remind')
    .eq('remind', true);
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 });
  if (!projects || projects.length === 0) {
    return NextResponse.json({ ok: true, users: 0, sent: 0, note: 'no reminder projects' });
  }

  const projectIds = projects.map((p) => p.id);

  // 2. Open, dated cards for those projects.
  const { data: cards, error: cErr } = await db
    .from('cards')
    .select('id, project_id, title, target_date, done')
    .in('project_id', projectIds)
    .eq('done', false)
    .not('target_date', 'is', null);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // 3. Per-user preferences (a missing row means defaults).
  const userIds = Array.from(new Set(projects.map((p) => p.user_id as string)));
  const { data: prefRows } = await db
    .from('email_prefs')
    .select('user_id, enabled, subject, horizon_days, sections')
    .in('user_id', userIds);
  const prefsByUser = new Map((prefRows || []).map((r) => [r.user_id as string, r]));

  // Index projects and cards by user.
  const projByUser = new Map<string, Project[]>();
  for (const p of projects) {
    const arr = projByUser.get(p.user_id) || [];
    arr.push(p as unknown as Project);
    projByUser.set(p.user_id, arr);
  }
  const cardsByUser = new Map<string, Card[]>();
  const projOwner = new Map(projects.map((p) => [p.id as string, p.user_id as string]));
  for (const c of cards || []) {
    const owner = projOwner.get(c.project_id as string);
    if (!owner) continue;
    const arr = cardsByUser.get(owner) || [];
    arr.push(c as unknown as Card);
    cardsByUser.set(owner, arr);
  }

  // 4. Render + send one email per opted-in user.
  let sent = 0;
  const errors: string[] = [];
  for (const userId of userIds) {
    const prefs = prefsFor(userId, prefsByUser.get(userId));
    if (!prefs.enabled) continue;

    const digest = renderDigest({
      projects: projByUser.get(userId) || [],
      cards: cardsByUser.get(userId) || [],
      prefs,
      today
    });
    if (!digest) continue; // nothing due for this user today

    const { data: userRes } = await db.auth.admin.getUserById(userId);
    const to = userRes?.user?.email;
    if (!to) continue;

    try {
      await email.send({ to, subject: digest.subject, html: digest.html });
      sent++;
    } catch (e) {
      errors.push(`${userId}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return NextResponse.json({
    ok: errors.length === 0,
    users: userIds.length,
    sent,
    ...(errors.length ? { errors } : {}),
    ranAt: new Date().toISOString()
  });
}
