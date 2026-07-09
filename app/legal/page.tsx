import type { Metadata } from 'next';
import LegalPage from '@/app/components/LegalPage';

export const metadata: Metadata = {
  title: 'Legal Notice',
  description: 'Legal notice and publisher information for Stackt.',
};

export default function LegalNoticePage() {
  return (
    <LegalPage title="Legal Notice" updated="8 July 2026">
      <p>
        This legal notice applies to the website and application available at{' '}
        <a href="https://stackt.paulmarchiset.me">stackt.paulmarchiset.me</a> (the “Service”).
      </p>

      <h2>Publisher</h2>
      <p>
        The Service is published by <strong>Paul Marchiset</strong>, as a private individual (not a
        registered company).
        <br />
        Contact: <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>
        <br />
        Website: <a href="https://paulmarchiset.me">paulmarchiset.me</a>
      </p>

      <h2>Publication director</h2>
      <p>Paul Marchiset.</p>

      <h2>Hosting</h2>
      <p>
        The application is hosted by <strong>Vercel Inc.</strong>, 340 S Lemon Ave #4133, Walnut, CA
        91789, USA (<a href="https://vercel.com">vercel.com</a>). The database and authentication are
        operated through <strong>Supabase</strong> (Supabase, Inc.), with data stored in the European
        Union (Ireland).
      </p>

      <h2>Intellectual property</h2>
      <p>
        The Stackt name, interface and source presentation are the property of the publisher, except
        for third-party components used under their respective licenses. The application source code
        is distributed under the GNU General Public License v3.0 or later.
      </p>

      <h2>Contact</h2>
      <p>
        For any question regarding this notice, contact{' '}
        <a href="mailto:stackt@paulmarchiset.me">stackt@paulmarchiset.me</a>.
      </p>
    </LegalPage>
  );
}
