# CS-C1a review (API only, no screen): decision, withdrawal, close, reopen, the two events

Reviewer: Opus reviewer, fresh context, 15 Nov 2026. PR #1818, branch `claude/eager-clarke-tw3hzj`. Read against brief `design/briefs/CS-C1.md` at 07d389c23 (part 1), AG-7-33, -34, -13, -50 (requirements-2026-11-02), contract v0.1 §4 and §7, Lead 58's ruling (PR comment 6892215478), and `STANDARDS.md`.

**Reviewer: Approve b94fa1c60cfd40b37c2321cb904ba97a4eb92687**

**Verdict: Approve.** No Blocker or Major is open. Two Minors remain (n1, n2) and can follow.

## Round 1: af33e80 (Block). The full text is in git, `review.md` at b94fa1c60
Round 1 found:
* **M1:** the PR body was stale, so the deviations were silent.
* **M2:** the migration had no recorded rollback.
* **Minors m1-m9:**
  * m1: AG-7-33 rule 5 was not built;
  * m2: withdrawal ignored decisions on inactive filings;
  * m3: `withdrawn_at` is the recording time;
  * m4: `case.reopened` has no `reason`;
  * m5: no race test;
  * m6: the setup test name overstated PF-4's start-up rule;
  * m7: the trigger-depth exemption;
  * m8: the closed state is enforced on the four routes only;
  * m9: the test left a config file behind.

## Round 2: af33e80..b94fa1c (P-277: only the new commits, 1f4b516 and b94fa1c)
| Finding | Status at b94fa1c | Evidence |
|---|---|---|
| M1 PR body | **Closed** | The body is rewritten. It has the migration and shared-file first line, DW1-DW8 and W1 with the hook proofs, "Not built, or different from the brief" items 1-5 (auto-close, `MISSING_PERMISSION`, the withdraw and close rules, rule 5, `clientType` source, the `case.reopened` payload), the `filings.prisma` line, and the checks. Two lines still predate b94fa1c (n1) |
| M2 rollback | **Closed** | `migration.sql:13-18` gives the drop order and says "Closed cases lose their closing fields (export them first)" |
| m1, m3, m4, m8 | **Recorded, accepted** | `challenge.md` "Answer and build notes" gives the reasons and names the follow-up row for m8 |
| m2 inactive-filing decision | **Fixed** | `case-close.ts:67,125` read every `DECISION` row on the case. My break script at b94fa1c gives 409 `HAS_DECISION` (it was 200 at af33e80). No named test yet (n2) |
| m5 race | **Fixed** | A new DW6 case: four closes → one 200, three 409, one `case.closed` |
| m6 setup name | **Fixed** | The test is renamed, and `challenge.md` records that `platformRoutes` checks only platform and front-office paths |
| m7 delete exemption | **Fixed** | `migration.sql:77`: a DELETE passes only when the case row is gone. A new DW7 case shows a DELETE from another trigger is refused, and the case cascade still removes the rows (DW7 pass). It also holds under REPEATABLE READ: rows of a case the snapshot cannot see are not visible to the DELETE either |
| m9 config file | **Fixed** | `rmSync(cfg)` after `migrate diff`; no `csc1-*.config.ts` is left after my run |

The breaker's fixes (b94fa1c), checked:
* **Hook takes only `kind === "keys"`** (`core.ts:94`). This is narrower than the line Lead 58 OK'd, so less is opened, and it is recorded. `@AnyStaff` and `@StaffSignIn` on `/api/runtime/` with a Bearer token still get core's 403. A new H3 case calls the guard directly with all three kinds.
* **PF-4 follow-up, outside this row, recorded:** a future `/api/runtime` `@StaffSignIn` route with no token would run. That was true before this row too.
* **Input checks:**
  * a NUL or control character in a reason or note → 400 (it was a 500 risk, because PostgreSQL refuses NUL in text);
  * an invisible-only reason counts as empty;
  * dates outside 1900-2200 → 400;
  * a DB trigger now refuses a `DECISION` row whose filing has no `filing_record`.
  * Each has a named fail case (DW1 "break m1, m2, m4" and DW7 "break m6").

## What I ran at b94fa1c (US$0, live AI off, never :4400 or :4541)
* `tests/check_csc1_close.ts`: **52 passed, 0 failed**.
* `tests/check_case_feed.ts`: **39/39**.
* `tests/check_pf4_identity.ts` on an isolated copy at :4437 with the real `main.ts`: **118/118**.
* Real server on the same copy:
  * all four routes: a staff token on an unknown case → 404, no token → 401;
  * an undeclared `GET /api/runtime/cases` with a staff Bearer → 403;
  * `/API/Runtime/cases/:id/close` with a staff Bearer → 403.
* Break re-run (temporary file, deleted): a decision on an inactive filing now blocks withdrawal (409).
* P-610 cap: 693 changed lines in `prototype/studio`; 992 in total including the four record files under `screens/CS-C1/`. The cap counts code and tests, so it holds.

## Brief fit (unchanged from round 1, all met)
* DW1-DW8, W1 and Lead 58's four hook proofs are met.
* Firm isolation answers 404, using the row lock and the platform firm id.
* The events are written in the transaction, and a forced rollback writes none.
* `case_decision` is insert-only in the database.
* The status cycle is OPEN → CLOSED → OPEN, held by CHECKs plus service checks under the lock.
* The deviations from the brief are now in the PR body and `challenge.md`, not silent.

## Standards [M] (API-relevant)
* Met:
  * deny by default, server authorisation;
  * RFC 9457 errors with `fields`;
  * the migration keeps existing records and has a recorded rollback;
  * level checks in the database;
  * indexes on `(firm_id, case_id)` and `filing_id`;
  * no personal text in the outbox;
  * "a rule's test fails when the rule is removed": the lock (race case) and the cascade-only delete (trigger case), with n2 the one gap.
* Met in effect: concurrency uses a row lock plus one-way state checks, not a version column.

## Open findings
**Blocker:** none. **Major:** none.

**Minor**
* **n1, two PR-body lines predate b94fa1c.**
  * "Guard hook (`core.ts:93`) … declares `PLATFORM_ACCESS`" does not say it is now `kind === "keys"` only (the line is at `core.ts:94`).
  * "Checks (at af33e80) … 47/47" should now read 52/52 at b94fa1c.
  * The test list lacks the race case, the hook-kind case and the breaker cases.
  * Fix: edit those lines before the label. No code change.
* **n2, the m2 fix has no named test.** Reverting `c.decisions` to the active-filings check (`case-close.ts:125`) fails no case. Fix: add a DW3 fail case: decide filing 1, set it `active = false` by SQL, withdraw → 409 `HAS_DECISION`.

Recorded and accepted (no action in this row): m1 (rule 5, `Filing.status` `DECIDED`), m3 (`withdrawn_at` meaning), m4 (`case.reopened` without free-text `reason`), m8 (closed state on the old `x-actor` routes: a follow-up row), and the breaker's "left" items in `challenge.md`.

## Could not check
* Full CI: the PR is a draft. The builder's results are in the body. The label still needs green CI on this head (P-385).
* A demo reset on a demo copy with closed cases. The cascade is proven by DW7.
* `graph.mjs`: it rewrites `qa/GRAPH.md`, outside the files I may write. The builder reports `graph.mjs --check` exit 0.
* Screen checks D1-D20 and BIC: no screen.

**Journey score (reviewer): 8.5/10, pass.** It is unchanged: m2 is fixed, and m3 stays as recorded. See `journey-test-reviewer-2026-11-15.md`.

**Reviewer: Approve b94fa1c60cfd40b37c2321cb904ba97a4eb92687**
