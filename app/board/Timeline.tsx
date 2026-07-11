'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, CardDraft, Project, Version } from '@/lib/types';
import { todayISO, versionColor } from '@/lib/util';
import { useBoardDevMode } from '@/lib/devModeContext';
import { vocab } from '@/lib/labels';
import BranchChip from '@/app/components/BranchChip';
import TypeTag from '@/app/components/TypeTag';
import CardEditor from './CardEditor';
import Modal from './Modal';

const STATUS_LABEL: Record<string, string> = { todo: 'To do', inprogress: 'In progress', done: 'Done' };

const pad = (n: number) => String(n).padStart(2, '0');
const isoOf = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromIso = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };

type Scale = 'day' | 'week' | 'month';
// Monday (ISO) of the week containing `iso`.
const mondayIso = (iso: string) => {
  const d = fromIso(iso);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return isoOf(d);
};

/**
 * Horizontal Gantt-style calendar. Days are grid columns; a card occupies one
 * cell (single day) or spans several columns as one continuous bar (multi-day).
 * Overlapping cards are packed into stacked lanes (grid rows) so a multi-day
 * card is drawn once, not repeated per day.
 */
export default function Timeline({
  project, projCards, versions, cards, editing, newCardDate,
  onAdd, onEdit, onToggle, onReschedule, onSubmit, onCancel
}: {
  project: Project; projCards: Card[]; versions: Version[]; cards: Card[];
  editing: string | null; newCardDate: string;
  onAdd: (date: string) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onMenu?: (id: string) => void; // used only by the mobile Agenda; ignored here
  onReschedule: (id: string, date: string) => void;
  onSubmit: (v: CardDraft) => void;
  onCancel: () => void;
}) {
  const devMode = useBoardDevMode();
  const v = vocab(devMode);
  const versionById = new Map(versions.map((z) => [z.id, z] as const));
  const [scale, setScale] = useState<Scale>('day');
  const scrollRef = useRef<HTMLDivElement>(null);
  const hiRef = useRef<HTMLElement | null>(null);

  // Coordinate-based drop: find which day column the pointer's X sits over by measuring
  // the day-background cells. This is immune to pointer-events / z-index / sticky quirks —
  // we never depend on *which* element the browser hit, only on where the cursor is.
  const cellAtX = (clientX: number): HTMLElement | null => {
    const host = scrollRef.current;
    if (!host) return null;
    const cells = host.querySelectorAll<HTMLElement>('.cal-h-bg');
    for (let i = 0; i < cells.length; i++) {
      const r = cells[i].getBoundingClientRect();           // nodate cell comes first → wins where it overlaps days
      if (clientX >= r.left && clientX < r.right) return cells[i];
    }
    return null;
  };
  const clearHighlight = () => { hiRef.current?.classList.remove('drop-target'); hiRef.current = null; };

  // Handlers live on the scroll container; drag events bubble up to it from any child.
  const onTimelineDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const hit = cellAtX(e.clientX);
    if (hit !== hiRef.current) { clearHighlight(); hit?.classList.add('drop-target'); hiRef.current = hit; }
  };
  const onTimelineDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const hit = cellAtX(e.clientX);
    clearHighlight();
    const id = e.dataTransfer.getData('text/plain');
    if (id && hit) onReschedule(id, hit.dataset.iso ?? '');
  };
  const onTimelineDragLeave = (e: React.DragEvent) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) clearHighlight();
  };
  const today = todayISO();
  const isNew = !!editing && editing.startsWith('__new__');
  const editCard = editing && !isNew ? cards.find((c) => c.id === editing) : undefined;

  // Build the day range from the earliest start to the latest end, with a week of room on
  // each side — the leading days give some context just before today/the first card.
  const stamps: string[] = [];
  cards.forEach((c) => { if (c.target_date) stamps.push(c.target_date); if (c.end_date) stamps.push(c.end_date); });
  let minIso = today, maxIso = today;
  stamps.forEach((d) => { if (d < minIso) minIso = d; if (d > maxIso) maxIso = d; });
  const start = fromIso(minIso); start.setDate(start.getDate() - 7);
  const end = fromIso(maxIso); end.setDate(end.getDate() + 7);
  // Always show at least through the end of the 3rd month after the current one,
  // even when there are no cards out there.
  const t = fromIso(today);
  const minEnd = new Date(t.getFullYear(), t.getMonth() + 4, 0);
  if (end < minEnd) end.setTime(minEnd.getTime());

  const days: string[] = [];
  for (let d = new Date(start); isoOf(d) <= isoOf(end); d.setDate(d.getDate() + 1)) days.push(isoOf(d));

  // Group the contiguous day range into columns by the chosen scale. Same-key days
  // are adjacent (the list is sorted), so a running key comparison buckets them.
  type Bucket = { key: string; days: string[]; dropIso: string };
  const buckets: Bucket[] = [];
  const dayToBucket = new Map<string, number>();
  for (const iso of days) {
    const key = scale === 'day' ? iso : scale === 'month' ? iso.slice(0, 7) : mondayIso(iso);
    if (!buckets.length || buckets[buckets.length - 1].key !== key) {
      const dropIso = scale === 'day' ? iso : scale === 'month' ? `${key}-01` : key;
      buckets.push({ key, days: [], dropIso });
    }
    buckets[buckets.length - 1].days.push(iso);
    dayToBucket.set(iso, buckets.length - 1);
  }
  const todayBucket = dayToBucket.get(today);

  const undated = cards.filter((c) => !c.target_date);
  const hasNoDate = undated.length > 0;
  const colOffset = hasNoDate ? 1 : 0;          // grid column for buckets[0] = colOffset (0-based)
  const colCount = colOffset + buckets.length;

  // Lane-pack every card into rows so overlapping spans never collide.
  type Placed = { card: Card; c0: number; c1: number; lane: number };
  const spans = cards.map((c) => {
    if (!c.target_date) return { card: c, c0: 0, c1: 0 };   // no-date column
    const s = (dayToBucket.get(c.target_date) ?? 0) + colOffset;
    const endIso = c.end_date && c.end_date > c.target_date ? c.end_date : c.target_date;
    const e = (dayToBucket.get(endIso) ?? dayToBucket.get(c.target_date) ?? 0) + colOffset;
    return { card: c, c0: s, c1: Math.max(s, e) };
  });
  // Longest spans first so they take the top lanes; ties broken by start date.
  spans.sort((a, b) => (b.c1 - b.c0) - (a.c1 - a.c0) || a.c0 - b.c0);
  // Track the real occupied intervals per lane (not just the last end) so a card can join an
  // upper lane whenever it doesn't actually overlap anything there — e.g. a short card sitting
  // on a day *before* a long bar still lands on the top lane.
  const lanes: { c0: number; c1: number }[][] = [];
  const placed: Placed[] = spans.map((sp) => {
    let lane = lanes.findIndex((ivs) => ivs.every((iv) => sp.c1 < iv.c0 || sp.c0 > iv.c1));
    if (lane === -1) { lane = lanes.length; lanes.push([]); }
    lanes[lane].push({ c0: sp.c0, c1: sp.c1 });
    return { ...sp, lane };
  });
  const laneCount = Math.max(lanes.length, 1);

  const todayRef = useRef<HTMLDivElement>(null);
  // Scroll today near the left, but keep a couple of days of lead-in visible (and clear of
  // the sticky No-date column).
  const scrollToToday = (behavior: ScrollBehavior = 'auto') => {
    const host = scrollRef.current, el = todayRef.current;
    if (!host || !el) return;
    const colW = el.getBoundingClientRect().width + 10;
    const lead = colW * (hasNoDate ? 3 : 2);
    const delta = el.getBoundingClientRect().left - host.getBoundingClientRect().left;
    host.scrollTo({ left: Math.max(0, host.scrollLeft + delta - lead), behavior });
  };
  useEffect(() => { scrollToToday(); }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = (() => {
    const f = fromIso(days[0]); const l = fromIso(days[days.length - 1]);
    const opt: Intl.DateTimeFormatOptions = { month: 'short', year: 'numeric' };
    const a = f.toLocaleDateString(undefined, opt), b = l.toLocaleDateString(undefined, opt);
    return a === b ? a : `${f.toLocaleDateString(undefined, { month: 'short' })} – ${b}`;
  })();

  const bar = ({ card: c, c0, c1, lane }: Placed) => {
    const cver = c.version_id ? versionById.get(c.version_id) : null;
    const ci = versionColor(cver);
    const multi = c1 > c0;
    return (
      <div key={c.id} draggable
        style={{ gridColumn: `${c0 + 1} / ${c1 + 2}`, gridRow: lane + 2 }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); const el = e.currentTarget; window.setTimeout(() => el.classList.add('dragging'), 0); }}
        onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); clearHighlight(); }}
        className={'cal-bar' + (c.done ? ' done' : '') + (c.type === 'bug' ? ' is-bug' : '')
          + (multi ? ' multi' : '') + (c.target_date ? '' : ' nodate')
          + (ci != null ? ' card-theme-' + ci : '') + (editing === c.id ? ' editing' : '')}>
        <span className="cal-bar-accent" />
        <div className="cal-bar-main">
          <button className={'checkbox' + (c.done ? ' checked' : '')} title="Mark done" onClick={() => onToggle(c.id)}>
            <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
          </button>
          <div className="cal-bar-body">
            <button className="cal-bar-title" onClick={() => onEdit(c.id)}>{c.title || 'Untitled'}</button>
            <div className="cal-bar-meta">
              {c.type === 'bug' && <TypeTag />}
              {cver && <span className={'chip version' + (ci != null ? ' card-theme-' + ci : '')}>{cver.name}</span>}
              {c.branch && <BranchChip repoUrl={project.repo_url} branch={c.branch} />}
              <span className="tl-status"><span className={'dot ' + c.status} />{STATUS_LABEL[c.status]}</span>
            </div>
          </div>
          <button className="cal-bar-edit" title="Edit" onClick={() => onEdit(c.id)}>
            <svg viewBox="0 0 24 24"><path d="M12 20H21M3.00003 20H4.67457C5.16376 20 5.40835 20 5.63852 19.9447C5.84259 19.8957 6.03768 19.8149 6.21663 19.7053C6.41846 19.5816 6.59141 19.4086 6.93732 19.0627L19.5001 6.49998C20.3285 5.67156 20.3285 4.32841 19.5001 3.49998C18.6716 2.67156 17.3285 2.67156 16.5001 3.49998L3.93729 16.0627C3.59139 16.4086 3.41843 16.5816 3.29475 16.7834C3.18509 16.9624 3.10428 17.1574 3.05529 17.3615C3.00003 17.5917 3.00003 17.8363 3.00003 18.3255V20Z" /></svg>
          </button>
        </div>
      </div>
    );
  };

  const whenOf = (i: number) => (todayBucket == null ? 'future' : i < todayBucket ? 'past' : i === todayBucket ? 'today' : 'future');

  const headCell = (bucket: Bucket, i: number) => {
    let dow2: string, dnum: string, mon: string | null = null;
    if (scale === 'week') {
      const m = fromIso(bucket.key);
      const sun = new Date(m); sun.setDate(sun.getDate() + 6);
      dow2 = m.toLocaleDateString(undefined, { month: 'short' }).toUpperCase();
      dnum = `${m.getDate()}–${sun.getDate()}`;
    } else if (scale === 'month') {
      const m = fromIso(`${bucket.key}-01`);
      dow2 = String(m.getFullYear());
      dnum = m.toLocaleDateString(undefined, { month: 'short' });
    } else {
      const d = fromIso(bucket.dropIso);
      dow2 = d.toLocaleDateString(undefined, { weekday: 'short' });
      dnum = String(d.getDate());
      if (d.getDate() === 1 || bucket.dropIso === days[0]) mon = d.toLocaleDateString(undefined, { month: 'short' });
    }
    return (
      <div key={'h' + bucket.key} className={'cal-h-head ' + whenOf(i)} style={{ gridColumn: i + colOffset + 1, gridRow: 1 }}
        ref={i === todayBucket ? todayRef : undefined}>
        <span className="cal-dow2">{dow2}</span>
        <span className="cal-dnum">{dnum}</span>
        {mon && <span className="cal-mon">{mon}</span>}
      </div>
    );
  };

  // A column background carries its representative date in data-iso; the drop handler reads it.
  const bgCell = (bucket: Bucket, i: number) => (
    <div key={'b' + bucket.key} className={'cal-h-bg ' + whenOf(i)} data-iso={bucket.dropIso}
      style={{ gridColumn: i + colOffset + 1, gridRow: '2 / -1' }} onDoubleClick={() => onAdd(bucket.dropIso)} />
  );

  return (
    <div className="calendar-h">
      <div className="cal-head2">
        <div className="cal-title">{title}</div>
        <div className="meta-spacer" />
        <div className="seg cal-scale">
          {(['day', 'week', 'month'] as Scale[]).map((s) => (
            <button key={s} type="button" className={'seg-opt' + (scale === s ? ' active' : '')} onClick={() => setScale(s)}>
              {s === 'day' ? 'Day' : s === 'week' ? 'Week' : 'Month'}
            </button>
          ))}
        </div>
        <button className="btn solid" onClick={() => onAdd(today)}>
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> {`Add ${v.update.toLowerCase()}`}
        </button>
        <button className="btn" onClick={() => scrollToToday('smooth')}>Today</button>
      </div>

      <div className="cal-h" ref={scrollRef}
        onDragOver={onTimelineDragOver} onDrop={onTimelineDrop} onDragLeave={onTimelineDragLeave}>
        <div className="cal-grid"
          style={{
            gridTemplateColumns: `repeat(${colCount}, var(--day-w))`,
            // trailing 1fr row lets the day columns (and drop highlight) fill the full height
            gridTemplateRows: `auto repeat(${laneCount}, minmax(var(--lane-h), max-content)) 1fr`,
            // Where a spanning bar's content re-pins so it clears the sticky "No date" column.
            ['--stick-left' as string]: hasNoDate ? 'calc(var(--day-w) + var(--cal-gap))' : '0px'
          }}>
          {/* No-date column (kept inside the grid so its header lines up with the days) */}
          {hasNoDate && (
            <>
              <div className="cal-h-head nodate" style={{ gridColumn: 1, gridRow: 1 }}>
                <span className="cal-dow2">No date</span>
              </div>
              <div className="cal-h-bg nodate" data-iso="" style={{ gridColumn: 1, gridRow: '1 / -1' }} />
            </>
          )}
          {buckets.map(headCell)}
          {buckets.map(bgCell)}
          {placed.map(bar)}
        </div>
      </div>

      {(isNew || editCard) && (
        <Modal title={isNew ? `New ${v.update.toLowerCase()}` : `Edit ${v.update.toLowerCase()}`} className="modal-center" onClose={onCancel}>
          <CardEditor bare versions={versions}
            card={editCard} status={editCard ? editCard.status : 'todo'}
            defaultDate={isNew ? newCardDate : undefined}
            defaultVersion={project.active_version_id ? (versionById.get(project.active_version_id)?.name ?? '') : ''}
            onSubmit={onSubmit} onCancel={onCancel} />
        </Modal>
      )}
    </div>
  );
}
