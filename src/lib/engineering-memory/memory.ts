import type {
  BuildContract,
  BuildContractRequirement,
} from '@/lib/build-contract';
import type {
  CapabilityResolutionResult,
  ResolvedCapability,
} from '@/lib/capabilities';
import type { RepositoryModel } from '@/lib/repository-model';
import type { TaskGraph, TaskGraphStatus, TaskGraphTask } from '@/lib/task-graph';
import {
  ENGINEERING_MEMORY_METADATA_VERSION,
  ENGINEERING_MEMORY_SCHEMA_VERSION,
  type CreateEngineeringMemoryOptions,
  type EngineeringMemory,
  type EngineeringMemoryBuildStatus,
  type EngineeringMemoryCapabilitySnapshot,
  type EngineeringMemoryCheckpoint,
  type EngineeringMemoryFileOwnership,
  type EngineeringMemoryIssue,
  type EngineeringMemoryRestoreAction,
  type EngineeringMemorySummary,
  type EngineeringMemoryValidationEvidence,
  type RecordTaskExecutionOptions,
  type RestoreEngineeringMemoryOptions,
} from './types';

const ACTIVE_STATUSES = new Set<TaskGraphStatus>(['running', 'validating']);
const RECOVERABLE_STATUSES = new Set<TaskGraphStatus>([
  'recoverable-failure',
  'cancelled',
]);
const TERMINAL_SUCCESS_STATUSES = new Set<TaskGraphStatus>(['passed', 'skipped']);

function createId(prefix: string, now = new Date()): string {
  return `${prefix}-${now.getTime()}-${Math.random().toString(36).slice(2, 8)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function taskStatusToBuildStatus(graph?: TaskGraph | null): EngineeringMemoryBuildStatus {
  if (!graph) return 'planning';
  if (graph.tasks.length === 0) return 'not-started';
  if (graph.tasks.some((task) => task.status === 'blocked')) return 'blocked';
  if (graph.tasks.some((task) => task.status === 'failed')) return 'failed';
  if (graph.tasks.some((task) => ACTIVE_STATUSES.has(task.status))) {
    return 'in-progress';
  }
  if (graph.tasks.some((task) => RECOVERABLE_STATUSES.has(task.status))) {
    return 'recoverable';
  }
  if (graph.tasks.every((task) => TERMINAL_SUCCESS_STATUSES.has(task.status))) {
    return 'passed';
  }
  return 'in-progress';
}

function capabilitySnapshot(
  capability: ResolvedCapability
): EngineeringMemoryCapabilitySnapshot {
  return {
    capabilityId: capability.capabilityId,
    status: capability.status,
    source: capability.source,
    sourceRequirementIds: unique(capability.sourceRequirementIds),
  };
}

function completedRequirementIds(
  contract?: BuildContract | null,
  graph?: TaskGraph | null
): string[] {
  const fromContract =
    contract?.requirements
      .filter((requirement) =>
        ['satisfied', 'waived'].includes(requirement.completionStatus)
      )
      .map((requirement) => requirement.stableId) ?? [];
  const fromTasks =
    graph?.tasks
      .filter((task) => task.status === 'passed')
      .flatMap((task) => task.sourceRequirementIds) ?? [];
  return unique([...fromContract, ...fromTasks]);
}

function evidenceFromContract(
  requirement: BuildContractRequirement
): EngineeringMemoryValidationEvidence[] {
  if (requirement.completionStatus !== 'satisfied') return [];
  return requirement.evidenceReferences.map((evidence) => ({
    kind:
      evidence.kind === 'model' || evidence.kind === 'source'
        ? 'requirement'
        : evidence.kind,
    ref: evidence.ref,
    status: 'passed',
    description: evidence.description ?? requirement.title,
  }));
}

function findOwnerTask(path: string, graph?: TaskGraph | null): TaskGraphTask | undefined {
  return graph?.tasks.find((task) =>
    task.expectedFiles.some((expected) => expected.replace(/\\/g, '/') === path)
  );
}

function fileOwnershipFromRepository(
  repositoryModel?: RepositoryModel | null,
  graph?: TaskGraph | null
): EngineeringMemoryFileOwnership[] {
  if (!repositoryModel) return [];
  return repositoryModel.files.map((file) => {
    const ownerTask = findOwnerTask(file.path, graph);
    return {
      path: file.path,
      ownerTaskId: ownerTask?.id,
      capabilityIds: unique(ownerTask?.capabilityIds ?? []),
      generated: file.generated,
      userEdited: file.userEdited,
      protected: file.protected,
      lastChangedAt: file.lastModified,
    };
  });
}

function chooseResumableTaskId(graph?: TaskGraph | null): string | undefined {
  return graph?.tasks.find(
    (task) =>
      ACTIVE_STATUSES.has(task.status) ||
      task.status === 'recoverable-failure' ||
      (task.resumable && ['ready', 'pending'].includes(task.status))
  )?.id;
}

function restoreOptionsForMemory(memory: EngineeringMemory): EngineeringMemoryRestoreAction[] {
  const options = new Set<EngineeringMemoryRestoreAction>();
  if (memory.resumableTaskId) options.add('resume');
  if (memory.unresolvedIssues.length > 0 || memory.overallBuildStatus === 'recoverable') {
    options.add('retry');
  }
  options.add('review');
  return Array.from(options);
}

function mergeFileOwnership(
  existing: EngineeringMemoryFileOwnership[],
  next: EngineeringMemoryFileOwnership[]
): EngineeringMemoryFileOwnership[] {
  const byPath = new Map(existing.map((item) => [item.path, item]));
  next.forEach((item) => {
    const previous = byPath.get(item.path);
    byPath.set(item.path, {
      ...previous,
      ...item,
      userEdited: item.userEdited || previous?.userEdited === true,
      capabilityIds: unique([
        ...(previous?.capabilityIds ?? []),
        ...item.capabilityIds,
      ]),
    });
  });
  return Array.from(byPath.values()).sort((a, b) => a.path.localeCompare(b.path));
}

export function createEngineeringMemory(
  options: CreateEngineeringMemoryOptions
): EngineeringMemory {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const contract = options.buildContract ?? undefined;
  const capabilityResolution = options.capabilityResolution ?? undefined;
  const graph = options.taskGraph ?? options.existingMemory?.taskGraph;
  const capabilities =
    capabilityResolution?.capabilities.map(capabilitySnapshot) ??
    options.existingMemory?.capabilities ??
    [];
  const repositoryFingerprint =
    options.repositoryModel?.repositoryFingerprint ??
    options.existingMemory?.latestRepositoryFingerprint;
  const generatedFileOwnership = mergeFileOwnership(
    options.existingMemory?.generatedFileOwnership ?? [],
    fileOwnershipFromRepository(options.repositoryModel, graph)
  );
  const completed = completedRequirementIds(contract, graph);
  const validationEvidence = [
    ...(options.existingMemory?.validationEvidence ?? []),
    ...(contract?.requirements.flatMap(evidenceFromContract) ?? []),
  ];

  const memory: EngineeringMemory = {
    schemaVersion: ENGINEERING_MEMORY_SCHEMA_VERSION,
    metadataVersion: ENGINEERING_MEMORY_METADATA_VERSION,
    id: options.existingMemory?.id ?? createId('engineering-memory', now),
    projectId: options.projectId ?? options.existingMemory?.projectId,
    buildContractId: contract?.id ?? options.existingMemory?.buildContractId,
    buildContractVersion:
      contract?.contractVersion ?? options.existingMemory?.buildContractVersion,
    capabilityRegistryVersion:
      capabilityResolution?.registryVersion ??
      options.existingMemory?.capabilityRegistryVersion,
    capabilities,
    requiredCapabilityIds: unique(
      capabilities
        .filter((capability) => capability.status === 'required')
        .map((capability) => capability.capabilityId)
    ),
    optionalCapabilityIds: unique(
      capabilities
        .filter((capability) => capability.status === 'optional')
        .map((capability) => capability.capabilityId)
    ),
    taskGraph: graph ? clone(graph) : undefined,
    taskExecutionHistory: clone(
      options.existingMemory?.taskExecutionHistory ?? []
    ),
    completedRequirementIds: completed,
    validationEvidence,
    unresolvedIssues: clone(options.existingMemory?.unresolvedIssues ?? []),
    userApprovedWarningIds: unique(
      options.existingMemory?.userApprovedWarningIds ?? []
    ),
    latestRepositoryFingerprint: repositoryFingerprint,
    generatedFileOwnership,
    lastSafeCheckpoint: options.existingMemory?.lastSafeCheckpoint
      ? clone(options.existingMemory.lastSafeCheckpoint)
      : undefined,
    resumableTaskId: chooseResumableTaskId(graph),
    overallBuildStatus: taskStatusToBuildStatus(graph),
    restoreOptions: [],
    warnings: unique(options.existingMemory?.warnings ?? []),
    createdAt: options.existingMemory?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  return {
    ...memory,
    restoreOptions: restoreOptionsForMemory(memory),
  };
}

export function createEngineeringMemoryCheckpoint(
  memory: EngineeringMemory,
  options: { label: string; taskId?: string; now?: Date }
): EngineeringMemory {
  const now = options.now ?? new Date();
  const checkpoint: EngineeringMemoryCheckpoint = {
    id: createId('checkpoint', now),
    label: options.label,
    createdAt: now.toISOString(),
    taskId: options.taskId,
    repositoryFingerprint: memory.latestRepositoryFingerprint,
    taskGraph: memory.taskGraph ? clone(memory.taskGraph) : undefined,
    fileOwnership: clone(memory.generatedFileOwnership),
    completedRequirementIds: [...memory.completedRequirementIds],
    validationEvidence: clone(memory.validationEvidence),
  };

  return {
    ...memory,
    lastSafeCheckpoint: checkpoint,
    updatedAt: now.toISOString(),
  };
}

export function recordTaskExecutionInMemory(
  memory: EngineeringMemory,
  options: RecordTaskExecutionOptions
): EngineeringMemory {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const changedFiles = unique((options.changedFiles ?? []).map((path) => path.replace(/\\/g, '/')));
  const task = options.task;
  const validationEvidence = options.validationEvidence ?? [];
  const repositoryFingerprint =
    options.repositoryModel?.repositoryFingerprint ??
    memory.latestRepositoryFingerprint;
  const fileOwnership = mergeFileOwnership(
    memory.generatedFileOwnership,
    changedFiles.map((path) => ({
      path,
      ownerTaskId: task.id,
      capabilityIds: unique(task.capabilityIds),
      generated: true,
      userEdited: false,
      protected: false,
      lastChangedAt: nowIso,
    }))
  );

  let next: EngineeringMemory = {
    ...memory,
    taskGraph: options.taskGraph ? clone(options.taskGraph) : memory.taskGraph,
    taskExecutionHistory: [
      ...memory.taskExecutionHistory,
      {
        id: createId('task-history', now),
        taskId: task.id,
        taskTitle: task.title,
        category: task.category,
        assignedDiscipline: task.assignedDiscipline,
        status: task.status,
        failureClassification: task.failureClassification,
        retryCount: task.retryCount,
        runId: options.runId,
        operationId: options.operationId,
        changedFiles,
        validationEvidence,
        warnings: options.warnings ?? [],
        errors: options.errors ?? [],
        createdAt: nowIso,
      },
    ],
    completedRequirementIds:
      task.status === 'passed'
        ? unique([...memory.completedRequirementIds, ...task.sourceRequirementIds])
        : memory.completedRequirementIds,
    validationEvidence: [...memory.validationEvidence, ...validationEvidence],
    unresolvedIssues:
      task.status === 'failed' || task.status === 'recoverable-failure'
        ? [
            ...memory.unresolvedIssues,
            {
              id: createId('issue', now),
              severity: task.status === 'failed' ? 'error' : 'warning',
              title: `${task.title} did not pass`,
              description:
                task.blockedReason ??
                options.errors?.[0] ??
                'Task needs review before continuing.',
              taskId: task.id,
              createdAt: nowIso,
            },
          ]
        : memory.unresolvedIssues,
    latestRepositoryFingerprint: repositoryFingerprint,
    generatedFileOwnership: fileOwnership,
    resumableTaskId:
      task.status === 'recoverable-failure' ? task.id : chooseResumableTaskId(options.taskGraph ?? memory.taskGraph),
    overallBuildStatus: taskStatusToBuildStatus(options.taskGraph ?? memory.taskGraph),
    warnings: unique([...memory.warnings, ...(options.warnings ?? [])]),
    updatedAt: nowIso,
  };

  if (task.status === 'passed' && options.checkpointOnSuccess) {
    next = createEngineeringMemoryCheckpoint(next, {
      label:
        typeof options.checkpointOnSuccess === 'string'
          ? options.checkpointOnSuccess
          : `${task.title} passed`,
      taskId: task.id,
      now,
    });
  }

  return {
    ...next,
    restoreOptions: restoreOptionsForMemory(next),
  };
}

function recoverInterruptedGraph(
  graph: TaskGraph,
  nowIso: string
): { graph: TaskGraph; recoveredTaskId?: string } {
  let recoveredTaskId: string | undefined;
  return {
    graph: {
      ...graph,
      updatedAt: nowIso,
      tasks: graph.tasks.map((task) => {
        if (!ACTIVE_STATUSES.has(task.status)) return task;
        recoveredTaskId = recoveredTaskId ?? task.id;
        return {
          ...task,
          status: 'recoverable-failure',
          blockedReason:
            task.blockedReason ??
            'Interrupted during the previous session; review before resuming.',
          updatedAt: nowIso,
          resumable: true,
        };
      }),
    },
    recoveredTaskId,
  };
}

function repositoryDriftIssue(
  previousFingerprint: string,
  currentFingerprint: string,
  now: Date
): EngineeringMemoryIssue {
  return {
    id: createId('issue-repository-drift', now),
    severity: 'warning',
    title: 'Repository changed since last memory checkpoint',
    description: `Repository fingerprint changed from ${previousFingerprint} to ${currentFingerprint}. Review before resuming automated work.`,
    createdAt: now.toISOString(),
  };
}

export function restoreEngineeringMemory(
  memory: EngineeringMemory,
  options: RestoreEngineeringMemoryOptions = {}
): EngineeringMemory {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const recovered = memory.taskGraph
    ? recoverInterruptedGraph(memory.taskGraph, nowIso)
    : { graph: undefined, recoveredTaskId: undefined };
  const currentFingerprint = options.repositoryModel?.repositoryFingerprint;
  const drifted =
    Boolean(currentFingerprint && memory.latestRepositoryFingerprint) &&
    currentFingerprint !== memory.latestRepositoryFingerprint;
  const driftIssue =
    drifted && currentFingerprint && memory.latestRepositoryFingerprint
      ? repositoryDriftIssue(memory.latestRepositoryFingerprint, currentFingerprint, now)
      : undefined;

  const next: EngineeringMemory = {
    ...memory,
    taskGraph: recovered.graph,
    latestRepositoryFingerprint: currentFingerprint ?? memory.latestRepositoryFingerprint,
    generatedFileOwnership: mergeFileOwnership(
      memory.generatedFileOwnership,
      fileOwnershipFromRepository(options.repositoryModel, recovered.graph)
    ),
    unresolvedIssues: driftIssue
      ? [...memory.unresolvedIssues, driftIssue]
      : memory.unresolvedIssues,
    resumableTaskId: recovered.recoveredTaskId ?? chooseResumableTaskId(recovered.graph),
    overallBuildStatus: taskStatusToBuildStatus(recovered.graph ?? memory.taskGraph),
    warnings: drifted
      ? unique([...memory.warnings, 'Repository drift detected during restore.'])
      : memory.warnings,
    updatedAt: nowIso,
  };

  return {
    ...next,
    restoreOptions: restoreOptionsForMemory(next),
  };
}

export function cloneEngineeringMemoryForProject(
  memory: EngineeringMemory,
  projectId: string,
  now = new Date()
): EngineeringMemory {
  const cloned = clone(memory);
  return {
    ...cloned,
    id: createId('engineering-memory', now),
    projectId,
    taskGraph: cloned.taskGraph ? { ...cloned.taskGraph, projectId } : undefined,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function getEngineeringMemorySummary(
  memory: EngineeringMemory
): EngineeringMemorySummary {
  const tasks = memory.taskGraph?.tasks ?? [];
  return {
    overallBuildStatus: memory.overallBuildStatus,
    completedTaskCount: tasks.filter((task) => task.status === 'passed').length,
    totalTaskCount: tasks.length,
    completedRequirementCount: memory.completedRequirementIds.length,
    unresolvedIssueCount: memory.unresolvedIssues.filter(
      (issue) => !issue.resolvedAt
    ).length,
    latestRepositoryFingerprint: memory.latestRepositoryFingerprint,
    lastSafeCheckpointLabel: memory.lastSafeCheckpoint?.label,
    resumableTaskId: memory.resumableTaskId,
    restoreOptions: memory.restoreOptions,
    remainingTaskIds: tasks
      .filter((task) => !TERMINAL_SUCCESS_STATUSES.has(task.status))
      .map((task) => task.id),
    warnings: memory.warnings,
  };
}
