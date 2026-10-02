import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/api';
import RadarSection from '@/components/RadarSection';
import type { Overview, OverviewRun } from '@shared/api.interface';
import {
  Library,
  FileText,
  Star,
  CheckSquare,
  CheckCircle2,
  StickyNote,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const [ov, setOv] = React.useState<Overview | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.workspace
      .getOverview()
      .then((data: Overview) => {
        setOv(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message: string = err instanceof Error ? err.message : '加载失败';
        setError(message);
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-8 py-7">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <p className="text-[14.5px] leading-[1.6] text-[var(--muted-foreground)]">
            数据加载失败：{error}
          </p>
        </div>
      </div>
    );
  }

  const cards = loading || !ov
    ? []
    : [
        { label: '期刊源', value: ov.stats.journalCount, href: '/journals' },
        { label: '论文', value: ov.stats.paperCount, href: '/papers' },
        { label: '收藏', value: ov.stats.favoriteCount, href: '/papers?favorite=1' },
        { label: '待读', value: ov.stats.checklistTodoCount, href: '/library?status=todo' },
        { label: '阅读中', value: ov.stats.readingCount, href: '/library?status=reading' },
        { label: '已读', value: ov.stats.checklistDoneCount, href: '/library?status=read' },
        { label: '笔记', value: ov.stats.noteCount, href: '/notes' },
      ];

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-7">
      <h1
        className="font-serif text-[42px] font-bold leading-[1.06] -tracking-[0.015em] text-[var(--foreground)]"
        style={{ fontFamily: 'Charter, Georgia, PingFang SC, serif' }}
      >
        Dashboard
      </h1>

      {/* Stat cards */}
      <section className="mt-10">
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 md:grid-cols-4">
          {loading
            ? Array.from({ length: 7 }).map((_, i: number) => (
                <div key={i} className="animate-pulse rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
                  <div className="h-10 w-16 rounded bg-[var(--border)]" />
                </div>
              ))
            : cards.map((c) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => navigate(c.href)}
                  className="block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px] text-left transition-all hover:-translate-y-0.5 hover:border-[var(--primary)] hover:shadow-sm"
                >
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                    {c.label}
                  </span>
                  <div className="mt-1 font-serif text-[42px] font-bold leading-[1.06] text-[var(--primary)]">
                    {c.value}
                  </div>
                </button>
              ))}
        </div>
      </section>

      {/* Weekly research radar (dashboard-first) */}
      {!loading && <RadarSection />}

      {/* Weekly / sync summary */}
      <section className="mt-8 grid grid-cols-1 gap-[14px] md:grid-cols-2">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
            <RefreshCw size={16} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]">本周新增论文</span>
          </div>
          <div className="mt-2 font-serif text-[36px] font-bold text-[var(--foreground)]">
            {loading ? '…' : ov?.newThisWeek ?? 0}
          </div>
        </div>
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <div className="flex items-center gap-2 text-[var(--muted-foreground)]">
            <AlertTriangle size={16} />
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]">失败的同步</span>
          </div>
          <div className="mt-2 font-serif text-[36px] font-bold text-[var(--foreground)]">
            {loading ? '…' : ov?.failedRuns ?? 0}
          </div>
        </div>
      </section>

      {/* Recent papers */}
      <section className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <h2 className="font-serif text-[24px] font-bold text-[var(--foreground)]">最近论文</h2>
        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-[var(--muted-foreground)]">加载中…</p>
          ) : !ov || ov.recentPapers.length === 0 ? (
            <p className="text-[14.5px] text-[var(--muted-foreground)]">暂无论文 — 前往来源页执行一次同步后再回来。</p>
          ) : (
            ov.recentPapers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => navigate(`/papers/${p.id}`)}
                className="block w-full rounded-md border border-transparent p-2 text-left transition-colors hover:border-[var(--border)] hover:bg-[var(--accent)]"
              >
                <div className="font-serif text-[15px] font-bold text-[var(--foreground)]">{p.title}</div>
                <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                  {p.journalName || '未分类'} · {p.publishedDate ? new Date(p.publishedDate).toLocaleDateString('zh-CN') : '日期未知'}
                </div>
              </button>
            ))
          )}
        </div>
      </section>

      {/* Recent sync runs */}
      <section className="mt-8 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <h2 className="font-serif text-[24px] font-bold text-[var(--foreground)]">最近同步</h2>
        <div className="mt-4 overflow-auto">
          <table className="w-full text-left text-[13px]">
            <thead>
              <tr className="border-b border-[var(--border)] font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                <th className="py-2 pr-3">来源</th>
                <th className="py-2 pr-3">状态</th>
                <th className="py-2 pr-3">新增</th>
                <th className="py-2 pr-3">更新</th>
                <th className="py-2">时间</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={5} className="py-3 text-[var(--muted-foreground)]">加载中…</td></tr>
              ) : !ov || ov.recentRuns.length === 0 ? (
                <tr><td colSpan={5} className="py-3 text-[var(--muted-foreground)]">暂无同步记录</td></tr>
              ) : (
                ov.recentRuns.map((r: OverviewRun) => (
                  <tr key={r.id} className="border-b border-[var(--border)] last:border-0">
                    <td className="py-2 pr-3">{r.sourceName || '—'}</td>
                    <td className="py-2 pr-3">
                      <span className={r.status === 'error' ? 'text-red-600' : r.status === 'ok' ? 'text-green-600' : ''}>
                        {r.status}
                      </span>
                    </td>
                    <td className="py-2 pr-3">{r.insertedCount}</td>
                    <td className="py-2 pr-3">{r.updatedCount}</td>
                    <td className="py-2 text-[var(--muted-foreground)]">{new Date(r.startedAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
