# Provider Outage

1. Set `MATRIX_DISABLE_AI=true`; set `MATRIX_DISABLE_TASK_BUILDS=true` if task
   builds are repeatedly retrying.
2. Confirm existing projects, exports, and read-only screens remain available.
3. Check the provider status page and protected operation summary. Do not paste
   prompts, source, or keys into tickets.
4. Classify authentication failures separately from timeout/rate-limit outages.
5. Rotate credentials only when compromise is suspected.
6. Restore AI first for internal users, run one bounded smoke request, then
   remove the switches. Never compensate by increasing retry limits.
