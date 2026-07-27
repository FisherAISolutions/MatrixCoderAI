import { getPlan } from './plans';
import type {
  LargeBuildEstimate,
  LargeBuildEstimateInput,
  PlanId,
} from './types';

function positiveInteger(value: number): number {
  return Math.max(0, Math.ceil(Number.isFinite(value) ? value : 0));
}

export function estimateLargeBuild(
  planId: PlanId,
  raw: LargeBuildEstimateInput
): LargeBuildEstimate {
  const input = {
    tasks: positiveInteger(raw.tasks),
    expectedAiRequests: positiveInteger(raw.expectedAiRequests),
    repairAllowance: positiveInteger(raw.repairAllowance),
    generatedFiles: positiveInteger(raw.generatedFiles),
    generatedBytes: positiveInteger(raw.generatedBytes),
    durationMinutes: positiveInteger(raw.durationMinutes),
  };
  const limits = getPlan(planId).entitlements;
  const blockingReasons: string[] = [];
  const warnings: string[] = [];

  if (input.tasks > limits.tasksPerBuild) {
    blockingReasons.push(
      `Estimated tasks (${input.tasks}) exceed this plan's per-build limit (${limits.tasksPerBuild}).`
    );
  }
  if (input.generatedFiles > limits.generatedFiles) {
    blockingReasons.push(
      `Estimated files (${input.generatedFiles}) exceed this plan's file limit (${limits.generatedFiles}).`
    );
  }
  if (input.generatedBytes > limits.generatedBytes) {
    blockingReasons.push(
      `Estimated output (${input.generatedBytes} bytes) exceeds this plan's byte limit (${limits.generatedBytes}).`
    );
  }
  if (input.durationMinutes > limits.buildDurationMinutes) {
    blockingReasons.push(
      `Estimated duration (${input.durationMinutes} minutes) exceeds this plan's build limit (${limits.buildDurationMinutes} minutes).`
    );
  }
  if (input.expectedAiRequests > limits.taskExecutionRequests) {
    blockingReasons.push('Estimated task AI requests exceed the remaining monthly plan allowance.');
  }
  if (input.repairAllowance > limits.repairs) {
    blockingReasons.push('Estimated repair allowance exceeds the monthly repair limit.');
  }

  if (!blockingReasons.length) {
    if (input.tasks >= limits.tasksPerBuild * 0.8) {
      warnings.push('This build is close to the plan task limit.');
    }
    if (input.generatedBytes >= limits.generatedBytes * 0.8) {
      warnings.push('This build is close to the plan output-size limit.');
    }
  }

  return {
    allowed: blockingReasons.length === 0,
    planId,
    input,
    blockingReasons,
    warnings,
    options: blockingReasons.length
      ? [
          'simplify',
          'build-foundation-first',
          'remove-optional-features',
          'upgrade',
          'cancel',
        ]
      : [],
  };
}
