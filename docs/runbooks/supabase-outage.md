# Supabase Outage

1. Stop paid operations with the AI, task-build, deployment, and checkout kill
   switches if ownership or usage checks cannot be trusted.
2. Confirm Supabase project status, auth status, and migration state.
3. Preserve client-side unsaved work; do not claim cloud saves succeeded.
4. Do not bypass RLS or change users to internal access.
5. After recovery, verify authentication, project ownership, usage RPCs, and
   webhook processing with a test account before reopening paid operations.
