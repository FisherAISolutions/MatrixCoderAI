'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  Archive,
  ArrowLeft,
  CheckCircle2,
  CircleDashed,
  Cloud,
  Download,
  Globe2,
  Rocket,
  Smartphone,
  XCircle,
} from 'lucide-react';
import {
  loadDeploymentWorkspaceSnapshot,
  type DeploymentStatus,
  type DeploymentWorkspaceSnapshot,
} from '@/lib/deployment/workspaceStatus';
import {
  createProjectZipBlob,
  projectZipFileName,
} from '@/lib/deployment/projectZip';
import {
  createInitialProductionCheckSteps,
  exportFilesToFileNodes,
  productionCheckFromValidationResult,
  type ProductionCheckOverallStatus,
  type ProductionCheckStatus,
  type ProductionCheckStep,
} from '@/lib/deployment/productionCheck';
import {
  getVercelReadiness,
  type VercelReadinessStatus,
} from '@/lib/deployment/vercelReadiness';
import {
  detectVercelEnvironment,
  getVercelConnectionState,
  type VercelConnectionStatus,
} from '@/lib/deployment/vercelIntegration';
import {
  clearVercelLocalConfig,
  getVercelLocalConfigState,
  loadVercelLocalConfig,
  saveVercelLocalConfig,
  type VercelLocalConfig,
  type VercelLocalConfigStatus,
} from '@/lib/deployment/vercelConfig';
import {
  buildVercelDeploymentDryRun,
  type VercelDeploymentDryRunSummary,
} from '@/lib/deployment/vercelDeploymentRequest';
import {
  createOrFindVercelProjectViaServer,
  deployToVercelViaServer,
  testVercelConnectionViaServer,
} from '@/lib/deployment/vercelDeploymentApi';
import {
  loadVercelDeploymentMetadata,
  saveVercelDeploymentMetadata,
} from '@/lib/deployment/vercelDeploymentMetadata';
import type { VercelFlowLogEntry } from '@/lib/deployment/vercelDeploymentFlow';
import {
  getAndroidReadiness,
  type AndroidReadinessStatus,
} from '@/lib/deployment/androidReadiness';
import {
  addDeploymentHistoryEntry,
  loadDeploymentHistory,
  type AddDeploymentHistoryEntryInput,
  type DeploymentHistoryEntry,
  type DeploymentHistoryStatus,
} from '@/lib/deployment/deploymentHistory';
import { runValidation } from '@/lib/validation';

const emptySnapshot: DeploymentWorkspaceSnapshot = {
  projectName: 'Current Workspace',
  framework: 'Unknown',
  generationStatus: 'pending',
  validationStatus: 'pending',
  buildStatus: 'pending',
  previewStatus: 'pending',
  fileCount: 0,
  routeCount: 0,
  generatedFilePaths: [],
  exportFiles: [],
  checklist: {
    projectGenerated: 'pending',
    importsValid: 'pending',
    typeScriptPasses: 'pending',
    buildPasses: 'pending',
    runtimeSmokePasses: 'pending',
    generatedQualityPasses: 'pending',
    readyForDeployment: 'pending',
  },
};

type DownloadStatus = 'Ready' | 'Preparing' | 'Downloaded' | 'Failed';
type VercelLiveStatus =
  | 'Not connected'
  | 'Testing connection'
  | 'Connection OK'
  | 'Project ready'
  | 'Deploying'
  | 'Ready'
  | 'Failed'
  | 'Timed out';

const deploymentOptions = [
  {
    title: 'Web Export',
    description:
      'Prepare the current generated workspace as a production-ready web build package.',
    status: 'Coming soon',
    icon: Globe2,
    accent: 'text-matrix-blue',
  },
  {
    title: 'Vercel Deployment',
    description:
      'Connect a Vercel account and launch the selected Next.js project from Matrix Coder AI.',
    status: 'Not connected yet',
    icon: Cloud,
    accent: 'text-matrix-green',
  },
  {
    title: 'Android / Capacitor',
    description:
      'Package the generated project for Android when mobile export is enabled.',
    status: 'Coming soon',
    icon: Smartphone,
    accent: 'text-matrix-purple',
  },
  {
    title: 'Project Files / Download',
    description:
      'Export the generated source files as a portable project archive for local development.',
    status: 'Coming soon',
    icon: Download,
    accent: 'text-matrix-amber',
  },
];

const checklistItems: Array<{
  key: keyof DeploymentWorkspaceSnapshot['checklist'];
  label: string;
}> = [
  { key: 'projectGenerated', label: 'Project generated' },
  { key: 'importsValid', label: 'Imports valid' },
  { key: 'typeScriptPasses', label: 'TypeScript passes' },
  { key: 'buildPasses', label: 'Build passes' },
  { key: 'runtimeSmokePasses', label: 'Runtime smoke passes' },
  { key: 'generatedQualityPasses', label: 'Generated quality passes' },
  { key: 'readyForDeployment', label: 'Ready for deployment' },
];

function statusLabel(status: DeploymentStatus): string {
  switch (status) {
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'running':
      return 'Running';
    case 'pending':
      return 'Pending';
    default:
      return 'Unknown';
  }
}

function statusClasses(status: DeploymentStatus): string {
  switch (status) {
    case 'passed':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'failed':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'running':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'pending':
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-card';
  }
}

function StatusPill({ status }: { status: DeploymentStatus }) {
  return (
    <span
      className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${statusClasses(status)}`}
    >
      {statusLabel(status)}
    </span>
  );
}

function productionStatusClasses(status: ProductionCheckStatus | ProductionCheckOverallStatus): string {
  switch (status) {
    case 'passed':
    case 'Passed':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'failed':
    case 'Failed':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'running':
    case 'Running':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'skipped':
      return 'border-matrix-amber text-matrix-amber bg-matrix-amber/10';
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function productionStatusLabel(status: ProductionCheckStatus): string {
  switch (status) {
    case 'not-run':
      return 'Not run';
    case 'running':
      return 'Running';
    case 'passed':
      return 'Passed';
    case 'failed':
      return 'Failed';
    case 'skipped':
      return 'Skipped';
  }
}

function vercelStatusClasses(status: VercelReadinessStatus): string {
  switch (status) {
    case 'Ready to connect':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Failed production check':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'Needs production check':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Not ready':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function vercelConnectionStatusClasses(status: VercelConnectionStatus): string {
  switch (status) {
    case 'Ready to connect':
    case 'Connected':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Missing Vercel token':
      return 'border-matrix-amber text-matrix-amber bg-matrix-amber/10';
    case 'Not connected':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function vercelLocalConfigStatusClasses(status: VercelLocalConfigStatus): string {
  switch (status) {
    case 'Ready for future deployment':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Configured locally':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Missing token':
      return 'border-matrix-amber text-matrix-amber bg-matrix-amber/10';
    case 'Not configured':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function androidStatusClasses(status: AndroidReadinessStatus): string {
  switch (status) {
    case 'Ready to configure':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Failed production check':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'Needs production check':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Not ready':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
  }
}

function historyStatusClasses(status: DeploymentHistoryStatus): string {
  switch (status) {
    case 'Ready':
    case 'Passed':
      return 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost';
    case 'Failed':
      return 'border-red-400/60 text-red-200 bg-red-500/10';
    case 'Running':
      return 'border-matrix-blue text-matrix-blue bg-matrix-blue/10';
    case 'Not ready':
      return 'border-matrix-border text-matrix-green-muted bg-matrix-bg';
    case 'Info':
    default:
      return 'border-matrix-border text-matrix-green-muted bg-matrix-card';
  }
}

function ChecklistIcon({ status }: { status: DeploymentStatus }) {
  if (status === 'passed') {
    return <CheckCircle2 size={17} className="text-matrix-green-bright" />;
  }
  if (status === 'failed') {
    return <XCircle size={17} className="text-red-300" />;
  }
  return <CircleDashed size={17} className="text-matrix-green-muted" />;
}

function formatDate(value?: string): string {
  if (!value) return 'Not available yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not available yet';
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function DeploymentCenterClient() {
  const [snapshot, setSnapshot] =
    useState<DeploymentWorkspaceSnapshot>(emptySnapshot);
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>('Ready');
  const [productionStatus, setProductionStatus] =
    useState<ProductionCheckOverallStatus>('Not run');
  const [productionSteps, setProductionSteps] = useState<ProductionCheckStep[]>(
    () => createInitialProductionCheckSteps()
  );
  const [productionMessage, setProductionMessage] = useState<string | null>(null);
  const [historyEntries, setHistoryEntries] = useState<DeploymentHistoryEntry[]>(
    []
  );
  const [vercelConfig, setVercelConfig] = useState<VercelLocalConfig | null>(
    null
  );
  const [vercelConfigOpen, setVercelConfigOpen] = useState(false);
  const [vercelTokenInput, setVercelTokenInput] = useState('');
  const [vercelTeamIdInput, setVercelTeamIdInput] = useState('');
  const [vercelProjectNameInput, setVercelProjectNameInput] = useState('');
  const [vercelDeployDryRun, setVercelDeployDryRun] =
    useState<VercelDeploymentDryRunSummary | null>(null);
  const [vercelRuntimeToken, setVercelRuntimeToken] = useState('');
  const [vercelLiveStatus, setVercelLiveStatus] =
    useState<VercelLiveStatus>('Not connected');
  const [vercelLiveMessage, setVercelLiveMessage] = useState<string | null>(
    null
  );
  const [vercelProjectId, setVercelProjectId] = useState<string | null>(null);
  const [vercelDeploymentUrl, setVercelDeploymentUrl] = useState<string | null>(
    null
  );
  const [vercelProductionUrl, setVercelProductionUrl] = useState<string | null>(
    null
  );
  const [vercelLastDeploymentAt, setVercelLastDeploymentAt] = useState<
    string | null
  >(null);
  const [vercelDeploymentLogs, setVercelDeploymentLogs] = useState<
    VercelFlowLogEntry[]
  >([]);
  const [vercelActionBusy, setVercelActionBusy] = useState(false);
  const readinessHistoryKeys = useRef(new Set<string>());

  useEffect(() => {
    const refresh = () => {
      const currentSnapshot = loadDeploymentWorkspaceSnapshot() ?? emptySnapshot;
      setSnapshot(currentSnapshot);
      setHistoryEntries(loadDeploymentHistory());
      const loadedConfig = loadVercelLocalConfig();
      setVercelConfig(loadedConfig);
      setVercelTeamIdInput(loadedConfig?.teamId ?? '');
      setVercelProjectNameInput(loadedConfig?.projectName ?? '');
      const metadata = loadVercelDeploymentMetadata(currentSnapshot.projectName);
      if (metadata) {
        setVercelProjectId(metadata.projectId ?? null);
        setVercelDeploymentUrl(metadata.deploymentUrl ?? null);
        setVercelProductionUrl(metadata.productionUrl ?? null);
        setVercelLastDeploymentAt(metadata.lastDeploymentTime);
        setVercelDeploymentLogs(metadata.logs);
        setVercelLiveStatus(
          metadata.status === 'ready'
            ? 'Ready'
            : metadata.status === 'timeout'
              ? 'Timed out'
              : 'Failed'
        );
      }
    };
    refresh();
    window.addEventListener('storage', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('storage', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, []);

  const ready = snapshot.checklist.readyForDeployment === 'passed';
  const exportFiles = snapshot.exportFiles ?? [];
  const canDownload = exportFiles.length > 0 && downloadStatus !== 'Preparing';
  const vercelReadiness = getVercelReadiness({
    hasProjectFiles: exportFiles.length > 0,
    productionStatus,
  });
  const vercelEnvironment = detectVercelEnvironment();
  const runtimeTokenAvailable = Boolean(
    vercelRuntimeToken.trim() || vercelTokenInput.trim()
  );
  const effectiveVercelEnvironment = {
    ...vercelEnvironment,
    hasToken:
      vercelEnvironment.hasToken ||
      runtimeTokenAvailable ||
      Boolean(vercelConfig?.tokenConfigured),
  };
  const vercelConnection = getVercelConnectionState({
    environment: effectiveVercelEnvironment,
    readinessStatus: vercelReadiness.status,
  });
  const vercelLocalConfigState = getVercelLocalConfigState({
    config: vercelConfig,
    environment: vercelEnvironment,
    readinessStatus: vercelReadiness.status,
  });
  const androidReadiness = getAndroidReadiness({
    hasProjectFiles: exportFiles.length > 0,
    framework: snapshot.framework,
    productionStatus,
  });
  const projectDescriptor =
    snapshot.framework === 'Unknown'
      ? snapshot.projectName
      : `${snapshot.projectName} (${snapshot.framework})`;
  const canRunVercelAction = !vercelActionBusy;
  const canDeployToVercel =
    canRunVercelAction &&
    Boolean(vercelConfig?.tokenConfigured) &&
    productionStatus === 'Passed' &&
    exportFiles.length > 0;

  function recordHistory(input: AddDeploymentHistoryEntryInput) {
    setHistoryEntries(addDeploymentHistoryEntry(input));
  }

  function handleOpenVercelConfig() {
    setVercelConfigOpen((open) => !open);
    recordHistory({
      action: 'Vercel connect opened',
      status: 'Info',
      details: 'Opened the local-only Vercel configuration panel.',
    });
  }

  function handleSaveVercelConfig() {
    const token = vercelTokenInput.trim();
    const tokenPlaceholder =
      token || vercelRuntimeToken || vercelConfig?.tokenConfigured
        ? 'configured'
        : '';
    const config = saveVercelLocalConfig({
      tokenPlaceholder,
      teamId: vercelTeamIdInput,
      projectName: vercelProjectNameInput || snapshot.projectName,
    });
    if (token) {
      setVercelRuntimeToken(token);
    }
    setVercelConfig(config);
    setVercelTokenInput('');
    setVercelTeamIdInput(config.teamId ?? '');
    setVercelProjectNameInput(config.projectName ?? '');
    setVercelDeployDryRun(null);
    recordHistory({
      action: 'Vercel config saved',
      status: config.tokenConfigured ? 'Ready' : 'Not ready',
      details:
        'Saved local Vercel settings. Token text is kept only in memory for this session.',
    });
  }

  function handleClearVercelConfig() {
    clearVercelLocalConfig();
    setVercelConfig(null);
    setVercelRuntimeToken('');
    setVercelTokenInput('');
    setVercelTeamIdInput('');
    setVercelProjectNameInput('');
    setVercelDeployDryRun(null);
    setVercelLiveStatus('Not connected');
    setVercelLiveMessage(null);
    setVercelProjectId(null);
    setVercelDeploymentUrl(null);
    setVercelProductionUrl(null);
    setVercelLastDeploymentAt(null);
    setVercelDeploymentLogs([]);
    recordHistory({
      action: 'Vercel config cleared',
      status: 'Info',
      details: 'Removed local Vercel settings from this browser session.',
    });
  }

  function createAndStoreVercelDryRun() {
    const dryRun = buildVercelDeploymentDryRun({
      snapshot,
      config: vercelConfig,
      productionStatus,
    });
    setVercelDeployDryRun(dryRun);
    return dryRun;
  }

  function handlePreviewVercelDeployRequest() {
    const dryRun = createAndStoreVercelDryRun();
    recordHistory({
      action: 'Vercel deploy request previewed',
      status: dryRun.deploymentAllowed ? 'Ready' : 'Not ready',
      details: dryRun.deploymentAllowed
        ? `${dryRun.fileCount} files prepared for ${dryRun.projectName}. No upload was performed.`
        : dryRun.blockingReasons.join(' '),
    });
  }

  function getVercelActionToken(action: string): string | null {
    const token = vercelRuntimeToken.trim() || vercelTokenInput.trim();
    if (token) {
      setVercelRuntimeToken(token);
      setVercelTokenInput('');
      return token;
    }

    const details =
      'Enter and save a Vercel token in this session before running this action.';
    setVercelLiveStatus('Failed');
    setVercelLiveMessage(details);
    recordHistory({
      action,
      status: 'Failed',
      details,
    });
    return null;
  }

  function handleVercelActionError(action: string, error: unknown) {
    const details =
      error instanceof Error ? error.message : 'Vercel action failed.';
    setVercelLiveStatus('Failed');
    setVercelLiveMessage(details);
    recordHistory({
      action,
      status: 'Failed',
      details,
    });
  }

  async function handleTestVercelConnection() {
    if (vercelActionBusy) return;
    const token = getVercelActionToken('Vercel connection test failed');
    if (!token) return;

    setVercelActionBusy(true);
    setVercelLiveStatus('Testing connection');
    setVercelLiveMessage('Testing Vercel connection...');
    recordHistory({
      action: 'Vercel connection test started',
      status: 'Running',
      details: 'Checking the configured Vercel token.',
    });

    try {
      const result = await testVercelConnectionViaServer(token);
      setVercelDeploymentLogs(result.logs);
      setVercelLiveStatus(result.success ? 'Connection OK' : 'Failed');
      setVercelLiveMessage(
        result.success
          ? `Connected as ${result.user?.email ?? result.user?.username ?? result.user?.id}.`
          : result.error ?? 'Vercel connection failed.'
      );
      recordHistory({
        action: result.success
          ? 'Vercel connection test passed'
          : 'Vercel connection test failed',
        status: result.success ? 'Passed' : 'Failed',
        details: result.success
          ? 'Vercel token was accepted.'
          : result.error ?? 'Vercel connection failed.',
      });
    } catch (error) {
      handleVercelActionError('Vercel connection test failed', error);
    } finally {
      setVercelActionBusy(false);
    }
  }

  async function handleCreateOrFindVercelProject() {
    if (vercelActionBusy) return;
    const token = getVercelActionToken('Vercel project preparation failed');
    if (!token) return;

    const dryRun = createAndStoreVercelDryRun();
    if (!dryRun.deploymentAllowed) {
      const details = dryRun.blockingReasons.join(' ');
      setVercelLiveStatus('Failed');
      setVercelLiveMessage(details);
      recordHistory({
        action: 'Vercel project preparation failed',
        status: 'Failed',
        details,
      });
      return;
    }

    setVercelActionBusy(true);
    setVercelLiveStatus('Deploying');
    setVercelLiveMessage('Creating or finding Vercel project...');
    recordHistory({
      action: 'Vercel project preparation started',
      status: 'Running',
      details: `Preparing project ${dryRun.projectName}.`,
    });

    try {
      const result = await createOrFindVercelProjectViaServer(token, dryRun);
      setVercelDeploymentLogs(result.logs);
      setVercelLiveStatus(result.success ? 'Project ready' : 'Failed');
      setVercelLiveMessage(
        result.success
          ? `Project ready: ${result.project?.name}.`
          : result.error ?? 'Vercel project preparation failed.'
      );
      setVercelProjectId(result.project?.id ?? null);
      recordHistory({
        action: result.success
          ? 'Vercel project ready'
          : 'Vercel project preparation failed',
        status: result.success ? 'Ready' : 'Failed',
        details: result.success
          ? `Project ${result.project?.name} is ready.`
          : result.error ?? 'Vercel project preparation failed.',
      });
    } catch (error) {
      handleVercelActionError('Vercel project preparation failed', error);
    } finally {
      setVercelActionBusy(false);
    }
  }

  async function handleDeployToVercel() {
    if (vercelActionBusy) return;
    const token = getVercelActionToken('Vercel deployment failed');
    if (!token) return;

    const dryRun = createAndStoreVercelDryRun();
    if (!dryRun.deploymentAllowed) {
      const details = dryRun.blockingReasons.join(' ');
      setVercelLiveStatus('Failed');
      setVercelLiveMessage(details);
      recordHistory({
        action: 'Vercel deployment blocked',
        status: 'Failed',
        details,
      });
      return;
    }

    setVercelActionBusy(true);
    setVercelLiveStatus('Deploying');
    setVercelLiveMessage('Deploying to Vercel...');
    setVercelDeploymentLogs([]);
    recordHistory({
      action: 'Vercel deployment started',
      status: 'Running',
      details: `${dryRun.fileCount} files will be uploaded for ${dryRun.projectName}.`,
    });

    try {
      const result = await deployToVercelViaServer(token, dryRun);
      setVercelDeploymentLogs(result.logs);
      setVercelLiveStatus(
        result.status === 'ready'
          ? 'Ready'
          : result.status === 'timeout'
            ? 'Timed out'
            : 'Failed'
      );
      setVercelLiveMessage(
        result.success
          ? 'Vercel deployment is ready.'
          : result.error ?? 'Vercel deployment failed.'
      );
      setVercelProjectId(result.projectId ?? vercelProjectId);
      setVercelDeploymentUrl(result.deploymentUrl ?? null);
      setVercelProductionUrl(result.productionUrl ?? null);
      setVercelLastDeploymentAt(result.lastDeploymentTime);
      saveVercelDeploymentMetadata({
        projectName: result.projectName,
        projectId: result.projectId,
        deploymentId: result.deploymentId,
        deploymentUrl: result.deploymentUrl,
        productionUrl: result.productionUrl,
        status: result.status,
        lastDeploymentTime: result.lastDeploymentTime,
        logs: result.logs,
      });
      recordHistory({
        action: result.success
          ? 'Vercel deployment ready'
          : 'Vercel deployment failed',
        status: result.success
          ? 'Passed'
          : result.status === 'timeout'
            ? 'Not ready'
            : 'Failed',
        details: result.success
          ? result.productionUrl ?? 'Vercel deployment completed.'
          : result.error ?? 'Vercel deployment failed.',
      });
    } catch (error) {
      handleVercelActionError('Vercel deployment failed', error);
    } finally {
      setVercelActionBusy(false);
    }
  }

  useEffect(() => {
    const key = `vercel:${vercelReadiness.status}:${vercelReadiness.message}`;
    if (readinessHistoryKeys.current.has(key)) return;
    readinessHistoryKeys.current.add(key);
    recordHistory({
      action: 'Vercel readiness checked',
      status:
        vercelReadiness.status === 'Ready to connect'
          ? 'Ready'
          : vercelReadiness.status === 'Failed production check'
            ? 'Failed'
            : 'Not ready',
      details: `${vercelReadiness.status}: ${vercelReadiness.message}`,
    });
  }, [vercelReadiness.message, vercelReadiness.status]);

  useEffect(() => {
    const key = `android:${androidReadiness.status}:${androidReadiness.message}`;
    if (readinessHistoryKeys.current.has(key)) return;
    readinessHistoryKeys.current.add(key);
    recordHistory({
      action: 'Android readiness checked',
      status:
        androidReadiness.status === 'Ready to configure'
          ? 'Ready'
          : androidReadiness.status === 'Failed production check'
            ? 'Failed'
            : 'Not ready',
      details: `${androidReadiness.status}: ${androidReadiness.message}`,
    });
  }, [androidReadiness.message, androidReadiness.status]);

  const handleDownloadProject = async () => {
    if (!canDownload) return;
    setDownloadStatus('Preparing');
    try {
      const blob = await createProjectZipBlob(exportFiles);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = projectZipFileName(snapshot.projectName);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setDownloadStatus('Downloaded');
      recordHistory({
        action: 'ZIP downloaded',
        status: 'Passed',
        details: `${exportFiles.length} files exported as ${projectZipFileName(
          snapshot.projectName
        )}.`,
      });
    } catch (error) {
      console.error('Project ZIP export failed:', error);
      setDownloadStatus('Failed');
      recordHistory({
        action: 'ZIP downloaded',
        status: 'Failed',
        details:
          error instanceof Error ? error.message : 'Project ZIP export failed.',
      });
    }
  };

  const handleProductionCheck = async () => {
    if (exportFiles.length === 0 || productionStatus === 'Running') return;
    setProductionStatus('Running');
    setProductionSteps(createInitialProductionCheckSteps('running'));
    setProductionMessage('Running production readiness check...');
    recordHistory({
      action: 'Production check started',
      status: 'Running',
      details: 'Running install, type check, build, runtime smoke, and quality checks.',
    });

    try {
      const result = await runValidation(exportFilesToFileNodes(exportFiles), {
        runtimeSmoke: true,
        requirements: '',
        onStatus: (label) => setProductionMessage(label),
      });
      const summary = productionCheckFromValidationResult(result);
      setProductionStatus(summary.status);
      setProductionSteps(summary.steps);
      setProductionMessage(summary.message ?? null);
      recordHistory({
        action:
          summary.status === 'Passed'
            ? 'Production check passed'
            : 'Production check failed',
        status: summary.status === 'Passed' ? 'Passed' : 'Failed',
        details: summary.message ?? 'Production readiness check completed.',
      });
    } catch (error) {
      setProductionStatus('Failed');
      setProductionSteps((steps) =>
        steps.map((step) =>
          step.status === 'running' ? { ...step, status: 'failed' } : step
        )
      );
      setProductionMessage(
        error instanceof Error ? error.message : 'Production check failed.'
      );
      recordHistory({
        action: 'Production check failed',
        status: 'Failed',
        details:
          error instanceof Error ? error.message : 'Production check failed.',
      });
    }
  };

  return (
    <main className="h-screen overflow-y-auto bg-matrix-bg text-matrix-green">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-5 py-6 sm:px-8 lg:px-10">
        <header className="mb-8 flex flex-col gap-5 border-b border-matrix-border pb-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-11 w-11 items-center justify-center border border-matrix-green bg-matrix-green-ghost text-matrix-green shadow-neon-sm">
              <Rocket size={20} />
            </div>
            <div>
              <p className="mb-2 text-[10px] uppercase tracking-[0.42em] text-matrix-green-muted">
                Matrix Coder AI
              </p>
              <h1 className="text-3xl font-bold tracking-wide text-matrix-green-bright sm:text-4xl">
                Deployment Center
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                Deployment readiness for {projectDescriptor}. Vercel deployment
                is guarded by local config and production checks.
              </p>
            </div>
          </div>

          <Link
            href="/chat-workspace"
            className="inline-flex w-fit items-center gap-2 border border-matrix-border px-3 py-2 text-xs uppercase tracking-[0.28em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green"
          >
            <ArrowLeft size={13} />
            Workspace
          </Link>
        </header>

        <section className="mb-6 grid gap-4 border border-matrix-border bg-matrix-card/80 p-4 shadow-neon-sm md:grid-cols-4">
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Project
            </p>
            <p className="mt-2 text-lg font-semibold text-matrix-green-bright">
              {snapshot.projectName}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Framework
            </p>
            <p className="mt-2 text-lg font-semibold text-matrix-green-bright">
              {snapshot.framework}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Files
            </p>
            <p className="mt-2 text-lg font-semibold text-matrix-green-bright">
              {snapshot.fileCount} files / {snapshot.routeCount} routes
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
              Last Generated
            </p>
            <p className="mt-2 text-sm font-semibold leading-6 text-matrix-green-bright">
              {formatDate(snapshot.lastGeneratedAt)}
            </p>
          </div>
        </section>

        <section className="mb-6 grid gap-4 md:grid-cols-4">
          {[
            ['Generation', snapshot.generationStatus],
            ['Validation', snapshot.validationStatus],
            ['Build', snapshot.buildStatus],
            ['Preview', snapshot.previewStatus],
          ].map(([label, status]) => (
            <article
              key={label}
              className="border border-matrix-border bg-matrix-card p-4 shadow-neon-sm"
            >
              <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                {label}
              </p>
              <StatusPill status={status as DeploymentStatus} />
            </article>
          ))}
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Deployment Readiness
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                {ready ? 'Ready when deployment is enabled' : 'Checks still pending'}
              </h2>
            </div>
            <StatusPill status={snapshot.checklist.readyForDeployment} />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {checklistItems.map((item) => {
              const status = snapshot.checklist[item.key];
              return (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-3 border border-matrix-border bg-matrix-bg/70 px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <ChecklistIcon status={status} />
                    <span className="text-sm font-medium text-matrix-green-bright">
                      {item.label}
                    </span>
                  </div>
                  <StatusPill status={status} />
                </div>
              );
            })}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Production Build Check
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Run readiness validation before export or deploy
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                Uses the existing Matrix Coder validation pipeline against the
                current generated project files. Nothing is deployed.
              </p>
              {productionMessage && (
                <p className="mt-3 text-xs leading-5 text-matrix-green-muted">
                  {productionMessage}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${productionStatusClasses(productionStatus)}`}
              >
                {productionStatus}
              </span>
              <button
                type="button"
                onClick={handleProductionCheck}
                disabled={exportFiles.length === 0 || productionStatus === 'Running'}
                className="inline-flex items-center justify-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
              >
                <Rocket size={14} />
                Run Production Check
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-5">
            {productionSteps.map((step) => (
              <div
                key={step.key}
                className="border border-matrix-border bg-matrix-bg/70 p-3"
                title={step.message}
              >
                <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  {step.label}
                </p>
                <span
                  className={`inline-flex items-center border px-2 py-1 text-[10px] uppercase tracking-[0.18em] ${productionStatusClasses(step.status)}`}
                >
                  {productionStatusLabel(step.status)}
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Vercel Deployment
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Prepare this project for Vercel
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                {vercelReadiness.message}
              </p>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-matrix-green-muted">
                {vercelConnection.message}
              </p>
              <p className="mt-2 max-w-2xl text-xs leading-5 text-matrix-green-muted">
                {vercelLocalConfigState.message}
              </p>
              {vercelLiveMessage && (
                <p className="mt-2 max-w-2xl text-xs leading-5 text-matrix-green-bright">
                  {vercelLiveMessage}
                </p>
              )}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${vercelStatusClasses(vercelReadiness.status)}`}
              >
                {vercelReadiness.status}
              </span>
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${vercelConnectionStatusClasses(vercelConnection.status)}`}
              >
                {vercelConnection.status}
              </span>
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${vercelLocalConfigStatusClasses(vercelLocalConfigState.status)}`}
              >
                {vercelLocalConfigState.status}
              </span>
              <button
                type="button"
                onClick={handleOpenVercelConfig}
                disabled={!canRunVercelAction}
                className="inline-flex items-center justify-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20"
              >
                <Cloud size={14} />
                Connect Vercel
              </button>
              <button
                type="button"
                onClick={handlePreviewVercelDeployRequest}
                disabled={!canRunVercelAction}
                className="inline-flex items-center justify-center gap-2 border border-matrix-border bg-matrix-bg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green-bright"
              >
                <Archive size={14} />
                Preview Deploy Request
              </button>
              <button
                type="button"
                onClick={handleTestVercelConnection}
                disabled={!canRunVercelAction}
                className="inline-flex items-center justify-center gap-2 border border-matrix-blue bg-matrix-blue/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-blue transition-colors hover:bg-matrix-blue/20 disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
              >
                Test Connection
              </button>
              <button
                type="button"
                onClick={handleCreateOrFindVercelProject}
                disabled={!canRunVercelAction}
                className="inline-flex items-center justify-center gap-2 border border-matrix-border bg-matrix-bg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-muted transition-colors hover:border-matrix-green hover:text-matrix-green-bright disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
              >
                Create / Find Project
              </button>
              <button
                type="button"
                onClick={handleDeployToVercel}
                disabled={!canDeployToVercel}
                className="inline-flex items-center justify-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
              >
                Deploy to Vercel
              </button>
            </div>
          </div>

          {vercelConfigOpen && (
            <div className="mb-5 border border-matrix-border bg-matrix-bg/70 p-4">
              <div className="mb-4">
                <p className="text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                  Local Vercel Config
                </p>
                <p className="mt-2 text-sm leading-6 text-matrix-green-muted">
                  This stores settings in this browser session only. Matrix Coder
                  keeps token text in memory only and sends it only to Vercel
                  when you run a guarded Vercel action.
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                    Vercel token
                  </span>
                  <input
                    type="password"
                    value={vercelTokenInput}
                    onChange={(event) => setVercelTokenInput(event.target.value)}
                    placeholder={
                      vercelConfig?.tokenConfigured
                        ? 'Token configured for this session'
                        : 'Paste Vercel token'
                    }
                    className="w-full border border-matrix-border bg-matrix-card px-3 py-2 text-sm text-matrix-green-bright outline-none transition-colors placeholder:text-matrix-green-muted/70 focus:border-matrix-green"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                    Team ID
                  </span>
                  <input
                    type="text"
                    value={vercelTeamIdInput}
                    onChange={(event) => setVercelTeamIdInput(event.target.value)}
                    placeholder="team_..."
                    className="w-full border border-matrix-border bg-matrix-card px-3 py-2 text-sm text-matrix-green-bright outline-none transition-colors placeholder:text-matrix-green-muted/70 focus:border-matrix-green"
                  />
                </label>
                <label className="block">
                  <span className="mb-2 block text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                    Project name
                  </span>
                  <input
                    type="text"
                    value={vercelProjectNameInput}
                    onChange={(event) =>
                      setVercelProjectNameInput(event.target.value)
                    }
                    placeholder={snapshot.projectName}
                    className="w-full border border-matrix-border bg-matrix-card px-3 py-2 text-sm text-matrix-green-bright outline-none transition-colors placeholder:text-matrix-green-muted/70 focus:border-matrix-green"
                  />
                </label>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={handleSaveVercelConfig}
                  className="inline-flex items-center justify-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20"
                >
                  Save local config
                </button>
                <button
                  type="button"
                  onClick={handleClearVercelConfig}
                  className="inline-flex items-center justify-center gap-2 border border-matrix-border bg-matrix-bg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-muted transition-colors hover:border-red-400/60 hover:text-red-200"
                >
                  Clear Vercel config
                </button>
              </div>
            </div>
          )}

          {vercelDeployDryRun && (
            <div className="mb-5 border border-matrix-border bg-matrix-bg/70 p-4">
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                    Vercel Deploy Request Dry Run
                  </p>
                  <p className="mt-2 text-sm leading-6 text-matrix-green-muted">
                    This is the package Matrix Coder would prepare for Vercel.
                    No files were uploaded and no Vercel API call was made.
                  </p>
                </div>
                <span
                  className={`inline-flex w-fit items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${
                    vercelDeployDryRun.deploymentAllowed
                      ? 'border-matrix-green text-matrix-green-bright bg-matrix-green-ghost'
                      : 'border-matrix-amber text-matrix-amber bg-matrix-amber/10'
                  }`}
                >
                  {vercelDeployDryRun.deploymentAllowed
                    ? 'Would deploy'
                    : 'Blocked'}
                </span>
              </div>

              <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
                {[
                  ['Project', vercelDeployDryRun.projectName],
                  ['Files', String(vercelDeployDryRun.fileCount)],
                  ['Routes', String(vercelDeployDryRun.routeCount)],
                  ['Framework', vercelDeployDryRun.framework],
                  ['Production check', vercelDeployDryRun.productionCheckStatus],
                  [
                    'Allowed',
                    vercelDeployDryRun.deploymentAllowed ? 'Yes' : 'No',
                  ],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="border border-matrix-border bg-matrix-card p-3"
                  >
                    <p className="mb-2 text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
                      {label}
                    </p>
                    <p className="text-sm font-semibold leading-6 text-matrix-green-bright">
                      {value}
                    </p>
                  </div>
                ))}
              </div>

              {vercelDeployDryRun.blockingReasons.length > 0 && (
                <div className="mt-4 border border-matrix-amber/60 bg-matrix-amber/10 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.24em] text-matrix-amber">
                    Blocking reasons
                  </p>
                  <ul className="space-y-1 text-sm leading-6 text-matrix-green-muted">
                    {vercelDeployDryRun.blockingReasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {[
              ['Vercel project name', vercelConfig?.projectName ?? 'Not configured yet'],
              ['Vercel project ID', vercelProjectId ?? 'Not available yet'],
              ['Team ID', vercelConfig?.teamId ?? 'Not configured yet'],
              ['Deployment status', vercelLiveStatus],
              ['Production URL', vercelProductionUrl ?? 'Not available yet'],
              ['Deployment URL', vercelDeploymentUrl ?? 'Not available yet'],
              ['Last deployment time', formatDate(vercelLastDeploymentAt ?? undefined)],
              [
                'Token status',
                vercelRuntimeToken
                  ? 'Token available in this session'
                  : vercelConfig?.tokenConfigured || vercelEnvironment.hasToken
                    ? 'Token metadata configured; re-enter token after refresh'
                  : 'Missing token',
              ],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-matrix-border bg-matrix-bg/70 p-4"
              >
                <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  {label}
                </p>
                <p className="text-sm font-semibold leading-6 text-matrix-green-bright">
                  {value}
                </p>
              </div>
            ))}
          </div>

          {vercelDeploymentLogs.length > 0 && (
            <div className="mt-5 border border-matrix-border bg-matrix-bg/70 p-4">
              <p className="mb-3 text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                Deployment logs
              </p>
              <div className="space-y-2">
                {vercelDeploymentLogs.slice(-8).map((entry, index) => (
                  <div
                    key={`${entry.timestamp}-${index}`}
                    className="grid gap-2 border border-matrix-border bg-matrix-card p-3 text-xs leading-5 md:grid-cols-[150px_80px_1fr]"
                  >
                    <span className="text-matrix-green-muted">
                      {formatDate(entry.timestamp)}
                    </span>
                    <span className="uppercase tracking-[0.18em] text-matrix-green-bright">
                      {entry.level}
                    </span>
                    <span className="text-matrix-green-muted">{entry.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Android / Capacitor
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Prepare this project for Android
              </h2>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-matrix-green-muted">
                {androidReadiness.message}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <span
                className={`inline-flex items-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.22em] ${androidStatusClasses(androidReadiness.status)}`}
              >
                {androidReadiness.status}
              </span>
              <button
                type="button"
                disabled
                className="inline-flex cursor-not-allowed items-center justify-center gap-2 border border-matrix-border bg-matrix-bg px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-muted"
              >
                <Smartphone size={14} />
                Configure Android - Coming next
              </button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
            {[
              ['App name', snapshot.projectName],
              ['App ID / package name', 'Not configured yet'],
              ['Android project path', 'Not generated yet'],
              ['APK / AAB status', 'No Android build yet'],
              ['Last Android build time', 'No builds yet'],
            ].map(([label, value]) => (
              <div
                key={label}
                className="border border-matrix-border bg-matrix-bg/70 p-4"
              >
                <p className="mb-3 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                  {label}
                </p>
                <p className="text-sm font-semibold leading-6 text-matrix-green-bright">
                  {value}
                </p>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-6 border border-matrix-border bg-matrix-card p-5 shadow-neon-sm">
          <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-[0.34em] text-matrix-green-muted">
                Deployment Activity
              </p>
              <h2 className="mt-2 text-xl font-bold tracking-wide text-matrix-green-bright">
                Recent actions
              </h2>
            </div>
            <span className="border border-matrix-border bg-matrix-bg px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
              Session history
            </span>
          </div>

          {historyEntries.length === 0 ? (
            <div className="border border-matrix-border bg-matrix-bg/70 p-4 text-sm text-matrix-green-muted">
              No Deployment Center actions have been recorded in this session.
            </div>
          ) : (
            <div className="space-y-3">
              {historyEntries.slice(0, 8).map((entry) => (
                <div
                  key={entry.id}
                  className="grid gap-3 border border-matrix-border bg-matrix-bg/70 p-4 md:grid-cols-[160px_1fr_auto]"
                >
                  <p className="text-xs leading-5 text-matrix-green-muted">
                    {formatDate(entry.timestamp)}
                  </p>
                  <div>
                    <p className="text-sm font-semibold text-matrix-green-bright">
                      {entry.action}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-matrix-green-muted">
                      {entry.details}
                    </p>
                  </div>
                  <span
                    className={`inline-flex h-fit items-center justify-center border px-2.5 py-1 text-[10px] uppercase tracking-[0.2em] ${historyStatusClasses(entry.status)}`}
                  >
                    {entry.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="grid flex-1 gap-4 md:grid-cols-2">
          {deploymentOptions.map((option) => {
            const Icon = option.icon;
            const isDownloadOption = option.title === 'Project Files / Download';
            const optionStatus = isDownloadOption
              ? exportFiles.length > 0
                ? downloadStatus
                : 'No project files'
              : option.status;
            return (
              <article
                key={option.title}
                className="flex min-h-[220px] flex-col justify-between border border-matrix-border bg-matrix-card p-5 shadow-neon-sm transition-colors hover:border-matrix-green"
              >
                <div>
                  <div className="mb-5 flex items-center justify-between gap-4">
                    <div
                      className={`flex h-10 w-10 items-center justify-center border border-current bg-matrix-green-ghost ${option.accent}`}
                    >
                      <Icon size={19} />
                    </div>
                    <span className="border border-matrix-border bg-matrix-bg px-2.5 py-1 text-[10px] uppercase tracking-[0.24em] text-matrix-green-muted">
                      {optionStatus}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold tracking-wide text-matrix-green-bright">
                    {option.title}
                  </h2>
                  <p className="mt-3 text-sm leading-6 text-matrix-green-muted">
                    {option.description}
                  </p>
                  {isDownloadOption && (
                    <button
                      type="button"
                      onClick={handleDownloadProject}
                      disabled={!canDownload}
                      className="mt-5 inline-flex items-center gap-2 border border-matrix-green bg-matrix-green-ghost px-3 py-2 text-xs font-semibold uppercase tracking-[0.22em] text-matrix-green-bright transition-colors hover:bg-matrix-green/20 disabled:cursor-not-allowed disabled:border-matrix-border disabled:bg-matrix-bg disabled:text-matrix-green-muted"
                    >
                      <Download size={14} />
                      Download Project ZIP
                    </button>
                  )}
                </div>

                <div className="mt-6 flex items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-matrix-green-muted">
                  <Archive size={12} />
                  {isDownloadOption
                    ? `${exportFiles.length} exportable files`
                    : ready
                      ? 'Project checks passed'
                      : 'Waiting on readiness checks'}
                </div>
              </article>
            );
          })}
        </section>
      </section>
    </main>
  );
}
