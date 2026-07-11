'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';

/**
 * Header notification bell. When given a project's reminder state it becomes a
 * quick control: the bell shows a dot when the active project has the daily
 * reminder on, and the popover lets you toggle it and jump to email settings.
 * Without those props (e.g. no active project) it falls back to a "coming soon"
 * note. `btnClass` lets each header match its own button style.
 */
export default function NotifBell({
  btnClass = 'btn ghost icon-only',
  align = 'left',
  projectName,
  remind,
  onToggleRemind
}: {
  btnClass?: string;
  align?: 'left' | 'right';
  projectName?: string;
  remind?: boolean;
  onToggleRemind?: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const isReminderMode = typeof onToggleRemind === 'function';

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
      <button className={btnClass + ' notif-btn' + (isReminderMode && remind ? ' on' : '')}
        title={isReminderMode ? (remind ? 'Rappel quotidien activé' : 'Rappel quotidien désactivé') : 'Notifications'}
        aria-label="Notifications" aria-haspopup="dialog" aria-expanded={open}
        onClick={() => setOpen((o) => !o)}>
        <svg viewBox="0 0 24 24" className="ic"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" /></svg>
        {isReminderMode && remind && <span className="notif-dot" aria-hidden />}
      </button>

      {open && (
        <div className="notif-pop" role="dialog">
          {isReminderMode ? (
            <>
              <div className="notif-pop-title">Rappel quotidien</div>
              <p className="notif-pop-body">
                {remind
                  ? <>Ce projet est <strong>inclus</strong> dans ton email de 8h.</>
                  : <>Ce projet <strong>n’est pas</strong> dans ton email de 8h.</>}
              </p>
              <div className="notif-toggle-row">
                <span className="notif-toggle-label">Rappeler {projectName ? `« ${projectName} »` : 'ce projet'}</span>
                <button className={'switch' + (remind ? ' on' : '')} role="switch" aria-checked={!!remind}
                  aria-label="Activer le rappel quotidien" onClick={() => onToggleRemind?.(!remind)}><span /></button>
              </div>
              <Link href="/settings" className="notif-pop-link" onClick={() => setOpen(false)}>
                Options du mail (objet, sections)…
              </Link>
            </>
          ) : (
            <>
              <div className="notif-pop-title">Notifications</div>
              <p className="notif-pop-body">We&apos;re still building this one. <strong>Coming soon.</strong></p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
