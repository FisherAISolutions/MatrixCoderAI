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
    expect(getWorkflowStepByPath('/matrix-build-suite#review')?.id).toBe(
      'build-suite'
    );
  });

  it('returns previous and next workflow steps', () => {
    const neighbors = getWorkflowNeighbors('/matrix-build-suite');

    expect(neighbors.current?.id).toBe('build-suite');
    expect(neighbors.previous?.id).toBe('projects');
    expect(neighbors.next?.id).toBe('blueprint');
  });

  it('starts an empty workflow at Projects', () => {
    expect(getContinueBuildTarget({}).id).toBe('projects');
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
