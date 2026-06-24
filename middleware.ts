import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on app routes only — skip _next, the OG image, and anything with a file
  // extension (favicon, robots.txt, sitemap.xml, the Google verification .html, etc.).
  matcher: ['/((?!_next|opengraph-image|.*\\..*).*)']
};
