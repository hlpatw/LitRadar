import { useCallback, useEffect, useState } from 'react';
import { getSources, type SourceRow } from '../../api/sources';
import { syncSource, syncAllReady, getSyncRuns, type SyncRunRow } from '../../api/connectors';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';

const priorityColor: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-orange-100 text-orange-700',
  P2: 'bg-blue-100 text-blue-700',
  P3: 'bg-gray-100 text-gray-600',
};

const connBadge: Record<string, string> = {
  ready: 'bg-emerald-100 text-emerald-700',
  skeleton: 'bg-amber-100 text-amber-700',
  disabled: 'bg-gray-200 text-gray-500',
};

const runBadge: Record<string, string> = {
  ok: 'bg-emerald-100 text-emerald-700',
  running: 'bg-blue-100 text-blue-700',
  error: 'bg-red-100 text-red-700',
};

export default function Sources() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [runs, setRuns] = useState<SyncRunRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [syncingIssn, setSyncingIssn] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState(false);
  const { user } = useAuth();
  const isAdmin = !!user?.isAdmin;

  const load = useCallback(() => {
    return Promise.all([
      getSources().then(setRows),
      getSyncRuns(50).then(setRuns).catch(() => setRuns([])),
    ])
      .catch((e) => setError(e?.response?.data?.message || '加载来源失败'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleSyncOne = async (issn: string) => {
    setSyncingIssn(issn);
    try {
      const out = await syncSource(issn);
      toast.success(`已同步 ${out.sourceName}：新增 ${out.inserted} / 更新 ${out.updated}`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '同步失败（需要管理员权限）');
    } finally {
      setSyncingIssn(null);
    }
  };

  const handleSyncAll = async () => {
    setSyncingAll(true);
    try {
      const outs = await syncAllReady();
      toast.success(`完成 ${outs.length}/7 个来源同步`);
      await load();
    } catch (e: any) {
      toast.error(e?.response?.data?.message || '批量同步失败（需要管理员权限）');
    } finally {
      setSyncingAll(false);
    }
  };

  if (loading) return <p className="text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const ready = rows.filter((r) => r.connectorStatus === 'ready').length;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <div>
          <h1 className="font-serif text-xl font-bold">追踪来源</h1>
          <span className="text-sm text-muted-foreground">
            共 {rows.length} 个 · 已就绪连接器 {ready} · 骨架/未实现 {rows.length - ready}
          </span>
        </div>
        {isAdmin && (
          <button
            onClick={handleSyncAll}
            disabled={syncingAll}
            className="rounded-md bg-[var(--primary)] px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            {syncingAll ? '同步中…' : '手动同步全部'}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-[var(--border)]">
        <table className="w-full text-sm">
          <thead className="bg-[var(--muted)] text-left">
            <tr>
              <th className="px-3 py-2 font-medium">优先级</th>
              <th className="px-3 py-2 font-medium">来源</th>
              <th className="px-3 py-2 font-medium">类型</th>
              <th className="px-3 py-2 font-medium">ISSN</th>
              <th className="px-3 py-2 font-medium">连接器</th>
              <th className="px-3 py-2 font-medium">状态</th>
              <th className="px-3 py-2 font-medium">轮询</th>
              <th className="px-3 py-2 font-medium">最近同步</th>
              <th className="px-3 py-2 font-medium">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                className={`border-t border-[var(--border)] ${r.status === 'archived' ? 'opacity-50' : ''}`}
              >
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${priorityColor[r.priority] || ''}`}>
                    {r.priority}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <div className="font-medium">{r.name}</div>
                  {r.status === 'archived' && (
                    <div className="text-xs text-muted-foreground">已归档</div>
                  )}
                </td>
                <td className="px-3 py-2">{r.sourceType}</td>
                <td className="px-3 py-2 font-mono text-xs">{r.issn || '—'}</td>
                <td className="px-3 py-2">
                  <span className="font-mono text-xs">{r.connectorType || '—'}</span>
                </td>
                <td className="px-3 py-2">
                  <span className={`rounded px-1.5 py-0.5 text-xs ${connBadge[r.connectorStatus] || ''}`}>
                    {r.connectorStatus}
                  </span>
                </td>
                <td className="px-3 py-2">{r.pollPolicy || '—'}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.lastSyncedAt ? new Date(r.lastSyncedAt).toLocaleDateString() : '—'}
                  {r.lastRunStatus ? ` (${r.lastRunStatus})` : ''}
                </td>
                <td className="px-3 py-2">
                  {isAdmin && r.connectorStatus === 'ready' && r.issn ? (
                    <button
                      onClick={() => handleSyncOne(r.issn!)}
                      disabled={syncingIssn === r.issn}
                      className="rounded border border-[var(--border)] px-2 py-0.5 text-xs hover:bg-[var(--accent)] disabled:opacity-50"
                    >
                      {syncingIssn === r.issn ? '…' : '同步'}
                    </button>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 className="mt-8 font-serif text-lg font-bold">同步记录</h2>
      {runs.length === 0 ? (
        <p className="text-sm text-muted-foreground mt-1">暂无同步记录。</p>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-lg border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--muted)] text-left">
              <tr>
                <th className="px-3 py-2 font-medium">来源</th>
                <th className="px-3 py-2 font-medium">状态</th>
                <th className="px-3 py-2 font-medium">抓取</th>
                <th className="px-3 py-2 font-medium">新增</th>
                <th className="px-3 py-2 font-medium">更新</th>
                <th className="px-3 py-2 font-medium">开始</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} className="border-t border-[var(--border)]">
                  <td className="px-3 py-2">{r.sourceName || r.sourceId}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded px-1.5 py-0.5 text-xs ${runBadge[r.status] || ''}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-3 py-2">{r.fetchedCount}</td>
                  <td className="px-3 py-2">{r.insertedCount}</td>
                  <td className="px-3 py-2">{r.updatedCount}</td>
                  <td className="px-3 py-2 text-xs text-muted-foreground">
                    {new Date(r.startedAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
