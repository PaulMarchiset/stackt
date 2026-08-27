'use client';

import { useEffect, useState } from 'react';

/**
 * The only thing on screen that isn't the app: a small chip saying this board
 * is a fixture, with the way out next to it.
 *
 * It has a hide button because its whole job is to be in the corner of a
 * screenshot, and a shot is the one moment you don't want it. Hiding is per
 * tab (sessionStorage), so a new window brings it back and a demo can't be
 * silently forgotten with the badge switched off forever.
 */
const KEY = 'stackt:demoBadge';

export default function DemoBadge() {
  const [hidden, setHidden] = useState(true); // assume hidden until the effect reads

  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem(KEY) === 'off');
    } catch {
      setHidden(false); // no sessionStorage (private mode) — just show it
    }
  }, []);

  function hide() {
    try { sessionStorage.setItem(KEY, 'off'); } catch { /* ignore */ }
    setHidden(true);
  }

  if (hidden) return null;

  return (
    <div className="demo-badge">
      <span className="demo-badge-dot" aria-hidden />
      <span className="demo-badge-text">Demo data — nothing is saved</span>
      <a className="demo-badge-link" href="/demo/exit">Exit</a>
      <button className="demo-badge-hide" onClick={hide} title="Hide for this tab" aria-label="Hide this badge">×</button>
    </div>
  );
}
