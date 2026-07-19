export interface WorkflowStep {
  id: string;
  label: string;
  href: string;
  description: string;
}

export interface WorkflowContext {
  hasProject?: boolean;
  hasArchitectDraft?: boolean;
  hasBuildManifest?: boolean;
  hasBlueprintDraft?: boolean;
  hasGeneratedProject?: boolean;
  deploymentReady?: boolean;
}

export const MATRIX_CODER_WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    href: '/dashboard',
    description: 'Choose where to start.',
  },
  {
    id: 'projects',
    label: 'Projects',
    href: '/projects',
    description: 'Create, save, or reopen a project.',
  },
  {
    id: 'architect',
    label: 'Architect',
    href: '/matrix-ai-architect',
    description: 'Gather requirements and create a structured app specification.',
  },
  {
    id: 'blueprint',
    label: 'Blueprint',
    href: '/blueprint-studio',
    description: 'Review or edit the app plan before generation.',
  },
  {
    id: 'workspace',
    label: 'Workspace',
    href: '/chat-workspace',
    description: 'Generate, edit, validate, and preview the app.',
  },
  {
    id: 'deployment',
    label: 'Deployment',
    href: '/deployment-center',
    description: 'Export, production-check, and prepare deployment.',
  },
];

export function normalizeWorkflowPath(pathname: string): string {
  const path = pathname.split('?')[0]?.split('#')[0] || '/';
  if (path !== '/' && path.endsWith('/')) return path.slice(0, -1);
  return path;
}

export function getWorkflowStepByPath(pathname: string): WorkflowStep | null {
  const normalized = normalizeWorkflowPath(pathname);
  return (
    MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.href === normalized) ?? null
  );
}

export function getWorkflowNeighbors(pathname: string): {
  current: WorkflowStep | null;
  previous: WorkflowStep | null;
  next: WorkflowStep | null;
} {
  const current = getWorkflowStepByPath(pathname);
  if (!current) {
    return { current: null, previous: null, next: null };
  }
  const index = MATRIX_CODER_WORKFLOW_STEPS.findIndex(
    (step) => step.id === current.id
  );
  return {
    current,
    previous: MATRIX_CODER_WORKFLOW_STEPS[index - 1] ?? null,
    next: MATRIX_CODER_WORKFLOW_STEPS[index + 1] ?? null,
  };
}

export function getContinueBuildTarget(context: WorkflowContext): WorkflowStep {
  if (context.deploymentReady || context.hasGeneratedProject) {
    return MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.id === 'deployment')!;
  }
  if (context.hasBlueprintDraft) {
    return MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.id === 'workspace')!;
  }
  if (context.hasArchitectDraft) {
    return MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.id === 'blueprint')!;
  }
  if (context.hasBuildManifest) {
    return MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.id === 'blueprint')!;
  }
  if (context.hasProject) {
    return MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.id === 'architect')!;
  }
  return MATRIX_CODER_WORKFLOW_STEPS.find((step) => step.id === 'projects')!;
}
