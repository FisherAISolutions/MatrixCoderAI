import type { ProjectExportFile } from '@/lib/deployment/projectZip';
import type { VercelReadinessStatus } from '@/lib/deployment/vercelReadiness';

export type VercelConnectionStatus =
  | 'Missing Vercel token'
  | 'Not connected'
  | 'Ready to connect'
  | 'Connected';

export type VercelDeploymentTarget = 'preview' | 'production';

export interface VercelEnvironmentStatus {
  hasToken: boolean;
  tokenSource?: 'VERCEL_TOKEN' | 'NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED';
}

export interface VercelProjectConfig {
  projectName: string;
  framework: 'nextjs' | 'unknown';
  rootDirectory?: string;
  buildCommand?: string;
  outputDirectory?: string;
  projectId?: string;
  productionUrl?: string;
}

export interface VercelDeploymentLogEntry {
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  message: string;
}

export interface VercelDeploymentRequest {
  project: VercelProjectConfig;
  files: ProjectExportFile[];
  target: VercelDeploymentTarget;
  requestedAt: string;
}

export interface VercelDeploymentResult {
  success: boolean;
  status: 'queued' | 'building' | 'ready' | 'failed' | 'skipped';
  deploymentId?: string;
  productionUrl?: string;
  logs: VercelDeploymentLogEntry[];
  error?: string;
}

export interface VercelConnectionStateInput {
  environment: VercelEnvironmentStatus;
  readinessStatus: VercelReadinessStatus;
  connected?: boolean;
}

export interface VercelConnectionState {
  status: VercelConnectionStatus;
  disabled: boolean;
  message: string;
}

type VercelEnv = Record<string, string | undefined>;

function defaultEnv(): VercelEnv {
  if (typeof process === 'undefined') return {};
  return {
    VERCEL_TOKEN: process.env.VERCEL_TOKEN,
    NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED:
      process.env.NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED,
  };
}

export function detectVercelEnvironment(
  env: VercelEnv = defaultEnv()
): VercelEnvironmentStatus {
  if (env.VERCEL_TOKEN?.trim()) {
    return {
      hasToken: true,
      tokenSource: 'VERCEL_TOKEN',
    };
  }

  if (env.NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED === 'true') {
    return {
      hasToken: true,
      tokenSource: 'NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED',
    };
  }

  return {
    hasToken: false,
  };
}

export function getVercelConnectionState({
  environment,
  readinessStatus,
  connected = false,
}: VercelConnectionStateInput): VercelConnectionState {
  if (!environment.hasToken) {
    return {
      status: 'Missing Vercel token',
      disabled: true,
      message:
        'Add a Vercel token environment variable before enabling Vercel connection.',
    };
  }

  if (connected) {
    return {
      status: 'Connected',
      disabled: true,
      message: 'Vercel connection is already configured.',
    };
  }

  if (readinessStatus !== 'Ready to connect') {
    return {
      status: 'Not connected',
      disabled: true,
      message: 'Run and pass the Production Build Check before connecting Vercel.',
    };
  }

  return {
    status: 'Ready to connect',
    disabled: true,
    message:
      'Vercel token is detected and the project is ready. Live connection is coming next.',
  };
}
