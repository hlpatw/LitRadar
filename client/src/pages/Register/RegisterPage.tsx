import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { logger } from '../../utils/logger';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次密码输入不一致');
      return;
    }

    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setSubmitting(true);
    try {
      await register({ username, email, password, displayName: displayName || undefined });
      navigate('/');
    } catch (err: unknown) {
      const axiosErr = err as { response?: { data?: { message?: string } } };
      setError(axiosErr.response?.data?.message ?? '注册失败');
      logger.error('注册失败', err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="w-full max-w-sm rounded-[10px] border border-[var(--border)] bg-[var(--card)] p-8">
        <h1 className="font-serif text-[28px] leading-[1.2] font-bold text-[var(--foreground)]">
          注册
        </h1>
        <p className="mt-1 text-[14.5px] text-[var(--muted-foreground)]">
          创建你的 LitRadar 账号
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          {error && (
            <div className="rounded-md bg-red-50 px-4 py-2 text-[14px] text-red-600">
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
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="字母、数字或下划线"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              邮箱
            </label>
            <input
              type="email"
              value={email}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setEmail(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              显示名称
              <span className="ml-1 text-[var(--muted-foreground)]">（可选）</span>
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setDisplayName(e.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="你的名字"
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
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="至少 6 位"
            />
          </div>

          <div>
            <label className="block text-[13px] font-medium text-[var(--foreground)]">
              确认密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-[14.5px] text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
              placeholder="再次输入密码"
            />
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-[var(--primary)] px-4 py-2 text-[14px] font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
          >
            {submitting ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="mt-6 text-center text-[13px] text-[var(--muted-foreground)]">
          已有账号？
          <Link to="/login" className="ml-1 text-[var(--primary)] hover:underline">
            登录
          </Link>
        </p>
      </div>
    </div>
  );
}