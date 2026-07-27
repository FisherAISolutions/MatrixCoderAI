# Vercel Deployment Failure

1. Preserve the failed operation ID, repository fingerprint, detected root, and
   sanitized Vercel status.
2. Correct missing environment variables or the validated root override, then
   rerun Production Build Check.
3. Never reuse a reviewed fingerprint after repository changes.
4. Confirm `VERCEL_TOKEN` and optional `VERCEL_TEAM_ID` server-side.
5. Redeploy the same fingerprint only after the prior per-project lock clears.
6. Set `MATRIX_DISABLE_DEPLOYMENT=true` if failures repeat platform-wide.
