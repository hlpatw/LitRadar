import api from '../utils/axios';
import type { FavoriteItem, ChecklistItem, NoteItem, UserSettings, DashboardStats, CreateChecklistRequest, UpdateChecklistRequest, CreateNoteRequest, UpdateNoteRequest, UpdateSettingsRequest } from '@shared/api.interface';

const BASE = '/api/workspace';

export async function getDashboard(): Promise<DashboardStats> {
  const res = await api.get(`${BASE}/dashboard`);
  return res.data;
}

export async function getFavorites(): Promise<FavoriteItem[]> {
  const res = await api.get(`${BASE}/favorites`);
  return res.data;
}

export async function addFavorite(paperId: string): Promise<void> {
  await api.post(`${BASE}/favorites`, { paperId });
}

export async function removeFavorite(paperId: string): Promise<void> {
  await api.delete(`${BASE}/favorites/${paperId}`);
}

export async function getChecklist(): Promise<ChecklistItem[]> {
  const res = await api.get(`${BASE}/checklist`);
  return res.data;
}

export async function createChecklistItem(data: CreateChecklistRequest): Promise<ChecklistItem> {
  const res = await api.post(`${BASE}/checklist`, data);
  return res.data;
}

export async function updateChecklistItem(id: string, data: UpdateChecklistRequest): Promise<ChecklistItem> {
  const res = await api.patch(`${BASE}/checklist/${id}`, data);
  return res.data;
}

export async function deleteChecklistItem(id: string): Promise<void> {
  await api.delete(`${BASE}/checklist/${id}`);
}

export async function getNotes(): Promise<NoteItem[]> {
  const res = await api.get(`${BASE}/notes`);
  return res.data;
}

export async function createNote(data: CreateNoteRequest): Promise<NoteItem> {
  const res = await api.post(`${BASE}/notes`, data);
  return res.data;
}

export async function updateNote(id: string, data: UpdateNoteRequest): Promise<NoteItem> {
  const res = await api.patch(`${BASE}/notes/${id}`, data);
  return res.data;
}

export async function deleteNote(id: string): Promise<void> {
  await api.delete(`${BASE}/notes/${id}`);
}

export async function getSettings(): Promise<UserSettings> {
  const res = await api.get(`${BASE}/settings`);
  return res.data;
}

export async function updateSettings(data: UpdateSettingsRequest): Promise<UserSettings> {
  const res = await api.put(`${BASE}/settings`, data);
  return res.data;
}