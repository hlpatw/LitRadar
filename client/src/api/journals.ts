import api from '../utils/axios';
import type { JournalItem } from '@shared/api.interface';

export async function getJournals(params?: { priority?: string; type?: string }): Promise<JournalItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.priority) searchParams.set('priority', params.priority);
  if (params?.type) searchParams.set('type', params.type);
  const qs = searchParams.toString();
  const res = await api.get(`/api/journals${qs ? `?${qs}` : ''}`);
  return res.data;
}