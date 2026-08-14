'use client';

import { useState } from 'react';
import { IconChevronLeft, IconChevronRight } from '@/app/components/icons';

const pad = (n: number) => String(n).padStart(2, '0');
export const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

// Localized short weekday names, Monday-first (Jan 1 2024 was a Monday).
const WEEK = Array.from({ length: 7 }, (_, i) =>
  new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: 'short' }));

/* Popover footprint, used by callers to decide whether to flip it above the
   trigger. Keep in step with `.cal-pop` in globals.css. */
export const CAL_W = 272;
export const CAL_H = 322;
export const CAL_GAP = 6;

/**
 * Styled month grid (the native date picker can't be styled on any OS we care
 * about). One component, two modes:
 *
 *  · single — `value` is the selected day.
 *  · range  — `value` is the first day and `end` the last; days in between are
 *             painted as the span. The *caller* decides what a click means
 *             (see DatePill), so this stays a dumb, controlled grid.
 */
export default function Calendar({
  value, end, min, style, className, header, footer, onPick
}: {
  value: string;
  end?: string | null;
  min?: string;
  style?: React.CSSProperties;
  className?: string;
  header?: React.ReactNode;   // rendered above the month nav (DatePill's start/end chips)
  footer?: React.ReactNode;   // rendered under the grid (actions)
  onPick: (iso: string) => void;
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

  const last = end && value && end > value ? end : '';

  const cells: (number | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= days; d++) cells.push(d);

  return (
    <div className={'cal-pop' + (className ? ' ' + className : '')} style={style}
      onMouseDown={(e) => e.stopPropagation()}>
      {header}
      <div className="cal-pop-head">
        <button type="button" className="cal-pop-nav" onClick={prev} aria-label="Previous month">
          <IconChevronLeft />
        </button>
        <span className="cal-pop-title">{title}</span>
        <button type="button" className="cal-pop-nav" onClick={next} aria-label="Next month">
          <IconChevronRight />
        </button>
      </div>
      <div className="cal-pop-week">{WEEK.map((w, i) => <span key={i}>{w}</span>)}</div>
      <div className="cal-pop-grid">
        {cells.map((d, i) => {
          if (d === null) return <span key={i} className="cal-pop-empty" />;
          const ds = isoOf(y, m, d);
          const disabled = !!min && ds < min;
          const inRange = !!last && ds > value && ds < last;
          const cls = 'cal-pop-day'
            + (ds === value || ds === last ? ' sel' : '')
            + (last && ds === value ? ' r-start' : '')
            + (last && ds === last ? ' r-end' : '')
            + (inRange ? ' in-range' : '')
            + (ds === today ? ' today' : '');
          return (
            <button key={i} type="button" disabled={disabled} className={cls} onClick={() => onPick(ds)}>{d}</button>
          );
        })}
      </div>
      {footer}
    </div>
  );
}
