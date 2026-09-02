import { timingSafeEqual } from 'node:crypto';
import { NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/email/sender';
import { renderDigest, weekdayOf } from '@/lib/email/template';
import { createAdminClient } from '@/lib/supabase/admin';
import { DEFAULT_EMAIL_PREFS, type Card, type EmailPrefs, type Project, type Version } from '@/lib/types';

// Cron target, invoked daily by Vercel (see vercel.json).
// Runs on the Node.js runtime so provider SDKs / fetch behave predictably.
export const runtime = 'nodejs';
// Never cache a cron endpoint.
export const dynamic = 'force-dynamic';
// Allow up to 60s for larger sends (Vercel Hobby cap).
export const maxDuration = 60;

/* Vercel automatically sends `Authorization: Bearer <CRON_SECRET>` when the
   CRON_SECRET env var is set.

   This fails *closed*: with no secret configured the endpoint answers 401 in
   production rather than letting everyone through. It runs on the service-role
   key, which bypasses row-level security — an open door here would expose every
   user's projects and let anyone trigger a send to the whole user base. A
   missing env var must never be the difference between the two. */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Only a local run may skip the check; a deployed one never does.
  if (!secret) return process.env.NODE_ENV !== 'production';

  const presented = Buffer.from(request.headers.get('authorization') ?? '');
  const expected = Buffer.from(`Bearer ${secret}`);
  // Compared in constant time, so the secret can't be recovered byte by byte.
  return presented.length === expected.length && timingSafeEqual(presented, expected);
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
    sections: row?.sections ?? DEFAULT_EMAIL_PREFS.sections,
    days: row?.days ?? DEFAULT_EMAIL_PREFS.days
  };
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const db = createAdminClient();
  const email = getEmailProvider();
  const today = parisToday();
  // The weekday is resolved in the cron's reference timezone, so "weekdays only"
  // means the same thing for everyone and never drifts by a day at the edges.
  const weekday = weekdayOf(today);

  /* 1. Every membership that asked for reminders.
        Reminders are per-member, not per-project: two people on one project can
        disagree about wanting the mail, and the one who says no must not get it
        because the other said yes. So the unit here is (project, member), and
        the same project can legitimately appear for several readers. */
  const { data: memberships, error: mErr } = await db
    .from('project_members')
    .select('project_id, user_id')
    .eq('remind', true);
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 });
  if (!memberships || memberships.length === 0) {
    return NextResponse.json({ ok: true, users: 0, sent: 0, note: 'nobody opted in' });
  }

  const projectIds = Array.from(new Set(memberships.map((m) => m.project_id as string)));

  // 2. Open cards for those projects. Undated ones are fetched too — they feed
  //    the optional "No date" section (renderDigest drops them otherwise).
  const { data: cards, error: cErr } = await db
    .from('cards')
    .select('id, project_id, target_date, done')
    .in('project_id', projectIds)
    .eq('done', false);
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 });

  // 2b. Open versions carrying a ship date — the optional "Milestones" section.
  const { data: versions } = await db
    .from('versions')
    .select('id, project_id, ship_date, completed')
    .in('project_id', projectIds)
    .eq('completed', false)
    .not('ship_date', 'is', null);

  // 3. Per-user preferences (a missing row means defaults).
  const userIds = Array.from(new Set(memberships.map((m) => m.user_id as string)));
  const { data: prefRows } = await db
    .from('email_prefs')
    .select('user_id, enabled, subject, horizon_days, sections, days')
    .in('user_id', userIds);
  const prefsByUser = new Map((prefRows || []).map((r) => [r.user_id as string, r]));

  /* Which projects each reader opted into. A set rather than a list: the same
     project reaches one reader once, however the memberships are ordered. */
  const scopeByUser = new Map<string, Set<string>>();
  for (const m of memberships) {
    const uid = m.user_id as string;
    const s = scopeByUser.get(uid) ?? new Set<string>();
    s.add(m.project_id as string);
    scopeByUser.set(uid, s);
  }

  // 4. Render + send one email per opted-in user.
  let sent = 0;
  let skippedToday = 0;
  const errors: string[] = [];
  for (const userId of userIds) {
    const prefs = prefsFor(userId, prefsByUser.get(userId));
    if (!prefs.enabled) continue;
    // Not one of this user's chosen weekdays — nothing to do for them today.
    if (!prefs.days.includes(weekday)) { skippedToday++; continue; }

    /* Filtered per reader rather than pre-bucketed by owner: with sharing, a
       card belongs to a project, and every member who opted in should see it
       counted — the project's creator has no special claim on it. */
    const scope = scopeByUser.get(userId) ?? new Set<string>();
    const digest = renderDigest({
      projectIds: Array.from(scope),
      cards: (cards || []).filter((c) => scope.has(c.project_id as string)) as unknown as Card[],
      versions: (versions || []).filter((v) => scope.has(v.project_id as string)) as unknown as Version[],
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
    weekday,
    skippedToday,   // opted in, but today isn't one of their days
    ...(errors.length ? { errors } : {}),
    ranAt: new Date().toISOString()
  });
}
