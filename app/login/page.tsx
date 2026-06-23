import Logo from '../Logo';
import LoginForm from './LoginForm';

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
