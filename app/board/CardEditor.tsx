'use client';

import { useEffect, useRef, useState } from 'react';
import type { Card, CardDraft, CardType, Status, Version } from '@/lib/types';
import { suggestNextVersion, versionColor } from '@/lib/util';
import { useBoardDevMode } from '@/lib/devModeContext';
import { vocab } from '@/lib/labels';
import DateField from './DateField';

export default function CardEditor({
  versions, card, status, defaultType, defaultDate, defaultVersion, bare, onSubmit, onCancel
}: {
  versions: Version[]; card?: Card; status: Status;
  defaultType?: CardType; defaultDate?: string; defaultVersion?: string; bare?: boolean;
  onSubmit: (v: CardDraft) => void; onCancel: () => void;
}) {
  const devMode = useBoardDevMode();
  const v = vocab(devMode);
  const [title, setTitle] = useState(card?.title ?? '');
  const [comment, setComment] = useState(card?.comment ?? '');
  const [version, setVersion] = useState(
    card ? (versions.find((z) => z.id === card.version_id)?.name ?? '') : (defaultVersion ?? '')
  );
  const [date, setDate] = useState<string>(card?.target_date ?? defaultDate ?? '');
  const [endDate, setEndDate] = useState<string>(card?.end_date ?? '');
  const [branch, setBranch] = useState<string>(card?.branch ?? '');
  const [type, setType] = useState<CardType>(card ? card.type : defaultType ?? 'update');
  const titleRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = titleRef.current;
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
  }, []);

  // Completed versions aren't offered as choices — but keep the card's current one
  // visible so an already-assigned (now completed) version doesn't silently vanish.
  const pickable = versions.filter((z) => !z.completed || z.name === version.trim());

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
          {pickable.map((z) => (
            <button key={z.id} type="button"
              className={'ver-pick card-theme-' + (versionColor(z) ?? 0) + (version.trim() === z.name ? ' active' : '')}
              onClick={() => setVersion(z.name)}>{z.name}</button>
          ))}
          <button type="button" className="ver-pick" onClick={() => setVersion(devMode ? suggestNextVersion(versions.map((z) => z.name)) : '')}>+ New</button>
        </div>
        <div className="edit-row">
          <input className="version" placeholder={`Type a ${v.version.toLowerCase()}, e.g. ${v.versionExample}`} value={version}
            onChange={(e) => setVersion(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') onCancel(); }} />
        </div>
        <div className="ver-label">Schedule</div>
        <div className="edit-row date-row">
          <div className="date-field">
            <span>Start</span>
            <DateField value={date} placeholder="Pick a date"
              onChange={(v) => { setDate(v); if (endDate && (!v || endDate < v)) setEndDate(''); }} />
          </div>
          <div className="date-field">
            <span>End <em>(optional)</em></span>
            <DateField value={endDate} min={date || undefined} disabled={!date} placeholder="Pick a date"
              onChange={(v) => setEndDate(v)} />
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
        <div className="edit-actions">
          <button className="btn ghost" onClick={onCancel}>Cancel</button>
          <button className="btn solid" onClick={submit}>{card ? 'Save' : 'Add'}</button>
        </div>
    </div>
  );

  return bare ? body : <div className="card card-edit-wrap">{body}</div>;
}
