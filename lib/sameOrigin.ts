/**
 * Did this POST come from our own pages?
 *
 * Cookie-authenticated POST handlers are otherwise submittable from any site:
 * a hidden form on evil.com posting to /auth/delete would run as the signed-in
 * user. Supabase's cookies are SameSite=Lax, which happens to block that today
 * — but that leaves account deletion resting on a cookie attribute set by a
 * library we don't control. This checks it ourselves.
 *
 * Compared against the Host header rather than request.url: behind Vercel's
 * proxy the URL the handler sees isn't always the one the browser typed, and a
 * false negative here logs people out of their own signout button.
 *
 * A missing Origin is rejected: every browser sends it on a cross-origin POST,
 * and same-origin form posts send it too.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host');
  if (!origin || !host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
