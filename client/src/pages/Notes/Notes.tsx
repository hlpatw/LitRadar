import { useState, useEffect, useCallback, type FormEvent, type KeyboardEvent } from 'react';
import { toast } from 'sonner';
import { PlusIcon, Trash2Icon, StickyNoteIcon, XIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogBody,
  DialogClose,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from '@/components/ui/empty';
import { workspace, papers as papersApi } from '@/api';
import type { NoteItem, PaperItem, CreateNoteRequest, UpdateNoteRequest } from '@shared/api.interface';
import { trackNote } from '@/utils/events';

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
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState<string>('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    if (open) {
      setContent(initial?.content ?? '');
      setPaperId(initial?.paperId ?? '');
      setTags(initial?.tags ?? []);
      setTagInput('');
      setFieldError(null);
    }
  }, [open, initial]);

  const addTag = () => {
    const t = tagInput.trim().replace(/,+$/, '');
    if (!t) return;
    if (tags.includes(t)) {
      setTagInput('');
      return;
    }
    if (tags.length >= 8) {
      setFieldError('最多 8 个标签');
      return;
    }
    setTags([...tags, t]);
    setTagInput('');
    setFieldError(null);
  };

  const onTagKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    } else if (e.key === 'Backspace' && !tagInput && tags.length) {
      setTags(tags.slice(0, -1));
    }
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!content.trim()) {
      setFieldError('请输入笔记内容');
      return;
    }
    setSaving(true);
    try {
      await onSave({
        content: content.trim(),
        paperId: paperId || undefined,
        tags,
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

  // NOTE: this component renders ONLY DialogContent. The Radix Dialog Root lives in the
  // parent (<Notes/>) so the "新建笔记" button can be a real DialogTrigger and Radix can
  // return focus to the invoking New/Edit element on close. Escape-to-close + focus-trap
  // are provided by the shared dialog primitives.
  return (
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>{isEdit ? '编辑笔记' : '新建笔记'}</DialogTitle>
        <DialogDescription>
          {isEdit ? '修改笔记内容与关联论文' : '记下你的研究灵感'}
        </DialogDescription>
      </DialogHeader>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col gap-0">
        <DialogBody>
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground">
                内容
              </label>
              <Textarea
                value={content}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => {
                  setContent(e.target.value);
                  if (fieldError) setFieldError(null);
                }}
                placeholder="写点想法…"
                rows={5}
                required
                autoFocus
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
                标签
              </label>
              <div className="flex flex-wrap items-center gap-1.5 rounded-[8px] border border-[var(--border)] px-2 py-1.5">
                {tags.map((t) => (
                  <span key={t} className="inline-flex items-center gap-1 rounded-[6px] bg-[var(--accent)] px-2 py-0.5 text-[12px] text-[var(--accent-foreground)]">
                    {t}
                    <button type="button" onClick={() => setTags(tags.filter((x) => x !== t))} className="opacity-60 hover:opacity-100">
                      <XIcon className="size-3" />
                    </button>
                  </span>
                ))}
                <Input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={onTagKey}
                  onBlur={addTag}
                  placeholder={tags.length ? '继续添加…' : '输入后回车添加标签'}
                  className="h-7 flex-1 border-0 shadow-none focus-visible:ring-0"
                />
              </div>
              {fieldError && (
                <p className="text-[12px] text-destructive">{fieldError}</p>
              )}
            </div>
          </div>
        </DialogBody>
        <DialogFooter className="mt-4 shrink-0 border-t border-[var(--border)] pt-4">
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
    // Note event fires ONLY on successful create; never sends content/tags (only paperId).
    trackNote(data.paperId ?? null);
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

  // Open the editor for an existing note. The card is a focusable element (role=button,
  // tabIndex=0) so it receives focus on click/keyboard open and Radix returns focus to it
  // when the dialog closes.
  const openEditorFor = (note: NoteItem) => {
    setEditingNote(note);
    setFormOpen(true);
  };

  if (error && notes.length === 0) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground text-[14.5px]">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Single Radix Dialog Root for the create/edit note form. The New button is a real
          DialogTrigger; opening a card sets the same controlled `formOpen`. Radix provides
          ESC-to-close, focus-trap, and return-focus to the invoking trigger/card. */}
      <Dialog
        open={formOpen}
        onOpenChange={(v: boolean) => {
          // Controlled Radix Root: the real <DialogTrigger> (New button) fires onOpenChange(true),
          // so we must honor v=true to actually open. v=false (ESC / overlay / DialogClose /
          // after-save onClose) closes and resets the editing target. Opening via a note card sets
          // formOpen=true directly; closing always funnels back through here.
          setFormOpen(v);
          if (!v) setEditingNote(null);
        }}
      >
        <div>
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground">
              笔记
            </h1>
            <DialogTrigger asChild>
              <Button
                size="sm"
                className="rounded-[8px]"
                onClick={() => setEditingNote(null)}
              >
                <PlusIcon className="size-4" />
                新建笔记
              </Button>
            </DialogTrigger>
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
                  role="button"
                  tabIndex={0}
                  aria-label={`编辑笔记：${note.content.slice(0, 40)}`}
                  className="group cursor-pointer rounded-[10px] border border-border bg-card p-[22px_24px] transition-colors hover:border-primary/40"
                  onClick={() => openEditorFor(note)}
                  onKeyDown={(e: KeyboardEvent<HTMLDivElement>) => {
                    // Only activate when the card itself (not a nested control such as the
                    // trash button or paper link) holds focus; those handle their own keys.
                    if (e.target !== e.currentTarget) return;
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openEditorFor(note);
                    }
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
                      <a
                        href={`/papers/${note.paper.id}`}
                        onClick={(e: React.MouseEvent) => {
                          e.stopPropagation();
                        }}
                        className="truncate text-primary hover:underline"
                      >
                        📄 {note.paper.title}
                      </a>
                    )}
                    <span className="shrink-0">
                      {formatDate(note.updatedAt)}
                    </span>
                  </div>
                  {note.tags && note.tags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {note.tags.map((t) => (
                        <span key={t} className="rounded-[6px] bg-[var(--accent)] px-1.5 py-0.5 text-[11px] text-[var(--accent-foreground)]">
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
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
        </div>
      </Dialog>

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
    </>
  );
}
