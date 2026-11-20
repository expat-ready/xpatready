# PF-18n part 1: review (the notification store, the me routes, the deadline binding)

**Head reviewed:** `ea830d41d` (branch `claude/loving-fermat-eyd2nq`, draft PR #2596). Base `origin/main`. Brief `design/lead-b-briefs/PF-18n1.md` at `093ded45e`. **Reviewer:** a fresh Opus 5.5 at high effort that did not build this row. 21 Nov, about 02:15 IST. US$0, live AI off. No repo code was edited: probes ran in scratch worktrees and scratch databases, and every copy was stopped.
**Skill verdict:** Ship after fixes (one Blocker and one Major at this head). Journey score **8/10, pass** (`journey-test-reviewer-2026-11-21.md`).
**Note:** the branch moved on while I reviewed: `2aeba1860` (the B1 fix), `c709c47ef` (the breaker's report), `66f5344cd` (the breaker fixes). I did **not** review those. The verdict names `ea830d41d` only.

## What I ran (all at `ea830d41d`, in a clean worktree)
* `check_pf18n_notifications.ts`: **26 passed, 0 failed** (13 s). `check_pf18np_port.ts`: **10 passed, 1 failed** (DW4, see B1).
* Unchanged suites, all green: prisma_schema 8/8, pf0p_ports 126/126, pf19a_messages_schema 94/94, pf12_walls 100/100, csdl1_deadlines 64/64, csdl3_milestones 43/43, pf18a_notifications 72/72.
* **J-74** on an isolated copy at :4425 (`PLATFORM_IDENTITY=local`): **14/14**. The running app's log has **no** `case_deadlines_waiting` line, so the binding arms the jobs in the real `main.ts`.
* **Mutations** (one rule removed per run), each turning the suite red: no preference check (DW2); `do nothing` on conflict (DW1 and the contract); the list, read-all or markRead without `staffId` (DW4, DW5); the binding removed (exit 1, but silent: m7).
* **SQL probes as `xr_app`:** the upsert, re-mark and markRead work; firm B's scope sees 0 rows and updates 0; DELETE is refused; the column grants are as written.
* `graph.mjs --check`: G3 is 177 on main and 181 here (m6).

## Blockers
**B1. An existing suite goes red: `tests/check_pf18np_port.ts:37` expects `NotificationPort ×1`.**
* Evidence: `tools/check-port-contracts.mjs` now prints `NotificationPort ×2`, because the new suite runs the contract on `PrismaNotificationPort`. DW4 fails (10/11, exit 1). On main it prints `×1` and the suite passes.
* CI runs this suite, because the PR changes `ports/notifications.ts` and the schema. The PR body's "check_pf18np_port.ts: DW1–DW4 green" was not true at this head.
* **Fix:** expect `×2` (`2aeba1860` does exactly this), and name that test file in the touch-list question.

## Majors
**M1. Only the insert runs in the caller's transaction. The preference and person check runs on a second pooled connection, so parallel callers starve the pool.**
* Where: `store.ts:27` calls `this.prefs.allows(...)`. The adapter is bound at `features/platform-notifications.ts:15` to `NOTIFICATION_PREFS`, which `features/platform-settings-personal.ts:20` builds on the shared `Db`. So each `notify` holds its tx connection and also asks the same pool (pg default `max` 10) for a second one. The prefs adapter's own header (`prefs.ts:2`) says "Reads run with the caller's client".
* **My repro** (scratch database, real `Db`): 6 concurrent `withFirm(A, () => db.$transaction(tx => port.notify(tx, …)))` give 6 ok in 360 ms. **12 concurrent give 12 failures (P2028 after 5043 ms) and 0 rows**, and every caller's own write rolls back with them.
* The same cause gives wrong answers (breaker P9, P10): a person added earlier in the tx gets no row; a switch turned off earlier in the tx still writes one.
* Impact: latent today (the reminder queues run `batchSize: 1`), but this is the shared port's real adapter and part 2's request-path callers will hit it.
* **Fix:** read the person and the preference through `tx` (e.g. `allows(…, client?)` or a prefs factory taking the client), and test more concurrent notifies than the pool holds. If that changes `ports/notification-prefs.ts`, it is a touch-list question for the tech lead.

## Minors
* **m1. `created_at` can move backwards** (`store.ts:31`), though the contract now asserts "never older" (`notification-port.contract.ts:25,30`).
  * Probe: two concurrent notifies on one key give 1 row (good), but the later commit carried 13:59 and replaced 14:00.
  * Fix: `created_at = greatest(msg_notification.created_at, excluded.created_at)`, plus a forward-only rule in `msg_notification_write()` (migration.sql:43-49).
* **m2. A mark-read waiting on the row uses up a reminder that has just surfaced again** (`store.ts:72`).
  * Probe: the row is re-notified at 14:00 while an `UPDATE … where read_at is null` issued at 13:59:59 waits on its lock; the update then marks the 14:00 surfacing read.
  * A list drawn before the re-notify does the same through `POST /:id/read` (breaker m3). This goes against AG16-60.
  * Fix: the client sends the `createdAt` it showed (`and created_at <= seen`); read-all takes a `before`.
* **m3. The record conflict on the key is not raised.**
  * "Per person, item and kind": the brief and BACKLOG row PF-18n (line 304).
  * "Per person per item": BACKLOG line 921 ("replacing 'per item and kind'"), the contracts master (`design/platform-and-front-office-contracts-2026-11-14.md:17`), and AG-7-39 r2 as quoted in `design/briefs/CS-N1.md:16`.
  * The PR's question cites only the brief. The master is a library master fed by `ports/` (`cockpit/library.json`), and the PR does not say it is now behind.
  * Fix: add both to the question and flag the master (AGENTS rule 2: a conflict is not settled silently).
* **m4.** The link for item kind `case` is built without a firm check (`store.ts:43`); stages and milestones use `firmId`. Fix: look the case up with `firmId`, or return `null`.
* **m5.** Bad paging values fall back silently (`routes.ts:11`). Walk: `page=9999999` answers page 1, while `page=999999` answers an empty page; `size=0`, `page=-1` and `abc` answer 200 with page 1. Fix: clamp (or answer 400), never fall back to page 1.
* **m6.** The four new routes count as G3 gaps ("no test reaches"), taking G3 from 177 to 181, though the suite calls them: `check_pf18n_notifications.ts:208` builds the path from `${path}`. The PR body says "unchanged (G3 181)". Fix: write the routes literally; correct the PR line.
* **m7.** A crash in the suite is silent. With the binding removed it exits 1 after the DW6 fail lines, with no FAIL line and no error text: `useLog(new JsonLog(...))` (`:58`) captures the console, and `try/finally` (`:67`, `:237`) has no catch. Fix: catch, print, count a FAIL.
* **m8.** DW2's "a security group still writes one" is replaced by an assertion that cannot fail (`:115`; `NOTIFICATION_GROUP` is typed to the eight groups). The reasoning holds (`decide()` gives false for SECURITY on IN_APP), but DW2 as written has no pass and fail, so the tech lead must rule.
* **m9.** Words fit the table's checks: kebab-case such as `client-jane-doe-overstayed-visa` is accepted, and `group` is not tied to `kind` (`migration.sql:35-36`, breaker m1). The zod parse is the only guard; record it on the card.
* **m10.** Times come from `new Date()` (`store.ts:20,52`), not from the clock port that `case-deadlines` uses (P-607). Fix: inject `ClockPort`.

## The contract and fake change (asked to judge)
**Correct for the brief, and needed:** the unique key forbids a second row, so the old DW1 rule ("after markRead a new record") could never pass on the real adapter.
**Not complete at this head:**
* B1: the port suite's DW4 was left at `×1`.
* m1: the contract promises "never older", which the adapter does not enforce.
* m3: the per-kind key conflicts with BACKLOG line 921 and the contracts master, and the question does not say so.

**What holds:** the consumers pass (csdl1 64/64, csdl3 43/43, J-74 14/14; none uses `markRead`). The fake's `markRead` marks every kind of an item, which matches the harness's per-item signature. The "a record per call" breaker still fails DW1.

## Checks that held
* **Firm walls:** forced RLS, `pf12_firm`, `0_pf12_firm_first`, and the composite RESTRICT key (23503 for firm B's row naming firm A's person).
* **Migration:** additive (one table); `UPDATE (read_at, created_at)` only, no DELETE or TRUNCATE for `xr_data`; the trigger function is SECURITY DEFINER, owned by `xr_wall_reader`, as in PF-18a; the rollback is written.
* **Routes:** session only (`staffOf`), with firm and person on every query. Walk: another person 404, firm B 404 with an empty list, no session 401, a malformed id 404. A double click keeps the first `readAt`. 7-25 ms per call.
* **No case-side file touched:** none of `case-deadlines/*`, `features/case-deadlines.ts`, `features/case-milestones.ts`, `web/src/runtime/*`, runtime routes, `contracts/milestones.ts` or `j_74.ts` changed.
* **PR body:** "Item: R1.74", "Fixes: QA-471 (part: reminders reach a person)", under 800 lines.

## Scores (D1-D20, 1-5; no screen in this part, so the screen dimensions are N/A)
D1 4 (DW1-DW6 met; DW2's security half unreachable, m8) · D2 3 (key, checks and walls; but m1, m2) · D3 5 (one port, NOTIFICATION_PREFS, firmScope) · D4 N/A · D5 2 (M1) · D6 4 (master not flagged, m3) · D7 N/A · D8-D14 N/A (no screen; problem texts plain) · D15 5 (under 25 ms, two link queries, no per-row request) · D16 3 (every DW fails when its rule goes; but B1, m7, m8) · D17 N/A (simulated only) · D18 4 (ids only, link built on read) · D19 4 (reminder → row → list → read, in the app module and J-74) · D20 N/A (simulated only).
**BIC-01 to BIC-20:** N/A (platform API, no case-side screen; the bell and list are PF-18ns).
**Could not check:** a real screen reader or an intended user (no screen); the CI run; the commits after `ea830d41d`.

Verdict: Changes requested ea830d41d
