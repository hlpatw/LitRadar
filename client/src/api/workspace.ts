import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { FavoriteItem, ChecklistItem, NoteItem, UserSettings, DashboardStats, CreateChecklistRequest, UpdateChecklistRequest, CreateNoteRequest, UpdateNoteRequest, UpdateSettingsRequest } from '@shared/api.interface';

const BASE = '/api/workspace';

export async function getDashboard(): Promise<DashboardStats> {
  const res = await axiosForBackend({ url: `${BASE}/dashboard`, method: 'GET' });
  return res.data;
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  const res = await axiosForBackend({ url: `${BASE}/favorites`, method: 'GET' });
  return res.data;
}

export async function addFavorite(paperId: string): Promise<void> {
  await axiosForBackend({ url: `${BASE}/favorites`, method: 'POST', data: { paperId } });
}

export async function removeFavorite(paperId: string): Promise<void> {
  await axiosForBackend({ url: `${BASE}/favorites/${paperId}`, method: 'DELETE' });
}

export async function getChecklist(): Promise<ChecklistItem[]> {
  const res = await axiosForBackend({ url: `${BASE}/checklist`, method: 'GET' });
  return res.data;
}

export async function createChecklistItem(data: CreateChecklistRequest): Promise<ChecklistItem> {
  const res = await axiosForBackend({ url: `${BASE}/checklist`, method: 'POST', data });
  return res.data;
}

export async function updateChecklistItem(id: string, data: UpdateChecklistRequest): Promise<ChecklistItem> {
  const res = await axiosForBackend({ url: `${BASE}/checklist/${id}`, method: 'PATCH', data });
  return res.data;
}

export async function deleteChecklistItem(id: string): Promise<void> {
  await axiosForBackend({ url: `${BASE}/checklist/${id}`, method: 'DELETE' });
}

export async function getNotes(): Promise<NoteItem[]> {
  const res = await axiosForBackend({ url: `${BASE}/notes`, method: 'GET' });
  return res.data;
}

export async function createNote(data: CreateNoteRequest): Promise<NoteItem> {
  const res = await axiosForBackend({ url: `${BASE}/notes`, method: 'POST', data });
  return res.data;
}

export async function updateNote(id: string, data: UpdateNoteRequest): Promise<NoteItem> {
  const res = await axiosForBackend({ url: `${BASE}/notes/${id}`, method: 'PATCH', data });
  return res.data;
}

export async function deleteNote(id: string): Promise<void> {
  await axiosForBackend({ url: `${BASE}/notes/${id}`, method: 'DELETE' });
}

export async function getSettings(): Promise<UserSettings> {
  const res = await axiosForBackend({ url: `${BASE}/settings`, method: 'GET' });
  return res.data;
}

export async function updateSettings(data: UpdateSettingsRequest): Promise<UserSettings> {
  const res = await axiosForBackend({ url: `${BASE}/settings`, method: 'PUT', data });
  return res.data;
}