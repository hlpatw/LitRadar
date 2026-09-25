import { axiosForBackend } from '@lark-apaas/client-toolkit/utils/getAxiosForBackend';
import type { PaperItem, PaperDetail, CreatePaperRequest, UpdatePaperRequest, PaginatedResponse } from '@shared/api.interface';

export async function getPapers(params?: { journalId?: string; search?: string; page?: number; pageSize?: number }): Promise<PaginatedResponse<PaperItem>> {
  const sp = new URLSearchParams();
  if (params?.journalId) sp.set('journalId', params.journalId);
  if (params?.search) sp.set('search', params.search);
  if (params?.page) sp.set('page', String(params.page));
  if (params?.pageSize) sp.set('pageSize', String(params.pageSize));
  const qs = sp.toString();
  const res = await axiosForBackend({ url: `/api/papers${qs ? `?${qs}` : ''}`, method: 'GET' });
  return res.data;
}

export async function getPaperDetail(id: string): Promise<PaperDetail> {
  const res = await axiosForBackend({ url: `/api/papers/${id}`, method: 'GET' });
  return res.data;
}

export async function createPaper(data: CreatePaperRequest): Promise<PaperItem> {
  const res = await axiosForBackend({ url: '/api/papers', method: 'POST', data });
  return res.data;
}

export async function updatePaper(id: string, data: UpdatePaperRequest): Promise<PaperItem> {
  const res = await axiosForBackend({ url: `/api/papers/${id}`, method: 'PATCH', data });
  return res.data;
}

export async function deletePaper(id: string): Promise<void> {
  await axiosForBackend({ url: `/api/papers/${id}`, method: 'DELETE' });
}