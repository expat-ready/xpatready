# PF-8b-f6 break report (PR #3060, head 530c25e2a77189395dcad3b7833abc47561b0fbc)

Scope: the migration-only change. `20261119170000_pf18bk_support_keys` now lifts and restores FORCE ROW LEVEL SECURITY for a runner that owns the tables but is not superuser and not BYPASSRLS. `20261122040000_pf8b_f6_pf18bk_checksum` rewrites pf18bk's checksum. Test: `tests/check_pf8b_f6_pg18_nobypass.ts`.
Rig: throwaway PostgreSQL 18.3 cluster on :15575, created with `initdb` run through `runuser -u postgres`. Roles are set up as in the PR's test (`rds_superuser`, `xr_admin` CREATEROLE/CREATEDB, BYPASSRLS toggled). I built a `base` database with every migration before pf18bk (deployed by Prisma with BYPASSRLS) and copied it from template for each attempt. The cluster is now stopped and removed. :54329 and :4400 were not touched.
The PR's own test (port 15570) passed 24/24.
Note: while this pass was running, someone made uncommitted edits in this same working tree (pf18bk, the F6 migration and the test; there is also a `review.md` here). Every result below uses the committed head: I used a byte copy of the head file and `git archive 530c25e` for the Prisma runs. One run that picked up the edited tree was thrown away and run again.

## Findings

**Major M1: under the non-BYPASSRLS admin, later data migrations finish with exit 0 but skip every row the walls hide from the admin.**
- What I did: two copies of `base`, each seeded as the cluster superuser with Firm F, a subscription whose creation audit line says `period: YEARLY`, and an `fo_consultation_type` row holding today's default timings (0, 10, 240, 60, 240). I ran `prisma migrate deploy` (head files) on one copy with BYPASSRLS and on the other with NOBYPASSRLS (the RDS shape).
- Expected: same data on both copies.
- Actual:
  - With BYPASSRLS: `billing_period = YEARLY`, timings `NULL,NULL,NULL,NULL,NULL`.
  - Without BYPASSRLS: `billing_period = MONTHLY`, timings `0,10,240,60,240`.
  - Both runs say "All migrations have been successfully applied" and both catalogs are identical (4,472 lines compared).
- Where: `20261122000000_pf5p3_billing_period/migration.sql:10` and `20261121110000_fo3a1e_firm_timings/migration.sql:21-25`. Both UPDATE tables with FORCE ROW LEVEL SECURITY that existed before pf18bk, and the table owner sees none of their rows.
- `fo10p2` (UPDATE `fo_assignment_rule`) has the same weakness, but that table is created after pf18bk, so it is empty on RDS.
- The same blindness applies to any future key added over existing forced rows. Check D1: as owner with FORCE on, `ALTER TABLE platform_support_message ADD CONSTRAINT … FOREIGN KEY` succeeded over a hidden orphan.
- No line in the diff causes this. But this PR is what lets these migrations run on RDS, and its test treats "deploy exits 0" as proof that every migration applies (test line 1, check A).
- Severity: Major because a firm's Yearly billing choice can be silently lost. If the lead confirms the RDS database has no rows in `platform_subscription` or `fo_consultation_type` when this deploys (the AWS proof applied migrations only), this drops to Minor and the verdict to Approve.

**Minor m1: getting ACCESS EXCLUSIVE in two steps can deadlock against live traffic and makes app reads queue.**
- Where: `pf18bk_support_keys/migration.sql:29` takes SHARE ROW EXCLUSIVE, then `:37` (`ALTER … NO FORCE`) needs ACCESS EXCLUSIVE on each forced table.
- What I did: an `xr_app` transaction for firm A read `platform_firm`, slept 3 s, then wrote `platform_staff`, while the migration ran.
- Actual: `ERROR: deadlock detected`. The app transaction was killed; the migration finished and FORCE was back. With other timing the migration is the victim instead, which means P3018 and a manual `migrate resolve`.
- Separately, with `lock_timeout=1000` and a reader holding ACCESS SHARE, the migration stopped at `ALTER TABLE platform_support_ticket NO FORCE ROW LEVEL SECURITY`. FORCE stayed on and no key was added.
- The superuser and BYPASSRLS path never asks for more than SHARE ROW EXCLUSIVE, so it is unaffected.
- The uncommitted working-tree edit appears to address this. It is not on the head.

**Minor m2: the stop message changed for a runner without rights.**
- The lock now comes before the guard (`:29` before `:30-33`).
- What I did: ran pf18bk as `xr_other` (not owner, no table rights).
- Actual: on head, `ERROR: permission denied for table platform_firm`. Main gave `PF-18bk stopped, nothing changed: xr_other cannot see every support row … run migrations as the database owner`.
- The guard's own text (`:32`) still says "database owner", but the check is now table ownership. In attempt E2b, `xr_admin` owned the database and was still refused because one table had another owner.

**Minor m3 (line not changed by this PR, but it is in the file whose checksum this PR rewrites): the orphan HINT names the wrong migration.**
- Where: `:48` says `prisma migrate resolve --rolled-back 20261119010000_pf18bk_support_keys`. The folder is `20261119170000_…`, so the command it tells the operator to run fails.
- The uncommitted tree changes this line too. It is not on the head.

**Minor m4: test check A "the admin still reads no support row and no firm" proves nothing.**
- Where: `tests/check_pf8b_f6_pg18_nobypass.ts:98`. Database `xr_a` has no firm and no staff at that point.
- With a firm present, the non-BYPASSRLS admin reads every `platform_firm` row (3 of 3 in my RDS-shaped database). The reason: `xr_admin` inherits `xr_case_lookup` (INHERIT TRUE, granted when the role is created), and `case_lookup_read` on `platform_firm` lets it read everything (`TO xr_case_lookup USING (true)`).
- The membership predates this PR and is out of its scope. The check would pass whether or not the walls exist.

## What held
- **Concurrency while FORCE is lifted.** I ran a copy of pf18bk with `pg_sleep(10)` inserted right after the NO FORCE loop.
  - `pg_locks` showed AccessExclusiveLock granted on all four tables.
  - From outside, `pg_class` still showed FORCE on all four (the change was not yet committed).
  - Every one of these hit `statement_timeout` (1.5 s) instead of returning rows: `xr_app` with no firm; `xr_app` as firm A reading `platform_firm`; `xr_app` as firm B updating firm A's row; `xr_admin` reading `platform_firm` and `platform_support_ticket`.
  - Afterwards FORCE was on everywhere and firm A read only `walls-a`.
- **FORCE is restored or rolled back on every path I tried:**
  - success (E3, E5, a Prisma run);
  - hidden orphan (the PR's B0-B2, and E4b with a member owner);
  - a constraint name already taken, so ADD CONSTRAINT failed after FORCE was lifted (E2a);
  - runner owns only 3 of the 4 tables (E2b; refused before any change);
  - lock timeout at the first LOCK (E2c) and at the ACCESS EXCLUSIVE step.
  - In all of these the end state was `11` (RLS enabled and forced) on all four tables and no PF-18bk key.
- **Tables that were not forced stay un-forced.** With `platform_staff` and `platform_support_message` set to NO FORCE beforehand, the result was `firm:11, staff:10, message:10, ticket:11`, with the 3 keys added.
- **Owner-role membership.** A member of the owning role with INHERIT FALSE was refused with the PF-18bk message and nothing changed. With INHERIT TRUE it saw the hidden orphan (stopped with the count `0,0,1`); once the orphan was removed it applied with FORCE restored.
- **The keys themselves now check every row.** With the count check removed from a copy and FORCE lifted, the key refused the hidden orphan (`violates foreign key constraint platform_support_message_firm_id_fkey`), and the walls stayed as they were.
- **Same end state on every runner.** pf18bk from main (BYPASSRLS) and from head (BYPASSRLS, NOBYPASSRLS owner, cluster superuser) left identical catalogs on all four tables. I compared tables (RLS flags, owner, ACL), constraints, policies, triggers and functions: one hash, 3,791 lines.
- **Full RDS-shaped deploy, then the walls checks from `rds-shape-check.sh`.**
  - `xr_app` with no firm reads 0 firms; as firm A it reads only `walls-a`; as A it updates 0 of B's rows.
  - `row_security = off` is refused; `ALTER TABLE … NO FORCE` is refused ("must be owner").
  - As firm A, inserting a ticket for firm B is refused; firm A sees 0 of other firms' staff or tickets.
  - The admin reads 0 support rows; no table has RLS enabled without FORCE.
  - The catalog is identical to the BYPASSRLS deploy; `migrate status` is clean.
- **Later migrations' keys and guards.** Every key added after pf18bk (pf18a, csdl3, fo10, pf18n, pf15b, fo6) is on a table created in the same migration, so it is empty when checked. The csk1 guard reads `case_client`, which has no RLS. qa741 updates `platform_plan`, which has no RLS.
- **The real RDS recovery path.** Main's pf18bk failed with P3018 / 42501, then deploy refused with P3009, then `migrate resolve --rolled-back 20261119170000_pf18bk_support_keys`, then a head deploy: exit 0. The applied row has checksum `e6e2fd91…`, the failed row is left alone, FORCE is on, and status is clean.
- **Checksum.** The F6 value equals the sha256 of the head file. A database that had pf18bk applied under main's text (`e71bb48d…`) is rewritten to `e6e2fd91…` by F6, and status is clean.

Verdict: Changes. Everything else held; M1 is the only Major. It becomes Approve if the lead records that the RDS database has no rows in `platform_subscription` or `fo_consultation_type` when this deploys, or accepts the silent-skip risk for those two backfills.
