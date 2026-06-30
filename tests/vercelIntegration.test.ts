import { describe, expect, it } from 'vitest';
import {
  detectVercelEnvironment,
  getVercelConnectionState,
  type VercelDeploymentRequest,
  type VercelDeploymentResult,
  type VercelProjectConfig,
} from '@/lib/deployment/vercelIntegration';

describe('Vercel integration foundation', () => {
  it('detects a private Vercel token env var', () => {
    expect(
      detectVercelEnvironment({
        VERCEL_TOKEN: 'token',
      })
    ).toEqual({
      hasToken: true,
      tokenSource: 'VERCEL_TOKEN',
    });
  });

  it('detects a public configured flag without exposing a token', () => {
    expect(
      detectVercelEnvironment({
        NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED: 'true',
      })
    ).toEqual({
      hasToken: true,
      tokenSource: 'NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED',
    });
  });

  it('reports missing token before connection can start', () => {
    expect(
      getVercelConnectionState({
        environment: { hasToken: false },
        readinessStatus: 'Ready to connect',
      })
    ).toMatchObject({
      status: 'Missing Vercel token',
      disabled: true,
    });
  });

  it('keeps Vercel disconnected until the project is ready', () => {
    expect(
      getVercelConnectionState({
        environment: { hasToken: true, tokenSource: 'VERCEL_TOKEN' },
        readinessStatus: 'Needs production check',
      })
    ).toMatchObject({
      status: 'Not connected',
      disabled: true,
    });
  });

  it('marks Vercel ready to connect when token and readiness are present', () => {
    expect(
      getVercelConnectionState({
        environment: { hasToken: true, tokenSource: 'VERCEL_TOKEN' },
        readinessStatus: 'Ready to connect',
      })
    ).toMatchObject({
      status: 'Ready to connect',
      disabled: true,
    });
  });

  it('keeps deployment request and result types available for the next step', () => {
    const project: VercelProjectConfig = {
      projectName: 'demo',
      framework: 'nextjs',
      rootDirectory: '.',
    };
    const request: VercelDeploymentRequest = {
      project,
      files: [{ path: 'package.json', content: '{}' }],
      target: 'production',
      requestedAt: '2026-06-28T12:00:00.000Z',
    };
    const result: VercelDeploymentResult = {
      success: false,
      status: 'skipped',
      logs: [
        {
          timestamp: request.requestedAt,
          level: 'info',
          message: 'No live Vercel call is made by the foundation module.',
        },
      ],
    };

    expect(request.project.projectName).toBe('demo');
    expect(result.status).toBe('skipped');
  });
});
