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
}

export interface DashboardStats {
  journalCount: number;
  paperCount: number;
  favoriteCount: number;
  checklistTodoCount: number;
  checklistDoneCount: number;
  noteCount: number;
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
}