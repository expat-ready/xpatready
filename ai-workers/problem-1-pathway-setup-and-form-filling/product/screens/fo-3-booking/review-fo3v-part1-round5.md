# Review round 5 (diff only, P-303): FO-3v part 1, PR #3418 at 8edbd7fee

Reviewer: Opus 5.5, fresh context (I did not build it). 26 Nov 2026. Scope: `git diff bd4ca3598 8edbd7fee` only. This round fixes B1 from round 4 (`review-fo3v-part1-round4-merge.md`). No page changed, so no journey was run. The round-1 journey score, 9.5/10 (`journey-test-reviewer-fo3v-part1-2026-11-24.md`), stands.

**Verdict: Approve** for 8edbd7fee375de6a7549d7b0e8a28ccb177d6b00.

## What the diff contains
Two files, 39 lines added, none removed:
- `prisma/migrations/20261126063100_shared__fo3v_video/migration.sql`, 3 lines added:
  - one comment line;
  - `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` directly before the existing `ALTER FUNCTION fo_video_drop_on_deactivate() OWNER TO xr_wall_reader;`;
  - `REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;` directly after it.
- `screens/fo-3-booking/review-fo3v-part1-round4-merge.md`, the round-4 record, which is a record only.

Nothing else changed. The stamp and the rest of the migration are the same as before.

## B1: fixed in full
- The migration has only one `OWNER TO xr_wall_reader` statement, and the pair now wraps it. The GRANT comes before the hand-over and the REVOKE comes after the last hand-over, which is exactly the order `unpairedText` in `check_pf8b_f4_migrations.ts` requires.
- The function is already created `SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp`, so there is no separate `ALTER FUNCTION ... SECURITY DEFINER`, unlike r196.
- The pattern matches `20261125140100_client-money__r196_payment_plans`, lines 164 to 175 (GRANT, then the owner changes, then REVOKE). Here the window is narrower: it covers just the one statement.
- `REVOKE ALL ON FUNCTION ... FROM PUBLIC` still follows. That statement runs as the migration role, a member of the owner role, and the PF-8b F6 replay below passes with it.
- Editing a migration in place is safe here because the migration is not on origin/main (I checked origin/main's tree: 0 matches for `fo3v_video`).

## Other checks that read migration text
I grepped `tests/` for checks that read migration files. Most suites only apply every migration to a scratch database. Those that parse the text of all migrations generally are:
- `check_pf8b_f4_migrations`
- `check_pf8b_f7_data_walls` (the FORCE-lift audit)
- `check_pf12_walls`
- `check_readiness_pass_codes`

I added `check_pf8b_f6_pg18_nobypass` because it replays migrations as a role without superuser or bypass. That is the case where the GRANT/REVOKE pair matters at run time. `check_fo3v_video` is the only check that names this migration.

`bash product/tools/run-suites.sh --only "..."` at 8edbd7fee, exit 0:

| Suite | Result |
|---|---|
| check_pf8b_f4_migrations.ts | 9/9 |
| check_pf8b_f6_pg18_nobypass.ts | 26/26 |
| check_pf8b_f7_data_walls.ts | 17/17 |
| check_pf12_walls.ts | 110 passed |
| check_readiness_pass_codes.ts | 4/4 |
| check_fo3v_video.ts | 32 passed |
| check_cssd1_no_drift.ts | 17 passed |

## Findings
No Blocker, no Major, no Minor.

The round-4 process gap is still open for the Lead and does not block this PR: `select-suites` does not pick `check_pf8b_f4_migrations.ts` when a migration changes.

**Verdict: Approve**
