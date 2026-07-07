'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatDate } from '@/lib/util';

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
// Localized short weekday names, Monday-first (Jan 1 2024 was a Monday).
const WEEK = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));

/** Styled month-grid calendar (replaces the un-styleable native date picker). */
function Calendar({ value, min, style, onPick }: {
  value: string; min?: string; style: React.CSSProperties; onPick: (iso: string) => void;
}) {
  const now = new Date();
  const base = value ? value.split('-').map(Number) : null;
  const [y, setY] = useState(base ? base[0] : now.getFullYear());
  const [m, setM] = useState(base ? base[1] - 1 : now.getMonth());

  const first = new Date(y, m, 1);
  const offset = (first.getDay() + 6) % 7;            // Monday-first leading blanks
  const days = new Date(y, m + 1, 0).getDate();
  const today = isoOf(now.getFullYear(), now.getMonth(), now.getDate());
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const prev = () => { if (m === 0) { setY(y - 1); setM(11); } else setM(m - 1); };
  const next = () => { if (m === 11) { setY(y + 1); setM(0); } else setM(m + 1); };

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div className="cal-pop" style={style} onMouseDown={(e) => e.stopPropagation()}>
      <div className="cal-pop-head">
        <button type="button" className="cal-pop-nav" onClick={prev} aria-label="Previous month">
          <svg viewBox="0 0 16 16"><path d="M10 3l-5 5 5 5" /></svg>
        </button>
        <span className="cal-pop-title">{title}</span>
        <button type="button" className="cal-pop-nav" onClick={next} aria-label="Next month">
          <svg viewBox="0 0 16 16"><path d="M6 3l5 5-5 5" /></svg>
        </button>
      </div>
      <div className="cal-pop-week">{WEEK.map((w, i) => <span key={i}>{w}</span>)}</div>
      <div className="cal-pop-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} className="cal-pop-empty" />;
          const ds = isoOf(y, m, d);
          const disabled = !!min && ds < min;
          return (
            <button key={i} type="button" disabled={disabled}
              className={'cal-pop-day' + (ds === value ? ' sel' : '') + (ds === today ? ' today' : '')}
              onClick={() => onPick(ds)}>{d}</button>
          );
        })}
      </div>
    </div>
  );
}

const CAL_W = 272;
const CAL_H = 322;
const GAP = 6;

/**
 * Date field: the whole zone is clickable, the value shows in our own format
 * (formatDate — consistent everywhere incl. Windows), the calendar icon sits on
 * the left, and clicking opens a fully-styled calendar. The calendar is rendered
 * in a portal (fixed, top layer) so the enclosing modal can't clip or under-stack
 * it, and it flips above the field when there isn't room below (e.g. on mobile).
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
    const above = window.innerHeight - r.bottom < CAL_H + GAP;
    setPos(above ? { left, bottom: window.innerHeight - r.top + GAP } : { left, top: r.bottom + GAP });
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
        <svg viewBox="0 0 24 24"><path d="M21 10H3M16 2V6M8 2V6M7.8 22H16.2C17.8802 22 18.7202 22 19.362 21.673C19.9265 21.3854 20.3854 20.9265 20.673 20.362C21 19.7202 21 18.8802 21 17.2V8.8C21 7.11984 21 6.27976 20.673 5.63803C20.3854 5.07354 19.9265 4.6146 19.362 4.32698C18.7202 4 17.8802 4 16.2 4H7.8C6.11984 4 5.27976 4 4.63803 4.32698C4.07354 4.6146 3.6146 5.07354 3.32698 5.63803C3 6.27976 3 7.11984 3 8.8V17.2C3 18.8802 3 19.7202 3.32698 20.362C3.6146 20.9265 4.07354 21.3854 4.63803 21.673C5.27976 22 6.11984 22 7.8 22Z" /></svg>
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
