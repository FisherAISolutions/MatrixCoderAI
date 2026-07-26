import type { FileNode } from '@/app/chat-workspace/components/types';
import type {
  BuildContract,
  BuildContractRequirement,
  BuildContractRequirementType,
} from '@/lib/build-contract';
import { flattenTree } from '@/lib/repo/heuristics';
import type { RepositoryApiRoute, RepositoryModel } from '@/lib/repository-model';
import { normalizeRepositoryPath } from '@/lib/repository-model';
import type { TaskGraphCategory, TaskGraphTask } from '@/lib/task-graph';
import { stableTaskId } from '@/lib/task-graph';
import type { ValidationResult, ValidationStep } from '@/lib/validation/engine';
import {
  CONTRACT_REVIEW_METADATA_VERSION,
  CONTRACT_REVIEW_SCHEMA_VERSION,
  type ContractReviewCategory,
  type ContractReviewEvidence,
  type ContractReviewFinalSummary,
  type ContractReviewReport,
  type ContractReviewRequirementReport,
  type ContractReviewRequirementStatus,
  type ContractReviewValidationResult,
} from './types';

export interface CreateContractReviewOptions {
  contract: BuildContract;
  repositoryModel: RepositoryModel;
  files?: FileNode[];
  validationResult?: ValidationResult | null;
  now?: Date;
}

type RequirementEvaluation = Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
>;

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function slugify(value: string): string {
  return (
    value
      .trim()
      .toLowerCase()
      .replace(/^\/+/, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'root'
  );
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function pluralCandidates(value: string): string[] {
  const lower = value.toLowerCase();
  const dashed = lower.replace(/([a-z])([A-Z])/g, '$1-$2').toLowerCase();
  const snake = dashed.replace(/-/g, '_');
  const compact = lower.replace(/[^a-z0-9]/g, '');
  return unique([
    lower,
    dashed,
    snake,
    compact,
    `${lower}s`,
    `${dashed}s`,
    `${snake}s`,
    lower.endsWith('y') ? `${lower.slice(0, -1)}ies` : '',
  ]);
}

function contentMap(files?: FileNode[]): Map<string, string> {
  const out = new Map<string, string>();
  flattenTree(files ?? [])
    .filter((file) => file.type === 'file' && typeof file.content === 'string')
    .forEach((file) => {
      out.set(normalizeRepositoryPath(file.path), file.content ?? '');
    });
  return out;
}

function allFilePaths(files?: FileNode[]): Set<string> {
  return new Set(
    flattenTree(files ?? [])
      .filter((file) => file.type === 'file')
      .map((file) => normalizeRepositoryPath(file.path))
  );
}

const REQUIREMENT_STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'app',
  'application',
  'approved',
  'be',
  'for',
  'from',
  'in',
  'include',
  'included',
  'is',
  'must',
  'of',
  'or',
  'plan',
  'should',
  'the',
  'to',
  'with',
]);

function requirementTerms(requirement: BuildContractRequirement): string[] {
  return unique(
    normalizeText(`${requirement.title} ${requirement.description}`)
      .split(' ')
      .filter(
        (term) =>
          term.length >= 3 &&
          !REQUIREMENT_STOP_WORDS.has(term) &&
          !/^(route|model|integration|capability|requirement)$/.test(term)
      )
  );
}

function matchingContentFiles(
  contents: Map<string, string>,
  terms: string[],
  minimumMatches = 1
): string[] {
  if (terms.length === 0) return [];
  return Array.from(contents.entries())
    .filter(([, content]) => {
      const normalized = normalizeText(content);
      return terms.filter((term) => normalized.includes(term)).length >= minimumMatches;
    })
    .map(([path]) => path);
}

function explicitFileReferences(
  requirement: BuildContractRequirement
): string[] {
  return unique(
    requirement.evidenceReferences
      .filter((evidence) => evidence.kind === 'file')
      .map((evidence) => normalizeRepositoryPath(evidence.ref))
  );
}

function evaluateExplicitFiles(
  requirement: BuildContractRequirement,
  paths: Set<string>
): RequirementEvaluation | undefined {
  const expected = explicitFileReferences(requirement);
  if (expected.length === 0 || requirement.validationStrategy !== 'file-exists') {
    return undefined;
  }
  const missing = expected.filter((path) => !paths.has(path));
  if (missing.length > 0) {
    return {
      status: 'missing',
      evidence: missing.map((path) =>
        fileEvidence(path, 'Required file was not found.')
      ),
      relatedFiles: expected,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Create the required file${missing.length === 1 ? '' : 's'} ${missing.join(', ')}.`,
    };
  }
  return {
    status: 'satisfied',
    evidence: expected.map((path) =>
      ({
        kind: /\.(?:png|jpe?g|gif|webp|ico|svg|woff2?|ttf|pdf)$/i.test(path)
          ? 'asset'
          : 'file',
        ref: path,
        description: 'Required repository artifact exists.',
      }) satisfies ContractReviewEvidence
    ),
    relatedFiles: expected,
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: 'passed',
  };
}

function categoryForRequirement(
  requirement: BuildContractRequirement
): ContractReviewCategory {
  if (requirement.type === 'route') return 'required routes';
  if (requirement.type === 'navigation' || requirement.type === 'layout') {
    return 'navigation';
  }
  if (requirement.type === 'data-model' || requirement.type === 'relationship') {
    return 'data models';
  }
  if (requirement.type === 'authentication') return 'authentication';
  if (requirement.type === 'role-permission') return 'ownership/security';
  if (requirement.type === 'api' || requirement.type === 'background-job') {
    return 'APIs';
  }
  if (requirement.type === 'ai-capability') return 'AI features';
  if (requirement.type === 'storage') return 'storage';
  if (requirement.type === 'billing') return 'billing';
  if (requirement.type === 'environment-variable') {
    return 'environment variable template';
  }
  if (requirement.type === 'responsive') return 'responsive design';
  if (requirement.type === 'accessibility') return 'accessibility';
  if (requirement.type === 'visual') return 'visual requirements';
  if (
    requirement.type === 'acceptance' &&
    /test|spec|coverage/i.test(requirement.description)
  ) {
    return 'tests';
  }
  if (
    requirement.type === 'acceptance' &&
    /error|empty state|failure|recover/i.test(requirement.description)
  ) {
    return 'error states';
  }
  if (requirement.type === 'deployment') return 'deployment readiness';
  return 'deployment readiness';
}

function validationForStep(
  validationResult: ValidationResult | null | undefined,
  step: ValidationStep
): ContractReviewValidationResult {
  if (!validationResult) return 'not run';
  const result = validationResult.steps.find((item) => item.step === step);
  if (!result) return validationResult.skipped ? 'blocked' : 'not run';
  if (result.status === 'ok') return 'passed';
  if (result.status === 'failed') return 'failed';
  return 'not run';
}

function buildValidationPassed(
  validationResult: ValidationResult | null | undefined
): boolean {
  if (!validationResult) return false;
  return (
    validationResult.success ||
    validationResult.steps.some(
      (step) => step.step === 'build' && step.status === 'ok'
    )
  );
}

function validationEvidence(
  validationResult: ValidationResult | null | undefined,
  step: ValidationStep
): ContractReviewEvidence[] {
  if (!validationResult) return [];
  const result = validationResult.steps.find((item) => item.step === step);
  if (!result) return [];
  return [
    {
      kind: 'validation',
      ref: step,
      description: `${step} ${result.status}`,
    },
  ];
}

function routeFileFor(path: string): string {
  if (path === '/') return 'src/app/page.tsx';
  return `src/app/${path.replace(/^\/+/, '')}/page.tsx`;
}

function rootPageContent(contents: Map<string, string>): string {
  return (
    contents.get('src/app/page.tsx') ??
    contents.get('app/page.tsx') ??
    ''
  );
}

function routeLinkedFromHome(routePath: string, contents: Map<string, string>): boolean {
  if (routePath === '/') return true;
  const page = rootPageContent(contents);
  if (!page) return false;
  const escaped = routePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  if (new RegExp(`href\\s*=\\s*["'\`]${escaped}["'\`]`).test(page)) return true;
  if (new RegExp(`href\\s*=\\s*\\{\\s*["'\`]${escaped}["'\`]\\s*\\}`).test(page)) {
    return true;
  }
  const label = routePath
    .slice(1)
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
  return (
    page.includes(`href: '${routePath}'`) ||
    page.includes(`href: "${routePath}"`) ||
    page.includes(`'${label}'`) && page.includes('toLowerCase()') ||
    page.includes(`"${label}"`) && page.includes('toLowerCase()')
  );
}

function hasValidationErrorFor(
  repositoryModel: RepositoryModel,
  paths: string[]
): boolean {
  const normalized = new Set(paths.map(normalizeRepositoryPath));
  return repositoryModel.currentValidationErrors.some(
    (error) =>
      Boolean(error.file && normalized.has(normalizeRepositoryPath(error.file))) ||
      paths.some((path) => error.message.includes(path))
  );
}

function fileEvidence(path: string, description?: string): ContractReviewEvidence {
  return { kind: 'file', ref: path, description };
}

function evaluateRoute(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel
): Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
> {
  const routePath =
    requirement.evidenceReferences.find((item) => item.kind === 'route')?.ref ??
    requirement.title.replace(/^Route\s+/, '').trim();
  const route = repositoryModel.routes.find((item) => item.path === routePath);
  if (!route) {
    return {
      status: 'missing',
      evidence: [{ kind: 'route', ref: routePath, description: 'Route not found.' }],
      relatedFiles: [routeFileFor(routePath)],
      relatedRoutes: [routePath],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Create App Router page ${routeFileFor(routePath)}.`,
    };
  }
  if (!route.readable) {
    return {
      status: 'blocked',
      evidence: [{ kind: 'route', ref: routePath, description: 'Route file is unreadable.' }],
      relatedFiles: [route.filePath],
      relatedRoutes: [routePath],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'blocked',
      missingImplementation: `Route ${routePath} exists but could not be inspected.`,
    };
  }
  if (route.fallback) {
    return {
      status: 'partially satisfied',
      evidence: [
        { kind: 'route', ref: routePath, description: 'Route exists as a fallback page.' },
        fileEvidence(route.filePath),
      ],
      relatedFiles: [route.filePath],
      relatedRoutes: [routePath],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Replace fallback ${route.filePath} with a real app screen.`,
    };
  }
  if (hasValidationErrorFor(repositoryModel, [route.filePath])) {
    return {
      status: 'failed validation',
      evidence: [
        { kind: 'route', ref: routePath },
        fileEvidence(route.filePath, 'Route has validation errors.'),
      ],
      relatedFiles: [route.filePath],
      relatedRoutes: [routePath],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Fix validation errors in ${route.filePath}.`,
    };
  }
  return {
    status: 'satisfied',
    evidence: [
      { kind: 'route', ref: routePath, description: 'App Router page exists.' },
      fileEvidence(route.filePath),
    ],
    relatedFiles: [route.filePath],
    relatedRoutes: [routePath],
    relatedModels: [],
    relatedApis: [],
    validationResult: 'passed',
  };
}

function evaluateNavigation(
  contract: BuildContract,
  contents: Map<string, string>
): RequirementEvaluation {
  const requiredRoutes = contract.routes
    .filter((route) => route.required && route.path !== '/')
    .map((route) => route.path);
  const missingLinks = requiredRoutes.filter(
    (route) => !routeLinkedFromHome(route, contents)
  );
  if (missingLinks.length > 0) {
    return {
      status: 'missing',
      evidence: [
        fileEvidence('src/app/page.tsx', 'Home navigation is missing route links.'),
      ],
      relatedFiles: ['src/app/page.tsx'],
      relatedRoutes: missingLinks,
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Add real route links for ${missingLinks.join(', ')}.`,
    };
  }
  return {
    status: 'satisfied',
    evidence: [fileEvidence('src/app/page.tsx', 'Home navigation links required routes.')],
    relatedFiles: ['src/app/page.tsx'],
    relatedRoutes: requiredRoutes,
    relatedModels: [],
    relatedApis: [],
    validationResult: 'passed',
  };
}

function evaluateLayout(
  repositoryModel: RepositoryModel,
  validationResult: ValidationResult | null | undefined
): RequirementEvaluation {
  const layoutFiles = repositoryModel.layouts
    .filter((layout) => layout.readable)
    .map((layout) => layout.filePath);
  if (layoutFiles.length === 0) {
    return {
      status: 'missing',
      evidence: [
        fileEvidence('src/app/layout.tsx', 'No readable App Router layout was found.'),
      ],
      relatedFiles: ['src/app/layout.tsx'],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: 'Create the approved App Router layout.',
    };
  }
  const quality = validationForStep(validationResult, 'generated-quality');
  if (quality === 'failed') {
    return {
      status: 'failed validation',
      evidence: [
        ...layoutFiles.map((path) => fileEvidence(path)),
        ...validationEvidence(validationResult, 'generated-quality'),
      ],
      relatedFiles: layoutFiles,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: 'Fix the layout issues reported by generated quality.',
    };
  }
  if (quality !== 'passed') {
    return {
      status: 'blocked',
      evidence: layoutFiles.map((path) =>
        fileEvidence(path, 'Layout exists but generated quality has not passed.')
      ),
      relatedFiles: layoutFiles,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: quality === 'blocked' ? 'blocked' : 'not run',
      missingImplementation: 'Run generated quality to prove the approved layout.',
    };
  }
  return {
    status: 'satisfied',
    evidence: [
      ...layoutFiles.map((path) => fileEvidence(path, 'Readable App Router layout exists.')),
      ...validationEvidence(validationResult, 'generated-quality'),
    ],
    relatedFiles: layoutFiles,
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: 'passed',
  };
}

function evaluateDataModel(
  requirement: BuildContractRequirement,
  contract: BuildContract,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
> {
  const model = contract.dataModels.find(
    (item) => requirement.title.toLowerCase().includes(item.name.toLowerCase())
  );
  const modelName = model?.name ?? requirement.title.replace(/^Data model:\s*/i, '');
  const names = pluralCandidates(modelName);
  const schema = repositoryModel.databaseSchemas.find((item) =>
    item.tables.some((table) => names.includes(table.toLowerCase()))
  );
  const matchingFiles = repositoryModel.files
    .filter((file) =>
      names.some(
        (name) =>
          normalizeText(file.path).includes(normalizeText(name)) ||
          normalizeText(file.name).includes(normalizeText(name))
      )
    )
    .map((file) => file.path);
  const contentFiles = Array.from(contents.entries())
    .filter(([, content]) =>
      names.some((name) => normalizeText(content).includes(normalizeText(name)))
    )
    .map(([path]) => path);
  const relatedFiles = unique([
    ...(schema ? [schema.filePath] : []),
    ...matchingFiles,
    ...contentFiles,
  ]);

  if (!schema && relatedFiles.length === 0) {
    return {
      status: 'missing',
      evidence: [{ kind: 'model', ref: modelName, description: 'No model evidence found.' }],
      relatedFiles: [`src/types/${slugify(modelName)}.ts`],
      relatedRoutes: [],
      relatedModels: [modelName],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Implement the ${modelName} data model and persistence boundary.`,
    };
  }

  const fields = model?.fields ?? [];
  const searchable = relatedFiles
    .map((path) => contents.get(path) ?? '')
    .join('\n')
    .toLowerCase();
  const missingFields = fields.filter(
    (field) => !searchable.includes(field.toLowerCase())
  );
  if (fields.length > 0 && missingFields.length > 0 && !schema) {
    return {
      status: 'partially satisfied',
      evidence: relatedFiles.map((path) => fileEvidence(path)),
      relatedFiles,
      relatedRoutes: [],
      relatedModels: [modelName],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Add ${missingFields.join(', ')} to ${modelName}.`,
    };
  }

  return {
    status: 'satisfied',
    evidence: [
      ...(schema
        ? [{ kind: 'model' as const, ref: modelName, description: `Schema ${schema.filePath}` }]
        : []),
      ...relatedFiles.map((path) => fileEvidence(path)),
    ],
    relatedFiles,
    relatedRoutes: [],
    relatedModels: [modelName],
    relatedApis: [],
    validationResult: 'passed',
  };
}

function evaluateRelationship(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): RequirementEvaluation {
  const terms = requirementTerms(requirement);
  const modelTerms = terms.filter((term) =>
    !['relationship', 'belongs', 'many', 'has', 'references'].includes(term)
  );
  const minimumMatches = Math.min(2, modelTerms.length);
  const schemaPaths = repositoryModel.databaseSchemas.map((schema) => schema.filePath);
  const candidatePaths = unique([
    ...schemaPaths,
    ...matchingContentFiles(contents, modelTerms, Math.max(1, minimumMatches)),
  ]);
  const matching = candidatePaths.filter((path) => {
    const normalized = normalizeText(contents.get(path) ?? '');
    const matchedTerms = modelTerms.filter((term) => normalized.includes(term));
    const relationSignal =
      /references|foreign key|belongsTo|hasMany|relation|owner_id|user_id/i.test(
        contents.get(path) ?? ''
      );
    return matchedTerms.length >= Math.max(1, minimumMatches) && relationSignal;
  });
  if (matching.length === 0) {
    return {
      status: 'missing',
      evidence: [
        {
          kind: 'model',
          ref: requirement.title,
          description: 'No schema or typed relationship evidence was found.',
        },
      ],
      relatedFiles: schemaPaths.length ? schemaPaths : ['supabase/migrations/**', 'src/types/**'],
      relatedRoutes: [],
      relatedModels: modelTerms,
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Implement and document ${requirement.description}.`,
    };
  }
  return {
    status: 'satisfied',
    evidence: matching.map((path) =>
      fileEvidence(path, 'Relationship fields or schema constraints were found.')
    ),
    relatedFiles: matching,
    relatedRoutes: [],
    relatedModels: modelTerms,
    relatedApis: [],
    validationResult: 'passed',
  };
}

function evaluateApi(
  requirement: BuildContractRequirement,
  contract: BuildContract,
  repositoryModel: RepositoryModel
): Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
> {
  const api = contract.apis.find((item) => requirement.title.includes(item.path));
  const path = api?.path ?? requirement.title.replace(/^API\s+/, '').trim();
  const found = repositoryModel.apis.find((item) => item.path === path);
  if (!found) {
    return {
      status: 'missing',
      evidence: [{ kind: 'api', ref: path, description: 'API route not found.' }],
      relatedFiles: [`src/app${path}/route.ts`.replace('/api/', '/api/')],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [path],
      validationResult: 'failed',
      missingImplementation: `Create API route ${path}.`,
    };
  }
  const missingMethods = (api?.methods ?? []).filter(
    (method) => !found.methods.includes(method)
  );
  if (missingMethods.length > 0) {
    return {
      status: 'partially satisfied',
      evidence: [{ kind: 'api', ref: path }, fileEvidence(found.filePath)],
      relatedFiles: [found.filePath],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [path],
      validationResult: 'failed',
      missingImplementation: `Add ${missingMethods.join(', ')} handlers to ${found.filePath}.`,
    };
  }
  return {
    status: 'satisfied',
    evidence: [{ kind: 'api', ref: path }, fileEvidence(found.filePath)],
    relatedFiles: [found.filePath],
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [path],
    validationResult: 'passed',
  };
}

function evaluateSimpleSignal(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): RequirementEvaluation {
  const terms = requirementTerms(requirement);
  const matchingFiles = matchingContentFiles(contents, terms);
  if (requirement.type === 'authentication') {
    if (/no authentication/i.test(requirement.description)) {
      return {
        status: 'satisfied',
        evidence: [{ kind: 'note', ref: 'auth', description: 'Contract does not require authentication.' }],
        relatedFiles: [],
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: [],
        validationResult: 'passed',
      };
    }
    if (repositoryModel.authImplementation.length > 0) {
      const files = unique(repositoryModel.authImplementation.flatMap((item) => item.files));
      return {
        status: 'satisfied',
        evidence: files.map((path) => fileEvidence(path, 'Authentication signal found.')),
        relatedFiles: files,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: [],
        validationResult: 'passed',
      };
    }
  }
  if (requirement.type === 'storage') {
    const requested = normalizeText(`${requirement.title} ${requirement.description}`);
    const storageSignals = repositoryModel.storageImplementation.filter((item) => {
      if (/supabase|upload|media|photo|image|file/.test(requested)) {
        return item.name === 'supabase-storage';
      }
      if (/local|browser/.test(requested)) return item.name === 'localStorage';
      return true;
    });
    const files = unique(storageSignals.flatMap((item) => item.files));
    if (files.length > 0) {
      return {
        status: 'satisfied',
        evidence: files.map((path) => fileEvidence(path, 'Required storage implementation found.')),
        relatedFiles: files,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: [],
        validationResult: 'passed',
      };
    }
  }
  if (requirement.type === 'integration') {
    const integrationName = normalizeText(
      requirement.title.replace(/^Integration:\s*/i, '')
    );
    const providerSignals = repositoryModel.providerIntegrations.filter((item) =>
      normalizeText(item.name).includes(integrationName)
    );
    const providerFiles = unique(providerSignals.flatMap((item) => item.files));
    const implementationFiles = unique([
      ...matchingFiles.filter(
        (path) =>
          ![
            'package.json',
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
            '.env',
            '.env.example',
            'README.md',
          ].includes(path)
      ),
      ...providerFiles.filter((path) => path !== 'package.json'),
    ]);
    const dependencyOnly =
      providerFiles.includes('package.json') || repositoryModel.dependencies.some((item) =>
        normalizeText(item.name).includes(integrationName)
      );
    if (implementationFiles.length > 0) {
      return {
        status: 'satisfied',
        evidence: implementationFiles.map((path) => ({
          kind: 'integration',
          ref: path,
          description: `${requirement.title} implementation evidence found.`,
        })),
        relatedFiles: implementationFiles,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: repositoryModel.apis
          .filter((api) => implementationFiles.includes(api.filePath))
          .map((api) => api.path),
        validationResult: 'passed',
      };
    }
    if (dependencyOnly) {
      return {
        status: 'partially satisfied',
        evidence: [
          {
            kind: 'configuration',
            ref: 'package.json',
            description: `${requirement.title} dependency exists without implementation evidence.`,
          },
        ],
        relatedFiles: ['package.json'],
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: [],
        validationResult: 'failed',
        missingImplementation: `Connect and use ${requirement.title.replace(/^Integration:\s*/i, '')}; the dependency alone is not implementation evidence.`,
      };
    }
  }
  if (requirement.type === 'billing') {
    const billingTerms = unique([
      ...terms,
      'billing',
      'checkout',
      'payment',
      'subscription',
      'stripe',
    ]);
    const files = matchingContentFiles(contents, billingTerms, 2);
    const apis = repositoryModel.apis.filter((api) =>
      /billing|checkout|payment|subscription|stripe/i.test(api.path)
    );
    const relatedFiles = unique([...files, ...apis.map((api) => api.filePath)]);
    if (relatedFiles.length > 0) {
      return {
        status: 'satisfied',
        evidence: relatedFiles.map((path) => ({
          kind: 'integration',
          ref: path,
          description: 'Billing workflow implementation found.',
        })),
        relatedFiles,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: apis.map((api) => api.path),
        validationResult: 'passed',
      };
    }
  }
  if (requirement.type === 'ai-capability') {
    const aiTerms = unique([...terms, 'openai', 'anthropic', 'gemini']);
    const relatedApis = repositoryModel.apis.filter((api) => {
      const content = contents.get(api.filePath) ?? '';
      return (
        /\/api\/(?:ai|generate|chat|story|image)/i.test(api.path) ||
        aiTerms.some((term) => normalizeText(content).includes(term))
      );
    });
    const providerEnv = repositoryModel.environmentVariableNames.filter((name) =>
      /OPENAI|ANTHROPIC|GEMINI|AI_/i.test(name)
    );
    const relatedFiles = unique(relatedApis.map((api) => api.filePath));
    if (relatedApis.length > 0 && providerEnv.length > 0) {
      return {
        status: 'satisfied',
        evidence: [
          ...relatedApis.map((api) => ({
            kind: 'api' as const,
            ref: api.path,
            description: 'Server API implements the AI capability.',
          })),
          ...providerEnv.map((name) => ({
            kind: 'env' as const,
            ref: name,
            description: 'Server provider environment contract is present.',
          })),
        ],
        relatedFiles,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: relatedApis.map((api) => api.path),
        validationResult: 'passed',
      };
    }
    if (relatedApis.length > 0 || providerEnv.length > 0) {
      return {
        status: 'partially satisfied',
        evidence: [
          ...relatedApis.map((api) => ({ kind: 'api' as const, ref: api.path })),
          ...providerEnv.map((name) => ({ kind: 'env' as const, ref: name })),
        ],
        relatedFiles,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: relatedApis.map((api) => api.path),
        validationResult: 'failed',
        missingImplementation:
          relatedApis.length === 0
            ? `Create a server API for ${requirement.title}.`
            : `Document the server-only provider environment variable for ${requirement.title}.`,
      };
    }
  }
  return {
    status: requirement.status === 'optional' ? 'manually review' : 'missing',
    evidence: [
      {
        kind: 'note',
        ref: requirement.stableId,
        description: 'No sufficient repository implementation evidence was found.',
      },
    ],
    relatedFiles: matchingFiles,
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: requirement.status === 'optional' ? 'manual' : 'failed',
    missingImplementation:
      requirement.status === 'optional'
        ? undefined
        : `Implement ${requirement.title}.`,
    warning:
      requirement.status === 'optional'
        ? 'Optional capability was not deterministically verified.'
        : undefined,
  };
}

function evaluateRolePermission(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): RequirementEvaluation {
  const authorizationFiles = Array.from(contents.entries())
    .filter(([, content]) =>
      /auth\.uid\(\)|row level security|enable row level security|create policy|owner_id|user_id|role\s*[:=]|permission/i.test(
        content
      )
    )
    .map(([path]) => path);
  const relatedFiles = unique([
    ...authorizationFiles,
    ...repositoryModel.authImplementation.flatMap((item) => item.files),
  ]);
  if (repositoryModel.authImplementation.length > 0 && authorizationFiles.length > 0) {
    return {
      status: 'satisfied',
      evidence: authorizationFiles.map((path) =>
        fileEvidence(path, 'Role, ownership, or permission enforcement found.')
      ),
      relatedFiles,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'passed',
    };
  }
  return {
    status: 'missing',
    evidence: [
      {
        kind: 'note',
        ref: requirement.stableId,
        description: 'Authentication and enforceable ownership/permission evidence are both required.',
      },
    ],
    relatedFiles,
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: 'failed',
    missingImplementation: `Implement and enforce ${requirement.description}.`,
  };
}

function evaluateBackgroundJob(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): RequirementEvaluation {
  const terms = requirementTerms(requirement);
  const files = Array.from(contents.entries())
    .filter(([path, content]) => {
      const jobSignal =
        /cron|queue|worker|background job|schedule|inngest|trigger\.dev|bullmq/i.test(
          `${path} ${content}`
        );
      const normalized = normalizeText(content);
      return jobSignal && (terms.length === 0 || terms.some((term) => normalized.includes(term)));
    })
    .map(([path]) => path);
  const apis = repositoryModel.apis.filter((api) => files.includes(api.filePath));
  if (files.length > 0) {
    return {
      status: 'satisfied',
      evidence: files.map((path) =>
        fileEvidence(path, 'Background job or scheduler implementation found.')
      ),
      relatedFiles: files,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: apis.map((api) => api.path),
      validationResult: 'passed',
    };
  }
  return {
    status: requirement.status === 'optional' ? 'manually review' : 'missing',
    evidence: [
      {
        kind: 'note',
        ref: requirement.stableId,
        description: 'No background job implementation evidence was found.',
      },
    ],
    relatedFiles: [],
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: requirement.status === 'optional' ? 'manual' : 'failed',
    missingImplementation:
      requirement.status === 'required'
        ? `Implement ${requirement.description}.`
        : undefined,
    warning:
      requirement.status === 'optional'
        ? 'Optional background work requires manual review if intentionally deferred.'
        : undefined,
  };
}

function evaluateEnvVar(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
> {
  const name = requirement.title.replace(/^Environment variable:\s*/i, '').trim();
  const documented =
    repositoryModel.environmentVariableNames.includes(name) ||
    ['.env.example', 'README.md', 'src/lib/env.ts'].some((path) =>
      contents.get(path)?.includes(name)
    );
  if (!documented) {
    return {
      status: 'missing',
      evidence: [{ kind: 'env', ref: name, description: 'Variable not documented or referenced.' }],
      relatedFiles: ['.env.example', 'src/lib/env.ts'],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Document ${name} in the environment contract.`,
    };
  }
  return {
    status: 'satisfied',
    evidence: [{ kind: 'env', ref: name, description: 'Environment variable is referenced or documented.' }],
    relatedFiles: ['.env.example', 'src/lib/env.ts'].filter((path) =>
      contents.get(path)?.includes(name)
    ),
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: 'passed',
  };
}

function evaluateValidationBacked(
  requirement: BuildContractRequirement,
  validationResult: ValidationResult | null | undefined,
  step: ValidationStep
): Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
> {
  const validation = validationForStep(validationResult, step);
  if (validation === 'passed') {
    return {
      status: 'satisfied',
      evidence: validationEvidence(validationResult, step),
      relatedFiles: [],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'passed',
    };
  }
  if (validation === 'failed') {
    return {
      status: 'failed validation',
      evidence: validationEvidence(validationResult, step),
      relatedFiles: [],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `${step} must pass before this requirement can be satisfied.`,
    };
  }
  return {
    status: 'blocked',
    evidence: validationEvidence(validationResult, step),
    relatedFiles: [],
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: validation === 'blocked' ? 'blocked' : 'not run',
    missingImplementation: `${step} has not provided passing evidence yet.`,
  };
}

function evaluateAccessibility(
  requirement: BuildContractRequirement,
  contents: Map<string, string>,
  validationResult: ValidationResult | null | undefined
): RequirementEvaluation {
  const quality = validationForStep(validationResult, 'generated-quality');
  const files = Array.from(contents.entries())
    .filter(([path, content]) =>
      /^(?:src\/)?(?:app|components)\//.test(path) &&
      /aria-[a-z-]+|htmlFor\s*=|<nav\b|<main\b|<button\b|role\s*=\s*["']/i.test(content)
    )
    .map(([path]) => path);
  if (quality === 'passed' && files.length > 0) {
    return {
      status: 'satisfied',
      evidence: [
        ...files.slice(0, 8).map((path) => ({
          kind: 'component' as const,
          ref: path,
          description: 'Semantic or accessible UI implementation found.',
        })),
        ...validationEvidence(validationResult, 'generated-quality'),
      ],
      relatedFiles: files,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'passed',
    };
  }
  if (quality === 'failed') {
    return {
      status: 'failed validation',
      evidence: validationEvidence(validationResult, 'generated-quality'),
      relatedFiles: files,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Fix accessibility evidence for ${requirement.description}.`,
    };
  }
  if (quality === 'passed') {
    return {
      status: 'partially satisfied',
      evidence: validationEvidence(validationResult, 'generated-quality'),
      relatedFiles: [],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation:
        'Add semantic labels, controls, and keyboard-accessible structure that can be verified in the repository.',
    };
  }
  return {
    status: 'blocked',
    evidence: [
      {
        kind: 'note',
        ref: requirement.stableId,
        description: 'Accessibility evidence awaits generated-quality validation.',
      },
    ],
    relatedFiles: files,
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: quality === 'blocked' ? 'blocked' : 'not run',
    missingImplementation: 'Run generated quality before accepting accessibility.',
  };
}

function evaluateAcceptance(
  requirement: BuildContractRequirement,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>,
  validationResult: ValidationResult | null | undefined
): RequirementEvaluation {
  if (/test|spec|coverage/i.test(requirement.description)) {
    const terms = requirementTerms(requirement);
    const matchingTests = repositoryModel.tests.filter((path) => {
      const content = contents.get(path) ?? '';
      return terms.length === 0 || terms.some((term) => normalizeText(content).includes(term));
    });
    if (matchingTests.length > 0) {
      return {
        status: 'satisfied',
        evidence: matchingTests.map((path) => ({
          kind: 'test',
          ref: path,
          description: 'Repository test covers the acceptance requirement.',
        })),
        relatedFiles: matchingTests,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: [],
        validationResult: 'passed',
      };
    }
    return {
      status: 'missing',
      evidence: [
        {
          kind: 'test',
          ref: requirement.stableId,
          description: 'No matching repository test was found.',
        },
      ],
      relatedFiles: ['tests/**'],
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'failed',
      missingImplementation: `Add focused test evidence for ${requirement.description}.`,
    };
  }
  if (/loading|error|empty state|failure|recover/i.test(requirement.description)) {
    const files = Array.from(contents.entries())
      .filter(([, content]) => /loading|error|empty|retry|try again|no .* found/i.test(content))
      .map(([path]) => path);
    const quality = validationForStep(validationResult, 'generated-quality');
    if (files.length > 0 && quality === 'passed') {
      return {
        status: 'satisfied',
        evidence: [
          ...files.slice(0, 8).map((path) => fileEvidence(path, 'User-facing state evidence found.')),
          ...validationEvidence(validationResult, 'generated-quality'),
        ],
        relatedFiles: files,
        relatedRoutes: [],
        relatedModels: [],
        relatedApis: [],
        validationResult: 'passed',
      };
    }
    return {
      status: quality === 'failed' ? 'failed validation' : 'missing',
      evidence: [
        ...validationEvidence(validationResult, 'generated-quality'),
        {
          kind: 'note',
          ref: requirement.stableId,
          description: 'Required loading/error/empty-state evidence was not found.',
        },
      ],
      relatedFiles: files,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: quality === 'failed' ? 'failed' : 'not run',
      missingImplementation: `Implement ${requirement.description}.`,
    };
  }
  return evaluateValidationBacked(requirement, validationResult, 'runtime-smoke');
}

function validationStepForStrategy(
  requirement: BuildContractRequirement
): ValidationStep | undefined {
  if (requirement.validationStrategy === 'type-check') return 'type-check';
  if (requirement.validationStrategy === 'build') return 'build';
  if (requirement.validationStrategy === 'runtime-smoke') return 'runtime-smoke';
  if (requirement.validationStrategy === 'generated-quality') {
    return 'generated-quality';
  }
  return undefined;
}

function manualReview(
  requirement: BuildContractRequirement
): Pick<
  ContractReviewRequirementReport,
  | 'status'
  | 'evidence'
  | 'relatedFiles'
  | 'relatedRoutes'
  | 'relatedModels'
  | 'relatedApis'
  | 'validationResult'
  | 'missingImplementation'
  | 'warning'
> {
  return {
    status: 'manually review',
    evidence: [{ kind: 'note', ref: requirement.stableId, description: 'Requires human or runtime review.' }],
    relatedFiles: [],
    relatedRoutes: [],
    relatedModels: [],
    relatedApis: [],
    validationResult: 'manual',
    warning: 'This requirement cannot be fully proven from static repository signals.',
  };
}

function evaluateRequirement(
  requirement: BuildContractRequirement,
  options: {
    contract: BuildContract;
    repositoryModel: RepositoryModel;
    contents: Map<string, string>;
    allPaths: Set<string>;
    validationResult?: ValidationResult | null;
  }
): Omit<
  ContractReviewRequirementReport,
  'requirementId' | 'requirementType' | 'category' | 'requirementDescription' | 'required'
> {
  const explicitFiles = evaluateExplicitFiles(requirement, options.allPaths);
  if (explicitFiles) return explicitFiles;
  if (requirement.type === 'route') {
    return evaluateRoute(requirement, options.repositoryModel);
  }
  if (requirement.type === 'navigation') {
    return evaluateNavigation(options.contract, options.contents);
  }
  if (requirement.type === 'layout') {
    return evaluateLayout(options.repositoryModel, options.validationResult);
  }
  if (requirement.type === 'data-model') {
    return evaluateDataModel(
      requirement,
      options.contract,
      options.repositoryModel,
      options.contents
    );
  }
  if (requirement.type === 'relationship') {
    return evaluateRelationship(
      requirement,
      options.repositoryModel,
      options.contents
    );
  }
  if (requirement.type === 'api') {
    return evaluateApi(requirement, options.contract, options.repositoryModel);
  }
  if (requirement.type === 'role-permission') {
    return evaluateRolePermission(
      requirement,
      options.repositoryModel,
      options.contents
    );
  }
  if (requirement.type === 'background-job') {
    return evaluateBackgroundJob(
      requirement,
      options.repositoryModel,
      options.contents
    );
  }
  if (requirement.type === 'environment-variable') {
    return evaluateEnvVar(requirement, options.repositoryModel, options.contents);
  }
  if (requirement.type === 'deployment') {
    return evaluateValidationBacked(requirement, options.validationResult, 'build');
  }
  if (requirement.type === 'accessibility') {
    return evaluateAccessibility(
      requirement,
      options.contents,
      options.validationResult
    );
  }
  if (requirement.type === 'acceptance') {
    return evaluateAcceptance(
      requirement,
      options.repositoryModel,
      options.contents,
      options.validationResult
    );
  }
  if (
    requirement.type === 'visual' ||
    requirement.type === 'responsive' ||
    requirement.type === 'constraint'
  ) {
    const step = validationStepForStrategy(requirement) ?? 'generated-quality';
    return evaluateValidationBacked(
      requirement,
      options.validationResult,
      step
    );
  }
  if (
    requirement.type === 'authentication' ||
    requirement.type === 'storage' ||
    requirement.type === 'integration' ||
    requirement.type === 'ai-capability' ||
    requirement.type === 'billing'
  ) {
    return evaluateSimpleSignal(requirement, options.repositoryModel, options.contents);
  }
  const strategyStep = validationStepForStrategy(requirement);
  if (strategyStep) {
    return evaluateValidationBacked(
      requirement,
      options.validationResult,
      strategyStep
    );
  }
  return manualReview(requirement);
}

function taskCategoryForRequirement(
  type: BuildContractRequirementType
): TaskGraphCategory {
  if (type === 'route' || type === 'navigation' || type === 'visual' || type === 'responsive') {
    return 'frontend';
  }
  if (type === 'data-model' || type === 'relationship') return 'data';
  if (type === 'authentication' || type === 'role-permission') return 'authentication';
  if (type === 'api' || type === 'background-job') return 'backend';
  if (type === 'ai-capability') return 'AI';
  if (type === 'storage') return 'storage';
  if (type === 'deployment') return 'deployment';
  if (type === 'acceptance') return 'testing';
  return 'foundation';
}

function repairScope(report: ContractReviewRequirementReport): string[] {
  const concreteRelatedFiles = report.relatedFiles.filter(
    (path) => path && path !== 'src/**'
  );
  if (concreteRelatedFiles.length > 0) return concreteRelatedFiles;
  if (report.relatedRoutes.length > 0) {
    return report.relatedRoutes.map(routeFileFor);
  }
  if (report.relatedApis.length > 0) {
    return report.relatedApis.map((path) => `src/app${path}/route.ts`);
  }
  if (report.relatedModels.length > 0) {
    return report.relatedModels.map((name) => `src/types/${slugify(name)}.ts`);
  }
  if (report.requirementType === 'layout') {
    return ['src/app/layout.tsx', 'src/components/layout/**'];
  }
  if (report.requirementType === 'navigation') {
    return ['src/app/page.tsx', 'src/components/navigation/**'];
  }
  if (
    report.requirementType === 'authentication' ||
    report.requirementType === 'role-permission'
  ) {
    return [
      'src/lib/auth/**',
      'src/components/auth/**',
      'src/app/**/page.tsx',
      'supabase/migrations/**',
    ];
  }
  if (
    report.requirementType === 'integration' ||
    report.requirementType === 'billing' ||
    report.requirementType === 'ai-capability'
  ) {
    return ['package.json', '.env.example', 'src/app/api/**', 'src/lib/integrations/**'];
  }
  if (report.requirementType === 'storage') {
    return ['src/lib/storage/**', 'src/app/api/**', 'supabase/migrations/**'];
  }
  if (report.requirementType === 'background-job') {
    return ['src/lib/jobs/**', 'src/app/api/**', 'vercel.json'];
  }
  if (report.requirementType === 'environment-variable') {
    return ['.env.example', 'src/lib/env.ts'];
  }
  if (report.requirementType === 'deployment') {
    return [
      'package.json',
      'next.config.ts',
      'next.config.mjs',
      'vercel.json',
    ];
  }
  if (report.requirementType === 'acceptance') {
    return ['tests/**', 'src/**/*.test.ts', 'src/**/*.test.tsx'];
  }
  if (
    report.requirementType === 'visual' ||
    report.requirementType === 'responsive' ||
    report.requirementType === 'accessibility' ||
    report.requirementType === 'constraint'
  ) {
    return ['src/app/**/page.tsx', 'src/components/**', 'src/app/globals.css'];
  }
  return ['src/lib/**'];
}

function createRepairTask(
  report: ContractReviewRequirementReport,
  nowIso: string
): TaskGraphTask | undefined {
  if (!report.required) return undefined;
  if (['satisfied', 'manually review', 'blocked'].includes(report.status)) {
    return undefined;
  }
  const scope = unique(repairScope(report));
  const category = taskCategoryForRequirement(report.requirementType);
  return {
    id: stableTaskId('repair', report.requirementId),
    title: `Repair contract requirement: ${report.requirementId}`,
    description:
      report.missingImplementation ??
      `Repair only the implementation needed for ${report.requirementDescription}.`,
    category,
    capabilityIds: [],
    sourceRequirementIds: [report.requirementId],
    dependencies: [],
    status: 'ready',
    priority: 'high',
    allowedFileScope: scope,
    expectedFiles: scope.filter((path) => !path.includes('*')),
    expectedOutputs: [report.requirementDescription],
    acceptanceChecks: [
      report.requirementDescription,
      'Repair is targeted to this contract requirement and must not regenerate unrelated work.',
    ],
    validationCommands: ['npm run type-check'],
    retryCount: 0,
    maximumRetryCount: 1,
    failureClassification: 'none',
    createdAt: nowIso,
    updatedAt: nowIso,
    assignedDiscipline:
      category === 'data'
        ? 'database'
        : category === 'AI'
          ? 'AI integration'
          : category === 'storage'
            ? 'storage/media'
            : category === 'deployment'
              ? 'deployment'
              : category === 'authentication'
                ? 'authentication'
                : category === 'backend'
                  ? 'backend'
                  : category === 'testing'
                    ? 'testing'
                    : 'frontend',
    resultEvidence: [],
    resumable: true,
    fingerprint: stableHash(
      JSON.stringify({
        requirementId: report.requirementId,
        description: report.requirementDescription,
        scope,
        missingImplementation: report.missingImplementation,
      })
    ),
  };
}

function summaryForReport(
  contract: BuildContract,
  reports: ContractReviewRequirementReport[],
  buildPassed: boolean
): ContractReviewFinalSummary {
  const satisfied = reports.filter((item) => item.status === 'satisfied');
  const remaining = reports.filter(
    (item) =>
      item.required &&
      !['satisfied', 'manually review'].includes(item.status)
  );
  const blocked = reports.filter((item) => item.status === 'blocked');
  const manual = reports.filter((item) => item.status === 'manually review');
  const envVars = unique(contract.environmentVariableNames);
  const deploymentReadiness =
    blocked.length > 0
      ? 'blocked'
      : !buildPassed || remaining.length > 0
        ? 'not ready'
        : manual.length > 0
          ? 'manual review required'
          : 'ready';
  const builtRoutes = satisfied.flatMap((item) =>
    item.relatedRoutes.map((route) => `Route ${route}`)
  );
  const builtModels = satisfied.flatMap((item) =>
    item.relatedModels.map((model) => `Model ${model}`)
  );
  const builtApis = satisfied.flatMap((item) =>
    item.relatedApis.map((api) => `API ${api}`)
  );
  const builtArtifacts = satisfied.flatMap((item) =>
    item.evidence
      .filter((evidence) =>
        [
          'component',
          'integration',
          'test',
          'deployment',
          'asset',
          'configuration',
        ].includes(evidence.kind)
      )
      .map((evidence) => {
        if (evidence.kind === 'test') return `Test ${evidence.ref}`;
        if (evidence.kind === 'asset') return `Asset ${evidence.ref}`;
        if (evidence.kind === 'integration') return `Integration ${evidence.ref}`;
        return `Artifact ${evidence.ref}`;
      })
  );

  return {
    whatWasBuilt: unique([
      ...builtRoutes,
      ...builtModels,
      ...builtApis,
      ...builtArtifacts,
    ]),
    whatPassed: satisfied.map((item) => item.requirementDescription),
    whatRemains: remaining.map(
      (item) => item.missingImplementation ?? item.requirementDescription
    ),
    blockedEnvironmentalItems: blocked.map(
      (item) => item.missingImplementation ?? item.requirementDescription
    ),
    requiredEnvironmentVariables: envVars,
    manualSetupSteps: unique([
      ...envVars.map((name) => `Configure ${name}.`),
      ...manual.map((item) => `Review ${item.requirementDescription}.`),
    ]),
    deploymentReadiness,
  };
}

export function createContractReviewReport(
  options: CreateContractReviewOptions
): ContractReviewReport {
  const now = options.now ?? new Date();
  const nowIso = now.toISOString();
  const contents = contentMap(options.files);
  const allPaths = allFilePaths(options.files);
  const buildPassed = buildValidationPassed(options.validationResult);
  const reportsWithoutTasks = options.contract.requirements.map((requirement) => {
    const evaluated = evaluateRequirement(requirement, {
      contract: options.contract,
      repositoryModel: options.repositoryModel,
      contents,
      allPaths,
      validationResult: options.validationResult,
    });
    const required = requirement.status === 'required';
    return {
      requirementId: requirement.stableId,
      requirementType: requirement.type,
      category: categoryForRequirement(requirement),
      requirementDescription: requirement.description,
      required,
      ...evaluated,
      evidence:
        evaluated.evidence.length > 0
          ? evaluated.evidence
          : [
              {
                kind: 'note' as const,
                ref: requirement.stableId,
                description: 'No repository evidence was found.',
              },
            ],
      warning:
        !required && evaluated.status !== 'satisfied'
          ? evaluated.warning ?? 'Optional requirement is not required for completion.'
          : evaluated.warning,
    } satisfies ContractReviewRequirementReport;
  });

  const requirementReports = reportsWithoutTasks.map((report) => ({
    ...report,
    recommendedRepairTask: createRepairTask(report, nowIso),
  }));

  const blockingRequirementIds = requirementReports
    .filter(
      (item) =>
        item.required &&
        ['missing', 'partially satisfied', 'failed validation'].includes(item.status)
    )
    .map((item) => item.requirementId);
  const blockedRequirementIds = requirementReports
    .filter((item) => item.required && item.status === 'blocked')
    .map((item) => item.requirementId);
  const manualReviewRequirementIds = requirementReports
    .filter((item) => item.required && item.status === 'manually review')
    .map((item) => item.requirementId);
  const optionalMissingRequirementIds = requirementReports
    .filter((item) => !item.required && item.status !== 'satisfied')
    .map((item) => item.requirementId);

  const completionAllowed =
    buildPassed &&
    blockingRequirementIds.length === 0 &&
    blockedRequirementIds.length === 0 &&
    manualReviewRequirementIds.length === 0;

  return {
    schemaVersion: CONTRACT_REVIEW_SCHEMA_VERSION,
    metadataVersion: CONTRACT_REVIEW_METADATA_VERSION,
    id: `contract-review-${stableHash(
      `${options.contract.id}:${options.repositoryModel.repositoryFingerprint}:${nowIso}`
    )}`,
    projectId: options.contract.project.projectId ?? options.repositoryModel.projectId,
    projectName: options.contract.project.projectName,
    contractId: options.contract.id,
    contractVersion: options.contract.contractVersion,
    repositoryFingerprint: options.repositoryModel.repositoryFingerprint,
    buildValidationPassed: buildPassed,
    generatedAt: nowIso,
    requirementReports,
    completionAllowed,
    blockingRequirementIds,
    optionalMissingRequirementIds,
    blockedRequirementIds,
    manualReviewRequirementIds,
    summary: summaryForReport(options.contract, requirementReports, buildPassed),
  };
}
