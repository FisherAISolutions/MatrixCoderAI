import { describe, expect, it } from 'vitest';
import {
  APP_SHELL_NAV_ITEMS,
  APP_SHELL_QUICK_ACTIONS,
  isAppShellRouteActive,
} from '@/components/app-shell/navigation';

describe('app shell navigation', () => {
  it('contains the primary application destinations', () => {
    expect(APP_SHELL_NAV_ITEMS.map((item) => item.href)).toEqual([
      '/dashboard',
      '/projects',
      '/matrix-ai-architect',
      '/blueprint-studio',
      '/chat-workspace',
      '/deployment-center',
      '/matrix-build-suite',
      '/history',
      '/settings',
    ]);
  });

  it('marks unavailable destinations as coming soon', () => {
    const unavailable = APP_SHELL_NAV_ITEMS.filter((item) => item.comingSoon).map(
      (item) => item.href
    );

    expect(unavailable).toEqual(['/history', '/settings']);
  });

  it('keeps quick actions focused on existing destinations', () => {
    expect(APP_SHELL_QUICK_ACTIONS.map((item) => item.href)).toEqual([
      '/chat-workspace',
      '/matrix-ai-architect',
      '/matrix-build-suite',
      '/deployment-center',
      '/projects',
    ]);
  });

  it('detects active nested application routes without matching root broadly', () => {
    expect(isAppShellRouteActive('/deployment-center', '/deployment-center')).toBe(true);
    expect(isAppShellRouteActive('/deployment-center/vercel', '/deployment-center')).toBe(
      true
    );
    expect(isAppShellRouteActive('/matrix-build-suite', '/chat-workspace')).toBe(false);
    expect(isAppShellRouteActive('/chat-workspace', '/')).toBe(false);
    expect(isAppShellRouteActive('/', '/')).toBe(true);
    expect(isAppShellRouteActive('/dashboard', '/dashboard')).toBe(true);
  });
});
