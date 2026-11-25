# PF-8b challenge: "the service runs as the app role" vs the team's code (review M2)

**The row says:** "the service runs as the app role that owns no table (PF-12's split, rev 16.2)".

**The code on main does this:**
- Every request's query runs as `xr_app` through `APP_DATABASE_URL` (`api/src/platform/firm-scope.ts:291-297`, `appDatabaseUrl`).
- The job runner connects with `DATABASE_URL` (`api/src/platform/jobs/platform-jobs.ts:45`, `new PgBossJobs({ connectionString: DATABASE_URL })`).
  - pg-boss creates and updates its own schema at start.
  - `xr_app` has no CREATE right (PF-12 migration `20261116013000_pf12_firm_walls`, lines 26-46).
- So the API cannot start with `DATABASE_URL` set to the app role.

**What #2748 now does (from commit 3 on):** it follows the code, so that the service starts.
- The service's `APP_DATABASE_URL` holds the app role's address, so every request runs walled.
- The service's `DATABASE_URL` holds the owner's address (`xr/<stage>/DATABASE_OWNER_URL`), shared with the migration task.
- `roleFindings` proves exactly that: the migration task holds the owner's address only, the service's `APP_DATABASE_URL` is the app role's, and no other variable of the service holds the owner's address or the RDS admin secret.

**The trade-off:** the service process can read the owner's credential. A bug in the request path cannot use it, because it runs on the walled pool. But code that reaches `DATABASE_URL` directly could.

**Options for the tech lead:**
1. **Keep as built (recommended now):** this matches PF-12 as merged, and the service starts.
2. **A jobs role of its own (follow-up runtime row):**
   - a migration pre-creates the `pgboss` schema owned by a new `xr_jobs` role, with no rights on `platform_*`;
   - `platform-jobs.ts` reads `JOBS_DATABASE_URL`;
   - the service then holds no owner address.

   This takes one migration, one line in `platform-jobs.ts`, one secret here and one test change. It removes the owner credential from the running service.

Evidence: the reviewer's report `review.md` (M2) and the three code lines above.
