import { useEffect, useState } from 'react';
import { getSources, type SourceRow } from '../../api/sources';

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

export default function Sources() {
  const [rows, setRows] = useState<SourceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSources()
      .then(setRows)
      .catch((e) => setError(e?.response?.data?.message || '加载来源失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-muted-foreground">加载中…</p>;
  if (error) return <p className="text-red-600">{error}</p>;

  const ready = rows.filter((r) => r.connectorStatus === 'ready').length;

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="font-serif text-xl font-bold">追踪来源</h1>
        <span className="text-sm text-muted-foreground">
          共 {rows.length} 个 · 已就绪连接器 {ready} · 骨架/未实现 {rows.length - ready}
        </span>
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
              <th className="px-3 py-2 font-medium">别名/谱系</th>
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
                <td className="px-3 py-2 text-xs text-muted-foreground">
                  {r.aliases && r.aliases.length ? r.aliases.join(', ') : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
