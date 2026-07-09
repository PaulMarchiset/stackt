import type { Metadata } from 'next';
import Logo from '../Logo';
import LoginForm from '../login/LoginForm';

export const metadata: Metadata = { title: 'Create account', robots: { index: false, follow: false } };

export default function SignupPage() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <Logo height={28} className="auth-logo" />
        <LoginForm mode="signup" />
      </div>
      <nav className="auth-legal">
        <a href="/legal">Legal notice</a>
        <a href="/terms">Terms of Use</a>
        <a href="/privacy">Privacy Policy</a>
      </nav>
    </main>
  );
}
