# Rollback

1. Activate the kill switch for the affected paid operation.
2. Roll back application code to the last verified release.
3. Do not reverse an additive database migration destructively. Apply a new
   forward migration when schema repair is required.
4. Verify auth, project reads, public health, protected operations, and one
   bounded internal AI request.
5. Re-enable operations gradually and retain incident operation IDs.
