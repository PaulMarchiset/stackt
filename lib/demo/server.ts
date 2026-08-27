import { cookies } from 'next/headers';
import { DEMO_COOKIE } from './mode';

/**
 * Is this request in demo mode?
 *
 * Server components ask this *before* they ask who is signed in: the demo is a
 * presentation surface, and it has to work with no session at all (that is how
 * a stranger sees it) and to take precedence when there is one (that is how you
 * screenshot it without signing out of your own account).
 *
 * Split from lib/demo/mode.ts because next/headers cannot be imported from
 * middleware, which needs the cookie name too.
 */
export function isDemo(): boolean {
  return cookies().get(DEMO_COOKIE)?.value === '1';
}
