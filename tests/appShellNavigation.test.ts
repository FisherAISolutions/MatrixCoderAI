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
      '/chat-workspace',
      '/matrix-build-suite',
      '/blueprint-studio',
      '/deployment-center',
      '/projects',
      '/history',
      '/settings',
    ]);
  });

  it('marks unavailable destinations as coming soon', () => {
    const unavailable = APP_SHELL_NAV_ITEMS.filter((item) => item.comingSoon).map(
      (item) => item.href
    );

    expect(unavailable).toEqual([
      '/blueprint-studio',
      '/projects',
      '/history',
      '/settings',
    ]);
  });

  it('keeps quick actions focused on existing destinations', () => {
    expect(APP_SHELL_QUICK_ACTIONS.map((item) => item.href)).toEqual([
      '/chat-workspace',
      '/matrix-build-suite',
      '/deployment-center',
      '/projects/new',
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
