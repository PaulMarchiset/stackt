'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Logo from '@/app/Logo';
import AccountMenu from '@/app/components/AccountMenu';
import EmailReminders from './EmailReminders';
import { createClient } from '@/lib/supabase/client';
import { useDevMode } from '@/lib/useDevMode';

/**
 * Dedicated settings page (replaces the old modal). Profile (name + email) lives
 * in Supabase auth; developer mode is a per-device default; and the account
 * danger zone deletes everything. Styled to match the projects home: canvas
 * background, soft header, big display title, plain divided rows (no cards).
 */
export default function SettingsView({ userId, userEmail, userName = '' }: { userId: string; userEmail: string; userName?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [devMode, setDevMode] = useDevMode();
  const [name, setName] = useState(userName);
  const [email, setEmail] = useState(userEmail);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [confirmDel, setConfirmDel] = useState(false);

  async function saveName() {
    setBusy(true); setMsg('');
    const { error } = await supabase.auth.updateUser({ data: { username: name.trim() } });
    setBusy(false);
    setMsg(error ? 'Could not save your name — try again.' : 'Name updated.');
  }

  async function saveEmail() {
    const next = email.trim();
    if (!next || next === userEmail) return;
    setBusy(true); setMsg('');
    const emailRedirectTo = typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;
    const { error } = await supabase.auth.updateUser({ email: next }, { emailRedirectTo });
    setBusy(false);
    setMsg(error
      ? (error.message || 'Could not update email — try again.')
      : 'Almost there — we sent a confirmation link to the new address. The change applies once you click it.');
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

      <main className="settings-main">
        <h1 className="settings-title">Settings</h1>
        <p className="settings-sub">Signed in as <strong>{userEmail}</strong></p>

        <section className="settings-group">
          <div className="settings-group-label">Profile</div>
          <div className="settings-field">
            <label className="settings-field-label">Display name</label>
            <p className="settings-field-desc">Shown on your avatar and in the account menu.</p>
            <div className="settings-field-row">
              <input className="settings-input" value={name} spellCheck={false} placeholder="Your name"
                onChange={(e) => setName(e.target.value)} />
              <button className="btn ghost" onClick={saveName} disabled={busy || name.trim() === userName.trim()}>Save</button>
            </div>
          </div>
          <div className="settings-field">
            <label className="settings-field-label">Email</label>
            <p className="settings-field-desc">Changing it sends a confirmation link to the new address before it takes effect.</p>
            <div className="settings-field-row">
              <input className="settings-input" type="email" value={email} spellCheck={false} inputMode="email"
                onChange={(e) => setEmail(e.target.value)} />
              <button className="btn ghost" onClick={saveEmail} disabled={busy || email.trim() === userEmail}>Save</button>
            </div>
          </div>
          {msg && <p className="settings-msg">{msg}</p>}
        </section>

        <section className="settings-group">
          <div className="settings-group-label">Preferences</div>
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-title">Developer mode <span className="settings-tag">default</span></div>
              <div className="setting-desc">
                The default for new boards: shows the git repository button and branch fields. Turn it
                off to simplify to tasks, phases and urgent flags. Each project can override this.
              </div>
            </div>
            <button className={'switch' + (devMode ? ' on' : '')} role="switch" aria-checked={devMode}
              aria-label="Developer mode" onClick={() => setDevMode(!devMode)}><span /></button>
          </div>
        </section>

        <EmailReminders userId={userId} />

        <section className="settings-group">
          <div className="settings-group-label">Account</div>
          <div className="setting-row">
            <div className="setting-text">
              <div className="setting-title">Delete account</div>
              <div className="setting-desc">Permanently delete your account and every project. This can&apos;t be undone.</div>
            </div>
            {!confirmDel ? (
              <button className="btn danger" onClick={() => setConfirmDel(true)}>Delete…</button>
            ) : (
              <div className="settings-confirm">
                <button className="btn ghost" onClick={() => setConfirmDel(false)}>Cancel</button>
                <form action="/auth/delete" method="post">
                  <button className="btn danger-solid" type="submit">Delete my account</button>
                </form>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
