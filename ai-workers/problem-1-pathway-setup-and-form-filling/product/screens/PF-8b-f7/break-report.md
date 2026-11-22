# PF-8b-f7 break report (PR #3068, head d2f6a8eb6)

Breaker pass on the migration-only change: ten applied migrations lift FORCE ROW LEVEL SECURITY and PF-12's gate `0_pf12_firm_first` inside their own DO statement when the runner is neither superuser nor BYPASSRLS. There is also a new checksum migration and a new guard, `tests/check_pf8b_f7_data_walls.ts`.

Tested on throwaway PostgreSQL 18.3 clusters, ports 15670–15671 (:54329 was not touched). The test's pattern was followed each time: the migrations before X deployed by xr_admin with BYPASSRLS, rows seeded as postgres with `session_replication_role = replica`, `ALTER ROLE xr_admin NOBYPASSRLS`, then X deployed. Scratch scripts were kept out of the repo. No files were edited except this report.

Out of scope (P-26): this is a migration-only item, so screens, keyboard, 1024 px and zoom do not apply. The guard's pf18bk finding is expected (#3060 is not on this branch).

## Findings

### Blocker
None.

### Major
None.

### Minor
1. **The non-superuser path rewrites the gate's trigger state to plain ENABLE (`O`).**
   - Where: e.g. `prisma/migrations/20261117030000_fo9a_duplicate_match/migration.sql:66,70`, and the same lines in all ten migrations.
   - The guard query skips only `tgenabled = 'D'`, and the way back is plain `ENABLE TRIGGER`.
   - Tried: set the gate to `ENABLE ALWAYS` on fo_person before fo9a, and to `ENABLE REPLICA` on fo_assignment_rule before fo10p2. Then ran both migrations with each runner type.
   - Expected: the state is unchanged afterwards, as on the BYPASSRLS path.
   - Actual:

     | Runner | fo_person (was A) | fo_assignment_rule (was R) | Gate states at the end |
     |---|---|---|---|
     | BYPASSRLS | A | R | `O:81 R:1 D:1 A:1` |
     | NOBYPASSRLS | **O** | **O** | `O:83 D:1` |

   - Effect: an `A` gate (fires even under `session_replication_role = replica`) is silently weakened to `O`. An `R` gate becomes active in ordinary sessions.
   - No migration on main sets A or R today, so this only bites a DBA-set state. A `D` gate does stay `D` (checked on fo_availability_set).
   - Fix direction (not applied): record each table's `tgenabled` and restore it (`ENABLE ALWAYS` / `ENABLE REPLICA`), or lift only where `tgenabled = 'O'`.

2. **The guard's text rule accepts lift blocks that are wrong, and statements it cannot see.**
   - Where: `tests/check_pf8b_f7_data_walls.ts:50,61-64`. Its own self-test helper `lift()` (`:80`) never fills `lifted` and takes no lock, yet counts as a correct lift.
   - Tried: ran the guard's `audit()` on made-up migrations against a walled table `w` (scratch copy of the function).
   - All of these are **reported as guarded or not seen at all**. Only the control, a bare UPDATE, was flagged:
     - an inverted condition, `IF (SELECT q.rolsuper OR q.rolbypassrls …)`, which lifts only for runners that don't need it
     - the lift inside `IF false AND …`
     - `lifted` never filled and no `LOCK … ACCESS EXCLUSIVE`
     - `EXECUTE format('UPDATE %I …', 'w')`
     - `MERGE INTO "w"`
     - a one-off function that updates `w`, then `SELECT tmp_fill()`
     - a view over `w` read by an UPDATE
     - `';'` or `'--'` inside a literal ahead of `FROM "w"`
     - a `<<label>>` before the statement
     - `COPY "w" TO`
   - Each of these would make the walled-table statement silently skip rows on RDS, the same failure as breaker M1 on #3060.
   - No current migration uses any of these patterns. Checked: every call to a function or view that reads walled tables, after PF-12, is inside a trigger body. There are no top-level MERGE/COPY/EXECUTE data statements on walled tables.
   - The database part checks behaviour for only five hard-coded migrations, so a future migration relies on this text rule alone.

3. **The guard's database test does not cover five of the ten edited blocks.**
   - Missing: both fo7mv blocks, fo7ts_money_settings, fo7ts_card_terminal_trust and fo3a_set_name_unique (`tests/check_pf8b_f7_data_walls.ts:142` `windows`).
   - I ran them myself (see "What held"). They hold, but nothing in CI keeps them holding.

4. **The "PF-8b F7" phrase is a trap for future migrations.**
   - Where: `tests/check_pf8b_f7_data_walls.ts:92`.
   - Any migration containing the text `PF-8b F7` counts as "edited by F7", so its sha256 must appear in `20261122050000_…checksums`.
   - A new migration that copies the template, comments included, therefore fails the guard. The author must either strip the phrase or edit F7's already-applied checksum migration. This is a code read, not run.
   - #3060's pf18bk version says "PF-8b F6" only. With it swapped in, this guard reports `unguarded: []` and 20 guarded statements, so the two PRs do not collide.

5. **qa644's lock is stronger on the non-superuser path.**
   - Where: `prisma/migrations/20261122033000_qa644_reserve_staging/migration.sql:14,19`.
   - Tried: an xr_app transaction (with app.firm_id) read platform_firm_web_address and stayed open. Meanwhile qa644 was deployed by the NOBYPASSRLS owner.
   - Actual: `canceling statement due to lock timeout` after about 6 s.
   - On the superuser path, SHARE ROW EXCLUSIVE does not conflict with readers, so the same deploy would succeed.
   - The failure is loud, rolls back and can be retried; FORCE and the gate stayed intact.
   - The other nine blocks have no lock_timeout. On a live RDS database, their ACCESS EXCLUSIVE lock queues behind any open reader and blocks that table's readers until the migration commits. That matters only if these migrations first run on a database that has traffic.

## What held
- **Superuser/BYPASSRLS end state equals main.** I deployed main's 144 migrations and this branch's 145 with a BYPASSRLS admin, then compared catalog fingerprints: tables, RLS/FORCE, owners, ACLs, columns, triggers with `tgenabled`, policies, function source md5, security-definer flag and owner, constraints, indexes, views and roles. All 8,630 lines were identical.
- **Upgrade path.** On a database migrated with main, deploying the branch applied only the F7 migration. Its `_prisma_migrations` checksums then equalled a fresh branch deploy, and `prisma migrate status` reported "Database schema is up to date!"
- **Same seed, same results in both modes.** BYPASSRLS versus NOBYPASSRLS, rows hidden from xr_admin:
  - fo7mv block 1 stops on a correction of a deposit.
  - fo7ts_money_settings stops on `trust_enabled = true`.
  - fo7ts_card_terminal_trust stops on a CARD_TERMINAL payment into trust.
  - fo3a_set_name_unique renames `normal  HOURS` to `normal  HOURS (2)`, bumps the version to 2 and writes the `availability.set_renamed` audit line.
  - fo9a fills `name_key = ada lovelace`.
  - fo10p2 sets `turn_no = 1` and `turns = {staff: 1}`.
  - The PR's own test passes its 5 windows and the qa644 window on port 15670.
- **FORCE and the gate are restored on every failure tried.** A data check raising (fo7mv, fo7ts ×2), a trigger raising mid-UPDATE (a temporary `zz_boom` on fo_assignment_rule during fo10p2), and qa644's lock timeout all left `force = true` and `gate = O` afterwards. After a full non-BYPASSRLS run, 84 tables are forced.
- **Nothing leaks across firms while the walls are lifted.** The fo3a_set_name_unique deploy was held inside its DO block (after the lift, by locking `workspace`). The migration held AccessExclusiveLock on fo_availability_set. Other sessions still saw `relforcerowsecurity = true` and the gate `O`. These all blocked until timeout:
  - xr_app read without a firm
  - xr_app read and cross-firm insert with firm B
  - xr_admin's own read

  Afterwards, xr_app (firm B) sees 0 rows and xr_admin sees 0.
- **Disabling the gate lets nothing through that the superuser path would refuse.** `platform_firm_first` is the only trigger whose behaviour depends on the role (catalog search for rolsuper, rolbypassrls, current_user). Only that trigger is disabled, by name. The others still fired: fo_person_keys filled name_key, and the version/audit triggers ran. Trigger functions on firm tables run as xr_wall_reader, which has BYPASSRLS.
- **Each block names every walled table it touches.** None of the edited blocks reads or writes a walled table missing from its `walls`. audit_event, workspace and the case tables are not forced; fo_availability_set is not yet walled when fo3a_hour_sets inserts into it.
- **Wall detection is complete.** The tables the guard's text finds as walled are exactly the 84 forced tables in a migrated database. No unguarded data statement remains except pf18bk (expected).

Verdict: Approve
