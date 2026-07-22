'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type {
  ChatMessage,
  FileNode,
} from '@/app/chat-workspace/components/types';
import {
  initializeTaskDrivenBuild,
  restoreBuildOrchestrationState,
  runTaskDrivenBuild,
  type BuildOrchestrationEvent,
  type BuildOrchestrationStatus,
} from '@/lib/build-orchestration';
import {
  markGuidedBuildTaskForResume,
  markGuidedBuildTaskForRetry,
  markGuidedBuildTaskSkipped,
} from '@/lib/guided-build';
import {
  checkpointActiveMatrixProject,
  loadMatrixProjectWorkspaceContext,
  loadMatrixProjectWorkspaceSnapshot,
  saveMatrixProjectWorkspaceContext,
  saveMatrixProjectWorkspaceSnapshot,
  type MatrixProjectWorkspaceContext,
  type MatrixProjectWorkspaceSnapshot,
} from '@/lib/projects/projectStore';
import { pushTerminalLog } from '@/lib/terminal/store';

export interface WorkspaceTaskDrivenBuildController {
  available: boolean;
  active: boolean;
  status: BuildOrchestrationStatus | 'unavailable';
  statusMessage: string;
  revision: number;
  start: () => Promise<void>;
  resume: (taskId?: string) => Promise<void>;
  retryTask: (taskId: string) => Promise<void>;
  skipOptionalTask: (taskId: string) => Promise<void>;
  cancel: () => void;
  refresh: () => void;
}

interface UseTaskDrivenBuildOptions {
  sessionId: string;
  projectName?: string;
  files: FileNode[];
  messages: ChatMessage[];
  activeFilePath?: string;
  onApplyFiles: (files: FileNode[]) => Promise<void> | void;
  onStatusChange: (message: string | null) => void;
  onActiveChange: (active: boolean) => void;
  onSystemMessage: (message: string) => void;
}

function validationStatusForEvent(
  event: BuildOrchestrationEvent
): MatrixProjectWorkspaceSnapshot['validationStatus'] {
  if (event.state.status === 'completed') return 'passed';
  if (event.finalValidationResult && !event.finalValidationResult.success) {
    return 'failed';
  }
  if (['validating', 'reviewing', 'running', 'preparing'].includes(event.state.status)) {
    return 'running';
  }
  if (['failed', 'blocked'].includes(event.state.status)) return 'failed';
  return 'pending';
}

function orchestrationMessage(event: BuildOrchestrationEvent): string {
  if (event.type === 'task-started') return `Building: ${event.message}`;
  if (event.type === 'task-finished') return `Task result: ${event.message}`;
  if (event.type === 'final-validation-started') return 'Running full project validation';
  if (event.type === 'contract-review-started') return 'Reviewing Build Contract evidence';
  if (event.type === 'repair-tasks-added') return 'Preparing targeted contract repairs';
  return event.message;
}

export function useTaskDrivenBuild(
  options: UseTaskDrivenBuildOptions
): WorkspaceTaskDrivenBuildController {
  const [context, setContext] = useState<MatrixProjectWorkspaceContext>({});
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState<BuildOrchestrationStatus | 'unavailable'>(
    'unavailable'
  );
  const [statusMessage, setStatusMessage] = useState(
    'Approve a Blueprint before starting a guided build.'
  );
  const [revision, setRevision] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const runTokenRef = useRef<string | null>(null);
  const filesRef = useRef(options.files);
  const messagesRef = useRef(options.messages);
  const activeFilePathRef = useRef(options.activeFilePath);
  const projectNameRef = useRef(options.projectName);

  useEffect(() => {
    filesRef.current = options.files;
  }, [options.files]);
  useEffect(() => {
    messagesRef.current = options.messages;
  }, [options.messages]);
  useEffect(() => {
    activeFilePathRef.current = options.activeFilePath;
  }, [options.activeFilePath]);
  useEffect(() => {
    projectNameRef.current = options.projectName;
  }, [options.projectName]);

  const refresh = useCallback(() => {
    if (typeof window === 'undefined') return;
    const loaded = loadMatrixProjectWorkspaceContext(window.localStorage);
    if (loaded.buildOrchestrationState) {
      loaded.buildOrchestrationState = restoreBuildOrchestrationState(
        loaded.buildOrchestrationState
      );
    }
    setContext(loaded);
    const nextStatus = loaded.buildOrchestrationState?.status;
    setStatus(nextStatus ?? (loaded.buildContract ? 'idle' : 'unavailable'));
    if (nextStatus === 'recoverable-failure') {
      setStatusMessage('The previous build was interrupted and can be resumed safely.');
    } else if (loaded.buildContract && loaded.capabilityResolution) {
      setStatusMessage('Approved plan is ready for bounded task-driven engineering.');
    } else {
      setStatusMessage('Approve a Blueprint before starting a guided build.');
    }
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    refresh();
    return () => {
      runTokenRef.current = null;
      abortRef.current?.abort('Workspace changed');
      abortRef.current = null;
    };
  }, [options.sessionId, refresh]);

  const persistEvent = useCallback(
    async (event: BuildOrchestrationEvent, cloudCheckpoint: boolean) => {
      if (typeof window === 'undefined') return;
      const latest = loadMatrixProjectWorkspaceContext(window.localStorage);
      if (latest.currentProjectId !== event.state.projectId) return;

      const nextContext: MatrixProjectWorkspaceContext = {
        ...latest,
        taskGraph: event.graph,
        repositoryModel: event.repositoryModel,
        engineeringMemory: event.engineeringMemory,
        taskExecutionState: event.taskExecutionState,
        buildOrchestrationState: event.state,
        contractReviewReport: event.contractReviewReport,
      };
      saveMatrixProjectWorkspaceContext(window.localStorage, nextContext);

      const previousSnapshot = loadMatrixProjectWorkspaceSnapshot(
        window.localStorage
      );
      const now = new Date().toISOString();
      const snapshot: MatrixProjectWorkspaceSnapshot = {
        projectId: event.state.projectId,
        name:
          latest.currentProjectName ??
          previousSnapshot?.name ??
          projectNameRef.current ??
          'Matrix Project',
        description: previousSnapshot?.description ?? '',
        files: event.files,
        chatMessages: messagesRef.current,
        buildManifest: latest.buildManifest,
        blueprintDraft: latest.blueprintDraft,
        architectDraft: latest.architectDraft,
        buildContract: latest.buildContract,
        capabilityResolution: latest.capabilityResolution,
        taskGraph: event.graph,
        repositoryModel: event.repositoryModel,
        engineeringMemory: event.engineeringMemory,
        taskExecutionState: event.taskExecutionState,
        buildOrchestrationState: event.state,
        contractReviewReport: event.contractReviewReport,
        intelligenceCore: latest.intelligenceCore,
        changePlan: latest.changePlan,
        validationStatus: validationStatusForEvent(event),
        deploymentStatus: previousSnapshot?.deploymentStatus ?? 'unknown',
        workspaceState: activeFilePathRef.current
          ? { activeFilePath: activeFilePathRef.current }
          : undefined,
        favorite: previousSnapshot?.favorite,
        lastOpenedAt: previousSnapshot?.lastOpenedAt,
        updatedAt: now,
      };
      saveMatrixProjectWorkspaceSnapshot(window.localStorage, snapshot);
      setContext(nextContext);
      setRevision((value) => value + 1);

      if (cloudCheckpoint) {
        const result = await checkpointActiveMatrixProject(snapshot);
        if (result?.saveState === 'conflict' || result?.saveState === 'save-failed') {
          pushTerminalLog({
            level: 'error',
            text: `[task-build] checkpoint ${result.saveState}: ${result.warning ?? 'unknown persistence error'}\n`,
            timestamp: Date.now(),
          });
        }
      }
    },
    []
  );

  const start = useCallback(async () => {
    if (active || typeof window === 'undefined') return;
    const latest = loadMatrixProjectWorkspaceContext(window.localStorage);
    const projectId = latest.currentProjectId?.trim();
    if (!projectId || !latest.buildContract || !latest.capabilityResolution) {
      const message = projectId
        ? 'Approve the Architect plan and Blueprint before starting the build.'
        : 'Open or create a Project before starting the build.';
      setStatus('unavailable');
      setStatusMessage(message);
      options.onSystemMessage(message);
      return;
    }

    abortRef.current?.abort('Superseded by a newer build run');
    const controller = new AbortController();
    abortRef.current = controller;
    const runToken = `${projectId}:${Date.now()}:${Math.random().toString(36).slice(2)}`;
    runTokenRef.current = runToken;
    const initialized = initializeTaskDrivenBuild({
      projectId,
      contract: latest.buildContract,
      capabilityResolution: latest.capabilityResolution,
      files: filesRef.current,
      existingGraph: latest.taskGraph,
      existingRepositoryModel: latest.repositoryModel,
      existingEngineeringMemory: latest.engineeringMemory,
      existingState: latest.buildOrchestrationState,
    });

    setActive(true);
    setStatus('preparing');
    setStatusMessage('Preparing bounded engineering tasks.');
    options.onActiveChange(true);
    options.onStatusChange('Preparing bounded engineering tasks...');

    try {
      const result = await runTaskDrivenBuild({
        ...initialized,
        projectId,
        contract: latest.buildContract,
        capabilityResolution: latest.capabilityResolution,
        signal: controller.signal,
        contractReviewReport: latest.contractReviewReport,
        maxTaskExecutions: Math.max(20, initialized.graph.tasks.length + 10),
        shouldAcceptResult: (guard) => {
          if (runTokenRef.current !== runToken) return false;
          const current = loadMatrixProjectWorkspaceContext(window.localStorage);
          return current.currentProjectId === guard.projectId;
        },
        onEvent: async (event) => {
          if (runTokenRef.current !== runToken) return;
          const message = orchestrationMessage(event);
          setStatus(event.state.status);
          setStatusMessage(message);
          options.onStatusChange(message);
          pushTerminalLog({
            level:
              event.state.status === 'failed' || event.state.status === 'blocked'
                ? 'error'
                : event.state.status === 'recoverable-failure'
                  ? 'warn'
                  : 'info',
            text: `[task-build] ${event.type}: ${message}\n`,
            timestamp: Date.now(),
          });
          if (
            event.type === 'task-finished' &&
            event.taskResult?.appliedChanges.some((change) => change.kind !== 'skip')
          ) {
            filesRef.current = event.files;
            await options.onApplyFiles(event.files);
          }
          await persistEvent(
            event,
            ['checkpoint', 'completed', 'stopped'].includes(event.type)
          );
        },
      });

      if (runTokenRef.current !== runToken) return;
      setStatus(result.state.status);
      setStatusMessage(
        result.state.status === 'completed'
          ? 'Build Contract satisfied. The project is ready for preview and deployment review.'
          : result.state.warnings[0] ??
              result.state.errors[0] ??
              `Build stopped: ${result.stopReason.replace(/-/g, ' ')}.`
      );
      options.onSystemMessage(
        result.state.status === 'completed'
          ? '**Task-driven build complete**\n\nEvery required Build Contract item has evidence. You can now preview the project and review deployment readiness.'
          : `**Guided build paused**\n\n${result.state.warnings[0] ?? result.state.errors[0] ?? result.stopReason.replace(/-/g, ' ')}\n\nCompleted files and passed tasks were preserved.`
      );
    } catch (error) {
      if (controller.signal.aborted) {
        setStatus('cancelled');
        setStatusMessage('Cancelled by user. Completed work was preserved.');
      } else {
        const message = error instanceof Error ? error.message : String(error);
        setStatus('recoverable-failure');
        setStatusMessage(message);
        options.onSystemMessage(
          `**Guided build needs attention**\n\n${message}\n\nCompleted work was preserved. Retry only the failed milestone when ready.`
        );
      }
    } finally {
      if (runTokenRef.current === runToken) {
        runTokenRef.current = null;
        abortRef.current = null;
        setActive(false);
        options.onActiveChange(false);
        options.onStatusChange(null);
        refresh();
      }
    }
  }, [active, options, persistEvent, refresh]);

  const retryTask = useCallback(
    async (taskId: string) => {
      if (typeof window === 'undefined' || active) return;
      const latest = loadMatrixProjectWorkspaceContext(window.localStorage);
      if (!latest.taskGraph) return;
      saveMatrixProjectWorkspaceContext(window.localStorage, {
        ...latest,
        taskGraph: markGuidedBuildTaskForRetry(latest.taskGraph, taskId),
      });
      refresh();
      await start();
    },
    [active, refresh, start]
  );

  const resume = useCallback(
    async (taskId?: string) => {
      if (typeof window === 'undefined' || active) return;
      if (taskId) {
        const latest = loadMatrixProjectWorkspaceContext(window.localStorage);
        if (latest.taskGraph) {
          saveMatrixProjectWorkspaceContext(window.localStorage, {
            ...latest,
            taskGraph: markGuidedBuildTaskForResume(latest.taskGraph, taskId),
          });
        }
      }
      refresh();
      await start();
    },
    [active, refresh, start]
  );

  const skipOptionalTask = useCallback(
    async (taskId: string) => {
      if (typeof window === 'undefined' || active) return;
      const latest = loadMatrixProjectWorkspaceContext(window.localStorage);
      if (!latest.taskGraph) return;
      saveMatrixProjectWorkspaceContext(window.localStorage, {
        ...latest,
        taskGraph: markGuidedBuildTaskSkipped(latest.taskGraph, taskId),
      });
      refresh();
      await start();
    },
    [active, refresh, start]
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort('Cancelled by user');
    setActive(false);
    setStatus('cancelled');
    setStatusMessage('Cancelled by user. Completed work was preserved.');
    options.onActiveChange(false);
    options.onStatusChange('Cancelled by user');
  }, [options]);

  return {
    available: Boolean(
      context.currentProjectId &&
        context.buildContract &&
        context.capabilityResolution
    ),
    active,
    status,
    statusMessage,
    revision,
    start,
    resume,
    retryTask,
    skipOptionalTask,
    cancel,
    refresh,
  };
}
