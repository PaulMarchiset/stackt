import type { Metadata } from 'next';
import LegalPage from '@/app/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The terms governing your use of Stackt.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="8 July 2026">
      <p>
        These Terms of Use (“Terms”) govern your access to and use of Stackt (the “Service”),
        published by Paul Marchiset. By creating an account or using the Service, you agree to these
        Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Stackt is a free web application for planning and tracking work on kanban boards and a
        timeline. It is provided free of charge and “as is”, and may change or be discontinued at any
        time.
      </p>

      <h2>2. Account &amp; access</h2>
      <p>
        You sign in with your email address (via a one-time code) or with Google. You are responsible
        for the security of your email account and for all activity under your account. You must
        provide a valid email address and be legally able to enter into these Terms.
      </p>

      <h2>3. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>
          <strong>store personal data about other people</strong> (names, contact details, health,
          financial, or any sensitive information about identifiable individuals). Stackt is a
          personal planning tool, not a system of record for third-party personal data;
        </li>
        <li>store or share unlawful, infringing, harmful, or offensive content;</li>
        <li>attempt to breach, probe, or disrupt the Service, its security, or other users’ data;</li>
        <li>use the Service in violation of any applicable law or regulation.</li>
      </ul>
      <p>
        You are solely responsible for the content you enter. Keep board and card text limited to
        your own project information.
      </p>

      <h2>4. Your content</h2>
      <p>
        You retain all rights to the content you create. You grant the publisher only the technical
        permissions needed to store and display that content back to you as part of operating the
        Service. Each account’s boards are private to that account.
      </p>

      <h2>5. Availability &amp; warranty</h2>
      <p>
        The Service is provided without warranty of any kind. We do not guarantee that it will be
        uninterrupted, error-free, or that data will never be lost. You are responsible for keeping
        your own backups of anything important.
      </p>

      <h2>6. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, the publisher shall not be liable for any indirect or
        consequential damages, or for any loss of data, arising from your use of the Service.
      </p>

      <h2>7. Termination</h2>
      <p>
        You may stop using the Service and request deletion of your account at any time. We may
        suspend or terminate access that breaches these Terms.
      </p>

      <h2>8. Changes</h2>
      <p>
        We may update these Terms. Material changes will be reflected by the “Last updated” date
        above. Continued use after changes constitutes acceptance.
      </p>

      <h2>9. Governing law</h2>
      <p>
        These Terms are governed by French law. Any dispute will be subject to the competent courts,
        subject to any mandatory consumer protections. Questions:{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>.
      </p>
    </LegalPage>
  );
}
