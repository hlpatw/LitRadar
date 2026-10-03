import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Library as LibraryIcon,
  BookOpenCheck,
  Newspaper,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
  SheetDescription,
  SheetHeader,
} from '@/components/ui/sheet';

const NAV_ITEMS = [
  { to: '/', label: '研究雷达', icon: LayoutDashboard, end: true },
  { to: '/papers', label: '论文库', icon: BookOpenCheck },
  { to: '/library', label: '我的书架', icon: LibraryIcon },
  { to: '/sources', label: '追踪来源', icon: Newspaper },
];

function NavContent({ collapsed, onNavigate }: { collapsed?: boolean; onNavigate?: () => void }) {
  return (
    <nav className="flex flex-col gap-1">
      {NAV_ITEMS.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          onClick={onNavigate}
          title={collapsed ? label : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-[8px] px-3 py-2 text-[13.5px] font-medium transition-colors ${
              collapsed ? 'justify-center px-0' : ''
            } ${
              isActive
                ? 'bg-[var(--primary)] text-[white]'
                : 'text-[var(--foreground)] hover:bg-[var(--accent)]'
            }`
          }
        >
          <Icon size={16} className="shrink-0" />
          {!collapsed && <span className="truncate">{label}</span>}
        </NavLink>
      ))}
    </nav>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = React.useState(false);
  const [drawerOpen, setDrawerOpen] = React.useState(false);
  const isMobile = useIsMobile();
  const navigate = useNavigate();

  // Desktop sign-out (placeholder; replaced by auth context when wired).
  const signOut = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen w-full bg-[var(--background)] text-[var(--foreground)]">
      {/* Persistent sidebar: lg and up only. Below lg (md and mobile) there is NO fixed desktop
          sidebar — navigation lives in the hamburger Sheet drawer instead. */}
      <aside
        className={`sticky top-0 hidden h-screen shrink-0 flex-col border-r border-[var(--border)] bg-[var(--card)] p-4 transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className={`flex items-center gap-2 px-1 pb-6 ${collapsed ? 'justify-center' : ''}`}>
          <BookOpenCheck size={20} className="shrink-0 text-[var(--primary)]" />
          {!collapsed && (
            <span className="truncate font-serif text-[18px] font-bold text-[var(--foreground)]">
              LitRadar
            </span>
          )}
        </div>
        <NavContent collapsed={collapsed} />
        <div className="mt-auto flex flex-col gap-2 border-t border-[var(--border)] pt-4">
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[12px] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          >
            {collapsed ? <PanelLeftOpen size={14} /> : <PanelLeftClose size={14} />}
            {!collapsed && '收起侧栏'}
          </button>
          <button
            onClick={signOut}
            className="rounded-[8px] px-3 py-2 text-left text-[12.5px] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          >
            退出登录
          </button>
        </div>
      </aside>

      {/* Mobile/tablet top bar + drawer (below lg) */}
      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <div className="fixed inset-x-0 top-0 z-40 flex h-12 items-center gap-2 border-b border-[var(--border)] bg-[var(--card)] px-3 lg:hidden">
          <SheetTrigger asChild>
            <button
              type="button"
              aria-label="打开导航菜单"
              className="rounded p-1.5 text-[var(--foreground)] hover:bg-[var(--accent)]"
            >
              <Menu size={18} />
            </button>
          </SheetTrigger>
          <span className="font-serif text-[16px] font-bold text-[var(--foreground)]">LitRadar</span>
        </div>
        <SheetContent side="left" className="w-64 bg-[var(--card)] p-4">
          <SheetHeader>
            <SheetTitle className="font-serif text-[18px]">LitRadar</SheetTitle>
            <SheetDescription className="sr-only">导航菜单</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <NavContent onNavigate={() => setDrawerOpen(false)} />
          </div>
          <button
            onClick={() => { setDrawerOpen(false); signOut(); }}
            className="mt-auto rounded-[8px] px-3 py-2 text-left text-[12.5px] text-[var(--muted-foreground)] hover:bg-[var(--accent)]"
          >
            退出登录
          </button>
        </SheetContent>
      </Sheet>

      {/* Single responsive gutter. Pages must NOT add their own max-w/padding (that was the
          double-container bug). min-w-0 lets long titles/keywords wrap instead of overflowing. */}
      <main className="min-w-0 flex-1 overflow-auto lg:pt-0 pt-12">
        <div className="mx-auto w-full min-w-0 max-w-[1080px] px-4 py-6 sm:px-6 sm:py-7 lg:px-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
