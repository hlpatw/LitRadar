import React from 'react';
import * as api from '@/api';
import type { WeeklyDigest, RadarTopItem } from '@shared/api.interface';
import { trackImpression, trackDetail } from '@/utils/events';

const typeLabels: Record<string, string> = {
  impression: '曝光', detail: '详情', library: '加书架', todo: '待读',
  favorite: '收藏', uninterested: '不感兴趣', note: '记笔记',
};

export default function Digest() {
  const [week, setWeek] = React.useState<'current' | 'previous'>('current');
  const [data, setData] = React.useState<WeeklyDigest | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    api.radar.getDigest(week)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e: unknown) => { setError(e instanceof Error ? e.message : '加载失败'); setLoading(false); });
  }, [week]);

  // Fire one impression per rendered Top10 row (in-session deduped by the helper).
  React.useEffect(() => {
    if (!data) return;
    for (const it of data.top10) trackImpression(it.paper.id, 'digest');
  }, [data]);

  if (loading) return <p className="mt-10 text-[var(--muted-foreground)]">加载中…</p>;
  if (error) return <p className="mt-10 text-red-600">{error}</p>;
  if (!data) return null;

  const empty = data.top10.length === 0;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="font-serif text-[42px] font-bold leading-[1.06] tracking-[-0.015em] text-[var(--foreground)]">
          每周文摘
        </h1>
        <div className="flex gap-1 rounded-[8px] border border-[var(--border)] p-0.5">
          {(['current', 'previous'] as const).map((w) => (
            <button
              key={w}
              onClick={() => setWeek(w)}
              className={`rounded-[6px] px-3 py-1 text-[12px] ${week === w ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'text-[var(--muted-foreground)]'}`}
            >
              {w === 'current' ? '本周' : '上周'}
            </button>
          ))}
        </div>
      </div>
      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
        周起始 {data.weekStart}
        {data.generatedAt ? ` · 生成于 ${new Date(data.generatedAt).toLocaleString('zh-CN')}` : ' · 暂无冻结快照'}
      </p>

      {/* Headline numbers */}
      <section className="mt-8 grid grid-cols-2 gap-[14px] md:grid-cols-4">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[18px_20px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">本周新增论文</span>
          <div className="mt-1 font-serif text-[32px] font-bold text-[var(--primary)]">{data.newPaperCount}</div>
        </div>
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[18px_20px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">本周动作</span>
          <div className="mt-1 font-serif text-[32px] font-bold text-[var(--foreground)]">
            {Object.values(data.userActionCounts).reduce((a, b) => a + b, 0)}
          </div>
        </div>
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[18px_20px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">来源覆盖</span>
          <div className="mt-1 font-serif text-[32px] font-bold text-[var(--foreground)]">{data.sourceDistribution.length}</div>
        </div>
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[18px_20px]">
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">热门关键词</span>
          <div className="mt-1 font-serif text-[32px] font-bold text-[var(--foreground)]">{data.keywordHits.length}</div>
        </div>
      </section>

      {empty ? (
        <section className="mt-8 rounded-[10px] border border-dashed border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <p className="text-[14.5px] text-[var(--muted-foreground)]">
            该周暂无冻结 Top10 报告。普通浏览不会生成快照——等待每周调度冻结后即可查看。
          </p>
        </section>
      ) : (
        <>
          {/* User action breakdown */}
          <section className="mt-8 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
            <h2 className="font-serif text-[20px] font-bold text-[var(--foreground)]">我的本周动作</h2>
            <div className="mt-3 flex flex-wrap gap-2">
              {Object.entries(data.userActionCounts).map(([k, v]) => (
                <span key={k} className="rounded-[8px] border border-[var(--border)] px-2.5 py-1 text-[12px] text-[var(--muted-foreground)]">
                  {typeLabels[k] ?? k}: <b className="text-[var(--foreground)]">{v}</b>
                </span>
              ))}
            </div>
          </section>

          {/* Source distribution + keyword hits */}
          <section className="mt-8 grid grid-cols-1 gap-[14px] md:grid-cols-2">
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
              <h2 className="font-serif text-[20px] font-bold text-[var(--foreground)]">来源分布</h2>
              <div className="mt-3 space-y-1.5">
                {data.sourceDistribution.length === 0 ? <p className="text-[13px] text-[var(--muted-foreground)]">暂无数据</p> :
                  data.sourceDistribution.map((s) => (
                    <div key={s.source} className="flex items-center justify-between text-[13px]">
                      <span className="truncate text-[var(--foreground)]">{s.source}</span>
                      <span className="ml-2 font-mono text-[var(--muted-foreground)]">{s.count}</span>
                    </div>
                  ))}
              </div>
            </div>
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
              <h2 className="font-serif text-[20px] font-bold text-[var(--foreground)]">关键词命中</h2>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {data.keywordHits.length === 0 ? <p className="text-[13px] text-[var(--muted-foreground)]">暂无数据</p> :
                  data.keywordHits.map((k) => (
                    <span key={k.keyword} className="rounded-[6px] bg-[var(--accent)] px-2 py-0.5 text-[12px] text-[var(--accent-foreground)]">
                      #{k.keyword} · {k.count}
                    </span>
                  ))}
              </div>
            </div>
          </section>

          {/* Top10 with paper links */}
          <section className="mt-8">
            <h2 className="font-serif text-[24px] font-bold text-[var(--foreground)]">本周 Top 10</h2>
            <div className="mt-4 space-y-2">
              {data.top10.map((it: RadarTopItem) => (
                <a key={it.paper.id} href={`/papers/${it.paper.id}`} onClick={() => trackDetail(it.paper.id)} className="block rounded-[8px] border border-[var(--border)] bg-white p-[14px_16px] hover:border-[var(--primary)]">
                  <div className="flex items-center gap-3">
                    <span className="font-serif text-[20px] font-bold text-[var(--primary)] w-6">{it.rank}</span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-serif text-[15px] font-bold text-[var(--foreground)]">{it.paper.title}</div>
                      <div className="mt-0.5 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                        {it.paper.journalName || '未标注来源'}{it.paper.publishedDate ? ` · ${it.paper.publishedDate}` : ''}
                      </div>
                    </div>
                  </div>
                </a>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
