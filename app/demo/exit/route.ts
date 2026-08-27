import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE } from '@/lib/demo/mode';

/** The way out: drop the cookie and go back to the landing page. */
export const dynamic = 'force-dynamic';

export function GET(request: NextRequest) {
  const response = NextResponse.redirect(new URL('/', request.url));
  response.cookies.set(DEMO_COOKIE, '', { path: '/', maxAge: 0 });
  return response;
}
