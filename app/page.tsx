import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import Logo from './Logo';

export const dynamic = 'force-dynamic';

export default async function Landing() {
  const supabase = createClient();
  const {
    data: { user }
  } = await supabase.auth.getUser();
  const ctaHref = user ? '/projects' : '/login';
  const ctaLabel = user ? 'Open your projects' : 'Get started — free';

  const features: { bar: string; title: string; body: string }[] = [
    { bar: '#E58E36', title: 'A board that gets out of the way', body: 'To do · In progress · Done. Drag a card, it moves. No setup, no ceremony, no 12-step onboarding.' },
    { bar: '#4B73F5', title: 'Versioned by design', body: 'Group cards by version, give each release its own color, and archive it in one click when it ships.' },
    { bar: '#2CBE3D', title: 'Bugs, not buried', body: 'Log a bug the second you find it and filter the board down to just bugs when it’s time to squash them.' },
    { bar: '#E58E36', title: 'Timeline view', body: 'A horizontal calendar of what’s due, day by day. Add an update from a draggable popup — right where you’re looking.' },
    { bar: '#4B73F5', title: 'Many projects, one home', body: 'Side projects, client work, that thing you’ll definitely finish — switch between them instantly.' },
    { bar: '#2CBE3D', title: 'Private by default', body: 'Every board is yours alone, secured per account with row-level security. No one peeks at your roadmap.' }
  ];

  return (
    <div className="lp">
      <header className="lp-nav">
        <Logo height={22} className="brand-logo-full" />
        <div className="meta-spacer" />
        {user ? (
          <Link className="btn solid" href="/projects">Open your projects</Link>
        ) : (
          <>
            <Link className="btn ghost" href="/login">Sign in</Link>
            <Link className="btn solid" href="/login">Get started</Link>
          </>
        )}
      </header>

      <section className="lp-hero">
        <div className="lp-tag">For developers who ship</div>
        <h1 className="lp-h1">Plan your updates.<br />Ship with less chaos.</h1>
        <p className="lp-sub">
          Stackt is a dead-simple board for planning releases — versions, bugs and a timeline — whether
          you’re flying solo or shipping with a team.
        </p>
        <div className="lp-cta">
          <Link className="btn solid lp-big" href={ctaHref}>{ctaLabel}</Link>
          <span className="lp-note">Sign in with Google or a magic link — no password to remember.</span>
        </div>

        {/* Mini board mockup */}
        <div className="lp-mock">
          <div className="lp-mock-bar"><span /><span /><span /></div>
          <div className="lp-mock-cols">
            <div className="lp-mc todo"><b>To do</b><div className="lp-mcard">Dark mode toggle<i className="lp-pill v">v1.4.0</i></div><div className="lp-mcard">Export to CSV<i className="lp-pill v">v1.4.0</i></div></div>
            <div className="lp-mc prog"><b>In progress</b><div className="lp-mcard">Batch processing<i className="lp-pill v g">v1.5.0</i></div></div>
            <div className="lp-mc done"><b>Done</b><div className="lp-mcard bug">Crash on save<i className="lp-pill bug">BUG</i></div><div className="lp-mcard">French i18n<i className="lp-pill v g">v1.5.0</i></div></div>
          </div>
        </div>
      </section>

      <section className="lp-features">
        {features.map((f, i) => (
          <div key={i} className="lp-feature">
            <span className="lp-fbar" style={{ background: f.bar }} />
            <h3>{f.title}</h3>
            <p>{f.body}</p>
          </div>
        ))}
      </section>

      <section className="lp-final">
        <h2 className="lp-h2">Creating an account takes <span className="nowrap">10 seconds</span></h2>
        <p className="lp-sub">No credit card, no setup wizard. Click, sign in, start tracking.</p>
        <Link className="btn solid lp-big" href={ctaHref}>{ctaLabel}</Link>
      </section>

      <footer className="lp-footer">
        <div className="lp-footer-inner">
          <div className="lp-footer-brand">
            <Logo height={18} className="brand-logo-full" />
            <span>Plan and track your updates.</span>
          </div>
          <a className="lp-footer-made" href="https://paulmarchiset.me" target="_blank" rel="noreferrer">
            Made by <strong>Paul Marchiset</strong>
          </a>
        </div>
      </footer>
    </div>
  );
}
