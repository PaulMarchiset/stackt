'use client';

import { useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createDemoClient } from '@/lib/demo/db';
import type { Card, CardDraft, EditTarget, BoardProject, Status, Version } from '@/lib/types';
import type { ImportBlock } from '@/lib/importText';
import { usePersist } from '@/lib/usePersist';
import { useToast } from '@/lib/useToast';

/**
 * The board's data layer: the three tables held in React state, plus every
 * mutation that writes them back to Supabase.
 *
 * Everything here is optimistic — local state moves first, the write follows,
 * and a failure surfaces as `saving: 'error'` + a toast. That machinery is
 * shared with every other screen (lib/usePersist · lib/useToast); what lives
 * here is only what the board's three tables mean.
 *
 * BoardApp owns *view* state (what's open, what's filtered) and calls in here
 * for anything that touches data — so the two never tangle again.
 *
 * `demo` swaps the database for a stub that accepts every write and keeps none
 * (lib/demo/db.ts): the board stays fully usable with no account behind it.
 */
export function useBoardStore(
  initialProjects: BoardProject[], initialCards: Card[], initialVersions: Version[],
  userId: string, demo = false
) {
  const supabase = useMemo(() => (demo ? createDemoClient() : createClient()), [demo]);
  const [projects, setProjects] = useState<BoardProject[]>(initialProjects);
  const [cards, setCards] = useState<Card[]>(initialCards);
  const [versions, setVersions] = useState<Version[]>(initialVersions);
  const { toast, showToast } = useToast();
  const { saving, persist, persistRow } = usePersist(showToast);

  /* ---------- Live updates from other people ---------- */

  /* The card currently open in the editor, if any. Remote changes to it are
     dropped rather than applied: a collaborator saving the same card while you
     are typing in it would otherwise replace your unsaved text mid-sentence.
     Losing their edit on screen is recoverable — they saved it, it is in the
     database, and the next resync shows it. Losing yours is not. */
  const heldCard = useRef<string | null>(null);
  function holdCard(id: string | null) { heldCard.current = id; }

  /* Merge one row that arrived over the wire.
     Idempotent on purpose: your own writes come back to you as events too, and
     the cheapest correct answer to an echo is a merge that produces the same
     state twice. `updated_at` decides who wins — the row that reaches us is the
     one the database committed, so it is newer than anything we hold except a
     local edit we have not sent yet, which is what heldCard protects. */
  function applyRemote(e: { table: 'cards' | 'versions'; type: string; row: Record<string, unknown> }) {
    const id = e.row.id as string | undefined;
    if (!id) return;

    if (e.table === 'cards') {
      if (e.type === 'DELETE') {
        setCards((cs) => cs.filter((c) => c.id !== id));
        return;
      }
      if (heldCard.current === id) return;
      const row = e.row as unknown as Card;
      setCards((cs) => (cs.some((c) => c.id === id)
        ? cs.map((c) => (c.id === id ? { ...c, ...row } : c))
        : [...cs, row]));
      return;
    }

    if (e.type === 'DELETE') {
      setVersions((vs) => vs.filter((z) => z.id !== id));
      return;
    }
    const row = e.row as unknown as Version;
    setVersions((vs) => (vs.some((z) => z.id === id)
      ? vs.map((z) => (z.id === id ? { ...z, ...row } : z))
      : [...vs, row]));
  }

  /* Everything again, for this project only. Called after any gap in the
     stream — a dropped socket, a tab that was asleep — where events happened
     that nobody delivered. Rows for other projects are left alone, so switching
     tabs does not throw away what is already loaded. */
  async function resyncProject(projectId: string) {
    const [{ data: freshCards }, { data: freshVersions }] = await Promise.all([
      supabase.from('cards').select('*').eq('project_id', projectId),
      supabase.from('versions').select('*').eq('project_id', projectId)
    ]);
    if (freshCards) {
      setCards((cs) => [...cs.filter((c) => c.project_id !== projectId), ...(freshCards as Card[])]);
    }
    if (freshVersions) {
      setVersions((vs) => [...vs.filter((z) => z.project_id !== projectId), ...(freshVersions as Version[])]);
    }
  }

  /* ---------- Projects ---------- */
  function patchProject(id: string, patch: Partial<BoardProject>) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
    void persist(supabase.from('projects').update(patch).eq('id', id));
  }

  /* Reminders are per-member, so this one field is written to the membership
     row rather than to the project — the project is shared, the opinion isn't.
     It still reads off BoardProject.remind, which the page merges in from the
     membership, so every component keeps the shape it already had. */
  function setRemind(id: string, next: boolean) {
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, remind: next } : p)));
    void persist(
      supabase.from('project_members').update({ remind: next })
        .eq('project_id', id).eq('user_id', userId),
      {
        message: 'Could not change that reminder — try again.',
        onError: () => setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, remind: !next } : p)))
      }
    );
  }

  /* Local-only reorder while a drag is in flight — nothing is written yet. */
  function moveProjectBefore(fromId: string, overId: string) {
    if (fromId === overId) return;
    setProjects((ps) => {
      const fi = ps.findIndex((p) => p.id === fromId);
      const ti = ps.findIndex((p) => p.id === overId);
      if (fi < 0 || ti < 0 || fi === ti) return ps;
      const arr = [...ps];
      const [moved] = arr.splice(fi, 1);
      arr.splice(ti, 0, moved);
      return arr;
    });
  }

  /* Commit the dragged order: write the new positions so it survives a reload. */
  function commitProjectOrder() {
    const arr = projectsRef.current;
    let dirty = false;
    arr.forEach((p, i) => {
      /* Onto the membership, like the projects page: the tab order is this
         person's arrangement of a board others may also be on. */
      if (p.position !== i) {
        dirty = true;
        void persist(supabase.from('project_members').update({ position: i })
          .eq('project_id', p.id).eq('user_id', userId));
      }
    });
    if (dirty) setProjects((ps) => ps.map((p) => {
      const i = arr.findIndex((x) => x.id === p.id);
      return p.position === i ? p : { ...p, position: i };
    }));
  }
  // Latest order, read inside drag handlers (which would otherwise close over stale state).
  const projectsRef = useRef(projects);
  projectsRef.current = projects;

  /* ---------- Cards ---------- */
  /* Every path that flips `done` goes through this, so done_at is always in
     step: stamped when checked, cleared when unchecked. The Done column reads
     it to show the most recently checked first. Re-checking an already-done
     card keeps its original stamp. */
  function doneFields(done: boolean, prev?: Card): Pick<Card, 'done' | 'done_at'> {
    if (!done) return { done: false, done_at: null };
    return { done: true, done_at: prev?.done && prev.done_at ? prev.done_at : new Date().toISOString() };
  }

  async function addCard(projectId: string, values: Partial<Card>, status: Status) {
    const row = {
      project_id: projectId, title: values.title ?? '', comment: values.comment ?? '', version_id: values.version_id ?? null,
      target_date: values.target_date ?? null, end_date: values.end_date ?? null,
      status, ...doneFields(status === 'done'), type: values.type ?? 'update', branch: values.branch ?? ''
    };
    const created = await persistRow(
      supabase.from('cards').insert(row).select().single(), { message: 'Could not add card' }
    );
    if (created) setCards((cs) => [...cs, created as Card]);
  }

  function patchCard(id: string, patch: Partial<Card>) {
    setCards((cs) => cs.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    void persist(supabase.from('cards').update(patch).eq('id', id));
  }

  function deleteCard(id: string) {
    setCards((cs) => cs.filter((c) => c.id !== id));
    void persist(supabase.from('cards').delete().eq('id', id));
  }

  function moveCard(id: string, status: Status) {
    const c = cards.find((x) => x.id === id);
    if (!c || c.status === status) return;
    patchCard(id, { status, ...doneFields(status === 'done', c) });
  }

  function toggleDone(id: string) {
    const c = cards.find((x) => x.id === id);
    if (!c) return;
    const done = !c.done;
    const status: Status = done ? 'done' : c.status === 'done' ? 'todo' : c.status;
    patchCard(id, { status, ...doneFields(done, c) });
  }

  /* Move a card's start day, keeping a multi-day card's duration. Used by the
     timeline's drag-to-reschedule and by the card's date pill. */
  function rescheduleCard(id: string, date: string) {
    const c = cards.find((x) => x.id === id);
    const nd = date || null;
    if (!c || c.target_date === nd) return;
    let end = c.end_date;
    if (nd && c.target_date && c.end_date) {
      const span = (Date.parse(c.end_date) - Date.parse(c.target_date)) / 86400000;
      const e = new Date(nd); e.setDate(e.getDate() + span);
      end = e.toISOString().slice(0, 10);
    } else if (!nd) {
      end = null; // moved to "No date" → drop the range too
    }
    patchCard(id, { target_date: nd, end_date: end });
  }

  /* ---------- Versions (the versions table is the source of truth) ---------- */
  const projectVersions = (projectId: string) => versions.filter((z) => z.project_id === projectId);

  /* Find an existing version by name (in this project) or create the row. */
  async function ensureVersion(projectId: string, name: string): Promise<Version | null> {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const mine = projectVersions(projectId);
    const existing = mine.find((z) => z.name === trimmed);
    if (existing) return existing;
    const position = mine.reduce((m, z) => Math.max(m, z.position), -1) + 1;
    const created = await persistRow(
      supabase.from('versions').insert({ project_id: projectId, name: trimmed, position }).select().single(),
      { message: 'Could not add version' }
    );
    if (!created) return null;
    const ver = created as Version;
    setVersions((vs) => [...vs, ver]);
    return ver;
  }

  /* Delete a version: its cards are kept (the FK sets their version_id → null). */
  function deleteVersion(project: BoardProject, id: string) {
    setCards((cs) => cs.map((c) => (c.version_id === id ? { ...c, version_id: null } : c)));
    setVersions((vs) => vs.filter((z) => z.id !== id));
    if (project.active_version_id === id) patchProject(project.id, { active_version_id: null });
    void persist(supabase.from('versions').delete().eq('id', id));
  }

  /* Fold `fromId` into `toId`: its cards move onto the target, then the emptied
     version is deleted. The active version follows the cards, so a board whose
     selected version just disappeared lands on the one that absorbed it. */
  function mergeVersion(project: BoardProject, fromId: string, toId: string) {
    if (fromId === toId) return;
    setCards((cs) => cs.map((c) => (c.version_id === fromId ? { ...c, version_id: toId } : c)));
    void persist(supabase.from('cards').update({ version_id: toId }).eq('version_id', fromId));
    setVersions((vs) => vs.filter((z) => z.id !== fromId));
    if (project.active_version_id === fromId) patchProject(project.id, { active_version_id: toId });
    void persist(supabase.from('versions').delete().eq('id', fromId));
  }

  /* Rename a version. Typing a name this project already uses is how you merge
     from the rename field — the alternative is refusing the edit or writing a
     duplicate the unique (project_id, name) would reject anyway. It delegates,
     so "merge" has one implementation whichever way you reach it. */
  function renameVersion(project: BoardProject, id: string, raw: string) {
    const ver = versions.find((z) => z.id === id);
    const newV = raw.trim();
    if (!ver || !newV || newV === ver.name) return;
    const target = projectVersions(project.id).find((z) => z.name === newV && z.id !== id);
    if (target) { mergeVersion(project, id, target.id); return; }
    setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, name: newV } : z)));
    void persist(supabase.from('versions').update({ name: newV }).eq('id', id));
  }

  function setVersionColor(id: string, idx: number) {
    setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, color_index: idx } : z)));
    void persist(supabase.from('versions').update({ color_index: idx }).eq('id', id));
  }

  /* The version's target ship day — the milestone the timeline draws. */
  function setVersionShipDate(id: string, date: string | null) {
    setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, ship_date: date } : z)));
    void persist(supabase.from('versions').update({ ship_date: date }).eq('id', id));
  }

  /* Complete / reopen a version. `completed_at` is stamped on the way in and
     cleared on the way out, so the version bar can list completed versions
     newest-first. Completing also closes whatever is left inside it. */
  function toggleVersionCompleted(project: BoardProject, id: string) {
    const ver = versions.find((z) => z.id === id);
    if (!ver) return;
    const completed = !ver.completed;
    const patch = { completed, completed_at: completed ? new Date().toISOString() : null };
    setVersions((vs) => vs.map((z) => (z.id === id ? { ...z, ...patch } : z)));
    void persist(supabase.from('versions').update(patch).eq('id', id));
    if (completed && project.active_version_id === id) patchProject(project.id, { active_version_id: null });
    if (completed) {
      // One stamp for the batch: they were all closed by the same action.
      const closed = { done: true, done_at: new Date().toISOString(), status: 'done' as Status };
      setCards((cs) => cs.map((c) => (c.version_id === id && !c.done ? { ...c, ...closed } : c)));
      void persist(supabase.from('cards').update(closed).eq('version_id', id).eq('done', false));
    }
  }

  /* Card-editor submissions carry a version *name*; resolve it to an id (creating
     the version if the user typed a new one) before writing the card. `target` is
     the board's own EditTarget, handed straight through. */
  async function submitCard(projectId: string, vals: CardDraft, target: EditTarget) {
    const ver = await ensureVersion(projectId, vals.versionName ?? '');
    const payload: CardDraft = { ...vals, version_id: ver?.id ?? null };
    delete payload.versionName;
    if (target.kind === 'new') await addCard(projectId, payload, target.status);
    else patchCard(target.id, payload);
  }

  /* ---------- Bulk import (see lib/importText.ts) ----------
     Versions first — sequentially, because two bullets under the same new
     [version] would otherwise race and trip the unique (project_id, name).
     Then every card in one insert, so a 60-line paste is one round trip. */
  async function importBlocks(projectId: string, blocks: ImportBlock[]): Promise<number> {
    const rows: Record<string, unknown>[] = [];
    for (const b of blocks) {
      const ver = b.version ? await ensureVersion(projectId, b.version) : null;
      if (b.version && !ver) return 0;            // the failure was already surfaced
      for (const t of b.tasks) {
        rows.push({
          project_id: projectId, title: t.title, comment: '', version_id: ver?.id ?? null,
          target_date: t.date, end_date: t.endDate, status: 'todo',
          done: false, done_at: null, type: t.type, branch: ''
        });
      }
    }
    if (!rows.length) return 0;
    const created = await persistRow(
      supabase.from('cards').insert(rows).select(), { message: 'Could not import — check your connection.' }
    );
    if (!created) return 0;
    setCards((cs) => [...cs, ...(created as Card[])]);
    return (created as Card[]).length;
  }

  return {
    projects, cards, versions, saving, toast, showToast,
    setProjects,   // local-only edits (the project-name input types before it saves)
    patchProject, setRemind, moveProjectBefore, commitProjectOrder,
    supabase, applyRemote, resyncProject, holdCard,
    addCard, patchCard, deleteCard, moveCard, toggleDone, rescheduleCard, submitCard, importBlocks,
    ensureVersion, renameVersion, mergeVersion, deleteVersion, setVersionColor, setVersionShipDate, toggleVersionCompleted
  };
}

export type BoardStore = ReturnType<typeof useBoardStore>;
