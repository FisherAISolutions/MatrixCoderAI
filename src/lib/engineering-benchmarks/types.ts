import type {
  BuildContract,
  BuildContractValidationStrategy,
} from '@/lib/build-contract';
import type { BlueprintDraft } from '@/lib/blueprint-studio/blueprintDraft';
import type { CapabilityResolutionResult } from '@/lib/capabilities';
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
