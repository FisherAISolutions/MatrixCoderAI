'use client';

import type { MatrixProjectWorkspaceContext } from '@/lib/projects/projectStore';
import type {
  GuidedBuildState,
  GuidedBuildTechnicalDetail,
} from '@/lib/guided-build';
import { useTerminalLogs } from '@/lib/terminal/store';

export type GuidedInspectorView = 'technical' | 'repository' | 'logs';

interface Props {
  view: GuidedInspectorView;
  context: MatrixProjectWorkspaceContext | null;
  guidedState: GuidedBuildState;
  currentTechnical?: GuidedBuildTechnicalDetail;
  onOpenAdvanced: () => void;
}

function TechnicalDetails({
  detail,
}: {
  detail?: GuidedBuildTechnicalDetail;
}) {
  if (!detail) {
    return (
      <p className="text-sm text-matrix-green-muted">
        Technical details will appear when the first engineering task is ready.
      </p>
    );
  }

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
          Task
        </p>
        <h3 className="mt-2 text-base font-semibold text-matrix-green">
          {detail.title}
        </h3>
        <p className="mt-1 text-sm text-matrix-green-muted">
          {detail.taskId} · {detail.discipline} · {detail.status}
        </p>
        <p className="mt-1 text-sm text-matrix-green-muted">
          Retries {detail.retries.current}/{detail.retries.maximum}
        </p>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
          Validation
        </p>
        <ul className="mt-2 space-y-1 text-sm text-matrix-green-muted">
          {detail.validationCommands.length ? (
            detail.validationCommands.map((command) => (
              <li key={command}>{command}</li>
            ))
          ) : (
            <li>No task-specific command recorded yet.</li>
          )}
        </ul>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
          Allowed scope
        </p>
        <ul className="mt-2 space-y-1 text-sm text-matrix-green-muted">
          {detail.repositoryContext.allowedFileScope.length ? (
            detail.repositoryContext.allowedFileScope.map((scope) => (
              <li key={scope}>{scope}</li>
            ))
          ) : (
            <li>No file scope recorded.</li>
          )}
        </ul>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
          Files changed
        </p>
        <ul className="mt-2 space-y-1 text-sm text-matrix-green-muted">
          {detail.filesChanged.length ? (
            detail.filesChanged.map((file) => <li key={file}>{file}</li>)
          ) : (
            <li>No file evidence recorded yet.</li>
          )}
        </ul>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
          Acceptance criteria
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-matrix-green-muted">
          {detail.acceptanceCriteria.map((criterion) => (
            <li key={criterion}>{criterion}</li>
          ))}
        </ul>
      </div>
      <div>
        <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
          Exact errors
        </p>
        <ul className="mt-2 space-y-1 text-sm text-amber-100">
          {detail.exactErrors.length ? (
            detail.exactErrors.map((error) => <li key={error}>{error}</li>)
          ) : (
            <li className="text-matrix-green-muted">No errors recorded.</li>
          )}
        </ul>
      </div>
    </div>
  );
}

function RepositoryDetails({
  context,
  onOpenAdvanced,
}: Pick<Props, 'context' | 'onOpenAdvanced'>) {
  const repository = context?.repositoryModel;

  if (!repository) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-matrix-green-muted">
          The repository scan will be created before the first engineering task.
        </p>
        <button
          type="button"
          className="rounded border border-matrix-border px-3 py-2 text-xs uppercase tracking-[0.16em] text-matrix-green hover:border-matrix-green"
          onClick={onOpenAdvanced}
        >
          Open full repository
        </button>
      </div>
    );
  }

  const pageRoutes = repository.routes.filter((route) => route.kind === 'page');
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          ['Files', repository.files.length],
          ['Routes', pageRoutes.length],
          ['Dependencies', repository.dependencies.length],
          ['Known errors', repository.currentValidationErrors.length],
        ].map(([label, value]) => (
          <div key={label} className="rounded border border-matrix-border bg-black/20 p-3">
            <p className="text-[10px] uppercase tracking-[0.18em] text-matrix-green-muted">
              {label}
            </p>
            <p className="mt-2 text-xl font-semibold text-matrix-green">{value}</p>
          </div>
        ))}
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
            Routes
          </p>
          <ul className="mt-2 space-y-1 text-sm text-matrix-green-muted">
            {pageRoutes.length ? (
              pageRoutes.slice(0, 12).map((route) => (
                <li key={route.filePath}>
                  {route.path} <span className="opacity-60">· {route.filePath}</span>
                </li>
              ))
            ) : (
              <li>No application routes detected yet.</li>
            )}
          </ul>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-matrix-green-muted">
            Repository health
          </p>
          <ul className="mt-2 space-y-1 text-sm text-matrix-green-muted">
            <li>{repository.stale ? 'Refresh required' : 'Fingerprint is current'}</li>
            <li>{repository.unresolvedImports.length} unresolved imports</li>
            <li>{repository.duplicateScaffoldRisks.length} duplicate scaffold risks</li>
            <li>{repository.protectedFiles.length} protected files</li>
          </ul>
        </div>
      </div>
      <button
        type="button"
        className="rounded border border-matrix-border px-3 py-2 text-xs uppercase tracking-[0.16em] text-matrix-green hover:border-matrix-green"
        onClick={onOpenAdvanced}
      >
        Open repository in Advanced mode
      </button>
    </div>
  );
}

function LogDetails() {
  const logs = useTerminalLogs();
  const visibleLogs = logs.slice(-100);

  return (
    <div className="space-y-3">
      <div className="max-h-80 overflow-auto rounded border border-matrix-border bg-black/35 p-3 font-mono text-xs">
        {visibleLogs.length ? (
          visibleLogs.map((line) => (
            <div
              key={line.id}
              className={
                line.level === 'error'
                  ? 'text-rose-200'
                  : line.level === 'warn'
                    ? 'text-amber-100'
                    : 'text-matrix-green-muted'
              }
            >
              {line.text}
            </div>
          ))
        ) : (
          <p className="text-matrix-green-muted">
            Build and validation logs will appear here.
          </p>
        )}
      </div>
      <p className="text-xs text-matrix-green-muted">
        Showing the latest {visibleLogs.length} log entries. Advanced mode keeps
        the full interactive terminal available.
      </p>
    </div>
  );
}

export default function GuidedBuildInspector(props: Props) {
  return (
    <section
      className="rounded-md border border-matrix-border bg-matrix-panel/65 p-5"
      data-testid={`guided-inspector-${props.view}`}
    >
      {props.view === 'technical' ? (
        <TechnicalDetails detail={props.currentTechnical} />
      ) : null}
      {props.view === 'repository' ? (
        <RepositoryDetails
          context={props.context}
          onOpenAdvanced={props.onOpenAdvanced}
        />
      ) : null}
      {props.view === 'logs' ? <LogDetails /> : null}
    </section>
  );
}
