# PF-18n part 1: re-review (diff only, P-277)

**Head reviewed:** `00c61ba51159dd50b4ecc3629a9f87be944decf6` (branch `claude/loving-fermat-eyd2nq`, draft PR #2596). **Diff:** `git diff ea830d41d..00c61ba51`.
**Reviewer:** the same fresh Opus 5.5, high effort, who did not build this row. 21 Nov, about 02:45 IST. US$0, live AI off. No code was edited: the runs used a clean worktree at `00c61ba51` and scratch databases, all removed afterwards.
**First review, at `ea830d41d`:** Changes requested for B1 and M1, plus minors m1-m10. Its full text is in git history (commit `00c61ba51`, this file).
**Skill verdict:** Ship. The journey score of 8/10 stands (`journey-test-reviewer-2026-11-21.md`). No screen changed, and the fixes touch only "error recovery", which is still ½ until PF-18ns sends `seen`.

## What I ran at `00c61ba51`
* `check_pf18n_notifications.ts`: **33 passed, 0 failed**. `check_pf18np_port.ts`: **11 passed, 0 failed**.
* Unchanged suites, all green: prisma_schema 8/8, pf12_walls 100/100, pf19a_messages_schema 94/94, csdl1_deadlines 64/64.
* **Mutation:** I put the old shared-Db preference wiring back into the suite. Both new M1 lines turn red (the same-tx switch and the 14 concurrent notifies). Restored afterwards.
* **My pool probe, now with the switch read through the transaction:** 12 concurrent notifies give 12 ok in 280 ms; 30 concurrent give 30 ok in 90 ms. At `ea830d41d`, 12 concurrent gave 12 failures (P2028).
* **Race probes as `xr_app`:**
  * Two concurrent notifies where the later commit carries the older time: one row, and `created_at` stays at 14:00.
  * A mark-read with `seen` = the old `createdAt`, waiting on the row while a re-notify commits: `UPDATE 0`, and the re-surfaced row stays unread.
* `graph.mjs --check`: G3 181. I checked the builder's explanation: the graph lists `/platform/...` without `/api`. PF-21w's complaint routes show the same, and the suites do call them. This is a limit of the graph tool, not of this PR.

## The first review's findings, one by one
| # | Status | Evidence |
|---|---|---|
| B1 | Fixed | `check_pf18np_port.ts:37` expects `×2`; 11/11 |
| M1 | Fixed | details below |
| m1 | Fixed | the upsert keeps the later `created_at` (`greatest`, `store.ts:35`); the trigger refuses an earlier one (23514), tested; race probe |
| m2 | Fixed (opt-in) | details below |
| m3 | Open: question for the tech lead | the key conflict (BACKLOG line 304 vs line 921 and the contracts master); for the lead's ruling |
| m4 | Fixed | item kind `case` is looked up with `firmId` (`store.ts:48`); firm B's case gives `link: null`, tested |
| m5 | Fixed | page is clamped to ≤ 1,000,000, size to 1-100 (`store.ts:59`); `page=9999999` gives an empty page 1,000,000; tested |
| m6 | Fixed in the suite | literal paths; G3 unchanged for the tool reason above |
| m7 | Fixed | `catch` counts a FAIL and prints the stack to stderr |
| m8 | Open: question for the tech lead | DW2's security half is unreachable; awaiting the ruling |
| m9 | Open: question for the tech lead | words fit the kebab-case checks; record on the card |
| m10 | Fixed | `systemClock.now()` from the clock port (`store.ts:24,57`) |

* **M1 detail:** `features/platform-notifications.ts:16` builds `new PrismaNotificationPort((tx) => new PrismaNotificationPrefs(tx))`, so the switch and the person are read on the caller's tx (`store.ts:31`). `ports/notification-prefs.ts` is unchanged. Two new fail tests, which my mutation confirms; pool probe above.
* **m2 detail:** with `?seen=`, `:id/read` and `read-all` change only rows with `created_at <= seen` (`store.ts:82`, `:93`). A bad value gives 400. Tested, and checked by my race probe. The old recursive re-read is gone; a row read meanwhile keeps its first `readAt`.

## New findings (minors only)
* **n1. The feature's own wiring is not what the M1 tests run.**
  * The suite builds its own `prefsOver` (`check_pf18n_notifications.ts:76`). If `features/platform-notifications.ts:16` went back to a shared-Db adapter (`() => sharedPrefs` still type-checks), every line would stay green. DW6 checks only `instanceof PrismaNotificationPort`.
  * The wiring now builds `PrismaNotificationPrefs` directly instead of injecting `NOTIFICATION_PREFS`, so a rebinding of that token would be ignored.
  * Fix (small): run DW2's same-tx line through `app.get(NOTIFICATION_PORT)`, or export the factory from the feature and use it in the suite.
* **n2. `seen` is optional,** so a client that leaves it out still has the old race (review m2). Record on the card and in the PF-18ns brief that the bell sends the `createdAt` it showed: `:id/read?seen=` and `read-all?seen=<newest shown>`.
* **n3. The migration is edited in place** (the forward-only rule in `msg_notification_write()`, migration.sql:47-50). That is fine while it is unmerged, since only scratch and isolated databases applied the earlier text. Keep it for the Lead's P-423 read before the label.
* **n4.** The new 14-concurrent line also asserts under 4 s (`:136`). It measured 90-360 ms here; watch it on a slow runner.

## Checks that still hold
* Every DW1-DW6 line passes and fails as before.
* Firm walls, grants and the composite keys are unchanged.
* No case-side or never-touch file is in the diff. The only file outside the touch list is `check_pf18np_port.ts` (the B1 line), which follows from the contract change.
* The PR is at 799 of 800 lines (P-610), by the coordinator's count.

**Could not check:** CI on this head; a screen reader or an intended user (no screen in this part).

Verdict: Approve 00c61ba51159dd50b4ecc3629a9f87be944decf6
