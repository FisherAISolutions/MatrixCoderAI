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

function hasNamedSignal(
  name: string,
  repositoryModel: RepositoryModel,
  contents: Map<string, string>
): boolean {
  const target = normalizeText(name);
  const dependencies = repositoryModel.dependencies.some((item) =>
    normalizeText(item.name).includes(target)
  );
  const provider = repositoryModel.providerIntegrations.some((item) =>
    normalizeText(item.name).includes(target)
  );
  const content = Array.from(contents.values()).some((value) =>
    normalizeText(value).includes(target)
  );
  return dependencies || provider || content;
}

function evaluateSimpleSignal(
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
  const text = `${requirement.title} ${requirement.description}`;
  const matchingFiles = Array.from(contents.entries())
    .filter(([, content]) => normalizeText(content).includes(normalizeText(text).slice(0, 30)))
    .map(([path]) => path);
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
  if (requirement.type === 'storage' && repositoryModel.storageImplementation.length > 0) {
    const files = unique(repositoryModel.storageImplementation.flatMap((item) => item.files));
    return {
      status: 'satisfied',
      evidence: files.map((path) => fileEvidence(path, 'Storage signal found.')),
      relatedFiles: files,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'passed',
    };
  }
  if (
    requirement.type === 'integration' &&
    hasNamedSignal(requirement.title.replace(/^Integration:\s*/i, ''), repositoryModel, contents)
  ) {
    return {
      status: 'satisfied',
      evidence: [{ kind: 'note', ref: requirement.title, description: 'Integration signal found.' }],
      relatedFiles: matchingFiles,
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: [],
      validationResult: 'passed',
    };
  }
  if (
    requirement.type === 'ai-capability' &&
    (repositoryModel.apis.some((api) => api.path.includes('/api/ai')) ||
      repositoryModel.environmentVariableNames.some((name) =>
        /OPENAI|ANTHROPIC|GEMINI|AI/i.test(name)
      ))
  ) {
    const apis = repositoryModel.apis
      .filter((api) => api.path.includes('/api/ai'))
      .map((api) => api.path);
    return {
      status: 'satisfied',
      evidence: apis.map((api) => ({ kind: 'api' as const, ref: api })),
      relatedFiles: repositoryModel.apis
        .filter((api) => api.path.includes('/api/ai'))
        .map((api) => api.filePath),
      relatedRoutes: [],
      relatedModels: [],
      relatedApis: apis,
      validationResult: 'passed',
    };
  }
  return {
    status: requirement.status === 'optional' ? 'manually review' : 'missing',
    evidence: [],
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
    validationResult?: ValidationResult | null;
  }
): Omit<
  ContractReviewRequirementReport,
  'requirementId' | 'requirementType' | 'category' | 'requirementDescription' | 'required'
> {
  if (requirement.type === 'route') {
    return evaluateRoute(requirement, options.repositoryModel);
  }
  if (requirement.type === 'navigation' || requirement.type === 'layout') {
    return evaluateNavigation(options.contract, options.contents);
  }
  if (requirement.type === 'data-model' || requirement.type === 'relationship') {
    return evaluateDataModel(
      requirement,
      options.contract,
      options.repositoryModel,
      options.contents
    );
  }
  if (requirement.type === 'api') {
    return evaluateApi(requirement, options.contract, options.repositoryModel);
  }
  if (requirement.type === 'environment-variable') {
    return evaluateEnvVar(requirement, options.repositoryModel, options.contents);
  }
  if (requirement.type === 'deployment') {
    return evaluateValidationBacked(requirement, options.validationResult, 'build');
  }
  if (
    requirement.type === 'visual' ||
    requirement.type === 'responsive' ||
    requirement.type === 'constraint' ||
    requirement.type === 'acceptance'
  ) {
    return evaluateValidationBacked(
      requirement,
      options.validationResult,
      requirement.type === 'acceptance' ? 'runtime-smoke' : 'generated-quality'
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
  if (report.relatedFiles.length > 0) return report.relatedFiles;
  if (report.relatedRoutes.length > 0) {
    return report.relatedRoutes.map(routeFileFor);
  }
  if (report.relatedApis.length > 0) {
    return report.relatedApis.map((path) => `src/app${path}/route.ts`);
  }
  if (report.relatedModels.length > 0) {
    return report.relatedModels.map((name) => `src/types/${slugify(name)}.ts`);
  }
  return ['src/**'];
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
    maximumRetryCount: 2,
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

  return {
    whatWasBuilt: unique([...builtRoutes, ...builtModels, ...builtApis]),
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
  const buildPassed = buildValidationPassed(options.validationResult);
  const reportsWithoutTasks = options.contract.requirements.map((requirement) => {
    const evaluated = evaluateRequirement(requirement, {
      contract: options.contract,
      repositoryModel: options.repositoryModel,
      contents,
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
