'use client';

import { createContext, useContext } from 'react';

/**
 * The *effective* developer-mode value for the board currently on screen. The
 * device-wide default lives in localStorage (see useDevMode); a project may
 * override it (Project.dev_mode). BoardApp resolves the two and provides the
 * result here so every board component (cards, editor, timeline, chips) reads
 * one consistent value without prop-drilling.
 */
export const BoardDevModeContext = createContext<boolean>(true);

export function useBoardDevMode(): boolean {
  return useContext(BoardDevModeContext);
}
