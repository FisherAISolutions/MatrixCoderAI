import type { FileNode } from '@/app/chat-workspace/components/types';
import { flattenTree } from '@/lib/repo/heuristics';
import {
  normalizeRepositoryPath,
  repositoryPathMatchesScope,
  type RepositoryModel,
} from '@/lib/repository-model';
import type { TaskGraphTask } from '@/lib/task-graph';
import {
  runValidation,
  type ParsedError,
  type ValidationOptions,
  type ValidationResult,
  type ValidationStep,
} from '@/lib/validation';
import { runGeneratedQualityAudit } from '@/lib/validation/generatedQuality';
import { runImportIntegrityAudit } from '@/lib/validation/importIntegrity';
import { runStyleAudit } from '@/lib/validation/styleAudit';
import type {
  TaskExecutionValidationRunner,
  TaskValidationEvidence,
  TaskValidationKind,
  TaskValidationOutcome,
  TaskValidationPlan,
  TaskValidationResult,
} from './types';

export type ValidationEngineRunner = (
  files: FileNode[],
  options: ValidationOptions
) => Promise<ValidationResult>;

const TYPECHECK_DISCIPLINES = new Set([
  'database',
  'authentication',
  'backend',
  'frontend',
  'AI integration',
  'storage/media',
  'testing',
]);

const BUILD_DISCIPLINES = new Set(['review', 'deployment']);

function taskNeeds(kind: TaskValidationKind, task: TaskGraphTask): boolean {
  const text = [
    task.title,
    task.description,
    task.category,
    task.assignedDiscipline,
    task.acceptanceChecks.join(' '),
    task.expectedOutputs.join(' '),
    task.validationCommands.join(' '),
  ]
    .join(' ')
    .toLowerCase();

  if (kind === 'schema') return /schema|migration|database|supabase|prisma|drizzle/.test(text);
  if (kind === 'server-only-env') return /openai|anthropic|gemini|ai provider|api key|server-only/.test(text);
  if (kind === 'generated-quality') return /quality|route|page|screen|acceptance|contract/.test(text);
  if (kind === 'runtime-smoke') return /runtime|smoke|render|route/.test(text);
  return false;
}

export function selectTaskValidationPlan(task: TaskGraphTask): TaskValidationPlan {
  const kinds = new Set<TaskValidationKind>(['required-files']);

  if (task.category === 'foundation' || task.assignedDiscipline === 'foundation') {
    kinds.add('package-manifest');
    kinds.add('typescript-config');
  }

  if (task.category === 'data' || task.assignedDiscipline === 'database') {
    kinds.add('schema');
  }

  kinds.add('import-integrity');

  const shouldTypeCheck =
    TYPECHECK_DISCIPLINES.has(task.assignedDiscipline) ||
    task.validationCommands.some((command) => /tsc|type-?check/i.test(command));
  if (shouldTypeCheck) kinds.add('type-check');

  const shouldBuild =
    BUILD_DISCIPLINES.has(task.assignedDiscipline) ||
    task.validationCommands.some((command) => /next build|build/i.test(command));
  if (shouldBuild) kinds.add('build');

  if (taskNeeds('server-only-env', task)) kinds.add('server-only-env');
  if (taskNeeds('generated-quality', task)) kinds.add('generated-quality');
  if (taskNeeds('runtime-smoke', task)) kinds.add('runtime-smoke');
  if (task.category === 'frontend' || shouldBuild) kinds.add('style-audit');
  if (task.category === 'review' || task.assignedDiscipline === 'review') {
    kinds.add('contract-acceptance');
    kinds.add('generated-quality');
  }

  return {
    taskId: task.id,
    kinds: Array.from(kinds),
    typeCheckOnly: kinds.has('type-check') && !kinds.has('build'),
    build: kinds.has('build'),
    runtimeSmoke: kinds.has('runtime-smoke'),
    generatedQuality: kinds.has('generated-quality'),
    styleAudit: kinds.has('style-audit'),
    milestone: kinds.has('build') || kinds.has('contract-acceptance'),
  };
}

function flattenFiles(files: FileNode[]): FileNode[] {
  return flattenTree(files).filter((file) => file.type === 'file');
}

function hasFile(files: FileNode[], path: string): boolean {
  const normalized = normalizeRepositoryPath(path);
  return flattenFiles(files).some((file) => normalizeRepositoryPath(file.path) === normalized);
}

function isInTaskScope(path: string | undefined, task: TaskGraphTask): boolean {
  if (!path) return false;
  const normalized = normalizeRepositoryPath(path);
  if (task.expectedFiles.map(normalizeRepositoryPath).includes(normalized)) return true;
  return task.allowedFileScope.some((scope) =>
    repositoryPathMatchesScope(normalized, normalizeRepositoryPath(scope))
  );
}

function errorTouchesTask(error: ParsedError, task: TaskGraphTask): boolean {
  return (
    isInTaskScope(error.file, task) ||
    task.expectedFiles.some((path) => error.message.includes(normalizeRepositoryPath(path))) ||
    task.allowedFileScope.some((scope) =>
      error.message.includes(normalizeRepositoryPath(scope).replace(/\/\*\*$/, ''))
    )
  );
}

function evidence(
  kind: TaskValidationEvidence['kind'],
  status: TaskValidationEvidence['status'],
  message: string,
  file?: string,
  raw?: string
): TaskValidationEvidence {
  return { kind, status, message, file, raw };
}

function outcomeFromErrors(options: {
  errors: string[];
  warnings: string[];
  blocked?: boolean;
  cancelled?: boolean;
  manual?: boolean;
}): TaskValidationOutcome {
  if (options.cancelled) return 'cancelled';
  if (options.blocked) return 'blocked by environment';
  if (options.manual) return 'manual review required';
  if (options.errors.length > 0) return 'recoverable';
  return 'passed';
}

function isEnvironmentFailure(result: ValidationResult): boolean {
  return (
    result.skipped ||
    result.steps.some(
      (step) =>
        step.status === 'skipped' ||
        /network|permission|auth|unauthorized|forbidden|unsupported|stalled|timeout|out of memory/i.test(
          step.infrastructureError ?? result.skipReason ?? ''
        )
    )
  );
}

function validationStepToCommand(step: ValidationStep): string {
  if (step === 'type-check') return 'type-check';
  if (step === 'build') return 'build';
  if (step === 'runtime-smoke') return 'runtime-smoke';
  return step;
}

function validationResultToTaskResult(
  result: ValidationResult,
  task: TaskGraphTask,
  plan: TaskValidationPlan,
  existing: TaskValidationResult
): TaskValidationResult {
  if (isEnvironmentFailure(result)) {
    const reason = result.skipReason ?? 'Validation was blocked by the environment.';
    return {
      ...existing,
      ok: false,
      outcome: 'blocked by environment',
      summary: reason,
      errors: [reason],
      evidence: [
        ...(existing.evidence ?? []),
        evidence('command', 'blocked', reason, undefined, result.combinedLog),
      ],
      commands: [
        ...existing.commands,
        ...result.steps.map((step) => ({
          command: validationStepToCommand(step.step),
          status: step.status === 'ok' ? ('passed' as const) : step.status,
          output: step.infrastructureError ?? step.log,
        })),
      ],
    };
  }

  const failedSteps = result.steps.filter((step) => step.status === 'failed');
  const scopedErrors = result.errors.filter((error) => errorTouchesTask(error, task));
  const unscopedFailure = failedSteps.length > 0 && scopedErrors.length === 0 && !result.success;
  const errors = scopedErrors.map((error) => {
    const file = error.file ? `${error.file}: ` : '';
    return `${file}${error.message}`;
  });

  return {
    ...existing,
    ok: existing.ok && result.success,
    outcome: outcomeFromErrors({
      errors: [...existing.errors, ...errors],
      warnings: existing.warnings,
      manual: unscopedFailure,
    }),
    summary:
      errors.length > 0
        ? `Task validation failed with ${errors.length} scoped issue(s).`
        : unscopedFailure
          ? 'Validation failed outside this task scope; manual review is required.'
          : 'Task validation passed.',
    commands: [
      ...existing.commands,
      ...result.steps
        .filter((step) =>
          plan.kinds.includes(step.step as TaskValidationKind) ||
          ['install', 'css-sanity'].includes(step.step)
        )
        .map((step) => ({
          command: validationStepToCommand(step.step),
          status: step.status === 'ok' ? ('passed' as const) : step.status,
          output: step.infrastructureError ?? step.log,
        })),
    ],
    errors: [...existing.errors, ...errors],
    warnings: [
      ...existing.warnings,
      ...(unscopedFailure
        ? ['A broader validation failed outside this task scope and was not auto-repaired.']
        : []),
    ],
    evidence: [
      ...(existing.evidence ?? []),
      ...scopedErrors.map((error) =>
        evidence('error', 'failed', error.message, error.file, error.raw)
      ),
    ],
  };
}

function initialResult(): TaskValidationResult {
  return {
    ok: true,
    outcome: 'passed',
    summary: 'Task validation passed.',
    commands: [],
    errors: [],
    warnings: [],
    evidence: [],
  };
}

export function createTaskValidationRunner(options: {
  runValidationImpl?: ValidationEngineRunner;
  requirements?: string;
  runBroadChecks?: boolean;
} = {}): TaskExecutionValidationRunner {
  const runValidationImpl = options.runValidationImpl ?? runValidation;

  return {
    validate: async (files, task, _repositoryModel, runOptions) => {
      const plan = selectTaskValidationPlan(task);
      let result = initialResult();

      if (runOptions.signal?.aborted) {
        return {
          ...result,
          ok: false,
          outcome: 'cancelled',
          summary: 'Task validation cancelled.',
          errors: ['Task validation cancelled.'],
        };
      }

      const missing = task.expectedFiles.filter((path) => !hasFile(files, path));
      if (missing.length > 0) {
        result.ok = false;
        result.errors.push(...missing.map((path) => `Missing expected file ${path}`));
        result.evidence?.push(
          ...missing.map((path) =>
            evidence('required-files', 'failed', `Missing expected file ${path}`, path)
          )
        );
      } else {
        result.evidence?.push(evidence('required-files', 'passed', 'Expected files exist.'));
      }

      if (plan.kinds.includes('package-manifest') && !hasFile(files, 'package.json')) {
        result.ok = false;
        result.errors.push('Missing package.json');
        result.evidence?.push(evidence('package-manifest', 'failed', 'Missing package.json', 'package.json'));
      }

      if (plan.kinds.includes('typescript-config') && !hasFile(files, 'tsconfig.json')) {
        result.ok = false;
        result.errors.push('Missing tsconfig.json');
        result.evidence?.push(evidence('typescript-config', 'failed', 'Missing tsconfig.json', 'tsconfig.json'));
      }

      if (plan.kinds.includes('schema')) {
        const schemaFiles = flattenFiles(files).filter((file) =>
          /(?:supabase\/migrations\/|schema\.|\.sql$|prisma\/schema\.prisma)/i.test(file.path)
        );
        const taskHasSchemaExpectation = task.expectedFiles.some((path) =>
          /(?:supabase\/migrations\/|schema\.|\.sql$|prisma\/schema\.prisma)/i.test(path)
        );
        if (taskHasSchemaExpectation && schemaFiles.length === 0) {
          result.ok = false;
          result.errors.push('Missing database schema or migration file.');
          result.evidence?.push(evidence('schema', 'failed', 'Missing database schema or migration file.'));
        }
      }

      if (plan.kinds.includes('import-integrity')) {
        const audit = runImportIntegrityAudit(files);
        const scopedMissing = audit.errors.filter((error) => errorTouchesTask(error, task));
        result.commands.push({
          command: 'import-integrity',
          status: scopedMissing.length ? 'failed' : 'passed',
          output: audit.log,
        });
        if (scopedMissing.length) {
          result.ok = false;
          result.errors.push(...scopedMissing.map((error) => error.message));
          result.evidence?.push(
            ...scopedMissing.map((error) =>
              evidence('import-integrity', 'failed', error.message, error.file, error.raw)
            )
          );
        }
      }

      if (plan.generatedQuality) {
        const audit = runGeneratedQualityAudit(files, options.requirements ?? '');
        const scopedErrors = audit.errors.filter((error) => errorTouchesTask(error, task));
        result.commands.push({
          command: 'generated-quality',
          status: scopedErrors.length ? 'failed' : 'passed',
          output: audit.log,
        });
        if (scopedErrors.length) {
          result.ok = false;
          result.errors.push(...scopedErrors.map((error) => error.message));
          result.evidence?.push(
            ...scopedErrors.map((error) =>
              evidence('generated-quality', 'failed', error.message, error.file, error.raw)
            )
          );
        }
      }

      if (plan.styleAudit) {
        const audit = runStyleAudit(files);
        const scopedErrors = audit.errors.filter((error) => errorTouchesTask(error, task));
        result.commands.push({
          command: 'style-audit',
          status: scopedErrors.length ? 'failed' : 'passed',
          output: audit.log,
        });
        if (scopedErrors.length) {
          result.ok = false;
          result.errors.push(...scopedErrors.map((error) => error.message));
          result.evidence?.push(
            ...scopedErrors.map((error) =>
              evidence('style-audit', 'failed', error.message, error.file, error.raw)
            )
          );
        }
      }

      const shouldRunEngine =
        plan.kinds.includes('type-check') ||
        plan.kinds.includes('build') ||
        plan.kinds.includes('runtime-smoke') ||
        options.runBroadChecks;

      if (shouldRunEngine) {
        const engineResult = await runValidationImpl(files, {
          typeCheckOnly: plan.typeCheckOnly && !options.runBroadChecks,
          runtimeSmoke: plan.runtimeSmoke || options.runBroadChecks === true,
          requirements: options.requirements,
          signal: runOptions.signal,
        });
        result = validationResultToTaskResult(engineResult, task, plan, result);
      }

      result.ok = result.ok && result.errors.length === 0 && result.outcome !== 'manual review required';
      result.outcome = result.ok
        ? 'passed'
        : result.outcome === 'manual review required' || result.outcome === 'blocked by environment'
          ? result.outcome
          : 'recoverable';
      result.summary = result.ok
        ? 'Task validation passed.'
        : result.summary === 'Task validation passed.'
          ? `Task validation failed with ${result.errors.length} issue(s).`
          : result.summary;
      return result;
    },
  };
}

export async function runMilestoneTaskValidation(options: {
  files: FileNode[];
  task: TaskGraphTask;
  repositoryModel: RepositoryModel;
  requirements?: string;
  signal?: AbortSignal;
  runValidationImpl?: ValidationEngineRunner;
}): Promise<TaskValidationResult> {
  const runner = createTaskValidationRunner({
    requirements: options.requirements,
    runValidationImpl: options.runValidationImpl,
    runBroadChecks: true,
  });
  return runner.validate(options.files, options.task, options.repositoryModel, {
    signal: options.signal,
    runId: `milestone-${options.task.id}`,
    operationId: `milestone-${options.task.id}`,
  });
}
