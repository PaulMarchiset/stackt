'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createDemoClient } from '@/lib/demo/db';
import type { CardComment, ProjectMember } from '@/lib/types';

function initialOf(email: string): string {
  return (email.trim()[0] || '?').toUpperCase();
}

function mentionIds(body: string, members: ProjectMember[]): string[] {
  // Match @tokens against member emails (full or prefix, case-insensitive).
  const tokens = body.match(/@([^\s@,;]+)/g) ?? [];
  const found = new Set<string>();
  for (const t of tokens) {
    const needle = t.slice(1).toLowerCase();
    for (const m of members) {
      const email = m.email.toLowerCase();
      if (email === needle || email.startsWith(needle + '@') || email.split('@')[0] === needle) {
        found.add(m.user_id);
      }
    }
  }
  return [...found];
}

/**
 * Discussion thread on a card. The description (cards.comment) stays where it
 * is — this is the conversation: extra info, issues, @pings.
 * Only the author can edit/delete their own comment; anyone can post.
 */
export default function CardComments({
  projectId, cardId, userId,
  comments, members: membersProp,
  onAdd, onEdit, onDelete, demo = false
}: {
  projectId: string;
  cardId: string;
  userId: string;
  comments: CardComment[];
  members?: ProjectMember[];
  onAdd: (body: string, mentionedIds: string[]) => Promise<unknown>;
  onEdit: (id: string, body: string) => void;
  onDelete: (id: string) => void;
  demo?: boolean;
}) {
  const supabase = useMemo(() => (demo ? createDemoClient() : createClient()), [demo]);
  const [members, setMembers] = useState<ProjectMember[]>(membersProp ?? []);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [showSug, setShowSug] = useState(false);

  useEffect(() => {
    if (membersProp) { setMembers(membersProp); return; }
    let live = true;
    void supabase.rpc('project_members_detailed', { p: projectId }).then(({ data }) => {
      if (live) setMembers(((data as ProjectMember[]) ?? []).slice().sort((a, b) => a.email.localeCompare(b.email)));
    });
    return () => { live = false; };
  }, [supabase, projectId, membersProp]);

  const emailById = useMemo(() => new Map(members.map((m) => [m.user_id, m.email] as const)), [members]);

  // @autocomplete: token being typed at the end (e.g. "@len").
  const atToken = useMemo(() => {
    const m = draft.match(/@([^\s@,;]*)$/);
    return m ? m[1].toLowerCase() : null;
  }, [draft]);

  const suggestions = useMemo(() => {
    if (atToken === null) return [];
    return members.filter((m) => m.email.toLowerCase().includes(atToken)).slice(0, 5);
  }, [members, atToken]);

  useEffect(() => { setShowSug(suggestions.length > 0); }, [suggestions.length]);

  function applySuggestion(email: string) {
    setDraft((d) => d.replace(/@[^\s@,;]*$/, '@' + email + ' '));
    setShowSug(false);
  }

  async function submit() {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    try {
      await onAdd(text, mentionIds(text, members));
      setDraft('');
    } finally {
      setBusy(false);
    }
  }

  function startEdit(c: CardComment) {
    setEditingId(c.id);
    setEditText(c.body);
  }

  return (
    <div className="card-thread">
      <div className="ver-label">Discussion {comments.length > 0 && <em>({comments.length})</em>}</div>
      {comments.length === 0 && (
        <div className="thread-empty">No comments yet — add info, discuss, or ping someone with @.</div>
      )}
      <div className="thread-list">
        {comments.map((c) => {
          const mine = c.user_id === userId;
          const who = c.user_id ? (emailById.get(c.user_id) ?? 'Someone') : 'Someone';
          const isEditing = editingId === c.id;
          return (
            <div key={c.id} className={'thread-item' + (mine ? ' mine' : '')}>
              <span className="thread-avatar" title={who}>{initialOf(who)}</span>
              <div className="thread-main">
                <div className="thread-head">
                  <span className="thread-who">{mine ? 'You' : who}</span>
                  <span className="thread-when">{new Date(c.created_at).toLocaleString()}</span>
                </div>
                {isEditing ? (
                  <div className="thread-edit">
                    <textarea rows={2} value={editText} onChange={(e) => setEditText(e.target.value)} />
                    <div className="thread-edit-actions">
                      <button type="button" className="btn ghost" onClick={() => setEditingId(null)}>Cancel</button>
                      <button type="button" className="btn solid" onClick={() => { onEdit(c.id, editText); setEditingId(null); }}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div className="thread-body">{c.body}</div>
                )}
                {mine && !isEditing && (
                  <div className="thread-own-actions">
                    <button type="button" onClick={() => startEdit(c)}>Edit</button>
                    <button type="button" className="danger" onClick={() => onDelete(c.id)}>Delete</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <div className="thread-compose">
        <textarea rows={2} placeholder="Write a comment… type @ to ping someone"
          value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit(); }} />
        {showSug && suggestions.length > 0 && (
          <div className="thread-suggest">
            {suggestions.map((s) => (
              <button key={s.user_id} type="button" onClick={() => applySuggestion(s.email)}>
                <span className="thread-avatar sm">{initialOf(s.email)}</span>{s.email}
              </button>
            ))}
          </div>
        )}
        <div className="thread-compose-actions">
          <span className="thread-hint">Ctrl+Enter to send · @email to notify</span>
          <button type="button" className="btn solid" disabled={!draft.trim() || busy} onClick={submit}>
            {busy ? 'Sending…' : 'Comment'}
          </button>
        </div>
      </div>
    </div>
  );
}
