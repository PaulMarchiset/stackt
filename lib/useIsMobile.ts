'use client';

import { useEffect, useState } from 'react';

/**
 * True below the mobile breakpoint (matches the `@media (max-width: 720px)`
 * rules in globals.css). SSR-safe: starts `false` and only flips after mount,
 * so the server and first client render agree (no hydration mismatch).
 */
export const MOBILE_QUERY = '(max-width: 720px)';

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(MOBILE_QUERY);
    const apply = () => setIsMobile(mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  return isMobile;
}
