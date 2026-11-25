# R1.60 part a1: independent review, round 3 (PR #3681, diff only)

Head reviewed: `a2f21789b2d3d70825708c3837310a33b31d5b17` (`claude/runtime-r160-a1`). Diff reviewed: `git diff cf13fc383..a2f21789b`.
- Code: one hunk in the migration's function, one hunk in `check_r160_deposit_prepare.ts`.
- Records: round 2's own review and journey report.
- Allowed by the Lead in PR comment 7155224865. The builder's answer to round 2 is PR comment 7155033702.
- Round 2: `review-a1-r2.md` (Changes, M2).
- API only: D3, D7-D14, BIC-01-20, 1024 px, 200 % zoom and keyboard are N/A.

**Verdict: Approve (Ship).** M2 is resolved. No Blocker or Major is open. Two new Minors (m11, m12) can be named or fixed later.

## What I ran (Postgres 127.0.0.1:54329, scratch databases only, all dropped; never :4400)
| Suite | Result |
|---|---|
| `check_r160_deposit_prepare.ts` | **47 passed, 0 failed** |
| `check_fo7ts_money_settings.ts` | **157 passed, 0 failed**. DW9 is all green: log lines 39-44, including "an unsent request's version may change" and the 23505 race. |
| `check_fo7a_money_schema.ts` | **122 passed, 0 failed** |
| `check_fo7t_trust.ts` (regression) | 62 / 0 |
| `check_fo7t_money_out.ts` (regression) | 51 / 0 |
| `check_pf12_walls.ts` (regression; it deletes across firms as `xr_app`) | 110 / 0 |

I also ran a raw-SQL probe on a fully migrated scratch database:
- A prepared unsent request: the delete is refused with the new message.
- A prepared request that was then cancelled: the delete is refused.
- A non-prepared request that names a version: it still deletes.
- Clearing a prepared request's version is refused by `money_trust_request_prepared_check`.
- **Moving a prepared request's version to another id is accepted** (m11).

CI on this head: the PR is a draft, so only the guard set ran (green). The suites run when the PR is marked ready and in the merge queue.

## Round-2 finding
| Round 2 | Status at a2f21789b | Evidence |
|---|---|---|
| M2: the new guards broke FO-7ts DW9 | **Resolved** | See below. |

How M2 was resolved:
- The insert guard ("a version only on a prepared insert") is removed, and so is the update guard ("the version never changes").
- I extracted `money_trust_request_write()` from fo7ts (`20261118200000…/migration.sql`) and from this migration, and diffed them. What remains is exactly R1.60's additions:
  - the prepared-delete guard (`migration.sql:24-28`);
  - `prepared_at := now()` on insert (`:40`);
  - the two new columns in the cancelled tuple (`:47-48`);
  - `prepared_at` in "the times are the database's" (`:51`);
  - `estimated_tax_minor` in the money-recorded amount check (`:69`).
- **Every version rule is fo7ts's, byte for byte:** one per version (the index); a sent request's version never changes (`:63-65`); an unsent request's version may change.

## The remaining guard against legitimate operations (`migration.sql:26-28`)
No legitimate path deletes a prepared request, so the guard refuses none.
- **`api/src`:** nothing deletes trust requests (no `delete`, `deleteMany`, raw `DELETE` or `TRUNCATE`). Cancel (`trust/service.ts`) is an update.
- **Demo reset** (`demo.ts:556-605`, `Demo.wipe`, plus `sweepOrphans` `:611-625`): it deletes by `workspace_id`. `money_trust_request` has no `workspace_id` (fo7a `migration.sql:211-231`, plus fo7ts `:80` and this migration's `:13`), so neither the wipe nor the sweep reaches the table.
- **The other reset and seed paths:** `platform/identity/demo-reset.ts` only rewrites settings. `seed-sample-firms.ts` and `sample-seed.ts` delete nothing.
- **Foreign keys:** the table's only one is `firm_id` to `money_payment_settings`, `ON DELETE RESTRICT` (fo7a `:409`). The two that point at it (payment, trust entry; `:397`, `:421`) are RESTRICT too. So no cascade delete can reach a prepared row. `TRUNCATE` was already refused by FO-7a's `money_insert_only()`.
- **Tests:** the only deletes are:
  - `check_r160…:239` and `:241`, the new pair;
  - `check_fo7a_money_schema.ts:393`, on a pre-R1.60 demo row with `prepared_at` null, already refused as sent;
  - `check_pf12_walls.ts:255`, firm B's rows as firm A, which row-level security filters out before any trigger.
- **Cancelled prepared request:** the guard refuses its delete too. That matches DW9's "a cancelled request still holds its version" (cancel is the path, AG-6-61 rule 10).

## Test change (`tests/check_r160_deposit_prepare.ts:238-242`)
- **Fail:** deleting `q1` is refused, and the row is still there (`count = 1`). `q1` is prepared, unsent and not cancelled (asserted `:136`), so the sent rule cannot be what refuses it: the new guard is exercised.
- **Pass:** #3033's staff request (`staff7`, no `prepared_at`) still deletes. Its version may still change, which proves the FO-7ts rule is unchanged. Both are inside `begin … rollback`.

Removing the guard turns the fail line red: with no guard, the delete of an unsent row passes `:21`. So the rule has a pass and a fail.

## `rollback.sql`
It is unchanged in this diff (`git diff cf13fc383 a2f21789b -- …/rollback.sql` is empty). Its function body is still byte-identical to fo7ts's (re-diffed at this head). The definer, `search_path` and owner are restored. It is exercised at `:279-289`: the rollback, #3033 still saves, then forward again. All of these pass.

## Findings
| # | Sev | Where | Finding and fix |
|---|---|---|---|
| m11 | Minor | `migration.sql:55-61`; test title `check_r160…:238` | **Unnamed:** the narrowing also gives up the "B4's key never moves" half of breaker m5, for **prepared** requests. A prepared request is unsent, so FO-7ts's rule lets its `retainer_version_id` be moved by raw SQL (probe: accepted). That frees the old version, and a later re-delivery for it would prepare a second deposit. No app path writes the version on update; the only writer is `on-signed.ts:80-82`, on insert. So this is raw SQL only, the same class as breaker m5. The fail test's title "so its version stays held" overclaims. **Fix (either one):** (a) add it to the PR's named gaps; or (b) a later item adds `IF OLD.prepared_at IS NOT NULL AND NEW.retainer_version_id IS DISTINCT FROM OLD.retainer_version_id THEN RAISE`. That narrows only R1.60's own state and does not touch DW9, whose rows are never prepared. Acceptable for a1 either way. |
| m12 | Minor | `check_r160…:239` | `/never deleted/` also matches the sent rule's message (`:22`). The test is correct today because `q1` is unsent, but if a later change sent `q1` first, the guard could go without the test noticing. **Fix:** match `/of a signed retainer is never deleted/`. |

The named gaps in PR comment 7155033702 (review r2 m9 and m10 added, plus breaker m5's "a version on a non-prepared request stays allowed, FO-7ts rules it so") are acceptable for a1. m11 belongs beside the last of them.

## D1-D20 (API only, changed by the diff; 1-5)
- D1: 4. Unchanged.
- D2: 4, down from 5. The prepared request is never deleted, but its version can still be moved by raw SQL (m11).
- D4: 5.
- D5: 4. Unchanged; the retry is a named gap.
- D6: 5.
- D15: 5. The FO-7ts contract is kept and stated in the migration comment `:24-25`.
- D16: 4, up from 3. Every touched suite is green, and the new rule has a pass and a fail (m12 is a tightening).
- D18: 4.
- D19: 4. The rollback is still exact.
- D17, D20: simulated only.
- D3, D7, D8-D14: N/A.

## Journey score: 8.75/10 (pass)
7 of the 8 criteria that apply, scaled to 10; no criterion at 0. Detail: `screens/R1.60/journey-test-reviewer-a1-r3-2026-11-25.md`.

## Not checked
- `tsc` on `api/`: CI's types job was skipped on this draft head.
- `graph.mjs`: it rewrites `qa/graph.json`, which is outside this review's files.
- Suites outside the money, signing and walls set. The diff changes only a trigger function's delete and insert/update branches.

Reviewer: Approve a2f21789b2d3d70825708c3837310a33b31d5b17
