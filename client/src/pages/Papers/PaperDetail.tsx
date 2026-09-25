import React from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Star, Pencil, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { logger } from '@lark-apaas/client-toolkit/logger';
import { papers, workspace } from '@/api';
import type {
  PaperDetail as PaperDetailType,
  FavoriteItem,
  UpdatePaperRequest,
} from '@shared/api.interface';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const PaperDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [paper, setPaper] = React.useState<PaperDetailType | null>(null);
  const [favorites, setFavorites] = React.useState<FavoriteItem[]>([]);
  const [loading, setLoading] = React.useState<boolean>(true);
  const [error, setError] = React.useState<string | null>(null);
  const [togglingFav, setTogglingFav] = React.useState<boolean>(false);

  // Edit dialog
  const [editOpen, setEditOpen] = React.useState<boolean>(false);
  const [editForm, setEditForm] = React.useState({
    title: '',
    authors: '',
    doi: '',
    keywords: '',
    abstractText: '',
    methods: '',
    conclusions: '',
    url: '',
  });
  const [saving, setSaving] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    Promise.all([papers.getPaperDetail(id), workspace.getFavorites()])
      .then(
        ([paperData, favs]: [PaperDetailType, FavoriteItem[]]) => {
          setPaper(paperData);
          setFavorites(favs);
          setLoading(false);
        },
      )
      .catch((err: unknown) => {
        logger.error('获取论文详情失败', err);
        setError('论文不存在或加载失败');
        setLoading(false);
      });
  }, [id]);

  const isFav: boolean = paper
    ? favorites.some((f: FavoriteItem) => f.paperId === paper.id)
    : false;

  const toggleFavorite = async (): Promise<void> => {
    if (!paper) return;
    setTogglingFav(true);
    try {
      if (isFav) {
        await workspace.removeFavorite(paper.id);
        setFavorites((prev: FavoriteItem[]) =>
          prev.filter((f: FavoriteItem) => f.paperId !== paper.id),
        );
        toast.success('已取消收藏');
      } else {
        await workspace.addFavorite(paper.id);
        const updated: FavoriteItem[] = await workspace.getFavorites();
        setFavorites(updated);
        toast.success('已加入收藏');
      }
    } catch (err: unknown) {
      logger.error('收藏操作失败', err);
      toast.error(isFav ? '取消收藏失败' : '收藏失败');
    } finally {
      setTogglingFav(false);
    }
  };

  const openEditDialog = (): void => {
    if (!paper) return;
    setEditForm({
      title: paper.title || '',
      authors: paper.authors || '',
      doi: paper.doi || '',
      keywords: paper.keywords || '',
      abstractText: paper.abstractText || '',
      methods: paper.methods || '',
      conclusions: paper.conclusions || '',
      url: paper.url || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async (): Promise<void> => {
    if (!paper || !editForm.title.trim()) return;
    setSaving(true);
    try {
      const data: UpdatePaperRequest = {
        title: editForm.title.trim(),
        authors: editForm.authors || undefined,
        doi: editForm.doi || undefined,
        keywords: editForm.keywords || undefined,
        abstractText: editForm.abstractText || undefined,
        methods: editForm.methods || undefined,
        conclusions: editForm.conclusions || undefined,
        url: editForm.url || undefined,
      };
      const updated = await papers.updatePaper(paper.id, data);
      setPaper({ ...updated, journalName: paper.journalName });
      setEditOpen(false);
      toast.success('论文信息已更新');
    } catch (err: unknown) {
      logger.error('更新论文失败', err);
      toast.error('更新失败，请稍后重试');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (): Promise<void> => {
    if (!paper) return;
    try {
      await papers.deletePaper(paper.id);
      toast.success('论文已删除');
      navigate('/papers');
    } catch (err: unknown) {
      logger.error('删除论文失败', err);
      toast.error('删除失败，请稍后重试');
    }
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="mx-auto my-[28px] max-w-[1080px] px-8 max-sm:px-4">
        <Skeleton className="mb-6 h-5 w-24" />
        <Skeleton className="mb-4 h-[42px] w-3/4" />
        <Skeleton className="mb-2 h-4 w-1/2" />
        <div className="mt-10 space-y-3">
          {Array.from({ length: 3 }).map((_, i: number) => (
            <div
              key={i}
              className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]"
            >
              <Skeleton className="mb-3 h-5 w-1/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-4 w-5/6" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Error / 404
  if (error || !paper) {
    return (
      <div className="mx-auto my-[28px] max-w-[1080px] px-8 max-sm:px-4">
        <button
          type="button"
          onClick={() => navigate('/papers')}
          className="mb-6 inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[11.5px] uppercase tracking-[0.08em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
        >
          <ChevronLeft className="size-4" />
          返回列表
        </button>
        <div className="py-16 text-center text-[var(--muted-foreground)]">
          <p className="text-lg">论文不存在</p>
          <p className="mt-2 text-sm">
            该论文可能已被删除，或链接地址有误
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto my-[28px] max-w-[1080px] px-8 max-sm:px-4">
      {/* Back */}
      <button
        type="button"
        onClick={() => navigate(-1)}
        className="mb-6 inline-flex cursor-pointer items-center gap-1 border-none bg-transparent p-0 font-mono text-[11.5px] uppercase tracking-[0.08em] text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]"
      >
        <ChevronLeft className="size-4" />
        返回列表
      </button>

      {/* Title */}
      <h1 className="font-serif text-[42px] font-bold leading-[1.06] tracking-[-0.015em] max-sm:text-[32px]">
        {paper.title}
      </h1>

      {/* Meta row */}
      <div className="mt-5 flex flex-wrap items-center gap-4">
        {paper.journalName && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            {paper.journalName}
          </span>
        )}
        {paper.doi && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            DOI: {paper.doi}
          </span>
        )}
        {paper.publishedDate && (
          <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
            {new Date(paper.publishedDate).toLocaleDateString('zh-CN')}
          </span>
        )}
      </div>

      {/* Authors */}
      <p className="mt-4 text-[15px] leading-[1.6]">
        {paper.authors || '作者信息未提供'}
      </p>

      {/* Keywords */}
      <div className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        {paper.keywords ? (
          <div className="flex flex-wrap gap-2">
            {paper.keywords.split(',').map((kw: string) => (
              <Badge
                key={kw.trim()}
                variant="secondary"
                className="font-mono text-[10.5px] uppercase tracking-[0.06em]"
              >
                {kw.trim()}
              </Badge>
            ))}
          </div>
        ) : (
          <span className="text-[14.5px] leading-[1.6] text-[var(--muted-foreground)]">
            暂无关键词
          </span>
        )}
      </div>

      {/* Abstract */}
      <div className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <h2 className="font-serif text-[24px] font-bold leading-[1.4] tracking-[-0.005em] max-sm:text-[20px]">
          摘要
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--foreground)]">
          {paper.abstractText || '暂无摘要'}
        </p>
      </div>

      {/* Methods */}
      <div className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <h2 className="font-serif text-[24px] font-bold leading-[1.4] tracking-[-0.005em] max-sm:text-[20px]">
          实验方法
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--foreground)]">
          {paper.methods || '暂无实验方法描述'}
        </p>
      </div>

      {/* Conclusions */}
      <div className="mt-10 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <h2 className="font-serif text-[24px] font-bold leading-[1.4] tracking-[-0.005em] max-sm:text-[20px]">
          结论
        </h2>
        <p className="mt-3 text-[14.5px] leading-[1.6] text-[var(--foreground)]">
          {paper.conclusions || '暂无结论'}
        </p>
      </div>

      {/* Actions */}
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button
          onClick={toggleFavorite}
          disabled={togglingFav}
          variant="outline"
          className="rounded-[8px]"
        >
          {togglingFav ? (
            <Spinner className="size-4" />
          ) : (
            <Star
              className={`size-4 ${
                isFav ? 'fill-[var(--primary)] text-[var(--primary)]' : ''
              }`}
            />
          )}
          {isFav ? '已收藏' : '收藏'}
        </Button>
        <Button
          onClick={openEditDialog}
          variant="outline"
          className="rounded-[8px]"
        >
          <Pencil className="size-4" />
          编辑
        </Button>
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" className="rounded-[8px]">
              <Trash2 className="size-4" />
              删除
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除</AlertDialogTitle>
              <AlertDialogDescription>
                确定要删除论文「{paper.title}」吗？此操作不可撤销。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-destructive text-destructive-foreground"
              >
                确认删除
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑论文</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-title">标题 *</Label>
              <Input
                id="edit-title"
                value={editForm.title}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm({ ...editForm, title: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-authors">作者</Label>
              <Input
                id="edit-authors"
                value={editForm.authors}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm({ ...editForm, authors: e.target.value })
                }
                placeholder="多个作者用逗号分隔"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-doi">DOI</Label>
              <Input
                id="edit-doi"
                value={editForm.doi}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm({ ...editForm, doi: e.target.value })
                }
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-keywords">关键词</Label>
              <Input
                id="edit-keywords"
                value={editForm.keywords}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm({ ...editForm, keywords: e.target.value })
                }
                placeholder="多个关键词用逗号分隔"
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-abstract">摘要</Label>
              <Textarea
                id="edit-abstract"
                value={editForm.abstractText}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditForm({ ...editForm, abstractText: e.target.value })
                }
                rows={4}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-methods">实验方法</Label>
              <Textarea
                id="edit-methods"
                value={editForm.methods}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditForm({ ...editForm, methods: e.target.value })
                }
                rows={4}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-conclusions">结论</Label>
              <Textarea
                id="edit-conclusions"
                value={editForm.conclusions}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setEditForm({ ...editForm, conclusions: e.target.value })
                }
                rows={4}
                className="mt-1.5"
              />
            </div>
            <div>
              <Label htmlFor="edit-url">URL</Label>
              <Input
                id="edit-url"
                value={editForm.url}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setEditForm({ ...editForm, url: e.target.value })
                }
                placeholder="https://..."
                className="mt-1.5"
              />
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" className="rounded-[8px]">
                取消
              </Button>
            </DialogClose>
            <Button
              onClick={handleSaveEdit}
              disabled={saving || !editForm.title.trim()}
              className="rounded-[8px]"
            >
              {saving ? <Spinner className="size-4" /> : null}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default PaperDetailPage;