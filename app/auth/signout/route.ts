import { NextResponse } from 'next/server';
import { isSameOrigin } from '@/lib/sameOrigin';
import { createClient } from '@/lib/supabase/server';

export async function POST(request: Request) {
  // Cross-site POSTs can't sign people out (see lib/sameOrigin.ts).
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
