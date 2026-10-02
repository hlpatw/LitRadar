import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { toast } from 'sonner';
import { SettingsIcon } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Spinner } from '@/components/ui/spinner';
import { workspace } from '@/api';
import api from '@/utils/axios';
import type { UserSettings, UpdateSettingsRequest } from '@shared/api.interface';

interface VersionInfo {
  environment: string;
  commit: string;
  buildTime: string | null;
  migrationVersion: string;
  migrationsApplied: number;
  frontend: { bundle: string | null };
}

export default function Settings() {
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [version, setVersion] = useState<VersionInfo | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<boolean>(false);

  const [fieldOfStudy, setFieldOfStudy] = useState<string>('');
  const [interestedKeywords, setInterestedKeywords] = useState<string>('');

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data: UserSettings = await workspace.getSettings();
      setSettings(data);
      setFieldOfStudy(data.fieldOfStudy ?? '');
      setInterestedKeywords(data.interestedKeywords ?? '');
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '加载设置失败';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    api.get('/version').then((r) => setVersion(r.data)).catch(() => setVersion(null));
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data: UpdateSettingsRequest = {
        fieldOfStudy: fieldOfStudy || undefined,
        interestedKeywords: interestedKeywords || undefined,
      };
      await workspace.updateSettings(data);
      toast.success('设置已保存');
    } catch (err: unknown) {
      const message: string =
        err instanceof Error ? err.message : '保存失败';
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div>
        <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground">
          个人设置
        </h1>
        <div className="mt-[40px] flex items-center justify-center py-20">
          <Spinner className="size-6" />
        </div>
      </div>
    );
  }

  if (error && !settings) {
    return (
      <div>
        <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground">
          个人设置
        </h1>
        <div className="mt-[40px] flex items-center justify-center py-20">
          <p className="text-muted-foreground text-[14.5px]">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center gap-3">
        <SettingsIcon className="size-8 text-muted-foreground" />
        <h1 className="font-serif text-[42px] leading-[1.06] tracking-[-0.015em] font-bold text-foreground">
          个人设置
        </h1>
      </div>

      <div className="mt-[40px] max-w-2xl">
        <form onSubmit={handleSave}>
          <div className="rounded-[10px] border border-border bg-card p-[22px_24px]">
            <div className="flex flex-col gap-5">
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="fieldOfStudy"
                  className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground"
                >
                  专业领域
                </label>
                <Input
                  id="fieldOfStudy"
                  value={fieldOfStudy}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                    setFieldOfStudy(e.target.value)
                  }
                  placeholder="如：心理语言学、句法加工、二语习得"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label
                  htmlFor="interestedKeywords"
                  className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground"
                >
                  意向关键词
                </label>
                <Textarea
                  id="interestedKeywords"
                  value={interestedKeywords}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                    setInterestedKeywords(e.target.value)
                  }
                  placeholder="用逗号分隔多个关键词，如：syntax priming, garden-path, agreement attraction"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-5 flex items-center justify-between">
              <p className="text-[12.5px] text-muted-foreground">
                设置后可用于文献筛选与推荐
              </p>
              <Button
                type="submit"
                size="sm"
                className="rounded-[8px]"
                disabled={saving}
              >
                {saving ? <Spinner className="mr-1" /> : null}
                保存
              </Button>
            </div>
          </div>
        </form>

        {version && (
          <div className="mt-[40px] rounded-[10px] border border-border bg-card p-[22px_24px]">
            <label className="font-mono text-[10.5px] tracking-[0.06em] uppercase text-muted-foreground">
              版本信息
            </label>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-[13.5px]">
              <dt className="text-muted-foreground">环境</dt>
              <dd className="font-mono text-xs">{version.environment}</dd>
              <dt className="text-muted-foreground">提交</dt>
              <dd className="font-mono text-xs">{version.commit}</dd>
              <dt className="text-muted-foreground">构建时间</dt>
              <dd className="font-mono text-xs">
                {version.buildTime ? new Date(version.buildTime).toLocaleString() : '—'}
              </dd>
              <dt className="text-muted-foreground">数据库迁移</dt>
              <dd className="font-mono text-xs">
                {version.migrationVersion} ({version.migrationsApplied})
              </dd>
              <dt className="text-muted-foreground">前端包</dt>
              <dd className="font-mono text-xs">{version.frontend.bundle ?? 'dev'}</dd>
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}