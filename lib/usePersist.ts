'use client';

import { useCallback, useState } from 'react';

export type SaveState = 'saved' | 'saving' | 'error';

const FAILED = 'Could not save — check your connection.';

export type PersistOptions = {
  /* Replaces the generic failure message when this write deserves its own. */
  message?: string;
  /* Undo the optimistic local change. Runs only on failure, before the toast. */
  onError?: () => void;
};

/**
 * Optimistic writes, in one place.
 *
 * Every screen was repeating the same three lines: flip a saving flag, await
 * the write, and turn a failure into a toast (plus, sometimes, a revert). This
 * owns that shape so a caller states only what it is writing.
 *
 * Nothing rolls back on its own: local state moved first and stays ahead of the
 * database until the next reload (see the note in README). A caller that *can*
 * revert passes `onError` and gets one.
 *
 * `saving` is a single flag rather than a count of writes in flight, so when
 * several writes overlap the last one to answer wins — a failure can be painted
 * over by a later success. Fixing that is now a change to this file alone.
 */
export function usePersist(showToast: (msg: string, err?: boolean) => void) {
  const [saving, setSaving] = useState<SaveState>('saved');

  const fail = useCallback((error: unknown, opts?: PersistOptions) => {
    console.error('write failed:', error);
    setSaving('error');
    opts?.onError?.();
    showToast(opts?.message ?? FAILED, true);
  }, [showToast]);

  /* Fire-and-forget write. Resolves to whether it landed. */
  const persist = useCallback(async (
    write: PromiseLike<{ error: unknown }>, opts?: PersistOptions
  ): Promise<boolean> => {
    setSaving('saving');
    const { error } = await write;
    if (error) { fail(error, opts); return false; }
    setSaving('saved');
    return true;
  }, [fail]);

  /* A write that hands its row back (insert…select().single()). Getting no row
     is a failure whatever the driver reported, so the caller checks once. */
  const persistRow = useCallback(async <T,>(
    write: PromiseLike<{ data: T | null; error: unknown }>, opts?: PersistOptions
  ): Promise<T | null> => {
    setSaving('saving');
    const { data, error } = await write;
    if (error || !data) { fail(error ?? new Error('no row returned'), opts); return null; }
    setSaving('saved');
    return data;
  }, [fail]);

  return { saving, persist, persistRow };
}
