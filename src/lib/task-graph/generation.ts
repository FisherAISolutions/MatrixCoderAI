import type { BuildContract, BuildContractRoute } from '@/lib/build-contract';
import type {
  CapabilityResolutionResult,
  ResolvedCapability,
} from '@/lib/capabilities';
import { getCapabilityDefinition } from '@/lib/capabilities';
import type {
  CreateTaskGraphOptions,
  EngineeringDiscipline,
  TaskGraph,
  TaskGraphCategory,
  TaskGraphPriority,
  TaskGraphTask,
  TaskGraphWarning,
} from './types';
import {
  TASK_GRAPH_METADATA_VERSION,
  TASK_GRAPH_SCHEMA_VERSION,
} from './types';
import { detectTaskGraphCycles } from './selectors';

type TaskDraft = Omit<
  TaskGraphTask,
  | 'status'
  | 'retryCount'
  | 'failureClassification'
  | 'createdAt'
  | 'updatedAt'
  | 'startedAt'
  | 'completedAt'
  | 'resultEvidence'
  | 'blockedReason'
  | 'resumable'
  | 'fingerprint'
>;

const DEFAULT_MAX_RETRY_COUNT = 2;
const FOUNDATION_TASK_ID = 'task-foundation-project-foundation';

const disciplineValidationCommands: Partial<
  Record<EngineeringDiscipline, string[]>
> = {
  foundation: ['npm install'],
  architecture: ['npm run type-check'],
  database: ['npm run type-check'],
  authentication: ['npm run type-check'],
  backend: ['npm run type-check'],
  frontend: ['npm run type-check', 'npm run build'],
  'AI integration': ['npm run type-check'],
  'storage/media': ['npm run type-check'],
  testing: ['npm run type-check', 'npm test'],
  review: ['npm run type-check', 'npm run build'],
  deployment: ['npm run build'],
};

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+/, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'root';
}

export function stableTaskId(category: string, target: string): string {
  return `task-${slugify(category)}-${slugify(target)}`;
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function capabilityIdSet(
  capabilityResolution?: CapabilityResolutionResult | null
): Set<string> {
  return new Set(
    capabilityResolution?.capabilities.map(
      (capability) => capability.capabilityId
    ) ?? []
  );
}

function capabilitiesForCategory(
  capabilityResolution: CapabilityResolutionResult | null | undefined,
  predicate: (capability: ResolvedCapability) => boolean
): string[] {
  return unique(
    capabilityResolution?.capabilities
      .filter(predicate)
      .map((capability) => capability.capabilityId) ?? []
  );
}

function requirementIdsForCapabilities(
  capabilityResolution: CapabilityResolutionResult | null | undefined,
  capabilityIds: string[]
): string[] {
  if (!capabilityResolution) return [];
  const wanted = new Set(capabilityIds);
  return unique(
    capabilityResolution.capabilities
      .filter((capability) => wanted.has(capability.capabilityId))
      .flatMap((capability) => capability.sourceRequirementIds)
  );
}

function routeRequirementIds(contract: BuildContract, routePath: string): string[] {
  return contract.requirements
    .filter(
      (requirement) =>
        requirement.type === 'route' &&
        requirement.evidenceReferences.some(
          (evidence) => evidence.kind === 'route' && evidence.ref === routePath
        )
    )
    .map((requirement) => requirement.stableId);
}

function taskFingerprint(task: TaskDraft): string {
  return JSON.stringify({
    title: task.title,
    description: task.description,
    category: task.category,
    capabilityIds: task.capabilityIds,
    sourceRequirementIds: task.sourceRequirementIds,
    dependencies: task.dependencies,
    priority: task.priority,
    allowedFileScope: task.allowedFileScope,
    expectedFiles: task.expectedFiles,
    expectedOutputs: task.expectedOutputs,
    acceptanceChecks: task.acceptanceChecks,
    validationCommands: task.validationCommands,
    maximumRetryCount: task.maximumRetryCount,
    assignedDiscipline: task.assignedDiscipline,
  });
}

function materializeTask(
  draft: TaskDraft,
  existing: TaskGraphTask | undefined,
  nowIso: string
): TaskGraphTask {
  const fingerprint = taskFingerprint(draft);
  if (existing?.fingerprint === fingerprint) {
    return {
      ...existing,
      ...draft,
      fingerprint,
    };
  }

  const isReady = draft.dependencies.length === 0;
  return {
    ...draft,
    status: isReady ? 'ready' : 'pending',
    retryCount: 0,
    failureClassification: 'none',
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
    resultEvidence: [],
    resumable: true,
    fingerprint,
  };
}

function baseTask(
  task: Omit<
    TaskDraft,
    | 'sourceRequirementIds'
    | 'validationCommands'
    | 'maximumRetryCount'
    | 'dependencies'
    | 'capabilityIds'
  > & {
    dependencies?: string[];
    capabilityIds?: string[];
    sourceRequirementIds?: string[];
    validationCommands?: string[];
    maximumRetryCount?: number;
  }
): TaskDraft {
  const validationCommands =
    task.validationCommands ??
    disciplineValidationCommands[task.assignedDiscipline] ??
    ['npm run type-check'];

  return {
    ...task,
    capabilityIds: unique(task.capabilityIds ?? []),
    sourceRequirementIds: unique(task.sourceRequirementIds ?? []),
    dependencies: unique(task.dependencies ?? []),
    validationCommands,
    maximumRetryCount: task.maximumRetryCount ?? DEFAULT_MAX_RETRY_COUNT,
  };
}

function hasAny(capabilityIds: Set<string>, ids: string[]): boolean {
  return ids.some((id) => capabilityIds.has(id));
}

function modelFileName(modelName: string): string {
  return `${slugify(modelName)}.ts`;
}

function routeExpectedFiles(route: BuildContractRoute): string[] {
  const normalized = route.path === '/' ? '' : route.path.replace(/^\/+/, '');
  const pagePath = normalized
    ? `src/app/${normalized}/page.tsx`
    : 'src/app/page.tsx';
  const componentName =
    route.path === '/'
      ? 'HomeClient.tsx'
      : `${route.label.replace(/[^a-zA-Z0-9]/g, '') || slugify(route.path)}Client.tsx`;
  return [pagePath, `src/components/${componentName}`];
}

function routeTitle(route: BuildContractRoute): string {
  if (route.path === '/') return 'Implement home experience';
  return `Implement ${route.label || route.path} screen`;
}

function routeDependencies(
  route: BuildContractRoute,
  dependencyAnchors: {
    foundation: string;
    environment?: string;
    database?: string;
    auth?: string;
  },
  contract: BuildContract
): string[] {
  const deps = [dependencyAnchors.foundation];
  const routeText = `${route.path} ${route.label} ${route.purpose ?? ''}`.toLowerCase();
  if (
    dependencyAnchors.database &&
    (contract.dataModels.length > 0 ||
      /record|list|dashboard|library|editor|contact|task|profile|story|deal|order|item/.test(
        routeText
      ))
  ) {
    deps.push(dependencyAnchors.database);
  }
  if (
    dependencyAnchors.auth &&
    !/landing|public|home/.test(routeText) &&
    !route.path.match(/^\/$/)
  ) {
    deps.push(dependencyAnchors.auth);
  }
  if (dependencyAnchors.environment && /api|ai|upload|billing|email/.test(routeText)) {
    deps.push(dependencyAnchors.environment);
  }
  return deps;
}

function isChildrenStoryContract(
  contract: BuildContract,
  capabilityIds: Set<string>
): boolean {
  const text = [
    contract.projectSummary,
    contract.dataModels.map((model) => model.name).join(' '),
    contract.aiCapabilities.join(' '),
  ]
    .join(' ')
    .toLowerCase();
  return (
    /child|children|story|stories|character|illustration/.test(text) ||
    hasAny(capabilityIds, [
      'child-profile-management',
      'character-profile-management',
      'story-crud',
      'story-library',
      'parental-safety-review',
    ])
  );
}

function storyTasks(
  contract: BuildContract,
  capabilityResolution: CapabilityResolutionResult | null | undefined,
  capabilityIds: Set<string>,
  anchors: {
    foundation: string;
    environment?: string;
    database?: string;
    auth?: string;
    storage?: string;
  }
): TaskDraft[] {
  if (!isChildrenStoryContract(contract, capabilityIds)) return [];

  const dataDependency = anchors.database ?? anchors.foundation;
  const authDependency = anchors.auth ?? anchors.foundation;
  const storageDependency = anchors.storage ?? dataDependency;
  const envDependency = anchors.environment ?? anchors.foundation;
  const capabilityRequirementIds = (ids: string[]) =>
    requirementIdsForCapabilities(capabilityResolution, ids);

  const tasks: TaskDraft[] = [];
  tasks.push(
    baseTask({
      id: stableTaskId('data', 'story-data-model'),
      title: 'Implement story data model',
      description:
        'Create typed Story and StoryPage records that can support drafts, page editing, and generated illustrations.',
      category: 'data',
      assignedDiscipline: 'database',
      priority: 'high',
      dependencies: [dataDependency],
      capabilityIds: unique(['database', 'story-crud']),
      sourceRequirementIds: capabilityRequirementIds(['database', 'story-crud']),
      allowedFileScope: ['src/types/**', 'src/lib/**'],
      expectedFiles: ['src/types/story.ts', 'src/lib/story-storage.ts'],
      expectedOutputs: ['Typed story records', 'Safe persistence helpers'],
      acceptanceChecks: [
        'Story records include title, pages, ownership metadata, and timestamps.',
        'Story storage helpers do not depend on browser globals outside client-safe boundaries.',
      ],
    }),
    baseTask({
      id: stableTaskId('feature', 'child-profiles'),
      title: 'Implement child profiles',
      description:
        'Build the child profile workflow with safe fields and parent-owned persistence.',
      category: 'frontend',
      assignedDiscipline: 'frontend',
      priority: 'high',
      dependencies: [authDependency, dataDependency],
      capabilityIds: unique(['child-profile-management']),
      sourceRequirementIds: capabilityRequirementIds([
        'child-profile-management',
      ]),
      allowedFileScope: ['src/app/**', 'src/components/**', 'src/lib/**'],
      expectedFiles: ['src/components/ChildProfilesClient.tsx'],
      expectedOutputs: ['Child profile create/edit/list workflow'],
      acceptanceChecks: [
        'Users can create and review child profiles without exposing secrets.',
      ],
    }),
    baseTask({
      id: stableTaskId('storage', 'image-upload'),
      title: 'Implement image upload',
      description:
        'Add image upload handling for reference photos and reusable story assets.',
      category: 'storage',
      assignedDiscipline: 'storage/media',
      priority: 'high',
      dependencies: [storageDependency],
      capabilityIds: unique(['file-storage', 'image-upload']),
      sourceRequirementIds: capabilityRequirementIds([
        'file-storage',
        'image-upload',
      ]),
      allowedFileScope: ['src/components/**', 'src/lib/**', 'src/app/api/**'],
      expectedFiles: ['src/components/ImageUpload.tsx'],
      expectedOutputs: ['Upload UI', 'Image metadata persistence'],
      acceptanceChecks: [
        'Uploaded image references are represented as typed asset records.',
      ],
    }),
    baseTask({
      id: stableTaskId('feature', 'story-creation-flow'),
      title: 'Implement story creation flow',
      description:
        'Create the first complete story-making workflow from child profile to saved draft.',
      category: 'frontend',
      assignedDiscipline: 'frontend',
      priority: 'high',
      dependencies: [
        stableTaskId('data', 'story-data-model'),
        stableTaskId('feature', 'child-profiles'),
      ],
      capabilityIds: unique(['story-crud', 'crud']),
      sourceRequirementIds: capabilityRequirementIds(['story-crud', 'crud']),
      allowedFileScope: ['src/app/**', 'src/components/**', 'src/lib/**'],
      expectedFiles: ['src/components/StoryCreatorClient.tsx'],
      expectedOutputs: ['Story creation workflow', 'Saved draft state'],
      acceptanceChecks: ['A story can be created and persisted as a draft.'],
    }),
    baseTask({
      id: stableTaskId('feature', 'page-editor'),
      title: 'Implement page editor',
      description:
        'Add page-by-page editing for story text, order, and illustration references.',
      category: 'frontend',
      assignedDiscipline: 'frontend',
      priority: 'high',
      dependencies: [stableTaskId('feature', 'story-creation-flow')],
      capabilityIds: unique(['page-editor', 'rich-editor']),
      sourceRequirementIds: capabilityRequirementIds([
        'page-editor',
        'rich-editor',
      ]),
      allowedFileScope: ['src/app/**', 'src/components/**', 'src/lib/**'],
      expectedFiles: ['src/components/PageEditorClient.tsx'],
      expectedOutputs: ['Editable story pages', 'Ordered page persistence'],
      acceptanceChecks: ['Story pages can be edited without losing draft data.'],
    }),
    baseTask({
      id: stableTaskId('AI', 'text-generation-api'),
      title: 'Implement text generation API',
      description:
        'Add a guarded server API for generating child-safe story text.',
      category: 'AI',
      assignedDiscipline: 'AI integration',
      priority: 'medium',
      dependencies: [envDependency, stableTaskId('data', 'story-data-model')],
      capabilityIds: unique(['text-ai-generation']),
      sourceRequirementIds: capabilityRequirementIds(['text-ai-generation']),
      allowedFileScope: ['src/app/api/**', 'src/lib/**'],
      expectedFiles: ['src/app/api/ai/story/route.ts'],
      expectedOutputs: ['Server-side text generation endpoint'],
      acceptanceChecks: [
        'AI provider keys remain server-only.',
        'The endpoint can fail safely when AI configuration is missing.',
      ],
    }),
    baseTask({
      id: stableTaskId('feature', 'character-likeness-workflow'),
      title: 'Implement character likeness workflow',
      description:
        'Connect uploaded photos and saved character profiles to illustration planning.',
      category: 'frontend',
      assignedDiscipline: 'frontend',
      priority: 'medium',
      dependencies: [
        stableTaskId('storage', 'image-upload'),
        stableTaskId('feature', 'story-creation-flow'),
      ],
      capabilityIds: unique(['character-profile-management', 'media-library']),
      sourceRequirementIds: capabilityRequirementIds([
        'character-profile-management',
        'media-library',
      ]),
      allowedFileScope: ['src/app/**', 'src/components/**', 'src/lib/**'],
      expectedFiles: ['src/components/CharacterProfilesClient.tsx'],
      expectedOutputs: ['Reusable character profile workflow'],
      acceptanceChecks: [
        'Character profiles can reference uploaded or generated image assets.',
      ],
    }),
    baseTask({
      id: stableTaskId('AI', 'image-generation-api'),
      title: 'Implement image generation API',
      description:
        'Add a guarded server API for generating and saving story illustrations.',
      category: 'AI',
      assignedDiscipline: 'AI integration',
      priority: 'medium',
      dependencies: [
        envDependency,
        stableTaskId('feature', 'character-likeness-workflow'),
        stableTaskId('AI', 'text-generation-api'),
      ],
      capabilityIds: unique(['image-ai-generation']),
      sourceRequirementIds: capabilityRequirementIds(['image-ai-generation']),
      allowedFileScope: ['src/app/api/**', 'src/lib/**'],
      expectedFiles: ['src/app/api/ai/image/route.ts'],
      expectedOutputs: ['Server-side image generation endpoint'],
      acceptanceChecks: [
        'Generated images are represented as media records when persistence is requested.',
      ],
    }),
    baseTask({
      id: stableTaskId('feature', 'story-library'),
      title: 'Implement story library',
      description:
        'Create the story library workflow for browsing saved stories and drafts.',
      category: 'frontend',
      assignedDiscipline: 'frontend',
      priority: 'medium',
      dependencies: [
        stableTaskId('feature', 'story-creation-flow'),
        stableTaskId('feature', 'page-editor'),
      ],
      capabilityIds: unique(['story-library', 'search']),
      sourceRequirementIds: capabilityRequirementIds(['story-library', 'search']),
      allowedFileScope: ['src/app/**', 'src/components/**', 'src/lib/**'],
      expectedFiles: ['src/app/library/page.tsx', 'src/components/StoryLibraryClient.tsx'],
      expectedOutputs: ['Searchable saved story library'],
      acceptanceChecks: ['Saved stories and drafts can be found and reopened.'],
    })
  );

  return tasks;
}

function genericDataModelTasks(
  contract: BuildContract,
  capabilityResolution: CapabilityResolutionResult | null | undefined,
  dataDependency: string
): TaskDraft[] {
  return contract.dataModels.slice(0, 8).map((model) =>
    baseTask({
      id: stableTaskId('data-model', model.name),
      title: `Implement ${model.name} data model`,
      description:
        model.purpose ??
        `Create typed storage and validation helpers for ${model.name} records.`,
      category: 'data',
      assignedDiscipline: 'database',
      priority: 'medium',
      dependencies: [dataDependency],
      capabilityIds: unique(['database', 'crud']),
      sourceRequirementIds: requirementIdsForCapabilities(capabilityResolution, [
        'database',
        'crud',
      ]),
      allowedFileScope: ['src/types/**', 'src/lib/**'],
      expectedFiles: [`src/types/${modelFileName(model.name)}`],
      expectedOutputs: [`Typed ${model.name} model`, `${model.name} persistence helper`],
      acceptanceChecks: [
        `${model.name} fields match the approved Build Contract.`,
        'Persistence helpers preserve existing data safely.',
      ],
    })
  );
}

function buildTaskDrafts(
  contract: BuildContract,
  capabilityResolution: CapabilityResolutionResult | null | undefined
): { tasks: TaskDraft[]; warnings: TaskGraphWarning[] } {
  const capabilityIds = capabilityIdSet(capabilityResolution);
  const tasks: TaskDraft[] = [];
  const warnings: TaskGraphWarning[] = [];
  const allFoundationCapabilityIds = capabilitiesForCategory(
    capabilityResolution,
    (capability) => {
      const definition = getCapabilityDefinition(capability.capabilityId);
      return (
        definition?.category === 'foundation' ||
        capability.capabilityId === 'framework-nextjs' ||
        capability.capabilityId === 'typescript' ||
        capability.capabilityId === 'responsive-ui'
      );
    }
  );

  tasks.push(
    baseTask({
      id: FOUNDATION_TASK_ID,
      title: 'Create project foundation',
      description:
        'Create the Next.js App Router foundation, package scripts, global styles, and source root required by the contract.',
      category: 'foundation',
      assignedDiscipline: 'foundation',
      priority: 'critical',
      capabilityIds: allFoundationCapabilityIds,
      sourceRequirementIds: requirementIdsForCapabilities(
        capabilityResolution,
        allFoundationCapabilityIds
      ),
      allowedFileScope: [
        'package.json',
        'tsconfig.json',
        'next.config.*',
        'postcss.config.*',
        'tailwind.config.*',
        'src/app/**',
      ],
      expectedFiles: [
        'package.json',
        'tsconfig.json',
        'src/app/layout.tsx',
        'src/app/page.tsx',
        'src/app/globals.css',
      ],
      expectedOutputs: ['Buildable Next.js foundation', 'src/app-only App Router root'],
      acceptanceChecks: [
        'Project uses src/app as the only App Router root.',
        'Package scripts include dev, build, start, and type-check.',
      ],
    })
  );

  const envVars = unique([
    ...contract.environmentVariableNames,
    ...(capabilityResolution?.capabilities.flatMap(
      (capability) =>
        getCapabilityDefinition(capability.capabilityId)
          ?.requiredEnvironmentVariableNames ?? []
    ) ?? []),
  ]);
  const environmentTaskId = stableTaskId('environment', 'contract');
  if (envVars.length > 0) {
    tasks.push(
      baseTask({
        id: environmentTaskId,
        title: 'Define environment contract',
        description:
          'Document and type the required public and server-only environment variables without exposing secrets.',
        category: 'environment',
        assignedDiscipline: 'architecture',
        priority: 'high',
        dependencies: [FOUNDATION_TASK_ID],
        capabilityIds: capabilitiesForCategory(capabilityResolution, (capability) => {
          const definition = getCapabilityDefinition(capability.capabilityId);
          return Boolean(definition?.requiredEnvironmentVariableNames.length);
        }),
        sourceRequirementIds: contract.requirements
          .filter((requirement) => requirement.type === 'environment-variable')
          .map((requirement) => requirement.stableId),
        allowedFileScope: ['src/lib/**', '.env.example', 'README.md'],
        expectedFiles: ['src/lib/env.ts'],
        expectedOutputs: ['Typed environment access', 'Server/public env separation'],
        acceptanceChecks: [
          'Server secrets are never exposed to client bundles.',
          `Documented variables: ${envVars.join(', ')}`,
        ],
      })
    );
  }

  const needsDatabase =
    contract.dataModels.length > 0 ||
    hasAny(capabilityIds, ['database', 'supabase-database', 'crud']);
  const databaseTaskId = stableTaskId('database', 'types-schema');
  if (needsDatabase) {
    tasks.push(
      baseTask({
        id: databaseTaskId,
        title: hasAny(capabilityIds, ['supabase-database'])
          ? 'Define Supabase schema'
          : 'Define data types and schema',
        description:
          'Create the approved data model layer before feature UI depends on it.',
        category: 'data',
        assignedDiscipline: 'database',
        priority: 'high',
        dependencies: unique([
          FOUNDATION_TASK_ID,
          ...(envVars.length > 0 ? [environmentTaskId] : []),
        ]),
        capabilityIds: unique(
          ['database', 'supabase-database', 'crud'].filter((id) =>
            capabilityIds.has(id)
          )
        ),
        sourceRequirementIds: contract.requirements
          .filter((requirement) => requirement.type === 'data-model')
          .map((requirement) => requirement.stableId),
        allowedFileScope: ['src/types/**', 'src/lib/**', 'supabase/**'],
        expectedFiles: [
          'src/types/app-data.ts',
          'src/lib/storage.ts',
          ...(hasAny(capabilityIds, ['supabase-database'])
            ? ['supabase/migrations/*']
            : []),
        ],
        expectedOutputs: ['Typed data models', 'Persistence boundary'],
        acceptanceChecks: [
          'Every required data model from the Build Contract is represented.',
          'Storage helpers are typed and validation-friendly.',
        ],
      })
    );
  }

  if (needsDatabase) {
    tasks.push(
      baseTask({
        id: stableTaskId('architecture', 'typed-clients'),
        title: 'Create typed clients',
        description:
          'Create reusable typed client helpers for the data and integration boundaries.',
        category: 'backend',
        assignedDiscipline: 'architecture',
        priority: 'medium',
        dependencies: [databaseTaskId],
        capabilityIds: unique(
          ['database', 'supabase-database'].filter((id) => capabilityIds.has(id))
        ),
        sourceRequirementIds: requirementIdsForCapabilities(capabilityResolution, [
          'database',
          'supabase-database',
        ]),
        allowedFileScope: ['src/lib/**'],
        expectedFiles: ['src/lib/client.ts'],
        expectedOutputs: ['Reusable typed client boundary'],
        acceptanceChecks: [
          'Client helpers keep provider-specific details behind a small interface.',
        ],
      })
    );
  }

  const authTaskId = stableTaskId('authentication', 'user-accounts');
  if (hasAny(capabilityIds, ['authentication', 'role-based-access'])) {
    tasks.push(
      baseTask({
        id: authTaskId,
        title: 'Implement authentication',
        description:
          'Add account-aware UI and ownership-aware data access where the contract requires signed-in users.',
        category: 'authentication',
        assignedDiscipline: 'authentication',
        priority: 'high',
        dependencies: unique([
          FOUNDATION_TASK_ID,
          ...(needsDatabase ? [databaseTaskId] : []),
          ...(envVars.length > 0 ? [environmentTaskId] : []),
        ]),
        capabilityIds: unique(
          ['authentication', 'role-based-access'].filter((id) =>
            capabilityIds.has(id)
          )
        ),
        sourceRequirementIds: contract.requirements
          .filter(
            (requirement) =>
              requirement.type === 'authentication' ||
              requirement.type === 'role-permission'
          )
          .map((requirement) => requirement.stableId),
        allowedFileScope: ['src/app/**', 'src/components/**', 'src/lib/**'],
        expectedFiles: ['src/components/AuthGate.tsx', 'src/lib/auth.ts'],
        expectedOutputs: ['Authentication boundary', 'Role-aware state where needed'],
        acceptanceChecks: [
          'Protected workflows are not available as anonymous-only placeholders.',
        ],
      })
    );
  }

  const storageTaskId = stableTaskId('storage', 'media-boundary');
  if (hasAny(capabilityIds, ['file-storage', 'image-upload', 'media-library'])) {
    tasks.push(
      baseTask({
        id: storageTaskId,
        title: 'Implement media storage boundary',
        description:
          'Create a typed storage/media layer for uploaded files, generated assets, and reusable media records.',
        category: 'storage',
        assignedDiscipline: 'storage/media',
        priority: 'medium',
        dependencies: unique([
          needsDatabase ? databaseTaskId : FOUNDATION_TASK_ID,
          ...(envVars.length > 0 ? [environmentTaskId] : []),
        ]),
        capabilityIds: unique(
          ['file-storage', 'image-upload', 'media-library'].filter((id) =>
            capabilityIds.has(id)
          )
        ),
        sourceRequirementIds: contract.requirements
          .filter((requirement) => requirement.type === 'storage')
          .map((requirement) => requirement.stableId),
        allowedFileScope: ['src/components/**', 'src/lib/**', 'src/app/api/**'],
        expectedFiles: ['src/lib/media-storage.ts'],
        expectedOutputs: ['Typed media storage layer'],
        acceptanceChecks: [
          'File and generated-media references are stored as typed records.',
        ],
      })
    );
  }

  const anchors = {
    foundation: FOUNDATION_TASK_ID,
    environment: envVars.length > 0 ? environmentTaskId : undefined,
    database: needsDatabase ? databaseTaskId : undefined,
    auth: hasAny(capabilityIds, ['authentication']) ? authTaskId : undefined,
    storage: hasAny(capabilityIds, ['file-storage']) ? storageTaskId : undefined,
  };

  tasks.push(
    ...storyTasks(contract, capabilityResolution, capabilityIds, anchors)
  );

  if (!isChildrenStoryContract(contract, capabilityIds) && needsDatabase) {
    tasks.push(
      ...genericDataModelTasks(contract, capabilityResolution, databaseTaskId)
    );
  }

  const storyRouteTaskIds = new Set(
    isChildrenStoryContract(contract, capabilityIds)
      ? ['task-feature-story-library', 'task-feature-page-editor']
      : []
  );
  contract.routes.forEach((route) => {
    const routeTaskId = stableTaskId('route', route.path);
    if (storyRouteTaskIds.has(routeTaskId)) return;
    const expectedFiles = routeExpectedFiles(route);
    tasks.push(
      baseTask({
        id: routeTaskId,
        title: routeTitle(route),
        description:
          route.purpose ??
          `Build the ${route.path} route as a complete app screen that satisfies the approved contract.`,
        category: 'frontend',
        assignedDiscipline: 'frontend',
        priority: route.required ? 'high' : 'medium',
        dependencies: routeDependencies(route, anchors, contract),
        capabilityIds: unique(
          ['responsive-ui', 'crud', 'search', 'analytics', 'admin-dashboard'].filter(
            (id) => capabilityIds.has(id)
          )
        ),
        sourceRequirementIds: routeRequirementIds(contract, route.path),
        allowedFileScope: unique([
          expectedFiles[0],
          expectedFiles[1],
          'src/components/**',
          'src/lib/**',
        ]),
        expectedFiles,
        expectedOutputs: [`Implemented App Router screen for ${route.path}`],
        acceptanceChecks: [
          `${route.path} exists as a Server Component route page.`,
          'Interactive logic lives in client children when needed.',
          'The route is reachable through app navigation when it is primary.',
        ],
      })
    );
  });

  if (hasAny(capabilityIds, ['text-ai-generation']) && !isChildrenStoryContract(contract, capabilityIds)) {
    tasks.push(
      baseTask({
        id: stableTaskId('AI', 'server-ai-boundary'),
        title: 'Implement AI server boundary',
        description:
          'Create guarded API routes for approved AI capabilities without exposing provider secrets.',
        category: 'AI',
        assignedDiscipline: 'AI integration',
        priority: 'medium',
        dependencies: unique([
          FOUNDATION_TASK_ID,
          ...(envVars.length > 0 ? [environmentTaskId] : []),
        ]),
        capabilityIds: unique(
          ['text-ai-generation', 'image-ai-generation'].filter((id) =>
            capabilityIds.has(id)
          )
        ),
        sourceRequirementIds: contract.requirements
          .filter((requirement) => requirement.type === 'ai-capability')
          .map((requirement) => requirement.stableId),
        allowedFileScope: ['src/app/api/**', 'src/lib/**'],
        expectedFiles: ['src/app/api/ai/route.ts'],
        expectedOutputs: ['Server-only AI integration boundary'],
        acceptanceChecks: [
          'Provider secrets are read only from server-safe environment access.',
        ],
      })
    );
  }

  const routeTaskIds = contract.routes.map((route) =>
    stableTaskId('route', route.path)
  );
  const featureTaskIds = tasks
    .filter((task) =>
      ['frontend', 'backend', 'AI', 'storage', 'authentication'].includes(
        task.category
      )
    )
    .map((task) => task.id)
    .filter((id) => id !== FOUNDATION_TASK_ID);

  const testingTaskId = stableTaskId('testing', 'contract-validation');
  tasks.push(
    baseTask({
      id: testingTaskId,
      title: 'Implement tests',
      description:
        'Add focused tests for the approved data models, workflows, and app contract assumptions.',
      category: 'testing',
      assignedDiscipline: 'testing',
      priority: 'medium',
      dependencies: unique([...routeTaskIds, ...featureTaskIds]).slice(0, 30),
      capabilityIds: [],
      sourceRequirementIds: contract.requirements
        .filter((requirement) => requirement.validationStrategy !== 'manual-review')
        .map((requirement) => requirement.stableId),
      allowedFileScope: ['tests/**', 'src/**/*.test.*'],
      expectedFiles: ['tests/generated-app.test.ts'],
      expectedOutputs: ['Focused validation coverage'],
      acceptanceChecks: ['Tests cover core contract workflows without fake passes.'],
      validationCommands: ['npm test', 'npm run type-check'],
    }),
    baseTask({
      id: stableTaskId('review', 'final-contract-review'),
      title: 'Run final contract review',
      description:
        'Review the generated project against every required Build Contract capability before completion.',
      category: 'review',
      assignedDiscipline: 'review',
      priority: 'critical',
      dependencies: [testingTaskId],
      capabilityIds: [],
      sourceRequirementIds: contract.requirements.map(
        (requirement) => requirement.stableId
      ),
      allowedFileScope: ['src/**', 'tests/**', 'package.json'],
      expectedFiles: [],
      expectedOutputs: ['Contract completion evidence'],
      acceptanceChecks: [
        'No required Build Contract requirement remains pending.',
        'Generated quality, type-check, build, and runtime smoke pass.',
      ],
      validationCommands: [
        'npm run type-check',
        'npm run build',
        'npm test',
      ],
    })
  );

  if (
    hasAny(capabilityIds, ['deployment-vercel']) ||
    /vercel|deploy|deployment/i.test(contract.deploymentTarget)
  ) {
    tasks.push(
      baseTask({
        id: stableTaskId('deployment', 'readiness'),
        title: 'Prepare deployment readiness',
        description:
          'Confirm the completed project is ready for the approved deployment target.',
        category: 'deployment',
        assignedDiscipline: 'deployment',
        priority: 'medium',
        dependencies: [stableTaskId('review', 'final-contract-review')],
        capabilityIds: unique(
          ['deployment-vercel'].filter((id) => capabilityIds.has(id))
        ),
        sourceRequirementIds: contract.requirements
          .filter((requirement) => requirement.type === 'deployment')
          .map((requirement) => requirement.stableId),
        allowedFileScope: ['package.json', 'next.config.*', 'src/**'],
        expectedFiles: [],
        expectedOutputs: ['Deployment readiness report'],
        acceptanceChecks: [
          `Project is ready for ${contract.deploymentTarget || 'the selected deployment target'}.`,
        ],
      })
    );
  }

  if (!capabilityResolution) {
    warnings.push({
      code: 'missing-capability-resolution',
      message:
        'Task Graph was created from the Build Contract without resolved capabilities.',
    });
  }
  if (contract.requirements.length === 0 && contract.routes.length <= 1) {
    warnings.push({
      code: 'unknown-custom-app',
      message:
        'Build Contract has limited structured requirements; generated graph uses conservative platform defaults.',
    });
  }

  return { tasks, warnings };
}

function orderTasks(tasks: TaskDraft[]): TaskDraft[] {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<string>();
  const output: TaskDraft[] = [];

  function visit(task: TaskDraft) {
    if (seen.has(task.id)) return;
    seen.add(task.id);
    task.dependencies.forEach((dependencyId) => {
      const dependency = byId.get(dependencyId);
      if (dependency) visit(dependency);
    });
    output.push(task);
  }

  tasks.forEach(visit);
  return output;
}

function mergeDuplicateDrafts(tasks: TaskDraft[]): TaskDraft[] {
  const byId = new Map<string, TaskDraft>();
  tasks.forEach((task) => {
    const existing = byId.get(task.id);
    if (!existing) {
      byId.set(task.id, task);
      return;
    }
    byId.set(task.id, {
      ...existing,
      capabilityIds: unique([...existing.capabilityIds, ...task.capabilityIds]),
      sourceRequirementIds: unique([
        ...existing.sourceRequirementIds,
        ...task.sourceRequirementIds,
      ]),
      allowedFileScope: unique([
        ...existing.allowedFileScope,
        ...task.allowedFileScope,
      ]),
      expectedFiles: unique([...existing.expectedFiles, ...task.expectedFiles]),
      expectedOutputs: unique([
        ...existing.expectedOutputs,
        ...task.expectedOutputs,
      ]),
      acceptanceChecks: unique([
        ...existing.acceptanceChecks,
        ...task.acceptanceChecks,
      ]),
    });
  });
  return Array.from(byId.values());
}

export function createTaskGraph(options: CreateTaskGraphOptions): TaskGraph {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const projectId = options.contract.project.projectId;
  const graphId = `task-graph-${options.contract.id}`;
  const existingById = new Map(
    options.existingGraph?.tasks.map((task) => [task.id, task]) ?? []
  );
  const built = buildTaskDrafts(
    options.contract,
    options.capabilityResolution ?? null
  );
  const drafts = orderTasks(mergeDuplicateDrafts(built.tasks));
  const tasks = drafts.map((task) =>
    materializeTask(task, existingById.get(task.id), nowIso)
  );
  const cycles = detectTaskGraphCycles(tasks);
  const cycleWarnings = cycles.map((cycle) => ({
    code: 'dependency-cycle' as const,
    message: `Task dependency cycle detected: ${cycle.taskIds.join(' -> ')}`,
    taskIds: cycle.taskIds,
  }));

  return {
    schemaVersion: TASK_GRAPH_SCHEMA_VERSION,
    metadataVersion: TASK_GRAPH_METADATA_VERSION,
    id: graphId,
    projectId,
    projectName: options.contract.project.projectName,
    contractId: options.contract.id,
    contractVersion: options.contract.contractVersion,
    capabilityResolutionCreatedAt:
      options.capabilityResolution?.createdAt ?? undefined,
    sourceBuildContractUpdatedAt: options.contract.updatedAt,
    sourceCapabilityRegistryVersion:
      options.capabilityResolution?.registryVersion ?? undefined,
    tasks,
    warnings: [...built.warnings, ...cycleWarnings],
    createdAt: options.existingGraph?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };
}
