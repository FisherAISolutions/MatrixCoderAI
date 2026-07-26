import { describe, expect, it } from 'vitest';

import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  BUILD_CONTRACT_METADATA_VERSION,
  BUILD_CONTRACT_SCHEMA_VERSION,
  stableRequirementId,
  type BuildContract,
  type BuildContractRequirement,
  type BuildContractRequirementType,
} from '@/lib/build-contract';
import {
  createContractCompletionReport,
  createContractReviewReport,
} from '@/lib/contract-review';
import { createRepositoryModel } from '@/lib/repository-model';
import type { ValidationResult } from '@/lib/validation/engine';

function file(path: string, content: string, language: FileNode['language'] = 'typescript'): FileNode {
  return {
    id: path,
    name: path.split('/').pop() ?? path,
    path,
    type: 'file',
    language,
    content,
  };
}

function requirement(
  type: BuildContractRequirementType,
  target: string,
  description: string,
  status: BuildContractRequirement['status'] = 'required'
): BuildContractRequirement {
  return {
    stableId: stableRequirementId(type, target),
    type,
    title:
      type === 'route'
        ? `Route ${target}`
        : type === 'data-model'
          ? `Data model: ${target}`
          : type === 'api'
            ? `API ${target}`
            : description,
    description,
    status,
    source: 'blueprint',
    validationStrategy:
      type === 'route'
        ? 'route-exists'
        : type === 'deployment'
          ? 'build'
          : type === 'environment-variable'
            ? 'config-check'
            : type === 'api'
              ? 'file-exists'
              : 'content-check',
    completionStatus: 'pending',
    evidenceReferences:
      type === 'route'
        ? [{ kind: 'route', ref: target }]
        : type === 'data-model'
          ? [{ kind: 'model', ref: target }]
          : type === 'api'
            ? [{ kind: 'source', ref: target }]
            : [{ kind: 'source', ref: 'blueprint' }],
  };
}

function contract(overrides: Partial<BuildContract> = {}): BuildContract {
  const requirements = overrides.requirements ?? [
    requirement('route', '/', 'Home route must exist.'),
    requirement('deployment', 'Next.js web app', 'Production build must pass.'),
  ];
  return {
    schemaVersion: BUILD_CONTRACT_SCHEMA_VERSION,
    metadataVersion: BUILD_CONTRACT_METADATA_VERSION,
    contractVersion: 1,
    id: 'contract-review-test',
    project: {
      projectId: 'project-review',
      projectName: 'Review Test',
    },
    projectSummary: 'Build a tested Matrix Coder app.',
    targetFramework: 'Next.js 15 App Router',
    routes: [{ path: '/', label: 'Home', required: true, source: 'blueprint' }],
    layouts: [],
    navigation: [],
    dataModels: [],
    relationships: [],
    authentication: 'No authentication required for the first version.',
    rolesAndPermissions: [],
    apis: [],
    integrations: [],
    aiCapabilities: [],
    storageRequirements: [],
    billingRequirements: [],
    backgroundJobs: [],
    environmentVariableNames: [],
    deploymentTarget: 'Next.js web app',
    visualRequirements: { source: 'blueprint' },
    responsiveRequirements: {
      mobileSupport: [],
      expectations: [],
      source: 'blueprint',
    },
    accessibilityExpectations: {
      expectations: [],
      source: 'blueprint',
    },
    acceptanceCriteria: [],
    constraints: [],
    optionalCapabilities: [],
    requiredCapabilities: [],
    createdAt: '2026-07-21T00:00:00.000Z',
    updatedAt: '2026-07-21T00:00:00.000Z',
    ...overrides,
    requirements,
  };
}

function buildPassed(): ValidationResult {
  return {
    success: true,
    skipped: false,
    steps: [
      {
        step: 'build',
        status: 'ok',
        durationMs: 100,
        errors: [],
        log: 'Build passed.',
      },
      {
        step: 'generated-quality',
        status: 'ok',
        durationMs: 10,
        errors: [],
        log: 'Quality passed.',
      },
      {
        step: 'runtime-smoke',
        status: 'ok',
        durationMs: 10,
        errors: [],
        log: 'Runtime smoke passed.',
      },
    ],
    errors: [],
    combinedLog: 'passed',
    durationMs: 120,
  };
}

describe('contract-based final review', () => {
  it('reports a missing required route and creates a targeted repair task', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const buildContract = contract({
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        { path: '/dashboard', label: 'Dashboard', required: true, source: 'blueprint' },
      ],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('route', '/dashboard', 'Dashboard route must exist.'),
        requirement('deployment', 'Next.js web app', 'Production build must pass.'),
      ],
    });
    const repositoryModel = createRepositoryModel({ files });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel,
      files,
      validationResult: buildPassed(),
      now: new Date('2026-07-21T00:00:00.000Z'),
    });
    const dashboard = report.requirementReports.find(
      (item) => item.requirementId === 'req-route-dashboard'
    );

    expect(dashboard?.status).toBe('missing');
    expect(dashboard?.recommendedRepairTask?.allowedFileScope).toEqual([
      'src/app/dashboard/page.tsx',
    ]);
    expect(report.completionAllowed).toBe(false);
  });

  it('reports a missing required data model', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const buildContract = contract({
      dataModels: [
        { name: 'Story', fields: ['title', 'childProfileIds'], source: 'blueprint' },
      ],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('data-model', 'Story', 'Story model should include title and childProfileIds.'),
        requirement('deployment', 'Next.js web app', 'Production build must pass.'),
      ],
    });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });
    const model = report.requirementReports.find(
      (item) => item.requirementId === 'req-data-model-story'
    );

    expect(model?.status).toBe('missing');
    expect(model?.relatedModels).toEqual(['Story']);
    expect(model?.recommendedRepairTask?.category).toBe('data');
  });

  it('does not treat a passing build as completed when a required feature is missing', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const buildContract = contract({
      aiCapabilities: ['AI story generation'],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('ai-capability', 'AI story generation', 'AI story generation must be implemented.'),
        requirement('deployment', 'Next.js web app', 'Production build must pass.'),
      ],
    });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });

    expect(report.buildValidationPassed).toBe(true);
    expect(report.completionAllowed).toBe(false);
    expect(report.blockingRequirementIds).toContain(
      'req-ai-capability-ai-story-generation'
    );
  });

  it('treats a not-run build/deployment check as blocked, not passed', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const report = createContractReviewReport({
      contract: contract(),
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: null,
    });

    expect(report.buildValidationPassed).toBe(false);
    expect(report.blockedRequirementIds).toContain(
      'req-deployment-next-js-web-app'
    );
    expect(report.completionAllowed).toBe(false);
  });

  it('does not create repair tasks for missing optional requirements', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const buildContract = contract({
      integrations: ['Stripe'],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('integration', 'Stripe', 'Stripe can be added later.', 'optional'),
        requirement('deployment', 'Next.js web app', 'Production build must pass.'),
      ],
    });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });
    const stripe = report.requirementReports.find(
      (item) => item.requirementId === 'req-integration-stripe'
    );

    expect(stripe?.required).toBe(false);
    expect(stripe?.recommendedRepairTask).toBeUndefined();
    expect(report.optionalMissingRequirementIds).toContain('req-integration-stripe');
  });

  it('links evidence to satisfied files and routes', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const report = createContractReviewReport({
      contract: contract(),
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });
    const home = report.requirementReports.find(
      (item) => item.requirementId === 'req-route-root'
    );

    expect(home?.status).toBe('satisfied');
    expect(home?.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'route', ref: '/' }),
        expect.objectContaining({ kind: 'file', ref: 'src/app/page.tsx' }),
      ])
    );
  });

  it('does not report planned routes or models as built without repository evidence', () => {
    const buildContract = contract({
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        { path: '/services', label: 'Services', required: true, source: 'blueprint' },
      ],
      dataModels: [
        { name: 'ContactInquiry', fields: ['name', 'email'], source: 'blueprint' },
      ],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('route', '/services', 'Services route must exist.'),
        requirement('data-model', 'ContactInquiry', 'Contact inquiry model exists.'),
      ],
    });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel: createRepositoryModel({ files: [] }),
      files: [],
      validationResult: null,
    });

    expect(report.summary.whatWasBuilt).toEqual([]);
  });

  it('reports only satisfied repository artifacts as built', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const buildContract = contract({
      routes: [
        { path: '/', label: 'Home', required: true, source: 'blueprint' },
        { path: '/services', label: 'Services', required: true, source: 'blueprint' },
      ],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('route', '/services', 'Services route must exist.'),
      ],
    });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: null,
    });

    expect(report.summary.whatWasBuilt).toEqual(['Route /']);
  });

  it('allows final completion only when build and every required contract item pass', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
      file('src/types/story.ts', 'export interface Story { title: string; childProfileIds: string[] }'),
    ];
    const buildContract = contract({
      dataModels: [
        { name: 'Story', fields: ['title', 'childProfileIds'], source: 'blueprint' },
      ],
      requirements: [
        requirement('route', '/', 'Home route must exist.'),
        requirement('data-model', 'Story', 'Story model should include title and childProfileIds.'),
        requirement('deployment', 'Next.js web app', 'Production build must pass.'),
      ],
    });
    const report = createContractReviewReport({
      contract: buildContract,
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });

    expect(report.completionAllowed).toBe(true);
    expect(report.summary.deploymentReadiness).toBe('ready');
  });

  it('does not accept an integration dependency without implementation evidence', () => {
    const files = [
      file(
        'package.json',
        JSON.stringify({
          dependencies: {
            stripe: '^18.0.0',
          },
        }),
        'json'
      ),
    ];
    const stripe = {
      ...requirement(
        'integration',
        'Stripe',
        'Stripe billing integration must be connected.'
      ),
      title: 'Integration: Stripe',
    };
    const report = createContractReviewReport({
      contract: contract({
        integrations: ['Stripe'],
        requirements: [stripe],
      }),
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });
    const result = report.requirementReports[0];

    expect(result.status).toBe('partially satisfied');
    expect(result.evidence).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'configuration', ref: 'package.json' }),
      ])
    );
    expect(result.recommendedRepairTask?.allowedFileScope).not.toContain('src/**');
    expect(report.completionAllowed).toBe(false);
  });

  it('requires enforceable ownership evidence for role and permission requirements', () => {
    const files = [
      file(
        'src/lib/auth/server.ts',
        'export async function getUser(supabase: { auth: { getUser(): Promise<unknown> } }) { return supabase.auth.getUser(); }'
      ),
      file(
        'supabase/migrations/20260721_profiles.sql',
        'alter table profiles enable row level security;\ncreate policy "owners" on profiles using (auth.uid() = user_id);',
        'sql'
      ),
    ];
    const report = createContractReviewReport({
      contract: contract({
        requirements: [
          requirement(
            'role-permission',
            'profile ownership',
            'Users may access only profiles they own.'
          ),
        ],
      }),
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });

    expect(report.requirementReports[0]).toMatchObject({
      status: 'satisfied',
      validationResult: 'passed',
    });
    expect(report.requirementReports[0].relatedFiles).toContain(
      'supabase/migrations/20260721_profiles.sql'
    );
  });

  it('requires repository test evidence for test acceptance criteria', () => {
    const testRequirement = requirement(
      'acceptance',
      'checkout tests',
      'Focused tests must cover checkout failures.'
    );
    const withoutTest = [file('src/lib/checkout.ts', 'export const checkout = () => false;')];
    const missing = createContractReviewReport({
      contract: contract({ requirements: [testRequirement] }),
      repositoryModel: createRepositoryModel({ files: withoutTest }),
      files: withoutTest,
      validationResult: buildPassed(),
    });
    const withTest = [
      ...withoutTest,
      file(
        'tests/checkout.test.ts',
        "it('covers checkout failures', () => { expect(false).toBe(false); });"
      ),
    ];
    const satisfied = createContractReviewReport({
      contract: contract({ requirements: [testRequirement] }),
      repositoryModel: createRepositoryModel({ files: withTest }),
      files: withTest,
      validationResult: buildPassed(),
    });

    expect(missing.requirementReports[0].status).toBe('missing');
    expect(satisfied.requirementReports[0].status).toBe('satisfied');
    expect(satisfied.requirementReports[0].evidence[0]).toMatchObject({
      kind: 'test',
      ref: 'tests/checkout.test.ts',
    });
  });

  it('can prove explicit asset requirements without treating binary content as source', () => {
    const assetRequirement: BuildContractRequirement = {
      ...requirement(
        'visual',
        'brand logo',
        'The approved brand logo must be included.'
      ),
      validationStrategy: 'file-exists',
      evidenceReferences: [{ kind: 'file', ref: 'public/brand-logo.png' }],
    };
    const files = [file('public/brand-logo.png', '', 'unknown')];
    const report = createContractReviewReport({
      contract: contract({ requirements: [assetRequirement] }),
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });

    expect(report.requirementReports[0].status).toBe('satisfied');
    expect(report.requirementReports[0].evidence[0]).toMatchObject({
      kind: 'asset',
      ref: 'public/brand-logo.png',
    });
  });

  it('provides evidence for every requirement and matching plain and technical summaries', () => {
    const files = [
      file('src/app/page.tsx', 'export default function Page() { return <main>Home</main>; }'),
    ];
    const report = createContractReviewReport({
      contract: contract(),
      repositoryModel: createRepositoryModel({ files }),
      files,
      validationResult: buildPassed(),
    });
    const completion = createContractCompletionReport(report);

    expect(report.requirementReports.every((item) => item.evidence.length > 0)).toBe(
      true
    );
    expect(completion.plainLanguage.complete).toBe(report.completionAllowed);
    expect(completion.technical.requirements).toEqual(report.requirementReports);
    expect(completion.technical.requirements).not.toBe(report.requirementReports);
  });
});
