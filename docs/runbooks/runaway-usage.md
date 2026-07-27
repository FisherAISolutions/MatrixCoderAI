# Runaway Usage Or Cost

1. Activate `MATRIX_DISABLE_AI=true` and `MATRIX_DISABLE_TASK_BUILDS=true`.
2. Review operation IDs and monthly usage aggregates; duplicate IDs must not be
   counted twice.
3. Identify category, user UUID, retry pattern, and stop reason without reading
   private prompts or source.
4. Do not increase plan, task, repair, duration, file, or byte limits during an
   incident.
5. Fix the retry or cancellation defect, verify with a bounded internal run, and
   reopen one operation category at a time.
