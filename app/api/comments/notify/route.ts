import { NextResponse } from 'next/server';
import { getEmailProvider } from '@/lib/email/sender';
import { mentionSubject, renderMention } from '@/lib/email/mention';
import { isSameOrigin } from '@/lib/sameOrigin';
import { createClient } from '@/lib/supabase/server';

/**
 * Email the people @pinged in a comment.
 *
 * Best-effort by design: posting the comment already succeeded (the RPC wrote
 * the card_mentions rows). This route only delivers the mail — a failure here
 * never un-posts anything. Locally EMAIL_PROVIDER=console just logs.
 */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 });

  let body: { commentId?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Malformed request' }, { status: 400 });
  }
  const commentId = typeof body.commentId === 'string' ? body.commentId : '';
  if (!commentId) return NextResponse.json({ error: 'Which comment?' }, { status: 400 });

  // The comment must be one the caller can see (RLS enforces membership).
  const { data: comment, error: cErr } = await supabase
    .from('card_comments')
    .select('id, body, user_id')
    .eq('id', commentId)
    .maybeSingle();
  if (cErr || !comment) return NextResponse.json({ error: 'Unknown comment' }, { status: 404 });

  const { data: mentions } = await supabase
    .from('card_mentions')
    .select('mentioned_user_id')
    .eq('comment_id', commentId);
  const ids = ((mentions as { mentioned_user_id: string }[] | null) ?? []).map((m) => m.mentioned_user_id);
  if (!ids.length) return NextResponse.json({ ok: true, emailed: 0 });

  // Resolve emails without leaking the directory: only members of this
  // comment's project, via the existing guarded RPC on its project.
  const { data: full } = await supabase.from('card_comments').select('project_id').eq('id', commentId).maybeSingle();
  const projectId = (full as { project_id: string } | null)?.project_id;
  if (!projectId) return NextResponse.json({ ok: true, emailed: 0 });

  const { data: members } = await supabase.rpc('project_members_detailed', { p: projectId });
  const byId = new Map(((members as { user_id: string; email: string }[] | null) ?? []).map((m) => [m.user_id, m.email] as const));

  const provider = getEmailProvider();
  let emailed = 0;
  for (const id of new Set(ids)) {
    const to = byId.get(id);
    if (!to) continue;
    try {
      await provider.send({ to, subject: mentionSubject(), html: renderMention(user.email ?? 'Someone') });
      emailed += 1;
    } catch (e) {
      console.error('mention email failed:', e instanceof Error ? e.message : String(e));
    }
  }

  return NextResponse.json({ ok: true, emailed });
}
