import { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Library,
  FileText,
  CheckSquare,
  StickyNote,
  Settings,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';

const navItems = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/journals', label: '期刊与会议', icon: Library },
  { path: '/papers', label: '论文浏览', icon: FileText },
  { path: '/checklist', label: '阅读清单', icon: CheckSquare },
  { path: '/notes', label: '笔记', icon: StickyNote },
  { path: '/settings', label: '设置', icon: Settings },
];

const Layout = () => {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();

  return (
    <div className="flex h-screen bg-[var(--background)]">
      <aside
        className={`flex flex-col border-r border-[var(--border)] bg-[var(--card)] transition-all duration-200 ${
          collapsed ? 'w-16' : 'w-56'
        }`}
      >
        <div className="flex h-14 items-center justify-between border-b border-[var(--border)] px-4">
          {!collapsed && (
            <span className="font-serif text-base font-bold tracking-tight text-[var(--foreground)]">
              LitRadar
            </span>
          )}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]"
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        </div>

        <nav className="flex-1 space-y-1 p-2">
          {navItems.map((item: typeof navItems[number]) => {
            const Icon = item.icon;
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-[var(--accent)] font-medium text-[var(--accent-foreground)]'
                    : 'text-[var(--muted-foreground)] hover:bg-[var(--accent)] hover:text-[var(--accent-foreground)]'
                } ${collapsed ? 'justify-center' : ''}`}
                title={collapsed ? item.label : undefined}
              >
                <Icon size={18} />
                {!collapsed && <span>{item.label}</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="border-t border-[var(--border)] p-3">
          {!collapsed && (
            <p className="text-[10.5px] uppercase tracking-[0.06em] text-[var(--muted-foreground)] font-mono">
              心理语言学文献雷达
            </p>
          )}
        </div>
      </aside>

      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-[1080px] px-8 py-7">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

export default Layout;