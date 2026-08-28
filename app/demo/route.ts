import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE, DEMO_ENABLED, DEMO_MAX_AGE } from '@/lib/demo/mode';

/**
 * The way in. Unlisted on purpose: nothing links here, robots.txt disallows it,
 * and it exists so the app can be shown — and photographed — with a board that
 * is actually full.
 *
 * It sets the cookie and drops you on the projects page, signed in or not. See
 * lib/demo/fixture.ts for what you land in and lib/demo/db.ts for why nothing
 * you do there is saved.
 */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  if (!DEMO_ENABLED) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(new URL('/projects', request.url));
  response.cookies.set(DEMO_COOKIE, '1', {
    path: '/', maxAge: DEMO_MAX_AGE, sameSite: 'lax'
  });
  return response;
}
