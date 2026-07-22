import type { FileNode } from '@/app/chat-workspace/components/types';
import {
  createTaskValidationRunner,
  type TaskExecutionValidationRunner,
  type ValidationEngineRunner,
} from '@/lib/task-execution';
import type {
  ParsedError,
  StepResult,
  ValidationOptions,
  ValidationResult,
  ValidationStep,
} from '@/lib/validation';
import { parseValidationOutput, stripAnsi } from '@/lib/validation/errorParser';
import { promises as fs } from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { writeGeneratedFilesToWorkspace } from './nodeWorkspace';

type NodeValidationCommandStatus = 'ok' | 'failed' | 'timed-out' | 'cancelled';

export interface NodeValidationCommandResult {
  status: NodeValidationCommandStatus;
  exitCode?: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface NodeValidationCommand {
  command: string;
  args: string[];
  cwd: string;
  timeoutMs: number;
  signal?: AbortSignal;
}

export type NodeValidationCommandRunner = (
  command: NodeValidationCommand
) => Promise<NodeValidationCommandResult>;

export interface NodeCliTaskValidationOptions {
  workspacePath: string;
  requirements?: string;
  runBroadChecks?: boolean;
  commandRunner?: NodeValidationCommandRunner;
  installTimeoutMs?: number;
  commandTimeoutMs?: number;
}

const DEFAULT_INSTALL_TIMEOUT_MS = 8 * 60 * 1000;
const DEFAULT_COMMAND_TIMEOUT_MS = 4 * 60 * 1000;

function nowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function validationResult(options: {
  success: boolean;
  skipped?: boolean;
  skipReason?: string;
  steps: StepResult[];
  startedAt: number;
}): ValidationResult {
  return {
    success: options.success,
    skipped: options.skipped ?? false,
    skipReason: options.skipReason,
    steps: options.steps,
    errors: options.steps.flatMap((step) => step.errors),
    combinedLog: options.steps.map((step) => step.log).join('\n'),
    durationMs: Math.max(0, nowMs() - options.startedAt),
  };
}

function makeStep(options: {
  step: ValidationStep;
  status: StepResult['status'];
  command?: string;
  result?: NodeValidationCommandResult;
  startedAt?: number;
  infrastructureError?: string;
}): StepResult {
  const rawLog = [options.result?.stdout, options.result?.stderr].filter(Boolean).join('\n');
  const log = stripAnsi(
    [options.command ? `$ ${options.command}` : '', rawLog, options.infrastructureError]
      .filter(Boolean)
      .join('\n')
  );
  const errorSource =
    options.step === 'type-check'
      ? 'typescript'
      : options.step === 'build' || options.step === 'runtime-smoke'
        ? 'nextjs'
        : 'unknown';
  const errors = options.result && options.status === 'failed'
    ? parseValidationOutput(log, errorSource)
    : [];

  return {
    step: options.step,
    status: options.status,
    exitCode: options.result?.exitCode,
    durationMs:
      options.result?.durationMs ??
      (options.startedAt ? Math.max(0, nowMs() - options.startedAt) : 0),
    errors,
    log,
    infrastructureError: options.infrastructureError,
  };
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readPackageJson(workspacePath: string): Promise<{
  scripts: Record<string, string>;
  packageManager?: string;
} | null> {
  const packagePath = path.join(workspacePath, 'package.json');
  try {
    const parsed = JSON.parse(await fs.readFile(packagePath, 'utf8')) as {
      scripts?: Record<string, string>;
      packageManager?: string;
    };
    return {
      scripts: parsed.scripts ?? {},
      packageManager: parsed.packageManager,
    };
  } catch {
    return null;
  }
}

async function detectPackageManager(workspacePath: string, packageManager?: string): Promise<'npm' | 'yarn' | 'pnpm'> {
  if (packageManager?.startsWith('pnpm')) return 'pnpm';
  if (packageManager?.startsWith('yarn')) return 'yarn';
  if (packageManager?.startsWith('npm')) return 'npm';
  if (await pathExists(path.join(workspacePath, 'pnpm-lock.yaml'))) return 'pnpm';
  if (await pathExists(path.join(workspacePath, 'yarn.lock'))) return 'yarn';
  return 'npm';
}

function commandForPackageManager(
  packageManager: 'npm' | 'yarn' | 'pnpm',
  action: 'install' | 'type-check' | 'build',
  scripts: Record<string, string>
): { command: string; args: string[] } | null {
  if (action === 'install') {
    if (packageManager === 'pnpm') return { command: 'pnpm', args: ['install'] };
    if (packageManager === 'yarn') return { command: 'yarn', args: ['install'] };
    return { command: 'npm', args: ['install', '--no-audit', '--no-fund'] };
  }

  const script = action === 'type-check' ? 'type-check' : 'build';
  if (!scripts[script]) return null;
  if (packageManager === 'pnpm') return { command: 'pnpm', args: ['run', script] };
  if (packageManager === 'yarn') return { command: 'yarn', args: [script] };
  return { command: 'npm', args: ['run', script] };
}

export const defaultNodeValidationCommandRunner: NodeValidationCommandRunner = (
  command
) =>
  new Promise((resolve) => {
    const startedAt = nowMs();
    const child = spawn(command.command, command.args, {
      cwd: command.cwd,
      shell: process.platform === 'win32',
      windowsHide: true,
      env: {
        ...process.env,
        CI: '1',
        NEXT_TELEMETRY_DISABLED: '1',
      },
    });
    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (result: Omit<NodeValidationCommandResult, 'durationMs'>) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      command.signal?.removeEventListener('abort', onAbort);
      resolve({
        ...result,
        stdout,
        stderr,
        durationMs: Math.max(0, nowMs() - startedAt),
      });
    };

    const killChild = () => {
      try {
        child.kill('SIGTERM');
      } catch {
        // Ignore best-effort cleanup failures.
      }
    };

    const onAbort = () => {
      killChild();
      finish({ status: 'cancelled', stdout, stderr });
    };

    const timeout = setTimeout(() => {
      killChild();
      finish({
        status: 'timed-out',
        stdout,
        stderr: `${stderr}\nCommand timed out after ${Math.round(command.timeoutMs / 1000)}s.`,
      });
    }, command.timeoutMs);

    command.signal?.addEventListener('abort', onAbort, { once: true });
    if (command.signal?.aborted) {
      onAbort();
      return;
    }

    child.stdout?.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', (chunk) => {
      stderr += String(chunk);
    });
    child.on('error', (error) => {
      stderr += `\n${error.message}`;
      finish({ status: 'failed', stdout, stderr });
    });
    child.on('close', (code) => {
      finish({
        status: code === 0 ? 'ok' : 'failed',
        exitCode: code ?? undefined,
        stdout,
        stderr,
      });
    });
  });

async function runWithTimeout(
  runner: NodeValidationCommandRunner,
  command: NodeValidationCommand
): Promise<NodeValidationCommandResult> {
  const startedAt = nowMs();
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: NodeValidationCommandResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      command.signal?.removeEventListener('abort', onAbort);
      resolve(result);
    };
    const onAbort = () =>
      finish({
        status: 'cancelled',
        stdout: '',
        stderr: 'Command cancelled.',
        durationMs: Math.max(0, nowMs() - startedAt),
      });
    const timeout = setTimeout(() => {
      finish({
        status: 'timed-out',
        stdout: '',
        stderr: `Command timed out after ${Math.round(command.timeoutMs / 1000)}s.`,
        durationMs: Math.max(0, nowMs() - startedAt),
      });
    }, command.timeoutMs);

    command.signal?.addEventListener('abort', onAbort, { once: true });
    if (command.signal?.aborted) {
      onAbort();
      return;
    }

    runner(command).then(finish, (error) =>
      finish({
        status: 'failed',
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        durationMs: Math.max(0, nowMs() - startedAt),
      })
    );
  });
}

function stepStatusFromCommand(result: NodeValidationCommandResult): StepResult['status'] {
  if (result.status === 'ok') return 'ok';
  return result.status === 'cancelled' ? 'skipped' : 'failed';
}

export function createNodeCliValidationEngineRunner(
  options: NodeCliTaskValidationOptions
): ValidationEngineRunner {
  const runner = options.commandRunner ?? defaultNodeValidationCommandRunner;
  const installTimeoutMs = options.installTimeoutMs ?? DEFAULT_INSTALL_TIMEOUT_MS;
  const commandTimeoutMs = options.commandTimeoutMs ?? DEFAULT_COMMAND_TIMEOUT_MS;

  return async (files: FileNode[], validationOptions: ValidationOptions) => {
    const startedAt = nowMs();
    const steps: StepResult[] = [];

    if (validationOptions.signal?.aborted) {
      return validationResult({
        success: false,
        skipped: true,
        skipReason: 'Cancelled by user',
        steps,
        startedAt,
      });
    }

    await writeGeneratedFilesToWorkspace({
      files,
      workspacePath: options.workspacePath,
    });

    const packageJson = await readPackageJson(options.workspacePath);
    if (!packageJson) {
      steps.push(
        makeStep({
          step: validationOptions.typeCheckOnly ? 'type-check' : 'build',
          status: 'failed',
          infrastructureError: 'package.json is missing or unreadable in the isolated benchmark workspace.',
        })
      );
      return validationResult({ success: false, steps, startedAt });
    }

    const packageManager = await detectPackageManager(
      options.workspacePath,
      packageJson.packageManager
    );
    const actions: Array<{ step: ValidationStep; action: 'install' | 'type-check' | 'build'; timeoutMs: number }> = [
      { step: 'install', action: 'install', timeoutMs: installTimeoutMs },
    ];
    if (validationOptions.typeCheckOnly) {
      actions.push({ step: 'type-check', action: 'type-check', timeoutMs: commandTimeoutMs });
    } else {
      actions.push({ step: 'type-check', action: 'type-check', timeoutMs: commandTimeoutMs });
      actions.push({ step: 'build', action: 'build', timeoutMs: commandTimeoutMs });
    }

    for (const action of actions) {
      const command = commandForPackageManager(
        packageManager,
        action.action,
        packageJson.scripts
      );
      if (!command) {
        steps.push(
          makeStep({
            step: action.step,
            status: 'skipped',
            infrastructureError: `No ${action.action} script is defined in package.json.`,
          })
        );
        continue;
      }

      const result = await runWithTimeout(runner, {
        ...command,
        cwd: options.workspacePath,
        timeoutMs: action.timeoutMs,
        signal: validationOptions.signal,
      });
      const commandText = [command.command, ...command.args].join(' ');
      const status = stepStatusFromCommand(result);
      steps.push(
        makeStep({
          step: action.step,
          status,
          command: commandText,
          result,
          infrastructureError:
            result.status === 'timed-out'
              ? `${commandText} timed out in the isolated benchmark workspace.`
              : result.status === 'cancelled'
                ? 'Cancelled by user'
                : undefined,
        })
      );

      if (result.status === 'cancelled') {
        return validationResult({
          success: false,
          skipped: true,
          skipReason: 'Cancelled by user',
          steps,
          startedAt,
        });
      }
      if (result.status !== 'ok') {
        return validationResult({ success: false, steps, startedAt });
      }
    }

    if (validationOptions.runtimeSmoke) {
      const reason =
        'Runtime smoke requires a browser/WebContainer preview and is blocked in Node CLI benchmark mode.';
      steps.push(
        makeStep({
          step: 'runtime-smoke',
          status: 'skipped',
          infrastructureError: reason,
        })
      );
      return validationResult({
        success: false,
        skipped: true,
        skipReason: reason,
        steps,
        startedAt,
      });
    }

    return validationResult({
      success: steps.every((step) => step.status === 'ok' || step.status === 'skipped'),
      steps,
      startedAt,
    });
  };
}

export function createNodeCliTaskValidationRunner(
  options: NodeCliTaskValidationOptions
): TaskExecutionValidationRunner {
  return createTaskValidationRunner({
    requirements: options.requirements,
    runBroadChecks: options.runBroadChecks,
    runValidationImpl: createNodeCliValidationEngineRunner(options),
  });
}
