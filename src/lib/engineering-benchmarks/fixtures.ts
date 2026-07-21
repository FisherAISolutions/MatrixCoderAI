import {
  BLUEPRINT_DRAFT_METADATA_VERSION,
  type BlueprintDataModel,
  type BlueprintDraft,
  type BlueprintDraftItem,
  type BlueprintRouteItem,
} from '@/lib/blueprint-studio/blueprintDraft';
import {
  createBuildContract,
  stableRequirementId,
  type BuildContract,
  type BuildContractEvidenceReference,
  type BuildContractRequirement,
  type BuildContractRequirementType,
  type BuildContractValidationStrategy,
} from '@/lib/build-contract';
import { resolveCapabilities } from '@/lib/capabilities';
import { createArchitectDraft } from '@/lib/matrix-ai-architect/architectDraft';
import type {
  ArchitectAnswers,
  ArchitectApiSpec,
  ArchitectDataModelSpec,
  ArchitectDraft,
  ArchitectRecommendation,
  ArchitectRouteSpec,
  ArchitectSpecification,
} from '@/lib/matrix-ai-architect/types';
import { createTaskGraph } from '@/lib/task-graph';
import type {
  EngineeringAcceptanceCriterion,
  EngineeringAcceptanceFixture,
  EngineeringBenchmarkId,
} from './types';

const FIXTURE_NOW = new Date('2026-07-21T00:00:00.000Z');
const FIXTURE_NOW_ISO = FIXTURE_NOW.toISOString();

interface FixtureDefinition {
  id: EngineeringBenchmarkId;
  displayName: string;
  appType: string;
  projectId: string;
  workspaceId: string;
  prompt: string;
  answers: Partial<ArchitectAnswers>;
  specification: ArchitectSpecification;
  blueprint: Omit<
    BlueprintDraft,
    'id' | 'createdAt' | 'updatedAt' | 'metadataVersion'
  >;
  contractEnhancements?: Partial<
    Pick<
      BuildContract,
      | 'storageRequirements'
      | 'constraints'
      | 'acceptanceCriteria'
      | 'environmentVariableNames'
      | 'requiredCapabilities'
      | 'optionalCapabilities'
    >
  >;
  requiredRequirementTargets?: {
    type: BuildContractRequirementType;
    target: string;
  }[];
  extraRequirements?: BuildContractRequirement[];
  acceptanceCriteria: EngineeringAcceptanceCriterion[];
  expectedTaskTitles: string[];
  expectedCapabilityIds: string[];
  expectedRoutes: string[];
  expectedDataModels: string[];
  expectedApis: string[];
}

function item(
  prefix: string,
  name: string,
  description?: string
): BlueprintDraftItem {
  return {
    id: `${prefix}-${slugify(name)}`,
    name,
    ...(description ? { description } : {}),
  };
}

function route(
  path: string,
  label: string,
  purpose: string,
  priority: 'primary' | 'secondary' = 'primary'
): ArchitectRouteSpec {
  return { path, label, purpose, priority };
}

function blueprintRoute(
  path: string,
  name: string,
  description: string
): BlueprintRouteItem {
  return {
    id: `route-${slugify(path === '/' ? 'home' : path)}`,
    path,
    name,
    description,
  };
}

function model(
  name: string,
  fields: string[],
  purpose: string
): ArchitectDataModelSpec {
  return { name, fields, purpose };
}

function blueprintModel(
  name: string,
  fields: string[],
  description: string
): BlueprintDataModel {
  return {
    id: `model-${slugify(name)}`,
    name,
    fields,
    description,
  };
}

function api(path: string, methods: string[], purpose: string): ArchitectApiSpec {
  return { path, methods, purpose };
}

function recommendation(
  title: string,
  description: string,
  category: ArchitectRecommendation['category'],
  confidence = 90
): ArchitectRecommendation {
  return { title, description, confidence, category };
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^\/+/, '')
      .replace(/['"]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'root'
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function requirement(
  type: BuildContractRequirementType,
  target: string,
  title: string,
  description: string,
  validationStrategy: BuildContractValidationStrategy,
  evidenceReferences: BuildContractEvidenceReference[] = [
    { kind: 'note', ref: target },
  ]
): BuildContractRequirement {
  return {
    stableId: stableRequirementId(type, target),
    type,
    title,
    description,
    status: 'required',
    source: 'blueprint',
    validationStrategy,
    completionStatus: 'pending',
    evidenceReferences,
  };
}

function criterion(
  id: string,
  category: EngineeringAcceptanceCriterion['category'],
  title: string,
  description: string,
  validationStrategy: EngineeringAcceptanceCriterion['validationStrategy'] =
    'contract-review'
): EngineeringAcceptanceCriterion {
  return {
    id,
    category,
    title,
    description,
    required: true,
    validationStrategy,
  };
}

function architectDraftFor(definition: FixtureDefinition): ArchitectDraft {
  const base = createArchitectDraft({
    projectId: definition.projectId,
    projectName: definition.displayName,
    now: FIXTURE_NOW,
  });

  return {
    ...base,
    projectName: definition.displayName,
    answers: {
      ...base.answers,
      ...definition.answers,
      appIdea:
        definition.answers.appIdea ??
        definition.specification.applicationSummary,
    },
    specification: definition.specification,
    updatedAt: FIXTURE_NOW_ISO,
  };
}

function blueprintDraftFor(definition: FixtureDefinition): BlueprintDraft {
  return {
    ...definition.blueprint,
    id: `blueprint-${definition.id}`,
    createdAt: FIXTURE_NOW_ISO,
    updatedAt: FIXTURE_NOW_ISO,
    metadataVersion: BLUEPRINT_DRAFT_METADATA_VERSION,
  };
}

function mergeRequirements(
  existing: BuildContractRequirement[],
  additions: BuildContractRequirement[],
  forceRequired: FixtureDefinition['requiredRequirementTargets'] = []
): BuildContractRequirement[] {
  const requiredIds = new Set(
    forceRequired.map(({ type, target }) => stableRequirementId(type, target))
  );
  const byId = new Map<string, BuildContractRequirement>();

  existing.forEach((requirementItem) => {
    byId.set(requirementItem.stableId, {
      ...requirementItem,
      ...(requiredIds.has(requirementItem.stableId)
        ? { status: 'required' as const }
        : {}),
    });
  });
  additions.forEach((requirementItem) => {
    byId.set(requirementItem.stableId, requirementItem);
  });

  return Array.from(byId.values());
}

function buildFixture(definition: FixtureDefinition): EngineeringAcceptanceFixture {
  const architectDraft = architectDraftFor(definition);
  const blueprintDraft = blueprintDraftFor(definition);
  const baseContract = createBuildContract({
    projectId: definition.projectId,
    workspaceId: definition.workspaceId,
    projectName: definition.displayName,
    architectDraft,
    blueprintDraft,
    now: FIXTURE_NOW,
  });
  const extraAcceptanceRequirements = definition.acceptanceCriteria.map(
    (acceptanceCriterion) =>
      requirement(
        'acceptance',
        acceptanceCriterion.id,
        acceptanceCriterion.title,
        acceptanceCriterion.description,
        acceptanceCriterion.validationStrategy === 'contract-review' ||
          acceptanceCriterion.validationStrategy === 'task-graph'
          ? 'manual-review'
          : acceptanceCriterion.validationStrategy
      )
  );
  const buildContract: BuildContract = {
    ...baseContract,
    ...(definition.contractEnhancements?.storageRequirements
      ? {
          storageRequirements:
            definition.contractEnhancements.storageRequirements,
        }
      : {}),
    ...(definition.contractEnhancements?.constraints
      ? {
          constraints: unique([
            ...baseContract.constraints,
            ...definition.contractEnhancements.constraints,
          ]),
        }
      : {}),
    ...(definition.contractEnhancements?.acceptanceCriteria
      ? {
          acceptanceCriteria: unique([
            ...baseContract.acceptanceCriteria,
            ...definition.contractEnhancements.acceptanceCriteria,
          ]),
        }
      : {}),
    ...(definition.contractEnhancements?.environmentVariableNames
      ? {
          environmentVariableNames: unique([
            ...baseContract.environmentVariableNames,
            ...definition.contractEnhancements.environmentVariableNames,
          ]),
        }
      : {}),
    ...(definition.contractEnhancements?.requiredCapabilities
      ? {
          requiredCapabilities: unique([
            ...baseContract.requiredCapabilities,
            ...definition.contractEnhancements.requiredCapabilities,
          ]),
        }
      : {}),
    ...(definition.contractEnhancements?.optionalCapabilities
      ? {
          optionalCapabilities: unique([
            ...baseContract.optionalCapabilities,
            ...definition.contractEnhancements.optionalCapabilities,
          ]),
        }
      : {}),
    requirements: mergeRequirements(
      baseContract.requirements,
      [...(definition.extraRequirements ?? []), ...extraAcceptanceRequirements],
      definition.requiredRequirementTargets
    ),
    updatedAt: FIXTURE_NOW_ISO,
  };
  const capabilityResolution = resolveCapabilities(buildContract, {
    budgetMode: architectDraft.answers.investmentLevel,
    now: FIXTURE_NOW,
  });
  const taskGraph = createTaskGraph({
    contract: buildContract,
    capabilityResolution,
    now: FIXTURE_NOW,
  });

  return {
    id: definition.id,
    displayName: definition.displayName,
    appType: definition.appType,
    prompt: definition.prompt,
    architectDraft,
    blueprintDraft,
    buildContract,
    capabilityResolution,
    taskGraph,
    expectedTaskTitles: definition.expectedTaskTitles,
    expectedCapabilityIds: definition.expectedCapabilityIds,
    expectedRoutes: definition.expectedRoutes,
    expectedDataModels: definition.expectedDataModels,
    expectedApis: definition.expectedApis,
    acceptanceCriteria: definition.acceptanceCriteria,
    runConfig: {
      mode: 'structured-dry-run',
      allowLiveExecution: false,
      maxTasks: 40,
      maxRetries: 2,
      estimatedCost:
        'No live API spend. Structured fixture and task graph generation only.',
    },
  };
}

const storyRoutes = [
  route('/', 'Home', 'Public landing page and sign-in entry.'),
  route('/dashboard', 'Dashboard', 'Parent dashboard for recent stories, children, and next actions.'),
  route('/profiles', 'Profiles', 'Manage parent and child profile information.'),
  route('/characters', 'Characters', 'Save reusable character profiles and photo references.'),
  route('/create', 'Create', 'Start a new AI-assisted story from a child and character selection.'),
  route('/editor', 'Editor', 'Edit story pages, text, and illustration prompts page by page.'),
  route('/stories', 'Stories', 'Browse story drafts and generated story pages.'),
  route('/library', 'Library', 'Search, reopen, and manage saved stories.'),
];

const storyModels = [
  model('ParentProfile', ['id', 'userId', 'displayName', 'email', 'createdAt'], 'Parent-owned account profile.'),
  model('ChildProfile', ['id', 'parentId', 'name', 'ageRange', 'interests', 'photoAssetId', 'createdAt'], 'Child details and optional reference photo.'),
  model('CharacterProfile', ['id', 'parentId', 'childId', 'name', 'traits', 'photoAssetId', 'likenessNotes'], 'Reusable story character profile.'),
  model('Story', ['id', 'parentId', 'childId', 'title', 'status', 'theme', 'createdAt', 'updatedAt'], 'Saved story draft or completed story.'),
  model('StoryPage', ['id', 'storyId', 'pageNumber', 'text', 'illustrationPrompt', 'illustrationAssetId'], 'Editable page text and illustration linkage.'),
  model('StoryIllustration', ['id', 'storyPageId', 'assetId', 'prompt', 'provider', 'createdAt'], 'Generated illustration metadata.'),
  model('MediaAsset', ['id', 'ownerId', 'bucket', 'path', 'mimeType', 'purpose', 'createdAt'], 'Uploaded child photos and generated image assets.'),
  model('GenerationJob', ['id', 'ownerId', 'storyId', 'type', 'status', 'error', 'createdAt'], 'AI generation attempt tracking.'),
];

const storyApis = [
  api('/api/ai/story', ['POST'], 'Generate child-safe story text from approved story settings.'),
  api('/api/ai/illustration', ['POST'], 'Regenerate one story page illustration server-side.'),
  api('/api/storage/upload', ['POST'], 'Upload child photos and reusable character image references.'),
  api('/api/stories', ['GET', 'POST', 'PATCH'], 'Create, list, and update parent-owned stories.'),
  api('/api/stories/[id]/pages', ['PATCH'], 'Save per-page text edits and illustration metadata.'),
];

const childrenStoryDefinition: FixtureDefinition = {
  id: 'children-story-platform',
  displayName: 'Personalized AI Children Story Platform',
  appType: 'AI storytelling',
  projectId: 'fixture-children-story-project',
  workspaceId: 'fixture-children-story-workspace',
  prompt:
    'Build a personalized AI children story platform with parent accounts, child profiles, photo upload, character profiles, AI story generation, page editor, illustration regeneration, library, Supabase, OpenAI, and Vercel readiness.',
  answers: {
    appIdea:
      'A personalized AI children story platform where parents create child profiles, upload child photos, save character profiles, generate stories, edit pages, regenerate illustrations, and keep a story library.',
    investmentLevel: 'professional',
    primaryUsers: 'Parents and guardians creating personalized stories for children.',
    accountsRequired: true,
    adminPanel: true,
    mobileSupport: ['responsive-web'],
    payments: false,
    notifications: ['email-ready'],
    aiFeatures: [
      'AI story generation',
      'AI illustration generation',
      'likeness-based character generation planning',
    ],
    database: 'supabase',
    publicWebsite: true,
    dashboard: true,
    auth: 'supabase',
    deploymentTarget: 'vercel',
    integrations: ['Supabase', 'Supabase Auth', 'Supabase Storage', 'OpenAI', 'Vercel'],
    customRequirements:
      'Use RLS and parent ownership isolation. Keep OpenAI keys server-only. Support page-by-page editing and per-page illustration regeneration.',
  },
  specification: {
    applicationSummary:
      'A personalized AI children story platform for parents to create child profiles, save characters, generate stories and illustrations, edit pages, and manage a story library.',
    recommendedArchitecture:
      'Next.js 15 App Router with Server Component route pages, client children for editor workflows, Supabase Auth, Supabase database, Supabase Storage, server-only OpenAI APIs, and Vercel readiness.',
    recommendedFolderStructure: [
      'src/app - App Router pages and server API routes',
      'src/components - client workflows for profiles, editor, library, and media upload',
      'src/lib - Supabase clients, storage helpers, AI provider boundary, and ownership guards',
      'src/types - story, profile, media, and generation job types',
      'supabase/migrations - schema and RLS policies',
    ],
    recommendedRoutes: storyRoutes,
    recommendedDataModels: storyModels,
    recommendedComponents: [
      'Parent dashboard',
      'Child profile manager',
      'Character profile manager',
      'Photo upload control',
      'Story creation wizard',
      'Page-by-page story editor',
      'Illustration regeneration panel',
      'Story library',
      'Loading and error states',
    ],
    recommendedApis: storyApis,
    recommendedIntegrations: [
      'Supabase',
      'Supabase Auth',
      'Supabase Storage',
      'OpenAI',
      'Vercel',
    ],
    recommendedAuth:
      'Supabase authentication with parent-owned records, RLS policies, and no cross-parent data access.',
    recommendedDeployment:
      'Vercel deployment after production checks pass, with documented environment variables.',
    estimatedComplexity: 'platform',
    estimatedGenerationSize: 'expanded',
    estimatedAiPasses: 5,
    confidenceScore: 91,
    recommendations: [
      recommendation('Use Supabase RLS from the start', 'Parent-owned stories and children profiles need database-level ownership isolation.', 'database'),
      recommendation('Keep OpenAI calls server-only', 'Story and illustration generation must never expose provider keys in browser bundles.', 'ai'),
      recommendation('Build editor as a dedicated vertical slice', 'The page editor is the core product workflow and should be validated separately.', 'architecture'),
    ],
  },
  blueprint: {
    projectName: 'Personalized AI Children Story Platform',
    appDescription:
      'Parents create child profiles, upload child photos, save character profiles, generate AI stories, edit each story page, regenerate illustrations, and keep a private story library.',
    routes: storyRoutes.map((routeItem) =>
      blueprintRoute(routeItem.path, routeItem.label, routeItem.purpose)
    ),
    dataModels: storyModels.map((modelItem) =>
      blueprintModel(modelItem.name, modelItem.fields, modelItem.purpose ?? '')
    ),
    components: [
      item('component', 'Parent dashboard', 'Status cards, recent stories, and next actions.'),
      item('component', 'Child profile manager', 'Create/edit child profiles with safe fields.'),
      item('component', 'Character profile manager', 'Reusable story character profiles.'),
      item('component', 'Photo upload control', 'Child and character reference image upload.'),
      item('component', 'Story creation wizard', 'Guided story generation inputs.'),
      item('component', 'Page-by-page story editor', 'Editable story pages and illustration controls.'),
      item('component', 'Story library', 'Search and reopen saved stories.'),
    ],
    integrations: [
      item('integration', 'Supabase Auth'),
      item('integration', 'Supabase Database'),
      item('integration', 'Supabase Storage'),
      item('integration', 'OpenAI'),
      item('integration', 'Vercel'),
    ],
    userRoles: [
      item('role', 'Parent', 'Owns children, characters, stories, and uploaded assets.'),
      item('role', 'Admin', 'Reviews operational health and support issues.'),
    ],
    navigation: storyRoutes.map((routeItem) =>
      item('navigation', routeItem.label, `Link to ${routeItem.path}`)
    ),
    folderStructure: [
      item('folder', 'src/app', 'App Router pages and API routes.'),
      item('folder', 'src/components/story', 'Story workflow client components.'),
      item('folder', 'src/lib/story', 'Story storage, AI, and ownership helpers.'),
      item('folder', 'src/types', 'Shared domain types.'),
      item('folder', 'supabase/migrations', 'Database schema and RLS.'),
    ],
    deploymentTarget: 'Vercel',
  },
  contractEnhancements: {
    storageRequirements: [
      'Supabase Storage bucket for child photos and generated story illustrations.',
      'Typed media asset records must store owner, bucket, path, mime type, and purpose.',
    ],
    environmentVariableNames: [
      'NEXT_PUBLIC_SUPABASE_URL',
      'NEXT_PUBLIC_SUPABASE_ANON_KEY',
      'OPENAI_API_KEY',
    ],
    requiredCapabilities: [
      'authentication',
      'role-based-access',
      'database',
      'supabase-database',
      'file-storage',
      'image-upload',
      'media-library',
      'text-ai-generation',
      'image-ai-generation',
      'child-profile-management',
      'character-profile-management',
      'story-crud',
      'story-library',
      'deployment-vercel',
      'responsive-ui',
    ],
    constraints: [
      'OPENAI_API_KEY must be read only in server code.',
      'Supabase RLS policies must isolate all parent-owned records.',
      'No placeholder route pages may satisfy required story workflows.',
    ],
    acceptanceCriteria: [
      'All required story routes are implemented and linked.',
      'Parents cannot access records owned by another parent.',
      'Story pages support per-page text edits and per-page illustration regeneration.',
      'Production build passes before deployment readiness is reported.',
    ],
  },
  requiredRequirementTargets: [
    { type: 'ai-capability', target: 'AI story generation' },
    { type: 'ai-capability', target: 'AI illustration generation' },
    { type: 'ai-capability', target: 'likeness-based character generation planning' },
    { type: 'integration', target: 'OpenAI' },
    { type: 'integration', target: 'Supabase' },
    { type: 'storage', target: 'Supabase Storage' },
  ],
  extraRequirements: [
    requirement(
      'storage',
      'story-media-storage',
      'Story media storage',
      'Child photos and generated illustrations are stored through Supabase Storage with owner-scoped metadata.',
      'content-check'
    ),
    requirement(
      'constraint',
      'rls-parent-ownership',
      'RLS parent ownership',
      'Every story, child, character, generation job, and media asset belongs to a parent account and is protected by ownership checks.',
      'manual-review'
    ),
    requirement(
      'api',
      '/api/ai/story',
      'Story generation API',
      'Story text generation is implemented through a guarded server route.',
      'content-check'
    ),
    requirement(
      'api',
      '/api/ai/illustration',
      'Illustration generation API',
      'Per-page illustration regeneration is implemented through a guarded server route.',
      'content-check'
    ),
    requirement(
      'api',
      '/api/storage/upload',
      'Image upload API',
      'Child photos and character references can be uploaded through a typed upload boundary.',
      'content-check'
    ),
  ],
  acceptanceCriteria: [
    criterion('story-routes', 'routes', 'Required story routes', 'Implement /, /dashboard, /profiles, /characters, /create, /editor, /stories, and /library as real App Router pages.', 'route-exists'),
    criterion('story-data-models', 'data-models', 'Story data models', 'Implement parent, child, character, story, story page, illustration, media asset, and generation job models.'),
    criterion('story-apis', 'apis', 'Story APIs', 'Implement guarded story generation, illustration regeneration, upload, and story persistence APIs.'),
    criterion('story-storage', 'storage', 'Supabase storage', 'Use Supabase Storage for child photos and generated illustrations with typed media metadata.'),
    criterion('server-only-ai-keys', 'security', 'Server-only AI keys', 'OPENAI_API_KEY must never appear in client code, browser storage, logs, or generated UI.', 'content-check'),
    criterion('story-editor', 'editor', 'Page editor functionality', 'Support page-by-page story text editing and per-page illustration regeneration.'),
    criterion('loading-error-states', 'states', 'Loading and error states', 'AI generation, upload, save, and regeneration flows must have loading, empty, and error states.'),
    criterion('ownership-isolation', 'ownership', 'Ownership isolation', 'Supabase RLS and application checks must prevent cross-parent access.'),
    criterion('production-build', 'build', 'Production build', 'TypeScript, build, runtime smoke, and generated quality must pass before completion.', 'build'),
    criterion('no-placeholder-pages', 'quality', 'No placeholder pages', 'Required routes must not be placeholder pages or generic fallback screens.', 'generated-quality'),
    criterion('vercel-readiness', 'deployment', 'Vercel readiness', 'Deployment metadata and environment template must be ready for Vercel.'),
  ],
  expectedTaskTitles: [
    'Create project foundation',
    'Define environment contract',
    'Define Supabase schema',
    'Create typed clients',
    'Implement authentication',
    'Implement child profiles',
    'Implement image upload',
    'Implement story data model',
    'Implement story creation flow',
    'Implement page editor',
    'Implement text generation API',
    'Implement character likeness workflow',
    'Implement image generation API',
    'Implement story library',
    'Implement tests',
    'Run final contract review',
    'Prepare deployment readiness',
  ],
  expectedCapabilityIds: [
    'authentication',
    'role-based-access',
    'database',
    'supabase-database',
    'file-storage',
    'image-upload',
    'media-library',
    'text-ai-generation',
    'image-ai-generation',
    'child-profile-management',
    'character-profile-management',
    'story-crud',
    'story-library',
    'parental-safety-review',
    'deployment-vercel',
    'responsive-ui',
  ],
  expectedRoutes: storyRoutes.map((routeItem) => routeItem.path),
  expectedDataModels: storyModels.map((modelItem) => modelItem.name),
  expectedApis: storyApis.map((apiItem) => apiItem.path),
};

const businessDefinition: FixtureDefinition = {
  id: 'simple-business-website',
  displayName: 'Simple Business Website',
  appType: 'marketing website',
  projectId: 'fixture-business-project',
  workspaceId: 'fixture-business-workspace',
  prompt:
    'Build a responsive local service business website with home, services, about, and contact pages plus a contact inquiry form.',
  answers: {
    appIdea: 'A responsive service business website with a contact form.',
    investmentLevel: 'free-first',
    primaryUsers: 'Potential customers researching a local service business.',
    accountsRequired: false,
    adminPanel: false,
    database: 'local',
    publicWebsite: true,
    dashboard: false,
    auth: 'none',
    deploymentTarget: 'vercel',
    integrations: ['Vercel'],
  },
  specification: {
    applicationSummary:
      'A simple business website that explains services, builds trust, and captures contact inquiries.',
    recommendedArchitecture:
      'Next.js 15 App Router with static marketing routes and a lightweight contact form boundary.',
    recommendedFolderStructure: [
      'src/app - static pages',
      'src/components - marketing sections and contact form',
      'src/lib - contact form validation helpers',
    ],
    recommendedRoutes: [
      route('/', 'Home', 'Landing page with offer, proof, and call to action.'),
      route('/services', 'Services', 'Service list and details.'),
      route('/about', 'About', 'Business story and trust signals.'),
      route('/contact', 'Contact', 'Contact form and business details.'),
    ],
    recommendedDataModels: [
      model('ContactInquiry', ['id', 'name', 'email', 'message', 'createdAt'], 'Contact form submission shape.'),
    ],
    recommendedComponents: [
      'Hero section',
      'Services grid',
      'Testimonials',
      'Contact form',
      'Footer',
    ],
    recommendedApis: [
      api('/api/contact', ['POST'], 'Validate contact inquiry submissions.'),
    ],
    recommendedIntegrations: ['Vercel'],
    recommendedAuth: 'No accounts required.',
    recommendedDeployment: 'Vercel-ready static marketing site.',
    estimatedComplexity: 'small',
    estimatedGenerationSize: 'compact',
    estimatedAiPasses: 2,
    confidenceScore: 88,
    recommendations: [
      recommendation('Keep it static-first', 'A free-first business site should avoid unnecessary backend dependencies.', 'cost'),
    ],
  },
  blueprint: {
    projectName: 'Simple Business Website',
    appDescription:
      'A professional local service business website with service pages, trust-building sections, and a contact inquiry form.',
    routes: [
      blueprintRoute('/', 'Home', 'Landing page.'),
      blueprintRoute('/services', 'Services', 'Services overview.'),
      blueprintRoute('/about', 'About', 'Business background.'),
      blueprintRoute('/contact', 'Contact', 'Contact form.'),
    ],
    dataModels: [
      blueprintModel('ContactInquiry', ['name', 'email', 'message', 'createdAt'], 'Contact form submission.'),
    ],
    components: [
      item('component', 'Hero section'),
      item('component', 'Services grid'),
      item('component', 'Contact form'),
      item('component', 'Footer'),
    ],
    integrations: [item('integration', 'Vercel')],
    userRoles: [item('role', 'Visitor')],
    navigation: [
      item('navigation', 'Home', 'Link to /'),
      item('navigation', 'Services', 'Link to /services'),
      item('navigation', 'About', 'Link to /about'),
      item('navigation', 'Contact', 'Link to /contact'),
    ],
    folderStructure: [
      item('folder', 'src/app'),
      item('folder', 'src/components'),
      item('folder', 'src/lib'),
    ],
    deploymentTarget: 'Vercel',
  },
  acceptanceCriteria: [
    criterion('business-routes', 'routes', 'Business routes', 'Home, services, about, and contact pages exist and are linked.', 'route-exists'),
    criterion('business-contact-form', 'apis', 'Contact form', 'Contact form validates required fields and reports errors.'),
    criterion('business-responsive', 'quality', 'Responsive marketing UI', 'Marketing sections are responsive and not placeholders.', 'generated-quality'),
    criterion('business-build', 'build', 'Production build', 'Production build passes.', 'build'),
  ],
  expectedTaskTitles: [
    'Create project foundation',
    'Define data types and schema',
    'Implement ContactInquiry data model',
    'Implement home experience',
    'Implement Services screen',
    'Implement About screen',
    'Implement Contact screen',
    'Implement tests',
    'Run final contract review',
    'Prepare deployment readiness',
  ],
  expectedCapabilityIds: ['framework-nextjs', 'typescript', 'responsive-ui', 'database', 'crud', 'deployment-vercel'],
  expectedRoutes: ['/', '/services', '/about', '/contact'],
  expectedDataModels: ['ContactInquiry'],
  expectedApis: ['/api/contact'],
};

const saasDefinition: FixtureDefinition = {
  id: 'crud-saas-dashboard',
  displayName: 'CRUD SaaS Dashboard',
  appType: 'SaaS dashboard',
  projectId: 'fixture-saas-project',
  workspaceId: 'fixture-saas-workspace',
  prompt:
    'Build a CRUD SaaS dashboard with authentication, workspaces, items, reports, settings, Supabase database, and Vercel readiness.',
  answers: {
    appIdea:
      'A CRUD SaaS dashboard where users manage workspace records, search data, view reports, and update settings.',
    investmentLevel: 'lean',
    primaryUsers: 'Small teams managing operational records.',
    accountsRequired: true,
    adminPanel: true,
    database: 'supabase',
    publicWebsite: true,
    dashboard: true,
    analytics: true,
    auth: 'supabase',
    deploymentTarget: 'vercel',
    integrations: ['Supabase', 'Supabase Auth', 'Vercel'],
    customRequirements:
      'Use ownership-aware workspaces, CRUD screens, search, empty states, and production checks.',
  },
  specification: {
    applicationSummary:
      'A CRUD SaaS dashboard with authenticated workspaces, records, reports, and settings.',
    recommendedArchitecture:
      'Next.js 15 App Router with Supabase Auth, workspace-scoped data models, typed storage helpers, and Server Component route pages.',
    recommendedFolderStructure: [
      'src/app - app routes and server pages',
      'src/components - dashboard and CRUD clients',
      'src/lib - Supabase clients and workspace storage',
      'src/types - SaaS domain types',
      'supabase/migrations - schema and RLS',
    ],
    recommendedRoutes: [
      route('/', 'Home', 'Public product overview and sign-in entry.'),
      route('/dashboard', 'Dashboard', 'Authenticated summary dashboard.'),
      route('/items', 'Items', 'CRUD records with search and filters.'),
      route('/reports', 'Reports', 'Charts and reporting summaries.'),
      route('/settings', 'Settings', 'Workspace and account settings.'),
    ],
    recommendedDataModels: [
      model('UserProfile', ['id', 'userId', 'name', 'role'], 'Authenticated user profile.'),
      model('Workspace', ['id', 'ownerId', 'name', 'plan', 'createdAt'], 'Workspace ownership boundary.'),
      model('ProjectItem', ['id', 'workspaceId', 'title', 'status', 'priority', 'notes'], 'Primary CRUD record.'),
      model('Report', ['id', 'workspaceId', 'title', 'metric', 'value', 'createdAt'], 'Saved dashboard report metric.'),
    ],
    recommendedComponents: [
      'Auth gate',
      'Dashboard cards',
      'Data table',
      'Search and filters',
      'Settings form',
      'Reports charts',
    ],
    recommendedApis: [
      api('/api/items', ['GET', 'POST', 'PATCH', 'DELETE'], 'Workspace-scoped CRUD item endpoint.'),
      api('/api/reports', ['GET'], 'Workspace-scoped reporting endpoint.'),
    ],
    recommendedIntegrations: ['Supabase', 'Supabase Auth', 'Vercel'],
    recommendedAuth:
      'Supabase authentication with workspace ownership and role-aware access.',
    recommendedDeployment: 'Vercel deployment after production checks pass.',
    estimatedComplexity: 'large',
    estimatedGenerationSize: 'expanded',
    estimatedAiPasses: 4,
    confidenceScore: 90,
    recommendations: [
      recommendation('Use workspace ownership from day one', 'SaaS data must be isolated by workspace and user.', 'database'),
      recommendation('Build CRUD as vertical slices', 'Each model should ship with route, form, table, and validation together.', 'architecture'),
    ],
  },
  blueprint: {
    projectName: 'CRUD SaaS Dashboard',
    appDescription:
      'A lean SaaS dashboard with authenticated workspaces, CRUD item management, reporting, settings, and production readiness.',
    routes: [
      blueprintRoute('/', 'Home', 'Public product overview.'),
      blueprintRoute('/dashboard', 'Dashboard', 'Authenticated dashboard.'),
      blueprintRoute('/items', 'Items', 'CRUD records.'),
      blueprintRoute('/reports', 'Reports', 'Analytics reports.'),
      blueprintRoute('/settings', 'Settings', 'Workspace settings.'),
    ],
    dataModels: [
      blueprintModel('UserProfile', ['userId', 'name', 'role'], 'Authenticated profile.'),
      blueprintModel('Workspace', ['ownerId', 'name', 'plan'], 'Workspace boundary.'),
      blueprintModel('ProjectItem', ['workspaceId', 'title', 'status', 'priority', 'notes'], 'Primary CRUD entity.'),
      blueprintModel('Report', ['workspaceId', 'title', 'metric', 'value'], 'Report metric.'),
    ],
    components: [
      item('component', 'Auth gate'),
      item('component', 'Dashboard cards'),
      item('component', 'Data table'),
      item('component', 'Search and filters'),
      item('component', 'Settings form'),
    ],
    integrations: [
      item('integration', 'Supabase Auth'),
      item('integration', 'Supabase Database'),
      item('integration', 'Vercel'),
    ],
    userRoles: [
      item('role', 'Owner'),
      item('role', 'Member'),
    ],
    navigation: [
      item('navigation', 'Dashboard', 'Link to /dashboard'),
      item('navigation', 'Items', 'Link to /items'),
      item('navigation', 'Reports', 'Link to /reports'),
      item('navigation', 'Settings', 'Link to /settings'),
    ],
    folderStructure: [
      item('folder', 'src/app'),
      item('folder', 'src/components/dashboard'),
      item('folder', 'src/lib/saas'),
      item('folder', 'src/types'),
      item('folder', 'supabase/migrations'),
    ],
    deploymentTarget: 'Vercel',
  },
  contractEnhancements: {
    requiredCapabilities: [
      'authentication',
      'database',
      'supabase-database',
      'crud',
      'search',
      'analytics',
      'admin-dashboard',
      'deployment-vercel',
    ],
    constraints: [
      'Workspace-scoped data must not leak between users.',
      'CRUD screens must include empty and error states.',
    ],
    acceptanceCriteria: [
      'Authenticated users can manage workspace-owned records.',
      'Required SaaS dashboard routes are implemented and linked.',
    ],
  },
  acceptanceCriteria: [
    criterion('saas-routes', 'routes', 'SaaS routes', 'Home, dashboard, items, reports, and settings routes exist and are linked.', 'route-exists'),
    criterion('saas-models', 'data-models', 'SaaS data models', 'User, workspace, item, and report models exist.'),
    criterion('saas-ownership', 'ownership', 'Workspace ownership', 'Records are scoped by user or workspace ownership.'),
    criterion('saas-build', 'build', 'Production build', 'Production build passes.', 'build'),
  ],
  expectedTaskTitles: [
    'Create project foundation',
    'Define environment contract',
    'Define Supabase schema',
    'Create typed clients',
    'Implement authentication',
    'Implement UserProfile data model',
    'Implement Workspace data model',
    'Implement ProjectItem data model',
    'Implement Report data model',
    'Implement Dashboard screen',
    'Implement Items screen',
    'Implement Reports screen',
    'Implement Settings screen',
    'Implement tests',
    'Run final contract review',
    'Prepare deployment readiness',
  ],
  expectedCapabilityIds: [
    'authentication',
    'database',
    'supabase-database',
    'crud',
    'search',
    'analytics',
    'admin-dashboard',
    'deployment-vercel',
    'responsive-ui',
  ],
  expectedRoutes: ['/', '/dashboard', '/items', '/reports', '/settings'],
  expectedDataModels: ['UserProfile', 'Workspace', 'ProjectItem', 'Report'],
  expectedApis: ['/api/items', '/api/reports'],
};

export const engineeringAcceptanceFixtures: EngineeringAcceptanceFixture[] = [
  buildFixture(childrenStoryDefinition),
  buildFixture(businessDefinition),
  buildFixture(saasDefinition),
];

export function getEngineeringAcceptanceFixture(
  id: EngineeringBenchmarkId
): EngineeringAcceptanceFixture | undefined {
  return engineeringAcceptanceFixtures.find((fixture) => fixture.id === id);
}
