import type { Metadata } from 'next';
import Logo from '../Logo';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <Logo height={28} className="auth-logo" />
        <p className="auth-sub">Plan and track updates across your projects.</p>
        <LoginForm />
      </div>
    </main>
  );
}
