# Task-Driven Build Migration

Matrix Coder builds approved applications through the task-driven engineering path.

1. Matrix AI Architect and Blueprint Studio capture the approved vision.
2. Build Manifest, Architect Draft, and Blueprint Draft derive a versioned Build Contract.
3. Capabilities and a dependency-aware Task Graph turn the contract into bounded engineering work.
4. Before each task, the Repository Model refreshes the generated project context.
5. The task executor changes only the task's allowed files, validates the smallest meaningful scope, and records evidence in Engineering Memory.
6. Milestones run broader validation and the final review checks every required Build Contract requirement before completion is reported.

Large requests without an approved Build Contract are intentionally held at planning. Small, bounded workspace edits continue to use the existing single-request coding flow. The former automatic five-batch generator is retired from runtime; it is not a fallback for task-driven builds.

Build progress is persisted with the active project. Interrupted work restores as resumable rather than complete, and failed tasks can be retried individually without discarding completed files.
