import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono } from 'next/font/google';

const sans = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-sans'
});
const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-mono'
});

const DESC =
  'Stackt is a simple kanban + timeline to plan releases and track versions and bugs across all your projects — solo or with a team. Free, sign in in seconds, no setup.';

export const metadata: Metadata = {
  metadataBase: new URL('https://stackt.paulmarchiset.me'),
  title: { default: 'Stackt — Plan & track your project updates', template: '%s · Stackt' },
  description: DESC,
  applicationName: 'Stackt',
  keywords: [
    'release tracker', 'changelog tool', 'version tracking', 'kanban board',
    'project management', 'bug tracker', 'product roadmap', 'software updates',
    'timeline view', 'developer tools'
  ],
  authors: [{ name: 'Paul Marchiset', url: 'https://paulmarchiset.me' }],
  creator: 'Paul Marchiset',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    url: 'https://stackt.paulmarchiset.me',
    siteName: 'Stackt',
    title: 'Stackt — Plan & track your project updates',
    description: DESC,
    locale: 'en_US'
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Stackt — Plan & track your project updates',
    description: DESC
  },
  robots: { index: true, follow: true }
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#F6F4EC'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
