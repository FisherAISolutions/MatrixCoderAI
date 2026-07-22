import { describe, expect, it } from 'vitest';

import { createBuildManifest, type BuildManifest } from '@/lib/build-suite/buildManifest';
import type { BuildSuiteSelection } from '@/lib/build-suite/types';
import {
  addBlueprintRoute,
  createBlueprintDraftFromManifest,
  updateBlueprintRoute,
} from '@/lib/blueprint-studio/blueprintDraft';
import { createBlueprintTechnicalPlan, approveBlueprintTechnicalPlan } from '@/lib/blueprint-studio/intelligence';
import { applyBlueprintChangeEnvelope } from '@/lib/blueprint-studio/changeEnvelope';
import {
  createArchitectDraft,
  updateArchitectAnswer,
} from '@/lib/matrix-ai-architect';
import {
  createEmptyIntelligenceCore,
  createBlueprintIntelligencePacket,
} from '@/lib/intelligence-core';
import {
  loadMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceContext,
} from '@/lib/projects/projectStore';

function memoryStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear() {
      values.clear();
    },
    getItem(key: string) {
      return values.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(values.keys())[index] ?? null;
    },
    removeItem(key: string) {
      values.delete(key);
    },
    setItem(key: string, value: string) {
      values.set(key, value);
    },
  };
}

function crmSelection(): BuildSuiteSelection {
  return {
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
}

function manifest(): BuildManifest {
  return createBuildManifest({
    selection: crmSelection(),
    now: new Date('2026-07-22T10:00:00.000Z'),
  });
}

function architectDraft() {
  let draft = createArchitectDraft({
    projectId: 'project-1',
    projectName: 'Founder CRM',
    now: new Date('2026-07-22T10:01:00.000Z'),
  });
  draft = updateArchitectAnswer(
    draft,
    'appIdea',
    'Build a personal CRM for contacts, companies, tasks, and sales pipeline.',
    new Date('2026-07-22T10:02:00.000Z')
  );
  draft = updateArchitectAnswer(
    draft,
    'crm',
    true,
    new Date('2026-07-22T10:03:00.000Z')
  );
  draft = updateArchitectAnswer(
    draft,
    'investmentLevel',
    'lean',
    new Date('2026-07-22T10:04:00.000Z')
  );
  return draft;
}

describe('Blueprint Studio planning integration', () => {
  it('derives a Build Contract and capabilities but requires explicit approval', () => {
    const buildManifest = manifest();
    const blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:05:00.000Z')
    );

    const plan = createBlueprintTechnicalPlan({
      projectId: 'project-1',
      projectName: 'Founder CRM',
      buildManifest,
      blueprintDraft,
      architectDraft: architectDraft(),
      now: new Date('2026-07-22T10:06:00.000Z'),
    });

    expect(plan.buildContract.routes.map((route) => route.path)).toEqual(
      expect.arrayContaining(['/', '/contacts', '/companies', '/tasks', '/pipeline'])
    );
    expect(plan.capabilityResolution.contractId).toBe(plan.buildContract.id);
    expect(plan.capabilityResolution.capabilities.length).toBeGreaterThan(0);
    expect(plan.gate.canStartBuild).toBe(false);
    expect(plan.gate.reasons).toContain(
      'Approve the Blueprint technical plan before sending it to Workspace.'
    );
  });

  it('opens the approval gate only after approving the exact current Blueprint Draft', () => {
    const buildManifest = manifest();
    const blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:05:00.000Z')
    );

    const approved = approveBlueprintTechnicalPlan({
      projectId: 'project-1',
      buildManifest,
      blueprintDraft,
      architectDraft: architectDraft(),
      now: new Date('2026-07-22T10:07:00.000Z'),
    });

    expect(approved.gate.canStartBuild).toBe(true);
    expect(approved.gate.approved).toBe(true);

    const changedDraft = addBlueprintRoute(
      blueprintDraft,
      '/reports',
      new Date('2026-07-22T10:08:00.000Z')
    );
    const stalePlan = createBlueprintTechnicalPlan({
      projectId: 'project-1',
      buildManifest,
      blueprintDraft: changedDraft,
      architectDraft: architectDraft(),
      existingBuildContract: approved.buildContract,
      existingCapabilityResolution: approved.capabilityResolution,
      existingIntelligenceCore: approved.intelligenceCore,
      now: new Date('2026-07-22T10:09:00.000Z'),
    });

    expect(stalePlan.gate.canStartBuild).toBe(false);
    expect(stalePlan.gate.reasons).toEqual(
      expect.arrayContaining([
        'Blueprint changed after the current Build Contract was created.',
        'Approve the Blueprint technical plan before sending it to Workspace.',
      ])
    );
  });

  it('uses newer Blueprint decisions over Architect and Build Manifest defaults without mutating them', () => {
    const buildManifest = manifest();
    const architect = architectDraft();
    const originalManifestText = JSON.stringify(buildManifest);
    let blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:05:00.000Z')
    );
    const contacts = blueprintDraft.routes.find((route) => route.path === '/contacts');
    expect(contacts).toBeTruthy();
    blueprintDraft = updateBlueprintRoute(
      blueprintDraft,
      contacts!.id,
      {
        name: 'Relationships',
        description: 'Approved Blueprint wording for the contacts workspace.',
      },
      new Date('2026-07-22T10:06:00.000Z')
    );

    const plan = createBlueprintTechnicalPlan({
      projectId: 'project-1',
      buildManifest,
      blueprintDraft,
      architectDraft: architect,
      now: new Date('2026-07-22T10:07:00.000Z'),
    });

    expect(plan.buildContract.routes.find((route) => route.path === '/contacts')).toMatchObject({
      label: 'Relationships',
      purpose: 'Approved Blueprint wording for the contacts workspace.',
      source: 'blueprint',
    });
    expect(JSON.stringify(buildManifest)).toBe(originalManifestText);
  });

  it('keeps Architect stale indicators informational while Blueprint remains authoritative', () => {
    const buildManifest = manifest();
    const architect = architectDraft();
    let blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:20:00.000Z')
    );
    blueprintDraft = addBlueprintRoute(
      blueprintDraft,
      '/reports',
      new Date('2026-07-22T10:21:00.000Z')
    );
    const plan = createBlueprintTechnicalPlan({
      projectId: 'project-1',
      buildManifest,
      blueprintDraft,
      architectDraft: architect,
      now: new Date('2026-07-22T10:22:00.000Z'),
    });

    expect(plan.packet.staleStateIndicators).toContain(
      'Blueprint Draft is newer than Architect Draft; do not overwrite Blueprint decisions from stale Architect data.'
    );
    expect(plan.gate.reasons).not.toContain(
      'Blueprint Draft is newer than Architect Draft; do not overwrite Blueprint decisions from stale Architect data.'
    );
  });

  it('applies guarded change envelopes and requires confirmation for destructive changes', () => {
    const buildManifest = manifest();
    let blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:05:00.000Z')
    );
    blueprintDraft = addBlueprintRoute(
      blueprintDraft,
      '/reports',
      new Date('2026-07-22T10:06:00.000Z')
    );
    const core = createEmptyIntelligenceCore('project-1');
    const envelope = {
      schemaVersion: 1,
      projectId: 'project-1',
      draftId: blueprintDraft.id,
      naturalLanguageResponse: 'I removed the reports route from the draft.',
      proposedBlueprintPatch: {
        removeRoutePaths: ['/reports'],
      },
      confidence: 0.9,
      requiresConfirmation: true,
    };

    const blocked = applyBlueprintChangeEnvelope({
      draft: blueprintDraft,
      core,
      envelope,
      expectedProjectId: 'project-1',
      expectedDraftId: blueprintDraft.id,
    });

    expect(blocked.applied).toBe(false);
    expect(blocked.skippedReason).toContain('Removed route /reports');

    const applied = applyBlueprintChangeEnvelope({
      draft: blueprintDraft,
      core,
      envelope,
      expectedProjectId: 'project-1',
      expectedDraftId: blueprintDraft.id,
      allowConfirmedDestructiveChange: true,
    });

    expect(applied.applied).toBe(true);
    expect(applied.draft.routes.some((route) => route.path === '/reports')).toBe(false);
    expect(applied.impact.destructiveChanges).toContain('Removed route /reports');
  });

  it('persists structured planning state through the existing project workspace context', () => {
    const storage = memoryStorage();
    const buildManifest = manifest();
    const blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:05:00.000Z')
    );
    const approved = approveBlueprintTechnicalPlan({
      projectId: 'project-1',
      buildManifest,
      blueprintDraft,
      architectDraft: architectDraft(),
      now: new Date('2026-07-22T10:07:00.000Z'),
    });

    saveMatrixProjectWorkspaceContext(storage, {
      currentProjectId: 'project-1',
      currentProjectName: 'Founder CRM',
      buildManifest,
      blueprintDraft,
      architectDraft: architectDraft(),
      buildContract: approved.buildContract,
      capabilityResolution: approved.capabilityResolution,
      intelligenceCore: approved.intelligenceCore,
    });

    const restored = loadMatrixProjectWorkspaceContext(storage);

    expect(restored?.buildManifest?.selection.appTypeId).toBe('personal-crm');
    expect(restored?.blueprintDraft?.id).toBe(blueprintDraft.id);
    expect(restored?.buildContract?.id).toBe(approved.buildContract.id);
    expect(restored?.capabilityResolution?.contractId).toBe(
      approved.buildContract.id
    );
    expect(restored?.intelligenceCore?.projectId).toBe('project-1');
  });

  it('creates Blueprint intelligence packets with contract and capability summaries only', () => {
    const buildManifest = manifest();
    const blueprintDraft = createBlueprintDraftFromManifest(
      buildManifest,
      new Date('2026-07-22T10:05:00.000Z')
    );
    const approved = approveBlueprintTechnicalPlan({
      projectId: 'project-1',
      buildManifest,
      blueprintDraft,
      architectDraft: architectDraft(),
      now: new Date('2026-07-22T10:07:00.000Z'),
    });

    const packet = createBlueprintIntelligencePacket(approved.intelligenceCore, {
      buildManifest,
      blueprintDraft,
      architectDraft: architectDraft(),
      buildContract: approved.buildContract,
      capabilityResolution: approved.capabilityResolution,
      now: new Date('2026-07-22T10:08:00.000Z'),
    });

    expect(packet.kind).toBe('blueprint');
    expect(packet.contractSummary?.contractId).toBe(approved.buildContract.id);
    expect(packet.capabilitySummary?.requiredCapabilities.length).toBeGreaterThan(0);
    expect(packet.sourceVersions.map((source) => source.kind)).toEqual(
      expect.arrayContaining([
        'architect',
        'build-manifest',
        'blueprint',
        'build-contract',
      ])
    );
  });
});
