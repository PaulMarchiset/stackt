'use client';

import type { Card, Project } from '@/lib/types';
import { dateClass, formatDate, formatDateRange, todayISO, versionColorIndex } from '@/lib/util';
import BranchChip from '@/app/components/BranchChip';
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
              <span className="chip bug"><svg viewBox="0 0 24 24"><path d="M12 20V11M12 20C13.5913 20 15.1174 19.3679 16.2426 18.2426C17.3679 17.1174 18 15.5913 18 14V11C18 9.93913 17.5786 8.92172 16.8284 8.17157C16.0783 7.42143 15.0609 7 14 7H10C8.93913 7 7.92172 7.42143 7.17157 8.17157C6.42143 8.92172 6 9.93913 6 11V14C6 15.5913 6.63214 17.1174 7.75736 18.2426C8.88258 19.3679 10.4087 20 12 20ZM14.1201 3.88L16.0001 2M20.9999 21C21.0011 19.9712 20.6059 18.9816 19.8963 18.2367C19.1868 17.4918 18.2175 17.0489 17.1899 17M21 5C20.9988 5.98215 20.6364 6.92956 19.9817 7.66169C19.327 8.39383 18.4259 8.85951 17.45 8.97M22 13H18M3 21C2.99884 19.9712 3.39409 18.9816 4.10362 18.2367C4.81315 17.4918 5.78241 17.0489 6.81 17M3 5C3.00113 5.98215 3.36357 6.92956 4.01825 7.66169C4.67293 8.39383 5.57408 8.85951 6.55 8.97M6 13H2M8 2L9.88 3.88M9 7.13V6C9 5.20435 9.31607 4.44129 9.87868 3.87868C10.4413 3.31607 11.2044 3 12 3C12.7956 3 13.5587 3.31607 14.1213 3.87868C14.6839 4.44129 15 5.20435 15 6V7.13" /></svg>Bug</span>
            )}
            {c.version && <span className={'chip version' + (ci != null ? ' card-theme-' + ci : '')}>{c.version}</span>}
            {c.branch && <BranchChip repoUrl={project.repo_url} branch={c.branch} />}
            {(multi || dcls === 'overdue') && (
              <span className={'date ' + dcls}>
                <svg viewBox="0 0 24 24"><path d="M21 10H3M16 2V6M8 2V6M7.8 22H16.2C17.8802 22 18.7202 22 19.362 21.673C19.9265 21.3854 20.3854 20.9265 20.673 20.362C21 19.7202 21 18.8802 21 17.2V8.8C21 7.11984 21 6.27976 20.673 5.63803C20.3854 5.07354 19.9265 4.6146 19.362 4.32698C18.7202 4 17.8802 4 16.2 4H7.8C6.11984 4 5.27976 4 4.63803 4.32698C4.07354 4.6146 3.6146 5.07354 3.32698 5.63803C3 6.27976 3 7.11984 3 8.8V17.2C3 18.8802 3 19.7202 3.32698 20.362C3.6146 20.9265 4.07354 21.3854 4.63803 21.673C5.27976 22 6.11984 22 7.8 22Z" /></svg>
                {formatDateRange(c.target_date, c.end_date)}
                {dcls === 'overdue' && <span className="pill-overdue">overdue</span>}
              </span>
            )}
            <span className="tl-status"><span className={'dot ' + c.status} />{STATUS_LABEL[c.status]}</span>
          </div>
        </div>
        {onMenu && (
          <button className="icon-btn ag-menu" title="Actions" onClick={() => onMenu(c.id)}>
            <svg viewBox="0 0 24 24"><path d="M12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12C11 12.5523 11.4477 13 12 13Z" /><path d="M12 6C12.5523 6 13 5.55228 13 5C13 4.44772 12.5523 4 12 4C11.4477 4 11 4.44772 11 5C11 5.55228 11.4477 6 12 6Z" /><path d="M12 20C12.5523 20 13 19.5523 13 19C13 18.4477 12.5523 18 12 18C11.4477 18 11 18.4477 11 19C11 19.5523 11.4477 20 12 20Z" /></svg>
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
