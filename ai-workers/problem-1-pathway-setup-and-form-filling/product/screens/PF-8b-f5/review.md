# PF-8b-f5 — independent review (runtime lane, migration only)

PR #2968 · branch `claude/runtime-pf8bf5` · head reviewed **3c0198ac3f452a46e9cc85ae2200f7219df577c7** · reviewer did not build it · 22 Nov 2026.
Scope: `20261116013000_pf12_firm_walls` edit, new `20261122030000_pf8b_f5_grant_loop`, `tests/check_pf8b_f4_migrations.ts` edit, new `tests/check_pf8b_f5_pg18_grants.ts`. Touch list respected (prisma/migrations/ and tests/ only).

## What I ran (PostgreSQL 18.3, /usr/lib/postgresql/18/bin, throwaway clusters, never :4400)
| run | result |
|---|---|
| head `npx tsx tests/check_pf8b_f5_pg18_grants.ts 15451` | 12/12, exit 0 (16 s) |
| same check on main's migrations (git archive origin/main into the scratchpad, same check file) | 4 failed, exit 1. B and C fail with `P3018` / `0LP01` `role "xr_wall_reader" is a member of role "xr_admin"` at `GRANT xr_wall_reader TO xr_admin` (AddRoleMems). **A passes on main as well.** |
| head `npx tsx tests/check_pf8b_f4_migrations.ts` | 9/9 |
| head `bash tools/rds-shape-check.sh 15461` (F4 regression) | all passed (21 lines) |
| superuser path, main vs head, fresh cluster: every `pg_auth_members` row for xr_* roles (grantor, admin, inherit, set), the reader's table rights, direct grants, default ACLs, CREATE on public, number of reader-owned functions | **identical** (reader in postgres INHERIT/no SET; 122 reader functions; no direct grants or default ACLs) |
| superuser, second database on the same cluster (CI packs, lane copies) | same end state as the first; deploy exit 0 |
| old database (main fully applied, pf12 checksum `33d69fc4…`), then head `migrate deploy` | F5 applied; checksum becomes `a120d42b…` (= file sha256); `migrate status` "up to date" |
| fresh database, head | pf12 row ends at `a120d42b…` (F4 first writes the stale `33d6…`, F5 then writes the current one, same deploy); `migrate status` clean |
| mutation: head's pf12 with `NOT su OR` replaced by `false OR` in the loop guard | **check still 12/12** (see m1) |

## Judgement on the questions asked
- **plpgsql, non-superuser path (RDS):** correct. With `NOT su`, PF-12 never runs `GRANT <migration role> TO xr_wall_reader`; it raises `insufficient_privilege` inside the same protected block, so the existing fallback (EXECUTE, DML, sequence rights, default privileges) runs, the same path vanilla PG 16+ already took and that `rds-shape-check.sh` proves. Then `GRANT xr_wall_reader TO <migration role>` cannot loop, because nothing made the reader a member of the admin. The recursive CTEs ignore INHERIT/SET, which matches PostgreSQL's own loop check. A missing reader gives NULL → no rows → EXISTS false. The RAISE inside the sub-block goes to that block's own handler as intended.
- **plpgsql, superuser path (CI, demo):** unchanged in effect (tested above). The new EXISTS only skips the grant when the superuser is already a member of the reader. PF-12 never creates that membership for a superuser, because `pg_has_role` is always true for a superuser, so the last grant never runs.
- **DROP ROLE / recreate of a leftover reader:** safe. Only for a non-superuser, and only when the reader already reaches the migration role. DROP ROLE checks `pg_shdepend` across the whole cluster (owned objects, ACLs, default ACLs, policies), so it refuses a reader that holds anything; the handler turns that into the named stop, and the whole DO block is one statement (scenario C proves it leaves the reader and its right untouched). It is justified as a defence only: the AWS failure rolled back in full (the PR says the RDS row was marked rolled back), so on RDS this path runs only after a manual step. It silently removes memberships *in* the reader held by other roles. That is acceptable for a role that "nobody may become".
- **Editing applied pf12:** safe, and it is the only option, since no later migration can run on RDS before pf12. `migrate deploy` and `status` never re-check applied files (old database shown above). F4 (20261121230000) always runs before F5 (20261122030000), so the latest writer wins on fresh and old databases alike. `check_pf8b_f4_migrations.ts` now pins pf12's sha to F5 and csw1's sha to F4. Residual, same as F4's precedent: `prisma migrate dev` run *before* `deploy` on an old copy would still ask to reset. `start.sh` runs `deploy`, so the demo and lane copies are fine.
- **Faithfulness of the emulation:** A is the faithful one for head on RDS: on vanilla, main and head take the same fallback, so A passes on both. B injects the reader→admin membership before the run. On main that gives the exact RDS error, but on head B exercises the drop-and-recreate path, **not** the `NOT su` skip that actually fixes RDS. Vanilla always refuses the in-loop grant, so no behavioural run here can tell whether that skip is there. The PR's Questions section is honest about this, and the AWS re-run stays the real proof. CI: the check is a `tests/check_*.ts` with a `tsx studio/tests/…` usage line, so `run-suites.sh` will run it. `cloud-setup.sh` puts PG18 at `/usr/lib/postgresql/18/bin` on both of its paths (apt and the npm fallback), which the check looks for first.

## Findings
**Blockers:** none.
**Majors:** none.
**Minors:**
- **m1 — the actual RDS fix is not pinned by a test.** Removing `NOT su OR` (pf12 line 113) leaves `check_pf8b_f5_pg18_grants.ts` at 12/12 (mutation run above), because vanilla refuses the grant anyway. Risk is low: pf12 is now checksum-frozen, so any further edit needs a new writer migration and fails `check_pf8b_f4_migrations.ts` without one. Fix (cheap, no new scope): a static assertion in the F5 or F4 check that the in-loop guard on `GRANT %I TO xr_wall_reader` starts with `NOT su OR`, plus a self-test line that shows the assertion fails without it, as F4's pairing rule does.
- **m2 — the hint is wrong for RDS.** pf12 lines 43 and 144 say "A superuser runs REVOKE … FROM xr_wall_reader once". RDS has no superuser; the grantor (the admin itself, which RDS let grant) is who would revoke. Better wording: "The role that granted it, or a superuser, runs REVOKE …". Would apply only in a later pf12 edit; note it in the AWS runbook rather than re-editing the file just for this.
- **m3 — stale comments in pf12.** Lines 21-22 and 97-98 still say the reader holds the migration role's rights "by membership" and "where that grant is refused (RDS)". After F5 a non-superuser never attempts the grant. Lines 109-111 state the new rule correctly. No behaviour impact.
- **m4 — the last-grant loop guard (pf12 lines 139-145) is not exercised.** B is resolved by the first block's drop, C stops at the first block. It is reachable only through a chain picked up during the loop (for example xr_data reaching the admin). It is defensive and harmless; no fix asked.
- **Info:** on a fresh database F4 briefly writes pf12's stale checksum until F5 runs in the same deploy. A deploy that fails between them leaves a copy that `migrate dev` would want to reset; the next `deploy` repairs it. Line 151 could reuse `su` (cosmetic).

## Journey test (reviewer role)
**N/A, no score.** The change is migrations and a check, with nothing for a person to see or walk (the PR's "On the demo": deploy only applies the checksum migration). The caller limited my writes to this file, so no journey-test report was written. What stands in for a journey: the migration runs above, on every shape (non-superuser A/B/C, superuser fresh, second database, old database).

## Not checked
The real Amazon RDS 18.3 cluster: that is the AWS session's re-run of `migrate deploy` on staging, which the PR names as the proof. Why RDS accepts the non-superuser self-grant. Concurrent migrations from two databases on one RDS cluster during the drop path.

**Verdict: Approve** — no open Blocker or Major; m1–m4 are Minors (m1 is worth a follow-up row).

Reviewer: Approve 3c0198ac3f452a46e9cc85ae2200f7219df577c7
