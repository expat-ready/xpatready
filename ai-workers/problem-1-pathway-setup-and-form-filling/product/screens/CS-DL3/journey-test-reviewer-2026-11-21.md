# Journey test (reviewer): CS-DL3 part 3, a government step's reminder reaches the officer (R1.74)

Reviewer: a fresh Opus 5.5, 21 Nov 2026. Commit 539fe821eee26c9296b99902315344897e9a7126. Copy rv3_csdl3 on :4663 (AI_LIVE=off, PLATFORM_IDENTITY=local, PLATFORM_SAMPLE_SEED=on), stopped afterwards. US$0. The review is in `review-part3.md`.

## Journeys (written from the brief before the walk)
1. **Main path. Case officer: "Tell me when a government step on my case is coming due, and take me to it."** The representative records a biometrics letter, due Sun 20 Dec 2026. At 7 working days before (Thu 10 Dec, 09:00 Toronto) the officer opens Home. Needs you shows "A government step on case C-…". Opening it lands on the case, where the step and its due date are shown.
2. **Alternate. The representative** gets the same reminder on their own Home.
3. **Cancelled.** The step is cancelled with a reason and recorded again. At 2 working days before, the cancelled step reminds nobody and is absent from Needs you. The new step does remind.
4. **Empty and before.** An hour before the 7-day reminder there is no row, so Home lists none.
5. **Recovery.** Back to Home after opening: the opened item is gone, read. A second run on the same copy also passes.
6. **Wrong person.** Signed out, the list answers 401. Each person's list is their own.
7. **Across the boundary.** Home (PF-18h) → case page (CS-DL3 Government steps), whose foot sentence says who is reminded and where.

## How walked
* J-74 ran twice on one copy: 25/25 then 24/24, exit 0. It drives Chromium by keyboard, with axe on Government steps and on Needs you.
* My own Playwright script (scratchpad) used only what a person sees, as `user-O`:
  * Home at 1440, 1024 and 400 px and at 200 %.
  * Tab from the top of Home to the first item, Enter, then read the case page.
  * Back to Home.
* No visible-browser pane exists in this container, so the walk ran headless with screenshots I read.

## What held
* Home draws its first item in 277–335 ms at every width. There is no sideways scroll at 400, 1024, 1440 or 200 %, and no console or page error.
* Keyboard: 9 Tabs to "A government step on case C-2026-00003", then Enter lands on `/cases/<id>`. The header matches, and Government steps sits in the first screen, showing "Biometrics instruction letter … Due Sat 19 Dec 2026 (weekend)" and the cancelled line with its reason. axe 0.
* Underneath:
  * exactly 2 `msg_notification` rows for the step (representative and officer), kind `case-milestone-deadline`, unread until opened;
  * opening sets `read_at`;
  * after the cancel, the step's waiting jobs are cancelled (2) and no 2-day notification is written for it;
  * the new step's 7-day and 2-day reminders arrive (4 told).
* The foot reads "The case officer and the lead representative are reminded on their Home, under Needs you, when in-app reminders are on." This matches `reminders.ts` (OFFICER, LEAD_REPRESENTATIVE) and the store's In-app switch on MY_DEADLINES.

## Findings (none Blocker, none Major)
* **Minor: the closed-case sentence** (`milestones.tsx:96`). It says "are reminded" even on a closed case, whose reminders are cancelled.
* **Minor: the item does not name the step or due date** (PF-18h Q1, by design there). When a case has two steps (one cancelled, one open), the officer must find the right line on the case. Not this PR's to change.
* **Minor: the test header is stale** (`j_74.ts:25, 30-32`): it claims an on-screen "before" NR that the code checks only in the store, and still says PF-18n is not on main.
* Test artefact, not a product issue: "Reminder came in 17 Dec 2026, 09:01" shows a future date because the walk's FakeClock writes the row while the server uses the real day.

## Break-it pass (short, scope is one sentence and one journey)
* Re-run on a used copy: still passes (the hooks are by row id, not position).
* Back after opening: the item stays read.
* Signed out: 401.
* Another person's rows: each list is own-only (PF-18n, already on main).
* No new input, so long or non-English text does not apply.

## Score
| Criterion | Score | Evidence |
|---|---|---|
| Task completed | 1 | The reminder reaches the officer, and Home → case works by keyboard (W6c, my walk) |
| Next step obvious | ½ | The item is a link to the case. It names neither the step nor the due date, so with two steps the officer must pick on the case page. |
| Plain words | 1 | "A government step on case C-…", "Reminder came in …", one 20-word foot sentence |
| Feedback and state | 1 | The count line, the read item gone on return, the cancelled line struck through with its reason |
| Correct data | 1 | Rows once per person, read on open, none for the cancelled step (W6b, W7b, SQL) |
| Error recovery | ½ | Back and re-run hold. The closed-case sentence over-promises (m1). This part adds no new error path. |
| Accessibility and screen sizes | 1 | axe 0 on both sections, keyboard path, 400/1024/1440/200 % without sideways scroll |
| Speed | 1 | Home ≤335 ms. The case page is in view in under 1 s after Enter. |
| Visual quality | 1 | Team look. The sentence sits in the existing muted foot (`csdl3-1-recorded.png`). |
| Trust and sources | 1 | Sample step names marked. The due date is said to come from IRCC's letter. The reminder links to its case. No AI. |

**9/10, pass** (8 or more, no 0). To raise "next step obvious", PF-18h would have to show the step or due date on the item, which is outside this part. To raise "error recovery", condition the sentence on an open case (m1).

## Could not test
A real screen reader. An intended user's unaided walk (D17/D20, the founder). A reminder delivered by the running app's own pg-boss runner on real time (J-74 runs the handler in-process by design). The full `ci`.
