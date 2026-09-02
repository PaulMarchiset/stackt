import type { Metadata } from 'next';
import LegalPage from '@/app/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description: 'How Stackt collects and handles your data.',
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" updated="2 September 2026">
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
          you enter. Please keep out of it anything listed in{' '}
          <a href="/terms">section 3 of the Terms of Use</a>.
        </li>
        <li>
          <strong>Who you share with</strong> — for each project, the list of its members and their
          email addresses, plus any invitation you have sent and not yet had claimed. An invitation
          holds only the address it was sent to, and is deleted once claimed or expired.
        </li>
        <li>
          <strong>Your preferences</strong> — reminder settings, favourites, ordering, and how you
          have arranged your board.
        </li>
        <li>
          <strong>Technical data</strong> — essential session/authentication cookies required to keep
          you signed in. We do not use advertising or third-party tracking cookies, and we run no
          analytics.
        </li>
      </ul>

      <h2>3. Why we use it (legal bases)</h2>
      <ul>
        <li>To provide the Service and your account — performance of our agreement with you.</li>
        <li>
          To let you share a project and to tell an invited person they have been invited — also
          performance of our agreement with you, and our legitimate interest in the Service being
          usable by more than one person.
        </li>
        <li>To send the daily reminder email — only if you switch it on, and only for the projects you pick.</li>
        <li>To secure the Service and prevent abuse — our legitimate interest.</li>
      </ul>
      <p>
        <strong>If you were invited and have no account:</strong> we hold your email address because
        someone entered it to invite you, on the basis of our legitimate interest in delivering that
        invitation. The invitation email itself is how we inform you of this (Article 14 GDPR). We
        use the address for nothing else, it is deleted once the invitation is claimed or expires,
        and you can ask us to remove it immediately at{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>.
      </p>

      <h2>4. What other people can see</h2>
      <p>
        A project is private to its members. When you invite someone to one, they can read, add,
        edit and delete everything in that project, and they will see your email address; you will
        see theirs. Projects you have not shared remain visible to you alone. We have no way to
        control what a person you invited does with what they can see — deciding who to invite is
        yours to make.
      </p>

      <h2>5. Processors, and where data is stored</h2>
      <p>These are the only third parties that touch your data, and what each one gets:</p>
      <ul>
        <li>
          <strong>Supabase</strong> (Supabase, Inc.) — authentication and database hosting. Holds
          your account and all of your content. Stored in the <strong>European Union (Ireland)</strong>.
        </li>
        <li>
          <strong>Vercel Inc.</strong> — serves the application. Handles requests; does not store your
          content.
        </li>
        <li>
          <strong>Brevo</strong> (Sendinblue SAS, France) — sends the reminder and invitation emails.
          Receives the recipient’s email address and the message itself.
        </li>
      </ul>
      <p>
        Because email leaves our infrastructure and stays in an inbox for years, our emails are
        written to carry as little as possible. The daily reminder contains{' '}
        <strong>counts and dates only</strong> — never a task title, a project name or a version
        name. An invitation email names the person who invited you and nothing else — not the project.
        Brevo therefore never receives the contents of your boards.
      </p>
      <p>These providers process data on our behalf under their own data-processing terms. No data is sold, mined, used to train models, or shared for marketing.</p>

      <h2>6. Retention</h2>
      <p>
        We keep your account and content for as long as your account is active. Deleting your account
        (from the settings page, or on request) removes your projects, cards, groups and preferences
        from the live Service promptly. Where a project you own has other members, the project itself
        survives and passes to the longest-standing member — your membership and your account are
        removed, their work is not. Residual copies are fully purged from backups within a maximum of
        2 years, except where the law requires us to keep certain records. Unclaimed invitations
        expire on their own.
      </p>

      <h2>7. Security</h2>
      <p>
        Transport encryption, encryption at rest by our hosting providers, row-level access control
        in the database so a project is reachable only by its members, and a content security policy
        in the browser. The application source code is public under the GPL, so these claims can be
        inspected rather than trusted.
      </p>
      <p>
        No service can promise it will never be breached. If a personal data breach occurs, we will
        notify the CNIL within 72 hours where the law requires it, and we will inform you directly,
        without undue delay, whenever the breach is likely to result in a high risk to your rights
        and freedoms (Articles 33 and 34 GDPR).
      </p>

      <h2>8. Your rights</h2>
      <p>Under the GDPR you have the right to:</p>
      <ul>
        <li>access the data we hold about you;</li>
        <li>rectify inaccurate data;</li>
        <li>erase your data (“right to be forgotten”);</li>
        <li>export your data (portability);</li>
        <li>object to or restrict certain processing;</li>
        <li>withdraw consent at any time, where processing rests on it.</li>
      </ul>
      <p>
        To exercise any of these, email{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>. You may also lodge a
        complaint with your data protection authority (in France, the CNIL —{' '}
        <a href="https://www.cnil.fr">cnil.fr</a>).
      </p>

      <h2>9. Changes</h2>
      <p>
        We may update this policy; the “Last updated” date above reflects the latest version.
      </p>
    </LegalPage>
  );
}
