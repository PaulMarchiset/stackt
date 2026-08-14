'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate } from '@/lib/util';
import { IconCalendar } from '@/app/components/icons';
import Calendar, { CAL_H, CAL_GAP, CAL_W } from './Calendar';

/**
 * Date field for the card editor: the whole zone is clickable, the value shows
 * in our own format (formatDate — consistent everywhere incl. Windows), the
 * calendar icon sits on the left, and clicking opens the styled <Calendar>.
 * The calendar is rendered in a portal (fixed, top layer) so the enclosing modal
 * can't clip or under-stack it, and it flips above the field when there isn't
 * room below (e.g. on mobile).
 */
export default function DateField({
  value, min, disabled, placeholder, onChange
}: {
  value: string; min?: string; disabled?: boolean; placeholder?: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const openCal = () => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - CAL_W - 8);
    const above = window.innerHeight - r.bottom < CAL_H + CAL_GAP;
    setPos(above ? { left, bottom: window.innerHeight - r.top + CAL_GAP } : { left, top: r.bottom + CAL_GAP });
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onDown = () => close();                 // clicks inside the calendar stopPropagation
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <div className="date-field-wrap">
      <button ref={btnRef} type="button" className={'date-btn' + (disabled ? ' disabled' : '')} disabled={disabled}
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => (open ? setOpen(false) : openCal())}>
        <IconCalendar />
        <span className={'date-btn-text' + (value ? '' : ' ph')}>{value ? formatDate(value) : (placeholder || 'Pick a date')}</span>
        {value && !disabled && (
          <span className="date-clear" role="button" aria-label="Clear date"
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}>×</span>
        )}
      </button>
      {open && !disabled && pos && typeof document !== 'undefined' && createPortal(
        <Calendar value={value} min={min} style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
          onPick={(iso) => { onChange(iso); setOpen(false); }} />,
        document.body
      )}
    </div>
  );
}
