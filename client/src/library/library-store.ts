// Shared, per-paper library interaction store.
//
// WHY: favorite / add-to-list / uninterested state used to live in five places (Radar quick
// actions, Papers list, PaperDetail, SourceDetail rows, Library recommendations + rows) and
// each made its own fire-and-forget or half-optimistic async call. `user_library` is the single
// server authority; this module is the single CLIENT authority that all favorite-capable
// surfaces read and write through.
//
// Guarantees (per paper + per action):
//   * current authoritative state (hydrated from list/detail payloads, corrected by every
//     mutation's authoritative response),
//   * optimistic visual update with automatic rollback on failure,
//   * a per-action pending guard that makes a quick double-click a no-op (race-safe),
//   * success / error toasts,
//   * behavior events fired ONLY after a real server transition, direction-aware,
//   * a tiny pub/sub so every mounted button/card across the SPA re-renders, and so the
//     favorite-filter Library page can drop a card the instant it is unfavorited.
import { toast } from 'sonner';
import * as api from '@/api';
import { getApiErrorMessage } from '@/utils/api-error';
import { trackFavoriteTransition, trackLibrary, trackAction } from '@/utils/events';
import type { LibraryState, ReadingState } from '@shared/api.interface';

export interface PaperLibraryState {
  paperId: string;
  inLibrary: boolean;
  isFavorite: boolean;
  readingState: ReadingState | null;
  personalTags: string | null;
  noteCount: number;
}

export type LibraryAction = 'favorite' | 'todo' | 'readingState' | 'uninterested' | 'add';

// ── module-level singleton state ─────────────────────────────────────────────
const state = new Map<string, PaperLibraryState>();
const pending = new Set<string>(); // `${paperId}:${action}`
const listeners = new Set<() => void>();

function emit(): void {
  for (const l of listeners) l();
}

/** Referentially stable snapshot for a paper (defaults materialized once so React snapshots
 *  never churn on an object literal). */
export function getPaperLibraryState(paperId: string): PaperLibraryState {
  let s = state.get(paperId);
  if (!s) {
    s = { paperId, inLibrary: false, isFavorite: false, readingState: null, personalTags: null, noteCount: 0 };
    state.set(paperId, s);
  }
  return s;
}

/** Non-mutating read: returns the cached snapshot for a paper, or undefined if it was never
 *  hydrated. Used to FILTER a list (e.g. favorite-only view) without accidentally materializing
 *  a "favorite=false" default that would hide a server-favorited row before hydration. */
export function peekPaperLibraryState(paperId: string): PaperLibraryState | undefined {
  return state.get(paperId);
}

export function subscribeLibrary(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

/** Wipe ALL cached entries and pending actions. Called whenever the authenticated identity
 *  changes (login / register / logout / bootstrap identity swap) so user B never briefly
 *  sees user A's favorite/reading visuals before B's data re-hydrates. */
export function resetLibraryStore(): void {
  state.clear();
  pending.clear();
  emit();
}

export function isLibraryPending(paperId: string, action: LibraryAction): boolean {
  return pending.has(`${paperId}:${action}`);
}

/** Merge authoritative/hydrated fields for a paper and notify subscribers. */
export function hydratePaperLibrary(paperId: string, patch: Partial<Omit<PaperLibraryState, 'paperId'>>): void {
  const prev = getPaperLibraryState(paperId);
  state.set(paperId, { ...prev, ...patch });
  emit();
}

function applyServerState(paperId: string, s: LibraryState): void {
  hydratePaperLibrary(paperId, {
    inLibrary: s.rowExists,
    isFavorite: s.isFavorite,
    readingState: s.readingState,
    personalTags: s.personalTags,
    noteCount: s.noteCount,
  });
}

function begin(paperId: string, action: LibraryAction): boolean {
  const key = `${paperId}:${action}`;
  if (pending.has(key)) return false; // double-click / race guard
  pending.add(key);
  emit();
  return true;
}
function end(paperId: string, action: LibraryAction): void {
  pending.delete(`${paperId}:${action}`);
  emit();
}

// ── Actions ────────────────────────────────────────────────────────────────────

export type FavoriteTransition = 'favorited' | 'unfavorited' | 'none' | 'failed';

/** Toggle favorite through the authoritative endpoint. Optimistic + rollback + pending guard. */
export async function toggleFavorite(paperId: string): Promise<FavoriteTransition> {
  const current = getPaperLibraryState(paperId);
  const target = !current.isFavorite;
  if (!begin(paperId, 'favorite')) return 'none';
  const prev = { ...current };
  // optimistic flip
  hydratePaperLibrary(paperId, { isFavorite: target, inLibrary: target ? true : current.inLibrary });
  try {
    const res = await api.library.setFavorite(paperId, target);
    applyServerState(paperId, res); // authoritative overwrite (may differ from optimistic)
    // events ONLY on a real server transition. The server mints a fresh transitionToken exactly
    // when changed=true; a no-op double-click returns no token and we emit nothing.
    if (res.favoriteTransition === 'favorited' && res.transitionToken) {
      trackFavoriteTransition('favorite', paperId, res.transitionToken);
      trackLibrary(paperId);
      toast.success('已收藏');
    } else if (res.favoriteTransition === 'unfavorited' && res.transitionToken) {
      trackFavoriteTransition('unfavorite', paperId, res.transitionToken);
      toast.success('已取消收藏');
    } else {
      toast.success(target ? '已收藏' : '已取消收藏');
    }
    return res.favoriteTransition;
  } catch (e) {
    hydratePaperLibrary(paperId, prev); // rollback to the pre-optimistic snapshot
    toast.error(getApiErrorMessage(e, target ? '收藏失败' : '取消收藏失败'));
    return 'failed';
  } finally {
    end(paperId, 'favorite');
  }
}

const STATE_LABEL: Record<string, string> = { todo: '待读', reading: '阅读中', read: '已读' };

/** Quick add-to-list (todo), non-downgrade on the server. */
export async function addTodo(paperId: string): Promise<void> {
  if (!begin(paperId, 'todo')) return;
  try {
    const res = await api.library.upsertLibrary(paperId, { readingState: 'todo' });
    hydratePaperLibrary(paperId, {
      inLibrary: true,
      isFavorite: res.isFavorite,
      readingState: res.readingState,
      personalTags: res.personalTags,
      noteCount: res.noteCount,
    });
    trackAction('todo', paperId);
    trackLibrary(paperId);
    toast.success(
      res.readingState && res.readingState !== 'todo'
        ? `已在书架中（${STATE_LABEL[res.readingState] ?? res.readingState}），保持当前状态`
        : '已加入待读',
    );
  } catch (e) {
    toast.error(getApiErrorMessage(e, '操作失败'));
  } finally {
    end(paperId, 'todo');
  }
}

/** Explicit reading-state selector (may regress per server contract). */
export async function setReadingState(paperId: string, state: ReadingState | null): Promise<void> {
  if (!begin(paperId, 'readingState')) return;
  try {
    const res = await api.library.setReadingState(paperId, state);
    hydratePaperLibrary(paperId, {
      inLibrary: true,
      isFavorite: res.isFavorite,
      readingState: res.readingState,
      personalTags: res.personalTags,
      noteCount: res.noteCount,
    });
    toast.success(state ? '已更新阅读状态' : '已清除阅读状态');
  } catch (e) {
    toast.error(getApiErrorMessage(e, '更新失败'));
  } finally {
    end(paperId, 'readingState');
  }
}

/** Mark a paper uninterested (separate feedback table; removes it from recommendations). */
export async function markUninterested(paperId: string): Promise<void> {
  if (!begin(paperId, 'uninterested')) return;
  try {
    await api.library.markUninterested(paperId);
    trackAction('uninterested', paperId);
    toast.success('已标记不感兴趣');
  } catch (e) {
    toast.error(getApiErrorMessage(e, '操作失败'));
  } finally {
    end(paperId, 'uninterested');
  }
}

/** Recommendation-card "加入" shortcut: favorite + todo in one upsert. */
export async function addToLibrary(paperId: string): Promise<void> {
  if (!begin(paperId, 'add')) return;
  try {
    const res = await api.library.upsertLibrary(paperId, { isFavorite: true, readingState: 'todo' });
    hydratePaperLibrary(paperId, {
      inLibrary: true,
      isFavorite: res.isFavorite,
      readingState: res.readingState,
      personalTags: res.personalTags,
      noteCount: res.noteCount,
    });
    trackAction('todo', paperId);
    trackLibrary(paperId);
    toast.success('已加入书架并设为待读');
  } catch (e) {
    toast.error(getApiErrorMessage(e, '加入失败'));
  } finally {
    end(paperId, 'add');
  }
}
