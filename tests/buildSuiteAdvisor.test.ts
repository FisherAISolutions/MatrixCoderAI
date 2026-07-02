import { describe, expect, it } from 'vitest';
import { getBuildSuiteAdvisorReport } from '@/lib/build-suite/advisor';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';

function idsFor(selection: BuildSuiteSelection, sectionTitle?: string): string[] {
  const report = getBuildSuiteAdvisorReport(selection);
  const sections = sectionTitle
    ? report.sections.filter((section) => section.title === sectionTitle)
    : report.sections;

  return sections.flatMap((section) =>
    section.recommendations.map((recommendation) => recommendation.item.id)
  );
}

describe('build suite advisor', () => {
  it('recommends CRM-ready enhancements from metadata', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'personal-crm',
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    };

    const ids = idsFor(selection);

    expect(ids).toEqual(
      expect.arrayContaining([
        'data-tables',
        'search-filters',
        'kanban-board',
        'notifications',
      ])
    );
  });

  it('recommends fitness tracker mobile, chart, and AI-adjacent additions', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'fitness-tracker',
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    };

    const ids = idsFor(selection);

    expect(ids).toEqual(
      expect.arrayContaining([
        'charts-metrics',
        'mobile-first',
        'notifications',
        'smart-summaries',
      ])
    );
  });

  it('derives ecommerce recommendations from selected marketplace metadata', () => {
    const selection: BuildSuiteSelection = {
      layoutId: 'ecommerce-layout',
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    };

    const ids = idsFor(selection);

    expect(ids).toEqual(
      expect.arrayContaining([
        'stripe-ready',
        'ratings',
        'cloudinary-ready',
        'data-tables',
      ])
    );
  });

  it('does not recommend items already added to the build', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'personal-crm',
      componentIds: ['data-tables', 'search-filters'],
      aiFeatureIds: [],
      integrationIds: [],
    };

    const ids = idsFor(selection);

    expect(ids).not.toContain('data-tables');
    expect(ids).not.toContain('search-filters');
    expect(ids).toContain('kanban-board');
  });

  it('includes scored recommendation details', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'saas-dashboard',
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    };
    const report = getBuildSuiteAdvisorReport(selection);
    const recommendation = report.sections[0]?.recommendations[0];

    expect(recommendation?.reason.trim()).not.toBe('');
    expect(recommendation?.confidenceScore).toBeGreaterThanOrEqual(42);
    expect(recommendation?.compatibilityScore).toBeGreaterThanOrEqual(34);
    expect(recommendation?.estimatedImplementationImpact).toMatch(
      /^(low|medium|high)$/
    );
  });
});
