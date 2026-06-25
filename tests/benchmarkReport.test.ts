import { describe, expect, it } from 'vitest';
import { GENERATION_BENCHMARKS } from '@/lib/generation/benchmarks';
import {
  buildBenchmarkReport,
  formatBenchmarkReport,
} from '@/lib/generation/benchmarkReport';

describe('benchmark report', () => {
  it('formats a clean developer report', async () => {
    const report = await buildBenchmarkReport({
      benchmarks: [GENERATION_BENCHMARKS[0]],
    });
    const formatted = formatBenchmarkReport(report);

    expect(formatted).toContain('==================================================');
    expect(formatted).toContain('Matrix Coder AI Benchmark Report');
    expect(formatted).toContain('Benchmark: personal-crm');
    expect(formatted).toContain('Display Name: Personal CRM');
    expect(formatted).toContain('App Type: crm');
    expect(formatted).toContain('Status: Ready');
    expect(formatted).toContain(
      'Expected Routes: 5 (/, /contacts, /companies, /tasks, /pipeline)'
    );
    expect(formatted).toContain(
      'Forbidden Routes: 4 (/add-note, /history, /preserve, /names)'
    );
    expect(formatted).toContain('Expected Features: 6');
    expect(formatted).toContain('Dry Run: PASS');
    expect(formatted).toContain('Estimated Risk: medium');
    expect(formatted).toContain(
      'Estimated Cost: Dry run only - no GPT, OpenAI, Preview, or WebContainer calls'
    );
  });

  it('summarizes all configured benchmarks', async () => {
    const report = await buildBenchmarkReport();

    expect(report.summary).toEqual({
      benchmarks: 8,
      ready: 8,
      warnings: 0,
      errors: 0,
    });
  });

  it('preserves benchmark definition ordering', async () => {
    const report = await buildBenchmarkReport();

    expect(report.items.map((item) => item.id)).toEqual(
      GENERATION_BENCHMARKS.map((benchmark) => benchmark.id)
    );
  });

  it('uses the execution harness dry-run output without generation', async () => {
    const report = await buildBenchmarkReport({
      benchmarks: [GENERATION_BENCHMARKS[1]],
    });
    const [item] = report.items;

    expect(item.id).toBe('expense-tracker');
    expect(item.dryRunStatus).toBe('PASS');
    expect(item.dryRunLog.join('\n')).toContain('mode=dry-run');
    expect(item.dryRunLog.join('\n')).toContain(
      'expected_routes=/, /expenses, /budgets, /reports, /settings'
    );
    expect(item.dryRunLog.join('\n')).toContain(
      'forbidden_routes=/add-note, /history, /preserve, /names'
    );
  });

  it('handles an empty benchmark list', async () => {
    const report = await buildBenchmarkReport({ benchmarks: [] });
    const formatted = formatBenchmarkReport(report);

    expect(report.summary).toEqual({
      benchmarks: 0,
      ready: 0,
      warnings: 0,
      errors: 0,
    });
    expect(formatted).toContain('No benchmarks configured.');
    expect(formatted).toContain('Benchmarks: 0');
    expect(formatted).toContain('Ready: 0');
  });
});
