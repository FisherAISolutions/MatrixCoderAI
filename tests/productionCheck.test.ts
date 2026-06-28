import { describe, expect, it } from 'vitest';
import {
  createInitialProductionCheckSteps,
  exportFilesToFileNodes,
  productionCheckFromValidationResult,
} from '@/lib/deployment/productionCheck';
import type { ValidationResult } from '@/lib/validation';

function validationResult(
  success: boolean,
  steps: ValidationResult['steps'],
  extras: Partial<ValidationResult> = {}
): ValidationResult {
  return {
    success,
    skipped: false,
    steps,
    errors: steps.flatMap((step) => step.errors),
    combinedLog: '',
    durationMs: 10,
    ...extras,
  };
}

describe('production check helpers', () => {
  it('converts export files into validation file nodes', () => {
    const nodes = exportFilesToFileNodes([
      { path: 'package.json', content: '{}' },
      { path: 'src/app/page.tsx', content: 'export default function Page() {}' },
      { path: 'src/app/globals.css', content: 'body {}' },
    ]);

    expect(nodes.map((node) => [node.path, node.language])).toEqual([
      ['package.json', 'json'],
      ['src/app/page.tsx', 'typescript'],
      ['src/app/globals.css', 'css'],
    ]);
  });

  it('creates not-run initial steps', () => {
    expect(createInitialProductionCheckSteps().map((step) => step.status)).toEqual([
      'not-run',
      'not-run',
      'not-run',
      'not-run',
      'not-run',
    ]);
  });

  it('maps a successful validation result to passed production status', () => {
    const summary = productionCheckFromValidationResult(
      validationResult(true, [
        { step: 'generated-quality', status: 'ok', durationMs: 1, errors: [], log: '' },
        { step: 'install', status: 'ok', durationMs: 1, errors: [], log: '' },
        { step: 'type-check', status: 'ok', durationMs: 1, errors: [], log: '' },
        { step: 'build', status: 'ok', durationMs: 1, errors: [], log: '' },
        { step: 'runtime-smoke', status: 'ok', durationMs: 1, errors: [], log: '' },
      ])
    );

    expect(summary.status).toBe('Passed');
    expect(summary.steps.map((step) => [step.key, step.status])).toEqual([
      ['install', 'passed'],
      ['type-check', 'passed'],
      ['build', 'passed'],
      ['runtime-smoke', 'passed'],
      ['generated-quality', 'passed'],
    ]);
  });

  it('maps failed and not-run validation steps for a stopped pipeline', () => {
    const summary = productionCheckFromValidationResult(
      validationResult(false, [
        { step: 'generated-quality', status: 'ok', durationMs: 1, errors: [], log: '' },
        {
          step: 'install',
          status: 'failed',
          durationMs: 1,
          errors: [
            {
              source: 'unknown',
              message: 'Dependency install failed',
              raw: 'npm error',
            },
          ],
          log: 'npm error',
        },
      ])
    );

    expect(summary.status).toBe('Failed');
    expect(summary.message).toBe('Dependency install failed');
    expect(summary.steps.map((step) => [step.key, step.status])).toEqual([
      ['install', 'failed'],
      ['type-check', 'not-run'],
      ['build', 'not-run'],
      ['runtime-smoke', 'not-run'],
      ['generated-quality', 'passed'],
    ]);
  });

  it('surfaces skipped validation results as failed production checks', () => {
    const summary = productionCheckFromValidationResult(
      validationResult(false, [], {
        skipped: true,
        skipReason: 'WebContainer unsupported',
      })
    );

    expect(summary.status).toBe('Failed');
    expect(summary.message).toBe('WebContainer unsupported');
    expect(summary.steps.every((step) => step.status === 'not-run')).toBe(true);
  });
});
