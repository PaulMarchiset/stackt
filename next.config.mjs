/**
 * Content-Security-Policy.
 *
 * The app loads nothing from anywhere else — no CDN, no web font, no analytics
 * (grep globals.css and layout.tsx: not one external URL) — so 'self' is the
 * whole allowlist, and the only outbound connection is Supabase.
 *
 * script-src keeps 'unsafe-inline' because the App Router hydrates through
 * inline <script> blocks; removing it means minting a nonce per request in the
 * middleware and threading it through every entry point. Worth doing, and the
 * one thing still missing here — but the rest of this policy already does the
 * load-bearing work:
 *   · frame-ancestors 'none'  — nobody can iframe /settings and trick a click
 *                               through to "Delete account" (clickjacking)
 *   · connect-src             — injected script can't phone data home
 *   · base-uri / form-action  — no <base> hijack, no form posted off-site
 *   · object-src 'none'       — no plugin embedding
 */
/* The dev server compiles in the browser: hot reloading and source maps both
   evaluate JavaScript from strings, which 'unsafe-eval' is what permits. Without
   it `next dev` doesn't merely warn — the bundle throws, React never hydrates,
   and every button on the page is inert while the markup looks perfectly fine.
   It is added in development only; the deployed policy never carries it. */
const dev = process.env.NODE_ENV !== 'production';

const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' https://*.supabase.co wss://*.supabase.co${dev ? ' ws://localhost:* http://localhost:*' : ''}`,
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  'upgrade-insecure-requests'
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  // Belt and braces with frame-ancestors, for anything that predates CSP.
  { key: 'X-Frame-Options', value: 'DENY' },
  // No MIME sniffing: an uploaded/echoed file can't be re-read as script.
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  // Board URLs carry project ids — don't leak them to sites users click out to.
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Nothing here needs the camera, the mic or the user's location.
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
  // HTTPS only, for two years, subdomains included.
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' }
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Don't advertise the framework version to scanners.
  poweredByHeader: false,
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  }
};

export default nextConfig;
