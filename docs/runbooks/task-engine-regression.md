# Task-Engine Regression

1. Disable new task builds with `MATRIX_DISABLE_TASK_BUILDS=true`.
2. Keep completed files and Engineering Memory checkpoints intact.
3. Record the failed task ID, operation ID, repository fingerprint, exact
   validation evidence, retry count, and failure classification.
4. Reproduce with an isolated fixture; never retry an entire user project.
5. Repair only the affected task path, run task-execution and repository tests,
   then resume from the last safe checkpoint.
