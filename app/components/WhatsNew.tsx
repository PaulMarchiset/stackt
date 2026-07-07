'use client';

import { useEffect, useState } from 'react';
import Modal from '@/app/board/Modal';
import { CHANGELOG, CHANGELOG_VERSION } from '@/lib/changelog';

/**
 * "What's new" popup, shown once per release. We read/write a per-browser marker
 * in localStorage inside an effect (never during render) so server and first
 * client render agree — same approach as useDevMode. When the stored marker is
 * behind the current changelog version, the popup appears once; dismissing it
 * writes the current version so it won't reappear until the next release bump.
 *
 * Safe to mount on more than one page: the shared key means whichever surface
 * loads first shows it, and it stays dismissed everywhere after.
 */
const KEY = 'stackt:whatsNew';

export default function WhatsNew() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) !== CHANGELOG_VERSION) setShow(true);
    } catch {
      /* localStorage unavailable (private mode / SSR) — just don't show it. */
    }
  }, []);

  function dismiss() {
    try { localStorage.setItem(KEY, CHANGELOG_VERSION); } catch { /* ignore */ }
    setShow(false);
  }

  if (!show) return null;

  return (
    <Modal title={CHANGELOG.title} className="modal-center whatsnew-modal" onClose={dismiss}>
      <div className="whatsnew">
        {CHANGELOG.intro && <p className="whatsnew-intro">{CHANGELOG.intro}</p>}
        <ul className="whatsnew-list">
          {CHANGELOG.items.map((it, i) => (
            <li key={i}>
              <strong>{it.title}</strong>
              {it.body ? <span className="whatsnew-body"> — {it.body}</span> : null}
            </li>
          ))}
        </ul>
        <div className="edit-actions">
          <div className="meta-spacer" />
          <button className="btn solid" onClick={dismiss}>Got it</button>
        </div>
      </div>
    </Modal>
  );
}
