import api from '../utils/axios';
import type { RadarHistoryResponse, WeeklyDigest, SchedulerStatus, TrackEventRequest, EventAdminSummary, InternalMetrics } from '@shared/api.interface';

export async function getRadar(): Promise<RadarHistoryResponse> {
  const res = await api.get('/radar/current');
  return res.data;
}

export async function getDigest(week: 'current' | 'previous' = 'current'): Promise<WeeklyDigest> {
  const res = await api.get(`/digest/${week}`);
  return res.data;
}

export async function getInternalMetrics(): Promise<InternalMetrics> {
  const res = await api.get('/admin/metrics');
  return res.data;
}

export async function trackEvent(body: TrackEventRequest): Promise<{ recorded: boolean }> {
  const res = await api.post('/events', body);
  return res.data;
}

export async function getEventSummary(): Promise<EventAdminSummary> {
  const res = await api.get('/events/admin/summary');
  return res.data;
}

export async function getSchedulerStatus(): Promise<SchedulerStatus> {
  const res = await api.get('/admin/scheduler');
  return res.data;
}

export async function setSchedulerPaused(paused: boolean): Promise<SchedulerStatus> {
  const res = await api.put('/admin/scheduler', { paused });
  return res.data;
}

export async function runSchedulerOnce() {
  const res = await api.post('/admin/scheduler/run-once');
  return res.data;
}
