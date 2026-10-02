import React from 'react';
import { toast } from 'sonner';
import { Star, BookMarked, X, FileText } from 'lucide-react';
import * as api from '@/api';
import type { RadarHistoryResponse, RadarTopItem, WeeklyRadarSnapshot } from '@shared/api.interface';
import { trackImpression, trackDetail, trackLibrary, trackAction } from '@/utils/events';

async function quickAction(paperId: string, action: 'favorite' | 'todo' | 'uninterested') {
  try {
    if (action === 'favorite') {
      await api.library.toggleFavorite(paperId, true);
      trackAction('favorite', paperId);
      trackLibrary(paperId); // a favorite creates/extends a library association
    } else if (action === 'todo') {
      await api.library.upsertLibrary(paperId, { readingState: 'todo' });
      trackAction('todo', paperId);
      trackLibrary(paperId);
    } else {
      await api.library.markUninterested(paperId);
      trackAction('uninterested', paperId);
    }
    toast.success('已更新书架');
  } catch (e) {
    toast.error(e instanceof Error ? e.message : '操作失败');
  }
}

function RadarRow({ item, onOpenPaper }: { item: RadarTopItem; onOpenPaper: (id: string) => void }) {
  return (
    <div className="rounded-[8px] border border-[var(--border)] bg-white p-[14px_16px]">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 font-serif text-[20px] font-bold text-[var(--primary)] w-6 shrink-0">
          {item.rank}
        </span>
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={() => onOpenPaper(item.paper.id)}
            className="text-left font-serif text-[15px] font-bold leading-snug text-[var(--foreground)] hover:underline"
          >
            {item.paper.title}
          </button>
          <div className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            {item.paper.journalName || '未标注来源'}
            {item.paper.publishedDate ? ` · ${item.paper.publishedDate}` : ''}
            {item.paper.hasAbstract ? ' · 含摘要' : ''}
          </div>
          {item.reasons.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {item.reasons.map((r) => (
                <span key={r} className="rounded-[6px] bg-[var(--accent)] px-1.5 py-0.5 text-[11px] text-[var(--accent-foreground)]">{r}</span>
              ))}
            </div>
          )}
          {item.matchedKeywords.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {item.matchedKeywords.map((k) => (
                <span key={k} className="text-[11px] text-[var(--muted-foreground)]">#{k}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col gap-1">
          <button title="收藏" onClick={() => quickAction(item.paper.id, 'favorite')} className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--primary)]">
            <Star size={15} />
          </button>
          <button title="加入待读" onClick={() => quickAction(item.paper.id, 'todo')} className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--primary)]">
            <BookMarked size={15} />
          </button>
          <button title="不感兴趣" onClick={() => quickAction(item.paper.id, 'uninterested')} className="rounded p-1.5 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-red-600">
            <X size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}

export default function RadarSection() {
  const [data, setData] = React.useState<RadarHistoryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [tab, setTab] = React.useState<'current' | 'previous'>('current');
  const navigate = (id: string) => { trackDetail(id); window.location.href = `/papers/${id}`; };

  React.useEffect(() => {
    api.radar.getRadar()
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const snapshot: WeeklyRadarSnapshot | null =
    tab === 'current' ? data?.current ?? null : data?.previous ?? null;

  // Fire one impression per rendered item (in-session deduped by the helper).
  React.useEffect(() => {
    if (!snapshot) return;
    for (const it of snapshot.items) trackImpression(it.paper.id, 'radar');
  }, [snapshot]);

  return (
    <section className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-serif text-[24px] font-bold text-[var(--foreground)]">每周研究雷达 · Top 10</h2>
        <div className="flex gap-1 rounded-[8px] border border-[var(--border)] p-0.5">
          <button
            onClick={() => setTab('current')}
            className={`rounded-[6px] px-3 py-1 text-[12px] ${tab === 'current' ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'text-[var(--muted-foreground)]'}`}
          >
            本周
          </button>
          <button
            onClick={() => setTab('previous')}
            disabled={!data?.previous}
            className={`rounded-[6px] px-3 py-1 text-[12px] disabled:opacity-40 ${tab === 'previous' ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'text-[var(--muted-foreground)]'}`}
          >
            上周
          </button>
        </div>
      </div>
      {loading ? (
        <p className="mt-4 text-[14.5px] text-[var(--muted-foreground)]">加载中…</p>
      ) : !snapshot || snapshot.items.length === 0 ? (
        <p className="mt-4 text-[14.5px] text-[var(--muted-foreground)]">本周暂无雷达结果。</p>
      ) : (
        <>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            周起始 {snapshot.weekStart} · 本周新增 {snapshot.newPaperCount} · 冻结于 {new Date(snapshot.generatedAt).toLocaleString('zh-CN')}
          </p>
          <div className="mt-4 space-y-2">
            {snapshot.items.map((it) => (
              <RadarRow key={it.paper.id} item={it} onOpenPaper={navigate} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
