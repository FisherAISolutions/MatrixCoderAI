import { describe, expect, it } from 'vitest';
import { buildMatrixBuildSuitePrompt } from '@/lib/build-suite/promptBuilder';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';

describe('buildMatrixBuildSuitePrompt', () => {
  it('builds a combined prompt from selected catalog items', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'personal-crm',
      appearance: 'dark',
      paletteId: 'dark-matrix-green',
      styleId: 'quiet-saas',
      layoutId: 'sidebar-workspace',
      componentIds: ['data-tables', 'forms-crud'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['local-storage'],
      animationId: 'minimal-motion',
      mobileId: 'responsive-web',
    };

    const result = buildMatrixBuildSuitePrompt(selection);

    expect(result.missingSelection).toEqual([]);
    expect(result.selectedItems.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        'personal-crm',
        'dark-matrix-green',
        'quiet-saas',
        'sidebar-workspace',
        'data-tables',
        'forms-crud',
        'smart-summaries',
        'local-storage',
        'minimal-motion',
        'responsive-web',
      ])
    );
    expect(result.prompt).toContain('Build a complete Next.js 15');
    expect(result.prompt).toContain('Personal CRM');
    expect(result.prompt).toContain('Use a dark visual mode');
    expect(result.prompt).toContain('Matrix-inspired');
    expect(result.prompt).toContain('localStorage');
    expect(result.prompt).toContain('Keep app/.../page.tsx files as Server Components');
    expect(result.prompt).not.toContain('SaaS Blue');
  });

  it('reports missing required selections for an incomplete review', () => {
    const result = buildMatrixBuildSuitePrompt({
      componentIds: [],
      aiFeatureIds: [],
      integrationIds: [],
    });

    expect(result.missingSelection).toEqual([
      'App Type',
      'Appearance',
      'Color Palette',
      'UI Style',
      'Layout',
      'Animations',
      'Mobile',
    ]);
    expect(result.prompt).toContain('None selected.');
  });
});
