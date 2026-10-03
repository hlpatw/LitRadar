export interface JournalItem {
  id: string;
  name: string;
  abbreviation: string | null;
  sourceType: 'journal' | 'conference' | 'proceedings' | 'preprint';
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string | null;
  description: string | null;
  url: string | null;
  updateFrequency: string | null;
  createdAt: string;
}

export interface PaperItem {
  id: string;
  journalId: string | null;
  title: string;
  authors: string | null;
  doi: string | null;
  keywords: string | null;
  abstractText: string | null;
  methods: string | null;
  conclusions: string | null;
  publishedDate: string | null;
  url: string | null;
  createdAt: string;
}

export interface PaperDetail extends PaperItem {
  journalName: string | null;
  fetchedAt: string | null;
}

export interface FavoriteItem {
  id: string;
  paperId: string;
  paper: PaperItem;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  paperId: string | null;
  titleOverride: string | null;
  status: 'todo' | 'in_progress' | 'done';
  sortOrder: number;
  paper: PaperItem | null;
  createdAt: string;
  updatedAt: string;
}

export interface NoteItem {
  id: string;
  content: string;
  paperId: string | null;
  paper: PaperItem | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface UserSettings {
  id: string;
  fieldOfStudy: string | null;
  interestedKeywords: string | null;
  recWeights?: Record<string, number> | null;
}

export interface DashboardStats {
  journalCount: number;
  paperCount: number;
  favoriteCount: number;
  checklistTodoCount: number;
  checklistDoneCount: number;
  readingCount: number;
  noteCount: number;
}

export interface OverviewRun {
  id: string;
  sourceName: string | null;
  status: string;
  startedAt: string;
  insertedCount: number;
  updatedCount: number;
}

// A recent note surfaced on the ordinary Dashboard, with its paper link.
// NOTE CONTENT IS TRUNCATED for the research summary; full text lives on /notes.
export interface DashboardNote {
  id: string;
  excerpt: string;
  paperId: string | null;
  paperTitle: string | null;
  paperUrl: string | null;
  updatedAt: string;
}

export interface Overview {
  stats: DashboardStats;
  // Compact research summary (ordinary Dashboard): replaces the global count cards.
  newThisWeek: number;            // papers fetched during the current ISO Shanghai week
  interestKeywordHits: number;    // this-week papers matching the user's interested keywords
  highRelevancePending: number;   // todo backlog papers from P0/P1 ready sources
  todoBacklog: number;            // total readingState='todo' papers
  recentNotes: DashboardNote[];   // latest notes, each with its paper link when present
  // Legacy fields retained for back-compat but NO LONGER rendered on the ordinary Dashboard
  // (raw sync ops / version details live under admin source management).
  failedRuns: number;
  recentPapers: PaperDetail[];
  recentRuns: OverviewRun[];
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export interface CreatePaperRequest {
  journalId?: string;
  title: string;
  authors?: string;
  doi?: string;
  keywords?: string;
  abstractText?: string;
  methods?: string;
  conclusions?: string;
  publishedDate?: string;
  url?: string;
}

export interface UpdatePaperRequest {
  title?: string;
  authors?: string;
  doi?: string;
  keywords?: string;
  abstractText?: string;
  methods?: string;
  conclusions?: string;
  publishedDate?: string;
  url?: string;
}

export interface CreateChecklistRequest {
  paperId?: string;
  titleOverride?: string;
  status?: 'todo' | 'in_progress' | 'done';
}

export interface UpdateChecklistRequest {
  paperId?: string;
  titleOverride?: string;
  status?: 'todo' | 'in_progress' | 'done';
  sortOrder?: number;
}

export interface CreateNoteRequest {
  content: string;
  paperId?: string;
  tags?: string[];
}

export interface UpdateNoteRequest {
  content?: string;
  paperId?: string;
  tags?: string[];
}

export interface CreateFavoriteRequest {
  paperId: string;
}

export interface UpdateSettingsRequest {
  fieldOfStudy?: string;
  interestedKeywords?: string;
  recWeights?: Record<string, number> | null;
}

// ── My Library (authoritative per-user-per-paper) ───────────────────────────

export type ReadingState = 'todo' | 'reading' | 'read';

export interface LibraryItem {
  id: string;
  paperId: string;
  isFavorite: boolean;
  readingState: ReadingState | null;
  personalTags: string | null;
  addedAt: string;
  paper: PaperDetail | null;
  noteCount: number;
}

export interface LibraryListResponse {
  items: LibraryItem[];
  total: number;
}

export interface UpsertLibraryRequest {
  isFavorite?: boolean;
  readingState?: ReadingState | null;
  personalTags?: string | null;
}

// Authoritative per-paper library snapshot returned by the favorite quick-action.
//
// A user has AT MOST one (user,paper) row in `user_library`. Unfavoriting a paper that carried
// no reading state / tags DELETES that row (so the paper re-enters recommendations). The old
// favorite endpoint faked a `LibraryItem` with `id:null` in that case, which left the client
// unable to distinguish "row exists, favorite off" from "no row at all". This shape makes the
// two cases explicit:
//   * rowExists=true  -> a library association exists; libraryId is the real row id.
//   * rowExists=false -> NO association; libraryId is null. isFavorite/readingState are the
//     authoritative empty values (false / null). There is deliberately no fake id.
//
// `changed` / `favoriteTransition` let the client fire behavior events ONLY on a real state
// transition and know its direction (favorite vs unfavorite), so a re-favorite in the same
// week is never swallowed by the dedupe key.
export interface LibraryState {
  paperId: string;
  rowExists: boolean;
  libraryId: string | null;
  isFavorite: boolean;
  readingState: ReadingState | null;
  personalTags: string | null;
  addedAt: string | null;
  noteCount: number;
  // Did this mutation change persisted state at all (favorite toggled on/off)?
  changed: boolean;
  // The favorite transition this call actually performed (drives direction-aware events).
  favoriteTransition: 'none' | 'favorited' | 'unfavorited';
}

export interface SetFeedbackRequest {
  feedbackType?: 'uninterested';
  note?: string;
}

// ── Explainable recommendations (in-database, no LLM) ──────────────────────────

export interface RecWeights {
  interest: number;
  lexical: number;
  source: number;
  freshness: number;
  abstract: number;
}

export const DEFAULT_REC_WEIGHTS: RecWeights = {
  interest: 0.3,
  lexical: 0.25,
  source: 0.15,
  freshness: 0.15,
  abstract: 0.15,
};

export interface RecommendationItem {
  paper: PaperDetail;
  score: number;
  breakdown: {
    interest: number;
    lexical: number;
    source: number;
    freshness: number;
    abstract: number;
  };
  matchedKeywords: string[];
  reasons: string[];
}

export interface RecommendationResponse {
  items: RecommendationItem[];
  coldStart: boolean;
  weights: RecWeights;
  excluded: { library: number; uninterested: number };
}

// ── Source detail (user-facing /sources/:sourceId) ───────────────────────────

export interface SourceDetail {
  id: string;
  parentId: string | null;
  name: string;
  abbreviation: string | null;
  sourceType: string;
  priority: string;
  category: string | null;
  description: string | null;
  url: string | null;
  issn: string | null;
  externalId: string | null;
  status: 'active' | 'archived' | string;
  connectorType: string | null;
  connectorStatus: 'ready' | 'skeleton' | 'disabled' | string;
  pollPolicy: string | null;
  updateFrequency: string | null;
  lastSyncedAt: string | null;
  // Latest TERMINAL sync run (ok/error) — the header default. A currently-running run is
  // surfaced separately so it never overwrites the last-good bookkeeping.
  lastRunStatus: string | null;
  lastRunInserted: number | null;
  lastRunUpdated: number | null;
  lastRunStartedAt: string | null;
  runningRun: { id: string; startedAt: string } | null;
  // Counts.
  paperCount: number;
  childCount: number;
  aliasCount: number;
  aliases: string[];
}

// A paper row on a source detail page, enriched with the current user's library state so the
// row can render favorite / reading-state actions without a second round-trip.
export interface SourcePaperItem extends PaperItem {
  journalName: string | null;
  inLibrary: boolean;
  isFavorite: boolean;
  readingState: ReadingState | null;
}

export interface SourcePaperListResponse extends PaginatedResponse<SourcePaperItem> {
  source: SourceDetail;
}

// ── Weekly research radar (deterministic weekly snapshot) ─────────────────────

export interface RadarPaper {
  id: string;
  title: string;
  journalName: string | null;
  publishedDate: string | null;
  url: string | null;
  hasAbstract: boolean;
}

export interface RadarTopItem {
  rank: number;
  paper: RadarPaper;
  score: number;
  matchedKeywords: string[];
  reasons: string[];
}

export interface WeeklyRadarSnapshot {
  weekStart: string;            // ISO Monday date (yyyy-mm-dd)
  isCurrent: boolean;
  newPaperCount: number;
  items: RadarTopItem[];
  sourceDistribution: { source: string; count: number }[];
  keywordHits: { keyword: string; count: number }[];
  generatedAt: string;
}

export interface RadarHistoryResponse {
  current: WeeklyRadarSnapshot | null;
  previous: WeeklyRadarSnapshot | null;
}

// ── Weekly digest ─────────────────────────────────────────────────────────────

export interface WeeklyDigest {
  weekStart: string;
  // Deterministic selection: 'current' = this ISO Shanghai week, 'previous' = minus 7 days.
  weekRef: 'current' | 'previous';
  newPaperCount: number;
  top10: RadarTopItem[];
  sourceDistribution: { source: string; count: number }[];
  keywordHits: { keyword: string; count: number }[];
  userActionCounts: Record<BehaviorEventType, number>;
  // The frozen snapshot's digest timestamp, or null when no snapshot exists for the requested
  // week (empty report). A normal-user read NEVER mints a snapshot, so null is expected until the
  // scheduler / admin backfill freezes one.
  generatedAt: string | null;
}

// ── Behavior events (idempotent, user-scoped; no note text) ───────────────────

export type BehaviorEventType =
  | 'impression'
  | 'detail'
  | 'library'
  | 'todo'
  | 'favorite'
  | 'unfavorite'
  | 'uninterested'
  | 'note';

export interface TrackEventRequest {
  eventType: BehaviorEventType;
  paperId?: string | null;
  /** Client-supplied dedupe key. When omitted the server derives a deterministic one. */
  idempotencyKey?: string;
}

export interface EventAdminSummary {
  total: number;
  byType: Record<BehaviorEventType, number>;
  last24h: number;
}

// ── Scheduler (staging-only) ──────────────────────────────────────────────────

export interface SchedulerStatus {
  enabled: boolean;             // false in production / when not staging
  paused: boolean;
  lastRunAt: string | null;
  nextRunAt: string | null;
  runCount: number;
  readySourceCount: number;
  lastMessage: string | null;
}

export interface SetSchedulerPausedRequest {
  paused: boolean;
}

// ── Internal metrics (admin-only, behavior-event aggregates) ──────────────────
// Every conversion exposes its explicit numerator/denominator. `rate` is `null`
// when the denominator is 0 (zero handling: never a divide-by-zero, never "0%"
// pretending there was traffic). No note body / free text is ever returned — only
// event counts and reading-state aggregates.

export interface RatioPoint {
  numerator: number;
  denominator: number;
  rate: number | null; // 0..1 rounded to 4dp; null when denominator === 0
}

export interface Top10CtrItem {
  paperId: string;
  title: string;
  impressions: number;
  details: number;
  ctr: number | null; // detail / impression; null when impressions === 0
}

export interface InternalMetrics {
  // CTR for the current frozen Top10: detail opens / impressions.
  top10Ctr: {
    overall: RatioPoint;
    items: Top10CtrItem[];
  };
  // Rolling-7d conversion funnel.
  conversions: {
    library: RatioPoint;        // library events / impression events
    todo: RatioPoint;           // todo events / library events
    uninterested: RatioPoint;    // uninterested events / impression events
  };
  // Note creations (behavior events) in the last 7 days.
  noteCount: number;
  // Reading conversion over 7d: papers marked read / distinct impressions.
  readingConversion7d: RatioPoint;
}