'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, TimelineViewProps, Version } from '@/lib/types';
import { todayISO, versionColor } from '@/lib/util';
import { useBoardDevMode } from '@/lib/devModeContext';
import { vocab } from '@/lib/labels';
import BranchChip from '@/app/components/BranchChip';
import TypeTag from '@/app/components/TypeTag';
import { IconCheck, IconFlag, IconPencil, IconPlus } from '@/app/components/icons';
import CardEditor from './CardEditor';
import Modal from './Modal';

const STATUS_LABEL: Record<string, string> = { todo: 'To do', inprogress: 'In progress', done: 'Done' };

/* Grid rows, named once so a change up top never means hunting for "+2".
   1 day headers · 2+ card lanes · trailing filler. */
const HEAD_ROW = 1;
const LANE_ROW = 2;

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
  project, versions, cards, editing, newCardDate,
  onAdd, onEdit, onToggle, onReschedule, onCreateVersion, onSubmit, onCancel
}: TimelineViewProps) {
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
  const isNew = editing?.kind === 'new';
  const editCard = editing?.kind === 'edit' ? cards.find((c) => c.id === editing.id) : undefined;

  // Build the day range from the earliest start to the latest end, with a week of room on
  // each side — the leading days give some context just before today/the first card.
  const stamps: string[] = [];
  cards.forEach((c) => { if (c.target_date) stamps.push(c.target_date); if (c.end_date) stamps.push(c.end_date); });
  // Ship dates widen the range too — a milestone with no card under it still has
  // to have a column to stand on.
  versions.forEach((z) => { if (z.ship_date) stamps.push(z.ship_date); });
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

  /* Which month a column belongs to. In Day view a screenful of "12 13 14 15"
     says nothing about *when*, so the heading above the timeline names the month
     you are actually looking at (see visMonth). Month view already names its
     columns, so there the heading carries the year instead. */
  const monthLabel = (b: Bucket) => {
    const d = fromIso(b.dropIso);
    return scale === 'month'
      ? String(d.getFullYear())
      : d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  };

  const undated = cards.filter((c) => !c.target_date);
  const hasNoDate = undated.length > 0;
  const colOffset = hasNoDate ? 1 : 0;          // grid column for buckets[0] = colOffset (0-based)
  const colCount = colOffset + buckets.length;

  /* Milestones: the versions with a ship date, indexed by the column they land
     in. They get their own grid row, which collapses to nothing when empty. */
  const msByBucket = new Map<number, Version[]>();
  versions.forEach((z) => {
    if (!z.ship_date) return;
    const i = dayToBucket.get(z.ship_date);
    if (i == null) return;
    const arr = msByBucket.get(i) ?? [];
    arr.push(z);
    msByBucket.set(i, arr);
  });

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
  /* The heading tracks the scroll: it names the month of the leftmost column you
     can actually see, past the pinned "No date" panel. One place to look, and it
     is right by construction — it reads the rendered header cells rather than
     recomputing where the scroll "should" be. */
  const [visMonth, setVisMonth] = useState('');
  const readVisibleMonth = () => {
    const host = scrollRef.current;
    if (!host) return;
    const hostR = host.getBoundingClientRect();
    const pinned = host.querySelector<HTMLElement>('.cal-h-head.nodate');
    const edge = hostR.left + (pinned ? pinned.getBoundingClientRect().width + 10 : 0) + 2;
    const heads = host.querySelectorAll<HTMLElement>('.cal-h-head[data-month]');
    for (let i = 0; i < heads.length; i++) {
      if (heads[i].getBoundingClientRect().right > edge) { setVisMonth(heads[i].dataset.month || ''); return; }
    }
  };
  useEffect(() => { scrollToToday(); readVisibleMonth(); }, [scale]); // eslint-disable-line react-hooks/exhaustive-deps

  const title = visMonth || (buckets[0] ? monthLabel(buckets[0]) : '');

  const bar = ({ card: c, c0, c1, lane }: Placed) => {
    const cver = c.version_id ? versionById.get(c.version_id) : null;
    const ci = versionColor(cver);
    const multi = c1 > c0;
    return (
      <div key={c.id} draggable
        style={{ gridColumn: `${c0 + 1} / ${c1 + 2}`, gridRow: lane + LANE_ROW }}
        onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.id); const el = e.currentTarget; window.setTimeout(() => el.classList.add('dragging'), 0); }}
        onDragEnd={(e) => { e.currentTarget.classList.remove('dragging'); clearHighlight(); }}
        className={'cal-bar' + (c.done ? ' done' : '') + (c.type === 'bug' ? ' is-bug' : '')
          + (multi ? ' multi' : '') + (c.target_date ? '' : ' nodate')
          + (ci != null ? ' card-theme-' + ci : '') + (editCard?.id === c.id ? ' editing' : '')}>
        <span className="cal-bar-accent" />
        <div className="cal-bar-main">
          <button className={'checkbox' + (c.done ? ' checked' : '')} title="Mark done" onClick={() => onToggle(c.id)}>
            <IconCheck />
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
            <IconPencil />
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
    /* The milestone rides in the header, immediately right of the day number:
       a ship date is a property of that day, so it belongs where the day is
       named rather than in a band of its own below. */
    const ms = msByBucket.get(i);
    return (
      <div key={'h' + bucket.key} className={'cal-h-head ' + whenOf(i)} data-month={monthLabel(bucket)}
        style={{ gridColumn: i + colOffset + 1, gridRow: HEAD_ROW }}
        ref={i === todayBucket ? todayRef : undefined}>
        <span className="cal-dow2">{dow2}</span>
        <span className="cal-dnum">{dnum}</span>
        {ms?.map((z) => (
          <span key={z.id} className={'cal-ms card-theme-' + (versionColor(z) ?? 0) + (z.completed ? ' done' : '')}
            title={`${z.name} · ships ${z.ship_date}`}>
            <IconFlag />
            <span className="cal-ms-name">{z.name}</span>
          </span>
        ))}
        {mon && !ms && <span className="cal-mon">{mon}</span>}
      </div>
    );
  };

  // A column background carries its representative date in data-iso; the drop handler reads it.
  const bgCell = (bucket: Bucket, i: number) => {
    const ms = msByBucket.get(i);
    const ci = ms ? versionColor(ms[0]) : null;
    return (
      <div key={'b' + bucket.key} data-iso={bucket.dropIso}
        className={'cal-h-bg ' + whenOf(i) + (ms ? ' has-ms card-theme-' + (ci ?? 0) : '')}
        style={{ gridColumn: i + colOffset + 1, gridRow: `${LANE_ROW} / -1` }}
        onDoubleClick={() => onAdd(bucket.dropIso)} />
    );
  };

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
          <IconPlus className="ic" /> {`Add ${v.update.toLowerCase()}`}
        </button>
        <button className="btn" onClick={() => scrollToToday('smooth')}>Today</button>
      </div>

      <div className="cal-h" ref={scrollRef} onScroll={readVisibleMonth}
        onDragOver={onTimelineDragOver} onDrop={onTimelineDrop} onDragLeave={onTimelineDragLeave}>
        <div className="cal-grid"
          style={{
            gridTemplateColumns: `repeat(${colCount}, var(--day-w))`,
            // headers · lanes · trailing 1fr so the day columns (and the drop
            // highlight) fill the full height
            gridTemplateRows: `auto repeat(${laneCount}, minmax(var(--lane-h), max-content)) 1fr`,
            // Where a spanning bar's content re-pins so it clears the sticky "No date" column.
            ['--stick-left' as string]: hasNoDate ? 'calc(var(--day-w) + var(--cal-gap))' : '0px'
          }}>
          {/* No-date column (kept inside the grid so its header lines up with the days) */}
          {hasNoDate && (
            <>
              <div className="cal-h-head nodate" style={{ gridColumn: 1, gridRow: HEAD_ROW }}>
                <span className="cal-dow2">No date</span>
              </div>
              <div className="cal-h-bg nodate" data-iso="" style={{ gridColumn: 1, gridRow: `${HEAD_ROW} / -1` }} />
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
            onCreateVersion={onCreateVersion} onSubmit={onSubmit} onCancel={onCancel} />
        </Modal>
      )}
    </div>
  );
}
