# Matrix Coder Private-Beta Runbooks

These runbooks cover the minimum operational response for a controlled paid
private beta. Keep secrets in the hosting provider and `.env.local`, never in
projects, logs, screenshots, support messages, or Git.

## Required Configuration

Browser-safe:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `NEXT_PUBLIC_VERCEL_TOKEN_CONFIGURED`

Server-only:

- `OPENAI_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER`
- `STRIPE_PRICE_PRO`
- `VERCEL_TOKEN`
- `VERCEL_TEAM_ID` when deployments use a team
- `MATRIX_APP_BASE_URL`
- `MATRIX_BILLING_MODE`
- `MATRIX_INTERNAL_USER_IDS`

Optional operational controls:

- `MATRIX_DISABLE_AI`
- `MATRIX_DISABLE_TASK_BUILDS`
- `MATRIX_DISABLE_DEPLOYMENT`
- `MATRIX_DISABLE_CHECKOUT`
- `MATRIX_ERROR_REPORTING_URL`
- `MATRIX_ERROR_REPORTING_TOKEN`

Public health is available at `/api/health`. Detailed configuration and recent
operation summaries are available only to UUIDs in `MATRIX_INTERNAL_USER_IDS`
through `/api/internal/operations`.

## Incident Index

- [Provider outage](provider-outage.md)
- [Supabase outage](supabase-outage.md)
- [Stripe webhook failure](stripe-webhook-failure.md)
- [Vercel deployment failure](vercel-deployment-failure.md)
- [Runaway usage or cost](runaway-usage.md)
- [Task-engine regression](task-engine-regression.md)
- [Credential rotation](credential-rotation.md)
- [Rollback](rollback.md)
- [Project recovery](project-recovery.md)
