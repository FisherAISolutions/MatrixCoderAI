import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  PipelineRunGuard,
  isTerminalPipelineStage,
  stageForAgent,
} from '@/lib/generation/pipelineState';

describe('generation pipeline run guard', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts runs with stable ids and planning state', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1000);
    const guard = new PipelineRunGuard();

    const snapshot = guard.startRun('generation');

    expect(snapshot.runId).toBe('generation-1000-1');
    expect(snapshot.stage).toBe('planning');
    expect(snapshot.updatedAt).toBe(1000);
  });

  it('ignores late transitions from a stale run after a new run starts', () => {
    const guard = new PipelineRunGuard();
    const first = guard.startRun('generation');
    const second = guard.startRun('generation');

    const stale = guard.setStage(first.runId!, 'completed');

    expect(stale.runId).toBe(second.runId);
    expect(stale.stage).toBe('planning');
    expect(guard.getSnapshot().runId).toBe(second.runId);
    expect(guard.getSnapshot().stage).toBe('planning');
  });

  it('clears the active run after a terminal stage', () => {
    const guard = new PipelineRunGuard();
    const run = guard.startRun('generation');

    guard.setStage(run.runId!, 'completed');
    const afterTerminal = guard.setStage(run.runId!, 'failed');

    expect(afterTerminal.stage).toBe('completed');
    expect(guard.isActive(run.runId)).toBe(false);
  });

  it('can cancel only the active run', () => {
    const guard = new PipelineRunGuard();
    const first = guard.startRun('generation');
    const second = guard.startRun('generation');

    guard.cancelRun(first.runId!);
    expect(guard.getSnapshot().runId).toBe(second.runId);
    expect(guard.getSnapshot().stage).toBe('planning');

    guard.cancelRun(second.runId!);
    expect(guard.getSnapshot().stage).toBe('cancelled');
    expect(guard.isActive(second.runId)).toBe(false);
  });

  it('maps agents and terminal stages explicitly', () => {
    expect(stageForAgent('planning')).toBe('planning');
    expect(stageForAgent('coding')).toBe('generating');
    expect(stageForAgent('reviewing')).toBe('reviewing');
    expect(stageForAgent('orchestrator')).toBe('generating');
    expect(isTerminalPipelineStage('validation-blocked')).toBe(true);
    expect(isTerminalPipelineStage('validating')).toBe(false);
  });
});