import { Link } from 'react-router-dom';

const NotFound = () => {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--background)]">
      <div className="text-center">
        <p className="font-mono text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)]">
          404
        </p>
        <h1 className="mt-2 font-serif text-[24px] font-bold text-[var(--foreground)]">
          页面未找到
        </h1>
        <p className="mt-2 text-[14.5px] text-[var(--muted-foreground)]">
          你访问的页面不存在
        </p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-[var(--primary)] px-4 py-2 text-[14px] text-white"
        >
          返回首页
        </Link>
      </div>
    </div>
  );
};

export default NotFound;