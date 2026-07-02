import type { ProjectExportFile } from '@/lib/deployment/projectZip';
import type {
  VercelDeploymentResult,
  VercelDeploymentTarget,
  VercelProjectConfig,
} from '@/lib/deployment/vercelIntegration';

export interface VercelUser {
  id: string;
  username?: string;
  email?: string;
  name?: string;
}

export interface VercelProject {
  id: string;
  name: string;
  framework?: string;
  latestDeployments?: Array<{ url?: string; state?: string }>;
}

export interface VercelUploadedFile {
  path: string;
  size: number;
}

export interface VercelCreateDeploymentInput {
  project: VercelProjectConfig;
  files: ProjectExportFile[];
  target: VercelDeploymentTarget;
  teamId?: string;
}

export interface VercelDeploymentStatus {
  id: string;
  url?: string;
  state: 'QUEUED' | 'BUILDING' | 'READY' | 'ERROR' | 'CANCELED' | string;
}

export interface VercelApiClientOptions {
  token: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

export class VercelApiError extends Error {
  readonly status: number;
  readonly details?: string;

  constructor(message: string, status: number, details?: string) {
    super(message);
    this.name = 'VercelApiError';
    this.status = status;
    this.details = details;
  }
}

function normalizeBaseUrl(baseUrl = 'https://api.vercel.com'): string {
  return baseUrl.replace(/\/+$/, '');
}

function createQuery(params: Record<string, string | undefined>): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value?.trim()) query.set(key, value.trim());
  }
  const rendered = query.toString();
  return rendered ? `?${rendered}` : '';
}

function getFetch(fetchImpl?: typeof fetch): typeof fetch {
  if (fetchImpl) return fetchImpl;
  if (typeof fetch !== 'undefined') return fetch;
  throw new VercelApiError('No fetch implementation available.', 0);
}

function safeJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return '[unserializable]';
  }
}

function normalizeRootDirectory(value?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === '.') return undefined;
  const withoutDotSlash = trimmed.replace(/^\.\//, '');
  if (
    !withoutDotSlash ||
    withoutDotSlash.startsWith('/') ||
    withoutDotSlash.includes('../')
  ) {
    return undefined;
  }
  return withoutDotSlash;
}

export function redactToken(token?: string | null): string {
  if (!token) return '[no-token]';
  return `[redacted-token:${token.length}]`;
}

export function redactTokenFromText(text: string, token?: string | null): string {
  if (!token) return text;
  return text.split(token).join(redactToken(token));
}

export function createVercelApiClient({
  token,
  baseUrl,
  fetchImpl,
}: VercelApiClientOptions) {
  const trimmedToken = token.trim();
  if (!trimmedToken) {
    throw new VercelApiError('Vercel token is required.', 0);
  }

  const root = normalizeBaseUrl(baseUrl);
  const runFetch = getFetch(fetchImpl);

  async function request<T>(
    path: string,
    init: RequestInit = {},
    query: Record<string, string | undefined> = {}
  ): Promise<T> {
    const response = await runFetch(`${root}${path}${createQuery(query)}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${trimmedToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const details = redactTokenFromText(await response.text(), trimmedToken);
      throw new VercelApiError(
        `Vercel API request failed with status ${response.status}.`,
        response.status,
        details
      );
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return (await response.json()) as T;
  }

  async function getUser(): Promise<VercelUser> {
    return request<VercelUser>('/v2/user');
  }

  async function validateToken(): Promise<VercelUser> {
    return getUser();
  }

  async function findProject(
    projectName: string,
    teamId?: string
  ): Promise<VercelProject | null> {
    try {
      return await request<VercelProject>(
        `/v9/projects/${encodeURIComponent(projectName)}`,
        undefined,
        { teamId }
      );
    } catch (error) {
      if (error instanceof VercelApiError && error.status === 404) {
        return null;
      }
      throw error;
    }
  }

  async function createProject(
    config: VercelProjectConfig & { teamId?: string }
  ): Promise<VercelProject> {
    return request<VercelProject>('/v10/projects', {
      method: 'POST',
      body: safeJson({
        name: config.projectName,
        framework: config.framework === 'nextjs' ? 'nextjs' : undefined,
        rootDirectory: normalizeRootDirectory(config.rootDirectory),
        buildCommand: config.buildCommand,
        outputDirectory: config.outputDirectory,
      }),
    }, { teamId: config.teamId });
  }

  async function createOrFindProject(
    config: VercelProjectConfig & { teamId?: string }
  ): Promise<VercelProject> {
    const existing = await findProject(config.projectName, config.teamId);
    return existing ?? createProject(config);
  }

  async function uploadDeploymentFiles(
    files: ProjectExportFile[],
    teamId?: string
  ): Promise<VercelUploadedFile[]> {
    return request<VercelUploadedFile[]>('/v2/files', {
      method: 'POST',
      body: safeJson({
        files: files.map((file) => ({
          path: file.path,
          data: file.content,
        })),
      }),
    }, { teamId });
  }

  async function createDeployment({
    project,
    files,
    target,
    teamId,
  }: VercelCreateDeploymentInput): Promise<VercelDeploymentResult> {
    return request<VercelDeploymentResult>('/v13/deployments', {
      method: 'POST',
      body: safeJson({
        name: project.projectName,
        project: project.projectId,
        target,
        files: files.map((file) => ({
          file: file.path,
          data: file.content,
        })),
        projectSettings: {
          framework: project.framework,
          buildCommand: project.buildCommand,
          outputDirectory: project.outputDirectory,
          rootDirectory: normalizeRootDirectory(project.rootDirectory),
        },
      }),
    }, { teamId });
  }

  async function pollDeploymentStatus(
    deploymentId: string,
    teamId?: string
  ): Promise<VercelDeploymentStatus> {
    return request<VercelDeploymentStatus>(
      `/v13/deployments/${encodeURIComponent(deploymentId)}`,
      undefined,
      { teamId }
    );
  }

  return {
    getUser,
    validateToken,
    findProject,
    createProject,
    createOrFindProject,
    uploadDeploymentFiles,
    createDeployment,
    pollDeploymentStatus,
  };
}
