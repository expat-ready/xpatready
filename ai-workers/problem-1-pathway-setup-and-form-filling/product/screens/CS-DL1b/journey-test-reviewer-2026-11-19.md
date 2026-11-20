# J-74 / CS-DL1 part 2: journey test (reviewer role)

Reviewer, 19 Nov 2026, exact head 8d259c4f88c8cd95e0e06e4c4ba574100f831933. Skill `journey-test`, scored per `QUALITY.md` "Journey score". This is the one journey score for this check. The isolated copy ran on :4474 (`isolated.sh j74 4474`), never :4400.

## Journeys (persona: the firm's case officer or lead representative)
1. **Main.** Open a case on "Study, then work" (route marked CITED as test data). Start next stage with the study permit's end date, Mon 8 Mar 2027, with the firm closed on Fri 5 and Mon 8 Mar. Expected: the deadline shows "Mon 8 Mar 2027 (closed day)" and three reminders are armed on open days.
2. **Close and reopen.** Withdraw the case: no reminder fires. Reopen it: the reminders still to come fire once each, and a passed one never fires.
3. **Sample route.** The same case on a Sample route: the deadline shows, nothing reminds (P-412 F13 (b)).
4. **Wrong role.** A withdraw sent as the simulated person (x-actor only) gets 401, writes no event and cancels nothing.
5. **Wrong firm.** A job carrying firm B's id reads nothing of firm A's case.
6. **Date changed.** The key detail is re-recorded: the old reminders do nothing and the new ones fire once (suite DW9).
7. **Break: calendar changed after arming.** The firm adds a closed day on a reminder's day, or corrects its time zone.
8. **Break: close and reopen in one minute; a redelivered job.**

## What held
* **J-74 run: 14/14** (2 min 36 s). Journeys 1-5 pass on screen and through the API, and axe shows 0 WCAG 2.2 A/AA violations on the stage strip at 1440 px with no sideways scroll. The page threw no errors.
* **Suite on the head copy: 60/60.** Journey 6 holds, and journey 8 holds through DW7 and DW8: three r0 jobs told nobody, r1 fired once each.
* **Data underneath.** Each reminder is one keyed job carrying the case's firm id. A second sweep queues nothing. `case.closed` is written once through CS-C1a's route. Notifications go only to the current OFFICER and LEAD_REPRESENTATIVE, never to an officer whose assignment ended or to another firm's staff.
* **Under the PF-12 walls** (my probe B: xr_app pool, sweep with no scope, handler in `withFirm`), the sweep reads what it needs and the handler tells the firm's own staff.

## Findings
* **Major (journey 7)**: a closed day added after arming. The 2-day reminder still fired at 09:00 on Thu 4 Mar, a closed day. Nothing fired on Wed 3 Mar, the day countBack now gives (probe A on head; `plan.ts:19`, `reminders.ts:120`). A zone change loses all three reminders (breaker M2, same cause). Review Major 1.
* **Major**: the notification item is `{ kind: "case" }`, not the brief's `case-stage`, so a deadline reminder merges into other unread notifications on the same case (`reminders.ts:125`). Review Major 2.
* **Minor**: nothing on screen shows that reminders are armed or cancelled, and no reminder is seen anywhere. Both the job runner and the notification adapter are stand-ins until PF-18n, and they are declared in J-74's header. The running app arms nothing by design (log: "no NotificationPort bound").
* **Minor**: failure log lines lose their event name (`case_deadlines.*` becomes "message"). Review m1.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | ½ | J-74 14/14 with stand-ins; fails after a calendar change (Major 1) |
| Next step obvious | ½ | Deadline and mark shown; reminder state not visible to the officer |
| Plain words | 1 | "Mon 8 Mar 2027 (closed day)"; ids-only notification by the port's rule |
| Feedback and state | ½ | No armed or cancelled state anywhere; the port promises no delivery |
| Correct data | ½ | Right days when armed; wrong or lost after a calendar or zone change; item kind |
| Error recovery | ½ | Stale jobs safe; consume and arm failures logged as "message"; skipped silently |
| Accessibility and screen sizes | ½ | axe clean at 1440; 1024 px, 400 px, keyboard not covered (no new screen) |
| Speed | 1 | Suite 7 s; sweep under 2 s for 400 cases (breaker) |
| Visual quality | 1 | No new UI; strip unchanged |
| Trust and sources | 1 | Cited-only rule in code; Sample offsets and test route labelled |
| **Total** | **7/10** | Below the pass of 8; no criterion at 0 |

**Verdict: Fail (7/10).** These fixes would raise the score, most valuable first:
1. Major 1, re-plan on a calendar change: raises correct data and task completed.
2. Major 2, item kind: raises correct data.
3. Real log event names: raises error recovery.
4. Once PF-18n lands, a visible reminder in My deadlines: raises feedback and next step. This is outside this part's scope, so it is not a finding here.

## Not tested
* A real screen reader, and an intended user's unaided walk (D17 and D20 stay with the founder).
* PF-14's real pg-boss runner end to end, and PF-18n's adapter, which is not on `main`.
* 1024 px and 200 % zoom: this part adds no screen.

## Round 2: aea1c9082366829c7d30a52ff2fb12dcba3893fe (re-score; diff 8d259c4f8..aea1c90 only)
* **J-74 again: 14/14** on an isolated copy (:4474) of aea1c90. The start-up log has `case_deadlines_waiting` once.
* **Suite: 64/64** on a clean archive of aea1c90. My walled probe B passes: after a closed day is added, the earlier plan's jobs tell nobody and the re-planned ones fire once each.
* **Journey 7 now holds** for changes made ahead of time: a closed day or a zone set after arming moves the reminders. One gap is left, which follows the brief's never-late rule: a closure entered on the day itself, after the re-planned earlier day has passed, drops that reminder (probe C; review r2-m1).
* **Correct data ½ → 1** (Majors 1 and 2 fixed). **Task completed ½ → 1.** Error recovery stays ½: log names are fixed, but stale skips and skipped consume failures leave no trace for the officer.
* **Score: 8/10.** Every other criterion keeps its round 1 score. **Verdict: Pass (8/10, no criterion at 0).**
