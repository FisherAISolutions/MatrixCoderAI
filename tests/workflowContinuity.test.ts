import { describe, expect, it } from 'vitest';
import {
  getContinueBuildTarget,
  getWorkflowNeighbors,
  getWorkflowStepByPath,
  normalizeWorkflowPath,
} from '@/lib/workflow/workflowContinuity';

describe('workflow continuity helpers', () => {
  it('normalizes query strings, hashes, and trailing slashes', () => {
    expect(normalizeWorkflowPath('/projects/?tab=recent#top')).toBe('/projects');
    expect(getWorkflowStepByPath('/matrix-ai-architect#review')?.id).toBe(
      'architect'
    );
  });

  it('returns previous and next workflow steps', () => {
    const neighbors = getWorkflowNeighbors('/matrix-ai-architect');

    expect(neighbors.current?.id).toBe('architect');
    expect(neighbors.previous?.id).toBe('projects');
    expect(neighbors.next?.id).toBe('blueprint');
  });

  it('starts an empty workflow at Projects', () => {
    expect(getContinueBuildTarget({}).id).toBe('projects');
  });

  it('routes opened projects to Matrix AI Architect', () => {
    expect(getContinueBuildTarget({ hasProject: true }).id).toBe('architect');
  });

  it('routes Architect drafts to Blueprint Studio', () => {
    expect(getContinueBuildTarget({ hasArchitectDraft: true }).id).toBe(
      'blueprint'
    );
  });

  it('routes Build Manifest handoff to Blueprint Studio', () => {
    expect(getContinueBuildTarget({ hasBuildManifest: true }).id).toBe(
      'blueprint'
    );
  });

  it('routes approved Blueprint drafts to Workspace', () => {
    expect(getContinueBuildTarget({ hasBlueprintDraft: true }).id).toBe(
      'workspace'
    );
  });

  it('routes generated projects to Deployment Center', () => {
    expect(getContinueBuildTarget({ hasGeneratedProject: true }).id).toBe(
      'deployment'
    );
    expect(getContinueBuildTarget({ deploymentReady: true }).id).toBe(
      'deployment'
    );
  });
});
