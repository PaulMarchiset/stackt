import { NextResponse } from 'next/server';
import { createClient as createAdminClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/server';

/**
 * Deletes the signed-in user's account and all their data, then signs them out.
 *
 * Data (projects + cards) is removed through the user's own session, so
 * row-level security guarantees we only ever touch their rows. The auth record
 * itself can only be removed with the service-role key, which is server-only and
 * must never reach the browser — set SUPABASE_SERVICE_ROLE_KEY in the server
 * environment for the account row to be deleted too (data is deleted regardless).
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }

  // 1. Delete the user's own data (RLS-scoped). Cards first (they reference projects).
  const { data: projects } = await supabase.from('projects').select('id');
  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length) {
    await supabase.from('cards').delete().in('project_id', ids);
    await supabase.from('projects').delete().in('id', ids);
  }

  // 2. Delete the auth user (needs the service-role key).
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (serviceKey) {
    const admin = createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) console.error('deleteUser error:', error);
  } else {
    console.error('SUPABASE_SERVICE_ROLE_KEY is not set — user data deleted, but the auth record remains.');
  }

  // 3. Clear the session and send them home.
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), { status: 303 });
}
