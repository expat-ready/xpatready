# PF-17 part 2 (R1.93): review round 2, 2026-11-24

Reviewer: a fresh reviewer, not the builder. Scope: only the diff since the round 1 Approve (d1cf4ba67), up to 58c79b84afbdf10a212784dd67430b2b7091a767 on `claude/runtime-pf17-support` (PR #3225, stacked on #3155 at 98dccb3e2). Two code changes:

1. Merge 2818fc69a (98dccb3e2 into this branch): its one hand-resolved conflict.
2. Commit 58c79b84a: the reply's audit actor (AUD-3a), the DW8 measurement, and review items m1, m2, m3 from round 1.

Not reviewed: `product/screens/PF-17-1/review-merge-2026-11-24.md`, which is another PR's record. No journey score this round (the caller asked for none; round 1's journey report still stands).

## What I checked and how

* **The PR's own diff against its base.** `git diff 98dccb3e2 58c79b84a` touches the PR's 15 files only. In `api/src/platform/support/support.ts` the change is 11 lines, all in `replyAsSupport` (lines 221-233): the doc comment, the optional `actor = "system:support"` parameter, the one-line guard, and `actor` passed to `audit.record`. Nothing else in PF-18b's file changed. Its other callers (`check_pf18b_support.ts:194-249`, `check_pf18s_help_browser.ts:154`) pass no actor, so they still get `system:support`.
* **The merge resolution** (`git show --cc 2818fc69a`). `check_pf4s_system_signin.ts`'s APPENDIX_A keeps main's breach rows (`system/breach:manage`, `system/breach:read`) and the `system/compliance:dsr-manage` row, then this PR's two support rows. No row was lost or duplicated. The check compares every seeded key with this list, and it passes 104/104.
* **The actor guard cannot be abused.** I wrote a probe (`scratchpad/probe/actor.mts`). It calls `replyAsSupport` with a transaction and dependencies that throw on first use. All 15 bad words throw the guard's error with nothing touched, not even a read:
  * `system:other`
  * `system:support ` (with a trailing space)
  * `ourstaff:` (empty id)
  * `ourstaff:x y`
  * `ourstaff:x\n`
  * `OURSTAFF:x`
  * `staff:x`, `person:x`, `seed:x`
  * `ourstaff:-x`
  * a 201-character id
  * the empty string
  * a quote, a semicolon, and a leading space

  The default, `system:support` and `ourstaff:abc-123` pass the guard and reach the first query. The guard's id pattern is the same as `ACTOR_ID` in `observability/hook.ts:40`. Behind the guard, `audit-event.ts:59-62` (AUD-3a) refuses any word in our staff's request that is not exactly the request's own `ourstaff:<id>`. So a wrong id fails twice over.
* **The line lands as `ourstaff:<id>` / OUR_STAFF on the ticket's firm.** `system-console/support.ts:107` passes `ourstaff:${c.staffId}`. `c` is `systemStaffOf(req)`, which is `req.systemStaff`, the same value `auditOf` (`hook.ts:45-49`) uses for the request scope, so the two words match exactly. The firm comes from the locked ticket (`support.ts:228-233`). The new assertion at `check_pf17_support.ts:181-183` reads `actor` and `actor_type` from firm A's trail.
* **The reply still rolls back whole.** `writeAuditWithAlarm` re-throws the write's own error (`observability/alerts.ts:95`), inside the use's `$transaction`. I tested this with a mutation that passes another person's word (`ourstaff:someone-else`): the reply answered 500, firm A's message count stayed at 1, the ticket stayed OPEN, and no `support.ticket.replied` line was written (my probe line, then the checkout restored).
* **The new tests fail when the code is wrong.** Each mutation was run against `check_pf17_support.ts`, then restored with `git checkout`. The worktree is clean at the end.

  | Mutation | Result |
  |---|---|
  | Console passes no actor (the default `system:support`) | 3 FAIL: DW5 reply 500, the line's count, then the run stops |
  | Console passes `ourstaff:someone-else` | 3 FAIL (as above) |
  | Reply skips `touchFirm` | 1 FAIL: review m1, `check_pf17_support.ts:184` |
  | `list` skips its key check | 1 FAIL: review m2, `:263` (`noList: false`) |
  | `one` skips its key check | 1 FAIL: review m2, `:263` (`noOne: false`) |
  | `replyAsSupport`'s actor guard deleted | 0 FAIL in pf17 (29/0) and pf18b (41/0): see m1 below |
* **DW8** (`check_pf17_support.ts:45-50`, `:85`). It now counts the seed right before and right after `20261123060000_pf17_support_keys`, so newer migrations from main no longer break it. The stamp is unchanged, as the Lead set.
* **m3.** The comment at `system-console/support.ts:14` now says `updated_at` is Prisma's `@updatedAt`, set by PF-18b's ticket update. That matches `support.ts:232`.

## Runs

From `<worktree>/ai-workers/problem-1-pathway-setup-and-form-filling/prototype`, postgres 18 on 127.0.0.1:54329. Port 4400 was not used.

| Check | Result |
|---|---|
| `check_pf17_support.ts` | 29 passed, 0 failed (run twice) |
| `check_pf18b_support.ts` | 41 passed, 0 failed |
| `check_pf4s_system_signin.ts` | 104/104 passed |
| `check_aud3c_platform_line.ts` | 16 passed, 0 failed |

## Findings

### Blocker

None.

### Major

None.

### Minor

* **m1. No test covers `replyAsSupport`'s actor guard** (`api/src/platform/support/support.ts:226`). Deleting the line leaves pf17 (29/0) and pf18b (41/0) green.
  * In a request our staff make, AUD-3a still catches a wrong word.
  * Outside a request (a job, or a future caller), nothing else stops a word like `staff:<someone>` or `seed:x`. The adapter has no request actor to compare it with (`audit-event.ts:59-62`).
  * My probe shows the guard is correct today. Fix: add one pf18b assertion that a word other than `system:support` or `ourstaff:<id>` is refused and leaves the ticket's message count and status unchanged.
* **m2. A stale record** (`product/screens/PF-17-2/build-notes.md:19`). It still lists "naming the replying staff member on the firm's trail (the line's actor is `system:support` … AUD-3a, open as #3178, brings an actor word for our staff)" as out of scope. This commit does exactly that. Fix: move it to what part 2 does, and note `ourstaff:<id>` on the firm's line.

### Nit

* The guard throws a plain `Error`, which becomes a 500. That is right for a programming error, because no request input reaches the word.

Verdict: Approve on 58c79b84afbdf10a212784dd67430b2b7091a767
