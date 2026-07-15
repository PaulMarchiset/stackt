import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Run on app routes only — skip API routes (they self-authorize, e.g. the cron
  // endpoint via CRON_SECRET), _next, the OG image, and anything with a file
  // extension (favicon, robots.txt, sitemap.xml, the Google verification .html, etc.).
  matcher: ['/((?!api|_next|opengraph-image|.*\\..*).*)']
};
