# Credential Rotation

1. Create the replacement credential in the provider.
2. Update the server-side hosting secret; never put secrets in `NEXT_PUBLIC_*`.
3. Restart/redeploy Matrix Coder and run the smallest authenticated health test.
4. Revoke the old credential only after the replacement succeeds.
5. For Stripe, update the webhook signing secret together with the endpoint.
6. For Supabase service role exposure, rotate immediately and review trusted
   billing/usage writes. For Vercel, verify team scope after rotation.
