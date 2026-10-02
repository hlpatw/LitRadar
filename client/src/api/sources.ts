import api from '../utils/axios';
import type {
  SourceDetail,
  SourcePaperListResponse,
} from '@shared/api.interface';

export interface SourceRow {
  id: string;
  parentId: string | null;
  name: string;
  abbreviation: string | null;
  sourceType: string;
  priority: 'P0' | 'P1' | 'P2' | 'P3';
  category: string | null;
  url: string | null;
  issn: string | null;
  status: 'active' | 'archived';
  connectorType: string | null;
  connectorStatus: 'ready' | 'skeleton' | 'disabled';
  pollPolicy: string | null;
  lastSyncedAt: string | null;
  lastRunStatus: string | null;
  lastRunInserted: number | null;
  aliases: string[];
}

export async function getSources(): Promise<SourceRow[]> {
  const res = await api.get('/sources');
  return res.data;
}

export async function getSourceDetail(id: string): Promise<SourceDetail> {
  const res = await api.get(`/sources/${id}`);
  return res.data;
}

export interface SourcePapersQuery {
  search?: string;
  from?: string;
  to?: string;
  hasAbstract?: string;
  notInLibrary?: string;
  order?: 'latest' | 'recommend';
  page?: number;
  pageSize?: number;
}

export async function getSourcePapers(
  id: string,
  query: SourcePapersQuery = {},
): Promise<SourcePaperListResponse> {
  const params: Record<string, string> = {};
  if (query.search) params.search = query.search;
  if (query.from) params.from = query.from;
  if (query.to) params.to = query.to;
  if (query.hasAbstract) params.hasAbstract = query.hasAbstract;
  if (query.notInLibrary) params.notInLibrary = query.notInLibrary;
  if (query.order) params.order = query.order;
  if (query.page) params.page = String(query.page);
  if (query.pageSize) params.pageSize = String(query.pageSize);
  const res = await api.get(`/sources/${id}/papers`, { params });
  return res.data;
}
