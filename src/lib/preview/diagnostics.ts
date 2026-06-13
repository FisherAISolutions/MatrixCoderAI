'use client';

import { useEffect, useState } from 'react';
import { pushTerminalLog } from '@/lib/terminal/store';

export type PreviewDiagnosticStage =
  | 'generation'
  | 'import-integrity'
  | 'generated-quality'
  | 'install'
  | 'type-check'
  | 'build'
  | 'dev-server'
  | 'preview-connected';

export type PreviewDiagnosticStatus =
  | 'pending'
  | 'running'
  | 'ok'
  | 'failed'
  | 'skipped';

export interface PreviewDiagnosticRecord {
  stage: PreviewDiagnosticStage;
  label: string;
  status: PreviewDiagnosticStatus;
  startedAt?: string;
  endedAt?: string;
  durationMs?: number;
  reason?: string;
}

const STAGES: Array<{ stage: PreviewDiagnosticStage; label: string }> = [
  { stage: 'generation', label: 'Generation' },
  { stage: 'import-integrity', label: 'Import Integrity' },
  { stage: 'generated-quality', label: 'Generated Quality' },
  { stage: 'install', label: 'Install' },
  { stage: 'type-check', label: 'Type Check' },
  { stage: 'build', label: 'Build' },
  { stage: 'dev-server', label: 'Dev Server' },
  { stage: 'preview-connected', label: 'Preview Connected' },
];

type Listener = (records: PreviewDiagnosticRecord[]) => void;

const records = new Map<PreviewDiagnosticStage, PreviewDiagnosticRecord>();
const listeners = new Set<Listener>();

function nowIso(): string {
  return new Date().toISOString();
}

function durationMs(startedAt?: string, endedAt?: string): number | undefined {
  if (!startedAt || !endedAt) return undefined;
  const duration = Date.parse(endedAt) - Date.parse(startedAt);
  return Number.isFinite(duration) ? Math.max(0, duration) : undefined;
}

function getBaseRecord(stage: PreviewDiagnosticStage): PreviewDiagnosticRecord {
  const meta = STAGES.find((item) => item.stage === stage);
  return (
    records.get(stage) ?? {
      stage,
      label: meta?.label ?? stage,
      status: 'pending',
    }
  );
}

function notify() {
  const snapshot = getPreviewDiagnosticsSnapshot();
  for (const listener of listeners) {
    try {
      listener(snapshot);
    } catch (err) {
      console.warn('[preview-diagnostics] listener threw:', err);
    }
  }
}

function log(record: PreviewDiagnosticRecord, event: 'START' | 'OK' | 'FAILED' | 'SKIPPED') {
  const bits = [
    `[preview-diagnostics] ${record.label} ${event}`,
    `start=${record.startedAt ?? '-'}`,
    `end=${record.endedAt ?? '-'}`,
  ];
  if (typeof record.durationMs === 'number') {
    bits.push(`elapsed=${Math.round(record.durationMs)}ms`);
  }
  if (record.reason) {
    bits.push(`reason="${record.reason.replace(/\s+/g, ' ').slice(0, 500)}"`);
  }
  pushTerminalLog({
    level: event === 'FAILED' ? 'error' : event === 'SKIPPED' ? 'warn' : 'info',
    text: bits.join(' ') + '\n',
    timestamp: Date.now(),
  });
}

function setRecord(record: PreviewDiagnosticRecord) {
  records.set(record.stage, record);
  notify();
}

export function resetPreviewDiagnostics() {
  records.clear();
  for (const item of STAGES) {
    records.set(item.stage, {
      stage: item.stage,
      label: item.label,
      status: 'pending',
    });
  }
  notify();
}

export function beginPreviewStage(stage: PreviewDiagnosticStage, reason?: string) {
  const current = getBaseRecord(stage);
  const next: PreviewDiagnosticRecord = {
    ...current,
    status: 'running',
    startedAt: nowIso(),
    endedAt: undefined,
    durationMs: undefined,
    reason,
  };
  setRecord(next);
  log(next, 'START');
}

export function completePreviewStage(stage: PreviewDiagnosticStage, reason?: string) {
  const current = getBaseRecord(stage);
  const endedAt = nowIso();
  const startedAt = current.startedAt ?? endedAt;
  const next: PreviewDiagnosticRecord = {
    ...current,
    status: 'ok',
    startedAt,
    endedAt,
    durationMs: durationMs(startedAt, endedAt),
    reason,
  };
  setRecord(next);
  log(next, 'OK');
}

export function failPreviewStage(stage: PreviewDiagnosticStage, reason: string) {
  const current = getBaseRecord(stage);
  const endedAt = nowIso();
  const startedAt = current.startedAt ?? endedAt;
  const next: PreviewDiagnosticRecord = {
    ...current,
    status: 'failed',
    startedAt,
    endedAt,
    durationMs: durationMs(startedAt, endedAt),
    reason,
  };
  setRecord(next);
  log(next, 'FAILED');
}

export function skipPreviewStage(stage: PreviewDiagnosticStage, reason: string) {
  const current = getBaseRecord(stage);
  const endedAt = nowIso();
  const startedAt = current.startedAt ?? endedAt;
  const next: PreviewDiagnosticRecord = {
    ...current,
    status: 'skipped',
    startedAt,
    endedAt,
    durationMs: durationMs(startedAt, endedAt),
    reason,
  };
  setRecord(next);
  log(next, 'SKIPPED');
}

export function skipRunningPreviewStages(reason: string) {
  for (const record of getPreviewDiagnosticsSnapshot()) {
    if (record.status === 'running') {
      skipPreviewStage(record.stage, reason);
    }
  }
}

export function getPreviewDiagnosticsSnapshot(): PreviewDiagnosticRecord[] {
  return STAGES.map((item) => getBaseRecord(item.stage));
}

export function subscribePreviewDiagnostics(listener: Listener): () => void {
  listeners.add(listener);
  listener(getPreviewDiagnosticsSnapshot());
  return () => listeners.delete(listener);
}

export function usePreviewDiagnostics(): PreviewDiagnosticRecord[] {
  const [snapshot, setSnapshot] = useState<PreviewDiagnosticRecord[]>(
    getPreviewDiagnosticsSnapshot()
  );

  useEffect(() => subscribePreviewDiagnostics(setSnapshot), []);

  return snapshot;
}
