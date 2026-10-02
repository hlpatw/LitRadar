import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
  ArrowLeft,
  ExternalLink,
  Star,
  BookOpen,
  RefreshCw,
  AlertTriangle,
  Search,
} from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';
import {
  Empty,
  EmptyHeader,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import { getSourceDetail, getSourcePapers, type SourcePapersQuery } from '../../api/sources';
import { library as libraryApi } from '@/api';
import type {
  SourceDetail as SourceDetailType,
  SourcePaperItem,
  ReadingState,
} from '@shared/api.interface';

const PAGE_SIZE = 20;

const priorityColor: Record<string, string> = {
  P0: 'bg-red-100 text-red-700',
  P1: 'bg-orange-100 text-orange-700',
  P2: 'bg-blue-100 text-blue-700',
  P3: 'bg-gray-100 text-gray-600',
};

const STATE_LABEL: Record<string, string> = { todo: '待读', reading: '阅读中', read: '已读' };

function paperActionsDisabledReason(s: SourceDetailType): string | null {
  if (s.connectorStatus === 'skeleton') return '连接器尚未实现，该来源暂无在线抓取';
  if (s.connectorStatus === 'disabled') return '连接器已停用';
  return null;
}

export default function SourceDetail() {
  const { sourceId = '' } = useParams();
  const navigate = useNavigate();

  const [detail, setDetail] = useState<SourceDetailType | null>(null);
  const [items, setItems] = useState<SourcePaperItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // filters
  const [search, setSearch] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [hasAbstract, setHasAbstract] = useState('');
  const [notInLibrary, setNotInLibrary] = useState(false);
  const [order, setOrder] = useState<'latest' | 'recommend'>('latest');

  const fetchDetail = useCallback(() => {
    return getSourceDetail(sourceId)
      .then(setDetail)
      .catch((e) => setError(e?.response?.data?.message || '加载来源失败'));
  }, [sourceId]);

  const fetchPapers = useCallback(() => {
    setLoading(true);
    const q: SourcePapersQuery = {
      search: search || undefined,
      from: from || undefined,
      to: to || undefined,
      hasAbstract: hasAbstract || undefined,
      notInLibrary: notInLibrary ? '1' : undefined,
      order,
      page,
      pageSize: PAGE_SIZE,
    };
    return getSourcePapers(sourceId, q)
      .then((res) => {
        setItems(res.items);
        setTotal(res.total);
        setDetail(res.source);
      })
      .catch((e) => setError(e?.response?.data?.message || '加载论文失败'))
      .finally(() => setLoading(false));
  }, [sourceId, search, from, to, hasAbstract, notInLibrary, order, page]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    fetchPapers();
  }, [fetchPapers]);

  const runSearch = () => {
    setPage(1);
    setSearch(searchInput.trim());
  };

  const cycleState = async (paper: SourcePaperItem) => {
    const next: ReadingState | null =
      paper.readingState === 'todo' ? 'reading' : paper.readingState === 'reading' ? 'read' : 'todo';
    try {
      await libraryApi.setReadingState(paper.id, next);
      toast.success(next ? `已设为${STATE_LABEL[next]}` : '已清除阅读状态');
      fetchPapers();
    } catch {
      toast.error('操作失败');
    }
  };

  const toggleFav = async (paper: SourcePaperItem) => {
    try {
      await libraryApi.toggleFavorite(paper.id, !paper.isFavorite);
      fetchPapers();
    } catch {
      toast.error('操作失败');
    }
  };

  if (error && !detail) {
    return (
      <div className="py-10 text-center">
        <p className="text-[var(--muted-foreground)]">{error}</p>
        <Button variant="outline" size="sm" className="mt-4" onClick={() => navigate('/sources')}>
          <ArrowLeft className="size-3.5" /> 返回来源列表
        </Button>
      </div>
    );
  }

  const reason = detail ? paperActionsDisabledReason(detail) : null;
  const hasActiveFilters = Boolean(search || from || to || hasAbstract || notInLibrary);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div>
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/sources')}
        className="flex items-center gap-1 font-mono text-[11.5px] uppercase tracking-[0.08em] text-[var(--muted-foreground)] hover:text-[var(--primary)]"
      >
        <ArrowLeft className="size-3.5" /> 追踪来源
      </button>

      {/* Header */}
      {!detail ? (
        <div className="mt-4">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="mt-3 h-4 w-1/2" />
        </div>
      ) : (
        <div className="mt-4 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="font-serif text-[32px] leading-[1.06] font-bold text-[var(--foreground)] max-sm:text-[26px]">
                  {detail.name}
                </h1>
                {detail.status === 'archived' && (
                  <Badge variant="outline" className="text-xs">已归档</Badge>
                )}
              </div>
              {detail.description && (
                <p className="mt-2 max-w-2xl text-[14.5px] leading-[1.6] text-[var(--muted-foreground)]">
                  {detail.description}
                </p>
              )}
            </div>
            {detail.url && (
              <a
                href={detail.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--primary)] hover:underline"
              >
                <ExternalLink className="size-3.5" /> 官网
              </a>
            )}
          </div>

          {/* Metadata chips */}
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <span className={`rounded px-1.5 py-0.5 text-xs ${priorityColor[detail.priority] || ''}`}>
              {detail.priority}
            </span>
            <Badge variant="outline" className="font-mono text-[10.5px] uppercase tracking-[0.06em]">
              {detail.sourceType}
            </Badge>
            {detail.issn && (
              <Badge variant="outline" className="font-mono text-[10.5px]">ISSN {detail.issn}</Badge>
            )}
            <Badge variant="outline" className="font-mono text-[10.5px] uppercase tracking-[0.06em]">
              连接器 {detail.connectorType ?? '—'} / {detail.connectorStatus}
            </Badge>
            {detail.pollPolicy && (
              <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                轮询 {detail.pollPolicy}
              </span>
            )}
          </div>

          {/* Sync / counts row */}
          <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[var(--border)] pt-4 sm:grid-cols-4">
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">论文数</div>
              <div className="mt-1 font-serif text-2xl font-bold">{detail.paperCount}</div>
            </div>
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">最近同步(终态)</div>
              <div className="mt-1 text-[13px]">
                {detail.lastSyncedAt ? new Date(detail.lastSyncedAt).toLocaleDateString('zh-CN') : '—'}
                {detail.lastRunStatus ? (
                  <span className={`ml-1 ${detail.lastRunStatus === 'error' ? 'text-red-600' : 'text-emerald-600'}`}>
                    ({detail.lastRunStatus})
                  </span>
                ) : null}
              </div>
              {detail.runningRun && (
                <div className="mt-1 flex items-center gap-1 text-[12px] text-blue-600">
                  <RefreshCw className="size-3 animate-spin" /> 正在同步…
                </div>
              )}
            </div>
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">上次新增/更新</div>
              <div className="mt-1 text-[13px]">
                {detail.lastRunInserted ?? 0} / {detail.lastRunUpdated ?? 0}
              </div>
            </div>
            <div>
              <div className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">子来源 / 别名</div>
              <div className="mt-1 text-[13px]">{detail.childCount} / {detail.aliasCount}</div>
            </div>
          </div>

          {reason && (
            <div className="mt-4 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <AlertTriangle className="size-4" /> {reason}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="mt-[40px] flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runSearch()}
            placeholder="搜索标题/摘要…"
            className="h-7 w-48 text-xs"
          />
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={runSearch}>
            <Search className="size-3.5" />
          </Button>
        </div>
        <Input type="date" value={from} onChange={(e) => { setPage(1); setFrom(e.target.value); }} className="h-7 w-36 text-xs" />
        <span className="text-xs text-[var(--muted-foreground)]">至</span>
        <Input type="date" value={to} onChange={(e) => { setPage(1); setTo(e.target.value); }} className="h-7 w-36 text-xs" />
        <Select value={hasAbstract || 'all'} onValueChange={(v) => { setPage(1); setHasAbstract(v === 'all' ? '' : v); }}>
          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">摘要</SelectItem>
            <SelectItem value="1">有摘要</SelectItem>
            <SelectItem value="0">无摘要</SelectItem>
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => { setPage(1); setNotInLibrary((v) => !v); }}
          className={`rounded-md border px-3 py-1.5 text-xs ${notInLibrary ? 'border-[var(--primary)] bg-[var(--primary)] text-white' : 'border-[var(--border)]'}`}
        >
          未加入书架
        </button>
        <Select value={order} onValueChange={(v) => { setPage(1); setOrder(v as 'latest' | 'recommend'); }}>
          <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="latest">最新优先</SelectItem>
            <SelectItem value="recommend">推荐优先</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Paper list */}
      <div className="mt-[14px] flex flex-col gap-[14px]">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
              <Skeleton className="mb-3 h-5 w-3/4" />
              <Skeleton className="mb-2 h-4 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ))
        ) : items.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>
                {hasActiveFilters ? '没有符合筛选条件的论文' : reason ? '该来源暂无论文' : '该来源还没有抓取到论文'}
              </EmptyTitle>
              <EmptyDescription>
                {hasActiveFilters
                  ? '试试放宽搜索、日期或筛选条件。'
                  : reason
                    ? reason
                    : '等待管理员触发一次同步后即可看到论文。'}
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          items.map((p) => (
            <div key={p.id} className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
              <button
                onClick={() => navigate(`/papers/${p.id}`)}
                className="text-left font-serif text-[17px] font-bold text-[var(--foreground)] hover:text-[var(--primary)]"
              >
                {p.title}
              </button>
              {p.authors && <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">{p.authors}</p>}
              {p.abstractText && (
                <p className="mt-2 line-clamp-3 text-[13.5px] leading-[1.6] text-[var(--muted-foreground)]">{p.abstractText}</p>
              )}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {p.publishedDate && (
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                    {new Date(p.publishedDate).toLocaleDateString('zh-CN')}
                  </span>
                )}
                {p.doi && (
                  <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">DOI {p.doi}</span>
                )}
                {p.readingState && (
                  <Badge variant="outline" className="font-mono text-[10.5px] uppercase tracking-[0.06em]">
                    {STATE_LABEL[p.readingState]}
                  </Badge>
                )}
                {p.isFavorite && <Star className="size-3.5 fill-[var(--primary)] text-[var(--primary)]" />}
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-[8px]" onClick={() => cycleState(p)}>
                  <BookOpen className="size-3.5" />
                  {p.readingState ? STATE_LABEL[p.readingState] : '设为待读'}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-xs rounded-[8px]" onClick={() => toggleFav(p)}>
                  <Star className={`size-3.5 ${p.isFavorite ? 'fill-[var(--primary)] text-[var(--primary)]' : ''}`} />
                  {p.isFavorite ? '已收藏' : '收藏'}
                </Button>
              </div>
            </div>
          ))
        )}
      </div>

      {!loading && totalPages > 1 && (
        <div className="mt-8">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page > 1) setPage(page - 1); }}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <PaginationItem key={p}>
                  <PaginationLink href="#" isActive={p === page} onClick={(e) => { e.preventDefault(); setPage(p); }}>
                    {p}
                  </PaginationLink>
                </PaginationItem>
              ))}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e) => { e.preventDefault(); if (page < totalPages) setPage(page + 1); }}
                  className={page >= totalPages ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
}
