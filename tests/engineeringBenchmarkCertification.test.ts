import { describe, expect, it } from 'vitest';
import {
  CORE_BETA_BENCHMARK_IDS,
  createBenchmarkCertificationReport,
  getGuardedLiveBenchmarkCommand,
} from '@/lib/engineering-benchmarks/certification';
import { DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS } from '@/lib/engineering-benchmarks/liveHarness';

describe('engineering benchmark certification', () => {
  it('prepares the three core fixtures without running a provider', () => {
    const report = createBenchmarkCertificationReport(
      [],
      new Date('2026-07-26T00:00:00.000Z')
    );
    expect(report.entries.map((entry) => entry.fixtureId)).toEqual(
      CORE_BETA_BENCHMARK_IDS
    );
    expect(report.completed).toBe(0);
    expect(report.passed).toBe(0);
    expect(report.limits).toEqual(DEFAULT_LIVE_ENGINEERING_BENCHMARK_LIMITS);
  });

  it('produces explicit one-fixture guarded PowerShell commands', () => {
    const command = getGuardedLiveBenchmarkCommand(
      'crud-saas-dashboard',
      'http://localhost:3000'
    );
    expect(command).toContain("MATRIX_CODER_LIVE_BENCHMARK_ID='crud-saas-dashboard'");
    expect(command).toContain('RUN_LIVE_ENGINEERING_BENCHMARK');
    expect(command).toContain("MATRIX_CODER_LIVE_BENCHMARK_PROVIDER='1'");
    expect(command).not.toContain("MATRIX_CODER_LIVE_BENCHMARK_ID='all'");
  });
});
