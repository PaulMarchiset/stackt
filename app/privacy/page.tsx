import type { Metadata } from 'next';
import LegalPage from '@/app/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Stackt collects and handles your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="8 July 2026">
      <p>
        This Privacy Policy explains what data Stackt (the “Service”) collects, why, and your rights
        over it. It is written to align with the EU General Data Protection Regulation (GDPR).
      </p>

      <h2>1. Data controller</h2>
      <p>
        The data controller is <strong>Paul Marchiset</strong>. For any privacy request, contact{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>.
      </p>

      <h2>2. Data we collect</h2>
      <ul>
        <li>
          <strong>Your email address</strong> — used to create your account and sign you in (one-time
          email code, or Google sign-in).
        </li>
        <li>
          <strong>Content you create</strong> — the projects, cards, versions/phases, dates and notes
          you enter. Please do not enter personal data about other people (see our{' '}
          <a href="/terms">Terms of Use</a>).
        </li>
        <li>
          <strong>Technical data</strong> — essential session/authentication cookies required to keep
          you signed in. We do not use advertising or third-party tracking cookies.
        </li>
      </ul>

      <h2>3. Why we use it (legal bases)</h2>
      <ul>
        <li>To provide the Service and your account — performance of our agreement with you.</li>
        <li>To secure the Service and prevent abuse — our legitimate interest.</li>
      </ul>

      <h2>4. Processors &amp; where data is stored</h2>
      <p>
        We rely on <strong>Supabase</strong> (Supabase, Inc.) for authentication and database hosting,
        and on <strong>Vercel Inc.</strong> to serve the application. These providers process data on
        our behalf under their own security and data-processing terms. Your account and content data
        is stored in the European Union (Ireland). No data is sold or shared for marketing.
      </p>

      <h2>5. Retention</h2>
      <p>
        We keep your account and content for as long as your account is active. When you delete your
        account (from the app or on request), it is removed from the live Service promptly, and fully
        purged from our systems and backups within a maximum of 2 years, except where the law requires
        us to keep certain records.
      </p>

      <h2>6. Your rights</h2>
      <p>Under the GDPR you have the right to:</p>
      <ul>
        <li>access the data we hold about you;</li>
        <li>rectify inaccurate data;</li>
        <li>erase your data (“right to be forgotten”);</li>
        <li>export your data (portability);</li>
        <li>object to or restrict certain processing.</li>
      </ul>
      <p>
        To exercise any of these, email{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>. You may also lodge a complaint with your
        data protection authority (in France, the CNIL — <a href="https://www.cnil.fr">cnil.fr</a>).
      </p>

      <h2>7. Changes</h2>
      <p>
        We may update this policy; the “Last updated” date above reflects the latest version.
      </p>
    </LegalPage>
  );
}
