'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Developer mode: a per-device preference (localStorage) that gates the
 * git-oriented features (repo button, branch field, branch chips). Defaults ON
 * so nothing disappears unless the user turns it off. Changes broadcast on a
 * custom event so every hook instance stays in sync within the tab.
 */
const KEY = 'stackt:devMode';
const EVENT = 'stackt:devmode';

export function useDevMode(): [boolean, (v: boolean) => void] {
  const [dev, setDev] = useState(true);

  useEffect(() => {
    const read = () => setDev(localStorage.getItem(KEY) !== 'off');
    read();
    window.addEventListener(EVENT, read);
    window.addEventListener('storage', read);
    return () => { window.removeEventListener(EVENT, read); window.removeEventListener('storage', read); };
  }, []);

  const set = useCallback((v: boolean) => {
    localStorage.setItem(KEY, v ? 'on' : 'off');
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [dev, set];
}
