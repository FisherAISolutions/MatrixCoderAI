import type {
  ChatMessage,
  FileNode,
} from '@/app/chat-workspace/components/types';
import {
  selectProjectExportFiles,
  type ProjectExportFile,
} from '@/lib/deployment/projectZip';
import { flattenTree } from '@/lib/repo/heuristics';

export const DEPLOYMENT_WORKSPACE_SNAPSHOT_KEY =
  'matrix-coder-ai:deployment-workspace-snapshot';

export type DeploymentStatus = 'passed' | 'failed' | 'running' | 'pending' | 'unknown';

export interface DeploymentReadinessChecklist {
  projectGenerated: DeploymentStatus;
  importsValid: DeploymentStatus;
  typeScriptPasses: DeploymentStatus;
  buildPasses: DeploymentStatus;
  runtimeSmokePasses: DeploymentStatus;
  generatedQualityPasses: DeploymentStatus;
  readyForDeployment: DeploymentStatus;
}

export interface DeploymentWorkspaceSnapshot {
  sessionId?: string;
  projectName: string;
  framework: string;
  generationStatus: DeploymentStatus;
  validationStatus: DeploymentStatus;
  buildStatus: DeploymentStatus;
  previewStatus: DeploymentStatus;
  lastGeneratedAt?: string;
  fileCount: number;
  routeCount: number;
  generatedFilePaths: string[];
  exportFiles: ProjectExportFile[];
  checklist: DeploymentReadinessChecklist;
}

interface BuildDeploymentWorkspaceSnapshotOptions {
  sessionId?: string;
  projectName?: string | null;
  files: FileNode[];
  messages: ChatMessage[];
  isGenerating?: boolean;
}

const NEXT_ROUTE_REGEX = /^src\/app\/(?:.+\/)?page\.(?:tsx|ts|jsx|js)$/;

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

function hasProjectFiles(files: FileNode[]): boolean {
  return files.some((file) => {
    const path = normalizePath(file.path);
    return (
      path === 'package.json' ||
      path === 'next.config.mjs' ||
      path === 'next.config.ts' ||
      NEXT_ROUTE_REGEX.test(path)
    );
  });
}

function inferFramework(files: FileNode[]): string {
  const flat = flattenTree(files);
  const paths = new Set(flat.map((file) => normalizePath(file.path)));
  if (
    paths.has('next.config.mjs') ||
    paths.has('next.config.ts') ||
    flat.some((file) => NEXT_ROUTE_REGEX.test(normalizePath(file.path))) ||
    flat.some(
      (file) =>
        normalizePath(file.path) === 'package.json' &&
        typeof file.content === 'string' &&
        /"next"\s*:/.test(file.content)
    )
  ) {
    return 'Next.js';
  }
  return 'Unknown';
}

function inferProjectName(
  explicitName: string | null | undefined,
  files: FileNode[]
): string {
  const trimmed = explicitName?.trim();
  if (trimmed) return trimmed;

  const packageJson = flattenTree(files).find(
    (file) => normalizePath(file.path) === 'package.json'
  );
  if (packageJson?.content) {
    try {
      const parsed = JSON.parse(packageJson.content) as { name?: unknown };
      if (typeof parsed.name === 'string' && parsed.name.trim()) {
        return parsed.name.trim();
      }
    } catch {
      // Ignore malformed package.json and fall back to a neutral label.
    }
  }

  return 'Current Workspace';
}

function latestTimestamp(files: FileNode[], messages: ChatMessage[]): string | undefined {
  const times = [
    ...flattenTree(files)
      .map((file) => file.lastModified)
      .filter((value): value is string => Boolean(value)),
    ...messages
      .map((message) => message.timestamp)
      .filter((value): value is string => Boolean(value)),
  ]
    .map((value) => new Date(value).getTime())
    .filter((value) => Number.isFinite(value));

  if (times.length === 0) return undefined;
  return new Date(Math.max(...times)).toISOString();
}

function setIfMatched(
  content: string,
  current: DeploymentReadinessChecklist,
  preview: { status: DeploymentStatus }
) {
  const validationPassed = /validation passed/i.test(content);

  if (/failed at import integrity|import integrity audit failed/i.test(content)) {
    current.importsValid = 'failed';
  }
  if (/(?:import integrity\s*(?:\u2713|\u2714|ok|passed))|validation passed/i.test(content)) {
    current.importsValid = 'passed';
  }

  if (/failed at type check|type-check failed|typescript failed|error TS\d+/i.test(content)) {
    current.typeScriptPasses = 'failed';
  }
  if (/(?:type check\s*(?:\u2713|\u2714|ok|passed))|tsc.*succeeded|validation passed/i.test(content)) {
    current.typeScriptPasses = 'passed';
  }

  if (/failed at build|build failed|next\.js build worker exited/i.test(content)) {
    current.buildPasses = 'failed';
  }
  if (/(?:build\s*(?:\u2713|\u2714|ok|passed))|next build.*succeeded|validation passed/i.test(content)) {
    current.buildPasses = 'passed';
  }

  if (/runtime smoke test failed|runtime-smoke.*failed|failed at runtime/i.test(content)) {
    current.runtimeSmokePasses = 'failed';
  }
  if (/(?:dev server\s*(?:\u2713|\u2714|ok|passed))|runtime smoke.*green|validation passed/i.test(content)) {
    current.runtimeSmokePasses = 'passed';
  }

  if (/failed at generated quality|generated quality audit failed/i.test(content)) {
    current.generatedQualityPasses = 'failed';
  }
  if (/(?:generated quality\s*(?:\u2713|\u2714|ok|passed))|generated quality audit.*passed|validation passed/i.test(content)) {
    current.generatedQualityPasses = 'passed';
  }

  if (/preview connected\s*(?:\u2713|\u2714|ok|passed)|preview iframe loaded/i.test(content)) {
    preview.status = 'passed';
  } else if (/preview connected\s*(?:x|\u2717|\u2718)|preview failed/i.test(content)) {
    preview.status = 'failed';
  } else if (/preview connected/i.test(content) && validationPassed) {
    preview.status = 'passed';
  }
}

function inferChecklist(
  files: FileNode[],
  messages: ChatMessage[],
  isGenerating = false
): {
  checklist: DeploymentReadinessChecklist;
  previewStatus: DeploymentStatus;
  validationStatus: DeploymentStatus;
} {
  const projectGenerated = hasProjectFiles(flattenTree(files));
  const checklist: DeploymentReadinessChecklist = {
    projectGenerated: projectGenerated ? 'passed' : isGenerating ? 'running' : 'pending',
    importsValid: projectGenerated ? 'unknown' : 'pending',
    typeScriptPasses: projectGenerated ? 'unknown' : 'pending',
    buildPasses: projectGenerated ? 'unknown' : 'pending',
    runtimeSmokePasses: projectGenerated ? 'unknown' : 'pending',
    generatedQualityPasses: projectGenerated ? 'unknown' : 'pending',
    readyForDeployment: 'pending',
  };
  const preview = { status: projectGenerated ? 'unknown' : ('pending' as DeploymentStatus) };

  for (const message of messages) {
    setIfMatched(message.content, checklist, preview);
  }

  const validationSteps: DeploymentStatus[] = [
    checklist.importsValid,
    checklist.typeScriptPasses,
    checklist.buildPasses,
    checklist.runtimeSmokePasses,
    checklist.generatedQualityPasses,
  ];

  let validationStatus: DeploymentStatus = projectGenerated ? 'unknown' : 'pending';
  if (validationSteps.some((status) => status === 'failed')) {
    validationStatus = 'failed';
  } else if (validationSteps.every((status) => status === 'passed')) {
    validationStatus = 'passed';
  } else if (isGenerating) {
    validationStatus = 'running';
  }

  const readySteps: DeploymentStatus[] = [
    checklist.projectGenerated,
    ...validationSteps,
  ];
  checklist.readyForDeployment = readySteps.every((status) => status === 'passed')
    ? 'passed'
    : readySteps.some((status) => status === 'failed')
      ? 'failed'
      : isGenerating
        ? 'running'
        : 'pending';

  return {
    checklist,
    previewStatus: preview.status,
    validationStatus,
  };
}

export function buildDeploymentWorkspaceSnapshot({
  sessionId,
  projectName,
  files,
  messages,
  isGenerating = false,
}: BuildDeploymentWorkspaceSnapshotOptions): DeploymentWorkspaceSnapshot {
  const flat = flattenTree(files);
  const filePaths = flat.map((file) => normalizePath(file.path)).sort();
  const exportFiles = selectProjectExportFiles(flat);
  const routeCount = filePaths.filter((path) => NEXT_ROUTE_REGEX.test(path)).length;
  const { checklist, previewStatus, validationStatus } = inferChecklist(
    files,
    messages,
    isGenerating
  );

  return {
    sessionId,
    projectName: inferProjectName(projectName, files),
    framework: inferFramework(files),
    generationStatus: checklist.projectGenerated,
    validationStatus,
    buildStatus: checklist.buildPasses,
    previewStatus,
    lastGeneratedAt: latestTimestamp(files, messages),
    fileCount: flat.length,
    routeCount,
    generatedFilePaths: filePaths,
    exportFiles,
    checklist,
  };
}

export function saveDeploymentWorkspaceSnapshot(
  snapshot: DeploymentWorkspaceSnapshot
): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(
      DEPLOYMENT_WORKSPACE_SNAPSHOT_KEY,
      JSON.stringify(snapshot)
    );
  } catch {
    const metadataOnly: DeploymentWorkspaceSnapshot = {
      ...snapshot,
      exportFiles: [],
    };
    try {
      window.localStorage.setItem(
        DEPLOYMENT_WORKSPACE_SNAPSHOT_KEY,
        JSON.stringify(metadataOnly)
      );
    } catch {
      // Ignore storage failures; deployment status is helpful but non-critical.
    }
  }
}

export function loadDeploymentWorkspaceSnapshot(): DeploymentWorkspaceSnapshot | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(DEPLOYMENT_WORKSPACE_SNAPSHOT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as DeploymentWorkspaceSnapshot;
  } catch {
    return null;
  }
}
