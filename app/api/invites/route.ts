import { NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/email/sender';
import { inviteSubject, renderInvite } from '@/lib/email/invite';
import { isSameOrigin } from '@/lib/sameOrigin';
import { createClient } from '@/lib/supabase/server';

/**
 * Invite someone to a project, and tell them about it.
 *
 * The decision of *what an invitation is* lives in invite_to_project(): if the
 * address already belongs to a confirmed account the person becomes a member on
 * the spot, and only an address with no account behind it leaves a row in
 * project_invites to be claimed at sign-in. That used to be the only path, and
 * it is what made a shared board invisible to anyone who was already signed in
 * — they never passed through the sign-in code that redeems invitations.
 *
 * It goes through here rather than straight from the browser because the
 * *email* cannot: the Brevo key is server-only and must never reach a bundle.
 * The RPC still runs on the caller's own session and checks ownership itself,
 * so this route holds no elevated credential of any kind — deliberately, since
 * the point of the recent work was to stop spreading the service-role key
 * around.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* Deliberately loose. Real address validation is delivery: this only rejects
   what is obviously not an address, so the error comes back as a message
   instead of a bounce. */
const LOOKS_LIKE_EMAIL = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/* Everything invite_to_project() can answer. The per-hour cap that stops a free
   signup being used as a mail relay now lives in there too: it has to count
   memberships as well as invitations, and only the function can see both. */
type Outcome = 'member' | 'invited' | 'already_member' | 'already_invited' | 'self' | 'rate_limited';

const REFUSALS: Partial<Record<Outcome, { error: string; status: number }>> = {
  already_member: { error: 'That person is already on this project.', status: 409 },
  already_invited: { error: 'That person has already been invited.', status: 409 },
  self: { error: 'You are already on this project.', status: 400 },
  rate_limited: {
    error: 'That is a lot of invitations at once — try again in an hour.',
    status: 429
  }
};

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

  // --- The invitation itself ------------------------------------------------
  /* The function checks ownership itself and raises if this user is not an
     owner — a thrown error here is an authorization failure, not a bug. The
     outcomes it *returns* are the ordinary ones the person typing needs to see.
     Nothing was written for any of those. */
  const { data, error: rpcErr } = await supabase.rpc('invite_to_project', {
    p: projectId,
    addr: email
  });

  if (rpcErr) {
    console.error('invite_to_project failed:', rpcErr.message);
    return NextResponse.json({ error: 'Could not create that invitation.' }, { status: 403 });
  }

  const outcome = data as Outcome;
  const refusal = REFUSALS[outcome];
  if (refusal) {
    return NextResponse.json({ error: refusal.error }, { status: refusal.status });
  }

  /* The one thing that changes for the recipient: 'member' means they can open
     the board right now, 'invited' means the address has no account yet and the
     invitation waits for their first sign-in. The panel says different things
     for the two, because "they'll join when they sign in" told to someone who
     is already signed in is how this went wrong in the first place. */
  const joined = outcome === 'member';

  // --- Telling them ---------------------------------------------------------
  /* A failure here is reported but not fatal: the access (or the invitation) is
     real either way, so undoing it would be the harsher outcome. The caller is
     told, and can pass the word along by hand. */
  try {
    await getEmailProvider().send({
      to: email,
      subject: inviteSubject(),
      html: renderInvite(user.email ?? 'Someone')
    });
  } catch (e) {
    console.error('invite email failed:', e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: true, emailed: false, joined });
  }

  return NextResponse.json({ ok: true, emailed: true, joined });
}
