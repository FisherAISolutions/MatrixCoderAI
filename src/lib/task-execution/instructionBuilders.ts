import type { RepositoryTaskContext } from '@/lib/repository-model';
import type { EngineeringDiscipline, TaskGraphTask } from '@/lib/task-graph';
import type { FileNode } from '@/app/chat-workspace/components/types';
import type { TaskIntelligencePacket } from '@/lib/engineering-foreman';
import { flattenTree } from '@/lib/repo/heuristics';
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

function scopedFileContents(
  files: FileNode[],
  context: RepositoryTaskContext,
  packet: TaskIntelligencePacket
): string {
  const wanted = new Set([
    ...context.relevantFiles.map((file) => file.path),
    ...packet.relevantExistingFiles.map((file) => file.path),
  ]);
  const scoped = flattenTree(files)
    .filter(
      (file) =>
        file.type === 'file' &&
        wanted.has(file.path) &&
        typeof file.content === 'string'
    )
    .slice(0, 8);
  if (!scoped.length) return 'No scoped files exist yet.';
  return scoped
    .map((file) => {
      const content = file.content ?? '';
      const bounded =
        content.length > 5000
          ? `${content.slice(0, 3000)}\n/* ... ${content.length - 5000} chars omitted ... */\n${content.slice(-2000)}`
          : content;
      return `--- ${file.path}\n${bounded}`;
    })
    .join('\n\n');
}

export function buildStructuredTaskEngineeringInstruction(options: {
  task: TaskGraphTask;
  context: RepositoryTaskContext;
  packet: TaskIntelligencePacket;
  files: FileNode[];
  mode: 'full-file-create' | 'repository-aware';
  repair?: {
    validationErrors: string[];
    touchedPaths: string[];
  };
}): TaskExecutionAiMessage[] {
  const { task, context, packet, mode } = options;
  const operationRules =
    mode === 'full-file-create'
      ? `The repository is empty. Every operation MUST use type "create" and contain the complete file content.`
      : `The repository already contains files. Existing files MUST use exact "patch" operations. Use "create" only for a missing expected file. Never replace an existing file with a create operation.`;
  const repairBlock = options.repair
    ? `\n## Targeted Repair\nRepair only these touched files:\n${list(options.repair.touchedPaths)}\n\nExact validation errors:\n${list(options.repair.validationErrors)}\n`
    : '';
  return [
    {
      role: 'system',
      content: `You are Matrix Coder AI's bounded task-level engineering executor.

Execute exactly one task. Return exactly one JSON object, with no prose and no markdown outside an optional single json fence. Never claim the project is complete.`,
    },
    {
      role: 'user',
      content: `# Task Intelligence Packet
Task ID: ${task.id}
Title: ${task.title}
Purpose: ${packet.purpose}
Discipline: ${task.assignedDiscipline}
Milestone: ${packet.currentMilestone}
Repository fingerprint: ${packet.repositoryFingerprint}
Mode: ${mode}

Allowed paths:
${list(packet.allowedPaths)}

Expected files:
${list(packet.expectedFiles)}

Expected outputs:
${list(packet.expectedOutputs)}

Acceptance criteria:
${list(packet.acceptanceCriteria)}

Required capabilities:
${list(packet.capabilityReferences.map((item) => `${item.capabilityId} (${item.status})`))}

Approved Blueprint decisions:
${list(packet.blueprintDecisions.map((item) => `${item.kind}: ${item.value}`))}

Verified engineering lessons:
${list(packet.memoryLessons.map((item) => item.lesson))}

Validation:
${list(packet.validationStrategy.commands)}

Current repository context:
${context.compactSummary}

Scoped file contents:
${scopedFileContents(options.files, context, packet)}
${repairBlock}
## Response Contract
${operationRules}

Return this exact envelope shape:
{
  "version": 1,
  "taskId": "${task.id}",
  "mode": "${mode}",
  "operations": [
    { "type": "create", "path": "relative/path", "content": "complete content" },
    { "type": "patch", "path": "existing/path", "search": "unique exact text", "replace": "replacement text" },
    { "type": "delete", "path": "relative/path" },
    { "type": "package-json", "path": "package.json", "section": "dependencies", "name": "package", "value": "^1.0.0" },
    { "type": "environment", "path": ".env.example", "name": "PUBLIC_NAME", "value": "" }
  ],
  "summary": "short task result"
}

Include only operations required for this task. SQL schemas and migrations are normal create or patch operations. Never use absolute paths or path traversal. Never modify protected or unrelated files.`,
    },
  ];
}

export function buildStructuredResponseRepairInstruction(options: {
  task: TaskGraphTask;
  context: RepositoryTaskContext;
  packet: TaskIntelligencePacket;
  files: FileNode[];
  mode: 'full-file-create' | 'repository-aware';
  errors: string[];
  invalidResponse: string;
}): TaskExecutionAiMessage[] {
  const messages = buildStructuredTaskEngineeringInstruction(options);
  messages.push({
    role: 'assistant',
    content: options.invalidResponse.slice(0, 12000),
  });
  messages.push({
    role: 'user',
    content: `Your response was rejected before any file mutation.

Errors:
${list(options.errors)}

Return one corrected JSON operation envelope only. This is the single bounded response-format repair attempt.`,
  });
  return messages;
}
