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

export interface Overview {
  stats: DashboardStats;
  newThisWeek: number;
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
}

export interface UpdateNoteRequest {
  content?: string;
  paperId?: string;
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