import type { LucideIcon } from 'lucide-react';
import {
  Blocks,
  Clock,
  FolderKanban,
  Home,
  LayoutDashboard,
  MessageSquare,
  Rocket,
  Ruler,
  Settings,
  Sparkles,
} from 'lucide-react';

export interface AppShellNavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export interface AppShellQuickAction {
  label: string;
  href: string;
  icon: LucideIcon;
  comingSoon?: boolean;
}

export const APP_SHELL_NAV_ITEMS: AppShellNavItem[] = [
  { label: 'Dashboard', href: '/dashboard', icon: Home },
  { label: 'Projects', href: '/projects', icon: FolderKanban },
  { label: 'Matrix AI Architect', href: '/matrix-ai-architect', icon: Sparkles },
  { label: 'Blueprint Studio', href: '/blueprint-studio', icon: Ruler },
  { label: 'Workspace', href: '/chat-workspace', icon: MessageSquare },
  { label: 'Deployment Center', href: '/deployment-center', icon: Rocket },
  { label: 'Matrix Build Suite', href: '/matrix-build-suite', icon: Blocks },
  { label: 'History', href: '/history', icon: Clock, comingSoon: true },
  { label: 'Settings', href: '/settings', icon: Settings, comingSoon: true },
];

export const APP_SHELL_QUICK_ACTIONS: AppShellQuickAction[] = [
  { label: 'New Chat', href: '/chat-workspace', icon: MessageSquare },
  { label: 'Open Matrix AI Architect', href: '/matrix-ai-architect', icon: Sparkles },
  { label: 'Open Matrix Build Suite', href: '/matrix-build-suite', icon: Sparkles },
  { label: 'Deployment Center', href: '/deployment-center', icon: Rocket },
  { label: 'New Project', href: '/projects', icon: FolderKanban },
];

export function isAppShellRouteActive(pathname: string, href: string): boolean {
  if (href === '/') return pathname === '/';
  return pathname === href || pathname.startsWith(`${href}/`);
}
