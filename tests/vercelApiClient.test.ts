import { describe, expect, it, vi } from 'vitest';
import {
  VercelApiError,
  createVercelApiClient,
  redactToken,
  redactTokenFromText,
} from '@/lib/deployment/vercelApiClient';

function jsonResponse(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('Vercel API client foundation', () => {
  it('redacts tokens without exposing token fragments', () => {
    const token = 'very-sensitive-token';

    expect(redactToken(token)).toBe('[redacted-token:20]');
    expect(redactTokenFromText(`Bearer ${token}`, token)).toBe(
      'Bearer [redacted-token:20]'
    );
    expect(redactTokenFromText(`Bearer ${token}`, token)).not.toContain(token);
  });

  it('validates a token by requesting the current user through injected fetch', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return jsonResponse({ id: 'user_1', username: 'matrix' });
    }) as typeof fetch;

    const client = createVercelApiClient({
      token: 'test-token',
      baseUrl: 'https://mock.vercel.test',
      fetchImpl,
    });
    const user = await client.validateToken();
    const headers = new Headers(calls[0].init?.headers);

    expect(user).toEqual({ id: 'user_1', username: 'matrix' });
    expect(calls[0].url).toBe('https://mock.vercel.test/v2/user');
    expect(headers.get('Authorization')?.startsWith('Bearer ')).toBe(true);
  });

  it('finds an existing project or returns null for 404', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ id: 'prj_1', name: 'demo' }))
      .mockResolvedValueOnce(jsonResponse({ error: 'missing' }, 404)) as typeof fetch;
    const client = createVercelApiClient({
      token: 'test-token',
      baseUrl: 'https://mock.vercel.test',
      fetchImpl,
    });

    await expect(client.findProject('demo', 'team_1')).resolves.toMatchObject({
      id: 'prj_1',
      name: 'demo',
    });
    await expect(client.findProject('missing')).resolves.toBeNull();
  });

  it('creates a project when createOrFindProject cannot find one', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'missing' }, 404))
      .mockResolvedValueOnce(jsonResponse({ id: 'prj_2', name: 'demo' }));
    const client = createVercelApiClient({
      token: 'test-token',
      baseUrl: 'https://mock.vercel.test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const project = await client.createOrFindProject({
      projectName: 'demo',
      framework: 'nextjs',
      rootDirectory: '.',
      buildCommand: 'npm run build',
      teamId: 'team_1',
    });
    const [, createCall] = fetchMock.mock.calls;

    expect(project).toMatchObject({ id: 'prj_2', name: 'demo' });
    expect(String(createCall[0])).toBe(
      'https://mock.vercel.test/v10/projects?teamId=team_1'
    );
    expect(createCall[1]?.method).toBe('POST');
  });

  it('shapes upload, deployment, and polling requests with mocked responses', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([{ path: 'package.json', size: 2 }]))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          status: 'queued',
          deploymentId: 'dpl_1',
          logs: [],
        })
      )
      .mockResolvedValueOnce(jsonResponse({ id: 'dpl_1', state: 'READY' }));
    const client = createVercelApiClient({
      token: 'test-token',
      baseUrl: 'https://mock.vercel.test',
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await expect(
      client.uploadDeploymentFiles([{ path: 'package.json', content: '{}' }], 'team_1')
    ).resolves.toEqual([{ path: 'package.json', size: 2 }]);
    await expect(
      client.createDeployment({
        project: {
          projectName: 'demo',
          framework: 'nextjs',
          rootDirectory: '.',
          buildCommand: 'npm run build',
        },
        files: [{ path: 'package.json', content: '{}' }],
        target: 'production',
        teamId: 'team_1',
      })
    ).resolves.toMatchObject({ success: true, deploymentId: 'dpl_1' });
    await expect(client.pollDeploymentStatus('dpl_1', 'team_1')).resolves.toEqual({
      id: 'dpl_1',
      state: 'READY',
    });

    expect(String(fetchMock.mock.calls[0][0])).toBe(
      'https://mock.vercel.test/v2/files?teamId=team_1'
    );
    expect(String(fetchMock.mock.calls[1][0])).toBe(
      'https://mock.vercel.test/v13/deployments?teamId=team_1'
    );
    expect(String(fetchMock.mock.calls[2][0])).toBe(
      'https://mock.vercel.test/v13/deployments/dpl_1?teamId=team_1'
    );
  });

  it('redacts tokens from API error details', async () => {
    const token = 'sensitive-token';
    const fetchImpl = vi.fn(async () =>
      new Response(`request included ${token}`, { status: 500 })
    ) as typeof fetch;
    const client = createVercelApiClient({
      token,
      baseUrl: 'https://mock.vercel.test',
      fetchImpl,
    });

    await expect(client.getUser()).rejects.toMatchObject({
      name: 'VercelApiError',
      status: 500,
      details: 'request included [redacted-token:15]',
    } satisfies Partial<VercelApiError>);
  });
});
