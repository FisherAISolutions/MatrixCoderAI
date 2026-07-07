import { describe, expect, it } from 'vitest';
import { buildBuildSuitePreviewModel } from '@/lib/build-suite/preview/model';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';

describe('build suite live preview engine', () => {
  it('derives a dark glass sidebar preview from selected metadata', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'personal-crm',
      appearance: 'dark',
      paletteId: 'dark-matrix-green',
      styleId: 'glassmorphism',
      layoutId: 'sidebar-workspace',
      componentIds: ['data-tables', 'forms-crud', 'notifications'],
      aiFeatureIds: [],
      integrationIds: [],
    };

    const model = buildBuildSuitePreviewModel(selection);

    expect(model.appTitle).toBe('Personal CRM');
    expect(model.appearance).toBe('dark');
    expect(model.navigation).toBe('sidebar');
    expect(model.styleFlags.glass).toBe(true);
    expect(model.widgets.tables).toBe(true);
    expect(model.widgets.forms).toBe(true);
    expect(model.widgets.notifications).toBe(true);
    expect(model.classes.panel).toContain('backdrop-blur');
  });

  it('renders mobile bottom navigation and chart widgets from selections', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'fitness-tracker',
      appearance: 'dark',
      paletteId: 'dark-slate-cyan',
      styleId: 'cyberpunk',
      layoutId: 'mobile-tabs',
      componentIds: ['charts-metrics'],
      aiFeatureIds: [],
      integrationIds: [],
      mobileId: 'mobile-first',
    };

    const model = buildBuildSuitePreviewModel(selection);

    expect(model.navigation).toBe('bottom');
    expect(model.styleFlags.neon).toBe(true);
    expect(model.widgets.mobileFrame).toBe(true);
    expect(model.widgets.charts).toBe(true);
  });

  it('adds integration and AI widgets without hardcoded UI changes', () => {
    const selection: BuildSuiteSelection = {
      appTypeId: 'saas-dashboard',
      appearance: 'light',
      paletteId: 'light-saas-blue',
      styleId: 'material',
      layoutId: 'top-nav-dashboard',
      componentIds: ['pricing-tables'],
      aiFeatureIds: ['smart-summaries'],
      integrationIds: ['stripe-ready', 'supabase-ready'],
    };

    const model = buildBuildSuitePreviewModel(selection);

    expect(model.appearance).toBe('light');
    expect(model.styleFlags.material).toBe(true);
    expect(model.widgets.aiPanel).toBe(true);
    expect(model.widgets.stripeCard).toBe(true);
    expect(model.widgets.databaseStatus).toBe(true);
    expect(model.classes.frame).toContain('#f8fafc');
  });
});
