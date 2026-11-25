# R1.60 part a1: independent review, round 4 (PR #3681, diff only)

Head reviewed: `703c3bdccc43798f9461b747de6d9bd752828e88` (`claude/runtime-r160-a1`, equal to `origin` after `git fetch`). Diff reviewed: `git diff a2f21789b..703c3bdcc`, 4 files.
- Allowed by the Lead in PR comment 7157957800. The two faults come from merge batch #3719 (PR comment 7157480475).
- Round 3: `review-a1-r3.md` (Approve at `a2f21789b`).
- API only: D3, D7-D14, BIC-01-20, 1024 px, 200 % zoom and keyboard are N/A.
- Run from a detached scratch worktree at `703c3bdcc` (removed afterwards); Postgres 127.0.0.1:54329, scratch databases only (none left); never :4400.

**Verdict: Approve (Ship).** Both merge-batch faults are fixed correctly and completely. No Blocker, Major or new Minor. Round 3's m11 and m12 stay as they were (Minor, named for later).

## What I ran
| Suite | Expected | Result |
|---|---|---|
| `check_b164_no_engine_keys.ts` | 67 / 0 | **67 passed, 0 failed** |
| `check_pf8b_f4_migrations.ts` | 9 | **9/9 passed** |
| `check_r160_deposit_prepare.ts` | 47 | **47 passed, 0 failed** (the two `retainer_signed_listener_failed` log lines are its planted faults, `:251`, `:261`) |
| `check_fo7ts_money_settings.ts` | 157 | **157 passed, 0 failed** |

Own probe on a fresh scratch database (every migration replayed in order with `psql -f`, then this migration's `rollback.sql -1`, then `migration.sql -1` again). After each of the three steps:
- `public`'s ACL is `{pg_database_owner=UC, =U, xr_data=U, xr_case_lookup=U}`: **no `xr_wall_reader` entry, so no CREATE left granted**;
- `money_trust_request_write()` is owned by `xr_wall_reader`, `SECURITY DEFINER`, `search_path=pg_catalog, public, pg_temp`;
- the two columns are there (2), gone (0), back (2).

Note on the probe: locally `has_schema_privilege('xr_wall_reader','public','CREATE')` is true at every step, before and after, because the local `xr_wall_reader` is a member of `xr_studio`, the database owner. That is the local cluster's setup and has nothing to do with this diff; the ACL is the real check, and it is clean.

## Fix 1: audit action names (B164)
- `api/src/client-money/trust/on-signed.ts:54` is now `trust_money.request_not_prepared`, and `:86` is `trust_money.request_prepared`; the header comment `:18` matches. This is the same `trust_money.` head that `trust/service.ts:91,110,136,201`, `money-out.ts:113,156`, `to-move.ts:116,142` and `reversals/reverse.ts:120` already use.
- **No reader is left on the old names.** I grepped `trust\.request_(not_)?prepared` in `api/src`, `tests`, `ports`, `web` and `prisma`. The only hit is the label text at `tests/check_r160_deposit_prepare.ts:144` ("one trust.request_prepared audit line"), which is allowed. Its query on `:145` uses the new name. The other `trust.request_*` hits are `trust.request_sent` in comments (`ports/events/client-money-trust.ts:3`, `tests/check_fo7t_trust.ts:8`), a proposed event name outside this PR.
- All six test queries were moved to the new names: `:145`, `:163`, `:166`, `:171`, `:186`, `:247`. Each is a count with an exact expected value (1, unchanged, or 1), so a wrong name would turn them red. 47/0 shows the listener writes the new names.
- Nothing in `web` reads either action, so no label map needs a new entry.
- Downstream: `claude/runtime-r160-a2` (`c7e7c2f73`) contains `703c3bdcc` and has no old name either.

## Fix 2: GRANT/REVOKE around handing the reader a function (PF-8b F4)
- `migration.sql:77-81`: `GRANT CREATE ON SCHEMA public TO xr_wall_reader;` comes before both `ALTER FUNCTION`s, and `REVOKE CREATE ON SCHEMA public FROM xr_wall_reader;` comes right after the `OWNER TO`. It is the last statement in the file.
- It matches `20261124140000_pf21d_erasure/migration.sql:155-171`: a grant, the ownership hand-over, then the revoke, with a comment naming PF-8b F4. The only difference is that it is two plain statements and not a `DO` loop, which is right for one function.
- `check_pf8b_f4_migrations.ts` (`:42-54`) finds the grant before the revoke and the revoke last in text; 9/9.
- **The revoke always runs.** It is unconditional, and the probe shows no grant is left after up, down or up again.
- A grant-then-revoke does not reduce the reader's earlier rights: F4 (`20261121230000`) had already taken CREATE back, so nothing explicit is lost.

## `rollback.sql`: exact apart from the pair
- The diff to `rollback.sql` is exactly the same three lines (comment, GRANT, REVOKE) at `:60-64`, around the two unchanged `ALTER FUNCTION`s. The function body, the constraint drops and the column drops are untouched since round 3, where the body was checked byte for byte against fo7ts's.
- fo7ts (`20261118200000`, before F4's stamp) did not need the pair. Adding it in the rollback leaves the same end state, which is the right call on RDS, where the `OWNER TO` would otherwise be refused.
- It is exercised by the suite (`check_r160…:279-289`: rollback, #3033 still saves, forward again; all pass) and by my probe.
- `check_pf8b_f4_migrations.ts` reads only `migration.sql` (`:11`), so nothing tests the rollback's pair. It is present and correct by reading and by the probe. That is a gap in the check, not in this PR, so I do not raise it as a finding.

## Regressions
None found. The diff changes only strings in one listener and its test, and adds a privilege pair around two existing statements. The migration's function body, constraints and columns are byte-for-byte what round 3 approved. FO-7ts DW9 is all green again (157/0).

## Findings
| # | Sev | Where | Finding |
|---|---|---|---|
| none new | | | |
| m11 (r3) | Minor | `migration.sql:55-61` | Open as in round 3: a Prepared request's version can be moved by raw SQL. Named gap. |
| m12 (r3) | Minor | `check_r160…:239` | Open as in round 3: `/never deleted/` also matches the sent rule's message. |

Optional, not a finding: the label at `check_r160…:144` could say `trust_money.request_prepared` to match its query.

## D1-D20 (API only, changed by the diff; 1-5)
D1 4 · D2 4 (m11 unchanged) · D4 5 · D5 4 · D6 5 · D15 5 (audit names follow B164's `trust_money.` head; F4's contract is kept) · D16 4 (all four suites green; both fixes are held by checks that fail without them) · D18 4 · D19 5, up from 4 (the rollback now also runs on RDS: the pair is in both files) · D17, D20 simulated only · D3, D7-D14 N/A.

## Journey score: 8.75/10 (pass)
7 of the 8 criteria that apply, scaled to 10; no criterion at 0. This is unchanged from round 3, because the diff changes no behaviour a user meets. Detail: `screens/R1.60/journey-test-reviewer-a1-r4-2026-11-25.md`.

## Not checked
- `tsc` on `api/`: the edit is string literals only.
- The full merge batch: CI runs it in the merge queue.
- `graph.mjs`: it rewrites `qa/graph.json`, which is outside this review's files.
- A real RDS run of the pair: the local cluster is a superuser setup (`tools/rds-shape-check.sh` is the RDS-shaped proof; I did not run it).

Reviewer: Approve 703c3bdccc43798f9461b747de6d9bd752828e88
