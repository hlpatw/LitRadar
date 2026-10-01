import api from '../utils/axios';
import type { PaperItem, PaperDetail, CreatePaperRequest, UpdatePaperRequest, PaginatedResponse } from '@shared/api.interface';

export async function getPapers(params?: { journalId?: string; search?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<PaperItem>> {
  const sp = new URLSearchParams();
  if (params?.journalId) sp.set('journalId', params.journalId);
  if (params?.search) sp.set('search', params.search);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  const res = await api.get(`/api/papers${qs ? `?${qs}` : ''}`);
  return res.data;
}

export async function getPaperDetail(id: string): Promise<PaperDetail> {
  const res = await api.get(`/api/papers/${id}`);
  return res.data;
}

export async function createPaper(data: CreatePaperRequest): Promise<PaperItem> {
  const res = await api.post('/api/papers', data);
  return res.data;
}

export async function updatePaper(id: string, data: UpdatePaperRequest): Promise<PaperItem> {
  const res = await api.patch(`/api/papers/${id}`, data);
  return res.data;
}

export async function deletePaper(id: string): Promise<void> {
  await api.delete(`/api/papers/${id}`);
}