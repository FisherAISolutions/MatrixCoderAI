import { describe, expect, it } from 'vitest';
import { getGenerationBenchmark } from '@/lib/generation/benchmarks';
import {
  detectRoutesFromGeneratedFiles,
  runBenchmarkExecutionHarness,
} from '@/lib/generation/benchmarkExecutionHarness';
import type { GenerationBenchmark } from '@/lib/generation/benchmarks';

function routeFile(route: string): string {
  if (route === '/') return 'src/app/page.tsx';
  return `src/app/${route.replace(/^\/+/, '').replace(/\/+$/, '')}/page.tsx`;
}

function validFilesFor(benchmark: GenerationBenchmark): string[] {
  return [
    'package.json',
    'src/app/layout.tsx',
    'src/app/globals.css',
    ...benchmark.expectedRoutes.map(routeFile),
  ];
}

describe('benchmark execution harness', () => {
  it('supports dry-run mode without invoking generation', async () => {
    const logs: string[] = [];

    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: true,
      logger: (message) => logs.push(message),
      generator: () => {
        throw new Error('should not run');
      },
    });

    expect(result.status).toBe('dry-run');
    expect(result.benchmarkId).toBe('personal-crm');
    expect(result.prompt).toContain('Build a Personal CRM application');
    expect(result.generatedFileCount).toBe(0);
    expect(result.validationStatus).toBe('not-run');
    expect(result.riskEstimate).toMatchObject({
      level: 'medium',
      expectedRouteCount: 5,
    });
    expect(logs.join('\n')).toContain('mode=dry-run');
    expect(logs.join('\n')).toContain('expected_routes=/, /contacts, /companies, /tasks, /pipeline');
    expect(logs.join('\n')).toContain('forbidden_routes=/add-note, /history, /preserve, /names');
  });

  it('requires an explicit benchmark id', async () => {
    const result = await runBenchmarkExecutionHarness({
      devOnly: true,
      dryRun: true,
    });

    expect(result.status).toBe('refused');
    expect(result.errors.join('\n')).toMatch(/explicit benchmark id is required/i);
  });

  it('refuses all-benchmark execution', async () => {
    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'all',
      devOnly: true,
      dryRun: false,
      confirmExecution: true,
      generator: () => [],
    });

    expect(result.status).toBe('refused');
    expect(result.errors.join('\n')).toMatch(/refusing to run all benchmarks/i);
  });

  it('requires the dev-only guard before dry-run or execution', async () => {
    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      dryRun: true,
    });

    expect(result.status).toBe('refused');
    expect(result.errors.join('\n')).toMatch(/dev-only/i);
  });

  it('refuses live execution without explicit confirmation', async () => {
    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: false,
      generator: () => {
        throw new Error('should not run');
      },
    });

    expect(result.status).toBe('refused');
    expect(result.errors.join('\n')).toMatch(/confirmExecution: true/);
  });

  it('refuses live execution without an injected Matrix Coder adapter', async () => {
    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: false,
      confirmExecution: true,
    });

    expect(result.status).toBe('refused');
    expect(result.errors.join('\n')).toMatch(/Matrix Coder adapter/);
  });

  it('runs one selected benchmark with an injected fake generator', async () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;
    let tick = 1000;

    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: false,
      confirmExecution: true,
      now: () => (tick += 50),
      generator: () => ({
        generatedFiles: validFilesFor(benchmark),
        previewConnected: true,
        autoFixAttemptCount: 1,
        warnings: ['fake execution only'],
        log: 'fake generator completed',
      }),
    });

    expect(result.status).toBe('passed');
    expect(result.benchmarkName).toBe('Personal CRM');
    expect(result.generationSuccess).toBe(true);
    expect(result.validationSuccess).toBe(true);
    expect(result.durationMs).toBe(50);
    expect(result.generatedFileCount).toBe(validFilesFor(benchmark).length);
    expect(result.generatedFilePaths).toContain('src/app/pipeline/page.tsx');
    expect(result.detectedRoutes).toEqual([
      '/',
      '/companies',
      '/contacts',
      '/pipeline',
      '/tasks',
    ]);
    expect(result.missingRequiredRoutes).toEqual([]);
    expect(result.forbiddenRoutesFound).toEqual([]);
    expect(result.validationStatus).toBe('passed');
    expect(result.previewConnected).toBe(true);
    expect(result.autoFixAttemptCount).toBe(1);
    expect(result.warnings).toContain('fake execution only');
    expect(result.log).toContain('fake generator completed');
  });

  it('runs one selected benchmark through an injected Matrix Coder adapter', async () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;
    const seen: string[] = [];

    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: false,
      confirmExecution: true,
      matrixCoderAdapter: (request) => {
        seen.push(request.benchmarkId);
        expect(request.benchmark).toBe(benchmark);
        expect(request.prompt).toContain('Build a Personal CRM application');
        expect(request.expectedRoutes).toEqual(benchmark.expectedRoutes);
        expect(request.forbiddenRoutes).toEqual(benchmark.forbiddenRoutes);
        return {
          generatedFiles: validFilesFor(benchmark),
          generationSuccess: true,
          previewConnected: true,
          autoFixAttemptCount: 2,
          log: 'matrix coder adapter completed',
        };
      },
    });

    expect(seen).toEqual(['personal-crm']);
    expect(result.status).toBe('passed');
    expect(result.benchmarkId).toBe('personal-crm');
    expect(result.benchmarkName).toBe('Personal CRM');
    expect(result.generationSuccess).toBe(true);
    expect(result.validationSuccess).toBe(true);
    expect(result.generatedFileCount).toBe(validFilesFor(benchmark).length);
    expect(result.detectedRoutes).toContain('/pipeline');
    expect(result.previewConnected).toBe(true);
    expect(result.autoFixAttemptCount).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.log).toContain('matrix coder adapter completed');
  });

  it('detects generated src/app routes from file paths', () => {
    expect(
      detectRoutesFromGeneratedFiles([
        'src/app/page.tsx',
        'src/app/tasks/page.tsx',
        'src/app/pipeline/page.tsx',
        'src/app/api/health/route.ts',
        'src/components/crm/ContactsClient.tsx',
        'app/history/page.tsx',
      ])
    ).toEqual(['/', '/history', '/pipeline', '/tasks']);
  });

  it('captures missing and forbidden routes from injected generation output', async () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;

    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: false,
      confirmExecution: true,
      generator: () => [
        ...validFilesFor(benchmark).filter((path) => path !== 'src/app/tasks/page.tsx'),
        'src/app/history/page.tsx',
      ],
    });

    expect(result.status).toBe('failed');
    expect(result.generationSuccess).toBe(true);
    expect(result.validationSuccess).toBe(false);
    expect(result.validationStatus).toBe('failed');
    expect(result.missingRequiredRoutes).toContainEqual(
      expect.objectContaining({
        route: '/tasks',
        path: 'src/app/tasks/page.tsx',
      })
    );
    expect(result.forbiddenRoutesFound).toContainEqual(
      expect.objectContaining({
        route: '/history',
        path: 'src/app/history/page.tsx',
      })
    );
  });

  it('captures injected generator errors', async () => {
    const result = await runBenchmarkExecutionHarness({
      benchmarkId: 'personal-crm',
      devOnly: true,
      dryRun: false,
      confirmExecution: true,
      generator: () => {
        throw new Error('fake generator crashed');
      },
    });

    expect(result.status).toBe('error');
    expect(result.errors).toEqual(['fake generator crashed']);
    expect(result.validationStatus).toBe('not-run');
  });
});
