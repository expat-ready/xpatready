# CS-DL1 part 2 (CS-DL1b, R1.74) with J-74: independent review

Reviewer (P-303), Opus 5.5, 19 Nov 2026. Branch `claude/admiring-feynman-5al3ug`, **exact head 8d259c4f88c8cd95e0e06e4c4ba574100f831933**. Diff `origin/main...8d259c4f8` has 8 files and +474/−3 lines. Spec: `build-lead-c-briefs/CS-DL1b.md` (it wins), then `design/briefs/CS-DL1.md` part 2. I did not build this.
The tests ran on a clean `git archive` of 8d259c4f8 in my scratchpad, because uncommitted edits to `plan.ts`, `reminders.ts` and both test files showed up in the shared working tree at 15:36 UTC. I did not review those edits. Head 7d866ae6f differs from 8d259c4f8 only in `qa/built/R1.74.md`.

**Verdict: Block** (two Majors; everything else holds). Verdict line at the end.

## What I ran
* `check_csdl1_deadlines.ts` on the head copy: **60/60** (part 1's DW1-DW6 still green).
* J-74 on an isolated copy (`isolated.sh j74 4474`, never :4400): **14/14**. Its log at start says `no NotificationPort bound (PF-18n): stage-deadline reminders are not armed`, which is deviation 4 working as stated.
* `module-cards.py tree`: PASS. `module-cards.py pr` on this diff: **FAIL** until the PR body says `Card unchanged:` for api-features (m7).
* Probe A, a scratch database on head with an owner client: the firm adds a closed day after the reminders are armed (Major 1).
* Probe B, the same probe under the PF-12 walls: the `walledPool` xr_app client and `wallUnscopedQueries()`, the sweep run with no scope, and the handler run inside `withFirm(job.firmId)` as `PlatformJobs.handle` does.
  * The walled client reading `platform_staff` with no firm gets 0 rows. The sweep still reads `runtime_case`, `case_stage`, `route` and `module_event` (none of them walled).
  * The sweep gets the firm's closed days through `platform_firm_calendar(firm key)`: with 5 and 8 Mar closed it gave 24 Feb, 3 Mar and 4 Mar.
  * The handler found the firm's staff under its firm and told one officer per reminder. **The sweep works under the walls with no bypass use.**
* I read the breaker's `break-report.md` after I found Major 1 myself. M1 there is the same finding. I take its M2 (time zone change) as a second symptom of the same root cause: I traced it in the code (`reminders.ts:120`) but did not run it.

## Blockers: none

## Majors
1. **A calendar change after arming makes a reminder late, or loses it (AG-7-94 r6 "never later than the computed day"; DW11).**
   * `plan.ts:19` builds the key without the reminder's day or instant, so `arm` (`reminders.ts:78`) gets `queued:false` for the re-planned reminder.
   * The handler (`reminders.ts:120`) never checks the payload's `day` against `countBack(due, offset, cal)` again.
   * Probe A: deadline Mon 8 Mar, reminders armed 20 Feb, then the firm closes Thu 4 Mar and the sweep runs. The 2-day reminder **still fires at 09:00 on Thu 4 Mar, a closed day**, and nothing fires on Wed 3 Mar. Probe B shows the same under the walls with 4, 5 and 8 Mar closed: the reminders fired on 24 Feb, 3 Mar and 4 Mar where countBack now gives 23 Feb, 2 Mar and 3 Mar.
   * A zone change does worse. The jobs stay at 09:00 in the old zone, `l.today > p.data.day` turns true in the new zone, and all three are skipped without a trace (breaker M2).
   * This matters because deadlines are often months ahead and firms enter next year's holidays late.
   * **Fix:** put the reminder's day and instant in the key, e.g. `deadline:<case>:<stage>:<offset>:<due>:<day>T<HH:MM>:r<round>` (under 200 characters). In the handler, work out the plan again and skip a job whose day or instant is no longer the plan's while the new instant is still to come, because the new job covers it. Otherwise fire ("Duplicate beats a miss", AG16-60), so a newly closed day that has already passed never drops the reminder. Add two DW lines, each with a fail: (a) a closed day added after arming → the reminder fires on the earlier open day and never on the closed day; (b) a zone changed after arming → each reminder fires once at 09:00 in the new zone.
2. **The notification item is not the brief's (deviation 2).**
   * `reminders.ts:125` sends `{ kind: "case", id: caseId }`. Both briefs say `{ kind: "case-stage", id }`.
   * Under the port's one-per-person-per-item rule (`ports/notifications.ts` fake, `open()`), a deadline reminder merges into **any** unread notification on the same case and replaces its kind. A "Work handed to me" or "Needs you" item from CS-N1, CS-T1 or others then becomes "My deadlines", and preferences follow the group, so the person can lose it.
   * The builder's reason was to avoid the shared line. The port's own header says consumers ADD to `NOTIFICATION_ITEM_KIND`, and appending `"case-stage"` is an add.
   * **Fix:** append `"case-stage"` to `NOTIFICATION_ITEM_KIND` (`ports/notifications.ts:24`), send `{ kind: "case-stage", id: stageId }`, and say in the PR that CS-N1, CS-NT1 and CS-T1 merge `main` on a conflict. Alternatively, get Build Lead C's written ruling on the PR ("Question for the tech lead") that `case` is accepted with the merge behaviour, and record it in the card.

## Minors
* m1. Log events with dots are renamed to `"message"` by `log.ts:73`, and the isolated api.log shows this: `reminders.ts:103,109` and `features/case-deadlines.ts:23`. The start-up line is also written twice (15:29:26.327, two lines), although the comment says "once". Fix: use `case_deadlines_waiting` and similar names; find out why `onModuleInit` logs twice.
* m2. The DW8 fail line (`check_csdl1_deadlines.ts:233`) asserts only `status === "done"`, so it still passes with the round check removed (only the pass line, 231, catches that). Fix: also assert that nobody was told for those jobs, e.g. count notify calls per job key.
* m3. The DW7 redelivery line (`:210`) redelivers only after the reminder's day. A same-day pg-boss retry after the person read the first notification adds new records (breaker m4), because AG-13-15 then rests on the port alone. Fix: add a same-day line and state that limit in the card.
* m4. The `case.closed` consumer cancels only the keys of the case's current round, date and stage (`reminders.ts:90`). Jobs of earlier rounds or dates stay `waiting`. That is harmless because the fire-time guard holds, but the card says "cancelled by case.closed". Fix: reword the card, or also cancel rounds 0..round of the current date.
* m5. A reminder that already fired at 09:00 fires again after a reopen at 10:00 the same day (`plan.ts:34`, deviation 5). I accept it as "Duplicate beats a miss" (the day has not passed), but record it in the card and the PR.
* m6. The sweep runs every 10 minutes. A reopen or a new date in the last 10 minutes of a reminder day loses that day's reminder. The in-memory cursor (`reminders.ts:42`) also re-reads the whole outbox on every restart. Fine for now (deviation 3 accepted); note both in the card.
* m7. The PR body needs `Card unchanged: <reason>` for `api/src/features/MODULE.md`. `module-cards.py pr` fails without it.
* m8. Part 2's DW7-DW11 share names with part 1's browser suite DW7-DW9 (deviation 6). Accepted. Prefix them `P2-` or keep the header note.
* m9. The handler reads the calendar through `readSetting`, which throws on a stored value that no longer fits (`case-stages.ts:76` → `settings.ts:80`). The sweep's `caseFirmCalendar` falls back to the defaults instead. Such a job fails and retries. Fix: catch and use the defaults in the handler as well.

## Deviations judged
1. **Partly accepted.** Due and round in the key are needed, because JobPort never re-queues a used key. The day or instant must be in the key too (Major 1).
2. **Not accepted** (Major 2).
3. **Accepted.** Probe B shows the outbox sweep works under the PF-12 walls. Lag and restart cost are m6.
4. **Accepted.** I saw it in the log. Every route on `main` is Sample, so nothing would remind on the demo either.
5. **Accepted** as m5.
6. **Accepted** as m8.

## The checks I was asked to press
| Check | Result |
|---|---|
| Skip-if-stale (AG-13-14) | Holds for closed, stage moved, date changed, earlier round, passed day and another firm. Missing: calendar or zone changed (Major 1). |
| Idempotency (AG-13-15) | Holds through the key and the unread rule. A same-day retry after a read is m3. |
| Firm isolation | Holds. `read(caseId, firmId)` plus `firmScope` on staff. The DW10 fail line really fails without the firm filter: the stray firm A officer row would be told. |
| PF-12 walls | Hold (probe B). |
| Close and reopen in one minute | Holds (DW8, and the breaker's variants). |
| Day never later than countBack | Holds when armed. Fails after a calendar change (Major 1). |
| Never late | Holds: `stillToCome` plus the day check in the handler. |

## D1-D20 (out of 5; backend part, no new screen)
* D1 3: the cited-only rule, the offsets, close and reopen all hold; Majors 1 and 2 remain.
* D2 3: keys stop duplicates; a calendar change mis-times reminders.
* D3 5: reuses countBack, deadlineDay and the ports.
* D4 4: no reminder from a Sample route or a missing date.
* D5 4: idempotent sweep, restart re-read.
* D6 4: Sample labelled, test route labelled.
* D7-D14 N/A: no AI and no UI change in this part (axe clean on the strip at 1440).
* D15 4: 400 cases in under 2 s per sweep (breaker); N+1 reads in a background job.
* D16 3: real DW lines with fails; m2 and m3; Major 1 untested.
* D17 and D20: simulated only.
* D18 4: P-412 F13 (b) enforced in code.
* D19 3: there is no delivery channel until PF-18n.

## BIC-01-BIC-20
N/A: this part changes no case-side screen. J-74 W2 re-checks part 1's strip: axe shows 0 WCAG 2.2 A/AA violations at 1440 px.

## Journey score
**7/10** (below the pass of 8; no criterion at 0). See `journey-test-reviewer-2026-11-19.md`.

## What I could not check
* PF-14's real pg-boss runner and PF-18n's real adapter end to end: the app registers nothing by design.
* A real screen reader, and the founder's or a user's unaided walk (D17, D20).
* The full `ci` and the C6.17, `check_csc1_close` and demo-reset suites.
* `graph.mjs`, which rewrites `qa/GRAPH.md`, outside my write list.
* 1024 px, 400 px and 200 % zoom: no new screen in this part.

## Verdict
Reviewer: Request changes 8d259c4f88c8cd95e0e06e4c4ba574100f831933

**Verdict: Block.** To fix:
1. Major 1: key on the day and instant, and re-plan in the handler; add DW lines for a closed day and a zone changed after arming.
2. Major 2: `{ kind: "case-stage", id: stageId }` with `"case-stage"` appended to `NOTIFICATION_ITEM_KIND`, or Build Lead C's written ruling.

The Minors are expected in the same fix commit where cheap (m1, m2, m7 at least). Re-review reads only the new commits (P-277).

## Round 2: aea1c9082366829c7d30a52ff2fb12dcba3893fe (diff 8d259c4f8..aea1c90 only, P-277)
Commits c5cce6e74 and aea1c9082. The code diff covers `plan.ts`, `reminders.ts`, `features/case-deadlines.ts`, one line of `ports/notifications.ts`, the card, the suite and J-74.

**What I ran on aea1c90**
* Suite on a clean `git archive`: **64/64**.
* J-74 on an isolated copy (:4474): **14/14**. Its log has `case_deadlines_waiting` once.
* Probe B again under the walls (xr_app pool, sweep with no scope, handler in `withFirm`). With closed days changed from 5 and 8 Mar to 4, 5 and 8 Mar after arming, the sweep queued new keys for 23 Feb, 2 Mar and 3 Mar. Those told one person each, and the old 24 Feb, 3 Mar and 4 Mar jobs told nobody.
* `pgboss-jobs.ts:287` gives the handler the envelope key, so `job.key` in the app is the key we set.

**Findings**
* **Major 1: closed.**
  * The key now carries the planned minute (`plan.ts`).
  * The handler works out the plan again under today's calendar and fires only on `want.key === job.key` and a day not passed (`reminders.ts` runReminder).
  * `stillToCome` keeps the planned key when it moves `at` to now, so a reminder due earlier today still matches.
  * The new DW11 M1 and M2 lines have real fails: the round 1 handler's day comparison would fire on 25 Feb, 4 Mar and 14:00Z.
* **Major 2: closed.** The item is `{ kind: "case-stage", id: stageId }`, and `"case-stage"` is appended to `NOTIFICATION_ITEM_KIND`. That changes one line by adding, without reordering. CS-N1, CS-NT1 and CS-T1 merge `main` on a conflict; say so in the PR.
* **m1: closed.** Log events are `case_deadlines_*`; the waiting line is logged once per process.
* **m2: closed.** The DW8 fail line also requires six notifications in all.
* **m3, m4, m5, m6, m8 and m9: left as recorded Minors.** I accept them for the PR body. m3 rests on the port's rule (AG-7-39 r2). m9 is part 1's `readFirmCalendar`.
* **m7: open until the PR body has the line.** It must contain `Card unchanged: <reason>` for `api/src/features/MODULE.md`.
* **r2-m1 (new, Minor; for Build Lead C):** a closure entered **on the reminder's own day**, after the re-planned earlier day has passed, drops that reminder.
  * Probe C: the firm closes Thu 4 Mar at 08:00 Toronto on 4 Mar. Nothing reaches anyone on 3 or 4 Mar; the 25 Feb and 8 Mar reminders do fire. The same happens to the on-the-day reminder when the deadline day itself is closed that morning.
  * This follows the brief's rule "a reminder whose day has passed never fires late", so it is not a gap against the brief. It does trade against "Duplicate beats a miss" (AG16-60).
  * Fix: record it in the card and the PR. If Build Lead C prefers no miss, fire the old job when the re-planned day has passed and the old job's day is today.

**Journey score round 2: 8/10, Pass** (`journey-test-reviewer-2026-11-19.md`, round 2).

No Blocker or Major is open.

Reviewer: Approve aea1c9082366829c7d30a52ff2fb12dcba3893fe
