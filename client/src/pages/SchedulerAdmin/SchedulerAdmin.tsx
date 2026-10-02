import React from 'react';
import { toast } from 'sonner';
import * as api from '@/api';
import type { SchedulerStatus } from '@shared/api.interface';
import { Pause, Play, RefreshCw, Clock } from 'lucide-react';

export default function SchedulerAdmin() {
  const [status, setStatus] = React.useState<SchedulerStatus | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(() => {
    api.radar.getSchedulerStatus()
      .then((d) => { setStatus(d); setLoading(false); })
      .catch((e: unknown) => { toast.error(e instanceof Error ? e.message : '加载失败'); setLoading(false); });
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const toggle = async () => {
    if (!status) return;
    setBusy(true);
    try {
      const next = await api.radar.setSchedulerPaused(!status.paused);
      setStatus(next);
      toast.success(next.paused ? '调度器已暂停' : '调度器已恢复');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '操作失败');
    } finally { setBusy(false); }
  };

  const runOnce = async () => {
    setBusy(true);
    try {
      await api.radar.runSchedulerOnce();
      toast.success('已触发一次调度');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '触发失败');
    } finally { setBusy(false); }
  };

  if (loading) return <p className="mt-10 text-[var(--muted-foreground)]">加载中…</p>;
  if (!status) return null;

  return (
    <div>
      <h1 className="font-serif text-[42px] font-bold leading-[1.06] tracking-[-0.015em] text-[var(--foreground)]">
        采集调度器
      </h1>
      <p className="mt-1 font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
        仅 staging 启用 · {status.enabled ? 'armed' : 'disabled'} · {status.readySourceCount} 个 ready 来源
      </p>

      <section className="mt-8 rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-[22px_24px]">
        <div className="grid grid-cols-1 gap-[14px] sm:grid-cols-2">
          <div>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">状态</span>
            <div className={`mt-1 font-serif text-[24px] font-bold ${status.paused ? 'text-[var(--warning)]' : 'text-[var(--success)]'}`}>
              {status.paused ? '已暂停' : '运行中'}
            </div>
          </div>
          <div>
            <span className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">已执行次数</span>
            <div className="mt-1 font-serif text-[24px] font-bold text-[var(--foreground)]">{status.runCount}</div>
          </div>
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-[var(--muted-foreground)]" />
            <span className="text-[13px] text-[var(--muted-foreground)]">
              上次运行 {status.lastRunAt ? new Date(status.lastRunAt).toLocaleString('zh-CN') : '—'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <RefreshCw size={15} className="text-[var(--muted-foreground)]" />
            <span className="text-[13px] text-[var(--muted-foreground)]">
              下次运行 {status.nextRunAt ? new Date(status.nextRunAt).toLocaleString('zh-CN') : '—'}
            </span>
          </div>
        </div>
        {status.lastMessage && <p className="mt-3 text-[12px] text-[var(--muted-foreground)]">上次结果：{status.lastMessage}</p>}

        <div className="mt-5 flex gap-2">
          <button
            onClick={toggle}
            disabled={busy || !status.enabled}
            className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--border)] px-3 py-1.5 text-[13px] hover:bg-[var(--accent)] disabled:opacity-40"
          >
            {status.paused ? <Play size={14} /> : <Pause size={14} />}
            {status.paused ? '恢复' : '暂停'}
          </button>
          <button
            onClick={runOnce}
            disabled={busy || !status.enabled}
            className="inline-flex items-center gap-1.5 rounded-[8px] bg-[var(--primary)] px-3 py-1.5 text-[13px] text-white disabled:opacity-40"
          >
            <RefreshCw size={14} /> 立即运行一次
          </button>
        </div>
        {!status.enabled && (
          <p className="mt-3 text-[12px] text-[var(--warning)]">调度器未启用（仅 staging 且 SCHEDULER_ENABLED=1）。手动触发与暂停/恢复仅在启用时生效。</p>
        )}
      </section>
    </div>
  );
}
