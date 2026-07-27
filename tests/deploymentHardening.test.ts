import { beforeEach, describe, expect, it } from 'vitest';
import {
  fingerprintProjectFiles,
  inspectDeploymentProject,
} from '@/lib/deployment/projectInspection';
import {
  isProjectExportPath,
  selectProjectExportFiles,
} from '@/lib/deployment/projectZip';
import {
  acquireVercelDeploymentLock,
  assertVercelDeploymentTransition,
  hasActiveVercelDeployment,
  releaseVercelDeploymentLock,
  resetVercelDeploymentLocksForTests,
} from '@/lib/deployment/vercelDeploymentState';

describe('deployment hardening', () => {
  beforeEach(() => {
    resetVercelDeploymentLocksForTests();
  });

  it('excludes secrets, caches, traversal, host metadata, and binary build output', () => {
    expect(isProjectExportPath('.env.local')).toBe(false);
    expect(isProjectExportPath('.env.example')).toBe(true);
    expect(isProjectExportPath('../package.json')).toBe(false);
    expect(isProjectExportPath('.next/server/app.js')).toBe(false);
    expect(isProjectExportPath('node_modules/pkg/index.js')).toBe(false);
    expect(isProjectExportPath('src/app/page.tsx')).toBe(true);

    const selected = selectProjectExportFiles([
      { path: 'package.json', content: '{}' },
      { path: 'src/app/page.tsx', content: 'export default function Page() {}' },
      { path: '.env.example', content: 'OPENAI_API_KEY=' },
      { path: '.env', content: 'SECRET=yes' },
      { path: '.next/cache/data', content: 'cache' },
    ]);
    expect(selected.map((file) => file.path)).toEqual([
      '.env.example',
      'package.json',
      'src/app/page.tsx',
    ]);
  });

  it('inspects a nested Next.js project and fingerprints exact repository state', () => {
    const files = [
      {
        path: 'apps/web/package.json',
        content: JSON.stringify({
          scripts: { build: 'next build' },
          dependencies: { next: '15.1.11' },
        }),
      },
      { path: 'apps/web/src/app/page.tsx', content: 'export default function Page() {}' },
      { path: 'apps/web/.env.example', content: 'OPENAI_API_KEY=\n' },
      { path: 'apps/web/yarn.lock', content: '# lock' },
    ];
    const inspection = inspectDeploymentProject(files, 'apps/web');

    expect(inspection).toMatchObject({
      supported: true,
      projectRoot: 'apps/web',
      framework: 'nextjs',
      appRouter: true,
      packageManager: 'yarn',
      buildCommand: 'yarn build',
    });
    expect(inspection.environmentVariables).toEqual(['OPENAI_API_KEY']);
    expect(inspection.fingerprint).toBe(fingerprintProjectFiles(files));
  });

  it('blocks ambiguous or unsupported deployment roots', () => {
    const result = inspectDeploymentProject([
      { path: 'one/package.json', content: '{}' },
      { path: 'two/package.json', content: '{}' },
    ]);
    expect(result.supported).toBe(false);
    expect(result.blockingReasons.join(' ')).toContain('Multiple nested project roots');
  });

  it('permits only valid state transitions and one deployment per project', () => {
    expect(() =>
      assertVercelDeploymentTransition('readiness-check', 'preparing-files')
    ).not.toThrow();
    expect(() =>
      assertVercelDeploymentTransition('readiness-check', 'deployed')
    ).toThrow('Invalid Vercel deployment transition');

    expect(acquireVercelDeploymentLock('project-1', 'operation-1')).toBe(true);
    expect(acquireVercelDeploymentLock('project-1', 'operation-2')).toBe(false);
    expect(hasActiveVercelDeployment('project-1')).toBe(true);
    releaseVercelDeploymentLock('project-1', 'operation-2');
    expect(hasActiveVercelDeployment('project-1')).toBe(true);
    releaseVercelDeploymentLock('project-1', 'operation-1');
    expect(hasActiveVercelDeployment('project-1')).toBe(false);
  });
});
