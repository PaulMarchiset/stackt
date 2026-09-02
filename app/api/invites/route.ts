import { NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/email/sender';
import { inviteSubject, renderInvite } from '@/lib/email/invite';
import { isSameOrigin } from '@/lib/sameOrigin';
import { createClient } from '@/lib/supabase/server';

/**
 * Invite someone to a project, and tell them about it.
 *
 * The row could be inserted straight from the browser — the RLS policy already
 * restricts it to owners. It goes through here because the *email* cannot: the
 * Brevo key is server-only and must never reach a bundle.
 *
 * The insert still runs on the caller's own session, so the authorization is
 * the invites_insert_owner policy, exactly as it would be from the client. This
 * route holds no elevated credential of any kind — deliberately, since the
 * point of the recent work was to stop spreading the service-role key around.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* An authenticated user can make this server send mail to an address they
   choose. Uncapped, that is an open relay wearing a free signup as a costume:
   sign up, own a project, and post addresses in a loop from a domain whose
   reputation is not yours. The cap is per hour and per inviter, counted from
   the invitations themselves so there is no extra state to keep.

   Generous on purpose — onboarding a real team of eight in one sitting must
   not trip it; sending a hundred must. */
const INVITES_PER_HOUR = 10;

/* Deliberately loose. Real address validation is delivery: this only rejects
   what is obviously not an address, so the error comes back as a message
   instead of a bounce. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { projectId?: unknown; email?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : '';
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

  if (!projectId) return NextResponse.json({ error: 'Which project?' }, { status: 400 });
  if (!LOOKS_LIKE_EMAIL.test(email)) {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }
  if (email === user.email?.toLowerCase()) {
    return NextResponse.json({ error: 'You are already on this project.' }, { status: 400 });
  }

  // --- Rate limit -----------------------------------------------------------
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from('project_invites')
    .select('id', { count: 'exact', head: true })
    .eq('invited_by', user.id)
    .gte('created_at', since);
  if ((count ?? 0) >= INVITES_PER_HOUR) {
    return NextResponse.json(
      { error: 'That is a lot of invitations at once — try again in an hour.' },
      { status: 429 }
    );
  }

  // --- The invitation itself ------------------------------------------------
  // RLS decides whether this user may invite to this project; a refusal here is
  // an authorization failure, not a bug.
  const { error: insErr } = await supabase
    .from('project_invites')
    .insert({ project_id: projectId, email, invited_by: user.id });

  if (insErr) {
    const duplicate = insErr.code === '23505';
    return NextResponse.json(
      { error: duplicate ? 'That person has already been invited.' : 'Could not create that invitation.' },
      { status: duplicate ? 409 : 403 }
    );
  }

  // --- Telling them ---------------------------------------------------------
  /* A failure here is reported but not fatal: the invitation exists and will be
     claimed the moment they sign in, so undoing it would be the harsher
     outcome. The caller is told, and can pass the word along by hand. */
  try {
    await getEmailProvider().send({
      to: email,
      subject: inviteSubject(),
      html: renderInvite(user.email ?? 'Someone')
    });
  } catch (e) {
    console.error('invite email failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: true, emailed: false });
  }

  return NextResponse.json({ ok: true, emailed: true });
}
