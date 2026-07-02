import { describe, expect, it } from 'vitest';
import {
  clearVercelDeploymentMetadata,
  loadVercelDeploymentMetadata,
  parseVercelDeploymentMetadata,
  saveVercelDeploymentMetadata,
  VERCEL_DEPLOYMENT_METADATA_KEY,
} from '@/lib/deployment/vercelDeploymentMetadata';
import type { VercelFlowLogEntry } from '@/lib/deployment/vercelDeploymentFlow';

function createStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    removeItem: (key: string) => {
      data.delete(key);
    },
    data,
  };
}

function logs(count: number): VercelFlowLogEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    timestamp: `2026-06-29T12:${String(index).padStart(2, '0')}:00.000Z`,
    level: 'info',
    message: `Log ${index}`,
  }));
}

describe('Vercel deployment metadata', () => {
  it('saves and loads deployment metadata by project name', () => {
    const storage = createStorage();

    saveVercelDeploymentMetadata(
      {
        projectName: 'matrix-demo',
        projectId: 'prj_1',
        deploymentId: 'dpl_1',
        deploymentUrl: 'https://matrix-demo.vercel.app',
        productionUrl: 'https://matrix-demo.vercel.app',
        status: 'ready',
        lastDeploymentTime: '2026-06-29T12:00:00.000Z',
        logs: logs(2),
      },
      storage
    );

    const loaded = loadVercelDeploymentMetadata('matrix-demo', storage);

    expect(loaded).toMatchObject({
      projectName: 'matrix-demo',
      projectId: 'prj_1',
      deploymentId: 'dpl_1',
      status: 'ready',
      productionUrl: 'https://matrix-demo.vercel.app',
    });
  });

  it('keeps only the latest 20 log entries', () => {
    const storage = createStorage();

    const saved = saveVercelDeploymentMetadata(
      {
        projectName: 'matrix-demo',
        status: 'failed',
        lastDeploymentTime: '2026-06-29T12:00:00.000Z',
        logs: logs(25),
      },
      storage
    );

    expect(saved.logs).toHaveLength(20);
    expect(saved.logs[0].message).toBe('Log 5');
  });

  it('clears project-scoped metadata', () => {
    const storage = createStorage();
    saveVercelDeploymentMetadata(
      {
        projectName: 'matrix-demo',
        status: 'ready',
        lastDeploymentTime: '2026-06-29T12:00:00.000Z',
        logs: [],
      },
      storage
    );

    clearVercelDeploymentMetadata('matrix-demo', storage);

    expect(
      storage.getItem(`${VERCEL_DEPLOYMENT_METADATA_KEY}:matrix-demo`)
    ).toBeNull();
  });

  it('rejects invalid stored metadata', () => {
    expect(parseVercelDeploymentMetadata('{bad json')).toBeNull();
    expect(
      parseVercelDeploymentMetadata(
        JSON.stringify({
          projectName: 'matrix-demo',
          status: 'pending',
          lastDeploymentTime: '2026-06-29T12:00:00.000Z',
        })
      )
    ).toBeNull();
  });
});
