import { describe, expect, it } from 'vitest';
import {
  DEPLOYMENT_HISTORY_KEY,
  addDeploymentHistoryEntry,
  limitDeploymentHistory,
  loadDeploymentHistory,
  parseDeploymentHistory,
  type DeploymentHistoryEntry,
} from '@/lib/deployment/deploymentHistory';

function memoryStorage(initial?: string) {
  const values = new Map<string, string>();
  if (initial !== undefined) values.set(DEPLOYMENT_HISTORY_KEY, initial);
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

function entry(id: string, timestamp: string): DeploymentHistoryEntry {
  return {
    id,
    timestamp,
    action: id,
    status: 'Info',
    details: `${id} details`,
  };
}

describe('deployment history helpers', () => {
  it('returns an empty list for missing or malformed history', () => {
    expect(parseDeploymentHistory(null)).toEqual([]);
    expect(parseDeploymentHistory('{bad json')).toEqual([]);
    expect(parseDeploymentHistory(JSON.stringify({ nope: true }))).toEqual([]);
  });

  it('loads valid entries from storage', () => {
    const storage = memoryStorage(
      JSON.stringify([entry('zip', '2026-06-28T12:00:00.000Z')])
    );

    expect(loadDeploymentHistory(storage)).toMatchObject([
      {
        action: 'zip',
        status: 'Info',
      },
    ]);
  });

  it('adds new entries and persists newest first', () => {
    const storage = memoryStorage(
      JSON.stringify([entry('old', '2026-06-28T12:00:00.000Z')])
    );

    const next = addDeploymentHistoryEntry(
      {
        action: 'ZIP downloaded',
        status: 'Passed',
        details: 'Downloaded project.zip',
        timestamp: '2026-06-28T12:01:00.000Z',
      },
      storage
    );

    expect(next.map((item) => item.action)).toEqual([
      'ZIP downloaded',
      'old',
    ]);
    expect(JSON.parse(storage.getItem(DEPLOYMENT_HISTORY_KEY) ?? '[]')).toHaveLength(2);
  });

  it('limits history length', () => {
    const many = Array.from({ length: 25 }, (_, idx) =>
      entry(`event-${idx}`, `2026-06-28T12:${String(idx).padStart(2, '0')}:00.000Z`)
    );

    expect(limitDeploymentHistory(many)).toHaveLength(20);
    expect(limitDeploymentHistory(many)[0].id).toBe('event-24');
  });
});
