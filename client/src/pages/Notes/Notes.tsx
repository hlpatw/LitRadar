import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import { PlusIcon, Trash2Icon, StickyNoteIcon } from 'lucide-react';

import { Button } from '@client/src/components/ui/button';
import { Textarea } from '@client/src/components/ui/textarea';
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
import { Spinner } from '@client/src/components/ui/spinner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@client/src/components/ui/empty';
import { workspace, papers as papersApi } from '@client/src/api';
import type { NoteItem, PaperItem, CreateNoteRequest, UpdateNoteRequest } from '@shared/api.interface';

function NoteForm({
  open,
  onClose,
  onSave,
  papers,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSave: (data: CreateNoteRequest | UpdateNoteRequest) => Promise<void>;
  papers: PaperItem[];
  initial?: NoteItem;
}) {
  const [content, setContent] = useState<string>('');
  const [paperId, setPaperId] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setContent(initial?.content ?? '');
      setPaperId(initial?.paperId ?? '');
    }
  }, [open, initial]);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      toast.error('请输入笔记内容');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        content: content.trim(),
        paperId: paperId || undefined,
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
          <DialogTitle>{isEdit ? '编辑笔记' : '新建笔记'}</DialogTitle>
          <DialogDescription>
            {isEdit ? '修改笔记内容与关联论文' : '记下你的研究灵感'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground">
                内容
              </label>
              <Textarea
                value={content}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                  setContent(e.target.value)
                }
                placeholder="写点想法…"
                rows={4}
                required
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
          </div>
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="outline" type="button">
                取消
              </Button>
            </DialogClose>
            <Button type="submit" disabled={saving}>
              {saving ? <Spinner className="mr-1" /> : null}
              {isEdit ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function formatDate(iso: string): string {
  const d: Date = new Date(iso);
  const y: number = d.getFullYear();
  const m: number = d.getMonth() + 1;
  const day: number = d.getDate();
  return `${y}年${m}月${day}日`;
}

export default function Notes() {
  const [notes, setNotes] = useState<NoteItem[]>([]);
  const [papers, setPapers] = useState<PaperItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const [formOpen, setFormOpen] = useState<boolean>(false);
  const [editingNote, setEditingNote] = useState<NoteItem | null>(null);
  const [deletingNote, setDeletingNote] = useState<NoteItem | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [notesData, papersData] = await Promise.all([
        workspace.getNotes(),
        papersApi.getPapers({ pageSize: 500 }),
      ]);
      setNotes(notesData);
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

  const handleCreate = async (data: CreateNoteRequest): Promise<void> => {
    await workspace.createNote(data);
    toast.success('笔记已创建');
    await fetchData();
  };

  const handleUpdate = async (
    id: string,
    data: UpdateNoteRequest,
  ): Promise<void> => {
    await workspace.updateNote(id, data);
    toast.success('笔记已更新');
    await fetchData();
  };

  const handleDelete = async () => {
    if (!deletingNote) return;
    try {
      await workspace.deleteNote(deletingNote.id);
      toast.success('笔记已删除');
      setDeletingNote(null);
      await fetchData();
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '删除失败';
      toast.error(message);
    }
  };

  if (error && notes.length === 0) {
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
          笔记
        </h1>
        <Button
          size="sm"
          className="rounded-[8px]"
          onClick={() => {
            setEditingNote(null);
            setFormOpen(true);
          }}
        >
          <PlusIcon className="size-4" />
          新建笔记
        </Button>
      </div>

      {loading && notes.length === 0 ? (
        <div className="mt-[40px] flex items-center justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : notes.length === 0 ? (
        <div className="mt-[40px]">
          <Empty>
            <EmptyHeader>
              <StickyNoteIcon className="size-8 text-muted-foreground" />
              <EmptyTitle>暂无笔记</EmptyTitle>
              <EmptyDescription>暂无笔记，写一条吧</EmptyDescription>
            </EmptyHeader>
          </Empty>
        </div>
      ) : (
        <div className="mt-[40px] grid grid-cols-1 gap-[14px] md:grid-cols-2">
          {notes.map((note: NoteItem) => (
            <div
              key={note.id}
              className="group cursor-pointer rounded-[10px] border border-border bg-card p-[22px_24px] transition-colors hover:border-primary/40"
              onClick={() => {
                setEditingNote(note);
                setFormOpen(true);
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <p className="min-w-0 flex-1 text-[14.5px] leading-[1.6] text-foreground line-clamp-3 whitespace-pre-wrap">
                  {note.content}
                </p>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 shrink-0 opacity-0 transition-opacity group-hover:opacity-100"
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setDeletingNote(note);
                  }}
                >
                  <Trash2Icon className="size-3.5 text-destructive" />
                </Button>
              </div>
              <div className="mt-3 flex items-center gap-3 text-[11.5px] text-muted-foreground">
                {note.paper && (
                  <span className="truncate">📄 {note.paper.title}</span>
                )}
                <span className="shrink-0">
                  {formatDate(note.updatedAt)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <NoteForm
        open={formOpen}
        onClose={() => {
          setFormOpen(false);
          setEditingNote(null);
        }}
        onSave={async (
          data: CreateNoteRequest | UpdateNoteRequest,
        ) => {
          if (editingNote) {
            await handleUpdate(editingNote.id, data);
          } else {
            await handleCreate(data as CreateNoteRequest);
          }
        }}
        papers={papers}
        initial={editingNote ?? undefined}
      />

      <AlertDialog
        open={!!deletingNote}
        onOpenChange={(v: boolean) => {
          if (!v) setDeletingNote(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除这条笔记吗？此操作不可撤销。
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