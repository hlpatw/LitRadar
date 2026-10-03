// Unified, fire-and-forget behavior-event tracker. One place builds explicit, stable
// idempotency keys so the server's UNIQUE(user,type,key) index dedupes correctly.
//
// Key contract (must match the server's dedupe expectations):
//   impression: `<week>:impression:<surface>:<paperId>` — one per paper/user/week/surface;
//               an in-session Set prevents re-firing on re-render/route re-entry.
//   detail:     `<week>:detail:<paperId>` — one per user/paper/week (repeat opens deduped).
//   library:    `<week>:library:<paperId>` — one per user/paper/week (a pure re-update does
//               not double-count; favorite/todo/uninterested fire as their own events too).
//   note:       `<week>:note:<paperId|none>` — fired only on SUCCESSFUL note create.
//               NOTE TEXT / TAGS ARE NEVER SENT.
//
// Every call swallows errors: a tracking failure must never break UX or surface toasts.
import * as api from '@/api';

const SHANGHAI_OFFSET_MIN = 8 * 60;

/** Asia/Shanghai ISO-Monday wall date (yyyy-mm-dd) — same anchor as the server. */
function weekStartKey(): string {
  const now = new Date();
  const sh = new Date(now.getTime() + SHANGHAI_OFFSET_MIN * 60 * 1000);
  const dow = (sh.getUTCDay() + 6) % 7; // Mon=0
  const monday = new Date(Date.UTC(sh.getUTCFullYear(), sh.getUTCMonth(), sh.getUTCDate() - dow));
  return monday.toISOString().slice(0, 10);
}

// In-session guard: don't POST an impression twice for the same logical view.
const fired = new Set<string>();

// Per-paper favorite/unfavorite transition counter. The server dedupes by
// (user, eventType, idempotencyKey); a plain `<week>:favorite:<paper>` key would collapse a
// favorite -> unfavorite -> favorite cycle into ONE counted favorite. We append a monotonic
// transition ordinal so each TRUE transition gets a fresh key, while the store's per-action
// pending guard still prevents a double-click from firing twice for the same transition.
const favSeq = new Map<string, number>();

async function post(payload: { eventType: any; paperId?: string | null; idempotencyKey: string }) {
  try {
    await api.radar.trackEvent(payload);
  } catch {
    // tracking must never surface errors or break the UI
  }
}

/** One impression per paper/user/week/surface, only once per browser session. */
export function trackImpression(paperId: string, surface: 'radar' | 'digest') {
  if (!paperId) return;
  const key = `${weekStartKey()}:impression:${surface}:${paperId}`;
  if (fired.has(key)) return;
  fired.add(key);
  void post({ eventType: 'impression', paperId, idempotencyKey: key });
}

/** Detail open — deduped per user/paper/week by the server's unique index. */
export function trackDetail(paperId: string) {
  if (!paperId) return;
  const key = `${weekStartKey()}:detail:${paperId}`;
  void post({ eventType: 'detail', paperId, idempotencyKey: key });
}

/** A new user_library association was created successfully. Stable per paper/week. */
export function trackLibrary(paperId: string) {
  if (!paperId) return;
  const key = `${weekStartKey()}:library:${paperId}`;
  void post({ eventType: 'library', paperId, idempotencyKey: key });
}

/** Note created successfully. Never sends content/tags — only paperId (nullable). */
export function trackNote(paperId: string | null | undefined) {
  const key = `${weekStartKey()}:note:${paperId ?? 'none'}`;
  void post({ eventType: 'note', paperId: paperId ?? null, idempotencyKey: key });
}

/** A favorite/unfavorite transition just succeeded on the server. Direction-aware key with a
 *  per-paper transition ordinal so re-favorites in the same week are NOT swallowed, and a
 *  double-click (guarded by the store) never double-fires the same transition. */
export function trackFavoriteTransition(direction: 'favorite' | 'unfavorite', paperId: string) {
  if (!paperId) return;
  const n = (favSeq.get(paperId) ?? 0) + 1;
  favSeq.set(paperId, n);
  const key = `${weekStartKey()}:${direction}:${paperId}:${n}`;
  void post({ eventType: direction, paperId, idempotencyKey: key });
}

/** Action events with their own stable keys (todo/uninterested). Favorite transitions go
 *  through {@link trackFavoriteTransition} so direction + ordinal are handled. */
export function trackAction(eventType: 'todo' | 'uninterested', paperId: string) {
  if (!paperId) return;
  const key = `${weekStartKey()}:${eventType}:${paperId}`;
  void post({ eventType, paperId, idempotencyKey: key });
}
