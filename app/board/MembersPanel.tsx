'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createDemoClient } from '@/lib/demo/db';
import { usePersist } from '@/lib/usePersist';
import { IconPlus } from '@/app/components/icons';

/**
 * Who can reach this project, and how to change that.
 *
 * Roles are deliberately two: an editor does everything to the contents, an
 * owner also invites, promotes and deletes. Every write here goes through a
 * database function rather than a table write — the membership table grants
 * `authenticated` no INSERT at all, and only the three per-person columns on
 * UPDATE, so "you cannot add yourself" and "you cannot promote yourself" are
 * enforced by missing privileges rather than by this component behaving.
 *
 * The panel therefore hides what it knows you cannot do, but hiding it is
 * cosmetic; the server refuses regardless.
 */

type Role = 'owner' | 'editor';
type Member = { user_id: string; email: string; role: Role; joined_at: string };
type Invite = { id: string; email: string; role: Role; expires_at: string };

export default function MembersPanel({
  projectId, projectName, userId, onLeft, demo = false
}: {
  projectId: string;
  projectName: string;
  userId: string;
  /** Called once you remove yourself — the board can no longer show this project. */
  onLeft: () => void;
  /** Screenshot mode: the fixture answers, nothing reaches the network. */
  demo?: boolean;
}) {
  const supabase = useMemo(() => (demo ? createDemoClient() : createClient()), [demo]);
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; bad: boolean } | null>(null);
  const { persist } = usePersist((text, bad) => setNote({ text, bad: !!bad }));

  const iAmOwner = members.some((m) => m.user_id === userId && m.role === 'owner');
  const owners = members.filter((m) => m.role === 'owner').length;

  const load = useCallback(async () => {
    const [mRes, iRes] = await Promise.all([
      supabase.rpc('project_members_detailed', { p: projectId }),
      supabase.rpc('project_invites_pending', { p: projectId })
    ]);
    setMembers((mRes.data as Member[]) ?? []);
    // Not an error for an editor: the function simply returns nothing for them.
    setInvites((iRes.data as Invite[]) ?? []);
    setLoading(false);
  }, [supabase, projectId]);

  useEffect(() => { void load(); }, [load]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    const addr = email.trim().toLowerCase();
    if (!addr || busy) return;

    /* Caught here only to say something useful — the database would accept the
       row and claim_project_invites() would no-op on the conflict. */
    if (members.some((m) => m.email.toLowerCase() === addr)) {
      setNote({ text: `${addr} is already on this project.`, bad: true });
      return;
    }

    /* The demo has no session, so the route would answer 401 and the panel
       would show an error on the one surface that exists to be photographed.
       It reports what a real invitation reports and sends nothing. */
    if (demo) {
      setEmail('');
      setNote({ text: `Invited ${addr}. They join as soon as they sign in.`, bad: false });
      return;
    }

    setBusy(true);

    /* Through the API rather than a direct insert: the row itself could be
       written from here (the policy allows an owner), but the invitation email
       cannot — the Brevo key is server-only. The route does both, and applies
       the per-hour cap that stops the app being used as a mail relay. */
    let res: { ok?: boolean; emailed?: boolean; joined?: boolean; error?: string };
    try {
      const r = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ projectId, email: addr })
      });
      res = await r.json();
    } catch {
      res = { error: 'Could not reach the server — check your connection.' };
    }
    setBusy(false);

    if (!res.ok) {
      setNote({ text: res.error || 'Could not send that invitation.', bad: true });
      return;
    }

    setEmail('');
    setNote({
      /* Four messages because there are two independent facts to report, and
         getting either one wrong leaves somebody waiting for nothing: whether
         they have access *now* (an existing account is added on the spot; an
         address with no account keeps an invitation until they sign in), and
         whether the mail actually went. */
      text: res.joined
        ? res.emailed
          ? `${addr} now has access to this project.`
          : `${addr} now has access, but the email could not be sent — tell them yourself.`
        : res.emailed
          ? `Invited ${addr}. They join as soon as they sign in with that address.`
          : `${addr} is invited, but the email could not be sent — tell them to sign in with that address.`,
      bad: !res.emailed
    });
    void load();
  }

  async function remove(target: Member) {
    const self = target.user_id === userId;
    setBusy(true);
    const { error } = await supabase.rpc('remove_project_member', { p: projectId, target: target.user_id });
    setBusy(false);
    if (error) {
      setNote({ text: error.message.replace(/^.*would be left without an owner.*$/i,
        'Make someone else an owner first — a project cannot be left without one.'), bad: true });
      return;
    }
    if (self) { onLeft(); return; }
    setNote({ text: `${target.email} no longer has access.`, bad: false });
    void load();
  }

  async function setRole(target: Member, role: Role) {
    setBusy(true);
    const { error } = await supabase.rpc('set_project_role', { p: projectId, target: target.user_id, new_role: role });
    setBusy(false);
    if (error) { setNote({ text: 'Could not change that role — try again.', bad: true }); return; }
    void load();
  }

  async function cancelInvite(inv: Invite) {
    setBusy(true);
    const ok = await persist(supabase.from('project_invites').delete().eq('id', inv.id),
      { message: 'Could not cancel that invitation.' });
    setBusy(false);
    if (ok) void load();
  }

  if (loading) return <p className="set-desc">Loading…</p>;

  return (
    <div className="members">
      <p className="set-desc">
        Everyone here can add, edit and move cards in <b>{projectName || 'this project'}</b>.
        Only an owner can invite people or delete the project.
      </p>

      {iAmOwner && (
        <form className="members-invite" onSubmit={invite}>
          <input
            className="set-input" type="email" inputMode="email" autoComplete="off"
            placeholder="name@example.com" aria-label="Email address to invite"
            value={email} onChange={(e) => setEmail(e.target.value)} />
          <button className="btn solid" type="submit" disabled={busy || !email.trim()}>
            <IconPlus /> Invite
          </button>
        </form>
      )}

      {note && (
        <p className={'members-note' + (note.bad ? ' bad' : '')} role="status">{note.text}</p>
      )}

      <ul className="members-list">
        {members.map((m) => {
          const self = m.user_id === userId;
          /* The last owner has no "Remove" — the database refuses it anyway
             (the last-owner trigger), and offering a button that always fails
             is worse than not offering it. */
          const lastOwner = m.role === 'owner' && owners === 1;
          return (
            <li key={m.user_id} className="members-row">
              <span className="members-who">
                <span className="members-email">{m.email}</span>
                {self && <span className="members-you">you</span>}
              </span>
              <span className="members-actions">
                {iAmOwner && !self ? (
                  <select className="set-input members-role" value={m.role} disabled={busy}
                    aria-label={`Role for ${m.email}`}
                    onChange={(e) => setRole(m, e.target.value as Role)}>
                    <option value="editor">Editor</option>
                    <option value="owner">Owner</option>
                  </select>
                ) : (
                  <span className="members-role-fixed">{m.role === 'owner' ? 'Owner' : 'Editor'}</span>
                )}
                {(iAmOwner || self) && !lastOwner && (
                  <button className="btn ghost members-remove" disabled={busy} onClick={() => remove(m)}>
                    {self ? 'Leave' : 'Remove'}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {invites.length > 0 && (
        <>
          <div className="sheet-section-label">Invited, not yet joined</div>
          <ul className="members-list">
            {invites.map((i) => (
              <li key={i.id} className="members-row pending">
                <span className="members-who"><span className="members-email">{i.email}</span></span>
                <span className="members-actions">
                  <button className="btn ghost members-remove" disabled={busy} onClick={() => cancelInvite(i)}>
                    Cancel
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
