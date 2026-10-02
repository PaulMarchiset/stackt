'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createDemoClient } from '@/lib/demo/db';
import type { ProjectMember } from '@/lib/types';

function initialOf(email: string): string {
  return (email.trim()[0] || '?').toUpperCase();
}

/**
 * Who is responsible for this card. Multiple people can share one card —
 * one row each in card_assignees. Any member can assign anyone (same rule
 * as moving a card, not a membership change).
 *
 * Search-first on purpose: on a project with many members a full roster
 * would drown the card, so only the selected are shown — type to find more.
 */
export default function AssigneePicker({
  projectId, selected, onChange, demo = false
}: {
  projectId: string;
  selected: string[]; // user_ids
  onChange: (ids: string[]) => void;
  demo?: boolean;
}) {
  const supabase = useMemo(() => (demo ? createDemoClient() : createClient()), [demo]);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    void supabase.rpc('project_members_detailed', { p: projectId }).then(({ data }) => {
      if (live) setMembers(((data as ProjectMember[]) ?? []).slice().sort((a, b) => a.email.localeCompare(b.email)));
    });
    return () => { live = false; };
  }, [supabase, projectId]);

  // Close suggestions on outside click.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open ]);

  const byId = useMemo(() => new Map(members.map((m) => [m.user_id, m] as const)), [members]);
  const chosen = selected.map((id) => byId.get(id)).filter((m): m is ProjectMember => !!m);
  // Stale ids (member left) still show so they can be removed.
  const missing = selected.filter((id) => !byId.has(id));

  const q = query.trim().toLowerCase();
  const suggestions = members
    .filter((m) => !selected.includes(m.user_id))
    .filter((m) => !q || m.email.toLowerCase().includes(q))
    .slice(0, 6);

  function add(uid: string) {
    onChange([...selected, uid]);
    setQuery('');
  }

  function remove(uid: string) {
    onChange(selected.filter((id) => id !== uid));
  }

  return (
    <div className="assignee-picker">
      <div className="ver-label">Responsible {selected.length > 0 && <em>({selected.length})</em>}</div>
      {chosen.length > 0 && (
        <div className="assignee-list">
          {chosen.map((m) => (
            <span key={m.user_id} className="assignee-chip" title={m.email + (m.role === 'owner' ? ' (owner)' : '')}>
              <span className="assignee-avatar">{initialOf(m.email)}</span>
              <span className="assignee-email">{m.email}</span>
              <button type="button" className="assignee-x" title={`Unassign ${m.email}`} onClick={() => remove(m.user_id)}>×</button>
            </span>
          ))}
          {missing.map((uid) => (
            <span key={uid} className="assignee-chip stale" title="No longer on this project">
              <span className="assignee-avatar">?</span>
              <span className="assignee-email">Former member</span>
              <button type="button" className="assignee-x" title="Remove" onClick={() => remove(uid)}>×</button>
            </span>
          ))}
        </div>
      )}
      <div className="assignee-search" ref={boxRef}>
        <input value={query} spellCheck={false} autoComplete="off"
          placeholder={selected.length ? 'Type to add someone…' : 'Type a name or email to assign…'}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
            if (e.key === 'Enter' && suggestions.length > 0) { e.preventDefault(); add(suggestions[0].user_id); }
          }} />
        {open && suggestions.length > 0 && (
          <div className="assignee-suggest">
            {suggestions.map((m) => (
              <button key={m.user_id} type="button" onClick={() => add(m.user_id)} title={m.role === 'owner' ? 'owner' : undefined}>
                <span className="assignee-avatar">{initialOf(m.email)}</span>
                <span className="assignee-email">{m.email}</span>
                {m.role === 'owner' && <span className="assignee-role">owner</span>}
              </button>
            ))}
          </div>
        )}
        {open && q && suggestions.length === 0 && (
          <div className="assignee-suggest"><span className="assignee-none">No member matches “{query.trim()}”.</span></div>
        )}
      </div>
    </div>
  );
}
