import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE, DEMO_ENABLED } from '@/lib/demo/mode';

/** The way out: drop the cookie and go back to the landing page. */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  if (!DEMO_ENABLED) return new NextResponse(null, { status: 404 });

  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
