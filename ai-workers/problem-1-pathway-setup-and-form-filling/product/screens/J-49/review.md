# J-49 review (reviewer, independent; PR #2731, head 849e2db98)

The reviewer did not build this. J-49 is a join-and-walk evidence row, not a screen, so the screen-review skill is adapted: the concept is the BACKLOG row (`| J-49 |`, Done when: DW lines fail on the fake, W lines pass in a visible browser and as a scripted check, and the walk ends at the next capability's first step) plus R1.49's acceptance in `qa/CAPABILITIES.md`. D1-D20 and the BIC-01..20 table are N/A: no screen and no product code changed. Journey score: `journey-test-reviewer-2026-11-21.md`, **8/10 (pass)**.

## What was run (isolated copies j49r on :4593, never :4400)
* Fresh copy: `j_49.ts` 29/29, exit 0. Kept copy, two runs back to back: 29/29 and 29/29 (17 s and 18 s). A third fresh copy: 29/29, then a break pass.
* Break pass (scratch script, not committed): a forged token gives 404 on GET and POST, and a junk token gives 404. At 400 px the unsubscribe page has no sideways scroll. Two GETs record nothing. Keyboard only: Tab focuses "Unsubscribe" and Enter gives "You are unsubscribed". Reloading after that gives the public "This page is not available." page.
* Screenshots read: W2 B's lead page and W4 A's lead page.
* The tree was restored after every run, because the script writes its screenshots into the tracked folder.

## (1) Does each check prove its label?
* **W1** (j_49.ts:127-133). The consent rows come from the copy's own booking door (browser). B having no row also shows the box is unticked by default. Sound; m4 covers the label.
* **W2 and DW1** (149-157). The suppression is real: the state is SUPPRESSED at send, with reason `NO_CONSENT: MARKETING`, and nothing new is in B's inbox. The NR line, run on `fakeConsent`, reads A as SUPPRESSED; the run's evidence shows the reason is `NO_CONSENT: MARKETING`, which is the right reason. However, the judge does not check that reason (m1).
* **W3** (172-187). The link is minted by the running copy's demo inbox (demo-inbox.ts:47), and the door is the copy's own controller (public-routes.ts:39-45). The POST is body-independent, so the 404 for a second click really comes from the spent token (unsubscribe.ts:91), not from a missing body. Sound.
* **W4 and DW2** (191-213):
  * "Next marketing SUPPRESSED WITHDRAWN" goes through `Messages.send` with the real `ConsentStore`.
  * "Queued, then re-checked" goes through the worker's `dispatch` (messages.ts:214-215).
  * The DW2 pass calls `ConsentStore.allows` directly, not the gate (m5). The gate path itself is already proven by line 193.
  * The DW2 NR is a hand-built fake that holds A's tick. It is judged on the port's answer, which lines 198-199 justify (a fake consent id would break msg_outbox's foreign key). It fails for the right reason: the fake never sees the door's write.
* The "no vacuous pass" check holds for every line except the weak judges in m1 and m3.

## (2) Honest limit: acceptable for this row
No running path sends MARKETING. `grep class: "MARKETING"` over api/src finds no sender, and `purposeNeeded` gates only MARKETING and WhatsApp (ports/consent.ts:179-183). The in-process `Messages` is built with the same `ConsentStore` class that the app wires (features/platform-messages.ts:34), on the copy's own database and file folder. So this is the honest way to show the gate today, and the PR states it. It also means R1.49's "on every path" cannot be Proven by gate A from this row. The PR correctly does not say `Completes: R1.49`, and it leaves QA-495 and QA-518 to their own rows. This is not a P-33 Major, because no screen for sending marketing exists to bypass (campaigns are Not built).

## (3) Repeatability and timing
* The run passes on a kept copy twice. The `run` stamp makes the addresses unique, and the consultation type is created only once (line 68).
* Hard waits: 3.5 s for the form's minimum fill time, and 0.8 s per month step.
* The held QUEUED row (172) waits seconds against the copy's 2-minute sweep (messages.ts:42). If the copy's sweep ever took the row, it would only do so after the click, so the result would be the same. I saw no flake in 4 runs.

## (4) Scope
One row only. The diff is j_49.ts (219 lines), qa/built/J-49.md and 6 screenshots. No product code, migration or contract changed.

## (5) PR body against the test
* Each claim matches a check: "29/29", the swaps, the 404 on the second click, axe, 1024 and 1440 px, and "the Owner" (user-R is the Owner).
* "A second click … gets 404" is shown with a scripted POST, not a browser click; that is trivial.
* No overclaim was found.

## Findings
**Blockers:** none. **Majors:** none.

**Minors:**
* **m1** (j_49.ts:157). The DW1 NR judge would also pass if A were suppressed for some other reason, such as an address suppression or the cap. Fix: add `nr1.a.row.reason === "NO_CONSENT: MARKETING"`.
* **m2** (j_49.ts:156). The DW1 NR writes two extra SUPPRESSED rows into the copy's database, and both lead pages show them:
  * A, who ticked the box, shows "Not sent: no consent to marketing on this channel" (W4-lead-A-after-unsubscribe-1440.png).
  * B shows two Not sent rows (W2-lead-B-not-sent-1440.png).
  * A person reading the evidence would be misled. Fix: use a separate Sample pair for the NR, or say so in J-49.md.
* **m3** (j_49.ts:213). The label says the service email and the first marketing email show "as sent", but the judge is `!== "Not sent"`, so "Queued" or "Failed" would pass. Fix: `=== "Sent"`.
* **m4** (j_49.ts:127). The label claims "the firm's own wording, unticked by default", but the check only counts one checkbox. Fix: assert `isChecked() === false` before ticking, or trim the label.
* **m5** (j_49.ts:197). The DW2 pass label says "the gate", but it calls `ConsentStore.allows` directly. Fix: reword it to "the gate's consent store", or point to line 193 as the gate path.
* **m6, process** (PR body, no commit needed):
  * pr-rules is red at this head: `MISSING: no "Done when"` (Actions job 136744580340).
  * The walks job was skipped because the PR is a draft, so the visible-browser leg of Done-when has no recording yet. It must be green on `walks` once the PR is ready. This container lacks Playwright's ffmpeg, so `walk.mjs` cannot run here.

## Could not check
* A headed, visible-browser walk, and `walk.mjs` with video (the ffmpeg environment gap).
* A real screen reader.
* An intended user's unaided walk (D17 and D20 stay with the founder).
* A real SES send: the List-Unsubscribe headers are the demo inbox's rendition (demo-inbox.ts:47).

Verdict: Approve (m6 is a PR-body and CI step: add Done when and let `walks` run green once the PR is ready; m1-m5 can go in this PR or the next J row)

## Re-review (diff 849e2db98..18f8f4784)
I read the j_49.ts diff only. I did not re-run the walk, because the diff gave no reason to. I read the new W4 screenshot.
* **m1, m2: closed.** DW1's stand-in is now judged on `fakeConsent.allows` answers (j_49.ts:158-162).
  * It writes no outbox rows, and the W4 screenshot no longer shows a "no consent" row for A.
  * The NR now needs reason `NO_CONSENT`, so it fails for the right reason.
  * The paired "DW1 pass (the gate's answers)" line runs the same judge on the real `ConsentStore`, which uses the same `decide()` (consent-store.ts:143).
  * The send-level DW1 pass stays as it was.
* **m3: closed.** W4 now checks `=== "Sent"` for the service email and the first marketing email (:218).
* **m4: closed.** W1 now checks one box, unticked, beside `SAMPLE_BOOKING_WORDING` (firm-seed.ts:138, the wording the seed publishes), and the label is honest about it being Sample wording (:114, :127).
* **m5: closed.** The DW2 label now says "the gate's consent read (ConsentStore.allows, which MessagePort.send and its worker call)" (:202).
* **m6: still open, PR side only.**
  * The PR body now has "Done when", but the pr-rules run already finished at 18f8f4784 is `failure`. A second run is in progress, so this needs a recheck.
  * `walks` is still skipped because the PR is a draft, so the visible-browser recording waits for ready-for-review.
  * This is not a code finding.
* No new findings. The scope is still one row, with no product code changed.

Verdict: Approve
