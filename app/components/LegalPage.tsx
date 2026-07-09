import Link from 'next/link';
import Logo from '@/app/Logo';

/**
 * Shared shell for the legal pages (legal notice, terms, privacy). Keeps the
 * three pages visually consistent: brand header, readable prose column, and a
 * cross-links footer. Content is passed as children.
 */
export default function LegalPage({
  title, updated, children
}: {
  title: string; updated: string; children: React.ReactNode;
}) {
  return (
    <div className="legal">
      <header className="legal-nav">
        <Link href="/" className="brand" aria-label="Stackt home">
          <Logo height={22} className="brand-logo-full" />
        </Link>
        <Link className="btn ghost" href="/">Back to site</Link>
      </header>

      <main className="legal-main">
        <h1 className="legal-title">{title}</h1>
        <p className="legal-updated">Last updated: {updated}</p>
        <div className="legal-prose">{children}</div>
      </main>

      <footer className="legal-footer">
        <Link href="/legal">Legal notice</Link>
        <span aria-hidden>·</span>
        <Link href="/terms">Terms of Use</Link>
        <span aria-hidden>·</span>
        <Link href="/privacy">Privacy Policy</Link>
      </footer>
    </div>
  );
}
