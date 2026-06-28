import { describe, expect, it } from 'vitest';
import { getVercelReadiness } from '@/lib/deployment/vercelReadiness';

describe('Vercel readiness helper', () => {
  it('requires generated project files', () => {
    expect(
      getVercelReadiness({
        hasProjectFiles: false,
        productionStatus: 'Passed',
      })
    ).toMatchObject({
      status: 'Not ready',
    });
  });

  it('requires a production check before connecting', () => {
    expect(
      getVercelReadiness({
        hasProjectFiles: true,
        productionStatus: 'Not run',
      })
    ).toMatchObject({
      status: 'Needs production check',
    });

    expect(
      getVercelReadiness({
        hasProjectFiles: true,
        productionStatus: 'Running',
      })
    ).toMatchObject({
      status: 'Needs production check',
    });
  });

  it('reports a failed production check', () => {
    expect(
      getVercelReadiness({
        hasProjectFiles: true,
        productionStatus: 'Failed',
      })
    ).toMatchObject({
      status: 'Failed production check',
    });
  });

  it('allows a passed project to be ready to connect', () => {
    expect(
      getVercelReadiness({
        hasProjectFiles: true,
        productionStatus: 'Passed',
      })
    ).toMatchObject({
      status: 'Ready to connect',
    });
  });
});
