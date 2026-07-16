'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ChevronLeft, ChevronRight, Menu, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import AppLogo from '@/components/ui/AppLogo';
import {
  APP_SHELL_NAV_ITEMS,
  APP_SHELL_QUICK_ACTIONS,
  isAppShellRouteActive,
  type AppShellNavItem,
  type AppShellQuickAction,
} from './navigation';

const STORAGE_KEY = 'matrix-coder:app-shell-collapsed';

interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface AppShellProps {
  children: ReactNode;
  title?: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  showHeader?: boolean;
  contentClassName?: string;
}

function ShellLink({
  item,
  collapsed,
  pathname,
  onNavigate,
}: {
  item: AppShellNavItem | AppShellQuickAction;
  collapsed?: boolean;
  pathname: string;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  const active = isAppShellRouteActive(pathname, item.href);
  const sharedClassName =
    'group flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-xs uppercase tracking-[0.14em] transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matrix-green/60';

  if (item.comingSoon) {
    return (
      <button
        type="button"
        disabled
        className={`${sharedClassName} cursor-not-allowed border-slate-800/70 bg-slate-900/25 text-slate-500`}
        title={`${item.label} is coming soon`}
      >
        <Icon size={16} aria-hidden="true" />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            <span className="text-[9px] tracking-widest text-slate-500">
              Soon
            </span>
          </span>
        )}
      </button>
    );
  }

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      className={`${sharedClassName} ${
        active
          ? 'border-matrix-green/60 bg-matrix-green-ghost/80 text-matrix-green shadow-[0_0_18px_rgba(0,255,102,0.08)]'
          : 'border-transparent text-slate-400 hover:border-slate-700/80 hover:bg-slate-900/70 hover:text-slate-100'
      }`}
      aria-current={active ? 'page' : undefined}
      title={collapsed ? item.label : undefined}
    >
      <Icon size={16} aria-hidden="true" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </Link>
  );
}

function Sidebar({
  collapsed,
  pathname,
  onToggleCollapsed,
  onNavigate,
  mobile = false,
}: {
  collapsed: boolean;
  pathname: string;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
  mobile?: boolean;
}) {
  const { user } = useAuth();
  const userLabel = user?.email ?? 'Local operator';

  return (
    <aside
      className={`flex h-full flex-col border-r border-slate-800/90 bg-[#05070a]/96 text-slate-200 shadow-[18px_0_44px_rgba(0,0,0,0.28)] backdrop-blur-xl transition-[width] duration-300 ${
        mobile ? 'w-80 max-w-[86vw]' : collapsed ? 'w-20' : 'w-64 xl:w-72'
      }`}
    >
      <div className="flex items-center gap-3 border-b border-slate-800/90 bg-slate-950/55 px-4 py-4">
        <AppLogo size={34} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.28em] text-slate-100">
              Matrix Coder AI
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-slate-500">
              Application shell
            </p>
          </div>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="ml-auto hidden rounded-lg border border-slate-800 bg-slate-950/80 p-1.5 text-slate-500 transition-colors hover:border-matrix-green/70 hover:text-matrix-green lg:inline-flex"
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            aria-expanded={!collapsed}
          >
            {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
          </button>
        )}
      </div>

      <nav className="flex-1 space-y-6 overflow-y-auto px-3 py-4" aria-label="Application navigation">
        <div className="space-y-1">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.28em] text-slate-500">
              Navigate
            </p>
          )}
          {APP_SHELL_NAV_ITEMS.map((item) => (
            <ShellLink
              key={item.href}
              item={item}
              collapsed={collapsed && !mobile}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>

        <div className="space-y-1 border-t border-slate-800/90 pt-4">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.28em] text-slate-500">
              Quick actions
            </p>
          )}
          {APP_SHELL_QUICK_ACTIONS.map((item) => (
            <ShellLink
              key={item.label}
              item={item}
              collapsed={collapsed && !mobile}
              pathname={pathname}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </nav>

      <footer className="border-t border-slate-800/90 bg-slate-950/35 p-3">
        <div className="rounded-xl border border-slate-800/90 bg-slate-900/55 p-3 shadow-[0_12px_28px_rgba(0,0,0,0.20)]">
          {!collapsed || mobile ? (
            <>
              <p className="truncate text-xs font-semibold text-slate-100">{userLabel}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-slate-500">
                Matrix session ready
              </p>
            </>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-lg border border-matrix-green/60 text-xs font-bold text-matrix-green">
              {userLabel.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>
      </footer>
    </aside>
  );
}

export function AppShell({
  children,
  title = 'Matrix Coder AI',
  description,
  breadcrumbs,
  showHeader = true,
  contentClassName = '',
}: AppShellProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setCollapsed(stored === 'true');
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, String(collapsed));
  }, [collapsed]);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const resolvedBreadcrumbs = useMemo<BreadcrumbItem[]>(() => {
    if (breadcrumbs?.length) return breadcrumbs;
    return [{ label: 'Matrix Coder AI', href: '/' }, { label: title }];
  }, [breadcrumbs, title]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#05070a] text-slate-100 font-mono">
      <div className="hidden lg:block">
        <Sidebar
          collapsed={collapsed}
          pathname={pathname}
          onToggleCollapsed={() => setCollapsed((value) => !value)}
        />
      </div>

      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true">
          <button
            type="button"
            className="absolute inset-0 bg-black/70"
            aria-label="Close navigation drawer"
            onClick={() => setMobileOpen(false)}
          />
          <div className="relative h-full">
            <Sidebar
              collapsed={false}
              mobile
              pathname={pathname}
              onNavigate={() => setMobileOpen(false)}
            />
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {showHeader ? (
          <header className="flex min-h-[76px] items-center gap-4 border-b border-slate-800/90 bg-[#070a0f]/92 px-4 shadow-[0_12px_40px_rgba(0,0,0,0.24)] backdrop-blur-xl md:px-6">
            <button
              type="button"
              className="inline-flex rounded-lg border border-slate-800 bg-slate-950/80 p-2 text-slate-500 transition-colors hover:border-matrix-green/70 hover:text-matrix-green lg:hidden"
              aria-label="Open navigation drawer"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <nav
                className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.22em] text-slate-500"
                aria-label="Breadcrumb"
              >
                {resolvedBreadcrumbs.map((item, index) => (
                  <span key={`${item.label}-${index}`} className="flex items-center gap-2">
                    {item.href ? (
                      <Link href={item.href} className="hover:text-matrix-green">
                        {item.label}
                      </Link>
                    ) : (
                      <span>{item.label}</span>
                    )}
                    {index < resolvedBreadcrumbs.length - 1 && <span>/</span>}
                  </span>
                ))}
              </nav>
              <h1 className="truncate text-lg font-semibold uppercase tracking-[0.18em] text-slate-100">
                {title}
              </h1>
              {description && (
                <p className="mt-1 truncate text-xs text-matrix-readable">{description}</p>
              )}
            </div>
          </header>
        ) : (
          <button
            type="button"
            className="fixed left-3 top-3 z-40 inline-flex rounded-lg border border-slate-800 bg-slate-950/90 p-2 text-slate-500 backdrop-blur transition-colors hover:border-matrix-green/70 hover:text-matrix-green lg:hidden"
            aria-label="Open navigation drawer"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen(true)}
          >
            {mobileOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        )}

        <main className={`relative min-h-0 min-w-0 flex-1 overflow-auto ${contentClassName}`}>
          {children}
        </main>
      </div>
    </div>
  );
}
