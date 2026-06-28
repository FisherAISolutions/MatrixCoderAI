import { describe, expect, it } from 'vitest';
import { getAndroidReadiness } from '@/lib/deployment/androidReadiness';

describe('Android readiness helper', () => {
  it('requires generated project files', () => {
    expect(
      getAndroidReadiness({
        hasProjectFiles: false,
        framework: 'Next.js',
        productionStatus: 'Passed',
      })
    ).toMatchObject({
      status: 'Not ready',
    });
  });

  it('requires a Next.js web app', () => {
    expect(
      getAndroidReadiness({
        hasProjectFiles: true,
        framework: 'Unknown',
        productionStatus: 'Passed',
      })
    ).toMatchObject({
      status: 'Not ready',
    });
  });

  it('requires a production check before configuring Android', () => {
    expect(
      getAndroidReadiness({
        hasProjectFiles: true,
        framework: 'Next.js',
        productionStatus: 'Not run',
      })
    ).toMatchObject({
      status: 'Needs production check',
    });

    expect(
      getAndroidReadiness({
        hasProjectFiles: true,
        framework: 'Next.js',
        productionStatus: 'Running',
      })
    ).toMatchObject({
      status: 'Needs production check',
    });
  });

  it('reports a failed production check', () => {
    expect(
      getAndroidReadiness({
        hasProjectFiles: true,
        framework: 'Next.js',
        productionStatus: 'Failed',
      })
    ).toMatchObject({
      status: 'Failed production check',
    });
  });

  it('allows a passed Next.js project to be ready to configure', () => {
    expect(
      getAndroidReadiness({
        hasProjectFiles: true,
        framework: 'Next.js',
        productionStatus: 'Passed',
      })
    ).toMatchObject({
      status: 'Ready to configure',
    });
  });
});
