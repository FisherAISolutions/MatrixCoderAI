import { describe, expect, it, vi } from 'vitest';
import type { VercelDeploymentClient } from '@/lib/deployment/vercelDeploymentFlow';
import { runVercelServerAction } from '@/lib/deployment/vercelServerActions';
import type { VercelDeploymentDryRunSummary } from '@/lib/deployment/vercelDeploymentRequest';
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

describe('Vercel server actions', () => {
  it('tests a connection through an injected server-side client', async () => {
    const client = mockClient();
    const response = await runVercelServerAction(
      { action: 'test-connection', token: 'secret-token' },
      { createClient: () => client }
    );

    expect(response.success).toBe(true);
    expect(response.action).toBe('test-connection');
    expect(client.validateToken).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain('secret-token');
  });

  it('creates or finds a project through an injected server-side client', async () => {
    const client = mockClient();
    const response = await runVercelServerAction(
      {
        action: 'prepare-project',
        token: 'secret-token',
        dryRun: allowedDryRun(),
      },
      { createClient: () => client }
    );

    expect(response.success).toBe(true);
    expect(response.action).toBe('prepare-project');
    expect(client.createOrFindProject).toHaveBeenCalledWith(
      expect.objectContaining({ projectName: 'matrix-demo' })
    );
    expect(JSON.stringify(response)).not.toContain('secret-token');
  });

  it('runs deployment through the guarded server action path', async () => {
    const client = mockClient();
    const response = await runVercelServerAction(
      {
        action: 'deploy',
        token: 'secret-token',
        dryRun: allowedDryRun(),
      },
      { createClient: () => client }
    );

    expect(response.success).toBe(true);
    expect(response.action).toBe('deploy');
    expect(client.validateToken).toHaveBeenCalledOnce();
    expect(client.uploadDeploymentFiles).toHaveBeenCalledOnce();
    expect(client.createDeployment).toHaveBeenCalledOnce();
    expect(JSON.stringify(response)).not.toContain('secret-token');
  });

  it('refuses actions without a token', async () => {
    const response = await runVercelServerAction({
      action: 'test-connection',
    });

    expect(response.success).toBe(false);
    expect(response.error).toBe('Vercel token is required for this action.');
  });

  it('redacts token text from server action errors', async () => {
    const client = mockClient({
      validateToken: vi.fn(async () => {
        throw new Error('Bad token secret-token');
      }),
    });
    const response = await runVercelServerAction(
      { action: 'test-connection', token: 'secret-token' },
      { createClient: () => client }
    );

    expect(response.success).toBe(false);
    expect(response.error).toBe('Bad token [redacted-token:12]');
    expect(JSON.stringify(response)).not.toContain('secret-token');
  });
});
