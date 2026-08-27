import type { Metadata } from 'next';
import LogoCard from './LogoCard';

/**
 * A title card to film: nothing but the wordmark, the tagline and the grid the
 * whole app sits on. It lives under /demo because it is the same kind of thing
 * — a surface that exists to be photographed, unlisted and disallowed in
 * robots.txt — but it carries no fixture and no cookie: it is just a page.
 */
export const metadata: Metadata = { title: 'Stackt', robots: { index: false, follow: false } };

export default function LogoPage() {
  return <LogoCard />;
}
