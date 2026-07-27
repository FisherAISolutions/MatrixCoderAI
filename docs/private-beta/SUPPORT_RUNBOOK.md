# Private Beta Support Runbook

## First response

1. Record user ID, project ID, operation ID, time, browser, and current milestone.
2. Confirm whether data is still visible before asking the user to retry.
3. Check health, kill switches, rate/usage state, and provider status.
4. Never request passwords, API keys, Stripe secrets, or deployment tokens.

## Build triage

- Restore the project and compare its repository fingerprint with Engineering Memory.
- Treat interrupted running tasks as recoverable.
- Retry only the failed task; preserve validated files.
- If environment, auth, or permission blocked the task, stop retries and explain the required action.

## Provider, deployment, and billing

- Classify configuration, authentication, timeout, malformed response, and outage separately.
- Use redacted logs and operation IDs.
- Inspect deployment root, required environment, production check, project/deployment IDs, and history.
- Verify Stripe webhook signatures and event idempotency before changing entitlement.
- Past-due/grace users retain documented read/export behavior.

## Recovery and rollback

- Disable the affected capability with its narrow kill switch.
- Preserve user project snapshots.
- Roll application code back to the last reviewed release.
- Roll migrations back only with reviewed SQL and a verified backup.
- Rotate exposed credentials, invalidate sessions when appropriate, and document the incident.
