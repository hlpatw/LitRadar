import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Star, BookOpen, Filter, RotateCcw, XCircle, Trash2, Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { library as libraryApi } from '@/api';
import type {
  LibraryItem,
  RecommendationItem,
} from '@shared/api.interface';

const STATUS_PILLS = [
  { key: '', label: '全部' },
  { key: 'favorite', label: '收藏' },
  { key: 'todo', label: '待读' },
  { key: 'reading', label: '阅读中' },
  { key: 'read', label: '已读' },
] as const;

const STATE_LABEL: Record<string, string> = { todo: '待读', reading: '阅读中', read: '已读' };

function LibraryRow({
  item,
  onChanged,
}: {
  item: LibraryItem;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const paper = item.paper;

  const cycleState = async () => {
    setBusy(true);
    try {
      const next = item.readingState === 'todo' ? 'reading' : item.readingState === 'reading' ? 'read' : 'todo';
      await libraryApi.setReadingState(item.paperId, next);
      toast.success('已更新阅读状态');
      onChanged();
    } catch {
      toast.error('更新失败');
    } finally {
      setBusy(false);
    }
  };

  const toggleFav = async () => {
    setBusy(true);
    try {
      await libraryApi.toggleFavorite(item.paperId, !item.isFavorite);
      onChanged();
    } catch {
      toast.error('操作失败');
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await libraryApi.removeLibrary(item.paperId);
      toast.success('已移出书架（笔记保留）');
      onChanged();
    } catch {
      toast.error('移除失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] leading-[1.6] text-[var(--foreground)] break-words line-clamp-2">
            {paper?.title ?? '论文已移除'}
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {paper?.journalName && (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                {paper.journalName}
              </span>
            )}
            {item.readingState && (
              <Badge variant="outline" className="font-mono text-[10.5px] uppercase tracking-[0.06em]">
                {STATE_LABEL[item.readingState]}
              </Badge>
            )}
            {item.isFavorite && (
              <Star className="size-3.5 fill-[var(--primary)] text-[var(--primary)]" />
            )}
            {item.personalTags?.split(',').filter(Boolean).map((t) => (
              <Badge key={t.trim()} variant="secondary" className="font-mono text-[10.5px]">
                {t.trim()}
              </Badge>
            ))}
            {item.noteCount > 0 && (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                {item.noteCount} 条笔记
              </span>
            )}
          </div>
          <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            加入于 {new Date(item.addedAt).toLocaleDateString('zh-CN')}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="h-7 text-xs rounded-[8px]" disabled={busy} onClick={cycleState}>
          <BookOpen className="size-3.5" />
          {item.readingState ? `状态: ${STATE_LABEL[item.readingState]}` : '设为待读'}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs rounded-[8px]" disabled={busy} onClick={toggleFav}>
          <Star className={`size-3.5 ${item.isFavorite ? 'fill-[var(--primary)] text-[var(--primary)]' : ''}`} />
          {item.isFavorite ? '已收藏' : '收藏'}
        </Button>
        <Button size="sm" variant="ghost" className="h-7 w-7 text-destructive hover:text-destructive" disabled={busy} onClick={remove}>
          <Trash2 className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function RecCard({ item, onSaved }: { item: RecommendationItem; onSaved: (paperId: string) => void }) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await libraryApi.upsertLibrary(item.paper.id, { isFavorite: true, readingState: 'todo' });
      toast.success('已加入书架并设为待读');
      onSaved(item.paper.id);
    } catch {
      toast.error('加入失败');
    } finally {
      setBusy(false);
    }
  };
  const skip = async () => {
    setBusy(true);
    try {
      await libraryApi.markUninterested(item.paper.id);
      toast.success('已标记不感兴趣');
      onSaved(item.paper.id);
    } catch {
      toast.error('操作失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
      <p className="text-[14.5px] leading-[1.6] text-[var(--foreground)] break-words line-clamp-2">
        {item.paper.title}
      </p>
      {item.paper.journalName && (
        <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
          {item.paper.journalName}
        </p>
      )}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {item.reasons.map((r) => (
          <Badge key={r} variant="secondary" className="font-mono text-[10.5px]">{r}</Badge>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" className="h-7 text-xs rounded-[8px]" disabled={busy} onClick={save}>
          <PlusIcon /> 加入
        </Button>
        <Button size="sm" variant="ghost" className="h-7 text-xs rounded-[8px] text-[var(--muted-foreground)]" disabled={busy} onClick={skip}>
          <XCircle className="size-3.5" /> 不感兴趣
        </Button>
      </div>
    </div>
  );
}

// lucide has Plus; import alias to avoid name clash with React
import { Plus as PlusIcon } from 'lucide-react';

export default function Library() {
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [recs, setRecs] = useState<RecommendationItem[]>([]);
  const [coldStart, setColdStart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string>('');
  const [q, setQ] = useState('');
  const [tag, setTag] = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [lib, reco] = await Promise.all([
        libraryApi.getLibrary({ status: status || undefined, q: q || undefined, tag: tag || undefined }),
        libraryApi.getRecommendations(10),
      ]);
      setItems(lib.items);
      setRecs(reco.items);
      setColdStart(reco.coldStart);
    } catch {
      toast.error('加载书架失败');
    } finally {
      setLoading(false);
    }
  }, [status, q, tag]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-[var(--foreground)] max-sm:text-[32px]">
          我的书架
        </h1>
      </div>

      {/* Filters */}
      <div className="mt-[40px] flex flex-wrap items-center gap-2">
        {STATUS_PILLS.map((p) => (
          <Button
            key={p.key}
            size="sm"
            variant={status === p.key ? 'default' : 'outline'}
            className="h-7 text-xs rounded-[8px]"
            onClick={() => setStatus(p.key)}
          >
            {p.label}
          </Button>
        ))}
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="搜索标题/摘要…"
          className="h-7 w-48 text-xs"
        />
        <Input
          value={tag}
          onChange={(e) => setTag(e.target.value)}
          placeholder="按个人标签过滤"
          className="h-7 w-36 text-xs"
        />
        <Button size="sm" variant="ghost" className="h-7 text-xs rounded-[8px]" onClick={() => { setQ(''); setTag(''); setStatus(''); }}>
          <RotateCcw className="size-3.5" /> 重置
        </Button>
      </div>

      {/* Recommendations */}
      <section className="mt-[40px]">
        <h2 className="flex items-center gap-2 font-serif text-[24px] leading-[1.4] tracking-[-0.005em] font-bold text-[var(--foreground)] max-sm:text-[20px]">
          <Sparkles className="size-5 text-[var(--primary)]" />
          为你推荐
        </h2>
        {coldStart && (
          <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
            冷启动：你还没有收藏/笔记历史，以下按兴趣关键词、来源优先级与新鲜度排序。
          </p>
        )}
        {loading ? (
          <div className="mt-3"><Spinner className="size-5" /></div>
        ) : recs.length === 0 ? (
          <p className="mt-3 text-[13px] text-[var(--muted-foreground)]">暂时没有新的推荐。</p>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-[14px] md:grid-cols-2">
            {recs.map((r) => (
              <RecCard key={r.paper.id} item={r} onSaved={() => fetchData()} />
            ))}
          </div>
        )}
      </section>

      {/* Library */}
      <section className="mt-[40px]">
        <h2 className="font-serif text-[24px] leading-[1.4] tracking-[-0.005em] font-bold text-[var(--foreground)] max-sm:text-[20px]">
          已保存 <span className="ml-2 text-sm text-[var(--muted-foreground)]">{items.length}</span>
        </h2>
        {loading ? (
          <div className="mt-3"><Spinner className="size-5" /></div>
        ) : items.length === 0 ? (
          <div className="mt-3">
            <Empty>
              <EmptyHeader>
                <EmptyTitle>书架为空</EmptyTitle>
                <EmptyDescription>从论文浏览页收藏或加入待读，这里会自动汇总。</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-[14px]">
            {items.map((it) => (
              <LibraryRow key={it.id} item={it} onChanged={() => fetchData()} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
