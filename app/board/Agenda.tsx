'use client';

import type { Card, Project } from '@/lib/types';
import { dateClass, formatDate, formatDateRange, todayISO, versionColorIndex } from '@/lib/util';
import CardEditor from './CardEditor';
import Modal from './Modal';

const STATUS_LABEL: Record<string, string> = { todo: 'To do', inprogress: 'In progress', done: 'Done' };

/* Weekday + date label for a section header, e.g. "Fri · Jul 3, 2026". */
function dayLabel(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dow = new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short' });
  return `${dow} · ${formatDate(iso)}`;
}

type Section = { key: string; label: string; cards: Card[] };

/**
 * Mobile replacement for the horizontal Gantt: a vertical, top-to-bottom agenda
 * grouped by date (Overdue → Today → each upcoming day → Earlier → No date).
 * No drag — rescheduling happens through the edit sheet. Same prop contract as
 * <Timeline> so BoardApp can swap the two behind useIsMobile().
 */
export default function Agenda({
  project, projCards, cards, editing, newCardDate,
  onAdd, onEdit, onToggle, onMenu, onSubmit, onCancel
}: {
  project: Project; projCards: Card[]; cards: Card[];
  editing: string | null; newCardDate: string;
  onAdd: (date: string) => void;
  onEdit: (id: string) => void;
  onToggle: (id: string) => void;
  onMenu?: (id: string) => void;
  onReschedule: (id: string, date: string) => void;
  onSubmit: (v: Partial<Card>) => void;
  onCancel: () => void;
}) {
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

  const row = (c: Card) => {
    const ci = versionColorIndex(project, c.version);
    const dcls = dateClass(c);
    const multi = !!(c.target_date && c.end_date && c.end_date > c.target_date);
    return (
      <article key={c.id}
        className={'ag-card' + (c.done ? ' done' : '') + (c.type === 'bug' ? ' is-bug' : '')
          + (ci != null ? ' card-theme-' + ci : '')}>
        <button className={'checkbox' + (c.done ? ' checked' : '')} title="Mark done" onClick={() => onToggle(c.id)}>
          <svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7" /></svg>
        </button>
        <div className="ag-body">
          <button className="ag-title" onClick={() => onEdit(c.id)}>{c.title || 'Untitled'}</button>
          <div className="ag-meta">
            {c.type === 'bug' && (
              <span className="chip bug"><svg viewBox="0 0 24 24"><rect x="8" y="8" width="8" height="11" rx="4" /><path d="M9.5 8a2.5 2.5 0 0 1 5 0M12 11.5v6M8 11.5H5M8 15.5H5.5M16 11.5h3M16 15.5h2.5" /></svg>Bug</span>
            )}
            {c.version && <span className={'chip version' + (ci != null ? ' card-theme-' + ci : '')}>{c.version}</span>}
            {(multi || dcls === 'overdue') && (
              <span className={'date ' + dcls}>
                <svg viewBox="0 0 16 16"><rect x="2.5" y="3.5" width="11" height="10" rx="1.5" /><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" /></svg>
                {formatDateRange(c.target_date, c.end_date)}
                {dcls === 'overdue' && <span className="pill-overdue">overdue</span>}
              </span>
            )}
            <span className="tl-status"><span className={'dot ' + c.status} />{STATUS_LABEL[c.status]}</span>
          </div>
        </div>
        {onMenu && (
          <button className="icon-btn ag-menu" title="Actions" onClick={() => onMenu(c.id)}>
            <svg viewBox="0 0 16 16"><circle cx="8" cy="3" r="1.4" /><circle cx="8" cy="8" r="1.4" /><circle cx="8" cy="13" r="1.4" /></svg>
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
          <svg viewBox="0 0 16 16" className="ic"><path d="M8 3.5v9M3.5 8h9" /></svg> Add update
        </button>
      </div>

      {sections.length === 0 ? (
        <div className="empty-hint">Nothing scheduled yet — add an update to get started.</div>
      ) : (
        sections.map((s) => (
          <section key={s.key} className={'ag-section' + (s.key === 'overdue' ? ' overdue' : '')}>
            <div className="ag-section-head">{s.label}<span className="ag-section-count">{s.cards.length}</span></div>
            <div className="ag-list">{s.cards.map(row)}</div>
          </section>
        ))
      )}

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
