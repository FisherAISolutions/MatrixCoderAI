import {
  GENERATION_BENCHMARKS,
  type GenerationBenchmark,
} from './benchmarks';
import {
  validateGeneratedFilesAgainstBenchmark,
  type BenchmarkValidationResult,
} from './benchmarkValidation';

export interface BenchmarkGeneratorOutput {
  generatedFiles: string[];
  metadata?: Record<string, unknown>;
  log?: string;
}

export type BenchmarkGenerator = (
  benchmark: GenerationBenchmark
) => Promise<BenchmarkGeneratorOutput | string[]> | BenchmarkGeneratorOutput | string[];

export type BenchmarkRunStatus = 'passed' | 'failed' | 'error';

export interface BenchmarkRunResult {
  benchmarkId: string;
  displayName: string;
  appType: string;
  status: BenchmarkRunStatus;
  durationMs: number;
  generatedFileCount: number;
  validation: BenchmarkValidationResult;
  metadata?: Record<string, unknown>;
  log?: string;
  error?: string;
}

export interface BenchmarkSuiteSummary {
  total: number;
  passed: number;
  failed: number;
  errored: number;
}

export interface BenchmarkSuiteRunResult {
  summary: BenchmarkSuiteSummary;
  results: BenchmarkRunResult[];
}

export interface RunBenchmarkOptions {
  now?: () => number;
}

export interface RunBenchmarkSuiteOptions extends RunBenchmarkOptions {
  benchmarks?: GenerationBenchmark[];
}

function normalizeGeneratorOutput(
  output: BenchmarkGeneratorOutput | string[]
): BenchmarkGeneratorOutput {
  return Array.isArray(output) ? { generatedFiles: output } : output;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function runGenerationBenchmark(
  benchmark: GenerationBenchmark,
  generator: BenchmarkGenerator,
  options: RunBenchmarkOptions = {}
): Promise<BenchmarkRunResult> {
  const now = options.now ?? Date.now;
  const startedAt = now();

  try {
    const output = normalizeGeneratorOutput(await generator(benchmark));
    const validation = validateGeneratedFilesAgainstBenchmark(
      benchmark,
      output.generatedFiles
    );

    return {
      benchmarkId: benchmark.id,
      displayName: benchmark.displayName,
      appType: benchmark.appType,
      status: validation.ok ? 'passed' : 'failed',
      durationMs: Math.max(0, now() - startedAt),
      generatedFileCount: output.generatedFiles.length,
      validation,
      metadata: output.metadata,
      log: output.log,
    };
  } catch (error) {
    return {
      benchmarkId: benchmark.id,
      displayName: benchmark.displayName,
      appType: benchmark.appType,
      status: 'error',
      durationMs: Math.max(0, now() - startedAt),
      generatedFileCount: 0,
      validation: { ok: false, issues: [] },
      error: errorMessage(error),
    };
  }
}

export async function runGenerationBenchmarkSuite(
  generator: BenchmarkGenerator,
  options: RunBenchmarkSuiteOptions = {}
): Promise<BenchmarkSuiteRunResult> {
  const benchmarks = options.benchmarks ?? GENERATION_BENCHMARKS;
  const results: BenchmarkRunResult[] = [];

  for (const benchmark of benchmarks) {
    results.push(await runGenerationBenchmark(benchmark, generator, options));
  }

  const summary = results.reduce<BenchmarkSuiteSummary>(
    (acc, result) => {
      acc.total += 1;
      if (result.status === 'passed') acc.passed += 1;
      else if (result.status === 'failed') acc.failed += 1;
      else acc.errored += 1;
      return acc;
    },
    { total: 0, passed: 0, failed: 0, errored: 0 }
  );

  return { summary, results };
}
