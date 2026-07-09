'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * Header notification bell. Not wired to anything yet — clicking it opens a small
 * speech-bubble popover (with a chevron pointing up to the bell) that says the
 * feature is on the way. `btnClass` lets each header match its own button style.
 */
export default function NotifBell({ btnClass = 'btn ghost icon-only', align = 'left' }: { btnClass?: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  return (
    <div className={'notif' + (open ? ' open' : '') + (align === 'right' ? ' notif--right' : '')} ref={ref}>
      <button className={btnClass + ' notif-btn'} title="Notifications" aria-label="Notifications"
        aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" className="ic"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
      </button>
      {open && (
        <div className="notif-pop" role="dialog">
          <div className="notif-pop-title">Notifications</div>
          <p className="notif-pop-body">We&apos;re still building this one. <strong>Coming soon.</strong></p>
        </div>
      )}
    </div>
  );
}
