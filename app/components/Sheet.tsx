'use client';

import { useEffect } from 'react';

/**
 * Mobile bottom sheet: a slide-up panel anchored to the bottom of the screen,
 * dismissed by tapping the backdrop or pressing Escape. Used on touch for card
 * actions, the project switcher, the overflow menu and the color picker.
 * Honors the home-indicator safe area via CSS (see `.sheet` in globals.css).
 */
export default function Sheet({
  title, onClose, children
}: {
  title?: string; onClose: () => void; children: React.ReactNode;
}) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  return (
    <div className="sheet-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="sheet-grip" />
        {title && <div className="sheet-title">{title}</div>}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
