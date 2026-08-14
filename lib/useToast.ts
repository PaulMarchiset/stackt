'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type Toast = { msg: string; err?: boolean };

/* Long enough to read a short sentence, short enough not to sit on the UI.
   One number, so a toast means the same thing on every screen — the board used
   to dismiss slightly faster than the rest for no reason anyone chose. */
const DISMISS_MS = 2800;

/**
 * The one toast every screen shows.
 *
 * Owns its dismiss timer, including clearing it on unmount — a toast raised by
 * the last action before a navigation would otherwise fire setState into a
 * component that is already gone.
 *
 * Pair it with `usePersist` (which reports failed writes through it) and render
 * the result with <Toast> from app/components.
 */
export function useToast(dismissMs = DISMISS_MS) {
  const [toast, setToast] = useState<Toast | null>(null);
  const timer = useRef<number>(0);

  const showToast = useCallback((msg: string, err = false) => {
    setToast({ msg, err });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setToast(null), dismissMs);
  }, [dismissMs]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  return { toast, showToast };
}
