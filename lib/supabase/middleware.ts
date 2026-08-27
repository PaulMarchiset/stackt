import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import { DEMO_COOKIE } from '@/lib/demo/mode';

/** Refreshes the auth session and guards protected routes. */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        }
      }
    }
  );

  const {
    data: { user }
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isAuthPage = path.startsWith('/login') || path.startsWith('/signup');
  /* A demo visitor has no session and still belongs on /projects and /board:
     those pages serve the fixture instead of a query when the cookie is set
     (see lib/demo/server.ts). Without this they would bounce to /login. */
  const isDemo = request.cookies.get(DEMO_COOKIE)?.value === '1';
  const isPublic = path === '/' || isAuthPage || path.startsWith('/auth')
    || path.startsWith('/terms') || path.startsWith('/privacy') || path.startsWith('/legal')
    || path.startsWith('/demo') || isDemo;

  // Not signed in and trying to reach the app → send to login.
  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }
  // Already signed in and on an auth page → send to the home (projects).
  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = '/projects';
    return NextResponse.redirect(url);
  }

  return response;
}
