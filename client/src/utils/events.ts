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

/** Action events with their own stable keys (favorite/todo/uninterested). */
export function trackAction(eventType: 'favorite' | 'todo' | 'uninterested', paperId: string) {
  if (!paperId) return;
  const key = `${weekStartKey()}:${eventType}:${paperId}`;
  void post({ eventType, paperId, idempotencyKey: key });
}
