'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { Card } from '@/lib/types';
import { dateClass, formatDate, formatDateRange } from '@/lib/util';
import { IconCalendar } from '@/app/components/icons';
import Calendar, { CAL_GAP, CAL_W } from './Calendar';

/* Taller than a bare month grid: this popover adds the start/end chips above it
   and the action row below. Used only to decide whether to flip it upwards. */
const POP_H = 418;

/**
 * The date pill on a board card. On desktop it's a button: clicking it opens a
 * range picker right there, so rescheduling never needs the full card editor.
 * On mobile it stays a plain, non-interactive pill (the card's ⋯ sheet has Edit)
 * — a 10px-tall tap target inside a scrolling column is a trap, not a feature.
 *
 * The card stays the single source of truth: every pick calls `onChange` and the
 * pill re-renders from the store, exactly like every other per-action save.
 */
export default function DatePill({ card, editable, onChange }: {
  card: Card;
  editable: boolean;
  onChange: (start: string | null, end: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  // Which end of the range the next click sets. Picking a start advances to 'end'.
  const [mode, setMode] = useState<'start' | 'end'>('start');

  const start = card.target_date;
  const end = card.end_date && card.target_date && card.end_date > card.target_date ? card.end_date : null;
  const dcls = dateClass(card);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', close);  // clicks inside the popover stopPropagation
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', close);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', close); };
  }, [open]);

  const label = (
    <>
      <IconCalendar />
      {formatDateRange(start, end)}
      {dcls === 'overdue' && <span className="pill-overdue">overdue</span>}
    </>
  );

  if (!editable) return <span className={'date ' + dcls}>{label}</span>;

  const openPop = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    const left = Math.min(Math.max(8, r.left), window.innerWidth - CAL_W - 8);
    const above = window.innerHeight - r.bottom < POP_H + CAL_GAP;
    setPos(above ? { left, bottom: window.innerHeight - r.top + CAL_GAP } : { left, top: r.bottom + CAL_GAP });
    setMode('start');                   // the common case is "move this to another day"
    setOpen(true);
  };

  /* One click, one meaning. The first sets the start and arms the End chip, so a
     plain reschedule is one click and a range is two — without a mode to learn.
     In 'end' mode the grid disables everything before the start, which leaves
     only "same day" (back to single-day) and "later day" (set the end). */
  const pick = (iso: string) => {
    if (mode === 'start' || !start) {
      onChange(iso, end && end > iso ? end : null);
      setMode('end');
    } else if (iso === start) {
      onChange(iso, null);
    } else {
      onChange(start, iso);
      setOpen(false);
    }
  };

  return (
    <>
      <span className={'date editable ' + dcls} role="button" tabIndex={0}
        title="Click to reschedule"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else openPop(e.currentTarget); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPop(e.currentTarget); } }}>
        {label}
      </span>

      {open && pos && typeof document !== 'undefined' && createPortal(
        <Calendar
          className="date-pop"
          value={start ?? ''} end={end} min={mode === 'end' && start ? start : undefined}
          style={{ left: pos.left, top: pos.top, bottom: pos.bottom }}
          header={
            <div className="date-pop-tabs">
              <button type="button" className={'date-pop-tab' + (mode === 'start' ? ' on' : '')}
                onClick={() => setMode('start')}>
                <span className="k">Start</span>
                <span className="v">{start ? formatDate(start) : 'Pick a day'}</span>
              </button>
              <span className="date-pop-arrow">→</span>
              <button type="button" className={'date-pop-tab' + (mode === 'end' ? ' on' : '')}
                disabled={!start} onClick={() => setMode('end')}>
                <span className="k">End</span>
                <span className="v">{end ? formatDate(end) : 'Optional'}</span>
              </button>
            </div>
          }
          footer={
            <div className="date-pop-foot">
              <button type="button" className="date-pop-act"
                onClick={() => { onChange(null, null); setOpen(false); }}>Clear</button>
              {end && (
                <button type="button" className="date-pop-act"
                  onClick={() => { onChange(start, null); setMode('end'); }}>Single day</button>
              )}
              <div className="meta-spacer" />
              <button type="button" className="date-pop-act primary" onClick={() => setOpen(false)}>Done</button>
            </div>
          }
          onPick={pick} />,
        document.body
      )}
    </>
  );
}
