import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createOrFindVercelProjectViaServer,
  deployToVercelViaServer,
  testVercelConnectionViaServer,
} from '@/lib/deployment/vercelDeploymentApi';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
import type { VercelProjectConfig } from '@/lib/deployment/vercelIntegration';

function mockFetch(payload: unknown, ok = true) {
  const fetchMock = vi.fn(async () => ({
    ok,
    json: async () => payload,
  })) as unknown as typeof fetch;
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function allowedDryRun(): VercelDeploymentDryRunSummary {
  return {
    projectName: 'matrix-demo',
    fileCount: 1,
    routeCount: 1,
    framework: 'Next.js',
    productionCheckStatus: 'Passed',
    deploymentAllowed: true,
    blockingReasons: [],
    request: {
      project: {
        projectName: 'matrix-demo',
        framework: 'nextjs',
        rootDirectory: '.',
      } as VercelProjectConfig,
      files: [{ path: 'package.json', content: '{}' }],
      target: 'production',
      requestedAt: '2026-06-29T12:00:00.000Z',
    },
  };
}

describe('Vercel deployment API wrapper', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('posts connection tests to the internal server route', async () => {
    const fetchMock = mockFetch({
      success: true,
      action: 'test-connection',
      result: {
        success: true,
        user: { id: 'user_1', email: 'dev@example.com' },
        logs: [],
      },
    });

    const result = await testVercelConnectionViaServer('secret-token');

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/deployment/vercel',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          action: 'test-connection',
          token: 'secret-token',
        }),
      })
    );
  });

  it('posts project preparation dry-runs to the internal server route', async () => {
    const dryRun = allowedDryRun();
    const fetchMock = mockFetch({
      success: true,
      action: 'prepare-project',
      result: {
        success: true,
        project: { id: 'prj_1', name: 'matrix-demo' },
        logs: [],
      },
    });

    const result = await createOrFindVercelProjectViaServer('secret-token', dryRun);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/deployment/vercel',
      expect.objectContaining({
        body: JSON.stringify({
          action: 'prepare-project',
          token: 'secret-token',
          dryRun,
        }),
      })
    );
  });

  it('posts deploy requests to the internal server route', async () => {
    const dryRun = allowedDryRun();
    mockFetch({
      success: true,
      action: 'deploy',
      result: {
        success: true,
        status: 'ready',
        projectName: 'matrix-demo',
        deploymentUrl: 'https://matrix-demo.vercel.app',
        productionUrl: 'https://matrix-demo.vercel.app',
        lastDeploymentTime: '2026-06-29T12:00:00.000Z',
        logs: [],
      },
    });

    const result = await deployToVercelViaServer('secret-token', dryRun);

    expect(result.success).toBe(true);
    expect(result.productionUrl).toBe('https://matrix-demo.vercel.app');
  });

  it('returns handled deployment failures so logs remain visible', async () => {
    mockFetch(
      {
        success: false,
        action: 'deploy',
        result: {
          success: false,
          status: 'failed',
          projectName: 'matrix-demo',
          lastDeploymentTime: '2026-06-29T12:00:00.000Z',
          logs: [
            {
              timestamp: '2026-06-29T12:00:00.000Z',
              level: 'error',
              message: 'Build failed',
            },
          ],
          error: 'Build failed',
        },
        error: 'Build failed',
      },
      false
    );

    const result = await deployToVercelViaServer('secret-token', allowedDryRun());

    expect(result.success).toBe(false);
    expect(result.logs[0].message).toBe('Build failed');
  });

  it('throws the redacted server error for failed requests', async () => {
    mockFetch(
      {
        success: false,
        action: 'deploy',
        error: 'Bad token [redacted-token:12]',
      },
      false
    );

    await expect(
      deployToVercelViaServer('secret-token', allowedDryRun())
    ).rejects.toThrow('Bad token [redacted-token:12]');
  });
});
