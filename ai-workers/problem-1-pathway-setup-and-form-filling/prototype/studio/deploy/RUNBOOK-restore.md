# Runbook: restoring the database, and the restore drill

PF-8r (local drill, run every night) · PF-8rc (the cloud drill, **not run yet**) · NFR5-04 (`domain/requirements-2026-11-02/01-techno-functional/02-Architecture-Decision-Record.md`: "RPO ≤ 15 min (continuous WAL/PITR), RTO ≤ 4 h for region failure; daily full + continuous incremental backups, all in Canadian regions, encrypted … quarterly restore drill is a contractual deliverable"; "Implication: … quarterly drill with recorded evidence") · P-586 (map row 14; MVP-CHECKLIST C13 "one restore drill passed") · code: `tools/restore-drill.sh` · test: `tests/check_pf8r_restore.ts` · nightly: job `restore-drill` in `.github/workflows/nightly.yml`

For the engineer and the release holder. A restore never writes over the database it restores from: it always goes into a **new** database, is checked there, and only then is the service pointed at it. No row data, no personal data and no secret is ever written into the evidence, a ticket, a chat or this file.

## 1. Who decides

| Step | Who |
|---|---|
| Starting a restore (a real incident or a drill) | the release holder |
| Switching the service to the restored database | the release holder, after every check in §3 passed |
| Signing off a **real** restore (the old instance may go) | the founder |
| The quarterly cloud drill's evidence | the release holder writes it; the founder reads and signs it |

## 2. The local drill (PF-8r; runs every night)

`bash studio/tools/restore-drill.sh` on `deploy/compose.test.yml`'s pinned PostgreSQL 18.3 (needs docker and the image `studio-skeleton:test`):

1. **Source:** a compose project of `compose.test.yml` applies `prisma/migrations` (the release step), seeds the Sample firms at the app's start, runs the demo reset (`POST /api/demo/load`) and opens one demo case (`POST /api/runtime/cases`). The app is stopped before the dump, so nothing writes while it runs.
2. **Dump:** `pg_dumpall --globals-only` (the roles; `pg_dump` does not dump roles, and PF-12's `xr_*` roles must exist before the tables' grants) and `pg_dump --format=custom` of the database.
3. **Restore:** into a **fresh** PostgreSQL of the same pinned image, a second compose project with its own volume. The drill checks that the two clusters' system ids differ and that the new one holds no table before the restore. The globals go in first, then `pg_restore --exit-on-error`.
4. **Checks**, each printing PASS or FAIL with what it saw:
   * `prisma migrate status`: nothing pending or failed;
   * `prisma migrate diff --from-config-datasource --to-schema prisma/schema --exit-code` (Prisma 7's spelling of `--from-url … --to-schema-datamodel`): no drift (`migrate status` alone does not see drift);
   * **row count** and the SHA-256 of the sorted primary keys, the same in both copies, for every `platform_*`, `fo_*`, `msg_*` and `module_event` table and the case tables the demo case fills (the list is in the script);
   * the app starts against the restored database and `tools/skeleton-smoke.sh` passes against it;
   * the **audit chain** verifies end to end, once AUD-1c's verifier is on `main`; until then the step prints `SKIP: AUD-1c's chain verifier is not on main`. AUD-1c's builder turns it into the real check (one step in the script, named in its PR).
5. **Time and evidence:** the measured restore time (dump start to the last check, seconds) is printed and written with every check's result and the table counts into `restore-drill-evidence.json` (`var/restore-drill/` by default; the nightly run keeps it as the run's artefact).

The nightly job fails red on any FAIL. Its fail cases (the test): `--corrupt <table>` deletes one table's rows in the restored copy after the restore, and the count check must fail and name the table; `--extra-migration` checks against one migration never applied, and `migrate status` must fail and name it; `--drop-index <index> --drop-policy <table>.<policy>` drops one index and one firm-wall policy in the restored copy after the restore, and the drift check must fail and name both (prisma sees the index, the catalogue both).

## 3. The cloud restore (PF-8rc; the plan, **not run yet**)

Written as the plan for PF-8rc, in the founder's AWS account (`ca-central-1`; the backup copy in `ca-west-1`, P-586). The instance names below are placeholders until the stacks are deployed.

**What the code already sets (PF-8rc, `deploy/cdk/lib/backup.ts`, synth only):** RDS's own automated backups give point-in-time restore for 35 days (steps 2–4). On top of that, an AWS Backup plan `xr-<stage>-daily` takes the database and the three buckets every day into the vault `xr-<stage>-home`, keeps them 35 days, and copies each to `xr-<stage>-copy` in ca-west-1, also kept 35 days. Both vaults are locked in governance mode for 35 days. Their access policies deny lock removal, early deletion, lifecycle shortening and vault deletion to everyone, and each vault key's policy denies its deletion. So **no role defined in the code can shorten a backup's life**, the release holder's included. **Limit (governance mode):** an account administrator, the root user or a deploy can replace a vault's policy and then lift the lock, in two steps. Compliance mode or an organisation-level policy would close that; the tech lead decides (PR #2725, question 1). Changing the lock on purpose takes two reviewed deploys: first the vault policy, then the lock. **First deploy (Unconfirmed):** if CloudFormation refuses to create a vault, retry; a retained vault from a failed run is imported, never recreated under the same name. A copy restore (a region failure) starts from `xr-<stage>-copy` in ca-west-1: `aws backup start-restore-job --region ca-west-1 --recovery-point-arn <copy point> --iam-role-arn <restore role> --metadata <the instance settings>`. The restore role is created for the drill and is not in the backup plan's role, which can only back up.

1. **Choose the point:** the release holder picks the point in time (a drill: 15 minutes ago; an incident: just before the damage) and writes it down in UTC.
2. **Restore to a point in time as a new instance:** `aws rds restore-db-instance-to-point-in-time --region ca-central-1 --source-db-instance-identifier <prod-db> --target-db-instance-identifier <prod-db>-restore-<date> --restore-time <UTC time> --db-subnet-group-name <private subnets> --vpc-security-group-ids <db group> --no-publicly-accessible --multi-az --deletion-protection` (the same KMS key, parameter group and `rds.force_ssl`). Never restore over the running instance.
3. **Wait until it is available:** `aws rds wait db-instance-available --db-instance-identifier <prod-db>-restore-<date>`.
4. **Run the same checks** as §2 step 4 against the new instance, from a one-off task in the private subnets (the image's own `prisma` and `skeleton-smoke.sh`): `migrate status`, `migrate diff`, the row counts and id checksums against the running instance's counts at the chosen point (where the point is "now"; otherwise counts are recorded, not compared), the app's health on a second, internal-only service, and the audit chain once AUD-1c is on `main`.
5. **Restore one file version** in S3 (a drill: one object of the documents bucket to an earlier version) and check its checksum. PF-F1c: the bucket refuses a put or copy that does not name `aws:kms`, so the copy names it: `aws s3api copy-object --bucket <b> --key <k> --copy-source '<b>/<k>?versionId=<v>' --server-side-encryption aws:kms --ssekms-key-id <data key ARN> --metadata-directive COPY`.
6. **Switch the service's database secret:** the release holder updates the `DATABASE_URL` secret in Secrets Manager to the new instance and forces a new deployment of the service (`aws ecs update-service --force-new-deployment`; RUNBOOK-secrets.md §1). The smoke journey runs against the live address afterwards.
7. **Keep the old instance until signed off:** rename it (`…-old-<date>`), keep deletion protection on and stop writes to it; it is deleted only after the founder signs off the restore in writing. A drill never switches production: steps 6 and 7 are rehearsed on staging.

## 4. Measuring the 15-minute RPO and the 4-hour RTO (NFR5-04)

* **RPO (data loss, ≤ 15 minutes):** the time between the last write in the source before the chosen point and the newest write present in the restored copy. The drill writes a marker row (a Sample, no personal data) every minute in the minutes before the point and reads the newest marker in the restored copy; RPO = point − newest marker found. RDS's `LatestRestorableTime` must be within 15 minutes of now at all times (an alarm, PF-23c).
* **RTO (time to recover, ≤ 4 hours):** from the moment the release holder starts the restore (step 2) to the moment the smoke journey passes on the switched service (after step 6), by the clock in the evidence file.
* The local drill's restore time (§2) is a Sample bound for the tooling (under 5 minutes on GitHub's runner), not the cloud RTO.

## 5. The evidence file

Every drill, local or cloud, writes `restore-drill-evidence.json` (the cloud drill also writes `deploy/evidence/restore-drill-<date>.md` from it, PF-8rc): when it ran, `main`'s sha, the restore time in seconds, each check's name, result (PASS, FAIL or SKIP) and what it saw, and each table's row counts in the source and the restored copy with whether the ids match. The cloud file adds the chosen point, the measured RPO and RTO, the instance names and who started, switched and signed off (roles, never names). **No row data and no personal data**: only table names, counts, yes or no, and timings (the test checks the files and logs for the Sample firms' emails and names).
