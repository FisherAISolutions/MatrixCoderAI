# Stripe Webhook Failure

1. Set `MATRIX_DISABLE_CHECKOUT=true` when subscription state cannot be trusted.
2. Check Stripe test/live mode, endpoint URL, signing secret, and recent delivery
   attempts. Never log the signing secret or payment details.
3. Inspect `matrix_processed_webhook_events`. Failed events are retryable;
   processed event IDs remain idempotent.
4. Replay only the failed Stripe event after fixing configuration.
5. Confirm the Matrix billing account maps to the correct Supabase user and
   Stripe customer before restoring checkout.
