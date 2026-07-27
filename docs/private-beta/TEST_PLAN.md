# Private Beta Risk-Based Test Plan

## Priority 0: safety and recoverability

- Prove user-scoped project access at both server query and RLS boundaries.
- Prove snapshots, logs, exports, and errors do not expose secrets.
- Prove cancellation, refresh, project switching, and localized failure preserve validated work.
- Prove billing, provider, deployment, rate, and usage limits are server-enforced.
- Prove blocked checks never count as passed and completion requires contract evidence.

## Priority 1: core journeys

- New user: access gate, authentication, project creation, Architect approval, Blueprint approval, Guided Build, retry, preview, contract review, export.
- Returning user: complete project and engineering-state restore with no cross-project leakage.
- Change request: impact analysis, approval, affected-task reconciliation, preserved work.
- Deployment: readiness, environment warnings, mocked fail/recover/succeed, history.
- Billing: usage states, checkout/portal mocks, entitlement update, grace behavior, read/export access.

## Priority 2: experience quality

- Keyboard navigation, visible focus, labels, live progress, contrast, reduced motion.
- Desktop, tablet, and mobile overflow and control reachability.
- Loading, empty, error, retry, and support paths.

## Test layers

- Vitest: deterministic domain, persistence, security, provider/deployment/billing adapters.
- Playwright: public/auth/release smoke on desktop and mobile without real providers.
- Guarded manual: real Supabase/RLS, Stripe test mode, Vercel staging deployment, core live benchmarks.

Paid AI, real Stripe charges, and real Vercel production deployments are never automatic.
