import type { FileLanguage, FileNode } from '@/app/chat-workspace/components/types';
import type { ProjectExportFile } from '@/lib/deployment/projectZip';
import type {
  StepResult,
  ValidationResult,
  ValidationStep,
} from '@/lib/validation';

export type ProductionCheckStatus =
  | 'not-run'
  | 'running'
  | 'passed'
  | 'failed'
  | 'skipped';

export type ProductionCheckOverallStatus =
  | 'Not run'
  | 'Running'
  | 'Passed'
  | 'Failed';

export type ProductionCheckKey =
  | 'install'
  | 'type-check'
  | 'build'
  | 'runtime-smoke'
  | 'generated-quality';

export interface ProductionCheckStep {
  key: ProductionCheckKey;
  label: string;
  status: ProductionCheckStatus;
  message?: string;
}

export interface ProductionCheckSummary {
  status: ProductionCheckOverallStatus;
  steps: ProductionCheckStep[];
  message?: string;
}

const PRODUCTION_STEPS: Array<{
  key: ProductionCheckKey;
  label: string;
  validationStep: ValidationStep;
}> = [
  { key: 'install', label: 'Install', validationStep: 'install' },
  { key: 'type-check', label: 'Type check', validationStep: 'type-check' },
  { key: 'build', label: 'Build', validationStep: 'build' },
  { key: 'runtime-smoke', label: 'Runtime smoke', validationStep: 'runtime-smoke' },
  {
    key: 'generated-quality',
    label: 'Generated quality',
    validationStep: 'generated-quality',
  },
];

function languageForPath(path: string): FileLanguage {
  if (path.endsWith('.tsx') || path.endsWith('.ts')) return 'typescript';
  if (path.endsWith('.jsx') || path.endsWith('.js') || path.endsWith('.mjs')) {
    return 'javascript';
  }
  if (path.endsWith('.css')) return 'css';
  if (path.endsWith('.json')) return 'json';
  if (path.endsWith('.md')) return 'markdown';
  if (path.endsWith('.yml') || path.endsWith('.yaml')) return 'yaml';
  return 'unknown';
}

export function exportFilesToFileNodes(files: ProjectExportFile[]): FileNode[] {
  return files.map((file) => ({
    id: file.path,
    name: file.path.split('/').pop() ?? file.path,
    path: file.path,
    type: 'file',
    language: languageForPath(file.path),
    content: file.content,
    size: file.content.length,
    lastModified: new Date().toISOString(),
  }));
}

export function createInitialProductionCheckSteps(
  status: ProductionCheckStatus = 'not-run'
): ProductionCheckStep[] {
  return PRODUCTION_STEPS.map((step) => ({
    key: step.key,
    label: step.label,
    status,
  }));
}

function stepStatus(step?: StepResult): ProductionCheckStatus {
  if (!step) return 'not-run';
  if (step.status === 'ok') return 'passed';
  if (step.status === 'failed') return 'failed';
  return 'skipped';
}

function stepMessage(step?: StepResult): string | undefined {
  if (!step) return undefined;
  if (step.infrastructureError) return step.infrastructureError;
  if (step.errors[0]?.message) return step.errors[0].message;
  if (step.status === 'skipped' && step.log) return step.log;
  return undefined;
}

export function productionCheckFromValidationResult(
  result: ValidationResult
): ProductionCheckSummary {
  const steps = PRODUCTION_STEPS.map((target) => {
    const validationStep = result.steps.find(
      (step) => step.step === target.validationStep
    );
    return {
      key: target.key,
      label: target.label,
      status: stepStatus(validationStep),
      message: stepMessage(validationStep),
    };
  });

  const allPassed = steps.every((step) => step.status === 'passed');
  const message = result.skipReason ?? result.errors[0]?.message;

  return {
    status: result.success && allPassed ? 'Passed' : 'Failed',
    steps,
    message,
  };
}
