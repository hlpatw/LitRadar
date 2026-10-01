import api from '../utils/axios';

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
  pollPolicy: string | null;
  lastSyncedAt: string | null;
  lastRunStatus: string | null;
  lastRunInserted: number | null;
}

export async function getSources(): Promise<SourceRow[]> {
  const res = await api.get('/api/sources');
  return res.data;
}
