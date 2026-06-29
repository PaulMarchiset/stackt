import type { Metadata } from 'next';
import Logo from '../Logo';
import LoginForm from './LoginForm';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false, follow: false } };

export default function LoginPage() {
  return (
    <main className="auth-screen">
      <div className="auth-card">
        <Logo height={28} className="auth-logo" />
        <LoginForm />
      </div>
    </main>
  );
}
