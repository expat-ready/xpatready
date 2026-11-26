# R1.60 part a1: independent review, round 2 (PR #3681, diff only)

Head reviewed: `cf13fc383088b6bdca25d047a103b5fc8d6549b8` (`claude/runtime-r160-a1`). Diff reviewed: `git diff bd28f653a..cf13fc383` (code: `on-signed.ts`, `signed-hooks.ts`, the migration, the new `rollback.sql`, `check_r160_deposit_prepare.ts`). Round 1: `review-a1.md` (Changes, M1), `break-report-a1.md` (pass). API only: D8-D14, BIC-01-20, 1024 px, 200 % zoom and keyboard are N/A.

**Verdict: Changes (Ship after fixes).** M1 is resolved. One new Major (M2): the new trigger guards break an existing suite, `check_fo7ts_money_settings.ts`, which stops at DW9. No Blocker.

## What I ran (Postgres 127.0.0.1:54329, scratch databases only, all dropped; never :4400)
- `tests/check_r160_deposit_prepare.ts`: **47 passed, 0 failed**.
- `tests/check_fo7ts_money_settings.ts`: **crashes after 38 PASS** at `:249`: `ERROR: money_trust_request: only a deposit request prepared by a signed retainer names its retainer version` (migration `:40-41`).
- The same suite with only DW9 (`:246-265`) cut out, in a scratch copy (with a plain sent `r2` kept for DW11): **151 passed, 0 failed**. 157 - 6 = 151, so DW9 is the only part this head breaks.
- These were all 0 failed: `check_fo7a_money_schema` 122, `check_fo7t_trust` 62, `check_fo6_signing_api` 57, `check_ports_events` 31, `check_fo5_retainers` 248.
- CI on this head: the suites were skipped (draft), so nothing shows M2 yet. The merge queue runs the full set, so its batch would go red.

## Round-1 findings, one by one
| Round 1 | Status at cf13fc383 | Evidence |
|---|---|---|
| Review M1: no recorded rollback | **Resolved** | `rollback.sql:8-60`: I diffed it against fo7ts `migration.sql:153-202`, and the function body is byte-identical. No migration between the two redefines `money_trust_request_write()`; I grepped every `migration.sql`. `:62-63` set SECURITY DEFINER, the pinned `search_path` and the `xr_wall_reader` owner again, as fo7ts `:269-272` does. `:65-66` drop both CHECKs, then both columns, which is everything the migration adds (`migration.sql:13-16`; the rest is the function). It runs in one transaction (`-1`), and the header names the order (after a2 and b) and the `_prisma_migrations` row. It is tested at `check_r160…:279-289`: rollback, then #3033 still saves, then forward again. |
| Review m2 + breaker m2: the held line promised a catch-up | Fixed | `signed-hooks.ts:40`: "is not tried again by itself: a person makes what it would have made (no catch-up yet)". The retry itself is a named gap. |
| Review m3 + breaker m3: parse outside the savepoint; the catch could throw | Fixed for the reachable cases (residual m9) | `signed-hooks.ts:33` parses inside the try, and `:36-37` naming the fault cannot throw. Test `:260-264`. The 5 s timeout part of breaker m3 is not addressed or named (m10). |
| Breaker m4: size check without the tax | Fixed | `on-signed.ts:74`. This is Number arithmetic, and both operands are at most 2^31, so it is exact. Fail and pass at `:244-249` (2,147,483,647 refused; 1,900,000,000 + 247,000,000 prepared). |
| Breaker m5: the database did not keep B4's key | Fixed, but it regresses FO-7ts (M2) | `migration.sql:24-27` no delete; `:40-42` a version only with `prepared_at`; `:49-51` the version never changes. Test `:238-243`. |
| Review m7: not registered, so tax 0, untested | Fixed (that part) | `:266-272`. The other parts of m7 (the B4 index-drop plant, case 4 "Ready to bill", case 6 `OTHER`) are not named (m10). |
| Review m8: PR body names | Fixed | The PR body now names `20261125060000_client-money__r160_trust_request_prepared` and `MODULE.rows/R1-60-a1.md`. |

## The new guards against legitimate #3033 / FO-7t operations
I grepped `api/src` for every write to `money_trust_request`. No path in the app is refused:
- `trust/service.ts:108` (#3033 create): `RequestIn` has no version, so the insert passes `:40`.
- `trust/service.ts:135` (cancel): the update leaves the version alone, so it passes `:49`.
- `trust/on-signed.ts:79-81` (R1.60): sets `prepared_at`.
- `front-office/duplicates/merge/columns.ts:51-52`: STAYS, never written.
- No `delete`, `deleteMany` or truncate of the table anywhere in `api/src`; truncate is refused by FO-7a's trigger.
- `retainer_version_id` has no foreign key (no `ON DELETE SET NULL` that `:49` would refuse), so a cascade cannot trip a guard.

The guards do refuse FO-7ts's own database contract, which its suite still asserts (M2).

## Findings
| # | Sev | Where | Finding and fix |
|---|---|---|---|
| M2 | **Major** | `prisma/migrations/20261125060000_…/migration.sql:40-42,49-51`; `tests/check_fo7ts_money_settings.ts:246-265` | **Regression:** FO-7ts DW9 contradicts the new rules. It inserts sent requests that name a version (`:249`, `:252`, `:263`) and asserts "an unsent request's version may change" (`:257`). It also expects messages and codes the new guards now pre-empt: 23505 at `:250` and `:264`; "a cancelled request … never changes" at `:255`; "sent request's party … retainer version" at `:260-261`. The suite crashes at `:249`, so DW10-DW31 never run, and the merge-queue batch would be red. This also changes FO-7ts's rule without saying so (CLAUDE.md: never deviate silently). **Fix:** keep the guards (B4, breaker m5) and rewrite DW9 to the new contract: write a version only on a prepared insert (`prepared_at now()`, `estimated_tax_minor 0`); keep the one-per-version 23505 case and the two-connection race; replace `:257` with its refusal; update the expected messages. State in the PR that R1.60 B4 supersedes FO-7ts DW9's "an unsent request's version may change" and "a sent request may be written naming a version". Then run the suite green. |
| m9 | Minor | `front-office/retainers/signed-hooks.ts:39-41` | The held line is written from the unparsed `signed` (`actor`, `retainerId`). Suppose a payload is malformed in exactly those fields. Then `audit.record` itself can throw outside any savepoint, and the signature is undone. Test `:262` plants only a bad `retainerVersionId`, which goes into `detail` JSON. It is unreachable from today's two callers, so it is acceptable for a1. Name it with the retry gap. |
| m10 | Minor | PR comment 7154847509 | The named gaps omit three things: review m1 (the suite never runs as `xr_app` behind the walls; round 1's probe passed), the rest of review m7, and breaker m3's 5 s transaction timeout. Add them to the list. Leaving them is acceptable for a1. |

**Judgement on the named gaps** (Needs you label and Home group, no retry, Prices include tax Q2, `reads.ts` Paid / Part paid): all four are acceptable for a1. a1 sends nothing and records no deposit against the estimated tax. The Needs you item belongs to FO-7s3 / PF-18n, and Paid / Part paid to a2. Each needs its X-row.

## D1-D20 (API only, changed by the diff; 1-5)
- D1: 4. Unchanged; the m4 gap of round 1 is named.
- D2: 5. B4's key is now held by the database too.
- D4: 5.
- D5: 4. A malformed payload is held; the retry is still a named gap.
- D6: 5. The not-prepared line names the tax reason.
- D15: 5.
- D16: 3, down from 4. A sibling suite is broken (M2); otherwise 47 checks, each with a pass and a fail.
- D18: 4.
- D19: 3.
- D17, D20: simulated only.
- D3, D7, D8-D14: N/A.

## Journey score: 8.75/10 (pass)
7 of the 8 criteria that apply, scaled to 10; no criterion at 0. Detail: `screens/R1.60/journey-test-reviewer-a1-r2-2026-11-25.md`.

## Not checked
- `tsc` on `api/` (it ran out of memory in round 1); CI's types job was skipped on this head.
- `graph.mjs`: it rewrites `qa/graph.json`.
- Suites outside the money, signing and ports set.

Reviewer: Changes cf13fc383088b6bdca25d047a103b5fc8d6549b8
