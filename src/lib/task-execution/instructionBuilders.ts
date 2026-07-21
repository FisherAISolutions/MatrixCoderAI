import type { RepositoryTaskContext } from '@/lib/repository-model';
import type { EngineeringDiscipline, TaskGraphTask } from '@/lib/task-graph';
import type { TaskExecutionAiMessage } from './types';

const disciplineFocus: Record<EngineeringDiscipline, string> = {
  foundation:
    'Create or adjust project foundation files and scaffolding only within the task scope.',
  architecture:
    'Make small architecture-level changes that unblock the requested vertical slice.',
  database:
    'Implement schema, typed data models, database helpers, and migrations for this task.',
  authentication:
    'Implement auth-specific files, guards, and typed user/session helpers for this task.',
  backend:
    'Implement API routes, server helpers, and server-side business logic for this task.',
  frontend:
    'Implement route pages, components, forms, and client interactions for this task.',
  'AI integration':
    'Implement AI-facing route handlers, typed helpers, and UI integration points for this task.',
  'storage/media':
    'Implement file upload, media storage, and storage-provider helpers for this task.',
  testing:
    'Add or update tests for the behavior requested by this task.',
  review:
    'Review and patch only the concrete issues in the task acceptance checks.',
  deployment:
    'Implement deployment-readiness files and checks within the task scope.',
};

function list(values: string[], fallback = 'none'): string {
  return values.length ? values.map((value) => `- ${value}`).join('\n') : fallback;
}

function contextFiles(context: RepositoryTaskContext): string {
  if (!context.relevantFiles.length) return 'No directly relevant files exist yet.';
  return context.relevantFiles
    .slice(0, 8)
    .map((file) => `- ${file.path} (${file.readable ? `${file.size} chars` : 'unreadable'})`)
    .join('\n');
}

export function buildTaskEngineeringInstruction(
  task: TaskGraphTask,
  context: RepositoryTaskContext
): TaskExecutionAiMessage[] {
  const system = `You are Matrix Coder AI's task-level engineering executor.

You execute exactly ONE task. Do not complete other tasks, do not regenerate completed capabilities, and do not claim the whole project is done.

Output only file CREATE fences or edit:<path> SEARCH/REPLACE fences compatible with the existing Matrix Coder patch extractor.`;

  const user = `# Task
${task.title}

${task.description}

Discipline: ${task.assignedDiscipline}
Focus: ${disciplineFocus[task.assignedDiscipline]}
Priority: ${task.priority}

## Allowed File Scope
${list(task.allowedFileScope)}

## Expected Files
${list(task.expectedFiles)}

## Expected Outputs
${list(task.expectedOutputs)}

## Acceptance Checks
${list(task.acceptanceChecks)}

## Validation Commands
${list(task.validationCommands, 'No command-level validation configured for this task.')}

## Repository Context
${context.compactSummary}

Relevant files:
${contextFiles(context)}

Related routes:
${list(context.relatedRoutes.map((route) => `${route.path} -> ${route.filePath}`))}

Related APIs:
${list(context.relatedApis.map((api) => `${api.path} -> ${api.filePath}`))}

Current task errors:
${list(context.currentErrors.map((error) => `${error.file ?? '(no file)'}: ${error.message}`))}

Files to avoid changing:
${list(context.filesToAvoidChanging)}

## Strict Rules
- Patch only files in Allowed File Scope or Expected Files.
- Never use absolute paths, URLs, or path traversal.
- Preserve valid existing files after a partial failure.
- Keep changes bounded to this one task.
- For interactive Next.js App Router routes, keep app/**/page.tsx as a Server Component and put hooks/localStorage/browser APIs in a client child component.
- If you cannot safely make the scoped change, emit no patches rather than broad rewrites.`;

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
}

