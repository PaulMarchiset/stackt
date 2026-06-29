'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, CardType, Project, Status } from '@/lib/types';
import { projectVersions, suggestNextVersion, versionColorIndex } from '@/lib/util';

export default function CardEditor({
  project, projCards, card, status, defaultType, defaultDate, bare, onSubmit, onCancel
}: {
  project: Project; projCards: Card[]; card?: Card; status: Status;
  defaultType?: CardType; defaultDate?: string; bare?: boolean;
  onSubmit: (v: Partial<Card>) => void; onCancel: () => void;
}) {
  const [title, setTitle] = useState(card?.title ?? '');
  const [version, setVersion] = useState(card ? card.version : project.active_version || '');
  const [date, setDate] = useState<string>(card?.target_date ?? defaultDate ?? '');
  const [endDate, setEndDate] = useState<string>(card?.end_date ?? '');
  const [type, setType] = useState<CardType>(card ? card.type : defaultType ?? 'update');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);

  const vers = projectVersions(project, projCards);

  function submit() {
    const t = title.trim();
    if (!t) { titleRef.current?.focus(); return; }
    // end_date only makes sense alongside a start, and never before it.
    const end = date && endDate && endDate > date ? endDate : null;
    onSubmit({ title: t, version: version.trim(), target_date: date || null, end_date: end, type });
  }

  const body = (
    <div className="card-edit">
        <div className="type-toggle">
          {(['update', 'bug'] as const).map((t) => (
            <button key={t} type="button"
              className={'type-opt' + (type === t ? ' active' : '') + (t === 'bug' && type === t ? ' bug-active' : '')}
              onClick={() => setType(t)}>{t === 'update' ? 'Update' : 'Bug'}</button>
          ))}
        </div>
        <textarea ref={titleRef} className="title" rows={1}
          placeholder={type === 'bug' ? "What's the bug?" : "What's the update?"}
          value={title} onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); if (e.key === 'Escape') onCancel(); }} />
        <div className="ver-label">Version</div>
        <div className="ver-quick">
          {vers.map((v) => (
            <button key={v} type="button"
              className={'ver-pick card-theme-' + (versionColorIndex(project, v) ?? 0) + (version.trim() === v ? ' active' : '')}
              onClick={() => setVersion(v)}>{v}</button>
          ))}
          <button type="button" className="ver-pick" onClick={() => setVersion(suggestNextVersion(vers))}>+ New</button>
        </div>
        <div className="edit-row">
          <input className="version" placeholder="Type a version, e.g. v1.0.0" value={version}
            onChange={(e) => setVersion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
        </div>
        <div className="ver-label">Schedule</div>
        <div className="edit-row date-row">
          <label className="date-field">
            <span>Start</span>
            <input className="date" type="date" value={date}
              onChange={(e) => { const v = e.target.value; setDate(v); if (endDate && (!v || endDate < v)) setEndDate(''); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
          </label>
          <label className="date-field">
            <span>End <em>(optional)</em></span>
            <input className="date" type="date" value={endDate} min={date || undefined} disabled={!date}
              onChange={(e) => setEndDate(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
          </label>
        </div>
        <div className="edit-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={submit}>{card ? 'Save' : 'Add'}</button>
        </div>
    </div>
  );

  return bare ? body : <div className="card card-edit-wrap">{body}</div>;
}
