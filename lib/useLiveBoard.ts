'use client';

import { useEffect, useRef } from 'react';
import type { createClient } from '@/lib/supabase/client';

/**
 * Keeps one board's rows arriving as they change, for as long as it is open.
 *
 * This hook owns the *connection* and nothing else: opening a channel, tearing
 * it down when you switch projects, and noticing when it has been away. What to
 * do with an event is the store's business (useBoardStore.applyRemote) — the
 * two are split because they fail in unrelated ways. A merge bug shows up as a
 * wrong card; a lifecycle bug shows up as silence, which is far harder to
 * notice and is what this file exists to prevent.
 *
 * The socket goes from the browser straight to Supabase. Nothing here touches
 * the Next server, so it costs no serverless invocation at all.
 */

export type LiveTable = 'cards' | 'versions' | 'card_assignees' | 'card_comments' | 'card_mentions';

export type LiveEvent = {
  table: LiveTable;
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  /* The new row, or — for a DELETE — the old one. Both carry every column
     because migration 0015 sets REPLICA IDENTITY FULL. */
  row: Record<string, unknown>;
};

export function useLiveBoard({
  supabase, projectId, enabled, onEvent, onResync
}: {
  supabase: ReturnType<typeof createClient>;
  /** The board being looked at. Switching projects swaps the channel. */
  projectId: string | null;
  /** Off for the demo, and whenever there is no project to watch. */
  enabled: boolean;
  onEvent: (e: LiveEvent) => void;
  /** Fetch everything again — called after any gap where events were missed. */
  onResync: () => void;
}) {
  /* Held in refs so a new closure each render doesn't tear the channel down and
     rebuild it: the effect must depend on the project, not on the identity of
     two callbacks that change on every keystroke. */
  const onEventRef = useRef(onEvent);
  const onResyncRef = useRef(onResync);
  onEventRef.current = onEvent;
  onResyncRef.current = onResync;

  useEffect(() => {
    if (!enabled || !projectId) return;

    /* Distinguishes the first SUBSCRIBED from every later one. A resubscribe
       means the socket dropped and came back, and everything that changed in
       between was never delivered — so the only honest recovery is to refetch.
       Without this the board looks connected and quietly drifts, which is worse
       than showing stale data and saying so. */
    let hasSubscribed = false;

    /* Filter is a convenience, not a boundary: it spares the browser messages
       it would discard anyway. RLS is what decides (see migration 0015). */
    const watch = (table: LiveTable) => ({
      event: '*' as const,
      schema: 'public',
      table,
      filter: `project_id=eq.${projectId}`
    });

    const emit = (table: LiveTable) => (payload: { eventType: string; new: unknown; old: unknown }) => {
      onEventRef.current({
        table,
        type: payload.eventType as LiveEvent['type'],
        row: (payload.eventType === 'DELETE' ? payload.old : payload.new) as Record<string, unknown>
      });
    };

    // card_mentions has no project_id — subscribe unfiltered; RLS decides.
    const mentionFilter = { event: '*' as const, schema: 'public', table: 'card_mentions' as const };

    const channel = supabase
      .channel(`board:${projectId}`)
      .on('postgres_changes', watch('cards'), emit('cards'))
      .on('postgres_changes', watch('versions'), emit('versions'))
      .on('postgres_changes', watch('card_assignees'), emit('card_assignees'))
      .on('postgres_changes', watch('card_comments'), emit('card_comments'))
      .on('postgres_changes', mentionFilter, emit('card_mentions'))
      .subscribe((status) => {
        if (status !== 'SUBSCRIBED') return;
        if (hasSubscribed) onResyncRef.current();
        hasSubscribed = true;
      });

    /* A backgrounded tab can have its socket closed by the browser without the
       client noticing promptly. Coming back to the tab is the moment the user
       is about to trust what is on screen, so that is the moment to re-check —
       cheap, and it covers the laptop-lid case the reconnect path can miss. */
    const onVisible = () => {
      if (document.visibilityState === 'visible') onResyncRef.current();
    };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      void supabase.removeChannel(channel);
    };
  }, [supabase, projectId, enabled]);
}
