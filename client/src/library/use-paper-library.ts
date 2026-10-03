import { useSyncExternalStore } from 'react';
import {
  getPaperLibraryState,
  subscribeLibrary,
  isLibraryPending,
  type PaperLibraryState,
  type LibraryAction,
} from './library-store';

/** Reactive view of one paper's authoritative library state. Updates on every store emit
 *  (optimistic flip, rollback, cross-page action) without a refetch. */
export function usePaperLibraryState(paperId: string): PaperLibraryState {
  return useSyncExternalStore(subscribeLibrary, () => getPaperLibraryState(paperId));
}

/** Reactive pending flag for one paper + one action (drives aria-busy / disabled / spinners). */
export function useLibraryPending(paperId: string, action: LibraryAction): boolean {
  return useSyncExternalStore(subscribeLibrary, () => isLibraryPending(paperId, action));
}
