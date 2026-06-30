import { describe, expect, it, vi } from 'vitest';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
import {
  createOrFindVercelProjectForDryRun,
  runVercelDeploymentFlow,
  testVercelConnection,
  type VercelDeploymentClient,
} from '@/lib/deployment/vercelDeploymentFlow';
import type { VercelProjectConfig } from '@/lib/deployment/vercelIntegration';

function allowedDryRun(
  overrides: Partial<VercelDeploymentDryRunSummary> = {}
): VercelDeploymentDryRunSummary {
  return {
    projectName: 'matrix-demo',
    fileCount: 2,
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
        buildCommand: 'npm run build',
        teamId: 'team_1',
      } as VercelProjectConfig & { teamId: string },
      files: [
        { path: 'package.json', content: '{}' },
        { path: 'src/app/page.tsx', content: 'export default function Page() {}' },
      ],
      target: 'production',
      requestedAt: '2026-06-29T12:00:00.000Z',
    },
    ...overrides,
  };
}

function blockedDryRun(): VercelDeploymentDryRunSummary {
  return allowedDryRun({
    deploymentAllowed: false,
    blockingReasons: ['Production Build Check must pass before deployment.'],
    request: null,
  });
}

function mockClient(
  overrides: Partial<VercelDeploymentClient> = {}
): VercelDeploymentClient {
  return {
    validateToken: vi.fn(async () => ({ id: 'user_1', email: 'dev@example.com' })),
    createOrFindProject: vi.fn(async () => ({ id: 'prj_1', name: 'matrix-demo' })),
    uploadDeploymentFiles: vi.fn(async () => [{ path: 'package.json', size: 2 }]),
    createDeployment: vi.fn(async () => ({
      success: true,
      status: 'queued' as const,
      deploymentId: 'dpl_1',
      productionUrl: 'matrix-demo.vercel.app',
      logs: [],
    })),
    pollDeploymentStatus: vi.fn(async () => ({
      id: 'dpl_1',
      state: 'READY',
      url: 'matrix-demo.vercel.app',
    })),
    ...overrides,
  };
}

describe('Vercel deployment flow', () => {
  it('tests a Vercel connection through an injected client', async () => {
    const client = mockClient();
    const result = await testVercelConnection({
      token: 'secret-token',
      createClient: () => client,
      now: () => '2026-06-29T12:00:00.000Z',
    });

    expect(result.success).toBe(true);
    expect(result.user?.email).toBe('dev@example.com');
    expect(client.validateToken).toHaveBeenCalledOnce();
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('creates or finds a project only when the dry run is allowed', async () => {
    const client = mockClient();
    const result = await createOrFindVercelProjectForDryRun({
      dryRun: allowedDryRun(),
      token: 'secret-token',
      createClient: () => client,
    });

    expect(result.success).toBe(true);
    expect(result.project).toMatchObject({ id: 'prj_1', name: 'matrix-demo' });
    expect(client.createOrFindProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'matrix-demo', teamId: 'team_1' })
    );
  });

  it('blocks project preparation when the dry run is not allowed', async () => {
    const client = mockClient();
    const result = await createOrFindVercelProjectForDryRun({
      dryRun: blockedDryRun(),
      token: 'secret-token',
      createClient: () => client,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Production Build Check must pass');
    expect(client.createOrFindProject).not.toHaveBeenCalled();
  });

  it('deploys through validate, project, upload, create, and poll steps', async () => {
    const client = mockClient({
      pollDeploymentStatus: vi
        .fn()
        .mockResolvedValueOnce({ id: 'dpl_1', state: 'BUILDING' })
        .mockResolvedValueOnce({
          id: 'dpl_1',
          state: 'READY',
          url: 'matrix-demo.vercel.app',
        }),
    });
    const result = await runVercelDeploymentFlow({
      dryRun: allowedDryRun(),
      token: 'secret-token',
      createClient: () => client,
      sleep: async () => undefined,
      now: () => '2026-06-29T12:00:00.000Z',
    });

    expect(result).toMatchObject({
      success: true,
      status: 'ready',
      projectId: 'prj_1',
      deploymentId: 'dpl_1',
      deploymentUrl: 'https://matrix-demo.vercel.app',
      productionUrl: 'https://matrix-demo.vercel.app',
    });
    expect(client.validateToken).toHaveBeenCalledOnce();
    expect(client.createOrFindProject).toHaveBeenCalledOnce();
    expect(client.uploadDeploymentFiles).toHaveBeenCalledOnce();
    expect(client.createDeployment).toHaveBeenCalledOnce();
    expect(client.pollDeploymentStatus).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(result)).not.toContain('secret-token');
  });

  it('times out when deployment never reaches a terminal ready state', async () => {
    const client = mockClient({
      pollDeploymentStatus: vi.fn(async () => ({ id: 'dpl_1', state: 'BUILDING' })),
    });
    const result = await runVercelDeploymentFlow({
      dryRun: allowedDryRun(),
      token: 'secret-token',
      createClient: () => client,
      maxPolls: 2,
      sleep: async () => undefined,
    });

    expect(result.success).toBe(false);
    expect(result.status).toBe('timeout');
    expect(result.error).toContain('Timed out');
  });

  it('redacts token text from failed deployment errors', async () => {
    const client = mockClient({
      createDeployment: vi.fn(async () => {
        throw new Error('Bad token secret-token');
      }),
    });
    const result = await runVercelDeploymentFlow({
      dryRun: allowedDryRun(),
      token: 'secret-token',
      createClient: () => client,
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Bad token [redacted-token:12]');
    expect(JSON.stringify(result.logs)).not.toContain('secret-token');
  });
});
