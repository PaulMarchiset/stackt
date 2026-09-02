import type { Metadata } from 'next';
import LegalPage from '@/app/components/LegalPage';

export const metadata: Metadata = {
  title: 'Terms of Use',
  description: 'The terms governing your use of Stackt.',
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Use" updated="2 September 2026">
      <p>
        These Terms of Use (“Terms”) govern your access to and use of Stackt (the “Service”),
        published by Paul Marchiset. By creating an account or using the Service, you agree to these
        Terms. If you do not agree, do not use the Service.
      </p>

      <h2>1. The Service</h2>
      <p>
        Stackt is a free web application for planning and tracking work on kanban boards and a
        timeline, alone or with people you invite. It is provided free of charge and “as is”, and may
        change or be discontinued at any time.
      </p>

      <h2>2. Account &amp; access</h2>
      <p>
        You sign in with your email address (via a one-time code) or with Google. Access to your
        account therefore depends on continued access to that mailbox:{' '}
        <strong>whoever controls your email can sign in as you</strong>. Securing it — a strong,
        unique password and two-factor authentication — is your responsibility and is the single most
        effective protection for your Stackt data. You are responsible for all activity under your
        account.
      </p>
      <p>
        You must be at least <strong>15 years old</strong> and legally able to enter into these
        Terms. If you are younger, the account must be created and held by a parent or guardian.
      </p>

      <h2>3. What not to put in Stackt</h2>
      <p>
        Stackt is a planning tool. It is not built, audited or certified to hold regulated or highly
        sensitive information, and you agree not to enter into it:
      </p>
      <ul>
        <li>
          <strong>Special categories of personal data</strong> as defined by Article 9 GDPR — data
          revealing racial or ethnic origin, political opinions, religious or philosophical beliefs,
          trade union membership, genetic or biometric data, health data, or data concerning a
          person’s sex life or sexual orientation;
        </li>
        <li>
          <strong>Data subject to a specific legal regime</strong> — medical records, payment card
          numbers, government identifiers, or anything covered by professional secrecy;
        </li>
        <li>credentials, passwords, API keys or access tokens;</li>
        <li>unlawful, infringing, harmful or offensive content;</li>
        <li>content that breaches an obligation of confidentiality you are bound by.</li>
      </ul>
      <p>
        This is a limit on what the Service is designed for, not a disclaimer of our obligations: it
        tells you plainly what Stackt is fit to hold, so you can decide what belongs here. Ordinary
        project information — task names, notes, dates, and the email addresses of people you work
        with — is exactly what it is for.
      </p>
      <p>
        You must also not attempt to breach, probe or disrupt the Service, its security, or other
        people’s data, or use it in violation of any applicable law.
      </p>

      <h2>4. Shared projects</h2>
      <p>
        You can invite others to a project by email. When you do:
      </p>
      <ul>
        <li>
          <strong>you choose who sees that project.</strong> Everyone you add can read, add, edit and
          delete everything in it. We cannot control what they do with what they see, and inviting
          someone is your decision and your responsibility;
        </li>
        <li>
          the person you invite will learn <strong>your email address</strong>, and you will learn
          theirs — this is how people identify each other on a shared board;
        </li>
        <li>
          you must have a legitimate reason to enter someone’s email address, and you must be
          entitled to share with them whatever the project contains;
        </li>
        <li>
          an invitation is addressed to an email address and expires on its own if unclaimed. Sending
          invitations to people who did not ask for them is a misuse of the Service.
        </li>
      </ul>

      <h2>5. Your content</h2>
      <p>
        You retain all rights to the content you create. You grant the publisher only the technical
        permissions needed to store, transmit and display that content as part of operating the
        Service. Projects are private to their members and are never sold, mined, used to train
        models, or shared for marketing.
      </p>

      <h2>6. Security, and what happens if something goes wrong</h2>
      <p>
        We take reasonable and appropriate technical measures to protect your data: transport
        encryption, encryption at rest by our hosting providers, row-level access control in the
        database so each project is reachable only by its members, and a content security policy in
        the browser. The application source code is public, so these claims can be checked rather
        than taken on trust.
      </p>
      <p>
        No online service can promise it will never be breached, and we do not make that promise. What
        we do commit to is this: <strong>if a personal data breach occurs, we will notify the CNIL
        within 72 hours where the law requires it, and we will inform you directly, without undue
        delay, whenever the breach is likely to result in a high risk to your rights and freedoms</strong>{' '}
        (Articles 33 and 34 GDPR). Our obligations under data protection law cannot be, and are not,
        waived by these Terms.
      </p>
      <p>
        Section 3 exists because of this. The measures above are proportionate to a planning tool
        holding ordinary project information; they are not the measures a medical record or a payment
        credential would require. Keeping such data out of Stackt is what keeps the protection
        proportionate to the risk.
      </p>

      <h2>7. Availability, backups &amp; warranty</h2>
      <p>
        The Service is provided without warranty of any kind. We do not guarantee that it will be
        uninterrupted, error-free, or that data will never be lost. Backups are operational
        safeguards for our own infrastructure, not a recovery service offered to you:{' '}
        <strong>you are responsible for keeping your own copies of anything you cannot afford to
        lose</strong>.
      </p>

      <h2>8. Limitation of liability</h2>
      <p>
        Stackt is supplied free of charge. To the maximum extent permitted by law, the publisher
        shall not be liable for indirect or consequential damages, loss of profit, loss of
        opportunity, or loss of data arising from your use of the Service, nor for the acts of people
        you have invited to your projects.
      </p>
      <p>
        Nothing in these Terms excludes or limits liability where the law does not allow it —
        including liability for death or personal injury caused by negligence, for fraud or wilful
        misconduct, for gross negligence, under mandatory French consumer protection rules, or under
        data protection law.
      </p>

      <h2>9. Termination</h2>
      <p>
        You may stop using the Service and delete your account at any time from the settings page.
        Deleting your account removes your projects and content; where a project you own has other
        members, ownership passes to the longest-standing member so their work is not destroyed with
        your account. We may suspend or terminate access that breaches these Terms.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms. Material changes will be reflected by the “Last updated” date
        above. Continued use after changes constitutes acceptance.
      </p>

      <h2>11. Governing law</h2>
      <p>
        These Terms are governed by French law. Any dispute will be subject to the competent courts,
        subject to any mandatory consumer protections. Questions:{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>.
      </p>
    </LegalPage>
  );
}
