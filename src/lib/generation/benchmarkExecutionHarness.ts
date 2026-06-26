import {
  GENERATION_BENCHMARKS,
  getGenerationBenchmark,
  type GenerationBenchmark,
} from './benchmarks';
import {
  validateGeneratedFilesAgainstBenchmark,
  type BenchmarkValidationIssue,
} from './benchmarkValidation';
import type { BenchmarkGeneratorOutput } from './benchmarkRunner';
import { isAbortLikeError } from './cancellation';

export type BenchmarkExecutionStatus =
  | 'dry-run'
  | 'passed'
  | 'failed'
  | 'error'
  | 'cancelled'
  | 'refused';

export interface BenchmarkExecutionGeneratorOutput
  extends BenchmarkGeneratorOutput {
  generationSuccess?: boolean;
  validationSuccess?: boolean;
  detectedRoutes?: string[];
  previewConnected?: boolean;
  autoFixAttemptCount?: number;
  warnings?: string[];
  errors?: string[];
}

export type BenchmarkExecutionGenerator = (
  benchmark: GenerationBenchmark
) =>
  | Promise<BenchmarkExecutionGeneratorOutput | string[]>
  | BenchmarkExecutionGeneratorOutput
  | string[];

export interface MatrixCoderBenchmarkAdapterRequest {
  benchmark: GenerationBenchmark;
  benchmarkId: string;
  prompt: string;
  expectedRoutes: string[];
  forbiddenRoutes: string[];
  signal?: AbortSignal;
}

export type MatrixCoderBenchmarkAdapter = (
  request: MatrixCoderBenchmarkAdapterRequest
) =>
  | Promise<BenchmarkExecutionGeneratorOutput | string[]>
  | BenchmarkExecutionGeneratorOutput
  | string[];

export interface BenchmarkRiskEstimate {
  level: 'low' | 'medium';
  promptChars: number;
  expectedRouteCount: number;
  warning: string;
}

export interface BenchmarkExecutionResult {
  benchmarkId?: string;
  benchmarkName?: string;
  prompt?: string;
  status: BenchmarkExecutionStatus;
  dryRun: boolean;
  durationMs: number;
  generationSuccess?: boolean;
  validationSuccess?: boolean;
  generatedFileCount: number;
  generatedFilePaths: string[];
  detectedRoutes: string[];
  missingRequiredRoutes: BenchmarkValidationIssue[];
  forbiddenRoutesFound: BenchmarkValidationIssue[];
  validationStatus: 'not-run' | 'passed' | 'failed';
  previewConnected?: boolean;
  autoFixAttemptCount?: number;
  riskEstimate?: BenchmarkRiskEstimate;
  errors: string[];
  warnings: string[];
  log: string[];
}

export interface RunBenchmarkExecutionHarnessOptions {
  benchmarkId?: string;
  dryRun?: boolean;
  devOnly?: boolean;
  confirmExecution?: boolean;
  /**
   * Adapter for live benchmark execution. This must call Matrix Coder's
   * normal generation orchestration and return the resulting file snapshot.
   * The harness only handles safety checks and scoring.
   */
  matrixCoderAdapter?: MatrixCoderBenchmarkAdapter;
  /**
   * Backwards-compatible injected generator used by unit tests and older
   * internal callers. Prefer matrixCoderAdapter for real Matrix Coder runs.
   */
  generator?: BenchmarkExecutionGenerator;
  logger?: (message: string) => void;
  now?: () => number;
  signal?: AbortSignal;
}

function normalizeGeneratedOutput(
  output: BenchmarkExecutionGeneratorOutput | string[]
): BenchmarkExecutionGeneratorOutput {
  return Array.isArray(output) ? { generatedFiles: output } : output;
}

function emptyResult(
  status: BenchmarkExecutionStatus,
  dryRun: boolean,
  errors: string[],
  warnings: string[] = []
): BenchmarkExecutionResult {
  return {
    status,
    dryRun,
    durationMs: 0,
    generatedFileCount: 0,
    generatedFilePaths: [],
    detectedRoutes: [],
    missingRequiredRoutes: [],
    forbiddenRoutesFound: [],
    validationStatus: 'not-run',
    errors,
    warnings,
    log: [],
  };
}

const PAGE_FILE_REGEX = /^(?:src\/)?app\/(.+\/)?page\.(?:tsx|jsx|ts|js)$/;

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/^\/+/, '');
}

export function detectRoutesFromGeneratedFiles(generatedFiles: string[]): string[] {
  const routes = new Set<string>();

  for (const rawPath of generatedFiles) {
    const path = normalizePath(rawPath);
    const match = path.match(PAGE_FILE_REGEX);
    if (!match) continue;
    const segments = (match[1] ?? '').replace(/\/$/, '');
    routes.add(segments ? `/${segments}` : '/');
  }

  return Array.from(routes).sort((a, b) => {
    if (a === '/') return -1;
    if (b === '/') return 1;
    return a.localeCompare(b);
  });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function estimateBenchmarkExecutionRisk(
  benchmark: GenerationBenchmark
): BenchmarkRiskEstimate {
  return {
    level: 'medium',
    promptChars: benchmark.prompt.length,
    expectedRouteCount: benchmark.expectedRoutes.length,
    warning:
      'Dev-only single-benchmark execution can consume model tokens and may run validation/preview work if the injected generator does so.',
  };
}

function emit(
  log: string[],
  logger: ((message: string) => void) | undefined,
  message: string
) {
  log.push(message);
  logger?.(message);
}

function validateHarnessRequest(
  options: RunBenchmarkExecutionHarnessOptions
): { benchmark?: GenerationBenchmark; errors: string[] } {
  const errors: string[] = [];
  const id = options.benchmarkId?.trim();

  if (!options.devOnly) {
    errors.push('Benchmark execution harness is dev-only. Pass devOnly: true from trusted internal code.');
  }
  if (!id) {
    errors.push('An explicit benchmark id is required. The harness refuses implicit or all-benchmark execution.');
  } else if (id === 'all' || id === '*') {
    errors.push('Refusing to run all benchmarks. Select exactly one benchmark id.');
  }

  const benchmark = id && id !== 'all' && id !== '*' ? getGenerationBenchmark(id) : undefined;
  if (id && id !== 'all' && id !== '*' && !benchmark) {
    errors.push(
      `Unknown benchmark id "${id}". Available ids: ${GENERATION_BENCHMARKS.map((item) => item.id).join(', ')}.`
    );
  }

  return { benchmark, errors };
}

export async function runBenchmarkExecutionHarness(
  options: RunBenchmarkExecutionHarnessOptions
): Promise<BenchmarkExecutionResult> {
  const dryRun = options.dryRun !== false;
  const request = validateHarnessRequest(options);
  if (request.errors.length > 0 || !request.benchmark) {
    return emptyResult('refused', dryRun, request.errors);
  }

  const benchmark = request.benchmark;
  if (options.signal?.aborted) {
    return {
      ...emptyResult('cancelled', dryRun, [], ['Cancelled by user']),
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.displayName,
      prompt: benchmark.prompt,
    };
  }
  const riskEstimate = estimateBenchmarkExecutionRisk(benchmark);
  const log: string[] = [];
  const warnings = [riskEstimate.warning];

  emit(
    log,
    options.logger,
    `[benchmark-harness] id=${benchmark.id} mode=${dryRun ? 'dry-run' : 'execute'} risk=${riskEstimate.level} prompt_chars=${riskEstimate.promptChars} expected_routes=${riskEstimate.expectedRouteCount}`
  );

  if (dryRun) {
    emit(log, options.logger, `[benchmark-harness] prompt:\n${benchmark.prompt}`);
    emit(
      log,
      options.logger,
      `[benchmark-harness] expected_routes=${benchmark.expectedRoutes.join(', ')}`
    );
    emit(
      log,
      options.logger,
      `[benchmark-harness] forbidden_routes=${benchmark.forbiddenRoutes.join(', ')}`
    );
    emit(
      log,
      options.logger,
      '[benchmark-harness] validation=required src/app route files, forbidden route absence, and no root app/ files'
    );

    return {
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.displayName,
      prompt: benchmark.prompt,
      status: 'dry-run',
      dryRun: true,
      durationMs: 0,
      generationSuccess: undefined,
      validationSuccess: undefined,
      generatedFileCount: 0,
      generatedFilePaths: [],
      detectedRoutes: [],
      missingRequiredRoutes: [],
      forbiddenRoutesFound: [],
      validationStatus: 'not-run',
      riskEstimate,
      errors: [],
      warnings,
      log,
    };
  }

  if (!options.confirmExecution) {
    return {
      ...emptyResult('refused', false, [
        'Live benchmark execution requires confirmExecution: true.',
      ], warnings),
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.displayName,
      prompt: benchmark.prompt,
      riskEstimate,
      log,
    };
  }
  if (!options.matrixCoderAdapter && !options.generator) {
    return {
      ...emptyResult('refused', false, [
        'Live benchmark execution requires an injected Matrix Coder adapter.',
      ], warnings),
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.displayName,
      prompt: benchmark.prompt,
      riskEstimate,
      log,
    };
  }

  const now = options.now ?? Date.now;
  const startedAt = now();

  try {
    const adapterOutput = options.matrixCoderAdapter
      ? await options.matrixCoderAdapter({
          benchmark,
          benchmarkId: benchmark.id,
          prompt: benchmark.prompt,
          expectedRoutes: benchmark.expectedRoutes,
          forbiddenRoutes: benchmark.forbiddenRoutes,
          signal: options.signal,
        })
      : await options.generator!(benchmark);
    if (options.signal?.aborted) {
      return {
        ...emptyResult('cancelled', false, [], ['Cancelled by user']),
        benchmarkId: benchmark.id,
        benchmarkName: benchmark.displayName,
        prompt: benchmark.prompt,
        durationMs: Math.max(0, now() - startedAt),
        riskEstimate,
        log,
      };
    }
    const output = normalizeGeneratedOutput(adapterOutput);
    const detectedRoutes =
      output.detectedRoutes ?? detectRoutesFromGeneratedFiles(output.generatedFiles);
    const validation = validateGeneratedFilesAgainstBenchmark(
      benchmark,
      output.generatedFiles
    );
    const missingRequiredRoutes = validation.issues.filter(
      (issue) => issue.type === 'missing-required-route'
    );
    const forbiddenRoutesFound = validation.issues.filter(
      (issue) => issue.type === 'forbidden-route-present'
    );

    return {
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.displayName,
      prompt: benchmark.prompt,
      status: validation.ok ? 'passed' : 'failed',
      dryRun: false,
      durationMs: Math.max(0, now() - startedAt),
      generationSuccess: output.generationSuccess ?? true,
      validationSuccess: output.validationSuccess ?? validation.ok,
      generatedFileCount: output.generatedFiles.length,
      generatedFilePaths: output.generatedFiles,
      detectedRoutes,
      missingRequiredRoutes,
      forbiddenRoutesFound,
      validationStatus: validation.ok ? 'passed' : 'failed',
      previewConnected: output.previewConnected,
      autoFixAttemptCount: output.autoFixAttemptCount,
      riskEstimate,
      errors: [...(output.errors ?? []), ...validation.issues.map((issue) => issue.message)],
      warnings: [...warnings, ...(output.warnings ?? [])],
      log: output.log ? [...log, output.log] : log,
    };
  } catch (error) {
    if (options.signal?.aborted || isAbortLikeError(error)) {
      return {
        ...emptyResult('cancelled', false, [], ['Cancelled by user']),
        benchmarkId: benchmark.id,
        benchmarkName: benchmark.displayName,
        prompt: benchmark.prompt,
        durationMs: Math.max(0, now() - startedAt),
        riskEstimate,
        log,
      };
    }
    return {
      benchmarkId: benchmark.id,
      benchmarkName: benchmark.displayName,
      prompt: benchmark.prompt,
      status: 'error',
      dryRun: false,
      durationMs: Math.max(0, now() - startedAt),
      generationSuccess: false,
      validationSuccess: false,
      generatedFileCount: 0,
      generatedFilePaths: [],
      detectedRoutes: [],
      missingRequiredRoutes: [],
      forbiddenRoutesFound: [],
      validationStatus: 'not-run',
      riskEstimate,
      errors: [errorMessage(error)],
      warnings,
      log,
    };
  }
}
