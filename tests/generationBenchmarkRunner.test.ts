import { describe, expect, it } from 'vitest';
import { getGenerationBenchmark } from '@/lib/generation/benchmarks';
import {
  runGenerationBenchmark,
  runGenerationBenchmarkSuite,
} from '@/lib/generation/benchmarkRunner';
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

describe('generation benchmark runner', () => {
  it('runs a benchmark and reports a passing validation result', async () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;
    let tick = 100;

    const result = await runGenerationBenchmark(
      benchmark,
      () => ({
        generatedFiles: validFilesFor(benchmark),
        metadata: { attempt: 1 },
        log: 'generated fake files',
      }),
      { now: () => (tick += 25) }
    );

    expect(result).toMatchObject({
      benchmarkId: 'personal-crm',
      status: 'passed',
      generatedFileCount: validFilesFor(benchmark).length,
      metadata: { attempt: 1 },
      log: 'generated fake files',
    });
    expect(result.durationMs).toBe(25);
    expect(result.validation.ok).toBe(true);
  });

  it('reports validation failures from missing route files', async () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;

    const result = await runGenerationBenchmark(benchmark, () =>
      validFilesFor(benchmark).filter((path) => path !== 'src/app/pipeline/page.tsx')
    );

    expect(result.status).toBe('failed');
    expect(result.validation.ok).toBe(false);
    expect(result.validation.issues).toContainEqual(
      expect.objectContaining({
        type: 'missing-required-route',
        route: '/pipeline',
      })
    );
  });

  it('reports generator errors without throwing the whole suite', async () => {
    const benchmark = getGenerationBenchmark('expense-tracker')!;

    const result = await runGenerationBenchmark(benchmark, () => {
      throw new Error('generator crashed');
    });

    expect(result.status).toBe('error');
    expect(result.error).toBe('generator crashed');
    expect(result.generatedFileCount).toBe(0);
    expect(result.validation.ok).toBe(false);
  });

  it('runs a benchmark suite serially and summarizes results', async () => {
    const crm = getGenerationBenchmark('personal-crm')!;
    const expenses = getGenerationBenchmark('expense-tracker')!;
    const habits = getGenerationBenchmark('habit-tracker')!;
    const seen: string[] = [];

    const suite = await runGenerationBenchmarkSuite(
      (benchmark) => {
        seen.push(benchmark.id);
        if (benchmark.id === 'expense-tracker') {
          return validFilesFor(benchmark).filter(
            (path) => path !== 'src/app/reports/page.tsx'
          );
        }
        if (benchmark.id === 'habit-tracker') {
          throw new Error('simulated stop');
        }
        return validFilesFor(benchmark);
      },
      { benchmarks: [crm, expenses, habits] }
    );

    expect(seen).toEqual(['personal-crm', 'expense-tracker', 'habit-tracker']);
    expect(suite.summary).toEqual({
      total: 3,
      passed: 1,
      failed: 1,
      errored: 1,
    });
    expect(suite.results.map((result) => result.status)).toEqual([
      'passed',
      'failed',
      'error',
    ]);
  });
});
