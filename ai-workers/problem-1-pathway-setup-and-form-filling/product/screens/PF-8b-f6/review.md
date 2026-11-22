# PF-8b-f6: independent review (runtime lane, migration only)

PR #3060 · branch `claude/runtime-pf8bf6` · head reviewed **530c25e2a77189395dcad3b7833abc47561b0fbc** · the reviewer did not build it · 22 Nov 2026.
Scope: edit to `20261119170000_pf18bk_support_keys`, new `20261122040000_pf8b_f6_pf18bk_checksum`, new `tests/check_pf8b_f6_pg18_nobypass.ts`. The touch list holds: only `prisma/migrations/` and `tests/` change. No schema, key or policy change.
This is not a screen, so D1–D20, the BIC-01–20 scorecard, keyboard, 1024 px and the graph do not apply (N/A). This file records the review and the journey score together, as the caller asked for one file only.

## What I ran (PostgreSQL 18.3, /usr/lib/postgresql/18/bin, throwaway clusters on 15541–15560, never :4400)
| run | result |
|---|---|
| `npx tsx tests/check_pf8b_f6_pg18_nobypass.ts 15541`, run 1 | 24/24, exit 0 |
| same, run 2 | 24/24, exit 0 |
| `npx tsx tests/check_pf8b_f5_pg18_grants.ts 15551` | 14/14, exit 0 |
| `npx tsx tests/check_pf8b_f4_migrations.ts` | 9/9, exit 0 |
| `sha256sum` of pf18bk | `e6e2fd91…f32257`, the value F6 writes |
| **Own repro, blind validation.** Owner role `own` is NOSUPERUSER NOBYPASSRLS. Tables `p` and `c` are ENABLE+FORCE, with a policy that hides every row from it. `c` holds an orphan `pid=999`. Then `ALTER TABLE c ADD FOREIGN KEY (pid) REFERENCES p` | **The key is added over the orphan.** The builder's claim holds on 18.3 |
| same, after `NO FORCE ROW LEVEL SECURITY` on both tables inside the transaction | `23503 … Key (pid)=(999) is not present`. After ROLLBACK, `relforcerowsecurity` is `t` on both again |
| role `mig` with INHERIT membership in `own` (not the owner itself) | `pg_has_role(...,'USAGE')` = t. It may run `NO FORCE`, then it sees both rows and the key fails on the orphan |
| role `mig2`, member WITH INHERIT FALSE | `pg_has_role USAGE` = f, so pf18bk's guard stops it (ALTER would fail anyway with "must be owner") |
| locks held after `NO FORCE` in the transaction | AccessExclusiveLock until commit |
| session X: `BEGIN; SELECT FROM p; …; INSERT INTO c`, run against the migration's `LOCK p,c SHARE ROW EXCLUSIVE; ALTER TABLE p NO FORCE` | **deadlock detected.** Here X was aborted; the migration could equally be the one aborted (see m1) |
| CI on head (REST check-runs) | pr-rules, guard, module-cards, outside-wave and CodeQL python/actions succeeded. CodeQL JS was still running. The main suite jobs (`ci`, `fast`, `regression`) were skipped on the PR, presumably for the merge queue. I did not see full CI green |

## Judgement on the questions asked
- **Is the deviation justified?** Yes. The row's NOTICE design would have let the keys in blind, which is exactly the failure that review m1 of PF-18bk guarded against (repro above). Lifting FORCE for an owner is the smallest change that keeps orphans refused without BYPASSRLS. The builder recorded the deviation with evidence in the PR body, so it was not silent.
- **Is lifting and restoring FORCE safe?**
  - `ALTER TABLE … NO FORCE` is transactional and holds ACCESS EXCLUSIVE until commit. No other session can read the tables while FORCE is off, let alone see them unforced.
  - Any error (the orphan RAISE, a key failure) rolls the whole DO statement back, FORCE included. My repro shows this, and the check's B0–B2 confirm FORCE is intact after a stopped run.
  - Only the tables that had FORCE get it back: `forced` is read from `relforcerowsecurity` before the lift.
  - Checking ownership with `pg_has_role(current_user, relowner, 'USAGE')` matches PostgreSQL's own rules. Both the ALTER ownership check and the RLS owner exemption use has-privileges-of-role (INHERIT membership), as tested above.
  - The one new risk is the lock upgrade from SHARE ROW EXCLUSIVE to ACCESS EXCLUSIVE (m1).
- **Is the superuser/BYPASSRLS path identical in effect?** Yes. For a superuser, `forced` stays `{}`, so both loops do nothing. The only textual change on that path is that LOCK now runs before the guard, which makes no difference to that runner. The check's case C keeps the counts message.
- **Is the checksum migration right?** Yes. It writes the file's sha256 only for a finished row holding another checksum (`finished_at IS NOT NULL`), so the failed RDS row is left alone. That row is cleared with `migrate resolve --rolled-back 20261119170000_pf18bk_support_keys`, as the PR body says. This is the same pattern as F4 and F5. The check pins the literal to the file.
- **Is the test faithful?**
  - It is a fair emulation of the RDS state. PostgreSQL refuses pf12's BYPASSRLS role creation for a non-BYPASSRLS admin, so the check applies the migrations before pf18bk with BYPASSRLS, then removes BYPASSRLS before deploying the rest.
  - A real behavioural failure (B0–B2) would catch both the NOTICE design and a missing lift. The text rule plus its self-test catches FORCE not being put back.
  - `run-suites.sh` picks the check up by its usage line, the same form as F5, and no other suite uses default ports 15441–15442.
  - Gaps are in m4.
- **Did the builder check later migrations for the same guard?** None has it (grep for `rolsuper`/`rolbypassrls`). Every later `ADD FOREIGN KEY` sits on a table created in the same migration, so it validates an empty table and blind validation does not matter. `csk1`'s `VALIDATE CONSTRAINT` is a CHECK constraint, which scans the heap directly, not under RLS. The builder's open question about blind data UPDATEs is correct and rightly left out of this row (see Note).

## Findings
**Blockers:** none.
**Majors:** none.
**Minors:**
- **m1. Lock upgrade on the RDS path.** `pf18bk/migration.sql:29` takes SHARE ROW EXCLUSIVE, and then `:37` (`ALTER TABLE … NO FORCE`) needs ACCESS EXCLUSIVE. This creates two problems:
  - A concurrent transaction that has read one of the four tables and then writes another deadlocks with the migration (reproduced above). Either the app transaction or the migration is aborted. If the migration is the one aborted, it fails all-or-nothing, and the operator must run `resolve --rolled-back` again and redeploy.
  - Readers also block for the whole count and validation window.

  Both are safe (nothing is half done) but avoidable. Fix: take `ACCESS EXCLUSIVE` up front when the runner is neither superuser nor BYPASSRLS, for example by choosing the LOCK mode in the guard's branch. The BYPASSRLS path keeps SHARE ROW EXCLUSIVE.
- **m2. Stale folder name in the HINT** (`pf18bk/migration.sql:52`): it says `prisma migrate resolve --rolled-back 20261119010000_pf18bk_support_keys`, but the folder has been `20261119170000_…` since re-stamp a5a2a8e68. This predates the PR, but the hint now matters: it is the operator's path on RDS when an orphan is found, and run as written it fails with "migration not found". The file is already being re-checksummed, so the fix costs one line plus updating the sha in F6 and the check. Otherwise it needs its own checksum migration later.
- **m3. The PR body's sha is wrong.** It says pf18bk's new sha256 is "`5e…`". The file and F6 both hold `e6e2fd919f5d…f32257`. Correct the PR body; nothing in the code is wrong.
- **m4. Test gaps (low risk):**
  - Every case has all four tables forced, so "restore only the tables that were forced" is never exercised. A case with one table set to NO FORCE beforehand, which must stay NO FORCE afterwards, would pin it.
  - A's "the admin still reads no support row and no firm through the walls" holds trivially: `xr_a` holds no rows, so it would pass with the walls down. Seed one firm row as the superuser first.
- **Nits:**
  - A runner without table rights now gets LOCK's `permission denied for table platform_firm` before pf18bk's own 42501 message. It is still 42501 and still changes nothing.
  - The loops re-resolve `relname` through `search_path`; `c.oid::regclass` would be exact.
  - One comment line in pf18bk runs to about 220 characters.

## Note for the tech lead (not a finding for this row)
The builder's question lists three later data migrations that update no row under FORCE for a non-BYPASSRLS owner. The same applies to data migrations on walled tables *before* pf18bk that already ran on RDS without BYPASSRLS. That is harmless on an empty staging database, but the proposed follow-up row should audit both sides of pf18bk.

## Journey test (reviewer role, operator journey: there is no UI)
Journeys I checked through the check and my repros:
1. The RDS admin deploys after the P3018 failure: resolve, then deploy, exit 0, three keys, walls as they were.
2. An orphan hidden by the walls stops the deploy with its counts, and nothing changes.
3. A superuser deploy is unchanged.
4. A non-owner runner is refused with 42501.
5. An old lane copy gets the checksum fixed by `deploy`.

| criterion | score | evidence |
|---|---|---|
| task completed | 1 | A: deploy exits 0 as NOBYPASSRLS, runs 1 and 2 |
| next step obvious | ½ | the counts message names the queries, but the hint's resolve command names the old folder (m2), and the P3009 resolve step is only in the PR body |
| plain words | 1 | the counts message is unchanged and readable |
| feedback and state | 1 | the stop says "nothing changed", and that is true (B0–B2) |
| correct data | 1 | keys only with no orphans; FORCE restored; checksum = sha256 |
| error recovery | ½ | all-or-nothing rollback is proven; the deadlock retry (m1) and the stale hint (m2) cost the operator a step |
| accessibility and screen sizes | N/A | no UI |
| speed | 1 | the check's full deploy took about a minute on the throwaway cluster; the lift itself takes milliseconds |
| visual quality | N/A | no UI |
| trust and sources | 1 | the deviation is backed by a reproducible PostgreSQL 18 run (confirmed independently) |

**Score: 7 of 8 applicable, 8.75/10 scaled. Pass (8 or more, no 0).** I could not check the real AWS re-run on xr-staging, which stays the proof on RDS.

**Verdict: Approve.** No open Blocker or Major. Fixing m1–m3 is recommended; m2 is cheapest now, while the checksum is changing anyway.

Reviewer: Approve 530c25e2a77189395dcad3b7833abc47561b0fbc
