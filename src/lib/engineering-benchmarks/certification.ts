import { DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS } from './liveHarness';
import { getEngineeringAcceptanceFixture } from './fixtures';
import type {
  EngineeringBenchmarkId,
  LiveEngineeringBenchmarkResult,
} from './types';

export const CORE_BETA_BENCHMARK_IDS: EngineeringBenchmarkId[] = [
  'simple-business-website',
  'crud-saas-dashboard',
  'children-story-platform',
];

export interface BenchmarkCertificationEntry {
  fixtureId: EngineeringBenchmarkId;
  displayName: string;
  taskCount: number;
  expectedRoutes: string[];
  expectedCapabilities: string[];
  liveCommand: string;
  result?: LiveEngineeringBenchmarkResult;
}

export interface BenchmarkCertificationReport {
  generatedAt: string;
  limits: typeof DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS;
  entries: BenchmarkCertificationEntry[];
  completed: number;
  passed: number;
  failed: number;
  blocked: number;
}

export function getGuardedLiveBenchmarkCommand(
  fixtureId: EngineeringBenchmarkId,
  baseUrl = 'http://localhost:3000'
): string {
  return [
    `$env:MATRIX_CODER_LIVE_BENCHMARK_ID='${fixtureId}'`,
    "$env:MATRIX_CODER_LIVE_BENCHMARK_CONFIRM='RUN_LIVE_ENGINEERING_BENCHMARK'",
    "$env:MATRIX_CODER_LIVE_BENCHMARK_PROVIDER='1'",
    `$env:MATRIX_CODER_APP_BASE_URL='${baseUrl}'`,
    'node scripts/engineering-benchmark-live.cjs',
  ].join('; ');
}

export function createBenchmarkCertificationReport(
  results: LiveEngineeringBenchmarkResult[] = [],
  now = new Date()
): BenchmarkCertificationReport {
  const byFixture = new Map(results.map((result) => [result.fixtureId, result]));
  const entries = CORE_BETA_BENCHMARK_IDS.map((fixtureId) => {
    const fixture = getEngineeringAcceptanceFixture(fixtureId);
    if (!fixture) throw new Error(`Missing core benchmark fixture ${fixtureId}.`);
    return {
      fixtureId,
      displayName: fixture.displayName,
      taskCount: fixture.taskGraph.tasks.length,
      expectedRoutes: fixture.expectedRoutes,
      expectedCapabilities: fixture.expectedCapabilityIds,
      liveCommand: getGuardedLiveBenchmarkCommand(fixtureId),
      result: byFixture.get(fixtureId),
    };
  });

  return {
    generatedAt: now.toISOString(),
    limits: { ...DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS },
    entries,
    completed: entries.filter((entry) => entry.result).length,
    passed: entries.filter(
      (entry) =>
        entry.result?.stopReason === 'completed' &&
        entry.result.contractReview?.completionAllowed === true
    ).length,
    failed: entries.filter(
      (entry) =>
        entry.result &&
        !['completed', 'task-blocked'].includes(entry.result.stopReason)
    ).length,
    blocked: entries.filter(
      (entry) =>
        entry.result?.stopReason === 'task-blocked' ||
        (entry.result?.blockedChecks.length ?? 0) > 0
    ).length,
  };
}
