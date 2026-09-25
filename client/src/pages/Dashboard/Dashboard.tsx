import React from 'react';
import * as api from '@client/src/api';
import type { DashboardStats } from '@shared/api.interface';
import {
  Library,
  FileText,
  Star,
  CheckSquare,
  CheckCircle2,
  StickyNote,
} from 'lucide-react';

interface StatCardProps {
  label: string;
  value: number;
  icon: React.ReactNode;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, icon }) => (
  <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
    <div className="mb-3 flex items-center justify-between">
      <span className="font-mono text-[10.5px] leading-[1.4] tracking-[0.06em] uppercase text-[var(--muted-foreground)]">
        {label}
      </span>
      <span className="text-[var(--muted-foreground)]">{icon}</span>
    </div>
    <div className="font-serif text-[42px] font-bold leading-[1.06] -tracking-[0.015em] text-[var(--primary)]">
      {value}
    </div>
  </div>
);

const SkeletonCard: React.FC = () => (
  <div className="animate-pulse rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
    <div className="mb-3 flex items-center justify-between">
      <div className="h-3 w-20 rounded bg-[var(--border)]" />
      <div className="h-5 w-5 rounded bg-[var(--border)]" />
    </div>
    <div className="mt-1 h-10 w-16 rounded bg-[var(--border)]" />
  </div>
);

const CARD_DEFS: {
  key: keyof DashboardStats;
  label: string;
  icon: React.ReactNode;
}[] = [
  { key: 'journalCount', label: '期刊源', icon: <Library size={18} /> },
  { key: 'paperCount', label: '论文', icon: <FileText size={18} /> },
  { key: 'favoriteCount', label: '收藏', icon: <Star size={18} /> },
  { key: 'checklistTodoCount', label: '待读', icon: <CheckSquare size={18} /> },
  { key: 'checklistDoneCount', label: '已读', icon: <CheckCircle2 size={18} /> },
  { key: 'noteCount', label: '笔记', icon: <StickyNote size={18} /> },
];

const Dashboard: React.FC = () => {
  const [stats, setStats] = React.useState<DashboardStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.workspace
      .getDashboard()
      .then((data: DashboardStats) => {
        setStats(data);
        setLoading(false);
      })
      .catch((err: unknown) => {
        const message: string =
          err instanceof Error ? err.message : '加载失败';
        setError(message);
        setLoading(false);
      });
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-[1080px] px-8 py-7">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <p className="text-[14.5px] leading-[1.6] text-[var(--muted-foreground)]">
            数据加载失败：{error}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1080px] px-8 py-7">
      <h1
        className="font-serif text-[42px] font-bold leading-[1.06] -tracking-[0.015em] text-[var(--foreground)]"
        style={{ fontFamily: 'Charter, Georgia, PingFang SC, serif' }}
      >
        Dashboard
      </h1>

      <section className="mt-10">
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2 md:grid-cols-4">
          {loading
            ? Array.from({ length: 6 }).map((_, i: number) => (
                <SkeletonCard key={i} />
              ))
            : CARD_DEFS.map((def) => (
                <StatCard
                  key={def.key}
                  label={def.label}
                  value={stats ? (stats[def.key] as number) : 0}
                  icon={def.icon}
                />
              ))}
        </div>
      </section>

      <section className="mt-10">
        <div className="rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
          <h2
            className="mb-2 font-serif text-[24px] font-bold leading-[1.4] -tracking-[0.005em] text-[var(--foreground)]"
            style={{ fontFamily: 'Charter, Georgia, PingFang SC, serif' }}
          >
            欢迎回来
          </h2>
          <p className="text-[14.5px] leading-[1.6] text-[var(--muted-foreground)]">
            这里是你个人文献追踪工作台的概览。你可以在此快速了解期刊源、论文、收藏、阅读清单与笔记的整体状态。点击左侧导航进入各模块进行详细管理。
          </p>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;