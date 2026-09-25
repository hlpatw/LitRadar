import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import {
  PlusIcon,
  PencilIcon,
  Trash2Icon,
  BookOpenIcon,
} from 'lucide-react';

import { Button } from '@client/src/components/ui/button';
import { Input } from '@client/src/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from '@client/src/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@client/src/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@client/src/components/ui/select';
import { Badge } from '@client/src/components/ui/badge';
import { Spinner } from '@client/src/components/ui/spinner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@client/src/components/ui/empty';
import { workspace, papers as papersApi } from '@client/src/api';
import type { ChecklistItem, PaperItem, CreateChecklistRequest, UpdateChecklistRequest } from '@shared/api.interface';

const STATUS_LABELS: Record<ChecklistItem['status'], string> = {
  todo: '待读',
  in_progress: '阅读中',
  done: '已读完',
};

const STATUS_OPTIONS: Array<{ value: ChecklistItem['status']; label: string }> = [
  { value: 'todo', label: '待读' },
  { value: 'in_progress', label: '阅读中' },
  { value: 'done', label: '已读完' },
];

const STATUS_BADGE_CLASS: Record<ChecklistItem['status'], string> = {
  todo: 'bg-muted text-muted-foreground border-muted-border',
  in_progress: 'bg-warning/10 text-warning border-warning/30',
  done: 'bg-success/10 text-success border-success/30',
};

const COLUMNS: Array<ChecklistItem['status']> = ['todo', 'in_progress', 'done'];

function ChecklistItemCard({
  item,
  papers,
  onStatusChange,
  onEdit,
  onDelete,
}: {
  item: ChecklistItem;
  papers: PaperItem[];
  onStatusChange: (id: string, status: ChecklistItem['status']) => void;
  onEdit: (item: ChecklistItem) => void;
  onDelete: (item: ChecklistItem) => void;
}) {
  const displayTitle: string = item.paper?.title ?? item.titleOverride ?? '未命名';
  const linkedPaper: PaperItem | null = item.paper;

  return (
    <div className="rounded-[10px] border border-border bg-card p-[22px_24px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] leading-[1.6] text-foreground break-words line-clamp-2">
            {displayTitle}
          </p>
          {linkedPaper && (
            <p className="mt-1 text-[11.5px] text-muted-foreground truncate">
              {linkedPaper.title}
            </p>
          )}
        </div>
        <Badge
          className={`shrink-0 ${STATUS_BADGE_CLASS[item.status]}`}
          variant="outline"
        >
          {STATUS_LABELS[item.status]}
        </Badge>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Select
          value={item.status}
          onValueChange={(v: string) =>
            onStatusChange(item.id, v as ChecklistItem['status'])
          }
        >
          <SelectTrigger size="sm" className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7"
          onClick={() => onEdit(item)}
        >
          <PencilIcon className="size-3.5" />
        </Button>
        <Button
          size="icon"
          variant="ghost"
          className="h-7 w-7 text-destructive hover:text-destructive"
          onClick={() => onDelete(item)}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function ChecklistForm({
  open,
  onClose,
  onSave,
  papers,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateChecklistRequest | UpdateChecklistRequest) => Promise<void>;
  papers: PaperItem[];
  initial?: ChecklistItem;
}) {
  const [titleOverride, setTitleOverride] = useState<string>('');
  const [paperId, setPaperId] = useState<string>('');
  const [status, setStatus] = useState<ChecklistItem['status']>('todo');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setTitleOverride(initial?.titleOverride ?? '');
      setPaperId(initial?.paperId ?? '');
      setStatus(initial?.status ?? 'todo');
    }
  }, [open, initial]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({
        titleOverride: titleOverride || undefined,
        paperId: paperId || undefined,
        status,
      });
      onClose();
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '操作失败';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  const isEdit: boolean = !!initial;

  return (
    <Dialog open={open} onOpenChange={(v: boolean) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? '编辑条目' : '添加到阅读清单'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改清单条目信息' : '添加一篇论文到阅读清单'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground">
                标题覆盖
              </label>
              <Input
                value={titleOverride}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  setTitleOverride(e.target.value)
                }
                placeholder="可选，留空则显示论文原标题"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground">
                关联论文
              </label>
              <Select value={paperId} onValueChange={setPaperId}>
                <SelectTrigger>
                  <SelectValue placeholder="选择论文（可选）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">不关联</SelectItem>
                  {papers.map((p: PaperItem) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground">
                状态
              </label>
              <Select
                value={status}
                onValueChange={(v: string) =>
                  setStatus(v as ChecklistItem['status'])
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="mr-1" /> : null}
              {isEdit ? '保存' : '添加'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export default function Checklist() {
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<ChecklistItem | null>(null);
  const [deletingItem, setDeletingItem] = useState<ChecklistItem | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [checklistData, papersData] = await Promise.all([
        workspace.getChecklist(),
        papersApi.getPapers({ pageSize: 500 }),
      ]);
      setItems(checklistData);
      setPapers(papersData.items);
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '加载失败';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreate = async (
    data: CreateChecklistRequest,
  ): Promise<void> => {
    await workspace.createChecklistItem(data);
    toast.success('已添加');
    await fetchData();
  };

  const handleUpdate = async (
    id: string,
    data: UpdateChecklistRequest,
  ): Promise<void> => {
    await workspace.updateChecklistItem(id, data);
    toast.success('已更新');
    await fetchData();
  };

  const handleStatusChange = async (
    id: string,
    status: ChecklistItem['status'],
  ) => {
    try {
      await workspace.updateChecklistItem(id, { status });
      setItems((prev: ChecklistItem[]) =>
        prev.map((it: ChecklistItem) =>
          it.id === id ? { ...it, status } : it,
        ),
      );
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '状态切换失败';
      toast.error(message);
    }
  };

  const handleDelete = async () => {
    if (!deletingItem) return;
    try {
      await workspace.deleteChecklistItem(deletingItem.id);
      toast.success('已删除');
      setDeletingItem(null);
      await fetchData();
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '删除失败';
      toast.error(message);
    }
  };

  const grouped = {
    todo: items.filter((it: ChecklistItem) => it.status === 'todo'),
    in_progress: items.filter((it: ChecklistItem) => it.status === 'in_progress'),
    done: items.filter((it: ChecklistItem) => it.status === 'done'),
  };

  if (error && items.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground text-[14.5px]">{error}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground">
          阅读清单
        </h1>
        <Button
          size="sm"
          className="rounded-[8px]"
          onClick={() => {
            setEditingItem(null);
            setFormOpen(true);
          }}
        >
          <PlusIcon className="size-4" />
          添加
        </Button>
      </div>

      {loading && items.length === 0 ? (
        <div className="mt-[40px] flex items-center justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : items.length === 0 ? (
        <div className="mt-[40px]">
          <Empty>
            <EmptyHeader>
              <BookOpenIcon className="size-8 text-muted-foreground" />
              <EmptyTitle>阅读清单位空</EmptyTitle>
              <EmptyDescription>
                添加论文到你的阅读清单，追踪阅读进度
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="mt-[40px] grid grid-cols-1 gap-[14px] md:grid-cols-3">
          {COLUMNS.map((col: ChecklistItem['status']) => (
            <section key={col}>
              <h2 className="font-serif text-[24px] leading-[1.4] tracking-[-0.005em] font-bold text-foreground">
                {STATUS_LABELS[col]}
                <span className="ml-2 text-sm text-muted-foreground">
                  {grouped[col].length}
                </span>
              </h2>
              <div className="mt-3 flex flex-col gap-[14px]">
                {grouped[col].map((item: ChecklistItem) => (
                  <ChecklistItemCard
                    key={item.id}
                    item={item}
                    papers={papers}
                    onStatusChange={handleStatusChange}
                    onEdit={(it: ChecklistItem) => {
                      setEditingItem(it);
                      setFormOpen(true);
                    }}
                    onDelete={setDeletingItem}
                  />
                ))}
                {grouped[col].length === 0 && (
                  <p className="py-6 text-center text-[13px] text-muted-foreground">
                    暂无
                  </p>
                )}
              </div>
            </section>
          ))}
        </div>
      )}

      <ChecklistForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingItem(null);
        }}
        onSave={async (
          data: CreateChecklistRequest | UpdateChecklistRequest,
        ) => {
          if (editingItem) {
            await handleUpdate(editingItem.id, data);
          } else {
            await handleCreate(data);
          }
        }}
        papers={papers}
        initial={editingItem ?? undefined}
      />

      <AlertDialog
        open={!!deletingItem}
        onOpenChange={(v: boolean) => {
          if (!v) setDeletingItem(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条阅读清单条目吗？此操作不可撤销。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>删除</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}