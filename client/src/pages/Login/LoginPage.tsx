import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import api from '@/utils/axios';
import { getApiErrorMessage } from '@/utils/api-error';
import { validateLoginInput } from '@/utils/auth-validation';
import { logger } from '../../utils/logger';

// Public build/version surface. We only care whether APP_ENV === 'staging' so we can
// show a one-off warning banner; everything else is ignored.
async function fetchEnvironment(): Promise<string | null> {
  try {
    const res = await api.get('/version');
    return (res.data as { environment?: string })?.environment ?? null;
  } catch {
    return null;
  }
}

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isStaging, setIsStaging] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    fetchEnvironment().then((env) => setIsStaging(env === 'staging'));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const clientError = validateLoginInput({ username, password });
    if (clientError) {
      setError(clientError);
      return;
    }

    setSubmitting(true);
    try {
      await login(username, password);
      navigate('/');
    } catch (err: unknown) {
      // 401 (wrong password / unknown user) and any other failure are normalized to a
      // readable Chinese message; raw "401" / axios text never reaches the user.
      setError(getApiErrorMessage(err, '登录失败，请稍后重试'));
      logger.error('登录失败', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-8">
        {isStaging && (
          <div className="mb-4 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-700">
            当前为测试环境（Staging），数据可能被重置，请勿使用生产或真实个人账号。
          </div>
        )}

        <h1 className="font-serif text-[28px] leading-[1.2] font-bold text-[var(--foreground)]">
          LitRadar
        </h1>
        <p className="mt-1 text-[14.5px] text-[var(--muted-foreground)]">
          心理语言学文献雷达
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-2 text-[14px] text-red-600" role="alert">
              {error}
            </div>
          )}

          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              用户名
            </label>
            <input
              type="text"
              value={username}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setUsername(e.target.value)}
              required
              autoComplete="username"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="输入用户名"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              密码
            </label>
            <input
              type="password"
              value={password}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-[var(--muted-foreground)]">
          还没有账号？
          <Link to="/register" className="ml-1 text-[var(--primary)] hover:underline">
            注册
          </Link>
        </p>
      </div>
    </div>
  );
}
