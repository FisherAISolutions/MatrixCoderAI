import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { BuildContract, BuildContractRequirement } from '@/lib/build-contract';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import {
  createTaskIntelligencePacket,
  type MatrixIntelligenceCore,
} from '@/lib/intelligence-core';
import type { ArchitectBudgetMode } from '@/lib/matrix-ai-architect/types';
import {
  getRepositoryContextForTask,
  type RepositoryModel,
} from '@/lib/repository-model';
import type { TaskGraph, TaskGraphTask } from '@/lib/task-graph';
import {
  ENGINEERING_FOREMAN_PACKET_VERSION,
  type EngineeringForemanMilestoneId,
  type EngineeringForemanTaskState,
  type TaskIntelligenceBlueprintDecision,
  type TaskIntelligenceEstimatedScope,
  type TaskIntelligencePacket,
} from './types';

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function textMatchesTask(value: string, task: TaskGraphTask): boolean {
  const taskText = [
    task.title,
    task.description,
    ...task.capabilityIds,
    ...task.expectedFiles,
    ...task.expectedOutputs,
  ]
    .join(' ')
    .toLowerCase();
  const tokens = value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 2);
  return tokens.some((token) => taskText.includes(token));
}

function relevantBlueprintDecisions(
  blueprint: BlueprintDraft | null | undefined,
  task: TaskGraphTask
): TaskIntelligenceBlueprintDecision[] {
  if (!blueprint) return [];
  const candidates: TaskIntelligenceBlueprintDecision[] = [
    ...blueprint.routes.map((item) => ({
      kind: 'route' as const,
      id: item.id,
      value: item.path,
      description: item.description,
    })),
    ...blueprint.dataModels.map((item) => ({
      kind: 'data-model' as const,
      id: item.id,
      value: `${item.name}: ${item.fields.join(', ')}`,
      description: item.description,
    })),
    ...blueprint.components.map((item) => ({
      kind: 'component' as const,
      id: item.id,
      value: item.name,
      description: item.description,
    })),
    ...blueprint.integrations.map((item) => ({
      kind: 'integration' as const,
      id: item.id,
      value: item.name,
      description: item.description,
    })),
    ...blueprint.userRoles.map((item) => ({
      kind: 'role' as const,
      id: item.id,
      value: item.name,
      description: item.description,
    })),
    ...blueprint.navigation.map((item) => ({
      kind: 'navigation' as const,
      id: item.id,
      value: item.name,
      description: item.description,
    })),
    ...blueprint.folderStructure.map((item) => ({
      kind: 'folder' as const,
      id: item.id,
      value: item.name,
      description: item.description,
    })),
    {
      kind: 'deployment',
      id: 'deployment-target',
      value: blueprint.deploymentTarget,
    },
  ];
  return candidates
    .filter((item) => textMatchesTask(`${item.value} ${item.description ?? ''}`, task))
    .slice(0, 12);
}

function relevantRequirements(
  contract: BuildContract,
  task: TaskGraphTask
): BuildContractRequirement[] {
  const ids = new Set(task.sourceRequirementIds);
  return contract.requirements
    .filter(
      (requirement) =>
        ids.has(requirement.stableId) ||
        task.capabilityIds.some((capabilityId) =>
          `${requirement.title} ${requirement.description}`
            .toLowerCase()
            .includes(capabilityId.toLowerCase())
        )
    )
    .slice(0, 16);
}

function estimateScope(task: TaskGraphTask): TaskIntelligenceEstimatedScope {
  const weight =
    task.expectedFiles.length * 2 +
    task.allowedFileScope.length +
    task.acceptanceChecks.length;
  const size = weight <= 8 ? 'small' : weight <= 18 ? 'medium' : 'large';
  return {
    size,
    expectedFileCount: task.expectedFiles.length,
    allowedScopeCount: task.allowedFileScope.length,
    acceptanceCheckCount: task.acceptanceChecks.length,
    reason: `${task.expectedFiles.length} expected file(s), ${task.allowedFileScope.length} allowed scope(s), and ${task.acceptanceChecks.length} acceptance check(s).`,
  };
}

function confidenceForPacket(
  hasRepository: boolean,
  requirementCount: number,
  capabilityCount: number,
  blockedDependencyCount: number
): number {
  let confidence = 0.62;
  if (hasRepository) confidence += 0.13;
  if (requirementCount > 0) confidence += 0.1;
  if (capabilityCount > 0) confidence += 0.1;
  if (blockedDependencyCount > 0) confidence -= 0.35;
  return Math.max(0, Math.min(1, Number(confidence.toFixed(2))));
}

export interface CreateTaskIntelligencePacketOptions {
  projectId: string;
  task: TaskGraphTask;
  graph: TaskGraph;
  contract: BuildContract;
  capabilityResolution: CapabilityResolutionResult;
  repositoryModel: RepositoryModel;
  intelligenceCore: MatrixIntelligenceCore;
  blueprintDraft?: BlueprintDraft | null;
  taskStates: EngineeringForemanTaskState[];
  milestoneId: EngineeringForemanMilestoneId;
  budgetMode?: ArchitectBudgetMode;
  now?: Date;
}

export function buildForemanTaskIntelligencePacket(
  options: CreateTaskIntelligencePacketOptions
): TaskIntelligencePacket {
  const {
    task,
    graph,
    contract,
    capabilityResolution,
    repositoryModel,
    intelligenceCore,
  } = options;
  const repositoryContext = getRepositoryContextForTask(task, repositoryModel);
  const intelligencePacket = createTaskIntelligencePacket(intelligenceCore, {
    task,
    buildContract: contract,
    repositoryModel,
    repositoryContext,
    includeRecordsLimit: 12,
    now: options.now,
  });
  const taskById = new Map(graph.tasks.map((item) => [item.id, item]));
  const stateById = new Map(options.taskStates.map((state) => [state.taskId, state]));
  const requiredDependencies = task.dependencies.map((dependencyId) => ({
    taskId: dependencyId,
    title: taskById.get(dependencyId)?.title ?? dependencyId,
    status: stateById.get(dependencyId)?.status ?? 'waiting',
  }));
  const blockedDependencies = requiredDependencies.filter(
    (dependency) =>
      !['complete', 'skipped'].includes(dependency.status)
  );
  const requirements = relevantRequirements(contract, task);
  const capabilityReferences = capabilityResolution.capabilities
    .filter((capability) => task.capabilityIds.includes(capability.capabilityId))
    .map((capability) => ({
      capabilityId: capability.capabilityId,
      status: capability.status,
      source: capability.source,
      sourceRequirementIds: [...capability.sourceRequirementIds],
    }));
  const estimatedScope = estimateScope(task);

  return {
    packetVersion: ENGINEERING_FOREMAN_PACKET_VERSION,
    kind: 'engineering-task',
    projectId: options.projectId,
    task: {
      id: task.id,
      title: task.title,
      category: task.category,
      discipline: task.assignedDiscipline,
      priority: task.priority,
    },
    purpose: task.description || task.title,
    repositoryFingerprint: repositoryModel.repositoryFingerprint,
    relevantExistingFiles: repositoryContext.relevantFiles.slice(0, 12).map((file) => ({
      path: file.path,
      readable: file.readable,
      missing: file.missing,
      generated: file.generated,
      userEdited: file.userEdited,
      protected: file.protected,
      contentHash: file.contentHash,
    })),
    protectedFiles: unique(intelligencePacket.protectedPaths.map(normalizePath)),
    expectedOutputs: [...task.expectedOutputs],
    expectedFiles: unique(task.expectedFiles.map(normalizePath)),
    allowedPaths: unique(task.allowedFileScope.map(normalizePath)),
    requiredDependencies,
    blockedDependencies,
    acceptanceCriteria: unique([
      ...task.acceptanceChecks,
      ...requirements.map((requirement) => requirement.description),
    ]),
    validationStrategy: {
      commands: unique(task.validationCommands),
      requirementStrategies: unique(
        requirements.map((requirement) => requirement.validationStrategy)
      ),
      acceptanceChecks: unique(task.acceptanceChecks),
    },
    repairStrategy: {
      failureClassification: task.failureClassification,
      remainingAttempts: Math.max(
        0,
        task.maximumRetryCount - Math.max(task.retryCount, 0)
      ),
      allowedPaths: unique(task.allowedFileScope.map(normalizePath)),
      preserveUnrelatedWork: true,
      stopOnEnvironmentOrPermissionFailure: true,
    },
    memoryLessons: intelligencePacket.applicableLessons.slice(0, 8).map((lesson) => ({
      recordId: lesson.stableId,
      lesson:
        typeof lesson.value === 'string'
          ? lesson.value
          : JSON.stringify(lesson.value),
      confidence: lesson.confidence,
      evidenceReferences: lesson.evidenceReferences.map(
        (evidence) => `${evidence.kind}:${evidence.ref}`
      ),
    })),
    blueprintDecisions: relevantBlueprintDecisions(options.blueprintDraft, task),
    contractRequirements: requirements.map((requirement) => ({
      stableId: requirement.stableId,
      title: requirement.title,
      description: requirement.description,
      required: requirement.status === 'required',
      validationStrategy: requirement.validationStrategy,
    })),
    capabilityReferences,
    currentMilestone: options.milestoneId,
    confidence: confidenceForPacket(
      true,
      requirements.length,
      capabilityReferences.length,
      blockedDependencies.length
    ),
    budgetMode: options.budgetMode ?? 'lean',
    complexity:
      estimatedScope.size === 'large'
        ? 'high'
        : estimatedScope.size === 'medium'
          ? 'medium'
          : 'low',
    estimatedScope,
    createdAt: (options.now ?? new Date()).toISOString(),
  };
}
