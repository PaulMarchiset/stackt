'use client';

import { useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { createDemoClient } from '@/lib/demo/db';
import { usePersist } from '@/lib/usePersist';
import type { HeaderItem } from '@/lib/types';

/**
 * The account's header selection, held and written in one place.
 *
 * Two screens edit it — the board, in its own header, and the settings page —
 * and they must not grow two versions of "how do you save this". They share
 * this hook and the composer that drives it, so the selection has exactly one
 * writer and both screens behave identically.
 *
 * Optimistic, like every other write in the app: the list moves first and the
 * row follows; a failure puts the previous list back and says so.
 */
export function useHeaderItems(
  userId: string,
  initial: HeaderItem[],
  showToast: (msg: string, err?: boolean) => void,
  demo = false
) {
  /* In demo mode the writes go to a stub that keeps nothing — see lib/demo/db.ts. */
  const supabase = useMemo(() => (demo ? createDemoClient() : createClient()), [demo]);
  const { persist } = usePersist(showToast);
  const [items, setItems] = useState<HeaderItem[]>(initial);

  function update(next: HeaderItem[]) {
    const before = items;
    setItems(next);
    void persist(
      supabase.from('user_prefs').upsert({
        user_id: userId, header_items: next, updated_at: new Date().toISOString()
      }),
      { message: 'Could not save your header — try again.', onError: () => setItems(before) }
    );
  }

  return { items, setItems, update };
}
