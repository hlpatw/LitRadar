import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { RefreshCw, ShieldCheck, AlertTriangle, Loader2, Play, RotateCcw } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/AuthContext';
import { getSources, type SourceRow } from '../../api/sources';
import {
  adminSyncSource,
  adminRetrySource,
  adminGetSourceRuns,
  type SyncRunRow,
} from '../../api/connectors';

const statusBadge: Record<string, string> = {
  ready: 'bg-emerald-100 text-emerald-700',
  skeleton: 'bg-amber-100 text-amber-700',
  disabled: 'bg-gray-200 text-gray-600',
};

/** Surface the server's human message regardless of which Nest error shape came back. */
function errMsg(e: any, fallback: string): string {
  const d = e?.response?.data;
  return d?.message || d?.error?.message || d?.error || fallback;
}

function disabledReason(s: SourceRow): string | null {
  if (s.connectorStatus === 'skeleton') return '连接器尚未实现';
  if (s.connectorStatus === 'disabled') return '连接器已停用';
  if (!s.issn) return '缺少 ISSN';
  return null;
}

export default function AdminSources() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [runs, setRuns] = useState<Record<string, SyncRunRow[]>>({});
  const [listLoading, setListLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const load = useCallback(() => {
    return getSources()
      .then(setSources)
      .catch(() => toast.error('加载来源列表失败'))
      .finally(() => setListLoading(false));
  }, []);

  useEffect(() => {
    // Wait until auth has resolved before deciding access, so a briefly-null user during
    // boot does not flash a redirect.
    if (authLoading) return;
    if (!user?.isAdmin) {
      toast.error('无权访问来源管理');
      navigate('/');
      return;
    }
    load();
  }, [user, authLoading, load, navigate]);

  const loadRuns = useCallback((id: string) => {
    return adminGetSourceRuns(id)
      .then((rows) => setRuns((prev) => ({ ...prev, [id]: rows })))
      .catch(() => {});
  }, []);

  useEffect(() => {
    // preload runs for ready sources
    sources.forEach((s) => {
      if (s.connectorStatus === 'ready') loadRuns(s.id);
    });
  }, [sources, loadRuns]);

  const doSync = async (s: SourceRow) => {
    setSyncing((p) => ({ ...p, [s.id]: true }));
    try {
      const out = await adminSyncSource(s.id);
      toast.success(`${s.name}: 新增 ${out.inserted} / 更新 ${out.updated}`);
      await Promise.all([load(), loadRuns(s.id)]);
    } catch (e: any) {
      toast.error(errMsg(e, '同步失败'));
    } finally {
      setSyncing((p) => ({ ...p, [s.id]: false }));
    }
  };

  const doRetry = async (s: SourceRow) => {
    setSyncing((p) => ({ ...p, [s.id]: true }));
    try {
      await adminRetrySource(s.id);
      toast.success(`${s.name}: 已重试`);
      await Promise.all([load(), loadRuns(s.id)]);
    } catch (e: any) {
      toast.error(errMsg(e, '重试失败'));
    } finally {
      setSyncing((p) => ({ ...p, [s.id]: false }));
    }
  };

  if (!user?.isAdmin) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-[var(--primary)]" />
        <h1 className="font-serif text-[28px] font-bold">来源管理</h1>
      </div>
      <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
        单来源同步。无批量同步入口；普通用户访问本页与对应 API 一律 403。
      </p>

      <div className="mt-6 flex flex-col gap-3">
        {listLoading
          ? Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))
          : sources.map((s) => {
              const reason = disabledReason(s);
              const srcRuns = runs[s.id] || [];
              const running = srcRuns.some((r) => r.status === 'running');
              const lastError = srcRuns.find((r) => r.status === 'error');
              const syncDisabled = Boolean(reason) || running || Boolean(syncing[s.id]);
              return (
                <div key={s.id} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[16px_20px]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-[16px] font-bold">{s.name}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[10.5px] ${statusBadge[s.connectorStatus] || 'bg-gray-100'}`}>
                          {s.connectorType ?? '—'} / {s.connectorStatus}
                        </span>
                        {s.priority && <Badge variant="outline" className="text-[10px]">{s.priority}</Badge>}
                      </div>
                      <div className="mt-1 font-mono text-[11px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                        {s.issn ? `ISSN ${s.issn}` : '无 ISSN'} · 最近 {s.lastRunStatus ?? '从未'}
                      </div>
                      {reason && (
                        <div className="mt-1 flex items-center gap-1 text-[12px] text-amber-700">
                          <AlertTriangle className="size-3.5" /> {reason}
                        </div>
                      )}
                      {running && (
                        <div className="mt-1 flex items-center gap-1 text-[12px] text-blue-600">
                          <Loader2 className="size-3.5 animate-spin" /> 正在同步…
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {lastError && (
                        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => doRetry(s)} disabled={Boolean(syncing[s.id])}>
                          <RotateCcw className="size-3.5" /> 重试失败
                        </Button>
                      )}
                      <Button
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => doSync(s)}
                        disabled={syncDisabled}
                        title={reason ?? undefined}
                      >
                        {syncing[s.id] ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
                        同步
                      </Button>
                    </div>
                  </div>

                  {/* Runs table (full fields) */}
                  {srcRuns.length > 0 && (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full text-left text-[12px]">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-[var(--muted-foreground)]">
                            <th className="py-1 pr-3">开始</th>
                            <th className="py-1 pr-3">状态</th>
                            <th className="py-1 pr-3">抓取</th>
                            <th className="py-1 pr-3">新增</th>
                            <th className="py-1 pr-3">更新</th>
                            <th className="py-1">消息</th>
                          </tr>
                        </thead>
                        <tbody>
                          {srcRuns.slice(0, 5).map((r) => (
                            <tr key={r.id} className="border-b border-[var(--border)]/50">
                              <td className="py-1 pr-3 font-mono text-[11px]">{new Date(r.startedAt).toLocaleString('zh-CN')}</td>
                              <td className={`py-1 pr-3 ${r.status === 'error' ? 'text-red-600' : r.status === 'running' ? 'text-blue-600' : 'text-emerald-600'}`}>
                                {r.status}
                              </td>
                              <td className="py-1 pr-3">{r.fetchedCount}</td>
                              <td className="py-1 pr-3">{r.insertedCount}</td>
                              <td className="py-1 pr-3">{r.updatedCount}</td>
                              <td className="max-w-[260px] truncate py-1 pr-3 text-[var(--muted-foreground)]">{r.message ?? ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </div>
  );
}
