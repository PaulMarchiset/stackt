'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createDemoClient } from '@/lib/demo/db';
import { usePersist } from '@/lib/usePersist';
import { sortGroups } from '@/lib/grouping';
import type { Project, ProjectGroup } from '@/lib/types';

/**
 * The projects page's data layer: every read is state, every write is optimistic
 * and reverts itself if the row never lands.
 *
 * It exists for the same reason useBoardStore does — the page above should be
 * about layout and intent ("this project moved into that group"), not about
 * Supabase calls, rollback copies and toast wording. Groups and projects are
 * owned together on purpose: half the operations here touch both (deleting a
 * group frees its projects, dropping a card re-groups *and* re-orders it).
 */
export function useProjectsStore(
  initialProjects: Project[],
  initialGroups: ProjectGroup[],
  showToast: (msg: string, err?: boolean) => void,
  demo = false
) {
  /* In demo mode the writes go to a stub that keeps nothing — see lib/demo/db.ts. */
  const supabase = useMemo(() => (demo ? createDemoClient() : createClient()), [demo]);
  const { saving, persist, persistRow } = usePersist(showToast);
  const [projects, setProjects] = useState<Project[]>(initialProjects);
  const [groups, setGroups] = useState<ProjectGroup[]>(initialGroups);

  const RETRY = 'Could not save — check your connection.';

  /* ---------- Projects ---------- */

  function patchProject(id: string, patch: Partial<Project>) {
    const before = projects;
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    void persist(supabase.from('projects').update(patch).eq('id', id),
      { message: RETRY, onError: () => setProjects(before) });
  }

  function deleteProject(id: string) {
    const before = projects;
    setProjects((ps) => ps.filter((p) => p.id !== id));
    void persist(supabase.from('projects').delete().eq('id', id),
      { message: 'Could not delete — check your connection.', onError: () => setProjects(before) });
  }

  /* ---------- Groups ---------- */

  /* Created at the *top* of the list, because a group is made in order to be
     filled and the thing you are about to fill should not land underneath
     everything you already have. One step below the lowest position does that
     in a single insert: sortGroups only reads positions, it never needs them
     dense, and the next reorder renumbers the lot from 0 anyway.

     The caller decides what to do with the row (the projects page drops the
     project the group was made for straight into it). */
  async function createGroup(name: string): Promise<ProjectGroup | null> {
    const position = groups.reduce((m, g) => Math.min(m, g.position), 0) - 1;
    const created = await persistRow<ProjectGroup>(
      supabase.from('project_groups').insert({ name: name.trim() || 'Group', position }).select().single(),
      { message: 'Could not create the group — try again.' }
    );
    if (created) setGroups((gs) => [...gs, created]);
    return created;
  }

  function patchGroup(id: string, patch: Partial<ProjectGroup>) {
    const before = groups;
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));
    void persist(supabase.from('project_groups').update(patch).eq('id', id),
      { message: RETRY, onError: () => setGroups(before) });
  }

  /* Deleting a group never touches the projects inside it: the FK sets their
     group_id to null and they resurface under Ungrouped. */
  function deleteGroup(id: string) {
    const beforeGroups = groups, beforeProjects = projects;
    setGroups((gs) => gs.filter((g) => g.id !== id));
    setProjects((ps) => ps.map((p) => (p.group_id === id ? { ...p, group_id: null } : p)));
    void persist(supabase.from('project_groups').delete().eq('id', id), {
      message: 'Could not delete the group — try again.',
      onError: () => { setGroups(beforeGroups); setProjects(beforeProjects); }
    });
  }

  /**
   * Put the group at `from` where `to` is, and renumber the lot.
   *
   * Positions are rewritten from 0 for every group rather than nudged for the
   * one that moved: the rows arrive from the database in an order that may have
   * gaps or ties, and one dense pass is both simpler to reason about and
   * cheaper to reconcile than a sparse scheme that drifts.
   */
  function reorderGroups(from: number, to: number) {
    const ordered = sortGroups(groups);
    if (from === to || from < 0 || from >= ordered.length) return;
    const next = ordered.slice();
    const [moved] = next.splice(from, 1);
    next.splice(Math.max(0, Math.min(next.length, to)), 0, moved);
    writeGroupOrder(next);
  }

  function writeGroupOrder(ordered: ProjectGroup[]) {
    const before = groups;
    const renumbered = ordered.map((g, i) => ({ ...g, position: i }));
    setGroups(renumbered);
    void persist(
      supabase.from('project_groups').upsert(
        renumbered.map((g) => ({ id: g.id, name: g.name, position: g.position }))
      ),
      { message: 'Could not reorder the groups — try again.', onError: () => setGroups(before) }
    );
  }

  /**
   * Commit a whole new project order, plus whatever regrouping came with it.
   *
   * `ordered` is every project in the order the page now shows them, so one
   * dense renumber keeps a single global `position` — the same one the board
   * header reads for its tabs — in step with what the page displays. Only the
   * rows that actually changed are written.
   */
  function writeProjectOrder(ordered: Project[]) {
    const before = projects;
    const renumbered = ordered.map((p, i) => ({ ...p, position: i }));
    const byId = new Map(before.map((p) => [p.id, p] as const));
    const changed = renumbered.filter((p) => {
      const was = byId.get(p.id);
      return !was || was.position !== p.position || was.group_id !== p.group_id || was.favorite !== p.favorite;
    });
    if (!changed.length) return;
    setProjects(renumbered);
    void persist(
      supabase.from('projects').upsert(
        changed.map((p) => ({ id: p.id, name: p.name, position: p.position, group_id: p.group_id, favorite: p.favorite }))
      ),
      { message: 'Could not save the new order — try again.', onError: () => setProjects(before) }
    );
  }

  return {
    supabase, saving, persistRow,
    projects, groups, setProjects,
    patchProject, deleteProject,
    createGroup, patchGroup, deleteGroup, reorderGroups, writeGroupOrder, writeProjectOrder
  };
}
