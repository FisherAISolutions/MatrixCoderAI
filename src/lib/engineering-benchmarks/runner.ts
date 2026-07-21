import type { EngineeringAcceptanceFixture } from './types';
import type { EngineeringBenchmarkRunResult } from './types';

function missingValues(expected: string[], actual: string[]): string[] {
  const actualSet = new Set(actual);
  return expected.filter((value) => !actualSet.has(value));
}

function fixtureReadinessFailures(
  fixture: EngineeringAcceptanceFixture
): string[] {
  const capabilityIds = fixture.capabilityResolution.capabilities.map(
    (capability) => capability.capabilityId
  );
  const taskTitles = fixture.taskGraph.tasks.map((task) => task.title);

  return [
    ...missingValues(
      fixture.expectedRoutes,
      fixture.buildContract.routes.map((route) => route.path)
    ).map((route) => `Expected route missing from Build Contract: ${route}`),
    ...missingValues(
      fixture.expectedDataModels,
      fixture.buildContract.dataModels.map((model) => model.name)
    ).map((model) => `Expected data model missing from Build Contract: ${model}`),
    ...missingValues(
      fixture.expectedApis,
      fixture.buildContract.apis.map((api) => api.path)
    ).map((api) => `Expected API missing from Build Contract: ${api}`),
    ...missingValues(fixture.expectedCapabilityIds, capabilityIds).map(
      (capability) => `Expected capability missing: ${capability}`
    ),
    ...missingValues(fixture.expectedTaskTitles, taskTitles).map(
      (taskTitle) => `Expected task missing: ${taskTitle}`
    ),
  ];
}

function scoreFixture(failures: string[]): number {
  if (failures.length === 0) return 100;
  return Math.max(0, 100 - failures.length * 8);
}

export function runEngineeringAcceptanceFixture(
  fixture: EngineeringAcceptanceFixture,
  startedAt = Date.now(),
  endedAt = Date.now()
): EngineeringBenchmarkRunResult {
  const readinessFailures = fixtureReadinessFailures(fixture);
  const graphFailures = fixture.taskGraph.warnings.map(
    (warning) => warning.message
  );
  const failures = [...readinessFailures, ...graphFailures];

  return {
    fixtureId: fixture.id,
    displayName: fixture.displayName,
    mode: fixture.runConfig.mode,
    tasksGenerated: fixture.taskGraph.tasks.length,
    tasksPassed: fixture.taskGraph.tasks.filter((task) => task.status === 'passed')
      .length,
    retries: fixture.taskGraph.tasks.reduce(
      (sum, task) => sum + task.retryCount,
      0
    ),
    failures,
    buildResult: 'not-run',
    missingContractRequirements: [],
    durationMs: Math.max(0, endedAt - startedAt),
    finalScore: scoreFixture(failures),
    warnings: [
      'Structured dry run only. No GPT, OpenAI, WebContainer, preview, or deployment calls were made.',
    ],
    errors: [],
  };
}

export function runEngineeringAcceptanceFixtures(
  fixtures: EngineeringAcceptanceFixture[]
): EngineeringBenchmarkRunResult[] {
  return fixtures.map((fixture) => runEngineeringAcceptanceFixture(fixture));
}
