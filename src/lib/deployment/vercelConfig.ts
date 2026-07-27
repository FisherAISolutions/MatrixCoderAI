import type { VercelEnvironmentStatus } from '@/lib/deployment/vercelIntegration';
import type { VercelReadinessStatus } from '@/lib/deployment/vercelReadiness';

export const VERCEL_LOCAL_CONFIG_KEY = 'matrix-coder-ai:vercel-local-config';

export type VercelLocalConfigStatus =
  | 'Not configured'
  | 'Configured locally'
  | 'Missing token'
  | 'Ready for future deployment';

export interface VercelLocalConfig {
  /** @deprecated Credentials are server-side; retained only for old snapshot parsing. */
  tokenConfigured?: boolean;
  /** @deprecated Team ownership is configured by VERCEL_TEAM_ID on the server. */
  teamId?: string;
  projectName?: string;
  rootDirectory?: string;
  savedAt: string;
}

export interface SaveVercelLocalConfigInput {
  /** @deprecated Ignored. Never store browser-provided credentials. */
  tokenPlaceholder?: string;
  /** @deprecated Ignored. Team ownership is server-controlled. */
  teamId?: string;
  projectName?: string;
  rootDirectory?: string;
  savedAt?: string;
}

export interface VercelLocalConfigStateInput {
  config: VercelLocalConfig | null;
  environment: VercelEnvironmentStatus;
  readinessStatus: VercelReadinessStatus;
}

export interface VercelLocalConfigState {
  status: VercelLocalConfigStatus;
  message: string;
}

type ConfigStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function getSessionStorage(): ConfigStorage | null {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage;
}

function cleanOptional(value?: string): string | undefined {
  const trimmed = value?.trim();
  return trimmed || undefined;
}

function hasConfigDetails(config: VercelLocalConfig | null): boolean {
  return Boolean(config?.projectName || config?.rootDirectory);
}

export function createVercelLocalConfig({
  projectName,
  rootDirectory,
  savedAt = new Date().toISOString(),
}: SaveVercelLocalConfigInput): VercelLocalConfig {
  return {
    projectName: cleanOptional(projectName),
    rootDirectory: cleanOptional(rootDirectory),
    savedAt,
  };
}

export function parseVercelLocalConfig(raw: string | null): VercelLocalConfig | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<VercelLocalConfig>;
    if (!parsed || typeof parsed !== 'object') return null;
    if (typeof parsed.savedAt !== 'string') return null;
    return {
      projectName: cleanOptional(parsed.projectName),
      rootDirectory: cleanOptional(parsed.rootDirectory),
      savedAt: parsed.savedAt,
    };
  } catch {
    return null;
  }
}

export function loadVercelLocalConfig(
  storage: ConfigStorage | null = getSessionStorage()
): VercelLocalConfig | null {
  if (!storage) return null;
  return parseVercelLocalConfig(storage.getItem(VERCEL_LOCAL_CONFIG_KEY));
}

export function saveVercelLocalConfig(
  input: SaveVercelLocalConfigInput,
  storage: ConfigStorage | null = getSessionStorage()
): VercelLocalConfig {
  const config = createVercelLocalConfig(input);
  if (storage) {
    storage.setItem(VERCEL_LOCAL_CONFIG_KEY, JSON.stringify(config));
  }
  return config;
}

export function clearVercelLocalConfig(
  storage: ConfigStorage | null = getSessionStorage()
): void {
  storage?.removeItem(VERCEL_LOCAL_CONFIG_KEY);
}

export function getVercelLocalConfigState({
  config,
  environment,
  readinessStatus,
}: VercelLocalConfigStateInput): VercelLocalConfigState {
  const tokenAvailable = environment.hasToken;

  if (!hasConfigDetails(config)) {
    return {
      status: 'Not configured',
      message:
        'Save the Vercel project name and optional validated root override when you are ready.',
    };
  }

  if (!tokenAvailable) {
    return {
      status: 'Missing token',
      message:
        'Configure VERCEL_TOKEN on the Matrix Coder server before deployment.',
    };
  }

  if (readinessStatus === 'Ready to connect') {
    return {
      status: 'Ready for future deployment',
      message: 'Local Vercel settings are saved and the project is ready.',
    };
  }

  return {
    status: 'Configured locally',
    message: 'Local Vercel settings are saved. Run Production Build Check next.',
  };
}
