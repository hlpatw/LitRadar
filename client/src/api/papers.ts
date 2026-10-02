import api from '../utils/axios';
import type { PaperItem, PaperDetail, CreatePaperRequest, UpdatePaperRequest, PaginatedResponse } from '@shared/api.interface';

export async function getPapers(params?: { journalId?: string; search?: string; from?: string; to?: string; priority?: string; hasAbstract?: string; favorite?: string; todo?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<PaperItem>> {
  const sp = new URLSearchParams();
  if (params?.journalId) sp.set('journalId', params.journalId);
  if (params?.search) sp.set('search', params.search);
  if (params?.from) sp.set('from', params.from);
  if (params?.to) sp.set('to', params.to);
  if (params?.priority) sp.set('priority', params.priority);
  if (params?.hasAbstract) sp.set('hasAbstract', params.hasAbstract);
  if (params?.favorite) sp.set('favorite', params.favorite);
  if (params?.todo) sp.set('todo', params.todo);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  const res = await api.get(`/papers${qs ? `?${qs}` : ''}`);
  return res.data;
}

export async function getPaperDetail(id: string): Promise<PaperDetail> {
  const res = await api.get(`/papers/${id}`);
  return res.data;
}

export async function createPaper(data: CreatePaperRequest): Promise<PaperItem> {
  const res = await api.post('/papers', data);
  return res.data;
}

export async function updatePaper(id: string, data: UpdatePaperRequest): Promise<PaperItem> {
  const res = await api.patch(`/papers/${id}`, data);
  return res.data;
}

export async function deletePaper(id: string): Promise<void> {
  await api.delete(`/papers/${id}`);
}