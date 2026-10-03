import api from '../utils/axios';
import type {
  LibraryItem,
  LibraryListResponse,
  UpsertLibraryRequest,
  RecommendationResponse,
  LibraryState,
} from '@shared/api.interface';

const BASE = '/library';

export interface LibraryQuery {
  status?: string;
  priority?: string;
  tag?: string;
  q?: string;
  hasNotes?: boolean;
}

export async function getLibrary(query: LibraryQuery = {}): Promise<LibraryListResponse> {
  const params: Record<string, string> = {};
  if (query.status) params.status = query.status;
  if (query.priority) params.priority = query.priority;
  if (query.tag) params.tag = query.tag;
  if (query.q) params.q = query.q;
  if (query.hasNotes) params.hasNotes = '1';
  const res = await api.get(BASE, { params });
  return res.data;
}

export async function upsertLibrary(paperId: string, data: UpsertLibraryRequest): Promise<LibraryItem> {
  const res = await api.put(`${BASE}/${paperId}`, data);
  return res.data;
}

export async function removeLibrary(paperId: string): Promise<void> {
  await api.delete(`${BASE}/${paperId}`);
}

/**
 * Authoritative favorite quick-action. Sets the favorite target state and returns the
 * post-state snapshot, which explicitly represents "no library row" (rowExists=false,
 * libraryId=null) — never a fake LibraryItem with id:null — and reports the actual
 * favorite transition so callers fire direction-aware events only on a real change.
 */
export async function setFavorite(paperId: string, isFavorite: boolean): Promise<LibraryState> {
  const res = await api.post(`${BASE}/${paperId}/favorite`, { isFavorite });
  return res.data;
}

export async function setReadingState(paperId: string, state: 'todo' | 'reading' | 'read' | null): Promise<LibraryItem> {
  const res = await api.post(`${BASE}/${paperId}/reading-state`, { state });
  return res.data;
}

export async function markUninterested(paperId: string): Promise<void> {
  await api.post(`${BASE}/${paperId}/feedback`, { feedbackType: 'uninterested' });
}

export async function getRecommendations(limit = 20): Promise<RecommendationResponse> {
  const res = await api.get(`${BASE}/recommendations`, { params: { limit } });
  return res.data;
}
