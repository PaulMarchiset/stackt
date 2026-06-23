'use client';

import { useEffect, useRef } from 'react';
import type { Card, Project } from '@/lib/types';
import { todayISO, versionColorIndex } from '@/lib/util';
import CardEditor from './CardEditor';
import Modal from './Modal';

const STATUS_LABEL: Record<string, string> = { todo: 'To do', inprogress: 'In progress', done: 'Done' };

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

/** Horizontal calendar: consecutive day columns with the cards due each day. */
export default function Timeline({
  project, projCards, cards, editing, newCardDate,
  onAdd, onEdit, onToggle, onSubmit, onCancel
}: {
  project: Project; projCards: Card[]; cards: Card[];
  editing: string | null; newCardDate: string;
  onAdd: (date: string) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onSubmit: (v: Partial<Card>) => void;
  onCancel: () => void;
}) {
  const today = todayISO();
  const isNew = !!editing && editing.startsWith('__new__');
  const editCard = editing && !isNew ? cards.find((c) => c.id === editing) : undefined;

  // Build the day range: from the earliest card (or today) to the latest + a week of room.
  const dated = cards.map((c) => c.target_date).filter((d): d is string => !!d);
  let minIso = today, maxIso = today;
  dated.forEach((d) => { if (d < minIso) minIso = d; if (d > maxIso) maxIso = d; });
  const end = fromIso(maxIso); end.setDate(end.getDate() + 7);

  const days: string[] = [];
  for (let d = fromIso(minIso); isoOf(d) <= isoOf(end); d.setDate(d.getDate() + 1)) days.push(isoOf(d));

  const byDate = new Map<string, Card[]>();
  cards.forEach((c) => {
    if (!c.target_date) return;
    const a = byDate.get(c.target_date) || []; a.push(c); byDate.set(c.target_date, a);
  });
  const undated = cards.filter((c) => !c.target_date);

  const scrollRef = useRef<HTMLDivElement>(null);
  const todayRef = useRef<HTMLDivElement>(null);
  useEffect(() => { todayRef.current?.scrollIntoView({ inline: 'start', block: 'nearest' }); }, []);

  const title = (() => {
    const f = fromIso(days[0]); const l = fromIso(days[days.length - 1]);
    const opt: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
    const a = f.toLocaleDateString(undefined, opt), b = l.toLocaleDateString(undefined, opt);
    return a === b ? a : `${f.toLocaleDateString(undefined, { month: 'short' })} – ${b}`;
  })();

  const event = (c: Card) => {
    const ci = versionColorIndex(project, c.version);
    return (
      <div key={c.id} className={'cal-event' + (c.done ? ' done' : '') + (c.type === 'bug' ? ' is-bug' : '') + (editing === c.id ? ' editing' : '')}>
        <div className="cal-ev-top">
          <button className={'checkbox' + (c.done ? ' checked' : '')} title="Mark done" onClick={() => onToggle(c.id)}>
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </button>
          <button className="cal-ev-title" onClick={() => onEdit(c.id)}>{c.title || 'Untitled'}</button>
        </div>
        <div className="cal-ev-meta">
          {c.type === 'bug' && (
            <span className="chip bug"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="11" rx="4" /><path d="M9.5 8a2.5 2.5 0 0 1 5 0M12 11.5v6M8 11.5H5M8 15.5H5.5M16 11.5h3M16 15.5h2.5" /></svg>Bug</span>
          )}
          {c.version && <span className={'chip version' + (ci != null ? ' card-theme-' + ci : '')}>{c.version}</span>}
          <span className="tl-status"><span className={'dot ' + c.status} />{STATUS_LABEL[c.status]}</span>
        </div>
      </div>
    );
  };

  const dayColumn = (iso: string) => {
    const d = fromIso(iso);
    const when = iso < today ? 'past' : iso === today ? 'today' : 'future';
    const items = byDate.get(iso) || [];
    return (
      <div key={iso} className={'cal-col ' + when} ref={iso === today ? todayRef : undefined}>
        <div className="cal-col-head">
          <span className="cal-dow2">{d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
          <span className="cal-dnum">{d.getDate()}</span>
          {(d.getDate() === 1 || iso === days[0]) && <span className="cal-mon">{d.toLocaleDateString(undefined, { month: 'short' })}</span>}
        </div>
        <div className="cal-col-body">{items.map(event)}</div>
      </div>
    );
  };

  return (
    <div className="calendar-h">
      <div className="cal-head2">
        <div className="cal-title">{title}</div>
        <div className="meta-spacer" />
        <button className="btn solid" onClick={() => onAdd(today)}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> Add update
        </button>
        <button className="btn" onClick={() => todayRef.current?.scrollIntoView({ inline: 'start', block: 'nearest', behavior: 'smooth' })}>Today</button>
      </div>

      <div className="cal-h" ref={scrollRef}>
        {undated.length > 0 && (
          <div className="cal-col nodate">
            <div className="cal-col-head"><span className="cal-dow2">No date</span></div>
            <div className="cal-col-body">{undated.map(event)}</div>
          </div>
        )}
        {days.map(dayColumn)}
      </div>

      {(isNew || editCard) && (
        <Modal title={isNew ? 'New update' : 'Edit update'} onClose={onCancel}>
          <CardEditor bare project={project} projCards={projCards}
            card={editCard} status={editCard ? editCard.status : 'todo'}
            defaultDate={isNew ? newCardDate : undefined}
            onSubmit={onSubmit} onCancel={onCancel} />
        </Modal>
      )}
    </div>
  );
}
