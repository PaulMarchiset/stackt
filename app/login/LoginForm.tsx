'use client';

import { useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

const CODE_LENGTH = 6; // must match Supabase "Email OTP Length"

/** Segmented code input: one box per digit, with auto-advance, backspace and paste. */
function CodeBoxes({ value, onChange, onComplete }: {
  value: string; onChange: (v: string) => void; onComplete: () => void;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const setAt = (i: number, ch: string) => {
    const arr = value.padEnd(CODE_LENGTH, ' ').split('');
    arr[i] = ch || ' ';
    return arr.join('').replace(/ /g, '').slice(0, CODE_LENGTH);
  };
  return (
    <div className="otp">
      {Array.from({ length: CODE_LENGTH }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          className="otp-box"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={1}
          value={value[i] ?? ''}
          autoFocus={i === 0}
          onChange={(e) => {
            const d = e.target.value.replace(/\D/g, '');
            if (!d) { onChange(setAt(i, '')); return; }
            const next = setAt(i, d[d.length - 1]);
            onChange(next);
            if (i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
            else if (next.length === CODE_LENGTH) onComplete();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace') {
              e.preventDefault();
              if (value[i]) onChange(setAt(i, ''));
              else if (i > 0) { refs.current[i - 1]?.focus(); onChange(setAt(i - 1, '')); }
            } else if (e.key === 'ArrowLeft' && i > 0) refs.current[i - 1]?.focus();
            else if (e.key === 'ArrowRight' && i < CODE_LENGTH - 1) refs.current[i + 1]?.focus();
          }}
          onPaste={(e) => {
            e.preventDefault();
            const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LENGTH);
            if (!digits) return;
            onChange(digits);
            const idx = Math.min(digits.length, CODE_LENGTH - 1);
            refs.current[idx]?.focus();
            if (digits.length === CODE_LENGTH) onComplete();
          }}
        />
      ))}
    </div>
  );
}

export default function LoginForm() {
  const supabase = createClient();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const redirectTo =
    typeof window !== 'undefined' ? `${window.location.origin}/auth/callback` : undefined;

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { shouldCreateUser: true }
    });
    setBusy(false);
    if (error) {
      console.error('signInWithOtp error:', error);
      setError(error.message || "Couldn't send the code — check the email or SMTP config.");
    } else {
      setStep('code');
    }
  }

  async function verify(e?: React.FormEvent) {
    e?.preventDefault();
    if (busy || code.length < CODE_LENGTH) return;
    setError('');
    setBusy(true);
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token: code.trim(),
      type: 'email'
    });
    setBusy(false);
    if (error) {
      console.error('verifyOtp error:', error);
      setError(error.message || 'Invalid or expired code.');
    } else {
      window.location.assign('/projects'); // full reload so the server sees the new session
    }
  }

  async function signInWithGoogle() {
    setError('');
    const { error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo } });
    if (error) {
      console.error('signInWithOAuth error:', error);
      setError(error.message || 'Google sign-in unavailable.');
    }
  }

  if (step === 'code') {
    return (
      <div className="auth-form">
        <p className="auth-codenote">
          We sent a {CODE_LENGTH}-digit code to <strong>{email}</strong>.
        </p>
        <form onSubmit={verify}>
          <CodeBoxes value={code} onChange={setCode} onComplete={() => verify()} />
          <button className="btn solid auth-submit" type="submit" disabled={busy || code.length < CODE_LENGTH}>
            {busy ? 'Verifying…' : 'Verify & sign in'}
          </button>
        </form>
        <button className="btn ghost" onClick={() => { setStep('email'); setCode(''); setError(''); }}>
          Use a different email
        </button>
        {error && <p className="auth-error">{error}</p>}
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
      <form onSubmit={sendCode}>
        <input
          type="email"
          required
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="auth-input"
        />
        <button className="btn solid auth-submit" type="submit" disabled={busy}>
          {busy ? 'Sending…' : 'Email me a code'}
        </button>
      </form>
      {error && <p className="auth-error">{error}</p>}
    </div>
  );
}
