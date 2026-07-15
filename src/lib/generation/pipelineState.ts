export type PipelineStage =
  | 'idle'
  | 'planning'
  | 'generating'
  | 'reviewing'
  | 'validating'
  | 'repairing'
  | 'preparing-preview'
  | 'preview-ready'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'recoverable-failure'
  | 'validation-blocked';

export interface PipelineRunSnapshot {
  runId: string | null;
  stage: PipelineStage;
  updatedAt: number;
}

export class PipelineRunGuard {
  private sequence = 0;
  private activeRunId: string | null = null;
  private snapshot: PipelineRunSnapshot = {
    runId: null,
    stage: 'idle',
    updatedAt: 0,
  };

  startRun(prefix = 'generation'): PipelineRunSnapshot {
    this.sequence += 1;
    this.activeRunId = `${prefix}-${Date.now()}-${this.sequence}`;
    return this.setStage(this.activeRunId, 'planning');
  }

  isActive(runId: string | null | undefined): boolean {
    return Boolean(runId && this.activeRunId === runId);
  }

  getSnapshot(): PipelineRunSnapshot {
    return { ...this.snapshot };
  }

  setStage(runId: string, stage: PipelineStage): PipelineRunSnapshot {
    if (!this.isActive(runId)) return { ...this.snapshot };
    this.snapshot = {
      runId,
      stage,
      updatedAt: Date.now(),
    };
    if (isTerminalPipelineStage(stage)) {
      this.activeRunId = null;
    }
    return { ...this.snapshot };
  }

  cancelRun(runId: string, stage: PipelineStage = 'cancelled'): PipelineRunSnapshot {
    if (!this.isActive(runId)) return { ...this.snapshot };
    return this.setStage(runId, stage);
  }
}

export function isTerminalPipelineStage(stage: PipelineStage): boolean {
  return (
    stage === 'completed' ||
    stage === 'cancelled' ||
    stage === 'failed' ||
    stage === 'recoverable-failure' ||
    stage === 'validation-blocked'
  );
}

export function stageForAgent(agent: 'planning' | 'coding' | 'reviewing' | 'orchestrator'): PipelineStage {
  if (agent === 'planning') return 'planning';
  if (agent === 'reviewing') return 'reviewing';
  return 'generating';
}
