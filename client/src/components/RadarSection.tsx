import React from 'react';
import { BookMarked, X, FileText } from 'lucide-react';
import * as api from '@/api';
import type { RadarHistoryResponse, RadarTopItem, WeeklyRadarSnapshot } from '@shared/api.interface';
import { trackImpression, trackDetail } from '@/utils/events';
import { FavoriteButton } from '@/library/FavoriteButton';
import { addTodo, markUninterested } from '@/library/library-store';
import { useLibraryPending } from '@/library/use-paper-library';

function ActionButton({
  title,
  onClick,
  pending,
  disabled,
  danger,
  children,
}: {
  title: string;
  onClick: () => void;
  pending: boolean;
  disabled?: boolean;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-busy={pending}
      disabled={pending || disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`rounded p-1.5 transition-colors disabled:cursor-wait disabled:opacity-60 ${
        danger
          ? 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-red-600'
          : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--primary)]'
      }`}
    >
      {children}
    </button>
  );
}

function RadarRow({ item, onOpenPaper }: { item: RadarTopItem; onOpenPaper: (id: string) => void }) {
  const todoBusy = useLibraryPending(item.paper.id, 'todo');
  const uninterestedBusy = useLibraryPending(item.paper.id, 'uninterested');
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
          <FavoriteButton paperId={item.paper.id} />
          <ActionButton title="加入待读" pending={todoBusy} onClick={() => addTodo(item.paper.id)}>
            <BookMarked size={15} className={todoBusy ? 'animate-pulse' : ''} />
          </ActionButton>
          <ActionButton title="不感兴趣" pending={uninterestedBusy} danger onClick={() => markUninterested(item.paper.id)}>
            <X size={15} className={uninterestedBusy ? 'animate-pulse' : ''} />
          </ActionButton>
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
        <p className="mt-4 text-[14.5px] text-[var(--muted-foreground)]">
          {snapshot ? `周起始 ${snapshot.weekStart} 暂无 Top10 结果。` : '暂无雷达结果。'}
        </p>
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
