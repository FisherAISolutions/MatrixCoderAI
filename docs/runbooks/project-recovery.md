# Project Recovery

1. Identify the project by stable ID and owner UUID, never by display name.
2. Preserve the latest files snapshot and Engineering Memory checkpoint before
   attempting recovery.
3. Compare repository fingerprints and reject stale callbacks or saves.
4. Mark interrupted work recoverable, not passed.
5. Restore persistent files, task state, contract evidence, and metadata only;
   never restore live processes, streams, timers, or provider tokens.
6. Resume one failed or interrupted task and validate it before continuing.
