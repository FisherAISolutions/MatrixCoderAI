export const DEPLOYMENT_HISTORY_KEY = 'matrix-coder-ai:deployment-history';
export const MAX_DEPLOYMENT_HISTORY_ITEMS = 20;

export type DeploymentHistoryStatus =
  | 'Ready'
  | 'Running'
  | 'Passed'
  | 'Failed'
  | 'Not ready'
  | 'Info';

export interface DeploymentHistoryEntry {
  id: string;
  timestamp: string;
  action: string;
  status: DeploymentHistoryStatus;
  details: string;
}

export interface AddDeploymentHistoryEntryInput {
  action: string;
  status: DeploymentHistoryStatus;
  details: string;
  timestamp?: string;
}

type HistoryStorage = Pick<Storage, 'getItem' | 'setItem'>;

function getSessionStorage(): HistoryStorage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function createEntry({
  action,
  status,
  details,
  timestamp = new Date().toISOString(),
}: AddDeploymentHistoryEntryInput): DeploymentHistoryEntry {
  return {
    id: `${timestamp}:${action}:${status}`,
    timestamp,
    action,
    status,
    details,
  };
}

export function limitDeploymentHistory(
  entries: DeploymentHistoryEntry[],
  maxItems = MAX_DEPLOYMENT_HISTORY_ITEMS
): DeploymentHistoryEntry[] {
  return entries
    .slice()
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, maxItems);
}

export function parseDeploymentHistory(
  raw: string | null
): DeploymentHistoryEntry[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return limitDeploymentHistory(
      parsed.filter((entry): entry is DeploymentHistoryEntry => {
        if (!entry || typeof entry !== 'object') return false;
        const candidate = entry as Partial<DeploymentHistoryEntry>;
        return (
          typeof candidate.id === 'string' &&
          typeof candidate.timestamp === 'string' &&
          typeof candidate.action === 'string' &&
          typeof candidate.status === 'string' &&
          typeof candidate.details === 'string'
        );
      })
    );
  } catch {
    return [];
  }
}

export function loadDeploymentHistory(
  storage: HistoryStorage | null = getSessionStorage()
): DeploymentHistoryEntry[] {
  if (!storage) return [];
  return parseDeploymentHistory(storage.getItem(DEPLOYMENT_HISTORY_KEY));
}

export function addDeploymentHistoryEntry(
  input: AddDeploymentHistoryEntryInput,
  storage: HistoryStorage | null = getSessionStorage()
): DeploymentHistoryEntry[] {
  const next = limitDeploymentHistory([
    createEntry(input),
    ...loadDeploymentHistory(storage),
  ]);

  if (storage) {
    storage.setItem(DEPLOYMENT_HISTORY_KEY, JSON.stringify(next));
  }

  return next;
}
