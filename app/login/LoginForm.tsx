'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const supabase = createClient();
  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

  async function sendMagicLink(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: redirectTo }
    });
    setBusy(false);
    if (error) {
      console.error('signInWithOtp error:', error);
      setError(error.message || "Impossible d'envoyer l'email — vérifie la configuration SMTP.");
    } else setSent(true);
  }

  async function signInWithGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });
    if (error) {
      console.error('signInWithOAuth error:', error);
      setError(error.message || 'Connexion Google indisponible.');
    }
  }

  if (sent) {
    return (
      <div className="auth-sent">
        <p>
          Check <strong>{email}</strong> for a sign-in link.
        </p>
        <button className="btn ghost" onClick={() => setSent(false)}>
          Use a different email
        </button>
      </div>
    );
  }

  return (
    <div className="auth-form">
      <button className="btn google" onClick={signInWithGoogle}>
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <path fill="#4285F4" d="M22.5 12.2c0-.7-.06-1.4-.18-2.06H12v3.9h5.9a5 5 0 0 1-2.18 3.3v2.74h3.52c2.06-1.9 3.26-4.7 3.26-7.88Z" />
          <path fill="#34A853" d="M12 23c2.95 0 5.43-.98 7.24-2.65l-3.52-2.74c-.98.66-2.23 1.05-3.72 1.05-2.86 0-5.28-1.93-6.15-4.53H2.2v2.84A11 11 0 0 0 12 23Z" />
          <path fill="#FBBC05" d="M5.85 14.13a6.6 6.6 0 0 1 0-4.26V7.03H2.2a11 11 0 0 0 0 9.94l3.65-2.84Z" />
          <path fill="#EA4335" d="M12 4.75c1.6 0 3.06.55 4.2 1.64l3.13-3.13C17.43 1.5 14.95.5 12 .5A11 11 0 0 0 2.2 7.03l3.65 2.84C6.72 6.68 9.14 4.75 12 4.75Z" />
        </svg>
        Continue with Google
      </button>
      <div className="auth-divider"><span>or</span></div>

      <form onSubmit={sendMagicLink}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
        />
        <button className="btn solid auth-submit" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a sign-in link'}
        </button>
      </form>

      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
