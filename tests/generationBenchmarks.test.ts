import { describe, expect, it } from 'vitest';
import {
  GENERATION_BENCHMARKS,
  ROUTE_BIAS_FORBIDDEN_ROUTES,
  getGenerationBenchmark,
} from '@/lib/generation/benchmarks';
import { validateGeneratedFilesAgainstBenchmark } from '@/lib/generation/benchmarkValidation';

function routeFile(route: string): string {
  if (route === '/') return 'src/app/page.tsx';
  return `src/app/${route.replace(/^\/+/, '').replace(/\/+$/, '')}/page.tsx`;
}

describe('generation benchmark suite', () => {
  it('defines the expected benchmark ids', () => {
    expect(GENERATION_BENCHMARKS.map((benchmark) => benchmark.id)).toEqual([
      'personal-crm',
      'expense-tracker',
      'inventory-manager',
      'kanban-board',
      'booking-scheduler',
      'saas-analytics-dashboard',
      'habit-tracker',
      'ecommerce-admin',
    ]);
  });

  it('includes route-bias forbidden routes on every benchmark', () => {
    for (const benchmark of GENERATION_BENCHMARKS) {
      for (const route of ROUTE_BIAS_FORBIDDEN_ROUTES) {
        expect(benchmark.forbiddenRoutes).toContain(route);
      }
    }
  });

  it('keeps every benchmark definition complete enough for reuse', () => {
    for (const benchmark of GENERATION_BENCHMARKS) {
      expect(benchmark.displayName).toBeTruthy();
      expect(benchmark.appType).toBeTruthy();
      expect(benchmark.prompt).toContain('Next.js 15');
      expect(benchmark.expectedRoutes.length).toBeGreaterThan(1);
      expect(benchmark.expectedRoutes).toContain('/');
      expect(benchmark.expectedCoreFeatures.length).toBeGreaterThanOrEqual(4);
    }
  });

  it('passes when all expected src/app routes exist and forbidden routes are absent', () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;
    const generatedFiles = [
      'package.json',
      'src/app/layout.tsx',
      'src/app/globals.css',
      'src/components/crm/ContactsClient.tsx',
      ...benchmark.expectedRoutes.map(routeFile),
    ];

    const result = validateGeneratedFilesAgainstBenchmark(benchmark, generatedFiles);

    expect(result.ok).toBe(true);
    expect(result.issues).toEqual([]);
  });

  it('fails when an expected route file is missing', () => {
    const benchmark = getGenerationBenchmark('personal-crm')!;
    const generatedFiles = benchmark.expectedRoutes
      .filter((route) => route !== '/pipeline')
      .map(routeFile);

    const result = validateGeneratedFilesAgainstBenchmark(benchmark, generatedFiles);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'missing-required-route',
        route: '/pipeline',
        path: 'src/app/pipeline/page.tsx',
      })
    );
  });

  it('fails when a forbidden route is generated', () => {
    const benchmark = getGenerationBenchmark('expense-tracker')!;
    const generatedFiles = [
      ...benchmark.expectedRoutes.map(routeFile),
      'src/app/history/page.tsx',
      'src/app/preserve/page.tsx',
    ];

    const result = validateGeneratedFilesAgainstBenchmark(benchmark, generatedFiles);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'forbidden-route-present',
        route: '/history',
        path: 'src/app/history/page.tsx',
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'forbidden-route-present',
        route: '/preserve',
        path: 'src/app/preserve/page.tsx',
      })
    );
  });

  it('fails when generated files use the root app directory', () => {
    const benchmark = getGenerationBenchmark('kanban-board')!;
    const generatedFiles = [
      ...benchmark.expectedRoutes.map(routeFile),
      'app/page.tsx',
      'app/boards/page.tsx',
    ];

    const result = validateGeneratedFilesAgainstBenchmark(benchmark, generatedFiles);

    expect(result.ok).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'root-app-file-present',
        path: 'app/page.tsx',
      })
    );
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        type: 'root-app-file-present',
        path: 'app/boards/page.tsx',
      })
    );
  });

  it('normalizes Windows-style paths before validation', () => {
    const benchmark = getGenerationBenchmark('habit-tracker')!;
    const generatedFiles = benchmark.expectedRoutes
      .map(routeFile)
      .map((path) => path.replace(/\//g, '\\'));

    const result = validateGeneratedFilesAgainstBenchmark(benchmark, generatedFiles);

    expect(result.ok).toBe(true);
  });
});
