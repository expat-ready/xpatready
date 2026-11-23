# CS-DL3 part 3 review: Government steps says who is reminded; J-74 walks the reminder (R1.74, last part)

Reviewer: a fresh Opus 5.5 that did not build this part. Commit **539fe821eee26c9296b99902315344897e9a7126**, branch claude/trusting-goldberg-k4xn9w, no PR yet. Concept: `build-lead-c-briefs/CS-DL3-3.md` at aacfe11ad, with its addendum. Diff: `git diff origin/main...539fe821e`. Copy rv3_csdl3 on :4663 (AI_LIVE=off, PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on), stopped at the end, rewritten screenshots restored. US$0, no model call.

**Verdict (skill scale): Ship.** There is no Must. Journey score **9/10, pass** (`journey-test-reviewer-2026-11-21.md`).

## What I ran
* `journeys/j_74.ts rv3_csdl3 4663`: **25/25**, exit 0 (2 min 15 s). Then on the same copy **24/24**, exit 0. The second run has one line fewer because the demo-load setup line is skipped on a loaded copy.
* `check_csdl3_milestones_browser.ts 4663 xr_studio_rv3_csdl3`: **22/22**, exit 0. `check_csdl3_milestones.ts`: **43/43**, exit 0.
* `module-cards.py tree`: PASS (15 cards). `module-cards.py pr <changed files>`: PASS. `tsc -p web --noEmit`: clean. `graph.mjs`: G1 0, G2 0, G3 187, G4 0, G5 0, G6 16. Nothing new for this part: the only CS-DL3 line is the cancel route's static G3 gap, part 2's S5, which predates this change.
* My own Playwright walk (scratchpad) as the officer `user-O` on that copy, after J-74 ran:
  * Home at 1440, 1024 and 400 px and at 200 % (720 px at scale 2): no sideways scroll, first item drawn in 277–335 ms, no console or page errors.
  * Keyboard only: 9 Tabs to the first `data-needs-you-open`, then Enter lands on `/cases/<id>` with the header C-2026-00003. Government steps shows the open and the cancelled line plus the new sentence. axe 0 on the section.
  * Back to Home: the opened item is gone and the count reads "1 item needs you". The representative's own list answers 200. Signed out answers 401.

## Concept fit (brief "Build" 1–3, "Done when", addendum)
| Element | Result |
|---|---|
| 1. The `data-gov-not-sent` sentence is replaced by one plain sentence naming who is reminded and where, now `data-gov-reminded`; DW8 keeps its pass and fail | Met (`milestones.tsx:96`; browser check DW8 part 3, which judges the exact text, plus a fail on the stale sentence) |
| 2. Clock to 7 working days before, skipping closed days | Met (W6b uses the armed job's own `runAt`, 10 Dec 2026 09:00 Toronto for a Sun 20 Dec due date) |
| 2. Run the job through its test entry | Met. The in-process `CaseDeadlines` runs on fakeJobs and FakeClock, as in the check, and now writes to PF-18n's real `PrismaNotificationPort`. |
| 2. Officer signs in, opens the reminder surface by screens, finds it only by `data-needs-you-item` | Met (`j_74.ts:196-207`: the hook value is the officer's own row id, never a class or position) |
| 2. One item naming the case, the step and the due date | **Accepted deviation, see design point 2.** The item names the case. The step and due date are checked on the case page it opens (`j_74.ts:211-214`). |
| 2. Follow it to the case page | Met (keyboard Enter; header equals the case number; the row is marked read) |
| 2. Cancel, advance to 2 working days before, run again: no new item for the cancelled step | Met (W7b `:227-232`: the cancelled step's notification count stays at 2, it has no `data-needs-you-item` and no unread row) |
| 2. A pass and a fail for each new step (J-77 pattern) | Met for W6b and W7b. Partly for W6c (m1 below). |
| 3. One card line | Met (`MODULE.rows/CS-DL3.md:3`) |
| Done when: J-74 twice, both checks, module cards | Met. The full `ci` is not run here. |

## The four design points
1. **The real store in J-74: accepted.** `scoped.handle` wraps each handler in `withFirm(job.firmId, …)`, which is the same as `platform-jobs.ts:68`. The one difference is that a firm-less job is not wrapped in `asJob`. This walk never runs one, because it calls the sweep directly and registers with `sweep:false`. The store gets `PrismaNotificationPrefs(tx)`, as `features/platform-notifications.ts:16` does, so the In-app switch and the active-staff rule are real. Rows are checked underneath: 2 unread rows for m1, one per person. The stand-in is the FakeClock time on the rows, so Home shows "Reminder came in 10 Dec 2026". That is acceptable, but the header must say it (m2).
2. **Brief vs PF-18h Q1: accepted.** PF-18h's concept Q1 (`screens/pf-18h-home/concept.md:57`, decided by the tech lead) shows the case number only, and "Due date not shown in either". The brief's own "Parallel safety" clause says "walk what is on `main`". W6c reads the item's visible case number through the hook, then the step name and due date on the line it opens. It never invents item text. The builder must record the deviation in the PR body under "never deviate silently" (m3). The usability limit, that two steps on one case read the same on Home, belongs to PF-18h and is not a finding here.
3. **W7's 3→2: correct.** The 7-day job ran in W6b and is no longer waiting. `cancelled === 2 && waiting === 0` (`:225`) still fails if the cancel consumer is removed, and W7b fails if the handler's cancelled-step check is also removed: `toldStep(m1)` would be 4.
4. **The sentence's accuracy: accurate.** Recipients are the case's current OFFICER and LEAD_REPRESENTATIVE (`reminders.ts:36, 200-205`), matched to the firm's staff. The store asks the In-app switch of MY_DEADLINES first (`store.ts:31`), and that group's default is on for everyone. Home's Needs you lists unread MY_DEADLINES rows (`store.ts:79`). "When in-app reminders are on" is PF-18h's own wording (`home/contract.ts:38`). One edge case is m1 below: a closed case.

## D1–D20 (scope: one sentence and one journey)
D1 4 every brief item present, W6c deviation accepted · D2 4 one row per person and item, a repeat does not duplicate, the cancelled step stays silent · D3 4 real store and runner wrapping reused, no copy · D4 N/A · D5 4 reload and Back on Home hold, the opened item is read · D6 4 the case and number shown, the step line with its due date · D7 N/A no AI · D8 4 Home → item → case, the section near the top of the case · D9 5 one sentence · D10 4 plain, one closed-case over-promise (m1) · D11 4 the count line, the empty hint, read-on-open · D12 4 team look unchanged · D13 4 axe 0 on Needs you and Government steps, keyboard, 200 % · D14 4 the words match PF-18h's · D15 5 Home ≤335 ms · D16 4 a pass and a fail per step, two runs, sentence removal fails DW8 · D17 simulated only · D18 4 the reminder points to the case, Sample marked · D19 4 closes R1.74's "seen on screen" · D20 simulated only.

## BIC-01–BIC-20 (evidence: `screenshots/csdl3-1-recorded.png` at 1280, `-2-cancelled-and-again-1440.png` and `-1024.png`, `-3-read-only.png`, plus the walk above)
| BIC | Score | Evidence |
|---|---|---|
| 01–10, 12, 13, 15–17 | N/A | No input, facts, AI, roles, tasks or filing in this change |
| 11 | Met | No new button. Home's link is named for the case, and "Hide until next reminder" is secondary. |
| 14 | Met | No new chip or icon |
| 18 | Partly (Should, m1) | The sentence says where reminders show. On a closed case it still says "are reminded" next to "The case is closed" (`milestones.tsx:96-97`). |
| 19 | Met | One added line in the existing foot, same size and muted tone |
| 20 | Met | Keyboard Home→case, 200 % and 400 px with no sideways scroll, a 20-word sentence |

## [M] lines in scope
Met:
* Words per PRODUCT §4: Home and Needs you, as PF-18h uses them.
* Status in text.
* Sample labelled.
* No ids on the main path.
* Server authorisation unchanged: the list is own-only, and signed out is 401.
* A test fails when its rule is removed: DW8 and W7b.
* Module card row.
* Times from the clock port in the test.

Not applicable: migrations, routes, concurrency writes, AI, uploads.

## Issues, ranked (no Blocker, no Major)
* **m1 Should, closed case.** `milestones.tsx:96` shows "…are reminded on their Home…" without a condition, but a closed case's step reminders are cancelled (`reminders.ts` `onCaseClosed`). On a closed case the foot reads both "are reminded" and "The case is closed". Fix: show the sentence only when `v.caseOpen`, or add "while the case is open".
* **m2 Should, stale stand-in header.** `j_74.ts:30-32` still says the walk uses "fakeNotifications (PF-18n's real adapter is not on main; the app arms nothing until it is bound…)". W5–W7 now use the real store, and PF-18n is on main. Fix: say W1–W4 use fakeNotifications and W5–W7 use `PrismaNotificationPort` with FakeClock times, so Home shows a future "Reminder came in".
* **m3 Should, W6c's fail and the deviation.** The header (`j_74.ts:25`) claims "W6c … (NR: before the reminder, no item)", but no on-screen check exists. The only before-check is W6b's store count (`:190`). Fix: open Home before `walk2(runAt(m1, 7))` and assert no item, or reword the header. Also state the item-text deviation (design point 2) in the PR body.
* **Minor:** in the 1024 px screenshot (`csdl3-2-cancelled-and-again-1024.png`), stacked toasts cover the end of the new sentence. This is screenshot timing, as in part 2, and not a layout bug.

## What I could not check
A real screen reader. An intended user's unaided walk (D17/D20 stay with the founder). The full `ci` run. The PR body lines ("Completes: R1.74", "Fixes: QA-471 (part: seen on screen)", "Duplicate check:"), because there is no PR yet. A reminder delivered by the running app's own pg-boss runner on real time: J-74 runs the handler in-process by design.

**Verdict: Approve 539fe821eee26c9296b99902315344897e9a7126**. There is no open Blocker or Major. m1–m3 should be fixed or listed in the PR.

## Re-review, diff only: 539fe821e → 16d9d24de (P-277)
I read only `git diff 539fe821e 16d9d24de -- …/prototype/studio`, which touches `milestones.tsx` and `j_74.ts`. Commit 16d9d24de also adds my two review files. I ran on a fresh copy, rv3_csdl3 on :4663, and stopped it afterwards. Results: J-74 **25/25**, exit 0, and `tsc -p web` clean. No screenshot was rewritten.
| Finding | Now |
|---|---|
| m1 | **Fixed.** `milestones.tsx:96` renders the sentence only when `v.caseOpen`. I checked it in the browser as the representative on J-74's step case. While open, the foot has `data-gov-reminded` and no `data-gov-closed`. After a withdraw (200), the foot has no `data-gov-reminded`, has `data-gov-closed`, and reads "The case is closed: reopen it to record a step." No test pins the closed-case condition (DW8 checks only the open case). That is Minor, not blocking. |
| m2 | **Fixed.** `j_74.ts:30-33` says W1–W4 tell fakeNotifications and W5–W7b tell PF-18n's `PrismaNotificationPort`. It says Home's "Reminder came in" therefore shows the walk's clock time, ahead of today, and that the running app's own runner on real time is not walked. |
| m3 | **Fixed.** The officer's tab and the `home`/`item` helpers now open before the 7-day walk. W6b NR (`j_74.ts:197-203`) also checks that, an hour before the reminder, the officer's Home has no `data-needs-you-item` carrying this case's number. My run gave `{"before7":0,"rowsBefore":"0","onHomeBefore":0}`, and W6b and W6c pass after it. The header's NR claim now matches the code. |
Nothing else changed in the studio. W6b, W6c, W7 and W7b keep their judges, and only their order moved.

**Verdict: Approve 16d9d24de8ce05f0650d9d28a0246323f90f2690**
