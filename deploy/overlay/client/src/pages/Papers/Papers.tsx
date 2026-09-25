import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Star, Search, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '../../utils/logger';
import { journals, papers, workspace } from '@/api';
import type {
  JournalItem,
  PaperItem,
  FavoriteItem,
  PaginatedResponse,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty,
  EmptyContent,
  EmptyTitle,
  EmptyDescription,
} from '@/components/ui/empty';
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
  PaginationPrevious,
  PaginationNext,
} from '@/components/ui/pagination';

const PAGE_SIZE = 10;

const Papers: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const journalId: string = searchParams.get('journalId') || '';
  const search: string = searchParams.get('search') || '';
  const page: number = parseInt(searchParams.get('page') || '1', 10);

  const [searchInput, setSearchInput] = React.useState<string>(search);
  const [journalsList, setJournalsList] = React.useState<JournalItem[]>([]);
  const [papersData, setPapersData] =
    React.useState<PaginatedResponse<PaperItem> | null>(null);
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [togglingIds, setTogglingIds] = React.useState<Set<string>>(new Set());
  const [createOpen, setCreateOpen] = React.useState<boolean>(false);
  const [createForm, setCreateForm] = React.useState({
    title: '',
    journalId: '',
    authors: '',
    doi: '',
    keywords: '',
    abstractText: '',
    methods: '',
    conclusions: '',
    url: '',
  });
  const [creating, setCreating] = React.useState<boolean>(false);

  React.useEffect(() => {
    setSearchInput(search);
  }, [search]);

  React.useEffect(() => {
    journals
      .getJournals()
      .then((data: JournalItem[]) => setJournalsList(data))
      .catch((err: unknown) => logger.error('获取期刊列表失败', err));
  }, []);

  React.useEffect(() => {
    workspace
      .getFavorites()
      .then((data: FavoriteItem[]) => setFavorites(data))
      .catch((err: unknown) => logger.error('获取收藏列表失败', err));
  }, []);

  React.useEffect(() => {
    setLoading(true);
    setError(null);
    papers
      .getPapers({
        journalId: journalId || undefined,
        search: search || undefined,
        page,
        pageSize: PAGE_SIZE,
      })
      .then((data: PaginatedResponse<PaperItem>) => {
        setPapersData(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        logger.error('获取论文列表失败', err);
        setError('加载论文列表失败，请稍后重试');
        setLoading(false);
      });
  }, [journalId, search, page]);

  const updateParams = (updates: Record<string, string>): void => {
    const next: URLSearchParams = new URLSearchParams(searchParams);
    Object.entries(updates).forEach(([k, v]: [string, string]) => {
      if (v) next.set(k, v);
      else next.delete(k);
    });
    if (!('page' in updates)) next.delete('page');
    setSearchParams(next);
  };

  const handleSearch = (): void => {
    updateParams({ search: searchInput });
  };

  const handleJournalChange = (value: string): void => {
    updateParams({ journalId: value });
  };

  const totalPages: number = papersData
    ? Math.ceil(papersData.total / PAGE_SIZE)
    : 0;

  const favoriteSet: Set<string> = new Set(
    favorites.map((f: FavoriteItem) => f.paperId),
  );

  const toggleFavorite = async (
    paperId: string,
    isFav: boolean,
  ): Promise<void> => {
    setTogglingIds((prev: Set<string>) => new Set(prev).add(paperId));
    try {
      if (isFav) {
        await workspace.removeFavorite(paperId);
        setFavorites((prev: FavoriteItem[]) =>
          prev.filter((f: FavoriteItem) => f.paperId !== paperId),
        );
        toast.success('已取消收藏');
      } else {
        await workspace.addFavorite(paperId);
        const updated: FavoriteItem[] = await workspace.getFavorites();
        setFavorites(updated);
        toast.success('已加入收藏');
      }
    } catch (err: unknown) {
      logger.error('收藏操作失败', err);
      toast.error(isFav ? '取消收藏失败' : '收藏失败');
    } finally {
      setTogglingIds((prev: Set<string>) => {
        const next: Set<string> = new Set(prev);
        next.delete(paperId);
        return next;
      });
    }
  };

  return (
    <div className="mx-auto my-[28px] max-w-[1080px] px-8 max-sm:px-4">
      <h1 className="font-serif text-[42px] font-bold leading-[1.06] tracking-[-0.015em] max-sm:text-[32px]">
        论文浏览
      </h1>

      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Select value={journalId} onValueChange={handleJournalChange}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="全部期刊" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">全部期刊</SelectItem>
            {journalsList.map((j: JournalItem) => (
              <SelectItem key={j.id} value={j.id}>
                {j.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input
          placeholder="搜索论文标题或关键词..."
          value={searchInput}
          onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
            setSearchInput(e.target.value)
          }
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleSearch();
          }}
          className="w-[280px]"
        />
        <Button onClick={handleSearch} className="rounded-[8px]">
          <Search className="size-4" />
          搜索
        </Button>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-[8px]">
              <Plus className="size-4" />
              创建论文
            </Button>
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] max-w-2xl overflow-auto">
            <DialogHeader>
              <DialogTitle className="font-serif text-2xl">
                创建论文
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>标题 *</Label>
                <Input
                  value={createForm.title}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCreateForm((f) => ({ ...f, title: e.target.value }))
                  }
                  placeholder="论文标题"
                />
              </div>
              <div>
                <Label>期刊</Label>
                <Select
                  value={createForm.journalId}
                  onValueChange={(v: string) =>
                    setCreateForm((f) => ({ ...f, journalId: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择期刊（可选）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">无</SelectItem>
                    {journalsList.map((j: JournalItem) => (
                      <SelectItem key={j.id} value={j.id}>
                        {j.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>作者</Label>
                <Input
                  value={createForm.authors}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCreateForm((f) => ({ ...f, authors: e.target.value }))
                  }
                  placeholder="作者姓名，逗号分隔"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>DOI</Label>
                  <Input
                    value={createForm.doi}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCreateForm((f) => ({ ...f, doi: e.target.value }))
                    }
                    placeholder="10.xxxx/xxxx"
                  />
                </div>
                <div>
                  <Label>原文链接</Label>
                  <Input
                    value={createForm.url}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      setCreateForm((f) => ({ ...f, url: e.target.value }))
                    }
                    placeholder="https://..."
                  />
                </div>
              </div>
              <div>
                <Label>关键词</Label>
                <Input
                  value={createForm.keywords}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setCreateForm((f) => ({ ...f, keywords: e.target.value }))
                  }
                  placeholder="逗号分隔"
                />
              </div>
              <div>
                <Label>摘要</Label>
                <Textarea
                  value={createForm.abstractText}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setCreateForm((f) => ({
                      ...f,
                      abstractText: e.target.value,
                    }))
                  }
                  placeholder="论文摘要"
                  rows={4}
                />
              </div>
              <div>
                <Label>实验方法</Label>
                <Textarea
                  value={createForm.methods}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setCreateForm((f) => ({
                      ...f,
                      methods: e.target.value,
                    }))
                  }
                  placeholder="实验设计、被试、流程等"
                  rows={3}
                />
              </div>
              <div>
                <Label>结论</Label>
                <Textarea
                  value={createForm.conclusions}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setCreateForm((f) => ({
                      ...f,
                      conclusions: e.target.value,
                    }))
                  }
                  placeholder="主要发现与结论"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button
                variant="outline"
                onClick={() => setCreateOpen(false)}
              >
                取消
              </Button>
              <Button
                disabled={!createForm.title.trim() || creating}
                onClick={async () => {
                  if (!createForm.title.trim()) return;
                  setCreating(true);
                  try {
                    await papers.createPaper({
                      title: createForm.title.trim(),
                      journalId: createForm.journalId || undefined,
                      authors: createForm.authors || undefined,
                      doi: createForm.doi || undefined,
                      keywords: createForm.keywords || undefined,
                      abstractText: createForm.abstractText || undefined,
                      methods: createForm.methods || undefined,
                      conclusions: createForm.conclusions || undefined,
                      url: createForm.url || undefined,
                    });
                    toast.success('论文已创建');
                    setCreateOpen(false);
                    setCreateForm({
                      title: '',
                      journalId: '',
                      authors: '',
                      doi: '',
                      keywords: '',
                      abstractText: '',
                      methods: '',
                      conclusions: '',
                      url: '',
                    });
                    const data: PaginatedResponse<PaperItem> =
                      await papers.getPapers({
                        journalId: journalId || undefined,
                        search: search || undefined,
                        page: 1,
                        pageSize: PAGE_SIZE,
                      });
                    setPapersData(data);
                  } catch (err: unknown) {
                    logger.error('创建论文失败', err);
                    toast.error('创建论文失败');
                  } finally {
                    setCreating(false);
                  }
                }}
              >
                {creating ? '创建中...' : '创建'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="mt-10 space-y-3">
        {loading &&
          Array.from({ length: 3 }).map((_, i: number) => (
            <div
              key={i}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]"
            >
              <Skeleton className="mb-3 h-6 w-3/4" />
              <Skeleton className="mb-2 h-4 w-1/2" />
              <Skeleton className="h-4 w-1/4" />
            </div>
          ))}

        {error && (
          <div className="py-10 text-center text-[var(--muted-foreground)]">
            {error}
          </div>
        )}

        {!loading &&
          !error &&
          (!papersData || papersData.items.length === 0) && (
            <Empty className="border-[var(--border)]">
              <EmptyContent>
                <EmptyTitle>暂无论文</EmptyTitle>
                <EmptyDescription>请先添加论文</EmptyDescription>
              </EmptyContent>
            </Empty>
          )}

        {!loading &&
          !error &&
          papersData &&
          papersData.items.map((paper: PaperItem) => {
            const isFav: boolean = favoriteSet.has(paper.id);
            const isToggling: boolean = togglingIds.has(paper.id);
            return (
              <div
                key={paper.id}
                className="flex items-start justify-between gap-4 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px] transition-colors hover:border-[var(--primary)]"
              >
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => navigate(`/papers/${paper.id}`)}
                    className="cursor-pointer border-none bg-transparent p-0 text-left font-serif text-[17px] font-bold text-[var(--foreground)] transition-colors hover:text-[var(--primary)]"
                  >
                    {paper.title}
                  </button>
                  {paper.authors && (
                    <p className="mt-1 text-[13px] text-[var(--muted-foreground)]">
                      {paper.authors}
                    </p>
                  )}
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    {paper.keywords &&
                      paper.keywords.split(',').map((kw: string) => (
                        <Badge
                          key={kw.trim()}
                          variant="secondary"
                          className="font-mono text-[10.5px] uppercase tracking-[0.06em]"
                        >
                          {kw.trim()}
                        </Badge>
                      ))}
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    {paper.doi && (
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                        DOI: {paper.doi}
                      </span>
                    )}
                    {paper.publishedDate && (
                      <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
                        {new Date(paper.publishedDate).toLocaleDateString(
                          'zh-CN',
                        )}
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => toggleFavorite(paper.id, isFav)}
                  disabled={isToggling}
                  className="mt-1 shrink-0 cursor-pointer rounded border-none bg-transparent p-1 transition-colors hover:bg-[var(--accent)]"
                  aria-label={isFav ? '取消收藏' : '收藏'}
                >
                  {isToggling ? (
                    <Spinner className="size-5" />
                  ) : (
                    <Star
                      className={`size-5 ${
                        isFav
                          ? 'fill-[var(--primary)] text-[var(--primary)]'
                          : 'text-[var(--muted-foreground)]'
                      }`}
                    />
                  )}
                </button>
              </div>
            );
          })}
      </div>

      {!loading && !error && totalPages > 1 && (
        <div className="mt-10">
          <Pagination>
            <PaginationContent>
              <PaginationItem>
                <PaginationPrevious
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    if (page > 1) updateParams({ page: String(page - 1) });
                  }}
                  className={page <= 1 ? 'pointer-events-none opacity-50' : ''}
                />
              </PaginationItem>
              {Array.from({ length: totalPages }, (_, i: number) => i + 1).map(
                (p: number) => (
                  <PaginationItem key={p}>
                    <PaginationLink
                      href="#"
                      isActive={p === page}
                      onClick={(e: React.MouseEvent) => {
                        e.preventDefault();
                        updateParams({ page: String(p) });
                      }}
                    >
                      {p}
                    </PaginationLink>
                  </PaginationItem>
                ),
              )}
              <PaginationItem>
                <PaginationNext
                  href="#"
                  onClick={(e: React.MouseEvent) => {
                    e.preventDefault();
                    if (page < totalPages)
                      updateParams({ page: String(page + 1) });
                  }}
                  className={
                    page >= totalPages ? 'pointer-events-none opacity-50' : ''
                  }
                />
              </PaginationItem>
            </PaginationContent>
          </Pagination>
        </div>
      )}
    </div>
  );
};

export default Papers;