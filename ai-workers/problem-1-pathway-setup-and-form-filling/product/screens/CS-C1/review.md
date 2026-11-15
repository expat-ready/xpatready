# CS-C1a review (API only, no screen): decision, withdrawal, close, reopen, the two events

Reviewer: Opus reviewer, fresh context, 15 Nov 2026. PR #1818, branch `claude/eager-clarke-tw3hzj`. Reviewed **af33e80cbb791f215379e452836964369feb0b6a** (it covers 7f1b4190e, 02e6b0d2e, 27bc4a406 and af33e80). Read against brief `design/briefs/CS-C1.md` at 07d389c23 (part 1), AG-7-33, -34, -13, -50 (requirements-2026-11-02), contract v0.1 §4 and §7, Lead 58's ruling (PR comment 6892215478), `STANDARDS.md`.

**Verdict: Block.** No Blocker. Two Majors, both records with no logic change: the PR body and the migration's rollback note. Fix them and this can be approved without another code review.

## What I ran (all at af33e80, US$0, live AI off, no priced button, never :4400 or :4541)
* `tests/check_csc1_close.ts`: **47 passed, 0 failed** (46/46 at 27bc4a406).
* Neighbouring suites: `tests/check_pf4_identity.ts` on an isolated copy at :4437 (runtime lane ports): **118/118**. `tests/check_case_feed.ts`: **39/39**. At 27bc4a406 the first hook broke PF-4 break M1 (`/api/Platform/me` with a staff token answered 200, not 403). af33e80 narrows the hook to `path.startsWith("/api/runtime/")`, and a new H3 case covers it.
* Real server (isolated :4437, `main.ts` with auto-registered features). Staff Owner on a random case id → 404 `NOT_FOUND`. No token, or `x-actor` only → 401 `NOT_SIGNED_IN`. Case Officer → 403 `MISSING_PERMISSION`. Staff bearer on undeclared `GET /api/runtime/cases` → 403 `link-only`.
* Break pass (temporary script, deleted afterwards):
  * 4 parallel closes → 200, 409, 409, 409, with one `case.closed`.
  * Decision racing a withdrawal, 5 runs → 201 and 409 every time, never both.
  * 3 parallel reopens → one 200, with one `case.reopened`.
  * A 2001-character note → 400. A non-English reason is kept exactly. An array body or a numeric date → 400.
* The real app and the test harness ran the same guard and service code. Only the probe controller in the test is a stand-in.

## The hook (Lead 58's four proofs)
The line is `core.ts:94`. It returns true only when the path starts with `/api/runtime/` (exact case) **and** the handler or class declares `PLATFORM_ACCESS`; PlatformGuard then authenticates and checks the keys. Today the only routes declaring access outside `/api/platform|front-office` are the four in `features/case-close.ts`, so nothing else opens. A mixed-case path falls through to the old refusal (403 `link-only`, or 401 from PlatformGuard).
1. No token → 401 on all four routes: H1. **Met.**
2. A link token is refused: H2 (401 `TOKEN_REFUSED`). It uses a random 43-character token rather than one minted by `person-link.ts`, which is enough because the staff identity checks a signature. **Met.**
3. An undeclared runtime route with a Bearer token → 403 `link-only`: H3, plus my real-server check. **Met.**
4. The why comment names CS-C1a and 6892215478: H4. **Met.**

## Brief and requirement fit
| Item | Result |
|---|---|
| DW1 decision on a submitted filing (submitted = C8.2 `filing_record`) | Met. 201 and one row; an unsubmitted filing → 409; a second decision is a new row (AG-7-33 §10) |
| DW2 key decides | Met in behaviour. The answer is 403 `MISSING_PERMISSION` (PF-4's guard, title "Not allowed"), not the brief's `NOT_ALLOWED`. The code is right ("behind PF-4's guard"), but the change is not recorded (M1) |
| DW3 withdraw | Met, and stricter than the brief: refused when **any** filing has a decision, not only when every filing has one. This matches AG-7-50 rule 4 and BR-20, since filing-level withdrawal is not built |
| DW4 close | Met. Refused until every active filing has a decision (AG-7-34 rule 2, "in After decision") |
| DW5 reopen | Met. Admin has no `agent/case:reopen` → 403; no reason → 400; the closing fields are cleared and the audit line keeps the old values (BR-15) |
| DW6 events in the transaction, rollback writes none | Met. The `beforeCommit` override forces the rollback |
| DW7 insert-only | Met. UPDATE, DELETE and TRUNCATE are refused; a cascade from the case deletes the rows; the firm and the filing are checked on insert |
| DW8 firm isolation 404, no token 401 | Met. Case locked by `firm_key`, then the platform firm id compared (`case-close.ts:55-65`) |
| W1 journey | Met. The outbox holds `case.closed`, `case.reopened`, `case.closed` in that order |
| AG-7-33 rule 5 (filing `status` → `DECIDED`; case to After decision) | **Not built.** Only noted in a code comment (`case-close.ts:7-8`). See m1 |
| Auto-close (AG-7-34 rule 1) | Not built, by Lead ruling; the PR body says so |
| P-610 cap | 671 changed lines including tests and `challenge.md`, so under 800 |
| Touch list | Two files are outside it and both are justified. The `core.ts` line has Lead 58's OK. `filings.prisma` has one back-relation line that Prisma requires. Neither is recorded in the PR (M1) |

## Findings
**Blocker:** none. (The PF-4 break-M1 regression in 27bc4a406's hook would have been one; af33e80 fixes it.)

**M1 Major: the PR body is stale, so the deviations are silent.**
* Evidence: the PR body still says "blocked … Nothing is built until the answer" and "Checks: None yet". It does not list `CS-C1 DW1`-`DW8` (the brief asks for that list in the body).
* It also does not record these changes from the brief:
  * `MISSING_PERMISSION` instead of `NOT_ALLOWED`;
  * withdrawal refused when any filing has a decision;
  * AG-7-33 rule 5 not built;
  * `case.reopened` carries no `reason` (m4);
  * the `core.ts` hook and the `filings.prisma` line are outside the touch list.
* The PR merges by itself on Approve and green CI, and the release holder reads it before the label (P-423).
* Fix: rewrite the body. Use the brief's first-line form, then the DW1-DW8 and W1 list, the hook (comment 6892215478), each change above with its reason, and the result lines of the suites above. No code change.

**M2 Major: the migration has no recorded rollback.** `STANDARDS.md` §5 [M] ("recorded rollback") is not met.
* Evidence: `prisma/migrations/20261115093000_csc1a_case_decision/migration.sql:1-10` has no `-- Rollback (in this order): …` paragraph, which the neighbouring migrations do have (`20261115013000_fo13_compliance_tables:19`, `20261114234500_pf21_complaints:17`).
* Fix: add the rollback in order:
  1. drop the triggers and the two `case_decision_*` functions;
  2. drop table `case_decision`;
  3. drop the three `runtime_case_*_check` constraints and the `closed_from_stage` foreign key;
  4. drop the six columns.

**Minor**
* **m1, AG-7-33 rule 5 not built and not recorded.** `case-close.ts:7-8` cites D9 Q54 (no filing stage field). However, `Filing.status` exists (`filings.prisma:48`) and rule 5 sets it to `DECIDED`. Not setting it is probably right: `case-prepare.ts:218,263` keeps only `SUBMITTED` filings safe from deactivation, and `review-rounds.ts:369` closes review only for `SUBMITTED`. So `DECIDED` would reopen those paths. Fix: put this reasoning in `challenge.md` and the PR body, and name the follow-up row. No code change.
* **m2, the withdrawal check ignores decisions on inactive filings.** At `case-close.ts:60,119`, a decided filing set inactive by SQL let the case close `WITHDRAWN` (break B4: 200). App code cannot reach this today (`case-prepare.ts:263` never deactivates a submitted filing), but BR-20 should hold on the data itself. Fix: refuse when any `case_decision` row of kind `DECISION` exists on the case, whatever the filing's `active` flag. Add a fail case.
* **m3, `withdrawn_at` is the recording time, not the date staff gave.** At `case-close.ts:122`, `withdrawnOn` 2027-01-01 stored `withdrawn_at` 2026-11-15 (B6). The given date is only on the `case_decision` row. AG-7-50 §7 calls `withdrawnAt` the "withdraw date". Fix: set `withdrawnAt` from `withdrawnOn`, or say in the schema comment that it is the recording time.
* **m4, `case.reopened` has no `reason`.** At `ports/events.ts:116-120`, contract §4 lists `{ firm_id, client_id, case_id, client_type, reason }`. Leaving out the free-text reason is a sound privacy choice and the code says why. `case.closed` adds `outcome` and `closedAt`, a superset, which is fine. Fix: record this in the PR body for the contract owner, or carry a coded reason.
* **m5, no test fails when the row lock is removed** (`STANDARDS.md` §7 [M]). Without `for update` (`case-close.ts:55`), two closes could both pass the `OPEN` check and write two events. My B1 run shows the lock works. Fix: add a named parallel-close case: four closes → one 200 and one `case.closed`.
* **m6, the setup test name and `challenge.md` overstate PF-4's start-up rule.** `platformRoutes` collects only `PLATFORM_PATH` routes (`guard.ts:33`), so the "agent/* keys only" rule does not run for `/api/runtime/*`. The test at `tests/check_csc1_close.ts:96` only checks that the controller is listed. There is no hole: a non-agent key would deny, not open. Fix: rename the test or assert the four routes' keys; correct `challenge.md` Option A's sentence.
* **m7, the cascade exemption is wider than the cascade.** `migration.sql:69` (`pg_trigger_depth() > 1`) also allows a DELETE issued from inside any other trigger (B5: allowed). That needs DDL, and DDL can drop the trigger anyway, so the app role gains nothing. A tighter rule: allow DELETE only when `NOT EXISTS (select 1 from runtime_case where id = OLD.case_id)`. Optional.
* **m8, the closed state is enforced only on these four routes.** AG-7-34 rule 4 ("no outgoing moves") is claimed at `case-close.ts:5`. The existing `x-actor` routes (stage moves, `submission.ts`) do not read `Case.status`. That is outside the touch list, so it is not a fix here. Record it as a follow-up row.
* **m9, the test leaves a file behind on every run.** `tests/check_csc1_close.ts:59-60` writes `var/csc1-<pid>.config.ts` and never removes it (eleven such files sit in `var/` now). Fix: remove the file in the `finally` block.

## Standards [M] (API-relevant lines)
* Met:
  * deny by default, server authorisation (PF-4 keys, 404 cross-firm);
  * RFC 9457 errors with `fields`;
  * the migration keeps existing records (M2 case);
  * events in the transaction;
  * no personal text in the outbox;
  * no `any` in the service;
  * level checks in the database;
  * indexes on `(firm_id, case_id)` and `filing_id`.
* Met in effect: concurrency uses a row lock with state checks, not a version column. Each action is a one-way state change, so a stale second call gets 409.
* Not met: recorded rollback (M2), and a test that fails when the lock is removed (m5).

## Could not check
* Full CI: the PR is a draft, and at af33e80 only `guard` is queued; everything else is skipped.
* The demo reset with real closed cases on a demo copy. The case-delete cascade is proven by DW7.
* `graph.mjs`: not run, because it rewrites `qa/GRAPH.md`, which is outside the files I may write.
* Screen checks D1-D20, BIC and axe do not apply: no screen.

Journey score (reviewer): **8.5/10, pass** (the scripted W1 plus API journeys). Report: `screens/CS-C1/journey-test-reviewer-2026-11-15.md`.

**Verdict: Block.** Fix M1 and M2 (records only); the Minors can follow or go to rows. Re-review reads only the commits after af33e80 (P-277).
