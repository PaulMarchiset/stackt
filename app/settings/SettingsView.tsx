'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Logo from '@/app/Logo';
import AccountMenu from '@/app/components/AccountMenu';
import EmailReminders from './EmailReminders';
import { createClient } from '@/lib/supabase/client';
import { useDevMode } from '@/lib/useDevMode';

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
  { id: 'email', label: 'Email reminders' },
  { id: 'account', label: 'Account' }
] as const;

export default function SettingsView({ userId, userEmail, userName = '' }: { userId: string; userEmail: string; userName?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [devMode, setDevMode] = useDevMode();
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [busy, setBusy] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [toast, setToast] = useState<{ msg: string; error: boolean } | null>(null);
  const toastTimer = useRef<number>(0);

  const say = useCallback((msg: string, error = false) => {
    setToast({ msg, error });
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2800);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

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

            {/* ---------- Email reminders ---------- */}
            <section className="set-section" id="email">
              <div className="set-eyebrow">Email reminders</div>
              <EmailReminders userId={userId} userEmail={userEmail} onToast={say} />
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
                    </div>
                    {!confirmDel ? (
                      <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete…</button>
                    ) : (
                      <div className="set-confirm">
                        <button className="btn ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
                        <form action="/auth/delete" method="post">
                          <button className="btn danger-solid" type="submit">Delete my account</button>
                        </form>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </main>
        </div>
      </div>

      {toast && <div className={'toast show' + (toast.error ? ' error' : '')}>{toast.msg}</div>}
    </div>
  );
}
