'use client';

import type { Card, TimelineViewProps, Version } from '@/lib/types';
import { dateClass, formatDate, formatDateRange, todayISO, versionColor } from '@/lib/util';
import { useBoardDevMode } from '@/lib/devModeContext';
import { vocab } from '@/lib/labels';
import BranchChip from '@/app/components/BranchChip';
import TypeTag from '@/app/components/TypeTag';
import { IconCalendar, IconCheck, IconDots, IconFlag, IconPlus } from '@/app/components/icons';
import CardEditor from './CardEditor';
import Modal from './Modal';

const STATUS_LABEL: Record<string, string> = { todo: 'To do', inprogress: 'In progress', done: 'Done' };

/* Weekday + date label for a section header, e.g. "Fri · Jul 3, 2026". */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  return `${dow} · ${formatDate(iso)}`;
}

/* A day's worth of the agenda. Milestones ride alongside the cards rather than
   in a section of their own: what matters is "on this day, this also lands". */
type Section = { key: string; label: string; cards: Card[]; milestones?: Version[] };

/**
 * Mobile replacement for the horizontal Gantt: a vertical, top-to-bottom agenda
 * grouped by date (Overdue → Today → each upcoming day → Earlier → No date).
 * No drag — rescheduling happens through the edit sheet. Same prop contract as
 * <Timeline> so BoardApp can swap the two behind useIsMobile().
 */
export default function Agenda({
  project, versions, cards, editing, newCardDate,
  onAdd, onEdit, onToggle, onMenu, onCreateVersion, onSubmit, onCancel
}: TimelineViewProps) {
  const devMode = useBoardDevMode();
  const v = vocab(devMode);
  const versionById = new Map(versions.map((z) => [z.id, z] as const));
  const today = todayISO();
  const isNew = !!editing && editing.startsWith('__new__');
  const editCard = editing && !isNew ? cards.find((c) => c.id === editing) : undefined;

  const byAsc = (a: Card, b: Card) => (a.target_date! < b.target_date! ? -1 : a.target_date! > b.target_date! ? 1 : 0);
  const dated = cards.filter((c) => c.target_date);
  const undated = cards.filter((c) => !c.target_date);

  const overdue = dated.filter((c) => c.target_date! < today && !c.done).sort(byAsc);
  const todayCards = dated.filter((c) => c.target_date === today).sort(byAsc);
  const future = dated.filter((c) => c.target_date! > today).sort(byAsc);
  const earlier = dated.filter((c) => c.target_date! < today && c.done).sort((a, b) => -byAsc(a, b));

  const sections: Section[] = [];
  if (overdue.length) sections.push({ key: 'overdue', label: 'Overdue', cards: overdue });
  if (todayCards.length) sections.push({ key: 'today', label: `Today · ${formatDate(today)}`, cards: todayCards });
  // One section per distinct upcoming date.
  future.forEach((c) => {
    const last = sections[sections.length - 1];
    if (last && last.key === c.target_date) last.cards.push(c);
    else sections.push({ key: c.target_date!, label: dayLabel(c.target_date!), cards: [c] });
  });
  if (earlier.length) sections.push({ key: 'earlier', label: 'Earlier', cards: earlier });
  if (undated.length) sections.push({ key: 'nodate', label: 'No date', cards: undated });

  /* Drop each milestone into the day it belongs to, creating that day's section
     if no card already made one — a ship date with nothing scheduled on it is
     exactly the case worth seeing. Days already past keep theirs under "today"
     so an overdue milestone can't scroll out of the way. */
  const milestones = versions.filter((z) => !!z.ship_date);
  milestones.forEach((z) => {
    const iso = z.ship_date!;
    const key = iso < today ? 'overdue' : iso === today ? 'today' : iso;
    let at = sections.findIndex((s) => s.key === key);
    if (at < 0) {
      if (key === 'overdue') { sections.unshift({ key, label: 'Overdue', cards: [], milestones: [] }); at = 0; }
      else if (key === 'today') {
        at = sections.findIndex((s) => s.key === 'overdue') + 1;
        sections.splice(at, 0, { key, label: `Today · ${formatDate(today)}`, cards: [], milestones: [] });
      } else {
        // Keep the day sections in date order.
        at = sections.findIndex((s) => /^\d{4}-/.test(s.key) && s.key > key);
        if (at < 0) at = sections.findIndex((s) => s.key === 'earlier' || s.key === 'nodate');
        if (at < 0) at = sections.length;
        sections.splice(at, 0, { key, label: dayLabel(iso), cards: [], milestones: [] });
      }
    }
    (sections[at].milestones ??= []).push(z);
  });

  const row = (c: Card) => {
    const cver = c.version_id ? versionById.get(c.version_id) : null;
    const ci = versionColor(cver);
    const dcls = dateClass(c);
    const multi = !!(c.target_date && c.end_date && c.end_date > c.target_date);
    return (
      <article key={c.id}
        className={'ag-card' + (c.done ? ' done' : '') + (c.type === 'bug' ? ' is-bug' : '')
          + (ci != null ? ' card-theme-' + ci : '')}>
        <button className={'checkbox' + (c.done ? ' checked' : '')} title="Mark done" onClick={() => onToggle(c.id)}>
          <IconCheck />
        </button>
        <div className="ag-body">
          <button className="ag-title" onClick={() => onEdit(c.id)}>{c.title || 'Untitled'}</button>
          <div className="ag-meta">
            {c.type === 'bug' && <TypeTag />}
            {cver && <span className={'chip version' + (ci != null ? ' card-theme-' + ci : '')}>{cver.name}</span>}
            {c.branch && <BranchChip repoUrl={project.repo_url} branch={c.branch} />}
            {(multi || dcls === 'overdue') && (
              <span className={'date ' + dcls}>
                <IconCalendar />
                {formatDateRange(c.target_date, c.end_date)}
                {dcls === 'overdue' && <span className="pill-overdue">overdue</span>}
              </span>
            )}
            <span className="tl-status"><span className={'dot ' + c.status} />{STATUS_LABEL[c.status]}</span>
          </div>
        </div>
        {onMenu && (
          <button className="icon-btn ag-menu" title="Actions" onClick={() => onMenu(c.id)}>
            <IconDots />
          </button>
        )}
      </article>
    );
  };

  return (
    <div className="agenda">
      <div className="agenda-head">
        <div className="cal-title">Timeline</div>
        <div className="meta-spacer" />
        <button className="btn solid" onClick={() => onAdd(today)}>
          <IconPlus className="ic" /> {`Add ${v.update.toLowerCase()}`}
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="empty-hint">{`Nothing scheduled yet — add ${devMode ? 'an' : 'a'} ${v.update.toLowerCase()} to get started.`}</div>
      ) : (
        sections.map((s) => (
          <section key={s.key} className={'ag-section' + (s.key === 'overdue' ? ' overdue' : '')}>
            <div className="ag-section-head">{s.label}<span className="ag-section-count">{s.cards.length}</span></div>
            <div className="ag-list">
              {s.milestones?.map((z) => (
                <div key={z.id} className={'ag-ms card-theme-' + (versionColor(z) ?? 0) + (z.completed ? ' done' : '')}>
                  <IconFlag />
                  <span className="ag-ms-name">{z.name}</span>
                  <span className="ag-ms-word">{v.version.toLowerCase()} ships</span>
                </div>
              ))}
              {s.cards.map(row)}
            </div>
          </section>
        ))
      )}

      {(isNew || editCard) && (
        <Modal title={isNew ? `New ${v.update.toLowerCase()}` : `Edit ${v.update.toLowerCase()}`} onClose={onCancel}>
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
