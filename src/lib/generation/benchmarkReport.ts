import {
  GENERATION_BENCHMARKS,
  type GenerationBenchmark,
} from './benchmarks';
import {
  runBenchmarkExecutionHarness,
  type BenchmarkExecutionResult,
  type BenchmarkRiskEstimate,
} from './benchmarkExecutionHarness';

export type BenchmarkReportStatus = 'Ready' | 'Error';
export type BenchmarkDryRunStatus = 'PASS' | 'FAIL';

export interface BenchmarkReportItem {
  id: string;
  displayName: string;
  appType: string;
  expectedRoutes: string[];
  forbiddenRoutes: string[];
  expectedFeatureCount: number;
  status: BenchmarkReportStatus;
  dryRunStatus: BenchmarkDryRunStatus;
  estimatedRisk: BenchmarkRiskEstimate['level'] | 'unknown';
  estimatedExecutionCost: string;
  dryRunLog: string[];
  errors: string[];
  warnings: string[];
}

export interface BenchmarkReportSummary {
  benchmarks: number;
  ready: number;
  warnings: number;
  errors: number;
}

export interface BenchmarkReport {
  title: string;
  items: BenchmarkReportItem[];
  summary: BenchmarkReportSummary;
}

export interface BuildBenchmarkReportOptions {
  benchmarks?: GenerationBenchmark[];
}

const REPORT_TITLE = 'Matrix Coder AI Benchmark Report';
const DRY_RUN_COST =
  'Dry run only - no GPT, OpenAI, Preview, or WebContainer calls';

function summarize(items: BenchmarkReportItem[]): BenchmarkReportSummary {
  return items.reduce<BenchmarkReportSummary>(
    (acc, item) => {
      acc.benchmarks += 1;
      if (item.status === 'Ready') acc.ready += 1;
      acc.warnings += item.warnings.length;
      acc.errors += item.errors.length;
      return acc;
    },
    { benchmarks: 0, ready: 0, warnings: 0, errors: 0 }
  );
}

function itemFromDryRun(
  benchmark: GenerationBenchmark,
  result: BenchmarkExecutionResult
): BenchmarkReportItem {
  const errors = result.errors;
  const status: BenchmarkReportStatus =
    result.status === 'dry-run' && errors.length === 0 ? 'Ready' : 'Error';

  return {
    id: benchmark.id,
    displayName: benchmark.displayName,
    appType: benchmark.appType,
    expectedRoutes: benchmark.expectedRoutes,
    forbiddenRoutes: benchmark.forbiddenRoutes,
    expectedFeatureCount: benchmark.expectedCoreFeatures.length,
    status,
    dryRunStatus: status === 'Ready' ? 'PASS' : 'FAIL',
    estimatedRisk: result.riskEstimate?.level ?? 'unknown',
    estimatedExecutionCost: DRY_RUN_COST,
    dryRunLog: result.log,
    errors,
    // Harness risk warnings are displayed as risk/cost fields, not report warnings.
    warnings: [],
  };
}

export async function buildBenchmarkReport(
  options: BuildBenchmarkReportOptions = {}
): Promise<BenchmarkReport> {
  const benchmarks = options.benchmarks ?? GENERATION_BENCHMARKS;
  const items: BenchmarkReportItem[] = [];

  for (const benchmark of benchmarks) {
    const dryRun = await runBenchmarkExecutionHarness({
      benchmarkId: benchmark.id,
      devOnly: true,
      dryRun: true,
    });
    items.push(itemFromDryRun(benchmark, dryRun));
  }

  return {
    title: REPORT_TITLE,
    items,
    summary: summarize(items),
  };
}

function listWithCount(values: string[]): string {
  return values.length ? `${values.length} (${values.join(', ')})` : '0';
}

export function formatBenchmarkReport(report: BenchmarkReport): string {
  const lines = [
    '==================================================',
    report.title,
    '================================',
    '',
  ];

  if (report.items.length === 0) {
    lines.push('No benchmarks configured.', '');
  }

  for (const item of report.items) {
    lines.push(
      `Benchmark: ${item.id}`,
      `Display Name: ${item.displayName}`,
      `App Type: ${item.appType}`,
      `Status: ${item.status}`,
      `Expected Routes: ${listWithCount(item.expectedRoutes)}`,
      `Forbidden Routes: ${listWithCount(item.forbiddenRoutes)}`,
      `Expected Features: ${item.expectedFeatureCount}`,
      `Dry Run: ${item.dryRunStatus}`,
      `Estimated Risk: ${item.estimatedRisk}`,
      `Estimated Cost: ${item.estimatedExecutionCost}`
    );

    if (item.warnings.length > 0) {
      lines.push(`Warnings: ${item.warnings.join(' | ')}`);
    }
    if (item.errors.length > 0) {
      lines.push(`Errors: ${item.errors.join(' | ')}`);
    }
    lines.push('');
  }

  lines.push(
    'Summary',
    '',
    `Benchmarks: ${report.summary.benchmarks}`,
    `Ready: ${report.summary.ready}`,
    `Warnings: ${report.summary.warnings}`,
    `Errors: ${report.summary.errors}`
  );

  return lines.join('\n');
}

export async function printBenchmarkReport(): Promise<void> {
  const report = await buildBenchmarkReport();
  // Developer command helper; tests use build/format directly.
  // eslint-disable-next-line no-console
  console.log(formatBenchmarkReport(report));
}
