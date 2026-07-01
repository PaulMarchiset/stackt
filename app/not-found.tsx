import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Reading the session cookie requires a per-request render.
export const dynamic = 'force-dynamic';

/**
 * Custom 404: send visitors somewhere useful instead of a dead end —
 * signed-in users to their projects, everyone else to the landing page.
 */
export default async function NotFound() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  redirect(user ? '/projects' : '/');
}
