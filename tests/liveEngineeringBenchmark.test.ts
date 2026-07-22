import { describe, expect, it } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  canStartLiveEngineeringBenchmark,
  createBenchmarkApiRouteAiClient,
  DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS,
  getEngineeringAcceptanceFixture,
  LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
  resolveBenchmarkProviderEndpoint,
  runLiveEngineeringBenchmark,
} from '@/lib/engineering-benchmarks';
import type { RepositoryModel } from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import type {
  TaskExecutionAiClient,
  TaskExecutionValidationRunner,
  TaskValidationResult,
} from '@/lib/task-execution';

function contentFor(path: string): string {
  if (path === 'package.json') {
    return JSON.stringify(
      {
        scripts: {
          dev: 'next dev',
          build: 'next build',
          start: 'next start',
          'type-check': 'tsc --noEmit',
        },
        dependencies: {
          next: '^15.1.0',
          react: '^19.0.0',
          'react-dom': '^19.0.0',
        },
        devDependencies: {
          typescript: '^5.0.0',
        },
      },
      null,
      2
    );
  }
  if (path === 'tsconfig.json') {
    return JSON.stringify({ compilerOptions: { strict: true } }, null, 2);
  }
  if (path.endsWith('.css')) return '@tailwind base;\n@tailwind components;\n@tailwind utilities;\n';
  if (path.endsWith('.json')) return '{}\n';
  if (path.endsWith('.md')) return '# Benchmark\n';
  if (path.endsWith('.env.example')) return 'NEXT_PUBLIC_APP_URL=\n';
  if (path.endsWith('.tsx')) {
    const name = path
      .replace(/^src\/app\//, '')
      .replace(/\/page\.tsx$/, '')
      .replace(/^page\.tsx$/, 'home')
      .replace(/[^a-z0-9]+/gi, ' ');
    return `export const metadata = { title: '${name || 'Home'}' };\n\nexport default function Page() {\n  return <main><h1>${name || 'Home'}</h1></main>;\n}\n`;
  }
  if (path.endsWith('.ts')) {
    return `export const ${path
      .split('/')
      .pop()!
      .replace(/\W+/g, '_')} = true;\n`;
  }
  return `${path}\n`;
}

function fencedCreate(path: string): string {
  const ext = path.split('.').pop() ?? 'ts';
  return `\`\`\`${ext}
// path: ${path}
${contentFor(path)}
\`\`\``;
}

function fakeAiClient(): TaskExecutionAiClient & { requests: string[] } {
  const requests: string[] = [];
  return {
    requests,
    complete: async (_messages, options) => {
      requests.push(options.task.id);
      return {
        content: options.task.expectedFiles.map(fencedCreate).join('\n\n'),
        finishReason: 'stop',
      };
    },
  };
}

function jsonResponse(data: unknown, init: { status?: number; ok?: boolean } = {}) {
  const status = init.status ?? 200;
  return {
    ok: init.ok ?? (status >= 200 && status < 300),
    status,
    json: async () => data,
  } as Response;
}

function fileExists(files: FileNode[], path: string): boolean {
  const stack = [...files];
  while (stack.length) {
    const item = stack.pop()!;
    if (item.type === 'file' && item.path === path) return true;
    stack.push(...(item.children ?? []));
  }
  return false;
}

function validationRunner(
  options: {
    failFirstTaskOnce?: boolean;
    blocked?: boolean;
  } = {}
): TaskExecutionValidationRunner & { calls: string[] } {
  const calls: string[] = [];
  const failed = new Set<string>();
  return {
    calls,
    validate: async (
      files: FileNode[],
      task: TaskGraphTask,
      _repositoryModel: RepositoryModel
    ): Promise<TaskValidationResult> => {
      calls.push(task.id);
      if (options.blocked) {
        return {
          ok: false,
          outcome: 'blocked by environment',
          summary: 'Validation blocked by mocked environment.',
          commands: [],
          errors: ['Validation blocked by mocked environment.'],
          warnings: [],
        };
      }
      if (options.failFirstTaskOnce && !failed.has(task.id)) {
        failed.add(task.id);
        return {
          ok: false,
          outcome: 'recoverable',
          summary: 'Mocked scoped validation failed once.',
          commands: [],
          errors: ['Mocked scoped validation failed once.'],
          warnings: [],
        };
      }
      const missing = task.expectedFiles.filter((path) => !fileExists(files, path));
      return {
        ok: missing.length === 0,
        outcome: missing.length === 0 ? 'passed' : 'recoverable',
        summary:
          missing.length === 0
            ? 'Task validation passed.'
            : `Missing files: ${missing.join(', ')}`,
        commands: [],
        errors: missing.map((path) => `Missing ${path}`),
        warnings: [],
      };
    },
  };
}

describe('live engineering benchmark harness', () => {
  it('rejects relative app URLs in CLI provider mode', () => {
    expect(() => resolveBenchmarkProviderEndpoint('/api/ai/chat-completion')).toThrow(
      /invalid MATRIX_CODER_APP_BASE_URL/i
    );
  });

  it('accepts a valid absolute localhost base URL and resolves the chat endpoint', () => {
    expect(resolveBenchmarkProviderEndpoint('http://localhost:3000')).toEqual({
      baseUrl: 'http://localhost:3000',
      endpoint: 'http://localhost:3000/api/ai/chat-completion',
    });
  });

  it('rejects invalid provider URL protocols and embedded credentials', () => {
    expect(() => resolveBenchmarkProviderEndpoint('file:///tmp/app')).toThrow(
      /http or https/i
    );
    expect(() =>
      resolveBenchmarkProviderEndpoint('http://user:pass@localhost:3000')
    ).toThrow(/credentials/i);
  });

  it('requires explicit opt-in and refuses all-benchmark execution', () => {
    expect(
      canStartLiveEngineeringBenchmark({
        fixtureId: 'all',
        confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
        aiClientProvided: true,
      })
    ).toMatchObject({ ok: false });
    expect(
      canStartLiveEngineeringBenchmark({
        fixtureId: 'simple-business-website',
        aiClientProvided: true,
      }).errors.join('\n')
    ).toMatch(/requires confirmation/i);
  });

  it('does not start automatically without a provider or injected client', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
    });

    expect(result.stopReason).toBe('safety-refused');
    expect(result.aiRequestCount).toBe(0);
    expect(result.errors.join('\n')).toMatch(/provider use is disabled/i);
  });

  it('fails provider configuration before spending a request when base URL is missing', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      allowLiveProvider: true,
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.stopReason).toBe('provider-configuration');
    expect(result.providerErrorKind).toBe('configuration');
    expect(result.aiRequestCount).toBe(0);
    expect(result.taskResults).toHaveLength(0);
    expect(result.generatedFileCount).toBe(0);
    expect(result.errors.join('\n')).toMatch(/MATRIX_CODER_APP_BASE_URL is required/i);
  });

  it('keeps injected fake clients working without app URL configuration', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: fakeAiClient(),
      validationRunner: validationRunner(),
      limits: { maxTasks: 1, maxAiRequests: 3 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.stopReason).toBe('completed');
    expect(result.aiRequestCount).toBe(1);
  });

  it('builds provider requests through a validated absolute app URL', async () => {
    const calls: Array<{ url: string; body: any }> = [];
    const firstTask = getEngineeringAcceptanceFixture(
      'simple-business-website'
    )!.taskGraph.tasks[0];
    const client = createBenchmarkApiRouteAiClient({
      appBaseUrl: 'http://localhost:3000',
      fetchImpl: (async (url, init) => {
        calls.push({
          url: String(url),
          body: JSON.parse(String(init?.body ?? '{}')),
        });
        return jsonResponse({
          choices: [
            {
              message: {
                content: firstTask.expectedFiles.map(fencedCreate).join('\n\n'),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        });
      }) as typeof fetch,
    });

    const response = await client.complete([{ role: 'user', content: 'hello' }], {
      task: firstTask,
      context: {} as any,
      runId: 'run',
      operationId: 'op',
    });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://localhost:3000/api/ai/chat-completion');
    expect(calls[0].body).toMatchObject({
      provider: 'OPEN_AI',
      model: 'gpt-5.5',
      stream: false,
    });
    expect(response.content).toContain('package.json');
  });

  it('meters provider calls from the live harness', async () => {
    const firstTask = getEngineeringAcceptanceFixture(
      'simple-business-website'
    )!.taskGraph.tasks[0];
    let providerCalls = 0;
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      allowLiveProvider: true,
      appBaseUrl: 'http://localhost:3000',
      providerFetchImpl: (async () => {
        providerCalls += 1;
        return jsonResponse({
          choices: [
            {
              message: {
                content: firstTask.expectedFiles.map(fencedCreate).join('\n\n'),
              },
              finish_reason: 'stop',
            },
          ],
        });
      }) as typeof fetch,
      validationRunner: validationRunner(),
      limits: { maxTasks: 1, maxAiRequests: 2 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(providerCalls).toBe(1);
    expect(result.aiRequestCount).toBe(1);
    expect(result.taskResults).toHaveLength(1);
  });

  it('classifies provider authentication failures separately from task failures', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      allowLiveProvider: true,
      appBaseUrl: 'http://localhost:3000',
      providerFetchImpl: (async () =>
        jsonResponse(
          { error: 'OPEN_AI API error: 401', details: 'Bearer abc.def rejected' },
          { status: 401, ok: false }
        )) as typeof fetch,
      validationRunner: validationRunner(),
      limits: { maxTasks: 1, maxAiRequests: 2 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    const serialized = JSON.stringify(result);
    expect(result.stopReason).toBe('provider-error');
    expect(result.providerErrorKind).toBe('authentication');
    expect(result.taskResults).toHaveLength(0);
    expect(result.generatedFileCount).toBe(0);
    expect(serialized).not.toContain('Bearer abc.def');
  });

  it('creates an isolated workspace and executes one task at a time', async () => {
    const ai = fakeAiClient();
    const validation = validationRunner();
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: ai,
      validationRunner: validation,
      limits: { maxTasks: 1, maxAiRequests: 3 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.stopReason).toBe('completed');
    expect(result.isolatedProjectId).toContain('simple-business-website');
    expect(result.isolatedWorkspaceId).toContain(result.runId);
    expect(result.taskResults).toHaveLength(1);
    expect(ai.requests).toEqual(['task-foundation-project-foundation']);
    expect(result.generatedFileCount).toBeGreaterThan(0);
    expect(result.filesCreated).toContain('package.json');
  });

  it('enforces AI request limits before continuing to another task', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: fakeAiClient(),
      validationRunner: validationRunner(),
      limits: { maxTasks: 3, maxAiRequests: 1 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.stopReason).toBe('cost-limit');
    expect(result.aiRequestCount).toBe(1);
    expect(result.taskResults).toHaveLength(1);
  });

  it('uses targeted retry for the failed task only and honors retry limits', async () => {
    const ai = fakeAiClient();
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: ai,
      validationRunner: validationRunner({ failFirstTaskOnce: true }),
      limits: { maxTasks: 1, maxAiRequests: 4, maxTaskRepairAttempts: 1 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.taskResults).toHaveLength(1);
    expect(result.taskResults[0].repairCount).toBe(1);
    expect(result.repairCount).toBe(1);
    expect(ai.requests).toEqual([
      'task-foundation-project-foundation',
      'task-foundation-project-foundation',
    ]);
  });

  it('records cancellation without marking blocked checks as passed', async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: fakeAiClient(),
      validationRunner: validationRunner(),
      signal: controller.signal,
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.cancelled).toBe(true);
    expect(result.stopReason).toBe('cancelled');
    expect(result.taskStatuses.cancelled ?? 0).toBeGreaterThan(0);
  });

  it('serializes benchmark results without secrets or raw model output', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: {
        complete: async () => {
          throw new Error('provider failed with sk-test-secret and Bearer abc.def');
        },
      },
      validationRunner: validationRunner(),
      limits: { maxTasks: 1, maxAiRequests: 1 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('sk-test-secret');
    expect(serialized).not.toContain('Bearer abc.def');
    expect(result.stopReason).toBe('error');
  });

  it('keeps blocked validation as blocked rather than passed', async () => {
    const result = await runLiveEngineeringBenchmark({
      fixtureId: 'simple-business-website',
      confirmation: LIVE_ENGINEERING_BENCHMARK_CONFIRMATION,
      aiClient: fakeAiClient(),
      validationRunner: validationRunner({ blocked: true }),
      limits: { maxTasks: 1, maxAiRequests: 2 },
      now: new Date('2026-07-21T00:00:00.000Z'),
    });

    expect(result.stopReason).toBe('task-blocked');
    expect(result.taskResults[0].status).toBe('blocked');
    expect(result.finalScore).toBeLessThan(100);
  });

  it('uses conservative default live limits', () => {
    expect(DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS).toMatchObject({
      maxTasks: 14,
      maxAiRequests: 20,
      maxTaskRepairAttempts: 1,
      stopOnCostLimit: true,
      stopOnTimeLimit: true,
    });
  });

  it('loads the simple-business fixture for the first live benchmark', () => {
    const fixture = getEngineeringAcceptanceFixture('simple-business-website');

    expect(fixture?.id).toBe('simple-business-website');
    expect(fixture?.taskGraph.tasks.length).toBeLessThanOrEqual(
      DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS.maxTasks
    );
  });
});
