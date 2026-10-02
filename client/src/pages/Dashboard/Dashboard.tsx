import React from 'react';
import { useNavigate } from 'react-router-dom';
import * as api from '@/api';
import RadarSection from '@/components/RadarSection';
import type { Overview, DashboardNote } from '@shared/api.interface';
import { Sparkles, KeyRound, Flame, Layers, StickyNote } from 'lucide-react';

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

  // Compact research summary (replaces the old global count cards).
  const summary = loading || !ov
    ? []
    : [
        { label: '本周新增论文', value: ov.newThisWeek, icon: Sparkles, href: '/papers' },
        { label: '关键词命中', value: ov.interestKeywordHits, icon: KeyRound, href: '/settings' },
        { label: '高优先待读', value: ov.highRelevancePending, icon: Flame, href: '/library?status=todo' },
        { label: '待读积压', value: ov.todoBacklog, icon: Layers, href: '/library?status=todo' },
        { label: '最近笔记', value: ov.stats.noteCount, icon: StickyNote, href: '/notes' },
      ];

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-7">
      <h1
        className="font-serif text-[42px] font-bold leading-[1.06] -tracking-[0.015em] text-[var(--foreground)]"
        style={{ fontFamily: 'Charter, Georgia, PingFang SC, serif' }}
      >
        Dashboard
      </h1>

      {/* (1) Weekly research radar Top10 is the FIRST substantive section. */}
      {!loading && <RadarSection />}

      {/* Compact research summary */}
      <section className="mt-10">
        <div className="grid grid-cols-2 gap-[14px] sm:grid-cols-3 md:grid-cols-5">
          {loading
            ? Array.from({ length: 5 }).map((_, i: number) => (
                <div key={i} className="animate-pulse rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[16px_18px]">
                  <div className="h-8 w-12 rounded bg-[var(--border)]" />
                </div>
              ))
            : summary.map((s) => {
                const Icon = s.icon;
                return (
                  <button
                    key={s.label}
                    type="button"
                    onClick={() => navigate(s.href)}
                    className="block rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[16px_18px] text-left transition-colors hover:border-[var(--primary)]"
                  >
                    <div className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                      <Icon size={13} />
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em]">{s.label}</span>
                    </div>
                    <div className="mt-1 font-serif text-[28px] font-bold leading-none text-[var(--foreground)]">
                      {s.value}
                    </div>
                  </button>
                );
              })}
        </div>
      </section>

      {/* Recent notes with paper links */}
      <section className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-[24px] font-bold text-[var(--foreground)]">最近笔记</h2>
          <button type="button" onClick={() => navigate('/notes')} className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--primary)] hover:underline">
            全部笔记
          </button>
        </div>
        <div className="mt-4 space-y-2">
          {loading ? (
            <p className="text-[var(--muted-foreground)]">加载中…</p>
          ) : !ov || ov.recentNotes.length === 0 ? (
            <p className="text-[14.5px] text-[var(--muted-foreground)]">还没有笔记 — 在论文详情页随手记下想法。</p>
          ) : (
            ov.recentNotes.map((n: DashboardNote) => (
              <div key={n.id} className="rounded-md border border-transparent p-2">
                <p className="text-[14px] leading-[1.5] text-[var(--foreground)]">{n.excerpt}</p>
                <div className="mt-1 flex items-center gap-2 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                  <span>{new Date(n.updatedAt).toLocaleDateString('zh-CN')}</span>
                  {n.paperId && (
                    <button
                      type="button"
                      onClick={() => navigate(`/papers/${n.paperId}`)}
                      className="text-[var(--primary)] hover:underline"
                    >
                      {n.paperTitle ?? '查看论文'}
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
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
    </div>
  );
};

export default Dashboard;
