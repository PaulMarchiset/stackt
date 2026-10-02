'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, CardComment, CardDraft, CardType, ProjectMember, Status, Version } from '@/lib/types';
import { suggestNextVersion, versionColor } from '@/lib/util';
import { useBoardDevMode } from '@/lib/devModeContext';
import { vocab } from '@/lib/labels';
import { IconPlus, IconTick } from '@/app/components/icons';
import DateField from './DateField';
import AssigneePicker from './AssigneePicker';
import CardComments from './CardComments';

export default function CardEditor({
  versions, card, status, defaultType, defaultDate, defaultVersion, bare,
  projectId, assigneeIds = [], members = [],
  comments = [], commentUserId = '',
  onAssigneesChange, onAddComment, onEditComment, onDeleteComment,
  onCreateVersion, onSubmit, onCancel, demo = false
}: {
  versions: Version[]; card?: Card; status: Status;
  defaultType?: CardType; defaultDate?: string; defaultVersion?: string; bare?: boolean;
  projectId?: string; assigneeIds?: string[]; members?: ProjectMember[];
  comments?: CardComment[]; commentUserId?: string;
  onAssigneesChange?: (ids: string[]) => void;
  onAddComment?: (body: string, mentionedIds: string[]) => Promise<unknown>;
  onEditComment?: (id: string, body: string) => void;
  onDeleteComment?: (id: string) => void;
  onCreateVersion: (name: string) => Promise<Version | null>;
  onSubmit: (v: CardDraft) => void; onCancel: () => void;
  demo?: boolean;
}) {
  const devMode = useBoardDevMode();
  const v = vocab(devMode);
  const word = v.version.toLowerCase();
  const [title, setTitle] = useState(card?.title ?? '');
  const [comment, setComment] = useState(card?.comment ?? '');
  const [version, setVersion] = useState(
    card ? (versions.find((z) => z.id === card.version_id)?.name ?? '') : (defaultVersion ?? '')
  );
  const [date, setDate] = useState<string>(card?.target_date ?? defaultDate ?? '');
  const [endDate, setEndDate] = useState<string>(card?.end_date ?? '');
  const [branch, setBranch] = useState<string>(card?.branch ?? '');
  const [type, setType] = useState<CardType>(card ? card.type : defaultType ?? 'update');
  // The "new version" sub-form: open, its draft name, the in-flight write, and
  // the name of the one just created (so the UI can say so out loud).
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<string | null>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);

  // Completed versions aren't offered as choices — but keep the card's current one
  // visible so an already-assigned (now completed) version doesn't silently vanish.
  const pickable = versions.filter((z) => !z.completed || z.name === version.trim());

  function startCreate() {
    setDraft(devMode ? suggestNextVersion(versions.map((z) => z.name)) : '');
    setCreated(null);
    setCreating(true);
  }

  /* Creating is a real, immediate action: the version row is written now, the
     new chip appears in the row above already selected, and the confirmation
     line says so. No more "type a name and hope it becomes something on save". */
  async function createVersion() {
    const name = draft.trim();
    if (!name || busy) return;
    const dup = versions.find((z) => z.name.toLowerCase() === name.toLowerCase());
    if (dup) {                       // already exists → just select it, no duplicate row
      setVersion(dup.name); setCreated(dup.name); setCreating(false); setDraft('');
      return;
    }
    setBusy(true);
    const ver = await onCreateVersion(name);
    setBusy(false);
    if (!ver) return;                // the store already surfaced the failure
    setVersion(ver.name);
    setCreated(ver.name);
    setCreating(false);
    setDraft('');
  }

  function submit() {
    const t = title.trim();
    if (!t) { titleRef.current?.focus(); return; }
    // end_date only makes sense alongside a start, and never before it.
    const end = date && endDate && endDate > date ? endDate : null;
    onSubmit({ title: t, comment: comment.trim(), versionName: version.trim(), target_date: date || null, end_date: end, branch: branch.trim(), type });
  }

  const body = (
    <div className="card-edit">
        <div className="type-toggle">
          {(['update', 'bug'] as const).map((t) => (
            <button key={t} type="button"
              className={'type-opt' + (type === t ? ' active' : '') + (t === 'bug' && type === t ? ' bug-active' : '')}
              onClick={() => setType(t)}>{t === 'update' ? v.update : v.bug}</button>
          ))}
        </div>
        <textarea ref={titleRef} className="title" rows={1}
          placeholder={`What's the ${type === 'bug' ? v.bugNoun : v.updateNoun}?`}
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') onCancel(); }} />
        <textarea className="comment" rows={2} placeholder="Add a description… (optional)"
          value={comment} onChange={(e) => setComment(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') onCancel(); }} />

        <div className="ver-label">{v.version}</div>
        <div className="ver-quick">
          <button type="button" className={'ver-pick ver-none' + (version.trim() === '' ? ' active' : '')}
            onClick={() => setVersion('')}>None</button>
          {pickable.map((z) => (
            <button key={z.id} type="button"
              className={'ver-pick card-theme-' + (versionColor(z) ?? 0) + (version.trim() === z.name ? ' active' : '')}
              onClick={() => setVersion(z.name)}>{z.name}</button>
          ))}
          {!creating && (
            <button type="button" className="ver-pick ver-new" onClick={startCreate}>
              <IconPlus /> New
            </button>
          )}
        </div>
        {creating && (
          <div className="ver-create">
            <input className="ver-create-input" autoFocus spellCheck={false}
              placeholder={`Name the ${word}, e.g. ${v.versionExample}`}
              value={draft} onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); void createVersion(); }
                if (e.key === 'Escape') { e.preventDefault(); setCreating(false); }
              }} />
            <div className="ver-create-actions">
              <button type="button" className="btn ghost" onClick={() => setCreating(false)}>Cancel</button>
              <button type="button" className="btn solid" disabled={!draft.trim() || busy} onClick={createVersion}>
                {busy ? 'Creating…' : `Create ${word}`}
              </button>
            </div>
          </div>
        )}
        {created && !creating && (
          <div className="ver-created">
            <IconTick /> <strong>{created}</strong> created — selected for this {type === 'bug' ? v.bugNoun : v.updateNoun}.
          </div>
        )}

        <div className="ver-label">Schedule</div>
        <div className="edit-row date-row">
          <div className="date-field">
            <span>Start</span>
            <DateField value={date} placeholder="Pick a date"
              onChange={(nv) => { setDate(nv); if (endDate && (!nv || endDate < nv)) setEndDate(''); }} />
          </div>
          <div className="date-field">
            <span>End <em>(optional)</em></span>
            <DateField value={endDate} min={date || undefined} disabled={!date} placeholder="Pick a date"
              onChange={(nv) => setEndDate(nv)} />
          </div>
        </div>
        {devMode && (
          <>
            <div className="ver-label">Git branch <em>(optional)</em></div>
            <div className="edit-row">
              <input className="version branch" placeholder="e.g. feature/login" value={branch} spellCheck={false}
                onChange={(e) => setBranch(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
            </div>
          </>
        )}
        {projectId && onAssigneesChange && (
          <AssigneePicker projectId={projectId} selected={assigneeIds} onChange={onAssigneesChange} demo={demo} />
        )}
        {card && projectId && onAddComment && onEditComment && onDeleteComment && (
          <CardComments projectId={projectId} cardId={card.id} userId={commentUserId}
            comments={comments} members={members.length ? members : undefined}
            onAdd={onAddComment} onEdit={onEditComment} onDelete={onDeleteComment} demo={demo} />
        )}
        <div className="edit-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={submit}>{card ? 'Save' : 'Add'}</button>
        </div>
    </div>
  );

  return bare ? body : <div className="card card-edit-wrap">{body}</div>;
}
