import './globals.css';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, JetBrains_Mono, Noto_Sans_JP } from 'next/font/google';

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

/**
 * Japanese, Chinese and Korean glyphs — everything the Latin faces above simply
 * do not contain. A card titled 会議の準備 renders as boxes without this.
 *
 * It is never the first font in a stack: browsers fall back to the next family
 * *per glyph*, not per element, so Latin text keeps using Plus Jakarta Sans and
 * only the characters it lacks fall through to here. Nothing needs to detect a
 * language.
 *
 * `preload: false` is the setting that matters. Noto Sans JP is thousands of
 * glyphs, split by Google into ~120 unicode-range blocks; the browser fetches
 * only the blocks a page actually uses (usually one or two, tens of kilobytes),
 * but preloading would pull them on every page including the ones with no
 * Japanese on them at all.
 *
 * Self-hosted through next/font rather than linked from fonts.googleapis.com,
 * and deliberately: a hotlinked Google font sends every visitor's IP address to
 * Google on every page load, which is both a third party we do not list in the
 * privacy policy and a CSP host we would have to open up.
 */
const cjk = Noto_Sans_JP({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-cjk',
  display: 'swap',
  preload: false
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
    <html lang="en" className={`${sans.variable} ${mono.variable} ${cjk.variable}`}>
      <body>{children}</body>
    </html>
  );
}
