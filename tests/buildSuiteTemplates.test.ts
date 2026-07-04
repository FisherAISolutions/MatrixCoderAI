import { describe, expect, it } from 'vitest';
import { buildMatrixBuildSuitePrompt } from '@/lib/build-suite/promptBuilder';
import {
  buildSuiteTemplatePacks,
  cloneBuildSuiteTemplateSelection,
  getBuildSuiteTemplatePack,
  validateBuildSuiteTemplatePack,
} from '@/lib/build-suite/templates';

describe('build suite template packs', () => {
  it('defines the starter app template pack set', () => {
    expect(buildSuiteTemplatePacks.map((template) => template.id)).toEqual([
      'fitness-tracker',
      'personal-crm',
      'ecommerce-store',
      'saas-dashboard',
      'inventory-manager',
      'restaurant-pos',
      'school-portal',
      'portfolio-website',
      'ai-chat-app',
      'booking-scheduler',
    ]);
  });

  it('keeps every template complete and connected to real catalog ids', () => {
    for (const template of buildSuiteTemplatePacks) {
      expect(template.label.trim()).not.toBe('');
      expect(template.description.trim()).not.toBe('');
      expect(template.highlights.length).toBeGreaterThan(0);
      expect(template.tags.length).toBeGreaterThan(0);
      expect(validateBuildSuiteTemplatePack(template)).toEqual([]);

      const prompt = buildMatrixBuildSuitePrompt(template.selection);
      expect(prompt.missingSelection).toEqual([]);
      expect(prompt.prompt).toContain('Build a complete Next.js 15');
      expect(prompt.selectedItems.length).toBeGreaterThan(6);
    }
  });

  it('clones template selections so applying one cannot mutate the catalog', () => {
    const template = getBuildSuiteTemplatePack('personal-crm');
    expect(template).toBeTruthy();

    const selection = cloneBuildSuiteTemplateSelection(template!);
    selection.componentIds.push('extra-local-item');
    selection.integrationIds.length = 0;

    expect(template!.selection.componentIds).not.toContain('extra-local-item');
    expect(template!.selection.integrationIds.length).toBeGreaterThan(0);
  });
});
