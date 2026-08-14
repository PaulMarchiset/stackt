'use client';

import { useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { headerIslands, sortGroups } from '@/lib/headerProjects';
import { usePersist } from '@/lib/usePersist';
import { versionColor } from '@/lib/util';
import {
  DEFAULT_USER_PREFS, HEADER_MODES, PALETTE,
  type HeaderMode, type Project, type ProjectGroup
} from '@/lib/types';
import { IconPlus, IconTick, IconTrash } from '@/app/components/icons';

type ProjRow = Pick<Project, 'id' | 'name' | 'group_id' | 'favorite' | 'pinned' | 'position'>;

/* A group's colour follows the same rule as a version's: an explicit choice,
   else a stable hash of the name — one rule, one function. */
const groupColor = (g: ProjectGroup) => versionColor(g) ?? 0;

/**
 * Which projects head the board, and how they're grouped.
 *
 * The section is built around a live sample of the real header: every control
 * here is abstract ("mode", "pinned", "group") and the only way to know what you
 * just chose is to see the row it produces. It's rendered from headerIslands —
 * the same function the board calls — so the sample can't drift from the truth.
 */
export default function HeaderProjects({
  userId, onToast
}: {
  userId: string; onToast: (msg: string, error?: boolean) => void;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { persist, persistRow } = usePersist(onToast);
  const [mode, setMode] = useState<HeaderMode>(DEFAULT_USER_PREFS.header_mode);
  const [projects, setProjects] = useState<ProjRow[]>([]);
  const [groups, setGroups] = useState<ProjectGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [newName, setNewName] = useState('');

  useEffect(() => {
    let alive = true;
    (async () => {
      const [projRes, grpRes, prefRes] = await Promise.all([
        supabase.from('projects').select('id, name, group_id, favorite, pinned, position').order('position').order('created_at'),
        supabase.from('project_groups').select('*').order('position'),
        supabase.from('user_prefs').select('header_mode').eq('user_id', userId).maybeSingle()
      ]);
      if (!alive) return;
      setProjects((projRes.data as ProjRow[]) || []);
      setGroups((grpRes.data as ProjectGroup[]) || []);
      if (prefRes.data?.header_mode) setMode(prefRes.data.header_mode as HeaderMode);
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [supabase, userId]);

  /* Every write here is one row and saves on the spot — there is no "Save" to
     forget, and the sample below updates as the row lands. */
  const RETRY = 'Could not save — try again.';

  async function saveMode(next: HeaderMode) {
    const prev = mode;
    setMode(next);
    void persist(
      supabase.from('user_prefs').upsert({ user_id: userId, header_mode: next, updated_at: new Date().toISOString() }),
      { message: RETRY, onError: () => setMode(prev) }
    );
  }

  async function patchProject(id: string, patch: Partial<ProjRow>) {
    const before = projects;
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    void persist(supabase.from('projects').update(patch).eq('id', id),
      { message: RETRY, onError: () => setProjects(before) });
  }

  async function addGroup() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    const position = groups.reduce((m, g) => Math.max(m, g.position), -1) + 1;
    const created = await persistRow<ProjectGroup>(
      supabase.from('project_groups').insert({ name, position }).select().single(),
      { message: 'Could not create the group — try again.' }
    );
    setBusy(false);
    if (!created) return;
    setGroups((gs) => [...gs, created]);
    setNewName('');
    if (mode !== 'groups') void saveMode('groups');   // you just made one — show it
  }

  async function patchGroup(id: string, patch: Partial<ProjectGroup>) {
    const before = groups;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    void persist(supabase.from('project_groups').update(patch).eq('id', id),
      { message: RETRY, onError: () => setGroups(before) });
  }

  /* Deleting a group never touches the projects inside it — the FK sets their
     group_id to null and they reappear in the trailing island. */
  async function deleteGroup(id: string) {
    const beforeGroups = groups, beforeProjects = projects;
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setProjects((ps) => ps.map((p) => (p.group_id === id ? { ...p, group_id: null } : p)));
    void persist(supabase.from('project_groups').delete().eq('id', id), {
      message: 'Could not delete the group — try again.',
      onError: () => { setGroups(beforeGroups); setProjects(beforeProjects); }
    });
  }

  const sample = useMemo(
    () => headerIslands(mode, projects as Project[], groups, projects[0]?.id ?? null),
    [mode, projects, groups]
  );

  if (loading) return <div className="set-card"><div className="set-row"><p className="set-desc">Loading…</p></div></div>;

  return (
    <>
      <div className="set-card" style={{ marginBottom: 20 }}>
        <div className="set-row">
          <span className="set-label">Projects shown in the board header</span>
          <div className="set-modes" role="group" aria-label="Header mode">
            {HEADER_MODES.map((m) => (
              <button type="button" key={m.key} className={'set-mode' + (mode === m.key ? ' on' : '')}
                aria-pressed={mode === m.key} onClick={() => saveMode(m.key)}>
                <span className="set-mode-name">{m.label}</span>
                <span className="set-mode-hint">{m.hint}</span>
              </button>
            ))}
          </div>

          {/* The point of the whole section, drawn from the real function. */}
          <div className="set-sample" aria-label="Header preview">
            {sample.map((isle, i) => (
              <div key={isle.key} className={'set-sample-isle card-theme-' + (isle.colorIndex ?? 0)}>
                {i > 0 && <span className="set-sample-sep" />}
                {isle.label && <span className="set-sample-label">{isle.label}</span>}
                {isle.projects.map((p) => (
                  <span key={p.id} className="set-sample-tab">{p.name || 'Untitled'}</span>
                ))}
              </div>
            ))}
          </div>
          <p className="set-hint">
            If a mode selects nothing at all, the header falls back to every project — and the board
            you have open always keeps its tab, whichever mode you pick.
          </p>
        </div>

        {/* Chosen mode: click the projects themselves. A switch per row asked you
            to read a list, find a name and aim at a toggle; the chips *are* the
            header you're building, so picking one is one click on the thing. */}
        {mode === 'custom' && (
          <div className="set-row">
            <span className="set-label">Click the projects to show</span>
            {projects.length === 0 ? (
              <p className="set-desc">No projects yet.</p>
            ) : (
              <div className="set-pick">
                {projects.map((p) => (
                  <button type="button" key={p.id} className={'set-pickopt' + (p.pinned ? ' on' : '')}
                    aria-pressed={p.pinned}
                    onClick={() => patchProject(p.id, { pinned: !p.pinned })}>
                    {p.pinned && <IconTick />}
                    {p.name || 'Untitled'}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="set-card">
        <div className="set-row">
          <span className="set-label">Groups</span>
          <p className="set-desc" style={{ marginTop: 0, marginBottom: 14 }}>
            A project belongs to one group at most. In <b>Groups</b> mode each one becomes its own
            island in the header; anything ungrouped trails at the end.
          </p>

          <div className="set-grouplist">
            {sortGroups(groups).map((g) => (
              <div className={'set-group card-theme-' + groupColor(g)} key={g.id}>
                <span className="set-swatch" />
                <input className="set-input set-group-name" value={g.name} spellCheck={false}
                  aria-label="Group name"
                  onChange={(e) => setGroups((gs) => gs.map((x) => (x.id === g.id ? { ...x, name: e.target.value } : x)))}
                  onBlur={(e) => patchGroup(g.id, { name: e.target.value.trim() || 'Group' })} />
                <div className="set-group-colors">
                  {PALETTE.map((c, i) => (
                    <button key={i} type="button" className={'color-opt' + (groupColor(g) === i ? ' sel' : '')}
                      style={{ background: c.dot }} title={c.name}
                      onClick={() => patchGroup(g.id, { color_index: i })} />
                  ))}
                </div>
                <span className="set-proj-count">
                  {projects.filter((p) => p.group_id === g.id).length}
                </span>
                <button className="icon-btn del" title="Delete group" onClick={() => deleteGroup(g.id)}>
                  <IconTrash />
                </button>
              </div>
            ))}
          </div>

          <div className="set-inputline" style={{ marginTop: groups.length ? 14 : 0 }}>
            <input className="set-input" value={newName} spellCheck={false} placeholder="New group — e.g. Clients"
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') addGroup(); }} />
            <button className="btn ghost" onClick={addGroup} disabled={busy || !newName.trim()}>
              <IconPlus className="ic" /> Add
            </button>
          </div>
        </div>

        {groups.length > 0 && (
          <div className="set-row">
            <span className="set-label">Which group each project is in</span>
            <div className="set-projlist">
              {projects.map((p) => (
                <div className="set-proj" key={p.id}>
                  <span className="set-proj-name">{p.name || 'Untitled'}</span>
                  <span className="set-proj-spacer" />
                  <div className="set-grouppick">
                    <button type="button" className={'set-gopt' + (!p.group_id ? ' on' : '')}
                      onClick={() => patchProject(p.id, { group_id: null })}>None</button>
                    {sortGroups(groups).map((g) => (
                      <button type="button" key={g.id}
                        className={'set-gopt card-theme-' + groupColor(g) + (p.group_id === g.id ? ' on' : '')}
                        onClick={() => patchProject(p.id, { group_id: g.id })}>{g.name}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
