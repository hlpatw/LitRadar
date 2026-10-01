import { useEffect, useState, useMemo } from 'react';
import type { JournalItem } from '@shared/api.interface';
import { journals } from '@client/src/api';
import { Skeleton } from '@client/src/components/ui/skeleton';
import { BookOpen } from 'lucide-react';
import { Link as UniversalLink } from 'react-router-dom';

/* ------------------------------------------------------------------ */
/*  Constants                                                         */
/* ------------------------------------------------------------------ */

type PriorityFilter = 'ALL' | JournalItem['priority'];

const PRIORITY_FILTERS: { key: PriorityFilter; label: string }[] = [
  { key: 'ALL', label: '全部' },
  { key: 'P0', label: 'P0' },
  { key: 'P1', label: 'P1' },
  { key: 'P2', label: 'P2' },
  { key: 'P3', label: 'P3' },
];

const PRIORITY_ORDER: JournalItem['priority'][] = ['P0', 'P1', 'P2', 'P3'];

const PRIORITY_SECTION_TITLE: Record<JournalItem['priority'], string> = {
  P0: 'P0 · 必须每周追踪',
  P1: 'P1 · 强相关',
  P2: 'P2 · 相邻',
  P3: 'P3 · 交叉雷达',
};

const SOURCE_TYPE_LABEL: Record<JournalItem['sourceType'], string> = {
  journal: 'JOURNAL',
  conference: 'CONFERENCE',
  proceedings: 'PROCEEDINGS',
  preprint: 'PREPRINT',
};

function sourceTypeBadgeClass(type: JournalItem['sourceType']): string {
  switch (type) {
    case 'journal':
      return 'bg-accent text-accent-foreground';
    case 'conference':
      return 'bg-warning/10 text-warning';
    case 'preprint':
    case 'proceedings':
    default:
      return 'bg-muted text-muted-foreground';
  }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function JournalCard({ journal }: { journal: JournalItem }) {
  return (
    <article className="bg-[var(--card)] rounded-[10px] border border-[var(--border)] p-[22px_24px] flex flex-col gap-3 hover:border-primary/30 transition-colors">
      <span
        className={`inline-flex self-start rounded-full px-2 py-0.5 font-mono text-[10.5px] leading-[1.4] tracking-[0.06em] uppercase ${sourceTypeBadgeClass(journal.sourceType)}`}
      >
        {SOURCE_TYPE_LABEL[journal.sourceType]}
      </span>

      <h3 className="font-semibold text-[15px] leading-[1.6] text-foreground">
        {journal.name}
      </h3>

      {journal.description && (
        <p className="text-[14.5px] leading-[1.6] text-muted-foreground line-clamp-3">
          {journal.description}
        </p>
      )}

      <div className="mt-auto flex flex-col gap-1 text-[14.5px] leading-[1.6]">
        {journal.url && (
          <UniversalLink
            to={journal.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary truncate hover:underline"
          >
            {journal.url}
          </UniversalLink>
        )}
        {journal.updateFrequency && (
          <span className="text-[13px] text-muted-foreground">
            {journal.updateFrequency}
          </span>
        )}
      </div>
    </article>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[14px]">
      {Array.from({ length: 6 }).map((_, i: number) => (
        <div
          key={i}
          className="bg-[var(--card)] rounded-[10px] border border-[var(--border)] p-[22px_24px] flex flex-col gap-3"
        >
          <Skeleton className="h-[22px] w-20 rounded-full" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                              */
/* ------------------------------------------------------------------ */

export default function JournalsPage() {
  const [data, setData] = useState<JournalItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<PriorityFilter>('ALL');

  useEffect(() => {
    let cancelled: boolean = false;
    setLoading(true);
    setError(null);

    journals
      .getJournals()
      .then((result: JournalItem[]) => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg: string =
            err instanceof Error ? err.message : '加载失败，请稍后重试';
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const filtered: JournalItem[] = useMemo(() => {
    if (filter === 'ALL') return data;
    return data.filter((j: JournalItem) => j.priority === filter);
  }, [data, filter]);

  const grouped: { priority: JournalItem['priority']; items: JournalItem[] }[] =
    useMemo(() => {
      const groups: Record<string, JournalItem[]> = {};
      for (const j of filtered) {
        (groups[j.priority] ??= []).push(j);
      }
      return PRIORITY_ORDER
        .filter((p: JournalItem['priority']) => groups[p]?.length)
        .map((p: JournalItem['priority']) => ({
          priority: p,
          items: groups[p],
        }));
    }, [filtered]);

  /* ---- Error ----------------------------------------------------- */
  if (error) {
    return (
      <div>
        <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground">
          期刊与会议
        </h1>
        <div className="mt-10 text-center">
          <p className="text-[14.5px] leading-[1.6] text-muted-foreground">
            {error}
          </p>
        </div>
      </div>
    );
  }

  /* ---- Main ------------------------------------------------------ */
  return (
    <div>
      <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground max-sm:text-[32px]">
        期刊与会议
      </h1>

      {/* Priority filter tabs */}
      <div className="mt-10 flex flex-wrap gap-2">
        {PRIORITY_FILTERS.map(
          (p: { key: PriorityFilter; label: string }) => (
            <button
              key={p.key}
              type="button"
              onClick={() => setFilter(p.key)}
              className={`rounded-md px-4 py-1.5 text-[13px] font-medium transition-colors ${
                filter === p.key
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              }`}
            >
              {p.label}
            </button>
          ),
        )}
      </div>

      {/* Loading */}
      {loading && (
        <div className="mt-10">
          <SkeletonGrid />
        </div>
      )}

      {/* Empty */}
      {!loading && filtered.length === 0 && (
        <div className="mt-10 flex flex-col items-center justify-center gap-3 py-20 text-center">
          <BookOpen className="size-10 text-muted-foreground" />
          <p className="text-[14.5px] leading-[1.6] text-muted-foreground">
            暂无期刊数据
          </p>
        </div>
      )}

      {/* Grouped sections */}
      {!loading &&
        grouped.map(
          ({
            priority,
            items,
          }: {
            priority: JournalItem['priority'];
            items: JournalItem[];
          }) => (
            <section key={priority} className="mt-10">
              <h2 className="font-serif text-[24px] leading-[1.4] tracking-[-0.005em] font-bold text-foreground max-sm:text-[20px]">
                {PRIORITY_SECTION_TITLE[priority]}
              </h2>
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[14px]">
                {items.map((j: JournalItem) => (
                  <JournalCard key={j.id} journal={j} />
                ))}
              </div>
            </section>
          ),
        )}
    </div>
  );
}