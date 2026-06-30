import { describe, expect, it } from 'vitest';
import type { DeploymentWorkspaceSnapshot } from '@/lib/deployment/workspaceStatus';
import { buildVercelDeploymentDryRun } from '@/lib/deployment/vercelDeploymentRequest';

function snapshot(
  overrides: Partial<DeploymentWorkspaceSnapshot> = {}
): DeploymentWorkspaceSnapshot {
  return {
    projectName: 'Matrix Demo',
    framework: 'Next.js',
    generationStatus: 'passed',
    validationStatus: 'passed',
    buildStatus: 'passed',
    previewStatus: 'passed',
    fileCount: 3,
    routeCount: 2,
    generatedFilePaths: [
      'package.json',
      'src/app/page.tsx',
      'src/app/dashboard/page.tsx',
    ],
    exportFiles: [
      { path: 'package.json', content: '{"scripts":{"build":"next build"}}' },
      { path: 'src/app/page.tsx', content: 'export default function Page() {}' },
      {
        path: 'src/app/dashboard/page.tsx',
        content: 'export default function Page() {}',
      },
    ],
    checklist: {
      projectGenerated: 'passed',
      importsValid: 'passed',
      typeScriptPasses: 'passed',
      buildPasses: 'passed',
      runtimeSmokePasses: 'passed',
      generatedQualityPasses: 'passed',
      readyForDeployment: 'passed',
    },
    ...overrides,
  };
}

describe('Vercel deployment dry-run request builder', () => {
  it('builds a sanitized deployment request when all gates pass', () => {
    const dryRun = buildVercelDeploymentDryRun({
      snapshot: snapshot(),
      config: {
        tokenConfigured: true,
        projectName: 'matrix-demo',
        teamId: 'team_123',
        savedAt: '2026-06-29T12:00:00.000Z',
      },
      productionStatus: 'Passed',
      requestedAt: '2026-06-29T12:01:00.000Z',
    });

    expect(dryRun).toMatchObject({
      projectName: 'matrix-demo',
      fileCount: 3,
      routeCount: 2,
      framework: 'Next.js',
      productionCheckStatus: 'Passed',
      deploymentAllowed: true,
      blockingReasons: [],
    });
    expect(dryRun.request?.project).toMatchObject({
      projectName: 'matrix-demo',
      framework: 'nextjs',
      rootDirectory: '.',
      teamId: 'team_123',
    });
    expect(JSON.stringify(dryRun.request)).not.toContain('token');
  });

  it('blocks deployment when token or project name are missing', () => {
    const dryRun = buildVercelDeploymentDryRun({
      snapshot: snapshot(),
      config: {
        tokenConfigured: false,
        savedAt: '2026-06-29T12:00:00.000Z',
      },
      productionStatus: 'Passed',
    });

    expect(dryRun.deploymentAllowed).toBe(false);
    expect(dryRun.request).toBeNull();
    expect(dryRun.blockingReasons).toEqual([
      'Vercel token is not configured locally.',
      'Vercel project name is required.',
    ]);
  });

  it('blocks deployment when production check has not passed', () => {
    const dryRun = buildVercelDeploymentDryRun({
      snapshot: snapshot(),
      config: {
        tokenConfigured: true,
        projectName: 'matrix-demo',
        savedAt: '2026-06-29T12:00:00.000Z',
      },
      productionStatus: 'Failed',
    });

    expect(dryRun.deploymentAllowed).toBe(false);
    expect(dryRun.blockingReasons).toContain(
      'Production Build Check must pass before deployment.'
    );
  });

  it('blocks deployment when no Next.js project files are available', () => {
    const dryRun = buildVercelDeploymentDryRun({
      snapshot: snapshot({
        framework: 'Unknown',
        fileCount: 0,
        routeCount: 0,
        generatedFilePaths: [],
        exportFiles: [],
      }),
      config: {
        tokenConfigured: true,
        projectName: 'matrix-demo',
        savedAt: '2026-06-29T12:00:00.000Z',
      },
      productionStatus: 'Passed',
    });

    expect(dryRun.deploymentAllowed).toBe(false);
    expect(dryRun.blockingReasons).toEqual([
      'No generated project files are available.',
      'Only generated Next.js projects are supported.',
    ]);
  });
});
