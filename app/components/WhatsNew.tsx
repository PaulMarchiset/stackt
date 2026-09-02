'use client';

import { useEffect, useState } from 'react';
import Modal from '@/app/board/Modal';
import { CHANGELOG, CHANGELOG_VERSION } from '@/lib/changelog';
import { IconPeople } from '@/app/components/icons';

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
        {CHANGELOG.intro?.map((para, i) => (
          <p key={i} className="whatsnew-intro">{para}</p>
        ))}
        {/* The button, drawn as it actually looks. Inert on purpose: it is a
            picture of where to go, not a second way to get there — a live
            control here would open sharing for whichever board happens to be
            behind the popup, which is not the one the reader was thinking of. */}
        {CHANGELOG.capsule && (
          <div className="whatsnew-capsule">
            {/* Skipped when empty rather than rendered blank: an empty <p> still
                takes its margin, and the gap above the card would grow for no
                reason anyone could see. */}
            {CHANGELOG.capsule.before && (
              <p className="whatsnew-intro">{CHANGELOG.capsule.before}</p>
            )}
            {/* Lifted onto a card of its own, and inert. It is a picture of the
                panel, not a second way in — the board it would act on is not the
                one behind this popup. */}
            <div className="whatsnew-capsule-card" aria-hidden>
              <span className="whatsnew-capsule-field">{CHANGELOG.capsule.placeholder}</span>
              <span className="whatsnew-capsule-btn">{CHANGELOG.capsule.action}</span>
            </div>
            <p className="whatsnew-intro">
              You will find it behind{' '}
              <span className="whatsnew-chip"><IconPeople />{CHANGELOG.capsule.opener}</span>,{' '}
              {CHANGELOG.capsule.caption}
            </p>
          </div>
        )}

        {/* A release with nothing to enumerate renders no list at all, rather
            than an empty one. Some releases are one idea, and a bulleted list
            of one idea reads as a list with something missing. */}
        {CHANGELOG.aside && (
          <div className="whatsnew-aside">
            <div className="whatsnew-aside-label">{CHANGELOG.aside.label}</div>
            <p className="whatsnew-intro">{CHANGELOG.aside.body}</p>
          </div>
        )}

        {CHANGELOG.items.length > 0 && (
          <ul className="whatsnew-list">
            {CHANGELOG.items.map((it, i) => (
              <li key={i}>
                <strong>{it.title}</strong>
                {it.body ? <span className="whatsnew-body"> — {it.body}</span> : null}
              </li>
            ))}
          </ul>
        )}
        <div className="edit-actions">
          <div className="meta-spacer" />
          <button className="btn solid" onClick={dismiss}>Got it</button>
        </div>
      </div>
    </Modal>
  );
}
