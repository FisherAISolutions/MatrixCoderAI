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
    'group flex w-full items-center gap-3 border px-3 py-2 text-left text-xs uppercase tracking-[0.18em] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-matrix-green/70';

  if (item.comingSoon) {
    return (
      <button
        type="button"
        disabled
        className={`${sharedClassName} cursor-not-allowed border-matrix-border/40 text-matrix-green-muted/50`}
        title={`${item.label} is coming soon`}
      >
        <Icon size={16} aria-hidden="true" />
        {!collapsed && (
          <span className="flex min-w-0 flex-1 items-center justify-between gap-2">
            <span className="truncate">{item.label}</span>
            <span className="text-[9px] tracking-widest text-matrix-green-muted/60">
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
          ? 'border-matrix-green bg-matrix-green-ghost text-matrix-green neon-text-glow'
          : 'border-transparent text-matrix-green-muted hover:border-matrix-border hover:bg-matrix-panel hover:text-matrix-green'
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
      className={`flex h-full flex-col border-r border-matrix-border bg-matrix-bg/95 text-matrix-green shadow-[0_0_28px_rgba(0,255,102,0.08)] backdrop-blur-xl transition-[width] duration-300 ${
        mobile ? 'w-80 max-w-[86vw]' : collapsed ? 'w-20' : 'w-64 xl:w-72'
      }`}
    >
      <div className="flex items-center gap-3 border-b border-matrix-border px-4 py-4">
        <AppLogo size={34} />
        {!collapsed && (
          <div className="min-w-0">
            <p className="truncate text-xs font-bold uppercase tracking-[0.3em] neon-text-glow">
              Matrix Coder AI
            </p>
            <p className="mt-1 text-[10px] uppercase tracking-[0.22em] text-matrix-green-muted">
              Application shell
            </p>
          </div>
        )}
        {onToggleCollapsed && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="ml-auto hidden border border-matrix-border p-1.5 text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green lg:inline-flex"
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
            <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted">
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

        <div className="space-y-1 border-t border-matrix-border pt-4">
          {!collapsed && (
            <p className="px-3 pb-2 text-[10px] uppercase tracking-[0.32em] text-matrix-green-muted">
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

      <footer className="border-t border-matrix-border p-3">
        <div className="border border-matrix-border bg-matrix-panel/70 p-3">
          {!collapsed || mobile ? (
            <>
              <p className="truncate text-xs font-semibold text-matrix-green">{userLabel}</p>
              <p className="mt-1 text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
                Matrix session ready
              </p>
            </>
          ) : (
            <div className="mx-auto flex h-8 w-8 items-center justify-center border border-matrix-green text-xs font-bold text-matrix-green">
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
    <div className="flex h-screen w-screen overflow-hidden bg-matrix-bg text-matrix-green font-mono">
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
          <header className="flex min-h-[76px] items-center gap-4 border-b border-matrix-border bg-matrix-bg/85 px-4 backdrop-blur md:px-6">
            <button
              type="button"
              className="inline-flex border border-matrix-border p-2 text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green lg:hidden"
              aria-label="Open navigation drawer"
              aria-expanded={mobileOpen}
              onClick={() => setMobileOpen(true)}
            >
              <Menu size={18} />
            </button>
            <div className="min-w-0 flex-1">
              <nav
                className="mb-1 flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted"
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
              <h1 className="truncate text-lg font-bold uppercase tracking-[0.22em] text-matrix-green neon-text-glow">
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
            className="fixed left-3 top-3 z-40 inline-flex border border-matrix-border bg-matrix-bg/90 p-2 text-matrix-green-muted backdrop-blur transition-colors hover:border-matrix-green hover:text-matrix-green lg:hidden"
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
