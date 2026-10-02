import api from '../utils/axios';

export interface SyncOutcome {
  sourceId: string;
  sourceName: string;
  runId: string;
  fetched: number;
  inserted: number;
  updated: number;
  status: 'ok' | 'error';
}

export interface SyncRunRow {
  id: string;
  sourceId: string;
  sourceName: string | null;
  connectorType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  fetchedCount: number;
  insertedCount: number;
  updatedCount: number;
  message: string | null;
}

// Admin-gated server-side; non-admins get a 403 surfaced by the caller.
export async function syncSource(issn: string): Promise<SyncOutcome> {
  const res = await api.post(`/connectors/sync/${encodeURIComponent(issn)}`);
  return res.data;
}

export async function syncAllReady(): Promise<SyncOutcome[]> {
  const res = await api.post('/connectors/sync-all');
  return res.data;
}

export async function getSyncRuns(limit = 50): Promise<SyncRunRow[]> {
  const res = await api.get('/connectors/runs', { params: { limit } });
  return res.data;
}

// ── Admin Source Management (single-source sync only; no batch) ──────────────

export async function adminSyncSource(sourceId: string): Promise<SyncOutcome> {
  const res = await api.post(`/admin/sources/${sourceId}/sync`);
  return res.data;
}

export async function adminRetrySource(sourceId: string): Promise<SyncOutcome> {
  const res = await api.post(`/admin/sources/${sourceId}/retry`);
  return res.data;
}

export async function adminGetSourceRuns(sourceId: string): Promise<SyncRunRow[]> {
  const res = await api.get(`/admin/sources/${sourceId}/runs`);
  return res.data;
}
