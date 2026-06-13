import { beforeEach, describe, expect, it } from 'vitest';
import {
  beginPreviewStage,
  completePreviewStage,
  failPreviewStage,
  getPreviewDiagnosticsSnapshot,
  resetPreviewDiagnostics,
  skipRunningPreviewStages,
} from '@/lib/preview/diagnostics';
import { clearTerminalLogs, getTerminalLogs } from '@/lib/terminal/store';

describe('preview diagnostics', () => {
  beforeEach(() => {
    clearTerminalLogs();
    resetPreviewDiagnostics();
  });

  it('tracks stage start/end/status and logs terminal diagnostics', () => {
    beginPreviewStage('generation', 'extracting files');
    completePreviewStage('generation', 'files written');

    const generation = getPreviewDiagnosticsSnapshot().find(
      (record) => record.stage === 'generation'
    );

    expect(generation).toMatchObject({
      label: 'Generation',
      status: 'ok',
      reason: 'files written',
    });
    expect(generation?.startedAt).toBeTruthy();
    expect(generation?.endedAt).toBeTruthy();
    expect(typeof generation?.durationMs).toBe('number');

    const logText = getTerminalLogs().map((line) => line.text).join('');
    expect(logText).toContain('[preview-diagnostics] Generation START');
    expect(logText).toContain('[preview-diagnostics] Generation OK');
  });

  it('marks the failed stage with a reason', () => {
    beginPreviewStage('preview-connected');
    failPreviewStage('preview-connected', 'iframe timeout');

    const failed = getPreviewDiagnosticsSnapshot().find(
      (record) => record.stage === 'preview-connected'
    );

    expect(failed).toMatchObject({
      label: 'Preview Connected',
      status: 'failed',
      reason: 'iframe timeout',
    });
  });

  it('can skip any stages left running by a validation watchdog', () => {
    beginPreviewStage('build', 'running next build');
    skipRunningPreviewStages('validation stalled');

    const build = getPreviewDiagnosticsSnapshot().find(
      (record) => record.stage === 'build'
    );

    expect(build).toMatchObject({
      status: 'skipped',
      reason: 'validation stalled',
    });
  });
});
