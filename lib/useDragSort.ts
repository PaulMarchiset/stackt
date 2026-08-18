'use client';

import { useState } from 'react';

/**
 * The drag state of the projects page, and nothing else.
 *
 * Two things can be dragged and they mean different things: a project moves
 * *into* a band and to a spot inside it, a group moves the band itself. They
 * share one piece of state because only one drag can be in flight, and because
 * the page needs a single "is something being dragged" answer to decide what to
 * highlight.
 *
 * Plain HTML5 drag and drop, like the board's tabs and cards — no library, and
 * no touch story: on touch there is no grab handle at all, and the ⋯ menus do
 * the same work in one tap (see ProjectCard).
 *
 * The hook holds *where things are*, never what that means. Turning a drop into
 * a new order is `applyProjectDrop` in lib/grouping.ts, so the rule stays
 * readable and testable away from the event plumbing.
 */
export type Drag =
  | { kind: 'project'; id: string; over: { section: string; index: number } | null }
  | { kind: 'group'; id: string; overKey: string | null }
  | null;

export function useDragSort() {
  const [drag, setDrag] = useState<Drag>(null);

  const startProject = (id: string) => setDrag({ kind: 'project', id, over: null });
  const startGroup = (id: string) => setDrag({ kind: 'group', id, overKey: null });
  const end = () => setDrag(null);

  /* dragover fires continuously; re-rendering on every event for a target that
     hasn't changed is wasted work, so each setter compares first. */
  const overProject = (section: string, index: number) =>
    setDrag((d) => (d?.kind !== 'project' || (d.over?.section === section && d.over.index === index)
      ? d : { ...d, over: { section, index } }));

  const overGroup = (key: string) =>
    setDrag((d) => (d?.kind !== 'group' || d.overKey === key ? d : { ...d, overKey: key }));

  /* What the page asks while rendering. */
  const draggingProject = drag?.kind === 'project' ? drag.id : null;
  const draggingGroup = drag?.kind === 'group' ? drag.id : null;
  const dropSection = drag?.kind === 'project' ? drag.over?.section ?? null : null;
  const dropIndex = drag?.kind === 'project' ? drag.over?.index ?? null : null;
  const groupDropKey = drag?.kind === 'group' ? drag.overKey : null;

  return {
    drag, startProject, startGroup, overProject, overGroup, end,
    draggingProject, draggingGroup, dropSection, dropIndex, groupDropKey
  };
}

/**
 * Which side of an element the pointer is on. A card is inserted before or
 * after the one you are hovering, and half its width is the fairest boundary —
 * it makes the two halves of every card mean the two gaps around it.
 */
export function isAfterMidpoint(e: { clientX: number }, el: HTMLElement): boolean {
  const box = el.getBoundingClientRect();
  return e.clientX > box.left + box.width / 2;
}
