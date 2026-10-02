import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Gauge } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { getInternalMetrics } from '@/api/radar';
import type { InternalMetrics, RatioPoint } from '@shared/api.interface';

function pct(r: number | null): string {
  return r === null ? '—' : (r * 100).toFixed(1) + '%';
}

function RatioCard({ label, point }: { label: string; point: RatioPoint }) {
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[16px_18px]">
      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">{label}</span>
      <div className="mt-1 font-serif text-[28px] font-bold text-[var(--foreground)]">{pct(point.rate)}</div>
      <div className="mt-1 font-mono text-[10.5px] text-[var(--muted-foreground)]">
        分子 {point.numerator} / 分母 {point.denominator}
        {point.rate === null && <span className="ml-1">(无曝光)</span>}
      </div>
    </div>
  );
}

export default function InternalMetrics() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<InternalMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user?.isAdmin) {
      navigate('/');
      return;
    }
    getInternalMetrics()
      .then(setData)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : '加载失败'))
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate]);

  if (!user?.isAdmin) return null;

  return (
    <div>
      <div className="flex items-center gap-2">
        <Gauge className="size-5 text-[var(--primary)]" />
        <h1 className="font-serif text-[28px] font-bold">内部指标</h1>
      </div>
      <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
        基于行为事件的聚合指标，仅管理员可见。不返回任何笔记正文。
      </p>

      {loading ? (
        <p className="mt-10 text-[var(--muted-foreground)]">加载中…</p>
      ) : error ? (
        <p className="mt-10 text-red-600">{error}</p>
      ) : !data ? null : (
        <>
          <section className="mt-6 grid grid-cols-2 gap-[14px] md:grid-cols-4">
            <RatioCard label="Top10 CTR (详情/曝光)" point={data.top10Ctr.overall} />
            <RatioCard label="加书架转化 (7d)" point={data.conversions.library} />
            <RatioCard label="待读转化 (7d)" point={data.conversions.todo} />
            <RatioCard label="不感兴趣率 (7d)" point={data.conversions.uninterested} />
          </section>

          <section className="mt-4 grid grid-cols-2 gap-[14px] md:grid-cols-4">
            <RatioCard label="阅读转化 (7d)" point={data.readingConversion7d} />
            <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[16px_18px]">
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">笔记创建 (7d)</span>
              <div className="mt-1 font-serif text-[28px] font-bold text-[var(--foreground)]">{data.noteCount}</div>
            </div>
          </section>

          <section className="mt-8 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
            <h2 className="font-serif text-[20px] font-bold">Top10 单篇 CTR</h2>
            <div className="mt-3 overflow-auto">
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-b border-[var(--border)] font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                    <th className="py-2 pr-3">论文</th>
                    <th className="py-2 pr-3">曝光</th>
                    <th className="py-2 pr-3">详情</th>
                    <th className="py-2">CTR</th>
                  </tr>
                </thead>
                <tbody>
                  {data.top10Ctr.items.length === 0 ? (
                    <tr><td colSpan={4} className="py-3 text-[var(--muted-foreground)]">当前无冻结 Top10。</td></tr>
                  ) : data.top10Ctr.items.map((it) => (
                    <tr key={it.paperId} className="border-b border-[var(--border)] last:border-0">
                      <td className="py-2 pr-3 max-w-[420px] truncate">{it.title}</td>
                      <td className="py-2 pr-3">{it.impressions}</td>
                      <td className="py-2 pr-3">{it.details}</td>
                      <td className="py-2 font-mono">{pct(it.ctr)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
