import type {
  BuildContract,
  BuildContractValidationStrategy,
} from '@/lib/build-contract';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
import type { ContractReviewReport } from '@/lib/contract-review';
import type { ArchitectDraft } from '@/lib/matrix-ai-architect/types';
import type { TaskGraph } from '@/lib/task-graph';

export type EngineeringBenchmarkId =
  | 'children-story-platform'
  | 'simple-business-website'
  | 'crud-saas-dashboard';

export type EngineeringAcceptanceCategory =
  | 'routes'
  | 'data-models'
  | 'apis'
  | 'storage'
  | 'security'
  | 'editor'
  | 'states'
  | 'ownership'
  | 'build'
  | 'quality'
  | 'deployment';

export interface EngineeringAcceptanceCriterion {
  id: string;
  category: EngineeringAcceptanceCategory;
  title: string;
  description: string;
  required: boolean;
  validationStrategy:
    | BuildContractValidationStrategy
    | 'contract-review'
    | 'task-graph';
}

export interface EngineeringBenchmarkRunConfig {
  mode: 'structured-dry-run';
  allowLiveExecution: false;
  maxTasks: number;
  maxRetries: number;
  estimatedCost: string;
}

export interface EngineeringAcceptanceFixture {
  id: EngineeringBenchmarkId;
  displayName: string;
  appType: string;
  prompt: string;
  architectDraft: ArchitectDraft;
  blueprintDraft: BlueprintDraft;
  buildContract: BuildContract;
  capabilityResolution: CapabilityResolutionResult;
  taskGraph: TaskGraph;
  expectedTaskTitles: string[];
  expectedCapabilityIds: string[];
  expectedRoutes: string[];
  expectedDataModels: string[];
  expectedApis: string[];
  acceptanceCriteria: EngineeringAcceptanceCriterion[];
  runConfig: EngineeringBenchmarkRunConfig;
}

export interface EngineeringBenchmarkRunResult {
  fixtureId: EngineeringBenchmarkId;
  displayName: string;
  mode: EngineeringBenchmarkRunConfig['mode'];
  tasksGenerated: number;
  tasksPassed: number;
  retries: number;
  failures: string[];
  buildResult: 'not-run' | 'passed' | 'failed' | 'blocked';
  missingContractRequirements: string[];
  durationMs: number;
  finalScore: number;
  warnings: string[];
  errors: string[];
}

export const LIVE_ENGINEERING_BENCHMARK_CONFIRMATION =
  'RUN_LIVE_ENGINEERING_BENCHMARK';

export interface LiveEngineeringBenchmarkLimits {
  maxTasks: number;
  maxAiRequests: number;
  maxRetryRequests: number;
  maxExecutionDurationMs: number;
  maxFiles: number;
  maxGeneratedBytes: number;
  maxTaskRepairAttempts: number;
  stopOnCostLimit: boolean;
  stopOnTimeLimit: boolean;
}

export type LiveEngineeringBenchmarkStopReason =
  | 'not-started'
  | 'completed'
  | 'task-failed'
  | 'task-blocked'
  | 'cancelled'
  | 'cost-limit'
  | 'time-limit'
  | 'file-limit'
  | 'byte-limit'
  | 'provider-configuration'
  | 'provider-error'
  | 'safety-refused'
  | 'error';

export interface LiveEngineeringBenchmarkTaskResult {
  taskId: string;
  title: string;
  status: string;
  aiRequestsBefore: number;
  aiRequestsAfter: number;
  retryCount: number;
  repairCount: number;
  filesCreated: string[];
  filesModified: string[];
  validationSummary?: string;
  errors: string[];
  warnings: string[];
}

export interface LiveEngineeringBenchmarkResult {
  runId: string;
  fixtureId: EngineeringBenchmarkId;
  displayName: string;
  model: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  isolatedProjectId: string;
  isolatedWorkspaceId: string;
  isolatedWorkspacePath: string;
  taskCount: number;
  taskStatuses: Record<string, number>;
  taskResults: LiveEngineeringBenchmarkTaskResult[];
  aiRequestCount: number;
  retryCount: number;
  repairCount: number;
  filesCreated: string[];
  filesModified: string[];
  generatedFileCount: number;
  generatedBytes: number;
  validationResults: string[];
  buildResult: 'not-run' | 'passed' | 'failed' | 'blocked';
  contractReview?: ContractReviewReport;
  missingRequirements: string[];
  blockedChecks: string[];
  failureReasons: string[];
  providerErrorKind?: string;
  cancelled: boolean;
  finalScore: number;
  estimatedUsage: {
    aiRequests: number;
    retryRequests: number;
  };
  stopReason: LiveEngineeringBenchmarkStopReason;
  warnings: string[];
  errors: string[];
}
