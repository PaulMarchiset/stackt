/**
 * Demo mode, as a cookie.
 *
 * The alternative was a parallel set of routes (/demo, /demo/board, …), which
 * would have meant teaching every link in the app to point at itself twice.
 * A cookie keeps the demo on the real screens, at the real URLs, so clicking
 * around it behaves exactly like the app does — which is the entire point of
 * screenshotting it.
 *
 * It is deliberately short-lived: a demo left switched on would quietly hide
 * your own board behind a fixture. Visiting /demo again renews it, /demo/exit
 * drops it.
 */
export const DEMO_COOKIE = 'stackt_demo';

/* Long enough for a screenshot session, short enough to forget about. */
export const DEMO_MAX_AGE = 60 * 60 * 12; // 12 hours
