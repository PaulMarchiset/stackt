'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Which group runs are folded shut in the board header — a per-device
 * preference, like developer mode, and for the same reason: it is about how
 * much room this screen has, not about the account. A wide monitor and a
 * laptop deserve different answers, and neither is worth a migration.
 *
 * Stored as a list of group ids. A group that no longer exists simply never
 * matches, so nothing has to prune it.
 */
const KEY = 'stackt:foldedGroups';
const EVENT = 'stackt:foldedgroups';

function read(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];   // unavailable or corrupt — nothing is folded, which is the safe answer
  }
}

export function useFoldedGroups(): [string[], (id: string) => void] {
  /* Empty on the server and on the first paint: reading localStorage during
     render would hand the client different markup than the server sent. */
  const [folded, setFolded] = useState<string[]>([]);

  useEffect(() => {
    const sync = () => setFolded(read());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => { window.removeEventListener(EVENT, sync); window.removeEventListener('storage', sync); };
  }, []);

  /* Reads back from storage rather than from state, so two headers in two tabs
     can't overwrite each other's list with a stale copy. */
  const toggle = useCallback((id: string) => {
    const now = read();
    const next = now.includes(id) ? now.filter((x) => x !== id) : [...now, id];
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* ignore */ }
    setFolded(next);
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [folded, toggle];
}
