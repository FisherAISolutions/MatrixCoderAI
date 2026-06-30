import { describe, expect, it } from 'vitest';
import {
  VERCEL_LOCAL_CONFIG_KEY,
  clearVercelLocalConfig,
  getVercelLocalConfigState,
  loadVercelLocalConfig,
  parseVercelLocalConfig,
  saveVercelLocalConfig,
} from '@/lib/deployment/vercelConfig';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(VERCEL_LOCAL_CONFIG_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  };
}

describe('Vercel local config helpers', () => {
  it('parses invalid config safely', () => {
    expect(parseVercelLocalConfig(null)).toBeNull();
    expect(parseVercelLocalConfig('{bad json')).toBeNull();
    expect(parseVercelLocalConfig(JSON.stringify({ tokenConfigured: true }))).toBeNull();
  });

  it('saves local config without persisting the token value', () => {
    const storage = memoryStorage();
    const config = saveVercelLocalConfig(
      {
        tokenPlaceholder: 'secret-token',
        teamId: 'team_123',
        projectName: 'matrix-demo',
        savedAt: '2026-06-29T12:00:00.000Z',
      },
      storage
    );
    const raw = storage.getItem(VERCEL_LOCAL_CONFIG_KEY) ?? '';

    expect(config.tokenConfigured).toBe(true);
    expect(raw).not.toContain('secret-token');
    expect(loadVercelLocalConfig(storage)).toMatchObject({
      tokenConfigured: true,
      teamId: 'team_123',
      projectName: 'matrix-demo',
    });
  });

  it('clears local config', () => {
    const storage = memoryStorage();
    saveVercelLocalConfig({ tokenPlaceholder: 'token' }, storage);
    clearVercelLocalConfig(storage);

    expect(loadVercelLocalConfig(storage)).toBeNull();
  });

  it('reports not configured before local settings are saved', () => {
    expect(
      getVercelLocalConfigState({
        config: null,
        environment: { hasToken: false },
        readinessStatus: 'Ready to connect',
      })
    ).toMatchObject({
      status: 'Not configured',
    });
  });

  it('reports missing token when settings exist without a token', () => {
    expect(
      getVercelLocalConfigState({
        config: {
          tokenConfigured: false,
          teamId: 'team_123',
          projectName: 'matrix-demo',
          savedAt: '2026-06-29T12:00:00.000Z',
        },
        environment: { hasToken: false },
        readinessStatus: 'Ready to connect',
      })
    ).toMatchObject({
      status: 'Missing token',
    });
  });

  it('reports configured locally until production readiness passes', () => {
    expect(
      getVercelLocalConfigState({
        config: {
          tokenConfigured: true,
          projectName: 'matrix-demo',
          savedAt: '2026-06-29T12:00:00.000Z',
        },
        environment: { hasToken: false },
        readinessStatus: 'Needs production check',
      })
    ).toMatchObject({
      status: 'Configured locally',
    });
  });

  it('reports ready for future deployment when config and readiness pass', () => {
    expect(
      getVercelLocalConfigState({
        config: {
          tokenConfigured: true,
          projectName: 'matrix-demo',
          savedAt: '2026-06-29T12:00:00.000Z',
        },
        environment: { hasToken: false },
        readinessStatus: 'Ready to connect',
      })
    ).toMatchObject({
      status: 'Ready for future deployment',
    });
  });
});
