import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/sameOrigin';
import { createClient } from '@/lib/supabase/server';

/**
 * Deletes the signed-in user's account and all their data, then signs them out.
 *
 * Everything runs on the user's own session. The auth record goes through
 * public.delete_own_account() (migration 0009), a security-definer function
 * that reads auth.uid() itself — so this route no longer touches the
 * service-role key, which bypassed row-level security across every user.
 *
 * Deleting the auth row cascades to projects, versions, cards, groups and
 * preferences. The explicit deletes below are the fallback for when the
 * function is unavailable (migration not run yet): they are RLS-scoped, so the
 * personal data still goes even when the login record can't, and the user is
 * told rather than sent home as if it had all worked.
 */
export async function POST(request: Request) {
  // Deleting an account is exactly the request you don't want another site to
  // be able to make on a user's behalf (see lib/sameOrigin.ts).
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  }

  // 1. The whole account, in one call. Cascades take care of the rest.
  const { error } = await supabase.rpc('delete_own_account');

  if (!error) {
    await supabase.auth.signOut();
    return NextResponse.redirect(new URL('/', request.url), { status: 303 });
  }

  /* 2. Fallback — the function is missing or refused. Delete what the session
        is allowed to delete, so the content goes even if the login lingers.
        Order matters: children before parents. `versions` is absent on purpose,
        it has no user_id and cascades from projects. */
  console.error('delete_own_account failed, falling back to row deletes:', error.message);

  const { data: projects } = await supabase.from('projects').select('id');
  const ids = (projects ?? []).map((p) => p.id);
  if (ids.length) {
    await supabase.from('cards').delete().in('project_id', ids);
    await supabase.from('projects').delete().in('id', ids);
  }
  await supabase.from('project_groups').delete().eq('user_id', user.id);
  await supabase.from('user_prefs').delete().eq('user_id', user.id);
  await supabase.from('email_prefs').delete().eq('user_id', user.id);

  return NextResponse.redirect(new URL('/settings?deleted=partial', request.url), { status: 303 });
}
