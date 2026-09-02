'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import Logo from '@/app/Logo';
import AccountMenu from '@/app/components/AccountMenu';
import Toast from '@/app/components/Toast';
import EmailReminders from './EmailReminders';
import HeaderProjects from './HeaderProjects';
import { createClient } from '@/lib/supabase/client';
import { useDevMode } from '@/lib/useDevMode';
import { useToast } from '@/lib/useToast';
import { CHANGELOG_VERSION } from '@/lib/changelog';
import { BUG_ICON_PATH } from '@/app/components/TypeTag';

/**
 * Dedicated settings page. Profile (name + email) lives in Supabase auth,
 * developer mode is a per-device default, the reminder email has its own
 * builder, and the danger zone deletes everything.
 *
 * The page is a wide two-column read: a sticky numbered index on the left that
 * tracks the scroll, and the sections themselves on the right. Section frames
 * (and the toast every save reports through) are owned here so the index always
 * has something to observe, even while a section is still loading.
 */

const SECTIONS = [
  { id: 'profile', label: 'Profile' },
  { id: 'prefs', label: 'Preferences' },
  { id: 'header', label: 'Board header' },
  { id: 'email', label: 'Email reminders' },
  { id: 'help', label: 'Help & legal' },
  { id: 'account', label: 'Account' }
] as const;

const CONTACT = 'stackt@paulmarchiset.me';

/* One project whose ownership has to go somewhere before this account can be
   deleted, with the members who could take it. Shape of one row returned by
   public.projects_needing_new_owner() (migration 0011). */
type HandoverCandidate = { user_id: string; email: string; role: string; joined_at: string };
type Handover = { project_id: string; project_name: string; candidates: HandoverCandidate[] | null };

const LEGAL = [
  { href: '/legal', label: 'Legal notice' },
  { href: '/terms', label: 'Terms of Use' },
  { href: '/privacy', label: 'Privacy Policy' }
];

export default function SettingsView({ userId, userEmail, userName = '', deleteFailed = false }: { userId: string; userEmail: string; userName?: string; deleteFailed?: boolean }) {
  const supabase = useMemo(() => createClient(), []);
  const [devMode, setDevMode] = useDevMode();
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  /* Projects this account is the last owner of that other people are on — the
     only ones that need a decision before the account can go. */
  const [handover, setHandover] = useState<Handover[]>([]);
  const [heirs, setHeirs] = useState<Record<string, string>>({});
  const [checkingHandover, setCheckingHandover] = useState(false);
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  /* Built after mount: the user agent is only knowable in the browser, and a
     server/client mismatch would trip hydration. Falls back to a bare mailto. */
  const [bugReportHref, setBugReportHref] = useState(`mailto:${CONTACT}`);
  /* Every section on this page reports through the same toast — it's owned here
     so it outlives whichever section raised it. */
  const { toast, showToast: say } = useToast();

  /* A bug report is far more useful with the browser and build attached, so we
     pre-fill them — visibly, in the body the user can read and edit before
     sending, rather than smuggling anything along. */
  useEffect(() => {
    const body = [
      'What happened:', '', 'What you expected:', '', 'Steps to reproduce:', '', '',
      '---', `Build: ${CHANGELOG_VERSION}`, `Browser: ${navigator.userAgent}`
    ].join('\n');
    setBugReportHref(
      `mailto:${CONTACT}?subject=${encodeURIComponent('Stackt — bug report')}&body=${encodeURIComponent(body)}`
    );
  }, []);

  // Light the index entry for whatever section sits in the upper third of the viewport.
  useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter((el): el is HTMLElement => !!el);
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => { if (e.isIntersecting) setActive(e.target.id); }),
      { rootMargin: '-20% 0px -70% 0px' }
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  /* Ask the database what needs deciding before showing the confirmation.
     If the call fails — the migration hasn't run on this environment — we go
     ahead without the picker: delete_own_account() applies the same
     longest-standing-member rule on its own, so the worst case is that the user
     doesn't get to override the default, not that a project is stranded. */
  async function beginDelete() {
    setCheckingHandover(true);
    const { data, error } = await supabase.rpc('projects_needing_new_owner');
    setCheckingHandover(false);

    const rows = error ? [] : ((data as Handover[]) ?? []);
    if (error) console.error('projects_needing_new_owner failed:', error.message);

    setHandover(rows);
    setHeirs(Object.fromEntries(rows.map((r) => [r.project_id, r.candidates?.[0]?.user_id ?? ''])));
    setConfirmDel(true);
  }

  /* Hand each project over, then let the form post for real. The POST stays a
     native form navigation rather than a fetch(): that is what carries the
     Origin header the route checks (lib/sameOrigin.ts). */
  async function handoverThenDelete(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);

    for (const row of handover) {
      const heir = heirs[row.project_id];
      if (!heir) continue;
      const { error } = await supabase.rpc('set_project_role', {
        p: row.project_id, target: heir, new_role: 'owner'
      });
      if (error) {
        // Stop rather than delete the account with a handover half-applied.
        setBusy(false);
        say(`Could not hand over "${row.project_name}" — nothing was deleted.`, true);
        return;
      }
    }

    form.submit(); // native submit: skips this handler, keeps the Origin header
  }

  async function saveName() {
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ data: { username: name.trim() } });
    setBusy(false);
    say(error ? 'Could not save your name — try again.' : 'Display name saved', !!error);
  }

  async function saveEmail() {
    const next = email.trim();
    if (!next || next === userEmail) return;
    setBusy(true);
    const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo });
    setBusy(false);
    say(error
      ? (error.message || 'Could not update email — try again.')
      : 'Confirmation link sent — the change applies once you click it.', !!error);
  }

  return (
    <div className="settings-page">
      <header className="home-top">
        <Link href="/board" aria-label="Back to board">
          <Logo height={22} className="brand-logo-full" />
        </Link>
        <div className="meta-spacer" />
        <AccountMenu userEmail={userEmail} userName={name} />
      </header>

      <div className="set-wrap">
        <div className="set-head">
          <div className="set-crumb">Account · {userEmail}</div>
          <h1 className="set-title">Settings</h1>
          <p className="set-lede">
            Your account, the default behaviour of new boards, and the daily reminder email — all in one place.
          </p>
          <div className="set-rule" />
        </div>

        <nav className="set-mobnav" aria-label="Settings sections">
          {SECTIONS.map((s) => (
            <a key={s.id} href={`#${s.id}`} className={'set-mobnav-link' + (active === s.id ? ' on' : '')}>{s.label}</a>
          ))}
        </nav>

        <div className="set-layout">
          <nav className="set-side" aria-label="Settings sections">
            <ol className="set-side-list">
              {SECTIONS.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className={'set-side-link' + (active === s.id ? ' on' : '')}>
                    <span className="idx">{String(i + 1).padStart(2, '0')}</span> {s.label}
                  </a>
                </li>
              ))}
            </ol>
            <div className="set-side-rule" />
            <p className="set-side-tip"><b>Tip</b> — a project can be muted straight from the 🔔 on its board.</p>
          </nav>

          <main>
            {/* ---------- Profile ---------- */}
            <section className="set-section" id="profile">
              <div className="set-eyebrow">Profile</div>
              <div className="set-card">
                <div className="set-row">
                  <label className="set-label" htmlFor="set-name">Display name</label>
                  <div className="set-inputline">
                    <input id="set-name" className="set-input" value={name} spellCheck={false} placeholder="Your name"
                      onChange={(e) => setName(e.target.value)} />
                    <button className="btn ghost" onClick={saveName} disabled={busy || name.trim() === userName.trim()}>Save</button>
                  </div>
                  <p className="set-hint">Shown on your avatar and in the account menu.</p>
                </div>
                <div className="set-row">
                  <label className="set-label" htmlFor="set-email">Email address</label>
                  <div className="set-inputline">
                    <input id="set-email" className="set-input" type="email" value={email} spellCheck={false} inputMode="email"
                      onChange={(e) => setEmail(e.target.value)} />
                    <button className="btn ghost" onClick={saveEmail} disabled={busy || email.trim() === userEmail}>Save</button>
                  </div>
                  <p className="set-hint">We send a confirmation link to the new address before the change takes effect.</p>
                </div>
              </div>
            </section>

            {/* ---------- Preferences ---------- */}
            <section className="set-section" id="prefs">
              <div className="set-eyebrow">Preferences</div>
              <div className="set-card">
                <div className="set-row">
                  <div className="set-rowhead">
                    <div className="set-rowtext">
                      <h3 className="set-h3">Developer mode <span className="set-badge">Default</span></h3>
                      <p className="set-desc">
                        Shows the git repository button and branch fields on new boards. Turn it off to keep
                        things to tasks, phases and urgent flags. Every project can override this.
                      </p>
                    </div>
                    <button className={'switch' + (devMode ? ' on' : '')} role="switch" aria-checked={devMode}
                      aria-label="Developer mode" onClick={() => setDevMode(!devMode)}><span /></button>
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- Board header ---------- */}
            <section className="set-section" id="header">
              <div className="set-eyebrow">Board header</div>
              <HeaderProjects userId={userId} onToast={say} />
            </section>

            {/* ---------- Email reminders ---------- */}
            <section className="set-section" id="email">
              <div className="set-eyebrow">Email reminders</div>
              <EmailReminders userId={userId} userEmail={userEmail} onToast={say} />
            </section>

            {/* ---------- Help & legal ---------- */}
            <section className="set-section" id="help">
              <div className="set-eyebrow">Help &amp; legal</div>
              <div className="set-card">
                <div className="set-row">
                  <div className="set-rowhead">
                    <div className="set-rowtext">
                      <h3 className="set-h3">Report a bug</h3>
                      <p className="set-desc">
                        Something broken or behaving oddly? Send it over — the message opens
                        pre-filled, and the more detail about what you were doing, the better.
                      </p>
                    </div>
                    <a className="btn ghost set-action" href={bugReportHref}>
                      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true"><path d={BUG_ICON_PATH} /></svg>
                      Report a bug
                    </a>
                  </div>
                </div>
                <div className="set-row">
                  <div className="set-rowhead">
                    <div className="set-rowtext">
                      <h3 className="set-h3">Get in touch</h3>
                      <p className="set-desc">
                        Questions, feedback or a feature you wish existed — write to <b>{CONTACT}</b>.
                      </p>
                    </div>
                    <a className="btn ghost set-action" href={`mailto:${CONTACT}`}>
                      <svg className="ic" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M3 7l9 6 9-6M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1z" />
                      </svg>
                      Send an email
                    </a>
                  </div>
                </div>
                <div className="set-row">
                  <span className="set-label">Legal</span>
                  <div className="set-links">
                    {LEGAL.map((l) => (
                      <Link key={l.href} className="set-link" href={l.href}>
                        {l.label}
                        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 18l6-6-6-6" /></svg>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </section>

            {/* ---------- Account ---------- */}
            <section className="set-section" id="account">
              <div className="set-eyebrow">Account</div>
              <div className="set-card danger">
                <div className="set-row">
                  <div className="set-rowhead">
                    <div className="set-rowtext">
                      <h3 className="set-h3 danger">Delete account</h3>
                      <p className="set-desc">Permanently delete your account and every project. This can&apos;t be undone.</p>
                      {/* The route redirects here with ?deleted=partial when the
                          projects went but the login record couldn't. Saying so
                          beats sending them home as if it had all worked. */}
                      {deleteFailed && (
                        <p className="set-desc danger" role="alert">
                          Your projects were deleted, but the login record couldn&apos;t be removed.
                          Email {CONTACT} and we&apos;ll finish it by hand.
                        </p>
                      )}
                    </div>
                    {!confirmDel && (
                      <button className="btn danger set-action" disabled={checkingHandover}
                        onClick={beginDelete}>{checkingHandover ? 'Checking…' : 'Delete…'}</button>
                    )}
                  </div>

                  {confirmDel && (
                    <form action="/auth/delete" method="post" onSubmit={handoverThenDelete}>
                      {/* Only the projects that actually need a decision: ones
                          where you are the last owner and other people are on
                          them. Everything else resolves without asking. */}
                      {handover.length > 0 && (
                        <div className="set-handover">
                          <p className="set-desc">
                            {handover.length === 1
                              ? 'This project has other members. Choose who takes it over:'
                              : `These ${handover.length} projects have other members. Choose who takes each one over:`}
                          </p>
                          {handover.map((row) => (
                            <div key={row.project_id} className="set-handover-row">
                              <span className="set-handover-name">{row.project_name || 'Untitled project'}</span>
                              <select className="set-input" value={heirs[row.project_id] ?? ''}
                                aria-label={`New owner for ${row.project_name || 'Untitled project'}`}
                                onChange={(e) => setHeirs((h) => ({ ...h, [row.project_id]: e.target.value }))}>
                                {(row.candidates ?? []).map((c) => (
                                  <option key={c.user_id} value={c.user_id}>{c.email}</option>
                                ))}
                              </select>
                            </div>
                          ))}
                          <p className="set-hint">
                            The longest-standing member is pre-selected. Leave it as is and that&apos;s who gets it.
                          </p>
                        </div>
                      )}
                      <div className="set-confirm">
                        <button className="btn ghost" type="button" onClick={() => setConfirmDel(false)}>Cancel</button>
                        <button className="btn danger-solid" type="submit" disabled={busy}>
                          {busy ? 'Deleting…' : 'Delete my account'}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      <Toast toast={toast} />
    </div>
  );
}
