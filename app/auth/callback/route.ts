import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

// Exchanges the auth code (magic link / OAuth) for a session cookie.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');

  /* `next` is attacker-supplied. Concatenating it after the origin happens to
     keep "//evil.com" a path today, but an open redirect on the *auth* callback
     is the worst place to leave one lying around — a phishing link that ends on
     a real login is very convincing. Only a same-site absolute path gets
     through; anything else lands on the default. */
  const requested = searchParams.get('next') ?? '/projects';
  const next =
    requested.startsWith('/') && !requested.startsWith('//') && !requested.startsWith('/\\')
      ? requested
      : '/projects';

  if (code) {
    const supabase = createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      /* Turn any invitation addressed to this email into a membership. It runs
         here, once per sign-in, rather than on every page load — and it is
         deliberately not allowed to fail the login: someone who cannot be let
         into a shared project should still get into their own account. */
      const { error: claimErr } = await supabase.rpc('claim_project_invites');
      if (claimErr) console.error('claim_project_invites failed:', claimErr.message);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
